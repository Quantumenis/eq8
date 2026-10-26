// Retouche des couleurs de l'image (SPEC §7.8, §7.9) : équilibre, canaux, TSL, coloriser, accent, carte des teintes,
// mélangeur, gamme de couleurs, histogramme, égalisation, luminosité et contraste. Tout est pur : Raster → Raster.
// L'opacité (canal alpha) n'est jamais modifiée.

import { hexToRgb, hslToRgb, oklabToRgb, rgbToHex, rgbToHsl, rgbToOklab, type Rgb } from "../color/color";
import type { Raster } from "./raster";

const byte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Applique une fonction à chaque pixel (RVB) ; l'alpha est gardé. */
export function mapPixels(r: Raster, fn: (c: Rgb) => Rgb): Raster {
  const out = new Uint8ClampedArray(r.data.length);
  const d = r.data;
  for (let i = 0; i < d.length; i += 4) {
    const c = fn({ r: d[i] as number, g: d[i + 1] as number, b: d[i + 2] as number });
    out[i] = byte(c.r);
    out[i + 1] = byte(c.g);
    out[i + 2] = byte(c.b);
    out[i + 3] = d[i + 3] as number;
  }
  return { width: r.width, height: r.height, data: out };
}

const lum = (c: Rgb): number => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;

// ---------------------------------------------------------------------------------------------------------------
// Histogramme

export interface Histogram {
  r: number[];
  g: number[];
  b: number[];
  /** Luminance (0-255). */
  l: number[];
  count: number;
}

export function histogram(r: Raster): Histogram {
  const h: Histogram = { r: new Array(256).fill(0), g: new Array(256).fill(0), b: new Array(256).fill(0), l: new Array(256).fill(0), count: 0 };
  const d = r.data;
  for (let i = 0; i < d.length; i += 4) {
    if ((d[i + 3] as number) === 0) continue;
    const R = d[i] as number;
    const G = d[i + 1] as number;
    const B = d[i + 2] as number;
    (h.r[R] as number)++;
    (h.g[G] as number)++;
    (h.b[B] as number)++;
    (h.l[byte(lum({ r: R, g: G, b: B }))] as number)++;
    h.count++;
  }
  return h;
}

/** Histogramme cumulé normalisé (0 à 1) d'un canal. */
export function cumulative(bins: readonly number[]): number[] {
  const total = bins.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return bins.map((b) => (acc += b) / total);
}

function equalizeLut(bins: readonly number[]): number[] {
  const total = bins.reduce((a, b) => a + b, 0);
  if (total === 0) return bins.map((_, i) => i);
  const cdf = cumulative(bins);
  const first = cdf.find((v) => v > 0) ?? 0;
  const span = 1 - first;
  return cdf.map((v) => (span <= 0 ? 0 : byte(((v - first) / span) * 255)));
}

export type EqualizeMode = "rgb" | "yuv" | "gray";

