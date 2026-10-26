// Image en mémoire : pixels RVBA 8 bits, ligne par ligne, sans dépendance au DOM (compatible avec ImageData).

import { rgbToHex, type Rgb } from "../color/color";
import { sha256Hex } from "../hash";

export interface Raster {
  width: number;
  height: number;
  /** width × height × 4 octets (R, V, B, A). */
  data: Uint8ClampedArray;
}

/** Plafond de taille d'une image (pixels) : au-delà, l'import est refusé plutôt que de saturer la mémoire. */
export const MAX_PIXELS = 50_000_000;

export function createRaster(width: number, height: number, fill?: Rgb & { a?: number }): Raster {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError("Taille d'image invalide");
  if (width * height > MAX_PIXELS) throw new RangeError("Image trop grande");
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    const a = fill.a ?? 255;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill.r;
      data[i + 1] = fill.g;
      data[i + 2] = fill.b;
      data[i + 3] = a;
    }
  }
  return { width, height, data };
}

export function pixelAt(r: Raster, x: number, y: number): [number, number, number, number] {
  const i = (y * r.width + x) * 4;
  return [r.data[i] as number, r.data[i + 1] as number, r.data[i + 2] as number, r.data[i + 3] as number];
}

/**
 * Couleur moyenne (moyenne des canaux, pondérée par l'opacité ; un pixel transparent ne compte pas).
 * Renvoie aussi les moyennes exactes, avant arrondi.
 */
export function averageColor(r: Raster): { hex: string; mean: Rgb } {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sa = 0;
  const d = r.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] as number;
    sr += (d[i] as number) * a;
    sg += (d[i + 1] as number) * a;
    sb += (d[i + 2] as number) * a;
    sa += a;
  }
  if (sa === 0) return { hex: "#ffffff", mean: { r: 255, g: 255, b: 255 } };
  const mean = { r: sr / sa, g: sg / sa, b: sb / sa };
  return { hex: rgbToHex(mean), mean };
}

/** Empreinte des pixels (taille comprise) : deux images identiques ont la même. */
export function rasterHash(r: Raster): string {
  const head = new Uint8Array(8);
  new DataView(head.buffer).setUint32(0, r.width);
  new DataView(head.buffer).setUint32(4, r.height);
  const all = new Uint8Array(8 + r.data.length);
  all.set(head, 0);
  all.set(r.data, 8);
  return sha256Hex(all);
}
