// Dessin des styles PolyDraw et applique sur le Canvas du plan Bloc : image de décalque, pièces remplies en crème
// (remplissage automatique), contours, nœuds et poignées, tracé en cours, aperçu des créateurs, rectangle de sélection.
// Aucune logique d'édition ici : on reçoit l'état et on le peint.

import { shapeCubics, shapeSegments, type AppNode, type AppShape } from "../core/draw/applique";
import { svgPathOfSegments, type Pt, type Rect, type Segment } from "../core/draw/geometry";
import type { BlockDraft } from "../core/draw/draft";
import { gridPoints, radialGrid, type PolyPiece } from "../core/draw/polydraw";
import { toScreen, type View } from "../core/draw/view";
import type { Palette } from "./blockDraw";

/** Le crème du remplissage automatique (une pièce fermée se remplit : c'est le test visuel qu'elle l'est). */
export const AUTO_FILL = "#f4ecd0";

export interface PendingPath {
  /** Nœuds posés, et position du pointeur (élastique). */
  nodes: AppNode[];
  cursor: Pt | null;
  /** Le pointeur est sur le premier nœud : un clic ferme la pièce. */
  closing: boolean;
}

export interface PendingPoly {
  nodes: Pt[];
  cursor: Pt | null;
  arcs: boolean;
  closing: boolean;
}

export interface TraceScene {
  image: CanvasImageSource | null;
  rect: Rect;
  opacity: number;
}

export interface ShapeScene {
  trace: TraceScene | null;
  /** Les grilles PolyDraw s'affichent seulement quand le calque Pièces PolyDraw est actif. */
  showPolyGrid: boolean;
  polySelection: ReadonlySet<string>;
  polyPending: PendingPoly | null;
  /** Aperçu d'un geste ou d'un créateur (pointillés). */
  previewShapes: readonly AppShape[];
  previewSegments: readonly Segment[];
  shapeSelection: ReadonlySet<string>;
  /** Outil Édition : la forme dont on montre les nœuds, et les nœuds choisis. */
  editShape: string | null;
  pickedNodes: readonly { shape: string; node: number }[];
  pending: PendingPath | null;
  marquee: Rect | null;
  /** Cadre de la sélection (boîte englobante). */
  selectionBox: Rect | null;
  /** L'applique est le calque actif : l'autre calque est estompé. */
  dimPieced: boolean;
  dimApplique: boolean;
}

const pathCache = new WeakMap<object, Path2D>();

function pathOf(key: object, segs: readonly Segment[], close: boolean): Path2D {
  let p = pathCache.get(key);
  if (!p) {
    p = new Path2D(svgPathOfSegments(segs, close));
    pathCache.set(key, p);
  }
  return p;
}

const shapePath = (s: AppShape): Path2D => pathOf(s, shapeSegments(s), s.closed);
const polyPath = (p: PolyPiece): Path2D => pathOf(p, p.edges, true);

function withWorld(ctx: CanvasRenderingContext2D, view: View, dpr: number, draw: () => void): void {
  ctx.save();
  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.originX, dpr * view.originY);
  draw();
  ctx.restore();
}

/** L'image de décalque et les remplissages crème, sous les papiers et les traits. */
export function paintShapesUnder(ctx: CanvasRenderingContext2D, view: View, dpr: number, draft: BlockDraft, s: ShapeScene): void {
  if (s.trace?.image) {
    const { rect, opacity, image } = s.trace;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.originX, dpr * view.originY);
    ctx.drawImage(image, rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
    ctx.restore();
  }
  if (!draft.autoFill) return;
  withWorld(ctx, view, dpr, () => {
    ctx.fillStyle = AUTO_FILL;
    ctx.globalAlpha = s.dimPieced ? 0.45 : 1;
    for (const piece of draft.poly.pieces) ctx.fill(polyPath(piece));
    ctx.globalAlpha = s.dimApplique ? 0.45 : 0.92;
    for (const shape of draft.shapes) if (shape.closed) ctx.fill(shapePath(shape));
  });
}

