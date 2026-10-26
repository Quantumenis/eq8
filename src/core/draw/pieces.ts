// Détection des pièces d'un bloc EasyDraw (SPEC §6.2, §6.7).
// 1. Planarisation : les segments et le contour du bloc sont coupés à chaque intersection (droite-droite, droite-arc,
//    arc-arc) et à chaque extrémité posée sur un autre segment ; les sommets proches sont fusionnés.
// 2. Nettoyage (Q-6.1) : les arêtes pendantes sont retirées de façon itérative, puis seule la composante connexe du
//    contour est gardée. Un îlot qui ne touche le reste que par un sommet fait partie de cette composante : il reste.
// 3. Extraction des faces : chaque face bornée est une pièce (contour exact, arcs compris), avec ses voisines.

import { sha256Hex } from "../hash";
import { createId } from "../project/model";
import {
  arcGeometry,
  boundsOf,
  clean,
  cleanPt,
  dist,
  insideRect,
  project,
  subSegment,
  unionBounds,
  type Pt,
  type Rect,
  type Segment,
} from "./geometry";
import { intersect } from "./intersect";

/** Deux sommets plus proches que cela n'en font qu'un (pouces). */
export const MERGE_TOLERANCE = 1e-6;
/** Écart maximal entre un arc et la polyligne qui l'approche (test de clic, aires approchées). */
const FLATTEN_TOLERANCE = 1e-3;

export interface Piece {
  /** Clé stable de la pièce, tirée de sa géométrie : c'est la clé de `Coloring.fills`. */
  key: string;
  /** Contour fermé, segments bout à bout, sens direct (aire positive dans le repère du bloc). */
  boundary: Segment[];
  area: number;
  centroid: Pt;
  bounds: Rect;
  /** Contour aplati (arcs approchés à 10⁻³ po près), pour les tests de clic. */
  polygon: Pt[];
  /** Clés des pièces qui partagent une arête avec celle-ci. */
  neighbors: string[];
  /** Trous (texte, applique) : contours fermés de sens inverse, et leur aplati. Absents pour une pièce sans trou. */
  holes?: Segment[][];
  holePolygons?: Pt[][];
  /** Rang d'empilement (applique) : une pièce de rang supérieur recouvre les autres. Absent pour les pièces à plat. */
  stack?: number;
}

export interface PieceAnalysis {
  pieces: Piece[];
  /** Le dessin nettoyé : les arêtes planaires hors contour, dans l'ordre des segments d'origine. */
  segments: Segment[];
  /** Segments d'origine entièrement retirés (pendants, îlots, hors du bloc). */
  removed: Segment[];
  /** Segments d'origine dont une partie seulement a été retirée (un bout qui dépasse). */
  trimmed: Segment[];
  /** Vrai si le dessin nettoyé diffère du dessin reçu (coupures aux intersections comprises). */
  changed: boolean;
  /** Graphe planaire final, contour compris. */
  stats: { vertices: number; edges: number; components: number; faces: number };
}

interface Edge {
  u: number;
  v: number;
  /** Géométrie de u vers v. */
  seg: Segment;
  /** Indice du segment d'origine (les 4 premiers sont le contour). */
  source: number;
  /** Position sur le segment d'origine, pour l'ordre du dessin nettoyé. */
  t: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Sommets

class VertexTable {
  readonly points: Pt[] = [];
  private readonly cells = new Map<string, number[]>();

  private cellOf(p: Pt): [number, number] {
    return [Math.floor(p.x / MERGE_TOLERANCE), Math.floor(p.y / MERGE_TOLERANCE)];
  }

  /** Le sommet à moins de MERGE_TOLERANCE de p, ou un nouveau sommet. */
  find(p: Pt): number {
    const [cx, cy] = this.cellOf(p);
    let best = -1;
    let bestD = MERGE_TOLERANCE;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const index of this.cells.get(`${cx + i},${cy + j}`) ?? []) {
          const d = dist(this.points[index] as Pt, p);
          if (d <= bestD) {
            best = index;
            bestD = d;
          }
        }
      }
    }
    if (best >= 0) return best;
    const index = this.points.length;
    this.points.push(cleanPt(p));
    const key = `${cx},${cy}`;
    const cell = this.cells.get(key);
    if (cell) cell.push(index);
    else this.cells.set(key, [index]);
    return index;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Géométrie des arêtes

