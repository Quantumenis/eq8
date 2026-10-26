// PolyDraw (SPEC §6.3) : on dessine des pièces complètes sur l'une des six grilles. Il n'y a pas de contour du bloc :
// le fond est lui aussi fait de pièces. Les grilles ont leurs points (là où les nœuds s'accrochent) et leurs arcs
// (PolyArc suit l'anneau de la grille entre deux nœuds du même anneau).
//
// Géométrie des grilles (Q-6.4, reconstituée d'après les illustrations p. 129-130) :
//  - Rectangle : (a + 1) × (b + 1) points.
//  - Cercle : centre au milieu du bloc ; « Anneaux » a (le centre compte pour 1) = a − 1 anneaux jusqu'au bord, puis les
//    anneaux partiels des coins ; « Rayons » b = nombre de rayons. Les points sont le centre, les croisements
//    anneau × rayon, les rayons et anneaux avec le bord, et les 4 coins.
//  - Arc : comme le cercle, mais en quarts de cercle depuis le coin bas-gauche ; b + 1 rayons de 0° à 90°.
//  - Étoile 8 branches : LeMoyne (coins, pointes, losanges), le carré de coin divisé en a × b.
//  - Kaléidoscope : a anneaux carrés ; chaque côté entre une médiane et un coin est divisé en b.
//  - Octogone : a anneaux octogonaux, côtés divisés en b, et 4 triangles de coin.

import { createId, type Id } from "../project/model";
import { arcGeometry, boundsOf, clean, cleanPt, cleanSegment, dist, samePoint, unionBounds, type Pt, type Rect, type Segment } from "./geometry";
import { areaAndCentroid, pieceFromBoundary, type Piece } from "./pieces";

export const GRID_KINDS = ["rect", "circle", "arc", "star8", "kaleido", "octagon"] as const;
export type GridKind = (typeof GRID_KINDS)[number];

/** Une grille et ses deux compteurs (leur sens dépend de la grille). */
export interface PolyGrid {
  kind: GridKind;
  a: number;
  b: number;
}

export const DEFAULT_GRIDS: Record<GridKind, PolyGrid> = {
  rect: { kind: "rect", a: 24, b: 24 },
  circle: { kind: "circle", a: 4, b: 8 },
  arc: { kind: "arc", a: 4, b: 6 },
  star8: { kind: "star8", a: 2, b: 2 },
  kaleido: { kind: "kaleido", a: 4, b: 2 },
  octagon: { kind: "octagon", a: 3, b: 2 },
};

/** Bornes des compteurs. */
export const GRID_LIMITS = { min: 1, max: 64 };

/** Une pièce PolyDraw : un contour fermé de droites et d'arcs. */
export interface PolyPiece {
  id: Id;
  edges: Segment[];
}

export interface PolyState {
  grid: PolyGrid;
  pieces: PolyPiece[];
}

export const emptyPoly = (kind: GridKind = "rect"): PolyState => ({ grid: DEFAULT_GRIDS[kind], pieces: [] });

export function clampGrid(g: PolyGrid): PolyGrid {
  const k = (n: number) => Math.max(GRID_LIMITS.min, Math.min(GRID_LIMITS.max, Math.round(Number.isFinite(n) ? n : 1)));
  return { kind: g.kind, a: k(g.a), b: g.kind === "circle" ? Math.max(2, k(g.b)) : k(g.b) };
}

const EPS_POINT = 1e-6;