/** Grille PolyDraw : ses points (et les anneaux des grilles circulaires). */
export function paintPolyGrid(ctx: CanvasRenderingContext2D, view: View, draft: BlockDraft, palette: Palette): void {
  const g = draft.poly.grid;
  const radial = radialGrid(g, draft.width, draft.height);
  if (radial) {
    ctx.save();
    const tl = toScreen(view, { x: 0, y: 0 });
    const br = toScreen(view, { x: draft.width, y: draft.height });
    ctx.beginPath();
    ctx.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.clip();
    ctx.strokeStyle = palette.guide;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const c = toScreen(view, radial.center);
    for (const r of radial.rings) {
      ctx.moveTo(c.x + r * view.scale, c.y);
      ctx.arc(c.x, c.y, r * view.scale, 0, Math.PI * 2);
    }
    const reach = Math.hypot(draft.width, draft.height) * view.scale;
    for (const ray of radial.rays) {
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + ray.x * reach, c.y + ray.y * reach);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = palette.muted;
  ctx.globalAlpha = 0.7;
  const spacing = draft.width / Math.max(1, g.kind === "rect" ? g.a : 16) * view.scale;
  if (g.kind !== "rect" || spacing >= 6) {
    for (const p of gridPoints(g, draft.width, draft.height)) {
      const q = toScreen(view, p);
      ctx.fillRect(Math.round(q.x) - 1.5, Math.round(q.y) - 1.5, 3, 3);
    }
  }
  ctx.restore();
}

function polyline(ctx: CanvasRenderingContext2D, pts: readonly Pt[], view: View): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const q = toScreen(view, p);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
}

function handleSquare(ctx: CanvasRenderingContext2D, p: Pt, half: number): void {
  ctx.fillRect(p.x - half, p.y - half, half * 2, half * 2);
  ctx.strokeRect(p.x - half, p.y - half, half * 2, half * 2);
}