function reverse(seg: Segment): Segment {
  return seg.kind === "line"
    ? { id: seg.id, kind: "line", a: seg.b, b: seg.a }
    : { id: seg.id, kind: "arc", a: seg.b, b: seg.a, sagitta: -seg.sagitta };
}

/** Direction de départ (unitaire) d'un segment en A, et sa courbure signée (positive si elle tourne vers les angles croissants). */
function departure(seg: Segment): { angle: number; curvature: number } {
  if (seg.kind === "line") return { angle: Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x), curvature: 0 };
  const g = arcGeometry(seg.a, seg.b, seg.sagitta);
  const s = Math.sign(g.sweep) || 1;
  const tx = (-(seg.a.y - g.center.y) / g.radius) * s;
  const ty = ((seg.a.x - g.center.x) / g.radius) * s;
  // Le cercle tourne vers les angles croissants si le centre est du côté de la normale (−ty, tx).
  const side = (g.center.x - seg.a.x) * -ty + (g.center.y - seg.a.y) * tx;
  return { angle: Math.atan2(ty, tx), curvature: (side > 0 ? 1 : -1) / g.radius };
}

/** Angle ramené dans [−π, π[ : vers la gauche, −π et π sont la même direction. */
function normalAngle(angle: number): number {
  return angle > Math.PI - 1e-9 ? angle - 2 * Math.PI : angle;
}

/** Contribution d'un segment orienté à ½∮(x dy − y dx) : l'aire signée d'un contour est la somme de ces termes. */
function greenTerm(seg: Segment): number {
  if (seg.kind === "line") return (seg.a.x * seg.b.y - seg.b.x * seg.a.y) / 2;
  const g = arcGeometry(seg.a, seg.b, seg.sagitta);
  const p0 = g.startAngle;
  const p1 = g.startAngle + g.sweep;
  const { x: cx, y: cy } = g.center;
  const r = g.radius;
  return (r * (cx * (Math.sin(p1) - Math.sin(p0)) - cy * (Math.cos(p1) - Math.cos(p0))) + r * r * g.sweep) / 2;
}

/** Aire signée et centre de gravité exacts d'un contour fait de droites et d'arcs de cercle. */
export function areaAndCentroid(boundary: readonly Segment[]): { area: number; centroid: Pt } {
  let area = 0;
  let mx = 0;
  let my = 0;
  for (const seg of boundary) {
    // Le polygone des cordes.
    const cross = seg.a.x * seg.b.y - seg.b.x * seg.a.y;
    area += cross / 2;
    mx += ((seg.a.x + seg.b.x) * cross) / 6;
    my += ((seg.a.y + seg.b.y) * cross) / 6;
    if (seg.kind === "arc") {
      // Le segment circulaire entre la corde et l'arc, ajouté ou retiré selon le sens.
      const g = arcGeometry(seg.a, seg.b, seg.sagitta);
      const chordTerm = cross / 2;
      const extra = greenTerm(seg) - chordTerm;
      const alpha = Math.abs(g.sweep) / 2;
      const denom = 2 * alpha - Math.sin(2 * alpha);
      const d = denom > 1e-15 ? (4 * g.radius * Math.sin(alpha) ** 3) / (3 * denom) : g.radius;
      const ux = g.apex.x - g.center.x;
      const uy = g.apex.y - g.center.y;
      const len = Math.hypot(ux, uy) || 1;
      area += extra;
      mx += extra * (g.center.x + (ux / len) * d);
      my += extra * (g.center.y + (uy / len) * d);
    }
  }
  const centroid = Math.abs(area) > 1e-15 ? { x: mx / area, y: my / area } : { x: 0, y: 0 };
  return { area, centroid };
}

export function flatten(boundary: readonly Segment[]): Pt[] {
  const out: Pt[] = [];
  for (const seg of boundary) {
    out.push(seg.a);
    if (seg.kind !== "arc") continue;
    const g = arcGeometry(seg.a, seg.b, seg.sagitta);
    const step = 2 * Math.acos(Math.max(-1, 1 - FLATTEN_TOLERANCE / g.radius));
    const n = Math.min(256, Math.max(2, Math.ceil(Math.abs(g.sweep) / Math.max(step, 1e-6))));
    for (let i = 1; i < n; i++) {
      const ang = g.startAngle + (g.sweep * i) / n;
      out.push({ x: g.center.x + g.radius * Math.cos(ang), y: g.center.y + g.radius * Math.sin(ang) });
    }
  }
  return out;
}

