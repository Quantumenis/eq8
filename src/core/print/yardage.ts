// Métrage (SPEC §9.11, Q-9.7 à Q-9.9).
// 1. Chaque pièce reçoit sa marge, puis on prend son rectangle englobant dans le sens du tissu.
// 2. Les rectangles d'un même tissu sont rangés par étagères sur une bande de la laize choisie : triés par hauteur
//    décroissante, chacun dans la première rangée où il tient ; une rotation de 90° est faite si elle réduit la
//    hauteur de la rangée. Toute la hauteur d'une rangée compte.
// 3. Une pièce plus longue que la laize (bordure) est raboutée en tronçons égaux, chacun avec ses marges.
// 4. Le total est arrondi au 1/8 yd supérieur, et à 10 cm supérieurs en métrique. Le dos et le biais ne sont pas comptés.

import type { Pt } from "../draw/geometry";
import type { Paint } from "../project/model";
import { applyMat, rotation } from "../quilt/geom";
import type { Scene } from "../quilt/scene";
import { seamOffset } from "./offset";
import { paintId } from "./shapes";

/** Laizes proposées (Q-9.7), en pouces et en centimètres. */
export const LAIZES_IN = [36, 40, 42, 44, 45, 54, 60, 90, 108] as const;
export const LAIZES_CM = [90, 110, 112, 140, 150, 240, 280] as const;
export const DEFAULT_LAIZE_IN = 42;
export const DEFAULT_LAIZE_CM = 110;
/** Coupon (« fat quarter ») : 18 × 21 po (Q-9.8), ou 45 × 55 cm. */
export const FAT_QUARTER_IN = { length: 18, width: 21 };
export const FAT_QUARTER_CM = { length: 45 / 2.54, width: 55 / 2.54 };

export interface CutRect {
  /** Dimensions de coupe (marges comprises), en pouces. */
  w: number;
  h: number;
}

export interface YardageOptions {
  /** Laize, en pouces. */
  width: number;
  seam: number;
  fatQuarters: boolean;
  fatQuarter: { length: number; width: number };
}

export interface YardageLine {
  id: string;
  paint: Paint | undefined;
  pieces: number;
  /** Longueur de tissu exacte (pouces). */
  inches: number;
  /** Métrage arrondi : yards au 1/8 supérieur, mètres aux 10 cm supérieurs. */
  yards: number;
  meters: number;
  /** Nombre de coupons (mode « coupons uniquement »). */
  fatQuarters: number;
}

/** Tronçons d'une pièce trop longue : chacun garde ses marges, la longueur finie est partagée également. */
export function splice(r: CutRect, maxLength: number, seam: number): CutRect[] {
  const long = Math.max(r.w, r.h);
  const short = Math.min(r.w, r.h);
  if (long <= maxLength + 1e-9) return [r];
  const finished = long - 2 * seam;
  const usable = maxLength - 2 * seam;
  if (usable <= 0) return [r];
  const n = Math.ceil(finished / usable - 1e-9);
  const each = finished / n + 2 * seam;
  return Array.from({ length: n }, () => ({ w: each, h: short }));
}

/** Rangement par étagères (FFDH) : renvoie la hauteur totale et les hauteurs des rangées. */
export function shelfPack(rects: readonly CutRect[], width: number): { length: number; shelves: { height: number; used: number }[] } {
  // Orientation : la plus basse qui tient dans la laize.
  const oriented = rects.map((r) => {
    const lo = Math.min(r.w, r.h);
    const hi = Math.max(r.w, r.h);
    return hi <= width + 1e-9 ? { w: hi, h: lo } : { w: lo, h: hi };
  });
  oriented.sort((a, b) => b.h - a.h || b.w - a.w);
  const shelves: { height: number; used: number }[] = [];
  for (const r of oriented) {
    const shelf = shelves.find((s) => s.used + r.w <= width + 1e-9);
    if (shelf) shelf.used += r.w;
    else shelves.push({ height: r.h, used: r.w });
  }
  return { length: shelves.reduce((s, x) => s + x.height, 0), shelves };
}

