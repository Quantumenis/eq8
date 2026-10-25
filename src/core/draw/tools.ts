// Outils de dessin EasyDraw : création de lignes, d'arcs et de grilles, et recherche du segment sous la souris.

import { createId, type Id } from "../project/model";
import { dist, project, type Pt, type Rect, type Segment } from "./geometry";
import { clean } from "./geometry";
import type { BlockDraft } from "./draft";

export function lineSegment(a: Pt, b: Pt): Segment {
  return { id: createId(), kind: "line", a, b };
}

/** Demi-cercle de A à B ; `flipped` (barre d'espace pendant le tracé) l'inverse de côté. */
export function arcSegment(a: Pt, b: Pt, flipped: boolean): Segment {
  const half = dist(a, b) / 2;
  return { id: createId(), kind: "arc", a, b, sagitta: flipped ? -half : half };
}

export const MAX_GRID_DIVISIONS = 64;

/**
 * Segments d'une grille de `cols` colonnes et `rows` lignes tracée dans un rectangle : les lignes intérieures, et les
 * côtés du rectangle qui ne coïncident pas avec le contour du bloc.
 */
export function gridSegments(draft: Pick<BlockDraft, "width" | "height">, corner1: Pt, corner2: Pt, cols: number, rows: number): Segment[] {
  const r: Rect = {
    x0: Math.min(corner1.x, corner2.x),
    y0: Math.min(corner1.y, corner2.y),
    x1: Math.max(corner1.x, corner2.x),
    y1: Math.max(corner1.y, corner2.y),
  };
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_GRID_DIVISIONS;
  if (!ok(cols) || !ok(rows) || r.x1 - r.x0 < 1e-6 || r.y1 - r.y0 < 1e-6) return [];
  const eps = 1e-6;
  const out: Segment[] = [];
  const vertical = (x: number) => out.push(lineSegment({ x: clean(x), y: r.y0 }, { x: clean(x), y: r.y1 }));
  const horizontal = (y: number) => out.push(lineSegment({ x: r.x0, y: clean(y) }, { x: r.x1, y: clean(y) }));
  if (r.x0 > eps) vertical(r.x0);
  for (let i = 1; i < cols; i++) vertical(r.x0 + ((r.x1 - r.x0) * i) / cols);
  if (r.x1 < draft.width - eps) vertical(r.x1);
  if (r.y0 > eps) horizontal(r.y0);
  for (let j = 1; j < rows; j++) horizontal(r.y0 + ((r.y1 - r.y0) * j) / rows);
  if (r.y1 < draft.height - eps) horizontal(r.y1);
  return out;
}

/** Le segment le plus proche de p, à `tolerance` près (pouces). Les segments sélectionnés sont préférés à égalité. */
export function hitTest(segments: readonly Segment[], p: Pt, tolerance: number, preferred?: ReadonlySet<Id>): Id | null {
  let best: Id | null = null;
  let bestD = tolerance;
  for (const seg of segments) {
    const d = project(seg, p).distance - (preferred?.has(seg.id) ? 1e-9 : 0);
    if (d <= bestD) {
      best = seg.id;
      bestD = d;
    }
  }
  return best;
}
