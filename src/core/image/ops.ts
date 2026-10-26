// Retouches du plan Image (SPEC §7.3-7.6) : recadrer, retourner, pivoter, redresser, incliner, redimensionner,
// et l'échelle d'un tissu. Opérations pures : une image en entrée, une nouvelle image en sortie.
// Repère : x vers la droite, y vers le bas (pixels). Un angle positif tourne dans le sens inverse des aiguilles d'une
// montre, tel qu'on le voit à l'écran.

import type { Rgb } from "../color/color";
import { createRaster, type Raster } from "./raster";

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Background = Rgb;
export const WHITE: Background = { r: 255, g: 255, b: 255 };

// ---------------------------------------------------------------------------------------------------------------
// Recadrer, retourner, quarts de tour

/** Le rectangle ramené dans l'image et arrondi au pixel ; `null` s'il est vide. */
export function clampRect(r: Raster, rect: PixelRect): PixelRect | null {
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(r.width, Math.round(rect.x + rect.width));
  const y1 = Math.min(r.height, Math.round(rect.y + rect.height));
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function crop(r: Raster, rect: PixelRect): Raster {
  const c = clampRect(r, rect);
  if (!c) throw new RangeError("Cadre de recadrage vide");
  const out = createRaster(c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    const from = ((c.y + y) * r.width + c.x) * 4;
    out.data.set(r.data.subarray(from, from + c.width * 4), y * c.width * 4);
  }
  return out;
}

export function flip(r: Raster, axis: "horizontal" | "vertical"): Raster {
  const out = createRaster(r.width, r.height);
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const sx = axis === "horizontal" ? r.width - 1 - x : x;
      const sy = axis === "vertical" ? r.height - 1 - y : y;
      const s = (sy * r.width + sx) * 4;
      out.data.set(r.data.subarray(s, s + 4), (y * r.width + x) * 4);
    }
  }
  return out;
}

/** Quart de tour exact : +90 = sens inverse des aiguilles d'une montre, −90 = sens des aiguilles. */
export function rotateQuarter(r: Raster, direction: 90 | -90 | 180): Raster {
  if (direction === 180) return flip(flip(r, "horizontal"), "vertical");
  const out = createRaster(r.height, r.width);
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      // Sens horaire : (x, y) → (H − 1 − y, x) ; sens inverse : (x, y) → (y, W − 1 − x).
      const nx = direction === -90 ? r.height - 1 - y : y;
      const ny = direction === -90 ? x : r.width - 1 - x;
      const s = (y * r.width + x) * 4;
      out.data.set(r.data.subarray(s, s + 4), (ny * out.width + nx) * 4);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Transformations affines (rotation libre, inclinaison) : échantillonnage bilinéaire, fond choisi hors de l'image

/** Matrice 2 × 3 [a, b, c, d, e, f] : x' = a·x + c·y + e ; y' = b·x + d·y + f. */
type Affine = [number, number, number, number, number, number];

function invert([a, b, c, d, e, f]: Affine): Affine {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

function apply([a, b, c, d, e, f]: Affine, x: number, y: number): [number, number] {
  return [a * x + c * y + e, b * x + d * y + f];
}

function sampleBilinear(r: Raster, x: number, y: number, out: Uint8ClampedArray, at: number, bg: Background): void {
  // Centre des pixels en (i + ½, j + ½).
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  let rr = 0;
  let gg = 0;
  let bb = 0;
  let aa = 0;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const w = (i ? tx : 1 - tx) * (j ? ty : 1 - ty);
      if (w === 0) continue;
      const px = x0 + i;
      const py = y0 + j;
      if (px < 0 || py < 0 || px >= r.width || py >= r.height) {
        rr += bg.r * w;
        gg += bg.g * w;
        bb += bg.b * w;
        aa += 255 * w;
        continue;
      }
      const s = (py * r.width + px) * 4;
      rr += (r.data[s] as number) * w;
      gg += (r.data[s + 1] as number) * w;
      bb += (r.data[s + 2] as number) * w;
      aa += (r.data[s + 3] as number) * w;
    }
  }
  out[at] = rr;
  out[at + 1] = gg;
  out[at + 2] = bb;
  out[at + 3] = aa;
}

/** Applique une transformation ; la toile prend la taille demandée et la transformation y est recentrée. */
function transform(r: Raster, m: Affine, width: number, height: number, bg: Background): Raster {
  // Recentrage : le centre de l'image source va au centre de la nouvelle toile.
  const [cx, cy] = apply(m, r.width / 2, r.height / 2);
  const full: Affine = [m[0], m[1], m[2], m[3], m[4] + width / 2 - cx, m[5] + height / 2 - cy];
  const inv = invert(full);
  const out = createRaster(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [sx, sy] = apply(inv, x + 0.5, y + 0.5);
      sampleBilinear(r, sx, sy, out.data, (y * width + x) * 4, bg);
    }
  }
  return out;
}

