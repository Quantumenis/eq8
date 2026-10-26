// Les gestes de dessin de PolyDraw et de l'applique sur le Canvas du plan Bloc (SPEC §6.3, §6.4) : tracés par clics
// (PolyLigne, PolyArc, Ligne, Bézier), tracés au glissé (main levée, pinceau, bande, ellipse, rectangle, formes),
// sélection (clic, rectangle, déplacement) et édition des nœuds. Le contrôleur garde l'état transitoire (tracé en
// cours, glissé) hors de l'historique ; seul le geste terminé passe par `execute`.

import {
  addNodeAt,
  deleteNode,
  makeShape,
  moveHandle,
  moveNode,
  nearestOnShape,
  normalizeShape,
  selectionBox,
  shapeAt,
  shapeSegments,
  shapesInRect,
  translateShapes,
  type AppNode,
  type AppShape,
  type NodeRef,
  CLOSE_TOLERANCE,
} from "../core/draw/applique";
import {
  brushStroke,
  ellipseShapes,
  formShape,
  freehandShape,
  rectShape,
  swathShapes,
  type BrushParams,
  type EllipseParams,
  type FormId,
  type SwathParams,
} from "../core/draw/appliqueShapes";
import { snapSettingsOf, type BlockDraft } from "../core/draw/draft";
import { arcGeometry, arcPointAt, dist, type Pt, type Rect, type Segment } from "../core/draw/geometry";
import {
  addPolyNode,
  addPolyPiece,
  deletePolyNode,
  gridPoints,
  movePolyNode,
  movePolyPieces,
  nearestGridPoint,
  polyLoop,
  polyNodes,
  polyPieceAt,
  type PolyPiece,
} from "../core/draw/polydraw";
import { snapPoint, type SnapResult } from "../core/draw/snap";
import type { View } from "../core/draw/view";
import { fr } from "./i18n/fr";
import type { PendingPath, PendingPoly } from "./shapeDraw";

export const POLY_TOOLS = ["ppick", "pedit", "polyline", "polyarc"] as const;
export const APPLIQUE_TOOLS = ["apick", "aedit", "dline", "dbezier", "dfree", "dbrush", "dswath", "ellipse", "rect", "form"] as const;
export type PolyTool = (typeof POLY_TOOLS)[number];
export type AppliqueTool = (typeof APPLIQUE_TOOLS)[number];
export type ShapeTool = PolyTool | AppliqueTool;

export const isShapeTool = (t: string): t is ShapeTool => (POLY_TOOLS as readonly string[]).includes(t) || (APPLIQUE_TOOLS as readonly string[]).includes(t);
export const isPolyTool = (t: string): t is PolyTool => (POLY_TOOLS as readonly string[]).includes(t);

/** Les réglages des outils de l'applique (palette DESSIN). */
export interface ShapeOptions {
  ellipse: EllipseParams;
  /** Rectangle : rondeur des coins en pouces (0 = rectangle). */
  radius: number;
  form: FormId;
  brush: BrushParams;
  swath: SwathParams;
  /** Main levée : 0 = « Better Fit », 1 = « Looser Fit ». */
  looseness: number;
}

export interface GestureHost {
  draft(): BlockDraft;
  view(): View;
  /** Pouces pour `px` pixels écran. */
  tol(px: number): number;
  execute(label: string, change: (d: BlockDraft) => BlockDraft): boolean;
  selection(): ReadonlySet<string>;
  select(ids: readonly string[]): void;
  pickedNodes(): readonly NodeRef[];
  pickNodes(nodes: readonly NodeRef[]): void;
  /** Un nouvel élément a été dessiné (pour le sélectionner). */
  options(): ShapeOptions;
  notify(message: string): void;
  refresh(): void;
}

type Drag =
  | { kind: "move"; ids: string[]; ref: Pt; down: Pt; dx: number; dy: number }
  | { kind: "pmove"; ids: string[]; ref: Pt; down: Pt; dx: number; dy: number }
  | { kind: "marquee"; a: Pt; b: Pt; additive: boolean; poly: boolean }
  | { kind: "node"; shape: string; index: number; to: Pt }
  | { kind: "handle"; shape: string; index: number; which: "in" | "out"; to: Pt }
  | { kind: "pnode"; piece: string; index: number; to: Pt }
  | { kind: "stroke"; tool: "dfree" | "dbrush" | "dswath"; points: Pt[] }
  | { kind: "rect"; tool: "ellipse" | "rect" | "form"; a: Pt; b: Pt; ctrl: boolean }
  | { kind: "pen"; index: number };

