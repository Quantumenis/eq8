// Géométrie plane du quilt : matrices affines, polygones convexes (découpe, aire, test de clic).

import type { Pt } from "../draw/geometry";

export type { Pt };

/** Matrice affine [a, b, c, d, e, f] comme celle du Canvas : x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Mat = readonly [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function applyMat(m: Mat, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** `multiply(m, n)` applique n d'abord, puis m. */
export function multiply(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function invertMat(m: Mat): Mat | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return null;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export const translation = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const scaling = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0];
export function rotation(degrees: number): Mat {
  const t = (degrees * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, s, -s, c, 0, 0];
}
/** Inclinaison horizontale : x' = x + tan(angle)·y. */
export const skewingX = (degrees: number): Mat => [1, 0, Math.tan((degrees * Math.PI) / 180), 1, 0, 0];

/** Un cadre : l'image du carré unité (o = coin haut-gauche, u = côté haut, v = côté gauche). */
export interface Frame {
  o: Pt;
  u: Pt;
  v: Pt;
}

export function frameMat(f: Frame): Mat {
  return [f.u.x, f.u.y, f.v.x, f.v.y, f.o.x, f.o.y];
}

export function rectFrame(x: number, y: number, w: number, h: number): Frame {
  return { o: { x, y }, u: { x: w, y: 0 }, v: { x: 0, y: h } };
}

export function framePolygon(f: Frame): Pt[] {
  return [f.o, { x: f.o.x + f.u.x, y: f.o.y + f.u.y }, { x: f.o.x + f.u.x + f.v.x, y: f.o.y + f.u.y + f.v.y }, { x: f.o.x + f.v.x, y: f.o.y + f.v.y }];
}

/** Aire signée (positive dans le sens horaire de l'écran, y vers le bas). */
export function signedArea(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as Pt;
    const q = poly[(i + 1) % poly.length] as Pt;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const polygonArea = (poly: readonly Pt[]): number => Math.abs(signedArea(poly));

/** Découpe un polygone convexe par un rectangle (Sutherland-Hodgman). */
export function clipToRect(poly: readonly Pt[], x0: number, y0: number, x1: number, y1: number): Pt[] {
  type Edge = { inside: (p: Pt) => boolean; cut: (p: Pt, q: Pt) => Pt };
  const edges: Edge[] = [
    { inside: (p) => p.x >= x0 - 1e-12, cut: (p, q) => ({ x: x0, y: p.y + ((q.y - p.y) * (x0 - p.x)) / (q.x - p.x) }) },
    { inside: (p) => p.x <= x1 + 1e-12, cut: (p, q) => ({ x: x1, y: p.y + ((q.y - p.y) * (x1 - p.x)) / (q.x - p.x) }) },
    { inside: (p) => p.y >= y0 - 1e-12, cut: (p, q) => ({ x: p.x + ((q.x - p.x) * (y0 - p.y)) / (q.y - p.y), y: y0 }) },
    { inside: (p) => p.y <= y1 + 1e-12, cut: (p, q) => ({ x: p.x + ((q.x - p.x) * (y1 - p.y)) / (q.y - p.y), y: y1 }) },
  ];
  let out: Pt[] = [...poly];
  for (const edge of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const p = input[i] as Pt;
      const q = input[(i + 1) % input.length] as Pt;
      const pin = edge.inside(p);
      const qin = edge.inside(q);
      if (pin && qin) out.push(q);
      else if (pin && !qin) out.push(edge.cut(p, q));
      else if (!pin && qin) out.push(edge.cut(p, q), q);
    }
    if (out.length === 0) return [];
  }
  return dedupe(out);
}

/** Retire les sommets confondus (et les sommets alignés évidents n'ont pas à l'être). */
export function dedupe(poly: readonly Pt[], eps = 1e-9): Pt[] {
  const out: Pt[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > eps || Math.abs(last.y - p.y) > eps) out.push(p);
  }
  while (out.length > 1) {
    const first = out[0] as Pt;
    const last = out[out.length - 1] as Pt;
    if (Math.abs(first.x - last.x) > eps || Math.abs(first.y - last.y) > eps) break;
    out.pop();
  }
  return out;
}

/** Point dans un polygone (règle pair-impair). */
export function pointInPolygon(poly: readonly Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Pt;
    const b = poly[j] as Pt;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function boxOf(poly: readonly Pt[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

export function polygonCentroid(poly: readonly Pt[]): Pt {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-12) {
    const b = boxOf(poly);
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as Pt;
    const q = poly[(i + 1) % poly.length] as Pt;
    const k = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * k;
    cy += (p.y + q.y) * k;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Distance du point `p` au segment [a, b]. */
export function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export const round9 = (v: number): number => Math.round(v * 1e9) / 1e9;
export const roundPt = (p: Pt): Pt => ({ x: round9(p.x), y: round9(p.y) });
