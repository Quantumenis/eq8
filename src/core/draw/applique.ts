// L'applique (SPEC §6.4) : des pièces faites de contours de Bézier qui se superposent (le premier dessiné est dessous).
// Une pièce = un contour fermé sans auto-intersection ; un tracé non fermé est un fil (matelassage, broderie).
// Tout est pur : une opération renvoie de nouvelles formes, ou les mêmes s'il n'y a rien à changer.

import { sha256Hex } from "../hash";
import { createId, type Id } from "../project/model";
import { applyMat, type Mat } from "../quilt/geom";
import { cubicBounds, cubicIsLine, cubicToSegments, splitCubic, type Cubic } from "./bezier";
import { clean, dist, samePoint, unionBounds, type Pt, type Rect, type Segment } from "./geometry";
import { flatten, pieceFromBoundary, segmentText, type Piece } from "./pieces";

export type NodeType = "corner" | "cusp" | "smooth" | "symmetric";
export const NODE_TYPES: readonly NodeType[] = ["corner", "cusp", "smooth", "symmetric"];

/** Un nœud ; les poignées sont des vecteurs relatifs au nœud (absentes = pas de courbure de ce côté). */
export interface AppNode {
  x: number;
  y: number;
  type: NodeType;
  hin?: Pt;
  hout?: Pt;
}

/** Une forme : un tracé de nœuds, fermé ou non. `closed` : le dernier nœud se relie au premier. */
export interface AppShape {
  id: Id;
  closed: boolean;
  nodes: AppNode[];
}

/** Deux nœuds plus proches que cela sont confondus (fermeture d'un tracé). */
export const CLOSE_TOLERANCE = 1e-3;

const KAPPA = 0.5522847498307936;
export { KAPPA };

// ---------------------------------------------------------------------------------------------------------------
// Construction

export const nodeAt = (x: number, y: number, type: NodeType = "corner"): AppNode => ({ x: clean(x), y: clean(y), type });

export function makeShape(nodes: readonly AppNode[], closed: boolean, id: Id = createId()): AppShape {
  return { id, closed, nodes: nodes.map(cleanNode) };
}

function cleanVec(v: Pt | undefined): Pt | undefined {
  return v && (Math.abs(v.x) > 1e-9 || Math.abs(v.y) > 1e-9) ? { x: clean(v.x), y: clean(v.y) } : undefined;
}

export function cleanNode(n: AppNode): AppNode {
  const out: AppNode = { x: clean(n.x), y: clean(n.y), type: n.type };
  const hin = cleanVec(n.hin);
  const hout = cleanVec(n.hout);
  if (hin) out.hin = hin;
  if (hout) out.hout = hout;
  return out;
}

/** Un polygone (ou une polyligne) de nœuds « coin » sans poignée. */
export function polyShape(points: readonly Pt[], closed: boolean, id: Id = createId()): AppShape {
  return makeShape(points.map((p) => nodeAt(p.x, p.y)), closed, id);
}

// ---------------------------------------------------------------------------------------------------------------
// Géométrie d'une forme

export function shapeCubics(shape: AppShape): Cubic[] {
  const n = shape.nodes.length;
  const out: Cubic[] = [];
  const count = shape.closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = shape.nodes[i] as AppNode;
    const b = shape.nodes[(i + 1) % n] as AppNode;
    out.push({
      p0: { x: a.x, y: a.y },
      p1: { x: a.x + (a.hout?.x ?? 0), y: a.y + (a.hout?.y ?? 0) },
      p2: { x: b.x + (b.hin?.x ?? 0), y: b.y + (b.hin?.y ?? 0) },
      p3: { x: b.x, y: b.y },
    });
  }
  return out;
}

const segmentCache = new WeakMap<AppShape, Segment[]>();

/** Le contour d'une forme en droites et arcs (les Béziers sont approchés à 10⁻⁴ po). */
export function shapeSegments(shape: AppShape): Segment[] {
  const hit = segmentCache.get(shape);
  if (hit) return hit;
  const out: Segment[] = [];
  shapeCubics(shape).forEach((c, i) => {
    for (const s of cubicToSegments(c, `${shape.id}.${i}`)) out.push(s);
  });
  segmentCache.set(shape, out);
  return out;
}