/** Égalise l'histogramme : par canal (RVB), sur la luminance (YUV, recommandé) ou en niveaux de gris. */
export function equalize(r: Raster, mode: EqualizeMode): Raster {
  const h = histogram(r);
  if (mode === "rgb") {
    const lr = equalizeLut(h.r);
    const lg = equalizeLut(h.g);
    const lb = equalizeLut(h.b);
    return mapPixels(r, (c) => ({ r: lr[c.r] as number, g: lg[c.g] as number, b: lb[c.b] as number }));
  }
  if (mode === "gray") {
    const l = equalizeLut(h.l);
    return mapPixels(r, (c) => {
      const v = l[byte(lum(c))] as number;
      return { r: v, g: v, b: v };
    });
  }
  const l = equalizeLut(h.l);
  return mapPixels(r, (c) => {
    const y = lum(c);
    const u = c.b - y;
    const v = c.r - y;
    const y2 = l[byte(y)] as number;
    // On rend la couleur autour de la nouvelle luminance (U et V gardés).
    const R = y2 + v;
    const B = y2 + u;
    const G = (y2 - 0.299 * R - 0.114 * B) / 0.587;
    return { r: R, g: G, b: B };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Luminosité et contraste, préréglages

/** Luminosité et contraste de −100 à 100 (0 = inchangé). */
export function brightnessContrast(r: Raster, brightness: number, contrast: number): Raster {
  const b = Math.max(-100, Math.min(100, brightness)) * 2.55;
  const c = Math.max(-100, Math.min(100, contrast)) * 2.55;
  const f = (259 * (c + 255)) / (255 * (259 - c));
  return mapPixels(r, (p) => ({ r: f * (p.r + b - 128) + 128, g: f * (p.g + b - 128) + 128, b: f * (p.b + b - 128) + 128 }));
}

export const ADJUST_PRESETS = ["glow", "lighten", "warm", "pastel"] as const;
export type AdjustPreset = (typeof ADJUST_PRESETS)[number];

export function applyPreset(r: Raster, preset: AdjustPreset): Raster {
  switch (preset) {
    case "glow":
      return mapPixels(r, (c) => {
        const k = (v: number) => 255 * (v / 255) ** 0.75;
        return { r: k(c.r) * 1.04, g: k(c.g), b: k(c.b) * 0.97 };
      });
    case "lighten":
      return mapPixels(r, (c) => ({ r: 255 * (c.r / 255) ** 0.8, g: 255 * (c.g / 255) ** 0.8, b: 255 * (c.b / 255) ** 0.8 }));
    case "warm":
      return mapPixels(r, (c) => ({ r: c.r + 14, g: c.g + 4, b: c.b - 14 }));
    case "pastel":
      return shiftHsl(r, 0, -25, 12);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Équilibre, canaux, TSL

/** Équilibre automatique des couleurs : les sombres s'assombrissent, les clairs s'éclaircissent (étirement des niveaux). */
export function colorBalance(r: Raster, strength = 1): Raster {
  const h = histogram(r);
  const cut = (bins: readonly number[]): [number, number] => {
    const total = bins.reduce((a, b) => a + b, 0);
    if (total === 0) return [0, 255];
    let acc = 0;
    let lo = 0;
    for (let i = 0; i < 256; i++) {
      acc += bins[i] as number;
      if (acc >= total * 0.01) {
        lo = i;
        break;
      }
    }
    acc = 0;
    let hi = 255;
    for (let i = 255; i >= 0; i--) {
      acc += bins[i] as number;
      if (acc >= total * 0.01) {
        hi = i;
        break;
      }
    }
    return hi - lo < 8 ? [0, 255] : [lo, hi];
  };
  const [rl, rh] = cut(h.r);
  const [gl, gh] = cut(h.g);
  const [bl, bh] = cut(h.b);
  const k = Math.max(0, Math.min(1, strength));
  const stretch = (v: number, lo: number, hi: number) => v + (((v - lo) / (hi - lo)) * 255 - v) * k;
  return mapPixels(r, (c) => ({ r: stretch(c.r, rl, rh), g: stretch(c.g, gl, gh), b: stretch(c.b, bl, bh) }));
}

/** Décalages Rouge / Vert / Bleu (−255 à 255, 0 = inchangé). */
export function shiftRgb(r: Raster, dr: number, dg: number, db: number): Raster {
  return mapPixels(r, (c) => ({ r: c.r + dr, g: c.g + dg, b: c.b + db }));
}

/** Teinte (degrés), saturation et luminosité (−100 à 100 %) : 0 = inchangé. */
export function shiftHsl(r: Raster, dh: number, ds: number, dl: number): Raster {
  return mapPixels(r, (c) => {
    const hsl = rgbToHsl(c);
    const l = Math.max(0, Math.min(1, hsl.l + dl / 100));
    const s = Math.max(0, Math.min(1, ds >= 0 ? hsl.s + (1 - hsl.s) * (ds / 100) : hsl.s * (1 + ds / 100)));
    return hslToRgb({ h: (((hsl.h + dh) % 360) + 360) % 360, s, l });
  });
}

/** Image bicolore à partir d'une couleur et d'une intensité (0 à 1) : l'effet sépia. */
export function colorize(r: Raster, color: string, intensity: number): Raster {
  const base = rgbToHsl(hexToRgb(color));
  const k = Math.max(0, Math.min(1, intensity));
  return mapPixels(r, (c) => {
    const l = lum(c) / 255;
    const tinted = hslToRgb({ h: base.h, s: Math.max(0.05, base.s) * k, l });
    const g = lum(c);
    return { r: g + (tinted.r - g) * k, g: g + (tinted.g - g) * k, b: g + (tinted.b - g) * k };
  });
}

/** Accent de couleur : on garde la plage de teintes [from, to] (degrés, en tournant) ; le reste passe au gris (de `fade` à 1). */
export function colorAccent(r: Raster, from: number, to: number, fade = 1): Raster {
  const lo = ((from % 360) + 360) % 360;
  const span = (((to - from) % 360) + 360) % 360 || 360;
  return mapPixels(r, (c) => {
    const hsl = rgbToHsl(c);
    const inside = (((hsl.h - lo) % 360) + 360) % 360 <= span || hsl.s < 0.02;
    if (inside) return c;
    const g = lum(c);
    const k = Math.max(0, Math.min(1, fade));
    return { r: c.r + (g - c.r) * k, g: c.g + (g - c.g) * k, b: c.b + (g - c.b) * k };
  });
}

export interface HueMap {
  /** Pour chaque secteur de 30° (0 = 0-30°…), la teinte cible du début du secteur, ou `null` (inchangé). */
  targets: (number | null)[];
  saturation: number;
  lightness: number;
}

export const HUE_SECTORS = 12;

export function emptyHueMap(): HueMap {
  return { targets: new Array(HUE_SECTORS).fill(null), saturation: 0, lightness: 0 };
}

/** Carte des teintes : la roue de 12 secteurs de 30° ; chaque secteur choisi est amené vers sa teinte cible. */
export function applyHueMap(r: Raster, map: HueMap): Raster {
  return mapPixels(r, (c) => {
    const hsl = rgbToHsl(c);
    const sector = Math.min(HUE_SECTORS - 1, Math.floor(hsl.h / 30));
    const target = map.targets[sector];
    let h = hsl.h;
    if (target !== null && target !== undefined && hsl.s > 0.001) h = (((target + (hsl.h - sector * 30)) % 360) + 360) % 360;
    const s = Math.max(0, Math.min(1, map.saturation >= 0 ? hsl.s + (1 - hsl.s) * (map.saturation / 100) : hsl.s * (1 + map.saturation / 100)));
    const l = Math.max(0, Math.min(1, hsl.l + map.lightness / 100));
    return hslToRgb({ h, s, l });
  });
}

export type ChannelMatrix = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];
export const IDENTITY_MIX: ChannelMatrix = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Mélangeur de canaux : chaque ligne donne, pour un canal de sortie (R, V, B), la part de chaque canal d'entrée. */
export function channelMixer(r: Raster, m: ChannelMatrix): Raster {
  return mapPixels(r, (c) => ({
    r: m[0][0] * c.r + m[0][1] * c.g + m[0][2] * c.b,
    g: m[1][0] * c.r + m[1][1] * c.g + m[1][2] * c.b,
    b: m[2][0] * c.r + m[2][1] * c.g + m[2][2] * c.b,
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// Gamme de couleurs (Create Colorway)

export const COLORWAY_MAX = 4;

/** Analyse l'image en 1 à 4 couleurs dominantes (k-moyennes dans OKLab, départ déterministe). */
export function dominantColors(r: Raster, count: number, sample = 4000): string[] {
  const n = Math.max(1, Math.min(COLORWAY_MAX, Math.round(count)));
  const pts: { L: number; a: number; b: number }[] = [];
  const total = r.width * r.height;
  const step = Math.max(1, Math.floor(total / sample));
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    if ((r.data[i + 3] as number) === 0) continue;
    pts.push(rgbToOklab({ r: r.data[i] as number, g: r.data[i + 1] as number, b: r.data[i + 2] as number }));
  }
  if (pts.length === 0) return ["#ffffff"];
  // Départ : la luminosité la plus basse, puis les points les plus éloignés des centres déjà choisis.
  const centers = [pts.reduce((best, p) => (p.L < best.L ? p : best))];
  while (centers.length < n) {
    let far = pts[0] as (typeof pts)[number];
    let farD = -1;
    for (const p of pts) {
      const d = Math.min(...centers.map((c) => (p.L - c.L) ** 2 + (p.a - c.a) ** 2 + (p.b - c.b) ** 2));
      if (d > farD) {
        farD = d;
        far = p;
      }
    }
    if (farD <= 1e-9) break;
    centers.push(far);
  }
  for (let it = 0; it < 12; it++) {
    const sums = centers.map(() => ({ L: 0, a: 0, b: 0, n: 0 }));
    for (const p of pts) {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((c, k) => {
        const d = (p.L - c.L) ** 2 + (p.a - c.a) ** 2 + (p.b - c.b) ** 2;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      });
      const s = sums[best] as (typeof sums)[number];
      s.L += p.L;
      s.a += p.a;
      s.b += p.b;
      s.n++;
    }
    sums.forEach((s, k) => {
      if (s.n > 0) centers[k] = { L: s.L / s.n, a: s.a / s.n, b: s.b / s.n };
    });
  }
  return centers.map((c) => rgbToHex(oklabToRgb(c))).sort((a, b) => lum(hexToRgb(a)) - lum(hexToRgb(b)));
}

/**
 * Remplace chaque couleur dominante `from[i]` par `to[i]` : chaque pixel va vers la couleur dominante la plus proche et
 * en prend le décalage (les ombres et les lumières de l'image sont gardées).
 */
export function applyColorway(r: Raster, from: readonly string[], to: readonly string[]): Raster {
  const src = from.map((h) => rgbToOklab(hexToRgb(h)));
  const dst = to.map((h) => rgbToOklab(hexToRgb(h)));
  if (src.length === 0 || dst.length < src.length) return r;
  return mapPixels(r, (c) => {
    const p = rgbToOklab(c);
    let best = 0;
    let bestD = Infinity;
    src.forEach((s, k) => {
      const d = (p.L - s.L) ** 2 + (p.a - s.a) ** 2 + (p.b - s.b) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    const s = src[best] as (typeof src)[number];
    const t = dst[best] as (typeof dst)[number];
    return oklabToRgb({ L: Math.max(0, Math.min(1, p.L + (t.L - s.L))), a: p.a + (t.a - s.a), b: p.b + (t.b - s.b) });
  });
}

/** Une palette toute faite de 12 couleurs autour d'une roue : la teinte de départ, la saturation et la luminosité (0 à 1). */
export function readyPalette(startHue: number, saturation: number, lightness: number): string[] {
  return Array.from({ length: 12 }, (_, i) => rgbToHex(hslToRgb({ h: (startHue + i * 30) % 360, s: saturation, l: lightness })));
}

/** Palette aléatoire reproductible. */
export function randomPalette(seed: number, n = 4): string[] {
  let s = (seed >>> 0) || 1;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  return Array.from({ length: n }, () => rgbToHex(hslToRgb({ h: rnd() * 360, s: 0.35 + rnd() * 0.55, l: 0.3 + rnd() * 0.4 })));
}

/** Réarranger / décaler : permute circulairement l'attribution des couleurs. */
export function shiftAssignment<T>(items: readonly T[], by: number): T[] {
  if (items.length === 0) return [];
  const k = ((by % items.length) + items.length) % items.length;
  return [...items.slice(k), ...items.slice(0, k)];
}