const PICK_PX = 8;
const NODE_PX = 10;
const SNAP_PX = 10;

export class ShapeController {
  private pending: AppNode[] | null = null;
  private pendingCursor: Pt | null = null;
  private polyNodesPending: Pt[] | null = null;
  private polyCursor: Pt | null = null;
  private drag: Drag | null = null;
  /** Aperçu de la marque d'accrochage. */
  hover: SnapResult | null = null;
  /** La forme dont on édite les nœuds (outil Édition). */
  editShape: string | null = null;

  constructor(private readonly host: GestureHost) {}

  // ---- Lecture pour le dessin --------------------------------------------------------------------------------------

  get active(): boolean {
    return this.drag !== null || this.pending !== null || this.polyNodesPending !== null;
  }

  get pendingPath(): PendingPath | null {
    if (!this.pending) return null;
    const first = this.pending[0];
    const closing = !!first && !!this.pendingCursor && this.pending.length >= 3 && dist(first, this.pendingCursor) <= this.host.tol(NODE_PX);
    return { nodes: this.pending, cursor: this.pendingCursor, closing };
  }

  pendingPolyState(): PendingPoly | null {
    if (!this.polyNodesPending) return null;
    const first = this.polyNodesPending[0];
    const closing = !!first && !!this.polyCursor && this.polyNodesPending.length >= 3 && dist(first, this.polyCursor) <= 1e-9;
    return { nodes: this.polyNodesPending, cursor: this.polyCursor, arcs: this.polyArcs, closing };
  }

  private polyArcs = false;

  get marquee(): Rect | null {
    const d = this.drag;
    if (d?.kind !== "marquee") return null;
    return { x0: Math.min(d.a.x, d.b.x), y0: Math.min(d.a.y, d.b.y), x1: Math.max(d.a.x, d.b.x), y1: Math.max(d.a.y, d.b.y) };
  }

  /** Les formes en cours de création (aperçu du glissé). */
  previewShapes(): AppShape[] {
    const d = this.drag;
    const o = this.host.options();
    const draft = this.host.draft();
    if (d?.kind === "rect") {
      const b = this.constrain(d);
      if (d.tool === "ellipse") return ellipseShapes(d.a.x, d.a.y, b.x, b.y, o.ellipse);
      if (d.tool === "rect") {
        const r = rectShape(d.a.x, d.a.y, b.x, b.y, [o.radius, o.radius, o.radius, o.radius]);
        return r ? [r] : [];
      }
      const f = formShape(o.form, d.a.x, d.a.y, b.x, b.y, d.ctrl);
      return f ? [f] : [];
    }
    void draft;
    return [];
  }

  /** Le tracé du glissé libre (main levée, pinceau, bande), en segments d'aperçu. */
  previewSegments(): Segment[] {
    const d = this.drag;
    if (d?.kind !== "stroke") return [];
    const out: Segment[] = [];
    for (let i = 0; i + 1 < d.points.length; i++) out.push({ id: `p${i}`, kind: "line", a: d.points[i] as Pt, b: d.points[i + 1] as Pt });
    return out;
  }

  /** Le brouillon tel qu'il apparaît pendant un déplacement ou une édition de nœud. */
  shown(draft: BlockDraft): BlockDraft {
    const d = this.drag;
    if (!d) return draft;
    if (d.kind === "move") return { ...draft, shapes: translateShapes(draft.shapes, new Set(d.ids), d.dx, d.dy) };
    if (d.kind === "pmove") return { ...draft, poly: movePolyPieces(draft.poly, new Set(d.ids), d.dx, d.dy) };
    if (d.kind === "node") {
      const i = draft.shapes.findIndex((s) => s.id === d.shape);
      const s = draft.shapes[i];
      if (!s) return draft;
      const shapes = draft.shapes.slice();
      shapes[i] = moveNode(s, d.index, d.to);
      return { ...draft, shapes };
    }
    if (d.kind === "handle") {
      const i = draft.shapes.findIndex((s) => s.id === d.shape);
      const s = draft.shapes[i];
      if (!s) return draft;
      const shapes = draft.shapes.slice();
      shapes[i] = moveHandle(s, d.index, d.which, d.to);
      return { ...draft, shapes };
    }
    if (d.kind === "pnode") return { ...draft, poly: movePolyNode(draft.poly, d.piece, d.index, d.to, draft.width, draft.height) };
    return draft;
  }