function boundsOf(r: Raster, m: Affine): { width: number; height: number } {
  const corners = [apply(m, 0, 0), apply(m, r.width, 0), apply(m, 0, r.height), apply(m, r.width, r.height)];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const round = (v: number) => Math.max(1, Math.round(v - 1e-9));
  return { width: round(Math.max(...xs) - Math.min(...xs)), height: round(Math.max(...ys) - Math.min(...ys)) };
}

/**
 * Rotation libre (−360 à 360°). « Recadrer après rotation » décoché : la toile grandit pour montrer les quatre coins
 * (le fond comble les vides) ; coché : l'image garde ses dimensions et ce qui dépasse est coupé.
 */
export function rotate(r: Raster, degrees: number, background: Background = WHITE, cropAfter = false): Raster {
  const turns = ((degrees % 360) + 360) % 360;
  if (!cropAfter && (turns === 90 || turns === 180 || turns === 270)) return rotateQuarter(r, turns === 90 ? 90 : turns === 270 ? -90 : 180);
  if (turns === 0) return { ...r, data: new Uint8ClampedArray(r.data) };
  const t = (-degrees * Math.PI) / 180; // y vers le bas : l'angle visuel s'inverse
  const m: Affine = [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0];
  const size = cropAfter ? { width: r.width, height: r.height } : boundsOf(r, m);
  return transform(r, m, size.width, size.height, background);
}

/**
 * Incliner (SPEC §7.5, Q-7.3 : degrés de −45 à 45). Horizontal : le bas de l'image glisse vers la droite pour un angle
 * positif ; vertical : le côté droit monte. La toile s'agrandit pour tout montrer.
 */
export function shear(r: Raster, horizontalDegrees: number, verticalDegrees: number, background: Background = WHITE): Raster {
  if (Math.abs(horizontalDegrees) > 45 || Math.abs(verticalDegrees) > 45) throw new RangeError("Inclinaison de −45 à 45°");
  const kx = Math.tan((horizontalDegrees * Math.PI) / 180);
  const ky = -Math.tan((verticalDegrees * Math.PI) / 180);
  const m: Affine = [1, ky, kx, 1 + kx * ky, 0, 0];
  const size = boundsOf(r, m);
  return transform(r, m, size.width, size.height, background);
}

// ---------------------------------------------------------------------------------------------------------------
// Redresser (SPEC §7.5)

/**
 * L'angle de rotation qui rend horizontale ou verticale (la plus proche) une ligne tracée de `a` à `b` sur l'image
 * (pixels, y vers le bas). Une ligne qui monte de 3° vers la droite donne −3°.
 */
export function straightenAngle(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return 0;
  const seen = (Math.atan2(-dy, dx) * 180) / Math.PI; // angle tel qu'on le voit à l'écran
  // L'axe le plus proche (multiple de 90°), puis l'écart à rattraper.
  const target = Math.round(seen / 90) * 90;
  const correction = target - seen;
  return Math.abs(correction) < 1e-12 ? 0 : correction;
}

// ---------------------------------------------------------------------------------------------------------------
// Redimensionner (SPEC §7.3)

export type Resample = "normal" | "bilinear" | "bicubic";

function boxResize(r: Raster, width: number, height: number): Raster {
  // Moyenne pondérée des pixels source couverts par chaque pixel destination (réduction sans crénelage).
  const out = createRaster(width, height);
  const sx = r.width / width;
  const sy = r.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < width; x++) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      const acc = [0, 0, 0, 0];
      let total = 0;
      for (let j = Math.floor(y0); j < Math.min(r.height, Math.ceil(y1)); j++) {
        const wy = Math.min(j + 1, y1) - Math.max(j, y0);
        for (let i = Math.floor(x0); i < Math.min(r.width, Math.ceil(x1)); i++) {
          const w = (Math.min(i + 1, x1) - Math.max(i, x0)) * wy;
          if (w <= 0) continue;
          const s = (j * r.width + i) * 4;
          for (let k = 0; k < 4; k++) acc[k] = (acc[k] as number) + (r.data[s + k] as number) * w;
          total += w;
        }
      }
      const o = (y * width + x) * 4;
      for (let k = 0; k < 4; k++) out.data[o + k] = (acc[k] as number) / total;
    }
  }
  return out;
}

