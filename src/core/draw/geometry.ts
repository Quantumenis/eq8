// Géométrie du dessin au trait (EasyDraw) : points, lignes et arcs de cercle. Unité : le pouce.
// Un arc est défini par ses deux extrémités A, B et sa « flèche » (sagitta) signée : la distance du milieu de la
// corde au sommet de l'arc, positive quand l'arc bombe du côté de la normale (−dy, dx) de A vers B (à droite de
// A → B à l'écran, l'axe y du bloc pointant vers le bas).
// |flèche| = |AB| / 2 donne un demi-cercle ; au-delà, un arc plus grand qu'un demi-cercle.

import type { Id } from "../project/model";

export interface Pt {
  x: number;
  y: number;
}

export type Segment =
  | { id: Id; kind: "line"; a: Pt; b: Pt }
  | { id: Id; kind: "arc"; a: Pt; b: Pt; sagitta: number };

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Tolérance de comparaison de deux positions (pouces) : un millionième de pouce. */
export const EPS = 1e-6;
/** Une flèche plus petite que cela n'est plus un arc. */
export const MIN_SAGITTA = 1e-6;

export const dist = (p: Pt, q: Pt): number => Math.hypot(q.x - p.x, q.y - p.y);
export const samePoint = (p: Pt, q: Pt, eps = EPS): boolean => Math.abs(p.x - q.x) <= eps && Math.abs(p.y - q.y) <= eps;
export const midpoint = (p: Pt, q: Pt): Pt => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
export const lerp = (p: Pt, q: Pt, t: number): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Arrondi à 10⁻⁹ po : élimine le bruit des calculs flottants sans toucher aux valeurs réelles. */
export const clean = (v: number): number => {
  const r = Math.round(v * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
};
export const cleanPt = (p: Pt): Pt => ({ x: clean(p.x), y: clean(p.y) });

/** Le segment avec ses coordonnées arrondies à 10⁻⁹ po (sans le bruit des calculs flottants). */
export function cleanSegment(s: Segment): Segment {
  return s.kind === "line"
    ? { id: s.id, kind: "line", a: cleanPt(s.a), b: cleanPt(s.b) }
    : { id: s.id, kind: "arc", a: cleanPt(s.a), b: cleanPt(s.b), sagitta: clean(s.sagitta) };
}

export interface ArcGeometry {
  center: Pt;
  radius: number;
  /** Angle de A et balayage signé, en radians, dans le repère du bloc (angle croissant = sens horaire à l'écran). */
  startAngle: number;
  sweep: number;
  /** Sommet de l'arc (le « point chaud »). */
  apex: Pt;
  /** Point de contrôle de la « tente » : le sommet de la tente d'un triangle isocèle dont l'arc est inscrit. */
  tent: Pt;
  chord: number;
  length: number;
}

/** Normale unitaire (−dy, dx) de A → B. */
export function leftNormal(a: Pt, b: Pt): Pt {
  const c = dist(a, b);
  return c === 0 ? { x: 0, y: 0 } : { x: -(b.y - a.y) / c, y: (b.x - a.x) / c };
}

export function arcGeometry(a: Pt, b: Pt, sagitta: number): ArcGeometry {
  const chord = dist(a, b);
  const m = midpoint(a, b);
  const n = leftNormal(a, b);
  const s = Math.abs(sagitta);
  const sign = sagitta < 0 ? -1 : 1;
  const radius = (chord * chord) / 4 / s / 2 + s / 2;
  const center = { x: m.x + n.x * (sagitta - sign * radius), y: m.y + n.y * (sagitta - sign * radius) };
  const half = Math.asin(Math.min(1, chord / 2 / radius));
  const minor = 2 * half;
  const magnitude = s > chord / 2 ? 2 * Math.PI - minor : minor;
  const sweep = -sign * magnitude;
  return {
    center,
    radius,
    startAngle: Math.atan2(a.y - center.y, a.x - center.x),
    sweep,
    apex: { x: m.x + n.x * sagitta, y: m.y + n.y * sagitta },
    tent: { x: m.x + n.x * 2 * sagitta, y: m.y + n.y * 2 * sagitta },
    chord,
    length: radius * magnitude,
  };
}

export function arcOf(seg: Extract<Segment, { kind: "arc" }>): ArcGeometry {
  return arcGeometry(seg.a, seg.b, seg.sagitta);
}

/** Point de l'arc au paramètre t ∈ [0, 1] (par l'angle). */
export function arcPointAt(g: ArcGeometry, t: number): Pt {
  const ang = g.startAngle + g.sweep * t;
  return { x: g.center.x + g.radius * Math.cos(ang), y: g.center.y + g.radius * Math.sin(ang) };
}

export function pointAt(seg: Segment, t: number): Pt {
  if (seg.kind === "line") return lerp(seg.a, seg.b, t);
  if (t <= 0) return seg.a;
  if (t >= 1) return seg.b;
  return arcPointAt(arcOf(seg), t);
}

export function segmentLength(seg: Segment): number {
  return seg.kind === "line" ? dist(seg.a, seg.b) : arcOf(seg).length;
}

/** Paramètre t (0 à 1) d'un angle sur l'arc, ou `null` s'il est hors de l'arc (à EPS près). */
export function arcParamOfAngle(g: ArcGeometry, angle: number): number | null {
  const full = 2 * Math.PI;
  const sign = Math.sign(g.sweep) || 1;
  let delta = (angle - g.startAngle) * sign; // dans le sens du balayage
  delta = ((delta % full) + full) % full;
  const mag = Math.abs(g.sweep);
  const tol = EPS / g.radius;
  if (delta <= mag + tol) return Math.min(1, delta / mag);
  if (delta >= full - tol) return 0; // juste « avant » le départ
  return null;
}

export function boundsOf(seg: Segment): Rect {
  const r: Rect = {
    x0: Math.min(seg.a.x, seg.b.x),
    y0: Math.min(seg.a.y, seg.b.y),
    x1: Math.max(seg.a.x, seg.b.x),
    y1: Math.max(seg.a.y, seg.b.y),
  };
  if (seg.kind === "line") return r;
  const g = arcOf(seg);
  for (let k = 0; k < 4; k++) {
    const ang = (k * Math.PI) / 2;
    if (arcParamOfAngle(g, ang) === null) continue;
    const x = g.center.x + g.radius * Math.cos(ang);
    const y = g.center.y + g.radius * Math.sin(ang);
    r.x0 = Math.min(r.x0, x);
    r.y0 = Math.min(r.y0, y);
    r.x1 = Math.max(r.x1, x);
    r.y1 = Math.max(r.y1, y);
  }
  return r;
}

export function unionBounds(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  return rects.reduce((acc, r) => ({
    x0: Math.min(acc.x0, r.x0),
    y0: Math.min(acc.y0, r.y0),
    x1: Math.max(acc.x1, r.x1),
    y1: Math.max(acc.y1, r.y1),
  }));
}

export function insideRect(r: Rect, width: number, height: number, eps = EPS): boolean {
  return r.x0 >= -eps && r.y0 >= -eps && r.x1 <= width + eps && r.y1 <= height + eps;
}

export interface Projection {
  point: Pt;
  t: number;
  distance: number;
}

/** Point du segment le plus proche de p. */
export function project(seg: Segment, p: Pt): Projection {
  if (seg.kind === "line") {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : clamp(((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / len2, 0, 1);
    const point = { x: seg.a.x + dx * t, y: seg.a.y + dy * t };
    return { point, t, distance: dist(p, point) };
  }
  const g = arcOf(seg);
  const ang = Math.atan2(p.y - g.center.y, p.x - g.center.x);
  const t = arcParamOfAngle(g, ang);
  if (t !== null && dist(p, g.center) > 0) {
    const point = arcPointAt(g, t);
    return { point, t, distance: dist(p, point) };
  }
  const da = dist(p, seg.a);
  const db = dist(p, seg.b);
  return da <= db ? { point: seg.a, t: 0, distance: da } : { point: seg.b, t: 1, distance: db };
}

/** Sous-segment de `seg` entre les paramètres t0 < t1 (l'arc garde son cercle). */
export function subSegment(seg: Segment, t0: number, t1: number, id: Id): Segment {
  if (seg.kind === "line") return { id, kind: "line", a: lerp(seg.a, seg.b, t0), b: lerp(seg.a, seg.b, t1) };
  const g = arcOf(seg);
  const a = t0 <= 0 ? seg.a : arcPointAt(g, t0);
  const b = t1 >= 1 ? seg.b : arcPointAt(g, t1);
  const magnitude = Math.abs(g.sweep) * (t1 - t0);
  const sign = seg.sagitta < 0 ? -1 : 1;
  return { id, kind: "arc", a, b, sagitta: sign * g.radius * (1 - Math.cos(magnitude / 2)) };
}

/** Flèche pour que l'arc de A à B passe par le point p (signée selon le côté de p). */
export function sagittaThrough(a: Pt, b: Pt, p: Pt): number {
  const m = midpoint(a, b);
  const n = leftNormal(a, b);
  return (p.x - m.x) * n.x + (p.y - m.y) * n.y;
}

/** Tracé SVG (attribut `d`) d'un segment, avec ses arcs exacts. */
export function svgPathOf(seg: Segment): string {
  const f = (v: number) => String(Math.round(v * 1e6) / 1e6);
  const start = `M${f(seg.a.x)} ${f(seg.a.y)}`;
  if (seg.kind === "line") return `${start}L${f(seg.b.x)} ${f(seg.b.y)}`;
  const g = arcOf(seg);
  return `${start}A${f(g.radius)} ${f(g.radius)} 0 ${Math.abs(g.sweep) > Math.PI ? 1 : 0} ${g.sweep > 0 ? 1 : 0} ${f(seg.b.x)} ${f(seg.b.y)}`;
}