  /** Ctrl pendant le tracé d'une forme : le rectangle devient un carré. */
  private constrain(d: Extract<Drag, { kind: "rect" }>): Pt {
    if (!d.ctrl || d.tool === "form") return d.b;
    const w = d.b.x - d.a.x;
    const h = d.b.y - d.a.y;
    const side = Math.max(Math.abs(w), Math.abs(h));
    return { x: d.a.x + Math.sign(w || 1) * side, y: d.a.y + Math.sign(h || 1) * side };
  }

  // ---- Accrochage --------------------------------------------------------------------------------------------------

  private nodeSegments(draft: BlockDraft, exclude?: { shape: string; index: number }): Segment[] {
    const out: Segment[] = [];
    for (const s of draft.shapes) {
      s.nodes.forEach((n, i) => {
        if (exclude && exclude.shape === s.id && exclude.index === i) return;
        out.push({ id: `${s.id}.${i}`, kind: "line", a: { x: n.x, y: n.y }, b: { x: n.x, y: n.y } });
      });
    }
    return out;
  }

  private snapShape(raw: Pt, exclude?: { shape: string; index: number }): SnapResult {
    const d = this.host.draft();
    const tol = this.host.tol(SNAP_PX);
    const nodes = [...this.nodeSegments(d, exclude), ...d.guides];
    const settings = { ...snapSettingsOf(d), toLines: d.appSnap.align };
    const lines: Segment[] = d.appSnap.align ? d.shapes.flatMap((s) => (s.id === exclude?.shape ? [] : shapeSegments(s))) : [];
    return snapPoint(raw, settings, nodes, tol, lines);
  }

  private snapPoly(raw: Pt): SnapResult {
    const d = this.host.draft();
    const near = nearestGridPoint(d.poly.grid, d.width, d.height, raw);
    return { point: near.point, kind: "grid" };
  }

  // ---- Souris ------------------------------------------------------------------------------------------------------

  /** Retourne vrai si le geste continue (le canvas capture alors le pointeur). */
  down(tool: ShapeTool, raw: Pt, e: { shift: boolean; ctrl: boolean; detail: number }): boolean {
    const d = this.host.draft();
    switch (tool) {
      case "polyline":
      case "polyarc":
        return this.polyClick(tool === "polyarc", raw, e);
      case "ppick":
        return this.pPickDown(raw, e);
      case "pedit":
        return this.pEditDown(raw, e);
      case "apick":
        return this.aPickDown(raw, e);
      case "aedit":
        return this.aEditDown(raw, e);
      case "dline":
      case "dbezier":
        return this.penDown(tool === "dbezier", raw, e);
      case "dfree":
      case "dbrush":
      case "dswath":
        this.drag = { kind: "stroke", tool, points: [raw] };
        return true;
      case "ellipse":
      case "rect":
      case "form": {
        const p = this.snapShape(raw).point;
        void d;
        this.drag = { kind: "rect", tool, a: p, b: p, ctrl: e.ctrl };
        return true;
      }
    }
  }

