// Courbes de Bézier cubiques de l'applique (SPEC §6.4) et leur conversion en arcs de cercle.
// Un contour de pièce est toujours fait de droites et d'arcs (`Segment`) : les Béziers sont approchés par des arcs à
// 10⁻⁴ po près, ce qui garde des tracés exacts (PDF, SVG) avec peu de segments.

import { dist, lerp, midpoint, type Pt, type Rect, type Segment } from "./geometry";

export interface Cubic {
  p0: Pt;
  p1: Pt;
  p2: Pt;
  p3: Pt;
}

/** Écart maximal toléré entre une courbe et les arcs qui l'approchent (pouces). */
export const ARC_FIT_TOLERANCE = 1e-4;

export function cubicAt(c: Cubic, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return { x: a * c.p0.x + b * c.p1.x + d * c.p2.x + e * c.p3.x, y: a * c.p0.y + b * c.p1.y + d * c.p2.y + e * c.p3.y };
}

/** Coupe la courbe au paramètre t (de Casteljau). */
export function splitCubic(c: Cubic, t: number): [Cubic, Cubic] {
  const a = lerp(c.p0, c.p1, t);
  const b = lerp(c.p1, c.p2, t);
  const d = lerp(c.p2, c.p3, t);
  const e = lerp(a, b, t);
  const f = lerp(b, d, t);
  const g = lerp(e, f, t);
  return [
    { p0: c.p0, p1: a, p2: e, p3: g },
    { p0: g, p1: f, p2: d, p3: c.p3 },
  ];
}

/** La sous-courbe entre t0 et t1. */
export function subCubic(c: Cubic, t0: number, t1: number): Cubic {
  if (t0 <= 0 && t1 >= 1) return c;
  const [, right] = t0 > 0 ? splitCubic(c, t0) : [c, c];
  const rest = t0 > 0 ? right : c;
  if (t1 >= 1) return rest;
  const local = t0 > 0 ? (t1 - t0) / (1 - t0) : t1;
  return splitCubic(rest, local)[0];
}

export function reverseCubic(c: Cubic): Cubic {
  return { p0: c.p3, p1: c.p2, p2: c.p1, p3: c.p0 };
}

export function lineCubic(a: Pt, b: Pt): Cubic {
  return { p0: a, p1: a, p2: b, p3: b };
}

/** Vrai si les poignées sont sur la corde : la courbe est une droite (à `eps` près). */
export function cubicIsLine(c: Cubic, eps = 1e-9): boolean {
  const len = dist(c.p0, c.p3);
  if (len < 1e-12) return dist(c.p0, c.p1) < eps && dist(c.p0, c.p2) < eps;
  const off = (p: Pt) => Math.abs((p.x - c.p0.x) * (c.p3.y - c.p0.y) - (p.y - c.p0.y) * (c.p3.x - c.p0.x)) / len;
  return off(c.p1) < eps && off(c.p2) < eps;
}

/** Boîte exacte de la courbe (les extrema des dérivées). */
export function cubicBounds(c: Cubic): Rect {
  const r: Rect = { x0: Math.min(c.p0.x, c.p3.x), y0: Math.min(c.p0.y, c.p3.y), x1: Math.max(c.p0.x, c.p3.x), y1: Math.max(c.p0.y, c.p3.y) };
  const extend = (p: Pt) => {
    r.x0 = Math.min(r.x0, p.x);
    r.y0 = Math.min(r.y0, p.y);
    r.x1 = Math.max(r.x1, p.x);
    r.y1 = Math.max(r.y1, p.y);
  };
  for (const axis of ["x", "y"] as const) {
    const p0 = c.p0[axis];
    const p1 = c.p1[axis];
    const p2 = c.p2[axis];
    const p3 = c.p3[axis];
    // Dérivée : a t² + b t + k.
    const a = -p0 + 3 * p1 - 3 * p2 + p3;
    const b = 2 * (p0 - 2 * p1 + p2);
    const k = p1 - p0;
    const roots: number[] = [];
    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) > 1e-12) roots.push(-k / b);
    } else {
      const disc = b * b - 4 * a * k;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        roots.push((-b + s) / (2 * a), (-b - s) / (2 * a));
      }
    }
    for (const t of roots) if (t > 0 && t < 1) extend(cubicAt(c, t));
  }
  return r;
}

/** Points de la courbe (polyligne) : `n` cordes. */
export function sampleCubic(c: Cubic, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push(cubicAt(c, i / n));
  return out;
}

/** Cercle par trois points ; `null` si les points sont alignés. */
function circumcircle(a: Pt, b: Pt, c: Pt): { center: Pt; radius: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-14) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const center = {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
  return { center, radius: dist(center, a) };
}

