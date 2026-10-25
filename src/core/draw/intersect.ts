// Intersections droite-droite, droite-arc et arc-arc, avec le paramètre t (0 à 1) sur chacun des deux segments.

import { EPS, arcOf, arcParamOfAngle, dist, type Pt, type Segment } from "./geometry";

export interface Crossing {
  point: Pt;
  /** Paramètre sur le premier et sur le second segment. */
  t: number;
  u: number;
}

function lineLine(p: Segment, q: Segment): Crossing[] {
  const r = { x: p.b.x - p.a.x, y: p.b.y - p.a.y };
  const s = { x: q.b.x - q.a.x, y: q.b.y - q.a.y };
  const denom = r.x * s.y - r.y * s.x;
  const lenP = Math.hypot(r.x, r.y);
  const lenQ = Math.hypot(s.x, s.y);
  if (lenP === 0 || lenQ === 0 || Math.abs(denom) <= 1e-12 * lenP * lenQ) return []; // parallèles ou superposés
  const qp = { x: q.a.x - p.a.x, y: q.a.y - p.a.y };
  const t = (qp.x * s.y - qp.y * s.x) / denom;
  const u = (qp.x * r.y - qp.y * r.x) / denom;
  if (t < -EPS / lenP || t > 1 + EPS / lenP || u < -EPS / lenQ || u > 1 + EPS / lenQ) return [];
  return [{ point: { x: p.a.x + r.x * t, y: p.a.y + r.y * t }, t: Math.min(1, Math.max(0, t)), u: Math.min(1, Math.max(0, u)) }];
}

function lineArc(line: Segment, arc: Extract<Segment, { kind: "arc" }>): Crossing[] {
  const g = arcOf(arc);
  const d = { x: line.b.x - line.a.x, y: line.b.y - line.a.y };
  const f = { x: line.a.x - g.center.x, y: line.a.y - g.center.y };
  const A = d.x * d.x + d.y * d.y;
  if (A === 0) return [];
  const B = 2 * (f.x * d.x + f.y * d.y);
  const C = f.x * f.x + f.y * f.y - g.radius * g.radius;
  let disc = B * B - 4 * A * C;
  if (disc < 0) {
    if (disc < -1e-12 * (B * B + 1)) return [];
    disc = 0; // tangente
  }
  const root = Math.sqrt(disc);
  const lenLine = Math.sqrt(A);
  const out: Crossing[] = [];
  const ts = root === 0 ? [-B / (2 * A)] : [(-B - root) / (2 * A), (-B + root) / (2 * A)];
  for (const t of ts) {
    if (t < -EPS / lenLine || t > 1 + EPS / lenLine) continue;
    const point = { x: line.a.x + d.x * t, y: line.a.y + d.y * t };
    const u = arcParamOfAngle(g, Math.atan2(point.y - g.center.y, point.x - g.center.x));
    if (u === null) continue;
    out.push({ point, t: Math.min(1, Math.max(0, t)), u });
  }
  return out;
}

function arcArc(p: Extract<Segment, { kind: "arc" }>, q: Extract<Segment, { kind: "arc" }>): Crossing[] {
  const gp = arcOf(p);
  const gq = arcOf(q);
  const d = dist(gp.center, gq.center);
  if (d < 1e-12) return []; // cercles concentriques (ou confondus)
  const r0 = gp.radius;
  const r1 = gq.radius;
  if (d > r0 + r1 + EPS || d < Math.abs(r0 - r1) - EPS) return [];
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h2 = r0 * r0 - a * a;
  const h = h2 > 0 ? Math.sqrt(h2) : 0;
  const ex = (gq.center.x - gp.center.x) / d;
  const ey = (gq.center.y - gp.center.y) / d;
  const base = { x: gp.center.x + ex * a, y: gp.center.y + ey * a };
  const candidates: Pt[] = h === 0 ? [base] : [
    { x: base.x - ey * h, y: base.y + ex * h },
    { x: base.x + ey * h, y: base.y - ex * h },
  ];
  const out: Crossing[] = [];
  for (const point of candidates) {
    const t = arcParamOfAngle(gp, Math.atan2(point.y - gp.center.y, point.x - gp.center.x));
    const u = arcParamOfAngle(gq, Math.atan2(point.y - gq.center.y, point.x - gq.center.x));
    if (t !== null && u !== null) out.push({ point, t, u });
  }
  return out;
}

/** Tous les croisements de deux segments (pas de croisement pour deux segments superposés). */
export function intersect(p: Segment, q: Segment): Crossing[] {
  if (p.kind === "line" && q.kind === "line") return lineLine(p, q);
  if (p.kind === "line" && q.kind === "arc") return lineArc(p, q);
  if (p.kind === "arc" && q.kind === "line") return lineArc(q, p).map((c) => ({ point: c.point, t: c.u, u: c.t }));
  return arcArc(p as Extract<Segment, { kind: "arc" }>, q as Extract<Segment, { kind: "arc" }>);
}