  move(tool: ShapeTool, raw: Pt, e: { shift: boolean; ctrl: boolean }): void {
    const g = this.drag;
    const draft = this.host.draft();
    if (!g) {
      if (tool === "polyline" || tool === "polyarc") {
        const s = this.snapPoly(raw);
        this.polyCursor = s.point;
        this.hover = s;
      } else if (tool === "dline" || tool === "dbezier") {
        const s = this.snapShape(raw);
        this.pendingCursor = s.point;
        this.hover = s;
      } else if (tool === "ellipse" || tool === "rect" || tool === "form") this.hover = this.snapShape(raw);
      else if (tool === "pedit") this.hover = this.snapPoly(raw);
      else this.hover = null;
      return;
    }
    switch (g.kind) {
      case "stroke": {
        const last = g.points[g.points.length - 1] as Pt;
        if (dist(last, raw) >= 0.02) g.points.push(raw);
        break;
      }
      case "rect":
        g.b = this.snapShape(raw).point;
        g.ctrl = e.ctrl;
        break;
      case "marquee":
        g.b = raw;
        break;
      case "move": {
        const base = { x: g.ref.x + (raw.x - g.down.x), y: g.ref.y + (raw.y - g.down.y) };
        const target = draft.appSnap.wholePiece || draft.snap.grid ? this.snapShape(base).point : base;
        const chosen = draft.shapes.filter((s) => g.ids.includes(s.id));
        const box = selectionBox(chosen, new Set(g.ids));
        let dx = target.x - g.ref.x;
        let dy = target.y - g.ref.y;
        if (box) {
          dx = Math.min(draft.width - box.x1, Math.max(-box.x0, dx));
          dy = Math.min(draft.height - box.y1, Math.max(-box.y0, dy));
        }
        g.dx = dx;
        g.dy = dy;
        this.hover = { point: { x: g.ref.x + dx, y: g.ref.y + dy }, kind: "grid" };
        break;
      }
      case "pmove": {
        const base = { x: g.ref.x + (raw.x - g.down.x), y: g.ref.y + (raw.y - g.down.y) };
        const target = this.snapPoly(base).point;
        g.dx = target.x - g.ref.x;
        g.dy = target.y - g.ref.y;
        this.hover = { point: target, kind: "grid" };
        break;
      }
      case "node": {
        const s = this.snapShape(raw, { shape: g.shape, index: g.index });
        g.to = this.clampInside(draft, s.point);
        this.hover = s;
        break;
      }
      case "handle":
        g.to = raw;
        break;
      case "pnode": {
        const s = this.snapPoly(raw);
        g.to = s.point;
        this.hover = s;
        break;
      }
      case "pen": {
        // Glisser après avoir posé un nœud : tire les poignées (courbe en S, nœud lisse).
        const nodes = this.pending;
        const node = nodes?.[g.index];
        if (nodes && node) {
          const v = { x: raw.x - node.x, y: raw.y - node.y };
          if (e.ctrl || dist(raw, node) < this.host.tol(3)) {
            const plain: AppNode = { x: node.x, y: node.y, type: "corner" };
            nodes[g.index] = plain;
          } else nodes[g.index] = { x: node.x, y: node.y, type: "smooth", hin: { x: -v.x, y: -v.y }, hout: v };
        }
        break;
      }
    }
    void tool;
  }