export function shapeBounds(shape: AppShape): Rect | null {
  const cubics = shapeCubics(shape);
  if (cubics.length === 0) {
    const n = shape.nodes[0];
    return n ? { x0: n.x, y0: n.y, x1: n.x, y1: n.y } : null;
  }
  return unionBounds(cubics.map(cubicBounds));
}

export function shapesBounds(shapes: readonly AppShape[]): Rect | null {
  return unionBounds(shapes.map(shapeBounds).filter((r): r is Rect => r !== null));
}

/** Ferme un tracé dont le dernier nœud rejoint le premier (à `CLOSE_TOLERANCE` près) et fusionne ces deux nœuds. */
export function normalizeShape(shape: AppShape): AppShape {
  if (shape.closed || shape.nodes.length < 3) return shape;
  const first = shape.nodes[0] as AppNode;
  const last = shape.nodes[shape.nodes.length - 1] as AppNode;
  if (dist(first, last) > CLOSE_TOLERANCE) return shape;
  const merged: AppNode = { ...first };
  if (last.hin) merged.hin = last.hin;
  else delete merged.hin;
  return { ...shape, closed: true, nodes: [cleanNode(merged), ...shape.nodes.slice(1, -1)] };
}

export const isClosedShape = (shape: AppShape): boolean => normalizeShape(shape).closed;

// ---------------------------------------------------------------------------------------------------------------
// Auto-intersection

function properCrossing(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  const eps = 1e-12;
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
}

