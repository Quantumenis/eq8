// Quilts en bandes (SPEC §2.8) : les 11 styles de bande et leurs formules.
// Une bande horizontale est décrite dans son repère local : x le long (0 → longueur), y en travers (0 → largeur).

import { clipToRect, polygonArea, type Pt } from "./geom";

export const STRIP_STYLES = [
  "plain",
  "blocks",
  "halfDropBlocks",
  "spacedSquares",
  "pointsA",
  "pointsB",
  "diamonds",
  "halfDropDiamonds",
  "doubleDiamonds",
  "halfDropDoubleDiamonds",
  "checkerboard",
] as const;
export type StripStyle = (typeof STRIP_STYLES)[number];

export interface Strip {
  style: StripStyle;
  /** Largeur de la bande (en travers), en pouces. */
  width: number;
  /** « Le long » : nombre de blocs, de pointes, de losanges… */
  count: number;
  /** « En travers » : seulement pour le damier. */
  across: number;
}

export const MIN_STRIP_WIDTH = 0.25;
export const MAX_STRIP_WIDTH = 120;
export const MAX_STRIP_COUNT = 100;
/** Une bande neuve, non clonée : unie, de 2 po. */
export const PLAIN_STRIP: Strip = { style: "plain", width: 2, count: 1, across: 1 };

export interface StripPiece {
  key: string;
  poly: Pt[];
  /** Pièce rectangulaire où l'on peut poser un bloc (styles « Blocs », « Carrés espacés »). */
  blockable: boolean;
}

const P = (x: number, y: number): Pt => ({ x, y });