  up(tool: ShapeTool, raw: Pt, e: { shift: boolean; ctrl: boolean }): void {
    const g = this.drag;
    this.drag = null;
    if (!g) return;
    const draft = this.host.draft();
    const o = this.host.options();
    switch (g.kind) {
      case "stroke": {
        const pts = g.points;
        if (pts.length < 3) break;
        let made: AppShape[] = [];
        if (g.tool === "dfree") {
          const s = freehandShape(pts, o.looseness, this.host.tol(12));
          if (s) made = [draft.appSnap.autoJoin ? normalizeShape(s) : s];
        } else if (g.tool === "dbrush") {
          const s = brushStroke(pts, o.brush);
          if (s) made = [s];
        } else made = swathShapes(pts, o.swath);
        this.addShapes(made, g.tool === "dswath" ? fr.shape.history.swath : g.tool === "dbrush" ? fr.shape.history.brush : fr.shape.history.free);
        break;
      }
      case "rect": {
        const b = this.constrain(g);
        let made: AppShape[] = [];
        if (g.tool === "ellipse") made = ellipseShapes(g.a.x, g.a.y, b.x, b.y, o.ellipse);
        else if (g.tool === "rect") {
          const r = rectShape(g.a.x, g.a.y, b.x, b.y, [o.radius, o.radius, o.radius, o.radius]);
          if (r) made = [r];
        } else {
          const f = formShape(o.form, g.a.x, g.a.y, b.x, b.y, g.ctrl);
          if (f) made = [f];
        }
        this.addShapes(made, fr.shape.history.shape);
        break;
      }
      case "marquee": {
        const r = { x0: Math.min(g.a.x, g.b.x), y0: Math.min(g.a.y, g.b.y), x1: Math.max(g.a.x, g.b.x), y1: Math.max(g.a.y, g.b.y) };
        if (r.x1 - r.x0 < 0.02 && r.y1 - r.y0 < 0.02) {
          if (!g.additive) this.host.select([]);
          break;
        }
        const ids = g.poly ? this.polyInRect(draft, r) : shapesInRect(draft.shapes, r);
        this.host.select(g.additive ? [...new Set([...this.host.selection(), ...ids])] : ids);
        break;
      }
      case "move":
        if (Math.abs(g.dx) > 1e-9 || Math.abs(g.dy) > 1e-9) this.host.execute(fr.shape.history.move, (dr) => ({ ...dr, shapes: translateShapes(dr.shapes, new Set(g.ids), g.dx, g.dy) }));
        break;
      case "pmove":
        if (Math.abs(g.dx) > 1e-9 || Math.abs(g.dy) > 1e-9) this.host.execute(fr.shape.history.move, (dr) => ({ ...dr, poly: movePolyPieces(dr.poly, new Set(g.ids), g.dx, g.dy) }));
        break;
      case "node":
        this.host.execute(fr.shape.history.node, (dr) => ({ ...dr, shapes: dr.shapes.map((s) => (s.id === g.shape ? moveNode(s, g.index, g.to) : s)) }));
        break;
      case "handle":
        this.host.execute(fr.shape.history.handle, (dr) => ({ ...dr, shapes: dr.shapes.map((s) => (s.id === g.shape ? moveHandle(s, g.index, g.which, g.to) : s)) }));
        break;
      case "pnode":
        this.host.execute(fr.shape.history.polyNode, (dr) => ({ ...dr, poly: movePolyNode(dr.poly, g.piece, g.index, g.to, dr.width, dr.height) }));
        break;
      case "pen":
        break;
    }
    void tool;
    void raw;
    void e;
  }

  // ---- Clavier -----------------------------------------------------------------------------------------------------

  /** Retourne vrai si la touche a été prise. */
  key(tool: ShapeTool, e: KeyboardEvent): boolean {
    if (e.key === "Escape") {
      if (this.drag || this.pending || this.polyNodesPending) {
        this.cancel();
        return true;
      }
      return false;
    }
    if (this.pending) {
      if (e.key === "Enter") {
        this.finishPath(false);
        return true;
      }
      if (e.key === "Backspace") {
        this.pending.pop();
        if (this.pending.length === 0) this.pending = null;
        this.host.refresh();
        return true;
      }
    }
    if (this.polyNodesPending) {
      if (e.key === "Enter") {
        this.closePoly();
        return true;
      }
      if (e.key === "Backspace") {
        this.polyNodesPending.pop();
        if (this.polyNodesPending.length === 0) this.polyNodesPending = null;
        this.host.refresh();
        return true;
      }
    }
    void tool;
    return false;
  }

  cancel(): void {
    this.drag = null;
    this.pending = null;
    this.pendingCursor = null;
    this.polyNodesPending = null;
    this.polyCursor = null;
    this.hover = null;
    this.host.refresh();
  }

  /** Le changement d'outil abandonne le tracé en cours. */
  reset(): void {
    this.cancel();
    this.editShape = null;
  }

  // ---- Applique : tracé par clics ---------------------------------------------------------------------------------