/** Vrai si le contour (polygone aplati) se coupe lui-même. */
export function selfIntersects(boundary: readonly Segment[]): boolean {
  const poly = flatten(boundary);
  const n = poly.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = poly[i] as Pt;
    const b = poly[(i + 1) % n] as Pt;
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = poly[j] as Pt;
      const d = poly[(j + 1) % n] as Pt;
      if (Math.max(c.x, d.x) < x0 || Math.min(c.x, d.x) > x1 || Math.max(c.y, d.y) < y0 || Math.min(c.y, d.y) > y1) continue;
      if (properCrossing(a, b, c, d)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
// Contenu : pièces et fils d'un dessin d'applique

/** Un tracé ouvert (fil de matelassage ou de broderie). */
export interface Strand {
  key: string;
  segments: Segment[];
}

export type DrawingIssue =
  | { kind: "selfIntersect"; shape: Id; key: string }
  | { kind: "outside"; shape: Id };

export interface AppliqueContent {
  pieces: Piece[];
  strands: Strand[];
  issues: DrawingIssue[];
}

/** Clé de la pièce de fond d'un bloc d'applique. */
export const BACKGROUND_KEY = "bg";

export function backgroundPiece(width: number, height: number): Piece {
  const a = { x: 0, y: 0 };
  const b = { x: width, y: 0 };
  const c = { x: width, y: height };
  const d = { x: 0, y: height };
  const boundary: Segment[] = [
    { id: "bg1", kind: "line", a, b },
    { id: "bg2", kind: "line", a: b, b: c },
    { id: "bg3", kind: "line", a: c, b: d },
    { id: "bg4", kind: "line", a: d, b: a },
  ];
  const piece = pieceFromBoundary(boundary, "b") as Piece;
  return { ...piece, key: BACKGROUND_KEY };
}

function strandKey(segments: readonly Segment[]): string {
  return `l${sha256Hex(new TextEncoder().encode(segments.map(segmentText).join(";"))).slice(0, 16)}`;
}

/** Les pièces (dans l'ordre d'empilement) et les fils d'une liste de formes. */
export function appliqueContent(shapes: readonly AppShape[], opts: { background?: { width: number; height: number } | null } = {}): AppliqueContent {
  const pieces: Piece[] = [];
  const strands: Strand[] = [];
  const issues: DrawingIssue[] = [];
  const seen = new Map<string, number>();
  if (opts.background) {
    pieces.push(backgroundPiece(opts.background.width, opts.background.height));
    seen.set(BACKGROUND_KEY, 1);
  }
  for (const shape of shapes) {
    const boundary = shapeSegments(shape);
    if (boundary.length === 0) continue;
    if (!shape.closed || shape.nodes.length < 2) {
      const key = strandKey(boundary);
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      strands.push({ key: n === 0 ? key : `${key}-${n + 1}`, segments: boundary });
      continue;
    }
    const piece = pieceFromBoundary(boundary, "a");
    if (!piece) {
      // Aire nulle : un huit parfaitement symétrique, ou un contour écrasé.
      if (selfIntersects(boundary)) issues.push({ kind: "selfIntersect", shape: shape.id, key: "" });
      continue;
    }
    const n = seen.get(piece.key) ?? 0;
    seen.set(piece.key, n + 1);
    if (n > 0) piece.key = `${piece.key}-${n + 1}`;
    if (selfIntersects(boundary)) issues.push({ kind: "selfIntersect", shape: shape.id, key: piece.key });
    pieces.push(piece);
  }
  return { pieces, strands, issues };
}

// ---------------------------------------------------------------------------------------------------------------
// Transformations (affines)

export function transformNode(n: AppNode, m: Mat): AppNode {
  const p = applyMat(m, n);
  const lin = (v: Pt | undefined): Pt | undefined => (v ? { x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y } : undefined);
  return cleanNode({ ...n, x: p.x, y: p.y, hin: lin(n.hin) as Pt, hout: lin(n.hout) as Pt });
}

export function transformShape(shape: AppShape, m: Mat): AppShape {
  return { ...shape, nodes: shape.nodes.map((n) => transformNode(n, m)) };
}

/** Applique une matrice aux formes dont l'identifiant est dans `ids`. */
export function transformShapes(shapes: readonly AppShape[], ids: ReadonlySet<Id>, m: Mat): AppShape[] {
  return shapes.map((s) => (ids.has(s.id) ? transformShape(s, m) : s));
}

/** Met toutes les formes à l'échelle (fx, fy) autour de l'origine du bloc (changement de taille du bloc). */
export function scaleShapes(shapes: readonly AppShape[], fx: number, fy: number): AppShape[] {
  if (shapes.length === 0 || (Math.abs(fx - 1) < 1e-12 && Math.abs(fy - 1) < 1e-12)) return shapes as AppShape[];
  return shapes.map((s) => transformShape(s, [fx, 0, 0, fy, 0, 0]));
}

export function translateShapes(shapes: readonly AppShape[], ids: ReadonlySet<Id>, dx: number, dy: number): AppShape[] {
  return transformShapes(shapes, ids, [1, 0, 0, 1, dx, dy]);
}

/** Les formes sélectionnées tiennent-elles encore dans le bloc ? */
export function insideBlock(shapes: readonly AppShape[], width: number, height: number, eps = 1e-6): boolean {
  return shapes.every((s) => {
    const b = shapeBounds(s);
    return !b || (b.x0 >= -eps && b.y0 >= -eps && b.x1 <= width + eps && b.y1 <= height + eps);
  });
}

export function selectionBox(shapes: readonly AppShape[], ids: ReadonlySet<Id>): Rect | null {
  return shapesBounds(shapes.filter((s) => ids.has(s.id)));
}

/** Copies des formes choisies (identifiants neufs), décalées de (dx, dy), posées par-dessus. */
export function cloneShapes(shapes: readonly AppShape[], ids: ReadonlySet<Id>, dx = 0.25, dy = 0.25): { shapes: AppShape[]; ids: Id[] } {
  const copies: AppShape[] = [];
  for (const s of shapes) {
    if (!ids.has(s.id)) continue;
    copies.push(transformShape({ ...s, id: createId() }, [1, 0, 0, 1, dx, dy]));
  }
  return { shapes: [...shapes, ...copies], ids: copies.map((c) => c.id) };
}

export function deleteShapes(shapes: readonly AppShape[], ids: ReadonlySet<Id>): AppShape[] {
  return shapes.some((s) => ids.has(s.id)) ? shapes.filter((s) => !ids.has(s.id)) : (shapes as AppShape[]);
}

/** Premier plan / arrière-plan : les formes choisies passent en dernier / en premier, sans changer leur ordre relatif. */
export function reorderShapes(shapes: readonly AppShape[], ids: ReadonlySet<Id>, to: "front" | "back"): AppShape[] {
  const picked = shapes.filter((s) => ids.has(s.id));
  const rest = shapes.filter((s) => !ids.has(s.id));
  return to === "front" ? [...rest, ...picked] : [...picked, ...rest];
}

export type ShapeMirror = "lr" | "tb" | "diagLeft" | "diagRight";

/** Matrice d'un miroir autour du centre de la sélection. */
export function mirrorMat(box: Rect, axis: ShapeMirror): Mat {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  switch (axis) {
    case "lr":
      return [-1, 0, 0, 1, 2 * cx, 0];
    case "tb":
      return [1, 0, 0, -1, 0, 2 * cy];
    case "diagLeft":
      return [0, 1, 1, 0, cx - cy, cy - cx];
    case "diagRight":
      return [0, -1, -1, 0, cx + cy, cx + cy];
  }
}

export function rotateAbout(degrees: number, c: Pt): Mat {
  const t = (degrees * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return [cos, sin, -sin, cos, c.x - cos * c.x + sin * c.y, c.y - sin * c.x - cos * c.y];
}

export function scaleAbout(sx: number, sy: number, c: Pt): Mat {
  return [sx, 0, 0, sy, c.x - sx * c.x, c.y - sy * c.y];
}

/** Centre la sélection dans le bloc. */
export function centerInBlock(shapes: readonly AppShape[], ids: ReadonlySet<Id>, width: number, height: number): AppShape[] {
  const box = selectionBox(shapes, ids);
  if (!box) return shapes as AppShape[];
  const dx = width / 2 - (box.x0 + box.x1) / 2;
  const dy = height / 2 - (box.y0 + box.y1) / 2;
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return shapes as AppShape[];
  return translateShapes(shapes, ids, dx, dy);
}

// ---------------------------------------------------------------------------------------------------------------
// Sélection par clic et par rectangle

/** La forme la plus haute sous le point (intérieur d'une pièce fermée, ou à `tol` d'un fil ou d'un bord). */
export function shapeAt(shapes: readonly AppShape[], p: Pt, tol: number): Id | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i] as AppShape;
    const b = shapeBounds(s);
    if (!b || p.x < b.x0 - tol || p.x > b.x1 + tol || p.y < b.y0 - tol || p.y > b.y1 + tol) continue;
    const segs = shapeSegments(s);
    if (s.closed && insidePoly(flatten(segs), p)) return s.id;
    for (const seg of segs) if (distanceToSegment(seg, p) <= tol) return s.id;
  }
  return null;
}