/** Les pièces d'une bande, découpées au rectangle [0, longueur] × [0, largeur]. */
export function stripPieces(strip: Strip, length: number): StripPiece[] {
  const w = strip.width;
  const n = Math.max(1, Math.round(strip.count));
  const out: StripPiece[] = [];
  const push = (key: string, poly: Pt[], blockable = false): void => {
    const clipped = clipToRect(poly, 0, 0, length, w);
    if (clipped.length >= 3 && polygonArea(clipped) > 1e-9) out.push({ key, poly: clipped, blockable });
  };
  const rect = (x0: number, x1: number, y0 = 0, y1 = w): Pt[] => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
  const d = length / n;

  switch (strip.style) {
    case "plain":
      push("p0", rect(0, length));
      break;
    case "blocks":
      for (let i = 0; i < n; i++) push(`b${i}`, rect(i * d, (i + 1) * d), true);
      break;
    case "halfDropBlocks":
      for (let i = 0; i <= n; i++) push(`h${i}`, rect((i - 0.5) * d, (i + 0.5) * d));
      break;
    case "spacedSquares": {
      // n carrés et n + 1 espaceurs larges d'un tiers de carré.
      const q = length / (n + (n + 1) / 3);
      const sp = q / 3;
      for (let i = 0; i <= n; i++) push(`e${i}`, rect(i * (q + sp), i * (q + sp) + sp));
      for (let i = 0; i < n; i++) push(`c${i}`, rect(i * (q + sp) + sp, (i + 1) * (q + sp)), true);
      break;
    }
    case "pointsA":
    case "pointsB": {
      // A : pointes en haut (base en bas) ; B : pointes en bas. Les fonds sont les triangles inverses.
      const up = strip.style === "pointsA";
      const base = up ? w : 0;
      const tip = up ? 0 : w;
      for (let i = 0; i < n; i++) push(`t${i}`, [P(i * d, base), P((i + 1) * d, base), P((i + 0.5) * d, tip)]);
      for (let i = 0; i <= n; i++) push(`f${i}`, [P((i - 0.5) * d, tip), P((i + 0.5) * d, tip), P(i * d, base)]);
      break;
    }
    case "diamonds": {
      for (let i = 0; i < n; i++) push(`d${i}`, [P(i * d, w / 2), P((i + 0.5) * d, 0), P((i + 1) * d, w / 2), P((i + 0.5) * d, w)]);
      for (let i = 0; i <= n; i++) {
        push(`u${i}`, [P((i - 0.5) * d, 0), P((i + 0.5) * d, 0), P(i * d, w / 2)]);
        push(`l${i}`, [P((i - 0.5) * d, w), P((i + 0.5) * d, w), P(i * d, w / 2)]);
      }
      break;
    }
    case "halfDropDiamonds": {
      for (let i = 0; i <= n; i++) push(`d${i}`, [P(i * d - d / 2, w / 2), P(i * d, 0), P(i * d + d / 2, w / 2), P(i * d, w)]);
      for (let i = 0; i < n; i++) {
        push(`u${i}`, [P(i * d, 0), P((i + 1) * d, 0), P((i + 0.5) * d, w / 2)]);
        push(`l${i}`, [P(i * d, w), P((i + 1) * d, w), P((i + 0.5) * d, w / 2)]);
      }
      break;
    }
    case "doubleDiamonds": {
      // Deux rangées de losanges aplatis (haut et bas), des losanges de fond au milieu et des triangles aux bords.
      for (let i = 0; i < n; i++) {
        push(`a${i}`, [P(i * d, w / 4), P((i + 0.5) * d, 0), P((i + 1) * d, w / 4), P((i + 0.5) * d, w / 2)]);
        push(`b${i}`, [P(i * d, (3 * w) / 4), P((i + 0.5) * d, w / 2), P((i + 1) * d, (3 * w) / 4), P((i + 0.5) * d, w)]);
      }
      for (let i = 0; i <= n; i++) {
        push(`u${i}`, [P((i - 0.5) * d, 0), P((i + 0.5) * d, 0), P(i * d, w / 4)]);
        push(`l${i}`, [P((i - 0.5) * d, w), P((i + 0.5) * d, w), P(i * d, (3 * w) / 4)]);
        push(`m${i}`, [P((i - 0.5) * d, w / 2), P(i * d, w / 4), P((i + 0.5) * d, w / 2), P(i * d, (3 * w) / 4)]);
      }
      break;
    }
    case "halfDropDoubleDiamonds": {
      // Losanges centraux, demi-losanges en haut et en bas décalés d'un demi-pas, et les triangles de fond.
      for (let i = 0; i <= n; i++) push(`m${i}`, [P(i * d - d / 2, w / 2), P(i * d, w / 4), P(i * d + d / 2, w / 2), P(i * d, (3 * w) / 4)]);
      for (let i = 0; i < n; i++) {
        push(`u${i}`, [P(i * d, 0), P((i + 1) * d, 0), P((i + 0.5) * d, w / 4)]);
        push(`l${i}`, [P(i * d, w), P((i + 1) * d, w), P((i + 0.5) * d, (3 * w) / 4)]);
      }
      for (let i = 0; i <= n; i++) {
        const x = i * d;
        push(`x${i}a`, [P(x, 0), P(x + d / 2, w / 4), P(x, w / 4)]);
        push(`x${i}b`, [P(x, 0), P(x - d / 2, w / 4), P(x, w / 4)]);
        push(`x${i}c`, [P(x, w), P(x + d / 2, (3 * w) / 4), P(x, (3 * w) / 4)]);
        push(`x${i}d`, [P(x, w), P(x - d / 2, (3 * w) / 4), P(x, (3 * w) / 4)]);
        push(`y${i}a`, [P(x, w / 4), P(x + d / 2, w / 4), P(x + d / 2, w / 2)]);
        push(`y${i}b`, [P(x, w / 4), P(x - d / 2, w / 4), P(x - d / 2, w / 2)]);
        push(`y${i}c`, [P(x, (3 * w) / 4), P(x + d / 2, (3 * w) / 4), P(x + d / 2, w / 2)]);
        push(`y${i}d`, [P(x, (3 * w) / 4), P(x - d / 2, (3 * w) / 4), P(x - d / 2, w / 2)]);
      }
      break;
    }
    case "checkerboard": {
      const m = Math.max(1, Math.round(strip.across));
      const h = w / m;
      for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) push(`c${i}_${j}`, rect(i * d, (i + 1) * d, j * h, (j + 1) * h), false);
      break;
    }
  }
  return out;
}

/** Les formules du manuel (p. 47) pour des carrés parfaits ou des angles à 90° : la longueur que donnent largeur et nombre. */
export function stripFormulaLength(strip: Strip): number {
  const n = strip.count;
  switch (strip.style) {
    case "blocks":
    case "halfDropBlocks":
    case "diamonds":
    case "halfDropDiamonds":
      return strip.width * n;
    case "doubleDiamonds":
    case "halfDropDoubleDiamonds":
      return strip.width * (n / 2);
    case "pointsA":
    case "pointsB":
      return strip.width * (n * 2);
    case "checkerboard":
      return (strip.width * n) / strip.across;
    default:
      return Number.NaN;
  }
}

/**
 * Damier : « (longueur ÷ largeur) × nombre en travers = nombre le long » (SPEC §2.8). Renvoie le nombre le long
 * qui donne des carrés parfaits.
 */
export function checkerboardCount(length: number, width: number, across: number): number {
  return (length / width) * across;
}