function dedupe(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  const seen = new Set<string>();
  for (const p of points) {
    const q = cleanPt(p);
    const key = `${Math.round(q.x / EPS_POINT)},${Math.round(q.y / EPS_POINT)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

const insideBox = (p: Pt, w: number, h: number): boolean => p.x >= -EPS_POINT && p.y >= -EPS_POINT && p.x <= w + EPS_POINT && p.y <= h + EPS_POINT;

const corners = (w: number, h: number): Pt[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

/** Intersections d'un cercle (centre c, rayon r) avec le contour du rectangle. */
function circleEdgePoints(c: Pt, r: number, w: number, h: number): Pt[] {
  const out: Pt[] = [];
  for (const x of [0, w]) {
    const dx = x - c.x;
    if (Math.abs(dx) <= r) {
      const dy = Math.sqrt(Math.max(0, r * r - dx * dx));
      for (const y of [c.y - dy, c.y + dy]) out.push({ x, y });
    }
  }
  for (const y of [0, h]) {
    const dy = y - c.y;
    if (Math.abs(dy) <= r) {
      const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
      for (const x of [c.x - dx, c.x + dx]) out.push({ x, y });
    }
  }
  return out.filter((p) => insideBox(p, w, h));
}

/** Intersection du rayon (c, direction d) avec le contour du rectangle. */
function rayEdgePoint(c: Pt, d: Pt, w: number, h: number): Pt | null {
  let best = Infinity;
  for (const x of [0, w]) {
    if (Math.abs(d.x) > 1e-12) {
      const t = (x - c.x) / d.x;
      const y = c.y + t * d.y;
      if (t > 1e-9 && y >= -EPS_POINT && y <= h + EPS_POINT) best = Math.min(best, t);
    }
  }
  for (const y of [0, h]) {
    if (Math.abs(d.y) > 1e-12) {
      const t = (y - c.y) / d.y;
      const x = c.x + t * d.x;
      if (t > 1e-9 && x >= -EPS_POINT && x <= w + EPS_POINT) best = Math.min(best, t);
    }
  }
  return Number.isFinite(best) ? { x: c.x + best * d.x, y: c.y + best * d.y } : null;
}

interface RadialGrid {
  center: Pt;
  rings: number[];
  /** Directions unitaires des rayons (y vers le bas). */
  rays: Pt[];
}

/** Les anneaux et les rayons des grilles Cercle et Arc. */
export function radialGrid(g: PolyGrid, w: number, h: number): RadialGrid | null {
  if (g.kind === "circle") {
    const center = { x: w / 2, y: h / 2 };
    const r0 = Math.min(w, h) / 2;
    const corner = Math.hypot(w, h) / 2;
    const rings: number[] = [];
    if (g.a > 1) {
      const step = r0 / (g.a - 1);
      for (let k = 1; k * step <= corner + 1e-9; k++) rings.push(k * step);
    }
    const rays = Array.from({ length: g.b }, (_, j) => ({ x: Math.cos((2 * Math.PI * j) / g.b), y: Math.sin((2 * Math.PI * j) / g.b) }));
    return { center, rings, rays };
  }
  if (g.kind === "arc") {
    const center = { x: 0, y: h };
    const r0 = Math.min(w, h);
    const far = Math.hypot(w, h);
    const rings: number[] = [];
    if (g.a > 1) {
      const step = r0 / (g.a - 1);
      for (let k = 1; k * step <= far + 1e-9; k++) rings.push(k * step);
    }
    const rays = Array.from({ length: g.b + 1 }, (_, j) => {
      const phi = (Math.PI / 2) * (j / g.b);
      return { x: Math.cos(phi), y: -Math.sin(phi) };
    });
    return { center, rings, rays };
  }
  return null;
}

/** Tous les points de la grille. */
export function gridPoints(g: PolyGrid, w: number, h: number): Pt[] {
  const pts: Pt[] = [];
  switch (g.kind) {
    case "rect": {
      for (let i = 0; i <= g.a; i++) for (let j = 0; j <= g.b; j++) pts.push({ x: (w * i) / g.a, y: (h * j) / g.b });
      break;
    }
    case "circle":
    case "arc": {
      const rg = radialGrid(g, w, h) as RadialGrid;
      pts.push(rg.center, ...corners(w, h));
      for (const ray of rg.rays) {
        const edge = rayEdgePoint(rg.center, ray, w, h);
        if (edge) pts.push(edge);
        for (const r of rg.rings) {
          const p = { x: rg.center.x + ray.x * r, y: rg.center.y + ray.y * r };
          if (insideBox(p, w, h)) pts.push(p);
        }
      }
      for (const r of rg.rings) pts.push(...circleEdgePoints(rg.center, r, w, h));
      break;
    }
    case "star8": {
      const k = 2 + Math.SQRT2;
      const cx = w / k;
      const cy = h / k;
      const dTop = ((w - 2 * cx) * h) / (2 * w);
      const dSide = ((h - 2 * cy) * w) / (2 * h);
      pts.push(...corners(w, h));
      pts.push(
        { x: cx, y: 0 }, { x: w - cx, y: 0 }, { x: w, y: cy }, { x: w, y: h - cy },
        { x: w - cx, y: h }, { x: cx, y: h }, { x: 0, y: h - cy }, { x: 0, y: cy },
        { x: cx, y: cy }, { x: w - cx, y: cy }, { x: w - cx, y: h - cy }, { x: cx, y: h - cy },
        { x: w / 2, y: dTop }, { x: w - dSide, y: h / 2 }, { x: w / 2, y: h - dTop }, { x: dSide, y: h / 2 },
        { x: w / 2, y: h / 2 },
      );
      for (let i = 0; i <= g.a; i++) {
        for (let j = 0; j <= g.b; j++) {
          const x = (cx * i) / g.a;
          const y = (cy * j) / g.b;
          pts.push({ x, y }, { x: w - x, y }, { x, y: h - y }, { x: w - x, y: h - y });
        }
      }
      break;
    }
    case "kaleido": {
      pts.push({ x: w / 2, y: h / 2 }, ...corners(w, h));
      for (let k = 1; k <= g.a; k++) {
        const hx = (k / g.a) * (w / 2);
        const hy = (k / g.a) * (h / 2);
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            for (let j = 0; j <= g.b; j++) {
              // Le long de la verticale : de la médiane (j = 0) au coin ; le long de l'horizontale de même.
              pts.push({ x: w / 2 + sx * hx, y: h / 2 + sy * hy * (j / g.b) });
              pts.push({ x: w / 2 + sx * hx * (j / g.b), y: h / 2 + sy * hy });
            }
          }
        }
      }
      break;
    }
    case "octagon": {
      pts.push({ x: w / 2, y: h / 2 }, ...corners(w, h));
      const t = Math.SQRT2 - 1;
      for (let k = 1; k <= g.a; k++) {
        const hx = (k / g.a) * (w / 2);
        const hy = (k / g.a) * (h / 2);
        const sx = hx * t;
        const sy = hy * t;
        // Les 8 sommets, dans l'ordre autour de l'octogone.
        const verts: Pt[] = [
          { x: sx, y: -hy }, { x: hx, y: -sy }, { x: hx, y: sy }, { x: sx, y: hy },
          { x: -sx, y: hy }, { x: -hx, y: sy }, { x: -hx, y: -sy }, { x: -sx, y: -hy },
        ];
        for (let i = 0; i < 8; i++) {
          const p = verts[i] as Pt;
          const q = verts[(i + 1) % 8] as Pt;
          for (let j = 0; j < g.b; j++) pts.push({ x: w / 2 + p.x + ((q.x - p.x) * j) / g.b, y: h / 2 + p.y + ((q.y - p.y) * j) / g.b });
          // Le milieu de l'arête (les rayons y passent).
          pts.push({ x: w / 2 + (p.x + q.x) / 2, y: h / 2 + (p.y + q.y) / 2 });
        }
      }
      break;
    }
  }
  return dedupe(pts.filter((p) => insideBox(p, w, h)));
}

/** Le point de grille le plus proche de p (et la distance). */
export function nearestGridPoint(g: PolyGrid, w: number, h: number, p: Pt, points: readonly Pt[] = gridPoints(g, w, h)): { point: Pt; distance: number } {
  if (g.kind === "rect") {
    const q = { x: clean(Math.max(0, Math.min(w, Math.round((p.x / w) * g.a) * (w / g.a)))), y: clean(Math.max(0, Math.min(h, Math.round((p.y / h) * g.b) * (h / g.b)))) };
    return { point: q, distance: dist(p, q) };
  }
  let best = points[0] ?? { x: 0, y: 0 };
  let bestD = Infinity;
  for (const q of points) {
    const d = dist(p, q);
    if (d < bestD) {
      best = q;
      bestD = d;
    }
  }
  return { point: best, distance: bestD };
}

/** L'anneau de la grille (index et rayon) qui porte le point, ou `null`. */
function ringOf(rg: RadialGrid, p: Pt): number | null {
  const d = dist(rg.center, p);
  const i = rg.rings.findIndex((r) => Math.abs(r - d) <= 1e-6);
  return i >= 0 ? i : null;
}

/** L'arête entre deux points de grille : un arc de l'anneau s'ils sont sur le même anneau (PolyArc), une droite sinon. */
export function gridEdge(g: PolyGrid, w: number, h: number, a: Pt, b: Pt, arc: boolean, id: Id = createId()): Segment {
  const line: Segment = { id, kind: "line", a, b };
  if (!arc) return line;
  const rg = radialGrid(g, w, h);
  if (!rg) return line;
  const ra = ringOf(rg, a);
  const rb = ringOf(rg, b);
  if (ra === null || rb === null || ra !== rb) return line;
  const r = rg.rings[ra] as number;
  const chord = dist(a, b);
  if (chord < 1e-9) return line;
  const half = Math.min(chord / 2, r);
  const sag = r - Math.sqrt(Math.max(0, r * r - half * half));
  if (sag < 1e-7) return line;
  // L'arc le plus court : son sommet est du côté opposé au centre. Diamètre : on tourne dans le sens des angles croissants.
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const nx = -(b.y - a.y) / chord;
  const ny = (b.x - a.x) / chord;
  const side = (rg.center.x - mid.x) * nx + (rg.center.y - mid.y) * ny;
  const sign = Math.abs(side) < 1e-9 ? 1 : side > 0 ? -1 : 1;
  return { id, kind: "arc", a, b, sagitta: clean(sign * sag) };
}

/** Le contour fermé qui relie les nœuds dans l'ordre. */
export function polyLoop(g: PolyGrid, w: number, h: number, nodes: readonly Pt[], arc: boolean): Segment[] {
  return nodes.map((p, i) => gridEdge(g, w, h, p, nodes[(i + 1) % nodes.length] as Pt, arc));
}

/** Angle (degrés) de la rotation propre à la grille, pour « cloner et pivoter ». */
export function gridRotation(g: PolyGrid): number {
  switch (g.kind) {
    case "rect":
      return 90;
    case "circle":
      return 360 / g.b;
    case "arc":
      return 90 / g.b;
    default:
      return 45;
  }
}

/** Le point autour duquel la grille tourne. */
export function gridPivot(g: PolyGrid, w: number, h: number): Pt {
  return g.kind === "arc" ? { x: 0, y: h } : { x: w / 2, y: h / 2 };
}

// ---------------------------------------------------------------------------------------------------------------
// Opérations sur les pièces

export function addPolyPiece(state: PolyState, edges: readonly Segment[]): PolyState {
  if (edges.length < 2) return state;
  const piece: PolyPiece = { id: createId(), edges: edges.map(cleanSegment) };
  if (Math.abs(areaAndCentroid(piece.edges).area) < 1e-9) return state;
  return { ...state, pieces: [...state.pieces, piece] };
}

export function deletePolyPieces(state: PolyState, ids: ReadonlySet<Id>): PolyState {
  return state.pieces.some((p) => ids.has(p.id)) ? { ...state, pieces: state.pieces.filter((p) => !ids.has(p.id)) } : state;
}

function mapEdges(edges: readonly Segment[], map: (p: Pt) => Pt, flip: boolean, scale = 1): Segment[] {
  return edges.map((e) =>
    e.kind === "line"
      ? { id: e.id, kind: "line" as const, a: cleanPt(map(e.a)), b: cleanPt(map(e.b)) }
      : { id: e.id, kind: "arc" as const, a: cleanPt(map(e.a)), b: cleanPt(map(e.b)), sagitta: clean((flip ? -e.sagitta : e.sagitta) * scale) },
  );
}

export function movePolyPieces(state: PolyState, ids: ReadonlySet<Id>, dx: number, dy: number): PolyState {
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return state;
  return { ...state, pieces: state.pieces.map((p) => (ids.has(p.id) ? { ...p, edges: mapEdges(p.edges, (q) => ({ x: q.x + dx, y: q.y + dy }), false) } : p)) };
}

export type PolyMirror = "lr" | "tb";

export function mirrorPolyPieces(state: PolyState, ids: ReadonlySet<Id>, axis: PolyMirror, w: number, h: number): PolyState {
  const map = axis === "lr" ? (p: Pt): Pt => ({ x: w - p.x, y: p.y }) : (p: Pt): Pt => ({ x: p.x, y: h - p.y });
  return { ...state, pieces: state.pieces.map((p) => (ids.has(p.id) ? { ...p, edges: mapEdges(p.edges, map, true) } : p)) };
}

/** Clone les pièces (posées par-dessus, au même endroit) ; si `rotate`, la copie est pivotée de l'angle propre à la grille. */
export function clonePolyPieces(state: PolyState, ids: ReadonlySet<Id>, w: number, h: number, rotate: boolean): { state: PolyState; ids: Id[] } {
  const copies: PolyPiece[] = [];
  const angle = (gridRotation(state.grid) * Math.PI) / 180;
  const pivot = gridPivot(state.grid, w, h);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const map = rotate ? (p: Pt): Pt => ({ x: pivot.x + (p.x - pivot.x) * cos - (p.y - pivot.y) * sin, y: pivot.y + (p.x - pivot.x) * sin + (p.y - pivot.y) * cos }) : (p: Pt): Pt => p;
  for (const p of state.pieces) {
    if (!ids.has(p.id)) continue;
    copies.push({ id: createId(), edges: mapEdges(p.edges, map, false).map((e, i) => ({ ...e, id: `${p.id}.${i}.c` })) });
  }
  return { state: { ...state, pieces: [...state.pieces, ...copies] }, ids: copies.map((c) => c.id) };
}

/** Met les pièces à l'échelle (fx, fy) : la grille, elle, se recalcule sur la nouvelle taille du bloc. */
export function scalePoly(state: PolyState, fx: number, fy: number): PolyState {
  if (state.pieces.length === 0 || (Math.abs(fx - 1) < 1e-12 && Math.abs(fy - 1) < 1e-12)) return state;
  const k = Math.hypot(fx, fy) / Math.SQRT2;
  return {
    ...state,
    pieces: state.pieces.map((p) => ({
      ...p,
      edges: p.edges.map((e) =>
        e.kind === "line"
          ? { id: e.id, kind: "line" as const, a: cleanPt({ x: e.a.x * fx, y: e.a.y * fy }), b: cleanPt({ x: e.b.x * fx, y: e.b.y * fy }) }
          : { id: e.id, kind: "arc" as const, a: cleanPt({ x: e.a.x * fx, y: e.a.y * fy }), b: cleanPt({ x: e.b.x * fx, y: e.b.y * fy }), sagitta: clean(e.sagitta * k) },
      ),
    })),
  };
}

export function polyNodes(piece: PolyPiece): Pt[] {
  return piece.edges.map((e) => e.a);
}

/** Déplace un nœud (vers un point de grille) : les deux arêtes voisines sont recalculées (un arc reste un arc s'il le peut). */
export function movePolyNode(state: PolyState, id: Id, node: number, to: Pt, w: number, h: number): PolyState {
  const piece = state.pieces.find((p) => p.id === id);
  if (!piece || node < 0 || node >= piece.edges.length) return state;
  const pts = polyNodes(piece).map((p, i) => (i === node ? to : p));
  const edges = pts.map((p, i) => {
    const old = piece.edges[i] as Segment;
    return gridEdge(state.grid, w, h, p, pts[(i + 1) % pts.length] as Pt, old.kind === "arc", old.id);
  });
  if (Math.abs(areaAndCentroid(edges).area) < 1e-9) return state;
  return { ...state, pieces: state.pieces.map((p) => (p.id === id ? { ...p, edges } : p)) };
}

/** Ajoute un nœud au milieu de l'arête `edge`, au point `at` (un point de la grille sur l'arête, ou son milieu). */
export function addPolyNode(state: PolyState, id: Id, edge: number, at: Pt, w: number, h: number): PolyState {
  const piece = state.pieces.find((p) => p.id === id);
  if (!piece || edge < 0 || edge >= piece.edges.length) return state;
  const old = piece.edges[edge] as Segment;
  if (samePoint(old.a, at) || samePoint(old.b, at)) return state;
  const arc = old.kind === "arc";
  const first = gridEdge(state.grid, w, h, old.a, at, arc, old.id);
  const second = gridEdge(state.grid, w, h, at, old.b, arc);
  const edges = [...piece.edges.slice(0, edge), first, second, ...piece.edges.slice(edge + 1)];
  return { ...state, pieces: state.pieces.map((p) => (p.id === id ? { ...p, edges } : p)) };
}

export function deletePolyNode(state: PolyState, id: Id, node: number, w: number, h: number): PolyState {
  const piece = state.pieces.find((p) => p.id === id);
  if (!piece || piece.edges.length <= 3) return state;
  const pts = polyNodes(piece).filter((_, i) => i !== node);
  const arc = piece.edges.some((e) => e.kind === "arc");
  const edges = polyLoop(state.grid, w, h, pts, arc);
  return { ...state, pieces: state.pieces.map((p) => (p.id === id ? { ...p, edges } : p)) };
}

/** Change de grille ou de compteurs en cours de dessin : les pièces déjà dessinées restent. */
export function setGrid(state: PolyState, grid: PolyGrid): PolyState {
  const next = clampGrid(grid);
  return next.kind === state.grid.kind && next.a === state.grid.a && next.b === state.grid.b ? state : { ...state, grid: next };
}

export function polyBounds(p: PolyPiece): Rect | null {
  return unionBounds(p.edges.map(boundsOf));
}

/** La pièce sous le point (la plus petite), ou la pièce dont un bord est à `tol` du point. */
export function polyPieceAt(state: PolyState, p: Pt, tol: number): Id | null {
  const pieces = polyContent(state.pieces).pieces;
  let best: { id: Id; area: number } | null = null;
  state.pieces.forEach((pp, i) => {
    const piece = pieces[i];
    if (!piece) return;
    const b = piece.bounds;
    if (p.x < b.x0 - tol || p.x > b.x1 + tol || p.y < b.y0 - tol || p.y > b.y1 + tol) return;
    let near = false;
    for (const e of pp.edges) {
      if (distanceToEdge(e, p) <= tol) {
        near = true;
        break;
      }
    }
    const inside = insideConvexOrNot(piece.polygon, p);
    if (!near && !inside) return;
    if (!best || piece.area < best.area) best = { id: pp.id, area: piece.area };
  });
  return (best as { id: Id } | null)?.id ?? null;
}

function insideConvexOrNot(poly: readonly Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Pt;
    const b = poly[j] as Pt;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToEdge(e: Segment, p: Pt): number {
  if (e.kind === "line") {
    const dx = e.b.x - e.a.x;
    const dy = e.b.y - e.a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - e.a.x) * dx + (p.y - e.a.y) * dy) / len2));
    return dist(p, { x: e.a.x + dx * t, y: e.a.y + dy * t });
  }
  const g = arcGeometry(e.a, e.b, e.sagitta);
  const ang = Math.atan2(p.y - g.center.y, p.x - g.center.x);
  const full = 2 * Math.PI;
  const sign = Math.sign(g.sweep) || 1;
  const delta = (((ang - g.startAngle) * sign) % full + full) % full;
  if (delta <= Math.abs(g.sweep)) return Math.abs(dist(p, g.center) - g.radius);
  return Math.min(dist(p, e.a), dist(p, e.b));
}

// ---------------------------------------------------------------------------------------------------------------
// Pièces détectées

export interface PolyContent {
  pieces: Piece[];
  /** Aire couverte / aire du bloc (1 = bloc rempli). */
  coverage: number;
  /** Vrai si deux pièces se recouvrent (la somme des aires dépasse celle du bloc). */
  overlap: boolean;
}

const edgeKey = (s: Segment): string => {
  const r = (v: number) => Math.round(v * 1e5);
  const fw = `${r(s.a.x)},${r(s.a.y)}`;
  const bw = `${r(s.b.x)},${r(s.b.y)}`;
  const sag = s.kind === "arc" ? r(s.sagitta) : 0;
  return fw <= bw ? `${s.kind}|${fw}|${bw}|${sag}` : `${s.kind}|${bw}|${fw}|${-sag}`;
};

export function polyContent(pieces: readonly PolyPiece[], width = 0, height = 0): PolyContent {
  const out: Piece[] = [];
  const seen = new Map<string, number>();
  const owners = new Map<string, string[]>();
  for (const pp of pieces) {
    const piece = pieceFromBoundary(pp.edges, "y");
    if (!piece) continue;
    const n = seen.get(piece.key) ?? 0;
    seen.set(piece.key, n + 1);
    if (n > 0) piece.key = `${piece.key}-${n + 1}`;
    out.push(piece);
    for (const e of piece.boundary) {
      const k = edgeKey(e);
      const list = owners.get(k);
      if (list) list.push(piece.key);
      else owners.set(k, [piece.key]);
    }
  }
  // Voisines : les pièces qui partagent une arête.
  const byKey = new Map(out.map((p) => [p.key, p]));
  for (const list of owners.values()) {
    for (const a of list) for (const b of list) if (a !== b && !(byKey.get(a) as Piece).neighbors.includes(b)) (byKey.get(a) as Piece).neighbors.push(b);
  }
  const total = out.reduce((s, p) => s + p.area, 0);
  const block = width * height;
  return { pieces: out, coverage: block > 0 ? Math.min(1, total / block) : 0, overlap: block > 0 && total > block + 1e-6 };
}