function edgeToken(seg: Segment): string {
  const p = `${clean(seg.a.x)},${clean(seg.a.y)}`;
  return seg.kind === "line" ? `L${p}` : `A${p},${clean(seg.sagitta)}`;
}

/** Écriture complète d'un segment (extrémités et flèche), sans son identifiant. */
export function segmentText(seg: Segment): string {
  return `${edgeToken(seg)}>${clean(seg.b.x)},${clean(seg.b.y)}`;
}

/** Contour remis dans un ordre canonique (rotation de plus petite écriture) et clé tirée de cette écriture. */
export function canonical(boundary: Segment[]): { boundary: Segment[]; key: string } {
  const tokens = boundary.map(edgeToken);
  let best = 0;
  let bestText = tokens.join(";");
  for (let i = 1; i < tokens.length; i++) {
    const text = [...tokens.slice(i), ...tokens.slice(0, i)].join(";");
    if (text < bestText) {
      best = i;
      bestText = text;
    }
  }
  const rotated = [...boundary.slice(best), ...boundary.slice(0, best)];
  return { boundary: rotated, key: `p${sha256Hex(new TextEncoder().encode(bestText)).slice(0, 16)}` };
}

// ---------------------------------------------------------------------------------------------------------------
// Analyse

function outline(width: number, height: number): Segment[] {
  const c = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  return c.map((a, i) => ({ id: `outline-${i}`, kind: "line" as const, a, b: c[(i + 1) % 4] as Pt }));
}

function boxesTouch(p: Rect, q: Rect, tol: number): boolean {
  return p.x0 <= q.x1 + tol && q.x0 <= p.x1 + tol && p.y0 <= q.y1 + tol && q.y0 <= p.y1 + tol;
}

function sameGeometry(p: Segment, q: Segment): boolean {
  if (p.kind !== q.kind) return false;
  if (p.kind === "line") return true; // mêmes extrémités : même droite
  const ap = arcGeometry(p.a, p.b, p.sagitta).apex;
  const aq = arcGeometry(q.a, q.b, (q as Extract<Segment, { kind: "arc" }>).sagitta).apex;
  return dist(ap, aq) <= MERGE_TOLERANCE * 10;
}

/**
 * Analyse un dessin EasyDraw : graphe planaire, nettoyage et pièces. Le contour du bloc (0,0)-(width,height) n'est
 * jamais coupé ni retiré ; les segments qui en sortent sont retirés.
 */
