// Photo Patchwork (SPEC §2.11) : une photo posée sur le centre d'un One Patch donne à chaque pièce la couleur moyenne
// des pixels qu'elle recouvre. Trois ajustements automatiques (Inside, Outside et Distort Fit), un masque, et un
// résultat qui est un quilt coloré ordinaire.

import { rgbToHex } from "../color/color";
import type { Raster } from "../image/raster";
import type { Paint } from "../project/model";
import type { Pt } from "./geom";

export const PHOTO_FITS = ["inside", "outside", "distort"] as const;
export type PhotoFit = (typeof PHOTO_FITS)[number];

export interface PhotoRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Où la photo se pose dans le centre (repère du centre, pouces). */
export function fitPlacement(fit: PhotoFit, imageWidth: number, imageHeight: number, centerWidth: number, centerHeight: number): PhotoRect {
  if (fit === "distort") return { x0: 0, y0: 0, x1: centerWidth, y1: centerHeight };
  const k = fit === "inside" ? Math.min(centerWidth / imageWidth, centerHeight / imageHeight) : Math.max(centerWidth / imageWidth, centerHeight / imageHeight);
  const w = imageWidth * k;
  const h = imageHeight * k;
  return { x0: (centerWidth - w) / 2, y0: (centerHeight - h) / 2, x1: (centerWidth + w) / 2, y1: (centerHeight + h) / 2 };
}

/** « Garder les proportions » : la largeur impose la hauteur, autour du centre vertical. */
export function keepProportions(rect: PhotoRect, ratio: number): PhotoRect {
  const w = rect.x1 - rect.x0;
  const h = w / ratio;
  const cy = (rect.y0 + rect.y1) / 2;
  return { x0: rect.x0, x1: rect.x1, y0: cy - h / 2, y1: cy + h / 2 };
}

export interface PhotoPiece {
  key: string;
  poly: readonly Pt[];
}

function inside(poly: readonly Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Pt;
    const b = poly[j] as Pt;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/**
 * La couleur de chaque pièce : la moyenne des pixels de la photo qu'elle recouvre. `null` si elle ne recouvre rien de
 * visible (hors de la photo ou du masque). `mask` limite la photo ; par défaut, toute la photo posée.
 */
export function photoPatchColors(raster: Raster, placement: PhotoRect, pieces: readonly PhotoPiece[], mask?: PhotoRect | null): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const pw = placement.x1 - placement.x0;
  const ph = placement.y1 - placement.y0;
  if (pw <= 0 || ph <= 0) {
    for (const p of pieces) out[p.key] = null;
    return out;
  }
  const sx = raster.width / pw;
  const sy = raster.height / ph;
  const vx0 = Math.max(placement.x0, mask?.x0 ?? -Infinity);
  const vy0 = Math.max(placement.y0, mask?.y0 ?? -Infinity);
  const vx1 = Math.min(placement.x1, mask?.x1 ?? Infinity);
  const vy1 = Math.min(placement.y1, mask?.y1 ?? Infinity);
  for (const piece of pieces) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of piece.poly) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const px0 = Math.max(0, Math.floor((Math.max(minX, vx0) - placement.x0) * sx));
    const px1 = Math.min(raster.width - 1, Math.ceil((Math.min(maxX, vx1) - placement.x0) * sx) - 1);
    const py0 = Math.max(0, Math.floor((Math.max(minY, vy0) - placement.y0) * sy));
    const py1 = Math.min(raster.height - 1, Math.ceil((Math.min(maxY, vy1) - placement.y0) * sy) - 1);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    const add = (px: number, py: number): void => {
      const i = (py * raster.width + px) * 4;
      const a = (raster.data[i + 3] as number) / 255;
      if (a === 0) return;
      r += (raster.data[i] as number) * a;
      g += (raster.data[i + 1] as number) * a;
      b += (raster.data[i + 2] as number) * a;
      n += a;
    };
    for (let py = py0; py <= py1; py++) {
      const y = placement.y0 + (py + 0.5) / sy;
      for (let px = px0; px <= px1; px++) {
        const x = placement.x0 + (px + 0.5) / sx;
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        if (inside(piece.poly, x, y)) add(px, py);
      }
    }
    if (n === 0) {
      // Une pièce plus petite qu'un pixel : le pixel sous son centre, s'il est visible.
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const px = Math.floor((cx - placement.x0) * sx);
      const py = Math.floor((cy - placement.y0) * sy);
      if (px >= 0 && py >= 0 && px < raster.width && py < raster.height && cx >= vx0 && cx <= vx1 && cy >= vy0 && cy <= vy1 && inside(piece.poly, cx, cy)) add(px, py);
    }
    out[piece.key] = n > 0 ? rgbToHex({ r: r / n, g: g / n, b: b / n }) : null;
  }
  return out;
}

/** Les couleurs de la photo comme habillages du quilt (les pièces non couvertes restent sans couleur). */
export function photoPatchFills(colors: Record<string, string | null>): Record<string, Paint> {
  const fills: Record<string, Paint> = {};
  for (const [key, rgb] of Object.entries(colors)) if (rgb) fills[key] = { kind: "solid", rgb };
  return fills;
}