/** Nombre de coupons : les rangées (laize = largeur du coupon) s'empilent dans des coupons de `length`. */
export function fatQuarterCount(rects: readonly CutRect[], fq: { length: number; width: number }, seam: number): number {
  const pieces = rects.flatMap((r) => splice(r, fq.width, seam)).flatMap((r) => {
    // Une pièce plus haute que le coupon est raboutée dans l'autre sens.
    const lo = Math.min(r.w, r.h);
    return lo > fq.length ? splice({ w: lo, h: Math.max(r.w, r.h) }, fq.length, seam) : [r];
  });
  const { shelves } = shelfPack(pieces, fq.width);
  let count = 0;
  let left = 0;
  for (const s of shelves) {
    if (s.height > left + 1e-9) {
      count += 1;
      left = fq.length;
    }
    left -= s.height;
  }
  return count;
}

export const roundYards = (inches: number): number => Math.ceil((inches / 36) * 8 - 1e-9) / 8;
export const roundMeters = (inches: number): number => Math.ceil((inches * 2.54) / 10 - 1e-9) / 10;

/** Métrage de groupes de rectangles (un groupe par tissu ou couleur). */
export function yardageOf(groups: readonly { id: string; paint: Paint | undefined; rects: CutRect[] }[], o: YardageOptions): YardageLine[] {
  return groups.map((g) => {
    const pieces = g.rects.flatMap((r) => splice(r, o.width, o.seam));
    const inches = shelfPack(pieces, o.width).length;
    return {
      id: g.id,
      paint: g.paint,
      pieces: g.rects.length,
      inches,
      yards: roundYards(inches),
      meters: roundMeters(inches),
      fatQuarters: o.fatQuarters ? fatQuarterCount(g.rects, o.fatQuarter, o.seam) : 0,
    };
  });
}

function boxSize(poly: readonly Pt[]): CutRect {
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
  return { w: x1 - x0, h: y1 - y0 };
}

/** Les rectangles de coupe des pièces colorées d'un quilt (calques 1 et 2), groupés par tissu ou couleur. */
export function quiltCutRects(scene: Scene, seam: number): { id: string; paint: Paint | undefined; rects: CutRect[] }[] {
  const groups = new Map<string, { id: string; paint: Paint | undefined; rects: CutRect[] }>();
  for (const p of scene.pieces) {
    if (p.lineOnly || p.layer === 3) continue;
    const poly = p.block ? p.block.piece.polygon.map((q) => applyMat(p.block!.mat, q)) : p.poly;
    // Dans le sens du tissu : la pièce est ramenée dans le repère du tissu posé.
    const angle = p.angle + (p.paint?.kind === "fabric" ? (p.paint.rotation ?? 0) : 0);
    const r = rotation(-angle);
    const local = poly.map((q) => applyMat(r, q));
    const rect = boxSize(seamOffset(local, seam));
    const id = paintId(p.paint);
    let g = groups.get(id);
    if (!g) {
      g = { id, paint: p.paint, rects: [] };
      groups.set(id, g);
    }
    g.rects.push(rect);
  }
  return [...groups.values()];
}

/** « 3/8 yd », « 1 1/4 yd ». */
export function formatYards(yards: number): string {
  const eighths = Math.round(yards * 8);
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  const frac = rest === 0 ? "" : rest % 4 === 0 ? "1/2" : rest % 2 === 0 ? `${rest / 2}/4` : `${rest}/8`;
  if (whole === 0 && !frac) return "0 yd";
  return `${whole > 0 ? whole : ""}${whole > 0 && frac ? " " : ""}${frac} yd`;
}

/** « 0,4 m ». */
export const formatMeters = (m: number): string => `${String(Math.round(m * 10) / 10).replace(".", ",")} m`;