export function analyzeBlock(width: number, height: number, segments: readonly Segment[]): PieceAnalysis {
  const border = outline(width, height);
  const outside: Segment[] = [];
  const inputs: Segment[] = [];
  for (const seg of segments) {
    if (dist(seg.a, seg.b) <= MERGE_TOLERANCE || !insideRect(boundsOf(seg), width, height)) outside.push(seg);
    else inputs.push(seg);
  }
  const all = [...border, ...inputs];
  const boxes = all.map(boundsOf);

  // Sommets : les extrémités d'abord (ce sont des valeurs propres), puis les intersections.
  const vertices = new VertexTable();
  const splits: { t: number; v: number }[][] = all.map((seg) => [
    { t: 0, v: vertices.find(seg.a) },
    { t: 1, v: vertices.find(seg.b) },
  ]);
  for (let i = 0; i < all.length; i++) {
    const p = all[i] as Segment;
    for (let j = i + 1; j < all.length; j++) {
      const q = all[j] as Segment;
      if (!boxesTouch(boxes[i] as Rect, boxes[j] as Rect, MERGE_TOLERANCE)) continue;
      for (const c of intersect(p, q)) {
        const v = vertices.find(c.point);
        splits[i]?.push({ t: c.t, v });
        splits[j]?.push({ t: c.u, v });
      }
      // Extrémité posée sur l'autre segment (jonction en T, droites superposées, arcs d'un même cercle).
      for (const [host, other, hostIndex] of [
        [p, q, i],
        [q, p, j],
      ] as const) {
        for (const end of [other.a, other.b]) {
          const pr = project(host, end);
          if (pr.distance <= MERGE_TOLERANCE && pr.t > 0 && pr.t < 1) splits[hostIndex]?.push({ t: pr.t, v: vertices.find(end) });
        }
      }
    }
  }

  // Arêtes : chaque segment coupé entre ses sommets successifs ; les doublons ne sont gardés qu'une fois.
  const edges: Edge[] = [];
  const byPair = new Map<string, number[]>();
  const piecesPerSource = new Map<number, number>();
  all.forEach((seg, source) => {
    const list = [...(splits[source] ?? [])].sort((x, y) => x.t - y.t);
    const chain: { t: number; v: number }[] = [];
    for (const s of list) {
      const last = chain.at(-1);
      if (last && last.v === s.v) continue;
      chain.push(s);
    }
    for (let k = 0; k + 1 < chain.length; k++) {
      const from = chain[k] as { t: number; v: number };
      const to = chain[k + 1] as { t: number; v: number };
      if (from.v === to.v) continue;
      const a = vertices.points[from.v] as Pt;
      const b = vertices.points[to.v] as Pt;
      let piece: Segment;
      if (chain.length === 2) {
        piece = { ...seg, a, b }; // segment entier : il garde son identifiant et sa flèche
      } else if (seg.kind === "line") {
        piece = { id: createId(), kind: "line", a, b };
      } else {
        const sub = subSegment(seg, from.t, to.t, createId()) as Extract<Segment, { kind: "arc" }>;
        piece = { id: sub.id, kind: "arc", a, b, sagitta: clean(sub.sagitta) };
      }
      const key = from.v < to.v ? `${from.v}-${to.v}` : `${to.v}-${from.v}`;
      const twins = byPair.get(key) ?? [];
      const oriented = (e: Edge) => (e.u === from.v ? e.seg : reverse(e.seg));
      if (twins.some((index) => sameGeometry(oriented(edges[index] as Edge), piece))) continue;
      twins.push(edges.length);
      byPair.set(key, twins);
      edges.push({ u: from.v, v: to.v, seg: piece, source, t: from.t });
      piecesPerSource.set(source, (piecesPerSource.get(source) ?? 0) + 1);
    }
  });

  // Nettoyage : arêtes pendantes, puis composante du contour.
  const alive = edges.map(() => true);
  const incident: number[][] = vertices.points.map(() => []);
  edges.forEach((e, index) => {
    incident[e.u]?.push(index);
    incident[e.v]?.push(index);
  });
  const degree = incident.map((list) => list.length);
  const queue: number[] = [];
  degree.forEach((d, v) => d === 1 && queue.push(v));
  while (queue.length > 0) {
    const v = queue.pop() as number;
    if (degree[v] !== 1) continue;
    const index = (incident[v] ?? []).find((e) => alive[e]);
    if (index === undefined) continue;
    alive[index] = false;
    const e = edges[index] as Edge;
    for (const w of [e.u, e.v]) {
      degree[w] = (degree[w] ?? 0) - 1;
      if (degree[w] === 1) queue.push(w);
    }
  }
  const start = edges.findIndex((e, index) => e.source === 0 && alive[index]);
  const reached = new Set<number>();
  if (start >= 0) {
    const stack = [(edges[start] as Edge).u];
    reached.add(stack[0] as number);
    while (stack.length > 0) {
      const v = stack.pop() as number;
      for (const index of incident[v] ?? []) {
        if (!alive[index]) continue;
        const e = edges[index] as Edge;
        const w = e.u === v ? e.v : e.u;
        if (!reached.has(w)) {
          reached.add(w);
          stack.push(w);
        }
      }
    }
  }
  edges.forEach((e, index) => {
    if (alive[index] && !reached.has(e.u)) alive[index] = false;
  });
  const kept = edges.filter((_, index) => alive[index]);

  // Faces : demi-arêtes triées par angle de départ autour de chaque sommet.
  const half: { from: number; to: number; seg: Segment; edge: number }[] = [];
  kept.forEach((e, index) => {
    half.push({ from: e.u, to: e.v, seg: e.seg, edge: index });
    half.push({ from: e.v, to: e.u, seg: reverse(e.seg), edge: index });
  });
  const around = new Map<number, { h: number; angle: number; curvature: number }[]>();
  half.forEach((h, index) => {
    const d = departure(h.seg);
    const list = around.get(h.from) ?? [];
    list.push({ h: index, angle: normalAngle(d.angle), curvature: d.curvature });
    around.set(h.from, list);
  });
  const position = new Map<number, number>();
  for (const list of around.values()) {
    list.sort((p, q) => (Math.abs(p.angle - q.angle) > 1e-9 ? p.angle - q.angle : p.curvature - q.curvature));
    list.forEach((item, i) => position.set(item.h, i));
  }
  const next = (h: number): number => {
    const twin = h ^ 1;
    const list = around.get(half[twin]?.from as number) as { h: number }[];
    const i = position.get(twin) as number;
    return (list[(i - 1 + list.length) % list.length] as { h: number }).h;
  };

  const faceOf = new Array<number>(half.length).fill(-1);
  const cycles: { halves: number[]; area: number }[] = [];
  for (let h0 = 0; h0 < half.length; h0++) {
    if (faceOf[h0] !== -1) continue;
    const halves: number[] = [];
    let h = h0;
    while (faceOf[h] === -1) {
      faceOf[h] = cycles.length;
      halves.push(h);
      h = next(h);
    }
    const area = halves.reduce((sum, k) => sum + greenTerm((half[k] as { seg: Segment }).seg), 0);
    cycles.push({ halves, area });
  }

  const pieces: Piece[] = [];
  const pieceOfCycle = new Map<number, number>();
  cycles.forEach((cycle, index) => {
    if (cycle.area <= 1e-12) return; // le contour extérieur (aire négative) et les cycles dégénérés
    const { boundary, key } = canonical(cycle.halves.map((k) => (half[k] as { seg: Segment }).seg));
    const { area, centroid } = areaAndCentroid(boundary);
    pieceOfCycle.set(index, pieces.length);
    pieces.push({
      key,
      boundary,
      area,
      centroid,
      bounds: unionBounds(boundary.map(boundsOf)) as Rect,
      polygon: flatten(boundary),
      neighbors: [],
    });
  });
  // Deux pièces de même clé (contours identiques) sont impossibles dans un graphe planaire ; par sécurité on les distingue.
  const seen = new Map<string, number>();
  for (const piece of pieces) {
    const n = seen.get(piece.key) ?? 0;
    seen.set(piece.key, n + 1);
    if (n > 0) piece.key = `${piece.key}-${n + 1}`;
  }
  kept.forEach((_, index) => {
    const f1 = pieceOfCycle.get(faceOf[2 * index] as number);
    const f2 = pieceOfCycle.get(faceOf[2 * index + 1] as number);
    if (f1 === undefined || f2 === undefined || f1 === f2) return;
    const p1 = pieces[f1] as Piece;
    const p2 = pieces[f2] as Piece;
    if (!p1.neighbors.includes(p2.key)) p1.neighbors.push(p2.key);
    if (!p2.neighbors.includes(p1.key)) p2.neighbors.push(p1.key);
  });

  // Le dessin nettoyé, et ce qui a été retiré.
  const cleaned = kept
    .filter((e) => e.source >= border.length)
    .sort((p, q) => p.source - q.source || p.t - q.t)
    .map((e) => e.seg);
  const keptPerSource = new Map<number, number>();
  for (const e of kept) keptPerSource.set(e.source, (keptPerSource.get(e.source) ?? 0) + 1);
  const removed: Segment[] = [...outside];
  const trimmed: Segment[] = [];
  inputs.forEach((seg, i) => {
    const source = i + border.length;
    const total = piecesPerSource.get(source) ?? 0;
    const left = keptPerSource.get(source) ?? 0;
    if (total > 0 && left === 0) removed.push(seg);
    else if (left > 0 && left < total) trimmed.push(seg);
  });
  const changed = cleaned.length !== segments.length || cleaned.some((seg, i) => segmentText(seg) !== segmentText(segments[i] as Segment));

  return {
    pieces,
    segments: cleaned,
    removed,
    trimmed,
    changed,
    stats: { vertices: reached.size, edges: kept.length, components: start >= 0 ? 1 : 0, faces: cycles.length },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Utilisation des pièces

function insidePolygon(polygon: readonly Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i] as Pt;
    const b = polygon[j] as Pt;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * La pièce sous le point p, ou `null`. Les pièces empilées (applique) : la plus haute. Sinon, la plus petite si
 * plusieurs se recouvrent à cause de l'aplatissement.
 */
export function pieceAt(pieces: readonly Piece[], p: Pt): Piece | null {
  let best: Piece | null = null;
  for (const piece of pieces) {
    const b = piece.bounds;
    if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) continue;
    if (!insidePolygon(piece.polygon, p)) continue;
    if (piece.holePolygons?.some((h) => insidePolygon(h, p))) continue;
    if (!best) best = piece;
    else if (piece.stack !== undefined || best.stack !== undefined) {
      if ((piece.stack ?? -1) >= (best.stack ?? -1)) best = piece;
    } else if (piece.area < best.area) best = piece;
  }
  return best;
}

/** Un point bien à l'intérieur de la pièce (pour cliquer dessus) : le centre de gravité s'il y est, sinon un point voisin. */
export function interiorPoint(piece: Piece): Pt {
  const inHole = (p: Pt) => piece.holePolygons?.some((h) => insidePolygon(h, p)) ?? false;
  if (insidePolygon(piece.polygon, piece.centroid) && !inHole(piece.centroid)) return piece.centroid;
  // Pièce concave ou trouée : on balaie l'horizontale du centre de gravité et on prend le milieu du plus long intervalle intérieur.
  const y = piece.centroid.y;
  const xs: number[] = [];
  for (const poly of [piece.polygon, ...(piece.holePolygons ?? [])]) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i] as Pt;
      const b = poly[j] as Pt;
      if (a.y > y !== b.y > y) xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
    }
  }
  xs.sort((p, q) => p - q);
  let best = { x: piece.centroid.x, y, w: -1 };
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const w = (xs[k + 1] as number) - (xs[k] as number);
    if (w > best.w) best = { x: ((xs[k] as number) + (xs[k + 1] as number)) / 2, y, w };
  }
  return { x: best.x, y: best.y };
}