function insidePoly(poly: readonly Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Pt;
    const b = poly[j] as Pt;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(seg: Segment, p: Pt): number {
  const pts = seg.kind === "line" ? [seg.a, seg.b] : flatten([seg]).concat([seg.b]);
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as Pt;
    const b = pts[i + 1] as Pt;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, dist(p, { x: a.x + dx * t, y: a.y + dy * t }));
  }
  return best;
}

/** Les formes entièrement dans le rectangle (le rectangle de sélection doit les entourer complètement). */
export function shapesInRect(shapes: readonly AppShape[], r: Rect): Id[] {
  const x0 = Math.min(r.x0, r.x1);
  const x1 = Math.max(r.x0, r.x1);
  const y0 = Math.min(r.y0, r.y1);
  const y1 = Math.max(r.y0, r.y1);
  return shapes
    .filter((s) => {
      const b = shapeBounds(s);
      return b !== null && b.x0 >= x0 - 1e-9 && b.x1 <= x1 + 1e-9 && b.y0 >= y0 - 1e-9 && b.y1 <= y1 + 1e-9;
    })
    .map((s) => s.id);
}

// ---------------------------------------------------------------------------------------------------------------
// Édition des nœuds

function withNodes(shape: AppShape, nodes: AppNode[], closed = shape.closed): AppShape {
  return { ...shape, closed, nodes: nodes.map(cleanNode) };
}

/** Aligne les poignées d'un nœud « lisse » ou « symétrique » : la poignée `keep` est gardée, l'autre s'aligne dessus. */
function constrain(n: AppNode, keep: "in" | "out"): AppNode {
  const kept = keep === "in" ? n.hin : n.hout;
  if (!kept) return n;
  const other = keep === "in" ? n.hout : n.hin;
  const len = Math.hypot(kept.x, kept.y);
  if (len < 1e-12) return n;
  const ux = -kept.x / len;
  const uy = -kept.y / len;
  let targetLen = other ? Math.hypot(other.x, other.y) : len;
  if (n.type === "symmetric") targetLen = len;
  if (n.type === "smooth" && !other) targetLen = len;
  const v = { x: ux * targetLen, y: uy * targetLen };
  return keep === "in" ? { ...n, hout: v } : { ...n, hin: v };
}

