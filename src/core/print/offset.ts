// Marge de couture (SPEC §9.3, §9.6) : la ligne de coupe est la pièce finie décalée vers l'extérieur, avec des coins en
// onglet (« prolonger les lignes de marge aux coins jusqu'à leur croisement », p. 226). Un onglet plus long que
// 4 fois la marge (angle de moins de 29°) est écrêté, comme le font les gabarits du commerce.
// Les arcs sont aplatis à 10⁻⁴ po avant le décalage (la ligne de couture, elle, reste exacte).

import { EndType, inflatePathsD, JoinType, type PathD } from "clipper2-ts";
import type { Pt } from "../draw/geometry";

export const MITER_LIMIT = 4;

export function signedAreaOf(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as Pt;
    const q = poly[(i + 1) % poly.length] as Pt;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** La ligne de coupe d'une pièce (polygone aplati) avec une marge `margin` (pouces). Sans marge : la pièce elle-même. */
export function seamOffset(poly: readonly Pt[], margin: number, miterLimit = MITER_LIMIT): Pt[] {
  if (margin <= 0 || poly.length < 3) return [...poly];
  const out = inflatePathsD([poly.map((p) => ({ x: p.x, y: p.y }))] as PathD[], margin, JoinType.Miter, EndType.Polygon, miterLimit, 7);
  let best: Pt[] = [];
  let bestArea = 0;
  for (const path of out) {
    const pts = path.map((p) => ({ x: p.x, y: p.y }));
    const area = Math.abs(signedAreaOf(pts));
    if (area > bestArea) {
      best = pts;
      bestArea = area;
    }
  }
  return best;
}

/** La ligne de coupe d'un trou : le trou rétréci de `margin` (le tissu de la marge avance dans le trou). `null` s'il disparaît. */
export function seamInset(poly: readonly Pt[], margin: number, miterLimit = MITER_LIMIT): Pt[] | null {
  if (margin <= 0 || poly.length < 3) return [...poly];
  const out = inflatePathsD([poly.map((p) => ({ x: p.x, y: p.y }))] as PathD[], -margin, JoinType.Miter, EndType.Polygon, miterLimit, 7);
  let best: Pt[] | null = null;
  let bestArea = 1e-6;
  for (const path of out) {
    const pts = path.map((p) => ({ x: p.x, y: p.y }));
    const area = Math.abs(signedAreaOf(pts));
    if (area > bestArea) {
      best = pts;
      bestArea = area;
    }
  }
  return best;
}