const cubic = (t: number): number => {
  const a = Math.abs(t);
  if (a <= 1) return 1.5 * a ** 3 - 2.5 * a ** 2 + 1;
  if (a < 2) return -0.5 * a ** 3 + 2.5 * a ** 2 - 4 * a + 2;
  return 0;
};

function interpolatedResize(r: Raster, width: number, height: number, kind: "bilinear" | "bicubic"): Raster {
  const out = createRaster(width, height);
  const sx = r.width / width;
  const sy = r.height / height;
  const radius = kind === "bilinear" ? 1 : 2;
  const kernel = kind === "bilinear" ? (t: number) => Math.max(0, 1 - Math.abs(t)) : cubic;
  for (let y = 0; y < height; y++) {
    const fy = (y + 0.5) * sy - 0.5;
    for (let x = 0; x < width; x++) {
      const fx = (x + 0.5) * sx - 0.5;
      const acc = [0, 0, 0, 0];
      let total = 0;
      for (let j = Math.floor(fy) - radius + 1; j <= Math.floor(fy) + radius; j++) {
        const wy = kernel(fy - j);
        if (wy === 0) continue;
        const cj = Math.min(r.height - 1, Math.max(0, j));
        for (let i = Math.floor(fx) - radius + 1; i <= Math.floor(fx) + radius; i++) {
          const w = kernel(fx - i) * wy;
          if (w === 0) continue;
          const ci = Math.min(r.width - 1, Math.max(0, i));
          const s = (cj * r.width + ci) * 4;
          for (let k = 0; k < 4; k++) acc[k] = (acc[k] as number) + (r.data[s + k] as number) * w;
          total += w;
        }
      }
      const o = (y * width + x) * 4;
      for (let k = 0; k < 4; k++) out.data[o + k] = (acc[k] as number) / total;
    }
  }
  return out;
}

/** Redimensionne en pixels. « Normal » fait la moyenne des pixels (pour réduire) ; les deux autres interpolent (pour agrandir). */
export function resize(r: Raster, width: number, height: number, method: Resample = "normal"): Raster {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError("Taille invalide");
  if (width === r.width && height === r.height) return { ...r, data: new Uint8ClampedArray(r.data) };
  if (method === "normal" && width <= r.width && height <= r.height) return boxResize(r, width, height);
  return interpolatedResize(r, width, height, method === "bicubic" ? "bicubic" : "bilinear");
}

// ---------------------------------------------------------------------------------------------------------------
// Échelle d'un tissu (SPEC §7.4, Q-7.2)

/** « Échelle du tissu » : l'image entière mesure `inches` de large ; renvoie la nouvelle résolution (ppp). */
export function ppiForWidth(widthPx: number, inches: number): number {
  if (!(inches > 0)) throw new RangeError("Largeur réelle invalide");
  return widthPx / inches;
}

/** Mode « mesurer une zone » : un segment de `lengthPx` pixels mesure `inches` en vrai. */
export function ppiForMeasure(lengthPx: number, inches: number): number {
  if (!(inches > 0) || !(lengthPx > 0)) throw new RangeError("Mesure invalide");
  return lengthPx / inches;
}

// ---------------------------------------------------------------------------------------------------------------
// Préréglages de recadrage (Q-7.4)

export interface CropPreset {
  id: string;
  label: string;
  /** Dimensions en pouces. */
  width: number;
  height: number;
}

const inchPresets: [number, number][] = [
  [2, 2],
  [3, 3],
  [4, 4],
  [5, 5],
  [6, 6],
  [4, 6],
  [5, 7],
];
const cmPresets: [number, number][] = [
  [5, 5],
  [7.5, 7.5],
  [10, 10],
  [12.5, 12.5],
  [15, 15],
  [10, 15],
  [13, 18],
];

export const CROP_PRESETS: CropPreset[] = [
  ...inchPresets.map(([w, h]) => ({ id: `in-${w}x${h}`, label: `${w} × ${h} po`, width: w, height: h })),
  ...cmPresets.map(([w, h]) => ({
    id: `cm-${w}x${h}`,
    label: `${String(w).replace(".", ",")} × ${String(h).replace(".", ",")} cm`,
    width: w / 2.54,
    height: h / 2.54,
  })),
];

/** Le cadre d'un préréglage, centré dans l'image ; `null` s'il est plus grand qu'elle (refusé). */
export function presetRect(preset: CropPreset, ppi: number, imageWidth: number, imageHeight: number): PixelRect | null {
  const width = Math.round(preset.width * ppi);
  const height = Math.round(preset.height * ppi);
  if (width > imageWidth || height > imageHeight || width < 1 || height < 1) return null;
  return { x: Math.floor((imageWidth - width) / 2), y: Math.floor((imageHeight - height) / 2), width, height };
}