export function moveNode(shape: AppShape, index: number, to: Pt): AppShape {
  const n = shape.nodes[index];
  if (!n || (Math.abs(n.x - to.x) < 1e-12 && Math.abs(n.y - to.y) < 1e-12)) return shape;
  const nodes = shape.nodes.slice();
  nodes[index] = { ...n, x: to.x, y: to.y };
  return withNodes(shape, nodes);
}

/** Tire une poignée vers le point absolu `to` ; selon le type du nœud, l'autre poignée suit. */
export function moveHandle(shape: AppShape, index: number, which: "in" | "out", to: Pt): AppShape {
  const n = shape.nodes[index];
  if (!n) return shape;
  const v = { x: to.x - n.x, y: to.y - n.y };
  let next: AppNode = which === "in" ? { ...n, hin: v } : { ...n, hout: v };
  if (n.type === "smooth" || n.type === "symmetric") next = constrain(next, which);
  if (n.type === "cusp") next = { ...next, [which === "in" ? "hout" : "hin"]: undefined } as AppNode;
  const nodes = shape.nodes.slice();
  nodes[index] = next;
  return withNodes(shape, nodes);
}

/** Change le type d'un nœud ; « lisse » et « symétrique » alignent les poignées, « pointe » les superpose. */
export function setNodeType(shape: AppShape, index: number, type: NodeType): AppShape {
  const n = shape.nodes[index];
  if (!n || n.type === type) return shape;
  let next: AppNode = { ...n, type };
  if (type === "smooth" || type === "symmetric") {
    if (n.hout) next = constrain(next, "out");
    else if (n.hin) next = constrain(next, "in");
    else {
      // Sans poignée : on en crée, tangentes à la direction des voisins.
      const prev = shape.nodes[(index - 1 + shape.nodes.length) % shape.nodes.length] as AppNode;
      const after = shape.nodes[(index + 1) % shape.nodes.length] as AppNode;
      const tx = after.x - prev.x;
      const ty = after.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      const reach = Math.min(dist(n, prev), dist(n, after)) / 3;
      next = { ...next, hout: { x: (tx / len) * reach, y: (ty / len) * reach }, hin: { x: (-tx / len) * reach, y: (-ty / len) * reach } };
    }
  } else if (type === "cusp") {
    // Pointe : les deux poignées se superposent.
    const v = n.hout ?? (n.hin ? { x: -n.hin.x, y: -n.hin.y } : undefined);
    next = v ? { ...next, hout: v, hin: v } : next;
  }
  const nodes = shape.nodes.slice();
  nodes[index] = next;
  return withNodes(shape, nodes);
}

/** Ajoute un nœud sur le segment `seg` (entre le nœud `seg` et le suivant) au paramètre t. */
export function addNodeAt(shape: AppShape, seg: number, t: number): AppShape {
  const cubics = shapeCubics(shape);
  const c = cubics[seg];
  if (!c || t <= 1e-6 || t >= 1 - 1e-6) return shape;
  const [l, r] = splitCubic(c, t);
  const nodes = shape.nodes.slice();
  const a = nodes[seg] as AppNode;
  const bIndex = (seg + 1) % nodes.length;
  const b = nodes[bIndex] as AppNode;
  const curved = !cubicIsLine(c, 1e-9);
  const mid: AppNode = { x: l.p3.x, y: l.p3.y, type: curved ? "smooth" : "corner" };
  if (curved) {
    mid.hin = { x: l.p2.x - l.p3.x, y: l.p2.y - l.p3.y };
    mid.hout = { x: r.p1.x - r.p0.x, y: r.p1.y - r.p0.y };
  }
  const newA: AppNode = { ...a };
  if (curved) newA.hout = { x: l.p1.x - l.p0.x, y: l.p1.y - l.p0.y };
  const newB: AppNode = { ...b };
  if (curved) newB.hin = { x: r.p2.x - r.p3.x, y: r.p2.y - r.p3.y };
  nodes[seg] = newA;
  nodes[bIndex] = newB;
  nodes.splice(seg + 1, 0, mid);
  // Si le nœud b était le premier d'un tracé fermé, le nouveau nœud est inséré en fin de liste.
  if (bIndex === 0 && shape.closed) {
    nodes.splice(seg + 1, 1);
    nodes[0] = newB;
    nodes.push(mid);
  }
  return withNodes(shape, nodes);
}