/** Tracé SVG (attribut `d`) du contour d'une pièce, arcs exacts. Les trous suivent, de sens inverse. */
export function piecePath(piece: Pick<Piece, "boundary" | "holes">): string {
  const f = (v: number) => String(Math.round(v * 1e6) / 1e6);
  const loop = (boundary: readonly Segment[]): string => {
    const first = boundary[0];
    if (!first) return "";
    let d = `M${f(first.a.x)} ${f(first.a.y)}`;
    for (const seg of boundary) {
      if (seg.kind === "line") d += `L${f(seg.b.x)} ${f(seg.b.y)}`;
      else {
        const g = arcGeometry(seg.a, seg.b, seg.sagitta);
        d += `A${f(g.radius)} ${f(g.radius)} 0 ${Math.abs(g.sweep) > Math.PI ? 1 : 0} ${g.sweep > 0 ? 1 : 0} ${f(seg.b.x)} ${f(seg.b.y)}`;
      }
    }
    return `${d}Z`;
  };
  return [loop(piece.boundary), ...(piece.holes ?? []).map(loop)].join("");
}

/** Contour inversé (sens opposé, arcs compris) : sert aux trous. */
export function reverseBoundary(boundary: readonly Segment[]): Segment[] {
  return [...boundary].reverse().map((s) =>
    s.kind === "line" ? { id: s.id, kind: "line" as const, a: s.b, b: s.a } : { id: s.id, kind: "arc" as const, a: s.b, b: s.a, sagitta: -s.sagitta },
  );
}