let counter = 0;
const nextId = (prefix: string): string => `${prefix}.${counter++ % 1_000_000}`;

/** Arc (ou droite) de a à b passant par m ; `null` si ce n'est pas faisable proprement. */
function arcThrough(a: Pt, m: Pt, b: Pt, id: string): Segment | null {
  const circle = circumcircle(a, m, b);
  if (!circle || circle.radius > 1e6) return null;
  const mid = midpoint(a, b);
  const chord = dist(a, b);
  if (chord < 1e-12) return null;
  const nx = -(b.y - a.y) / chord;
  const ny = (b.x - a.x) / chord;
  const side = (m.x - mid.x) * nx + (m.y - mid.y) * ny;
  if (Math.abs(side) < 1e-12) return null;
  const centerOff = (circle.center.x - mid.x) * nx + (circle.center.y - mid.y) * ny;
  const sagitta = centerOff + Math.sign(side) * circle.radius;
  if (Math.abs(sagitta) < 1e-7) return { id, kind: "line", a, b };
  return { id, kind: "arc", a, b, sagitta };
}

function maxDeviation(seg: Segment, c: Cubic, ts: readonly number[]): number {
  let worst = 0;
  for (const t of ts) {
    const p = cubicAt(c, t);
    if (seg.kind === "line") {
      const len = dist(seg.a, seg.b);
      const d = Math.abs((p.x - seg.a.x) * (seg.b.y - seg.a.y) - (p.y - seg.a.y) * (seg.b.x - seg.a.x)) / (len || 1);
      worst = Math.max(worst, d);
    } else {
      const circle = circumcircle(seg.a, midpointOnArc(seg), seg.b);
      if (!circle) return Infinity;
      worst = Math.max(worst, Math.abs(dist(circle.center, p) - circle.radius));
    }
  }
  return worst;
}

/** Un point du milieu de l'arc (le sommet) : sert à retrouver son cercle. */
function midpointOnArc(seg: Extract<Segment, { kind: "arc" }>): Pt {
  const mid = midpoint(seg.a, seg.b);
  const chord = dist(seg.a, seg.b);
  const nx = -(seg.b.y - seg.a.y) / chord;
  const ny = (seg.b.x - seg.a.x) / chord;
  return { x: mid.x + nx * seg.sagitta, y: mid.y + ny * seg.sagitta };
}

const CHECK = [0.1, 0.25, 0.4, 0.6, 0.75, 0.9];

function fit(c: Cubic, t0: number, t1: number, tol: number, depth: number, id: string, out: Segment[]): void {
  const a = cubicAt(c, t0);
  const b = cubicAt(c, t1);
  if (dist(a, b) < 1e-12 && depth > 0 && t1 - t0 < 1e-9) return;
  const m = cubicAt(c, (t0 + t1) / 2);
  const candidate = arcThrough(a, m, b, id) ?? ({ id, kind: "line", a, b } as Segment);
  const ts = CHECK.map((k) => t0 + (t1 - t0) * k);
  const err = maxDeviation(candidate, c, [...ts, (t0 + t1) / 2]);
  if (err <= tol || depth >= 14) {
    out.push(candidate);
    return;
  }
  const mid = (t0 + t1) / 2;
  fit(c, t0, mid, tol, depth + 1, id, out);
  fit(c, mid, t1, tol, depth + 1, id, out);
}

/** Une courbe cubique en droites et arcs de cercle bout à bout, à `tol` près. */
export function cubicToSegments(c: Cubic, idPrefix = "c", tol = ARC_FIT_TOLERANCE): Segment[] {
  if (cubicIsLine(c, tol / 4)) {
    return dist(c.p0, c.p3) < 1e-12 ? [] : [{ id: nextId(idPrefix), kind: "line", a: c.p0, b: c.p3 }];
  }
  // Une boucle ou un point d'inflexion : on commence par couper en quatre pour que chaque morceau soit simple.
  const out: Segment[] = [];
  for (let k = 0; k < 4; k++) fit(c, k / 4, (k + 1) / 4, tol, 0, idPrefix, out);
  // Les extrémités doivent coller exactement à la courbe (les arcs partent de points de la courbe : c'est le cas),
  // mais on fusionne les morceaux consécutifs identiques à une droite.
  const merged: Segment[] = [];
  for (const s of out) {
    if (dist(s.a, s.b) < 1e-12) continue;
    merged.push({ ...s, id: nextId(idPrefix) });
  }
  if (merged.length > 0) {
    // Raccord exact des extrémités extrêmes (évite les écarts de flottants).
    const first = merged[0] as Segment;
    const last = merged[merged.length - 1] as Segment;
    merged[0] = { ...first, a: c.p0 } as Segment;
    merged[merged.length - 1] = { ...last, b: c.p3 } as Segment;
  }
  return merged;
}