/** Supprime un nœud ; un tracé qui n'aurait plus assez de nœuds est supprimé (`null`). */
export function deleteNode(shape: AppShape, index: number): AppShape | null {
  if (index < 0 || index >= shape.nodes.length) return shape;
  const nodes = shape.nodes.filter((_, i) => i !== index);
  if (nodes.length < (shape.closed ? 3 : 2)) return null;
  return withNodes(shape, nodes);
}

/** Convertit le segment `seg` en droite (poignées retirées) ou en courbe (poignées au tiers). */
export function convertSegment(shape: AppShape, seg: number, to: "line" | "curve"): AppShape {
  const n = shape.nodes.length;
  const count = shape.closed ? n : n - 1;
  if (seg < 0 || seg >= count) return shape;
  const ai = seg;
  const bi = (seg + 1) % n;
  const a = shape.nodes[ai] as AppNode;
  const b = shape.nodes[bi] as AppNode;
  const nodes = shape.nodes.slice();
  if (to === "line") {
    const na: AppNode = { ...a };
    const nb: AppNode = { ...b };
    delete na.hout;
    delete nb.hin;
    nodes[ai] = na;
    nodes[bi] = nb;
  } else {
    const dx = (b.x - a.x) / 3;
    const dy = (b.y - a.y) / 3;
    nodes[ai] = { ...a, hout: a.hout ?? { x: dx, y: dy } };
    nodes[bi] = { ...b, hin: b.hin ?? { x: -dx, y: -dy } };
  }
  return withNodes(shape, nodes);
}

/** Coupe au nœud : un tracé fermé s'ouvre ; un tracé ouvert donne deux tracés. */
export function cutAt(shape: AppShape, index: number): AppShape[] {
  const n = shape.nodes.length;
  const node = shape.nodes[index];
  if (!node) return [shape];
  if (shape.closed) {
    const rotated = [...shape.nodes.slice(index), ...shape.nodes.slice(0, index)];
    const first: AppNode = { ...(rotated[0] as AppNode) };
    const last: AppNode = { ...(rotated[0] as AppNode) };
    delete first.hin;
    delete last.hout;
    return [withNodes(shape, [first, ...rotated.slice(1), last], false)];
  }
  if (index <= 0 || index >= n - 1) return [shape];
  const left = shape.nodes.slice(0, index + 1).map((nd, i, arr) => {
    if (i !== arr.length - 1) return nd;
    const c = { ...nd };
    delete c.hout;
    return c;
  });
  const right = shape.nodes.slice(index).map((nd, i) => {
    if (i !== 0) return nd;
    const c = { ...nd };
    delete c.hin;
    return c;
  });
  return [withNodes(shape, left), { ...withNodes(shape, right), id: createId() }];
}

export interface NodeRef {
  shape: Id;
  node: number;
}

/** Joint deux extrémités de tracés ouverts : le même tracé se ferme, deux tracés n'en font plus qu'un. */
export function joinNodes(shapes: readonly AppShape[], a: NodeRef, b: NodeRef): AppShape[] | null {
  const sa = shapes.find((s) => s.id === a.shape);
  const sb = shapes.find((s) => s.id === b.shape);
  if (!sa || !sb || sa.closed || sb.closed) return null;
  const endA = a.node === 0 ? "start" : a.node === sa.nodes.length - 1 ? "end" : null;
  const endB = b.node === 0 ? "start" : b.node === sb.nodes.length - 1 ? "end" : null;
  if (!endA || !endB) return null;
  if (sa === sb) {
    if (endA === endB || sa.nodes.length < 2) return null;
    const closed = withNodes(sa, sa.nodes, true);
    const merged = normalizeShape({ ...closed, closed: false });
    return shapes.map((s) => (s === sa ? (merged.closed ? merged : closed) : s));
  }
  const first = endA === "end" ? sa.nodes : [...sa.nodes].reverse().map(flipNode);
  const second = endB === "start" ? sb.nodes : [...sb.nodes].reverse().map(flipNode);
  const joint = first[first.length - 1] as AppNode;
  const head = second[0] as AppNode;
  let nodes: AppNode[];
  if (samePoint(joint, head, CLOSE_TOLERANCE)) {
    const m: AppNode = { ...joint };
    if (head.hout) m.hout = head.hout;
    nodes = [...first.slice(0, -1), m, ...second.slice(1)];
  } else nodes = [...first, ...second];
  const merged = withNodes(sa, nodes, false);
  return shapes.filter((s) => s !== sb).map((s) => (s === sa ? merged : s));
}