/**
 * Une pièce à partir d'un contour fermé (applique, PolyDraw, texte) : orientation directe, clé tirée de la géométrie
 * (`prefix` la distingue des pièces EasyDraw). `holes` sont des contours fermés intérieurs, quel que soit leur sens.
 */
export function pieceFromBoundary(boundary: readonly Segment[], prefix = "p", holes: readonly (readonly Segment[])[] = []): Piece | null {
  if (boundary.length < 1) return null;
  let outer = [...boundary];
  let { area } = areaAndCentroid(outer);
  if (Math.abs(area) < 1e-10) return null;
  if (area < 0) {
    outer = reverseBoundary(outer);
    area = -area;
  }
  const keyed = canonical(outer);
  const rest = areaAndCentroid(keyed.boundary);
  const inner = holes
    .map((h) => {
      const a = areaAndCentroid(h).area;
      return a > 0 ? reverseBoundary(h) : [...h];
    })
    .filter((h) => h.length > 0);
  const holeArea = inner.reduce((sum, h) => sum + Math.abs(areaAndCentroid(h).area), 0);
  const piece: Piece = {
    key: prefix === "p" ? keyed.key : `${prefix}${keyed.key.slice(1)}`,
    boundary: keyed.boundary,
    area: rest.area - holeArea,
    centroid: rest.centroid,
    bounds: unionBounds(keyed.boundary.map(boundsOf)) as Rect,
    polygon: flatten(keyed.boundary),
    neighbors: [],
  };
  if (inner.length > 0) {
    piece.holes = inner;
    piece.holePolygons = inner.map(flatten);
  }
  return piece;
}