/** Contours, sélection, nœuds, tracés en cours, aperçus : par-dessus le dessin au trait. */
export function paintShapesOver(ctx: CanvasRenderingContext2D, view: View, dpr: number, draft: BlockDraft, s: ShapeScene, palette: Palette): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  withWorld(ctx, view, dpr, () => {
    const w = 1 / view.scale;
    ctx.globalAlpha = s.dimPieced ? 0.5 : 1;
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 2 * w;
    for (const piece of draft.poly.pieces) {
      const sel = s.polySelection.has(piece.id);
      ctx.strokeStyle = sel ? palette.accent : palette.line;
      ctx.lineWidth = (sel ? 4 : 2) * w;
      ctx.stroke(polyPath(piece));
    }
    ctx.globalAlpha = s.dimApplique ? 0.5 : 1;
    for (const shape of draft.shapes) {
      const sel = s.shapeSelection.has(shape.id);
      ctx.strokeStyle = sel ? palette.accent : palette.line;
      ctx.lineWidth = (sel ? 4 : 2) * w;
      ctx.stroke(shapePath(shape));
    }
    ctx.globalAlpha = 1;
    // Aperçu : formes d'un créateur ou d'un geste, en pointillés.
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2 * w;
    ctx.setLineDash([6 * w, 4 * w]);
    for (const shape of s.previewShapes) ctx.stroke(shapePath(shape));
    for (const seg of s.previewSegments) ctx.stroke(new Path2D(svgPathOfSegments([seg])));
    ctx.setLineDash([]);
  });

  // Cadre de la sélection.
  if (s.selectionBox) {
    const a = toScreen(view, { x: s.selectionBox.x0, y: s.selectionBox.y0 });
    const b = toScreen(view, { x: s.selectionBox.x1, y: s.selectionBox.y1 });
    ctx.save();
    ctx.strokeStyle = palette.accent;
    ctx.fillStyle = palette.sheet;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.setLineDash([]);
    for (const [x, y] of [
      [a.x, a.y],
      [(a.x + b.x) / 2, a.y],
      [b.x, a.y],
      [a.x, (a.y + b.y) / 2],
      [b.x, (a.y + b.y) / 2],
      [a.x, b.y],
      [(a.x + b.x) / 2, b.y],
      [b.x, b.y],
    ] as [number, number][]) {
      handleSquare(ctx, { x: x as number, y: y as number }, 3.5);
    }
    ctx.restore();
  }

  // Outil Édition : nœuds, poignées.
  if (s.editShape) {
    const shape = draft.shapes.find((sh) => sh.id === s.editShape);
    if (shape) {
      ctx.save();
      const picked = new Set(s.pickedNodes.filter((n) => n.shape === shape.id).map((n) => n.node));
      for (const [i, n] of shape.nodes.entries()) {
        const p = toScreen(view, n);
        if (picked.has(i) || shape.nodes.length < 40) {
          for (const h of [n.hin, n.hout]) {
            if (!h) continue;
            const q = toScreen(view, { x: n.x + h.x, y: n.y + h.y });
            ctx.strokeStyle = palette.guide;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
            ctx.fillStyle = palette.guide;
            ctx.beginPath();
            ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = palette.line;
        ctx.fillStyle = picked.has(i) ? palette.accent : palette.sheet;
        if (n.type === "corner") handleSquare(ctx, p, 4);
        else if (n.type === "cusp") {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - 5);
          ctx.lineTo(p.x + 5, p.y + 4);
          ctx.lineTo(p.x - 5, p.y + 4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, n.type === "symmetric" ? 5 : 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (n.type === "symmetric") {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
  }

  // Tracé d'applique en cours.
  if (s.pending) {
    const nodes = s.pending.nodes;
    ctx.save();
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2;
    const cubic: AppShape = { id: "pending", closed: false, nodes: s.pending.cursor ? [...nodes, { x: s.pending.cursor.x, y: s.pending.cursor.y, type: "corner" }] : nodes };
    if (cubic.nodes.length >= 2) {
      const cubics = shapeCubics(cubic);
      ctx.beginPath();
      cubics.forEach((c, i) => {
        const a = toScreen(view, c.p0);
        if (i === 0) ctx.moveTo(a.x, a.y);
        const p1 = toScreen(view, c.p1);
        const p2 = toScreen(view, c.p2);
        const p3 = toScreen(view, c.p3);
        ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      });
      ctx.setLineDash([5, 4]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = palette.sheet;
    ctx.strokeStyle = palette.line;
    nodes.forEach((n, i) => {
      const p = toScreen(view, n);
      handleSquare(ctx, p, i === 0 && s.pending?.closing ? 6 : 3.5);
    });
    ctx.restore();
  }

  // PolyLigne / PolyArc en cours : élastique bleu.
  if (s.polyPending) {
    const pp = s.polyPending;
    ctx.save();
    ctx.strokeStyle = palette.guide;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    const pts = pp.cursor ? [...pp.nodes, pp.cursor] : pp.nodes;
    if (pts.length > 1) {
      polyline(ctx, pts, view);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = palette.sheet;
    ctx.strokeStyle = palette.line;
    pp.nodes.forEach((n, i) => handleSquare(ctx, toScreen(view, n), i === 0 && pp.closing ? 6 : 3.5));
    ctx.restore();
  }

  // Rectangle de sélection.
  if (s.marquee) {
    const a = toScreen(view, { x: s.marquee.x0, y: s.marquee.y0 });
    const b = toScreen(view, { x: s.marquee.x1, y: s.marquee.y1 });
    ctx.save();
    ctx.strokeStyle = palette.guide;
    ctx.fillStyle = palette.guide;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.globalAlpha = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.restore();
  }
  ctx.restore();
}

export const emptyShapeScene = (): ShapeScene => ({
  trace: null,
  showPolyGrid: false,
  polySelection: new Set(),
  polyPending: null,
  previewShapes: [],
  previewSegments: [],
  shapeSelection: new Set(),
  editShape: null,
  pickedNodes: [],
  pending: null,
  marquee: null,
  selectionBox: null,
  dimPieced: false,
  dimApplique: false,
});