function flipNode(n: AppNode): AppNode {
  const out: AppNode = { x: n.x, y: n.y, type: n.type };
  if (n.hout) out.hin = n.hout;
  if (n.hin) out.hout = n.hin;
  return out;
}

/** Inverse le sens d'une forme. */
export function reverseShape(shape: AppShape): AppShape {
  return { ...shape, nodes: [...shape.nodes].reverse().map(flipNode) };
}

// ---------------------------------------------------------------------------------------------------------------
// Couronne (WreathMaker)

export interface WreathParams {
  /** Nombre de groupes, de 3 à 20. */
  count: number;
  /** Espacement de 0 à 100 % : 0 = les groupes se touchent au centre, 100 = ils arrivent au bord. */
  spacing: number;
  /** Taille des groupes (100 = inchangée). */
  size: number;
}

export const MIN_WREATH_COUNT = 3;
export const MAX_WREATH_COUNT = 20;

/**
 * La couronne : les formes choisies forment un groupe, recopié `count` fois autour du centre du bloc (chaque copie
 * est pivotée de 360/count°). Elle est toujours centrée ; la taille est réduite pour tenir dans le bloc si besoin.
 */
export function wreath(shapes: readonly AppShape[], ids: ReadonlySet<Id>, width: number, height: number, p: WreathParams): { shapes: AppShape[]; ids: Id[] } | null {
  const group = shapes.filter((s) => ids.has(s.id));
  const box = shapesBounds(group);
  if (group.length === 0 || !box || p.count < MIN_WREATH_COUNT || p.count > MAX_WREATH_COUNT) return null;
  const center = { x: width / 2, y: height / 2 };
  const reach = Math.min(width, height) / 2;
  // Le groupe, remis debout : son centre est posé au-dessus du centre du bloc.
  const gc = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  const k0 = Math.max(0.01, p.size / 100);
  let half = ((box.y1 - box.y0) / 2) * k0; // demi-hauteur du groupe, dans le sens radial
  const spacing = Math.max(0, Math.min(100, p.spacing)) / 100;
  let k = k0;
  if (2 * half > reach) {
    k = (k0 * reach) / (2 * half);
    half = reach / 2;
  }
  const radius = half + spacing * (reach - 2 * half);
  const place: Mat = [k, 0, 0, k, center.x - k * gc.x, center.y - radius - k * gc.y];
  const made: AppShape[] = [];
  for (let i = 0; i < p.count; i++) {
    const turn = rotateAbout((360 * i) / p.count, center);
    for (const s of group) made.push({ ...transformShape(transformShape(s, place), turn), id: createId() });
  }
  // Ajustement final : si la couronne dépasse le bloc, on la réduit autour du centre.
  let fitted = made;
  const out = shapesBounds(made);
  if (out) {
    const over = Math.max((center.x - out.x0) / (width / 2), (out.x1 - center.x) / (width / 2), (center.y - out.y0) / (height / 2), (out.y1 - center.y) / (height / 2));
    if (over > 1) fitted = made.map((s) => transformShape(s, scaleAbout(1 / over, 1 / over, center)));
  }
  const rest = shapes.filter((s) => !ids.has(s.id));
  return { shapes: [...rest, ...fitted], ids: fitted.map((s) => s.id) };
}

/** Une courbe de Bézier aux deux poignées données (pratique pour les tests et les générateurs). */
export function cubicShape(c: Cubic, closed = false): AppShape {
  return makeShape(
    [
      { x: c.p0.x, y: c.p0.y, type: "corner", hout: { x: c.p1.x - c.p0.x, y: c.p1.y - c.p0.y } },
      { x: c.p3.x, y: c.p3.y, type: "corner", hin: { x: c.p2.x - c.p3.x, y: c.p2.y - c.p3.y } },
    ],
    closed,
  );
}