  private penDown(bezier: boolean, raw: Pt, e: { shift: boolean; ctrl: boolean; detail: number }): boolean {
    const draft = this.host.draft();
    const snapped = this.snapShape(raw).point;
    const nodes = this.pending;
    if (nodes && nodes.length >= 3 && draft.appSnap.autoJoin) {
      const first = nodes[0] as AppNode;
      if (dist(first, snapped) <= Math.max(this.host.tol(NODE_PX), CLOSE_TOLERANCE)) {
        this.finishPath(true);
        return false;
      }
    }
    if (nodes && e.detail >= 2) {
      // Double-clic : le tracé s'arrête là (il reste ouvert : un fil).
      this.finishPath(false);
      return false;
    }
    const list = nodes ?? [];
    const last = list[list.length - 1];
    if (last && dist(last, snapped) < 1e-9) return false;
    list.push({ x: snapped.x, y: snapped.y, type: "corner" });
    this.pending = list;
    this.pendingCursor = snapped;
    if (bezier) {
      this.drag = { kind: "pen", index: list.length - 1 };
      return true;
    }
    return false;
  }

  /** Termine le tracé en cours : fermé (pièce) ou ouvert (fil). */
  private finishPath(closed: boolean): void {
    const nodes = this.pending;
    this.pending = null;
    this.pendingCursor = null;
    this.drag = null;
    if (!nodes || nodes.length < 2) return;
    let shape = makeShape(nodes, false);
    if (closed) shape = { ...shape, closed: true };
    else if (this.host.draft().appSnap.autoJoin) shape = normalizeShape(shape);
    if (shape.closed && shape.nodes.length < 3) shape = { ...shape, closed: false };
    this.addShapes([shape], fr.shape.history.path);
  }

  private addShapes(shapes: AppShape[], label: string): void {
    if (shapes.length === 0) return;
    const ids = shapes.map((s) => s.id);
    this.host.execute(label, (dr) => ({ ...dr, shapes: [...dr.shapes, ...shapes] }));
    this.host.select(ids);
    this.editShape = null;
  }

  // ---- Applique : sélection et édition ----------------------------------------------------------------------------

  private aPickDown(raw: Pt, e: { shift: boolean; ctrl: boolean; detail: number }): boolean {
    const draft = this.host.draft();
    const tol = this.host.tol(PICK_PX);
    const hit = shapeAt(draft.shapes, raw, tol);
    const sel = this.host.selection();
    if (e.shift) {
      if (hit) this.host.select(sel.has(hit) ? [...sel].filter((id) => id !== hit) : [...sel, hit]);
      else this.drag = { kind: "marquee", a: raw, b: raw, additive: true, poly: false };
      return !!this.drag;
    }
    if (!hit) {
      this.drag = { kind: "marquee", a: raw, b: raw, additive: false, poly: false };
      return true;
    }
    const ids = sel.has(hit) ? [...sel] : [hit];
    if (!sel.has(hit)) this.host.select(ids);
    // Point de repère : le nœud le plus proche du clic parmi les formes déplacées.
    let ref = raw;
    let best = Infinity;
    for (const s of draft.shapes) {
      if (!ids.includes(s.id)) continue;
      for (const n of s.nodes) {
        const dd = dist(n, raw);
        if (dd < best) {
          best = dd;
          ref = { x: n.x, y: n.y };
        }
      }
    }
    this.drag = { kind: "move", ids, ref, down: raw, dx: 0, dy: 0 };
    return true;
  }

  private aEditDown(raw: Pt, e: { shift: boolean; ctrl: boolean; detail: number }): boolean {
    const draft = this.host.draft();
    const nodeTol = this.host.tol(NODE_PX);
    const edit = draft.shapes.find((s) => s.id === this.editShape);
    if (edit) {
      // Poignées d'abord, puis nœuds.
      for (const [i, n] of edit.nodes.entries()) {
        for (const which of ["in", "out"] as const) {
          const h = which === "in" ? n.hin : n.hout;
          if (!h) continue;
          const p = { x: n.x + h.x, y: n.y + h.y };
          if (dist(p, raw) <= nodeTol && dist(p, n) > nodeTol / 2) {
            this.drag = { kind: "handle", shape: edit.id, index: i, which, to: p };
            return true;
          }
        }
      }
      for (const [i, n] of edit.nodes.entries()) {
        if (dist(n, raw) > nodeTol) continue;
        if (e.detail >= 2) {
          // Double-clic sur un nœud : il est supprimé.
          const removed = deleteNode(edit, i);
          this.host.execute(fr.shape.history.deleteNode, (dr) => ({ ...dr, shapes: removed ? dr.shapes.map((s) => (s.id === edit.id ? removed : s)) : dr.shapes.filter((s) => s.id !== edit.id) }));
          this.host.pickNodes([]);
          return false;
        }
        const ref: NodeRef = { shape: edit.id, node: i };
        const picked = this.host.pickedNodes();
        if (e.shift) this.host.pickNodes(picked.some((p) => p.shape === ref.shape && p.node === i) ? picked.filter((p) => !(p.shape === ref.shape && p.node === i)) : [...picked.slice(-1), ref]);
        else this.host.pickNodes([ref]);
        this.drag = { kind: "node", shape: edit.id, index: i, to: { x: n.x, y: n.y } };
        return true;
      }
      // Double-clic sur le tracé : un nœud s'ajoute.
      if (e.detail >= 2) {
        const near = nearestOnShape(edit, raw);
        if (near && near.distance <= this.host.tol(PICK_PX)) {
          this.host.execute(fr.shape.history.addNode, (dr) => ({ ...dr, shapes: dr.shapes.map((s) => (s.id === edit.id ? addNodeAt(s, near.seg, near.t) : s)) }));
          return false;
        }
      }
    }
    const hit = shapeAt(draft.shapes, raw, this.host.tol(PICK_PX));
    this.editShape = hit;
    this.host.select(hit ? [hit] : []);
    this.host.pickNodes([]);
    return false;
  }

  // ---- PolyDraw ---------------------------------------------------------------------------------------------------

  private polyClick(arcs: boolean, raw: Pt, e: { shift: boolean; ctrl: boolean; detail: number }): boolean {
    const draft = this.host.draft();
    const p = this.snapPoly(raw).point;
    this.polyArcs = arcs;
    const list = this.polyNodesPending;
    if (e.shift) {
      // Maj + clic : retire le dernier nœud (répétable).
      if (list) {
        list.pop();
        if (list.length === 0) this.polyNodesPending = null;
      }
      return false;
    }
    if (list) {
      const first = list[0] as Pt;
      if (list.length >= 3 && dist(first, p) < 1e-9) {
        this.closePoly();
        return false;
      }
      const last = list[list.length - 1] as Pt;
      if (dist(last, p) < 1e-9) return false;
      list.push(p);
      return false;
    }
    void draft;
    this.polyNodesPending = [p];
    this.polyCursor = p;
    return false;
  }

  private closePoly(): void {
    const nodes = this.polyNodesPending;
    this.polyNodesPending = null;
    this.polyCursor = null;
    if (!nodes || nodes.length < 3) return;
    const draft = this.host.draft();
    const edges = polyLoop(draft.poly.grid, draft.width, draft.height, nodes, this.polyArcs);
    const before = draft.poly.pieces.length;
    let added: PolyPiece | undefined;
    this.host.execute(fr.shape.history.polyPiece, (dr) => {
      const next = addPolyPiece(dr.poly, edges);
      added = next.pieces[before];
      return next === dr.poly ? dr : { ...dr, poly: next };
    });
    if (added) this.host.select([(added as PolyPiece).id]);
    else this.host.notify(fr.shape.badPiece);
  }

  private polyInRect(draft: BlockDraft, r: Rect): string[] {
    return draft.poly.pieces
      .filter((p) => {
        const n = polyNodes(p);
        return n.every((q) => q.x >= r.x0 - 1e-9 && q.x <= r.x1 + 1e-9 && q.y >= r.y0 - 1e-9 && q.y <= r.y1 + 1e-9);
      })
      .map((p) => p.id);
  }

  private pPickDown(raw: Pt, e: { shift: boolean; ctrl: boolean; detail: number }): boolean {
    const draft = this.host.draft();
    const hit = polyPieceAt(draft.poly, raw, this.host.tol(PICK_PX));
    const sel = this.host.selection();
    if (e.shift) {
      if (hit) this.host.select(sel.has(hit) ? [...sel].filter((id) => id !== hit) : [...sel, hit]);
      else {
        this.drag = { kind: "marquee", a: raw, b: raw, additive: true, poly: true };
        return true;
      }
      return false;
    }
    if (!hit) {
      this.drag = { kind: "marquee", a: raw, b: raw, additive: false, poly: true };
      return true;
    }
    const ids = sel.has(hit) ? [...sel] : [hit];
    if (!sel.has(hit)) this.host.select(ids);
    let ref = raw;
    let best = Infinity;
    for (const p of draft.poly.pieces) {
      if (!ids.includes(p.id)) continue;
      for (const n of polyNodes(p)) {
        const dd = dist(n, raw);
        if (dd < best) {
          best = dd;
          ref = n;
        }
      }
    }
    this.drag = { kind: "pmove", ids, ref, down: raw, dx: 0, dy: 0 };
    return true;
  }

  private pEditDown(raw: Pt, e: { shift: boolean; ctrl: boolean; detail: number }): boolean {
    const draft = this.host.draft();
    const nodeTol = this.host.tol(NODE_PX);
    for (const piece of draft.poly.pieces) {
      const nodes = polyNodes(piece);
      for (const [i, n] of nodes.entries()) {
        if (dist(n, raw) > nodeTol) continue;
        if (e.detail >= 2) {
          // Double-clic sur un nœud : il est supprimé.
          this.host.execute(fr.shape.history.deleteNode, (dr) => ({ ...dr, poly: deletePolyNode(dr.poly, piece.id, i, dr.width, dr.height) }));
          return false;
        }
        this.drag = { kind: "pnode", piece: piece.id, index: i, to: n };
        this.host.select([piece.id]);
        return true;
      }
    }
    if (e.detail >= 2) {
      // Double-clic sur un trait : un nœud s'ajoute au point de grille le plus proche (sinon au point cliqué).
      const tol = this.host.tol(PICK_PX);
      for (const piece of draft.poly.pieces) {
        for (const [i, edge] of piece.edges.entries()) {
          if (!edgeNear(edge, raw, tol)) continue;
          const grid = nearestGridPoint(draft.poly.grid, draft.width, draft.height, raw, gridPoints(draft.poly.grid, draft.width, draft.height));
          const at = edgeNear(edge, grid.point, 1e-6) ? grid.point : projectOnEdge(edge, raw);
          this.host.execute(fr.shape.history.addNode, (dr) => ({ ...dr, poly: addPolyNode(dr.poly, piece.id, i, at, dr.width, dr.height) }));
          return false;
        }
      }
    }
    const hit = polyPieceAt(draft.poly, raw, this.host.tol(PICK_PX));
    this.host.select(hit ? [hit] : []);
    return false;
  }

  private clampInside(d: BlockDraft, p: Pt): Pt {
    return { x: Math.min(d.width, Math.max(0, p.x)), y: Math.min(d.height, Math.max(0, p.y)) };
  }
}

function projectOnEdge(edge: Segment, p: Pt): Pt {
  if (edge.kind === "line") {
    const dx = edge.b.x - edge.a.x;
    const dy = edge.b.y - edge.a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - edge.a.x) * dx + (p.y - edge.a.y) * dy) / len2));
    return { x: edge.a.x + dx * t, y: edge.a.y + dy * t };
  }
  return p;
}

function edgeNear(edge: Segment, p: Pt, tol: number): boolean {
  return dist(projectOnEdge(edge, p), p) <= tol || (edge.kind === "arc" && nearArc(edge, p, tol));
}

function nearArc(edge: Extract<Segment, { kind: "arc" }>, p: Pt, tol: number): boolean {
  // Un arc de grille : on teste la distance au cercle, dans l'angle de l'arc, via quelques échantillons.
  const mid = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
  const pts = [edge.a, mid, edge.b];
  return pts.some((q) => dist(q, p) <= tol * 2) || gridEdgeRoughDistance(edge, p) <= tol;
}

function gridEdgeRoughDistance(edge: Extract<Segment, { kind: "arc" }>, p: Pt): number {
  let best = Infinity;
  const n = 32;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const q = pointOnArc(edge, t);
    best = Math.min(best, dist(q, p));
  }
  return best;
}

function pointOnArc(edge: Extract<Segment, { kind: "arc" }>, t: number): Pt {
  return arcPointAt(arcGeometry(edge.a, edge.b, edge.sagitta), t);
}

