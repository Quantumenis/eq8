// Générateur de tissus (SPEC §8.1, PLAN M4) : chaque tissu généré est un motif qui se répète (une « tuile »), décrit
// par un générateur, une graine et des paramètres, et rendu à l'échelle réelle (la taille de la tuile est en pouces).
// Le rendu est déterministe : même description, même résolution → mêmes pixels, même empreinte.

import { hexToOklab, hexToRgb, oklabToHex, parseHex, type Rgb } from "../color/color";
import type { FabricSource, JsonValue } from "../project/model";
import { averageColor, createRaster, rasterHash, type Raster } from "../image/raster";

export const GENERATORS = ["solid", "stripes", "dots", "checks", "gingham", "tartan", "noise", "gradient"] as const;
export type GeneratorId = (typeof GENERATORS)[number];

/** Résolution du rendu d'un tissu généré (pixels par pouce). */
export const GENERATED_PPI = 96;
/** Plafond de pixels d'une tuile générée (au-delà, la résolution baisse). */
const MAX_TILE_PIXELS = 1_200_000;

type Params = { [key: string]: JsonValue };
type GeneratedSource = Extract<FabricSource, { kind: "generated" }>;

export interface RenderedFabric {
  raster: Raster;
  /** Résolution effective de la tuile (pixels par pouce). */
  ppi: number;
  /** Taille réelle de la tuile, en pouces. */
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Lecture prudente des paramètres (ils viennent d'un fichier)

function num(p: Params, key: string, fallback: number, min: number, max: number): number {
  const v = p[key];
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function color(p: Params, key: string, fallback: string): string {
  const v = p[key];
  return (typeof v === "string" && parseHex(v)) || fallback;
}

function colors(p: Params, key: string, fallback: string[]): string[] {
  const v = p[key];
  if (!Array.isArray(v)) return fallback;
  const list = v.map((c) => (typeof c === "string" ? parseHex(c) : null)).filter((c): c is string => c !== null);
  return list.length > 0 ? list.slice(0, 16) : fallback;
}

function numbers(p: Params, key: string, fallback: number[], min: number, max: number): number[] {
  const v = p[key];
  if (!Array.isArray(v)) return fallback;
  const list = v.filter((n): n is number => typeof n === "number" && Number.isFinite(n)).map((n) => Math.min(max, Math.max(min, n)));
  return list.length > 0 ? list.slice(0, 32) : fallback;
}

function text<T extends string>(p: Params, key: string, allowed: readonly T[], fallback: T): T {
  const v = p[key];
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

// ---------------------------------------------------------------------------------------------------------------
// Hasard reproductible

/** Générateur pseudo-aléatoire mulberry32 : une graine 32 bits, une suite toujours identique. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Description d'un motif : une fonction couleur(x, y) en pouces sur une tuile

interface Pattern {
  width: number;
  height: number;
  /** Couleur au point (x, y) de la tuile, en pouces. */
  at: (x: number, y: number) => Rgb;
  /** Nombre de sous-échantillons par axe (anticrénelage des bords nets). */
  samples: number;
  /** Résolution utile maximale : un motif doux (marbré, ombré) n'a pas besoin d'être rendu finement. */
  maxPpi?: number;
}

const mix = (p: Rgb, q: Rgb, t: number): Rgb => ({ r: p.r + (q.r - p.r) * t, g: p.g + (q.g - p.g) * t, b: p.b + (q.b - p.b) * t });
const mod = (v: number, m: number): number => ((v % m) + m) % m;

function solid(p: Params): Pattern {
  const c = hexToRgb(color(p, "color", "#cccccc"));
  return { width: 1, height: 1, at: () => c, samples: 1 };
}

/** Rayures : une suite de bandes (couleurs et largeurs en pouces), verticales, horizontales ou en diagonale. */
function stripes(p: Params): Pattern {
  const cs = colors(p, "colors", ["#1e66c8", "#ffffff"]).map(hexToRgb);
  const widths = numbers(p, "widths", [0.25, 0.25], 0.02, 12);
  const direction = text(p, "direction", ["vertical", "horizontal", "diagonal"] as const, "vertical");
  const bands = cs.map((c, i) => ({ c, w: widths[i % widths.length] as number }));
  const period = bands.reduce((s, b) => s + b.w, 0);
  const bandAt = (u: number): Rgb => {
    let v = mod(u, period);
    for (const b of bands) {
      if (v < b.w) return b.c;
      v -= b.w;
    }
    return (bands.at(-1) as { c: Rgb }).c;
  };
  if (direction === "diagonal") {
    const side = period * Math.SQRT2;
    return { width: side, height: side, at: (x, y) => bandAt((x + y) / Math.SQRT2), samples: 4 };
  }
  const square = Math.max(period, 0.5);
  return direction === "vertical"
    ? { width: period, height: square, at: (x) => bandAt(x), samples: 4 }
    : { width: square, height: period, at: (_x, y) => bandAt(y), samples: 4 };
}

/** Pois : des disques réguliers (en quinconce ou non) sur un fond. */
function dots(p: Params): Pattern {
  const ground = hexToRgb(color(p, "ground", "#14284b"));
  const dot = hexToRgb(color(p, "dot", "#ffffff"));
  const spacing = num(p, "spacing", 0.5, 0.05, 12);
  const radius = num(p, "radius", spacing / 6, 0.005, spacing / 2);
  const staggered = p.staggered !== false;
  const centers = staggered
    ? [
        [0, 0],
        [spacing, 0],
        [0, spacing],
        [spacing, spacing],
        [spacing / 2, spacing / 2],
      ]
    : [
        [spacing / 2, spacing / 2],
      ];
  return {
    width: spacing,
    height: spacing,
    at: (x, y) => (centers.some(([cx, cy]) => (x - (cx as number)) ** 2 + (y - (cy as number)) ** 2 <= radius * radius) ? dot : ground),
    samples: 4,
  };
}

/** Damier : deux couleurs en cases carrées. */
function checks(p: Params): Pattern {
  const a = hexToRgb(color(p, "a", "#000000"));
  const b = hexToRgb(color(p, "b", "#ffffff"));
  const size = num(p, "size", 0.5, 0.02, 12);
  return { width: 2 * size, height: 2 * size, at: (x, y) => ((Math.floor(x / size) + Math.floor(y / size)) % 2 === 0 ? a : b), samples: 2 };
}

/** Vichy : bandes croisées d'une couleur sur un fond ; un croisement est plein, une seule bande est à moitié. */
function gingham(p: Params): Pattern {
  const c = hexToRgb(color(p, "color", "#c62828"));
  const ground = hexToRgb(color(p, "ground", "#ffffff"));
  const size = num(p, "size", 0.25, 0.02, 12);
  const half = mix(ground, c, 0.5);
  return {
    width: 2 * size,
    height: 2 * size,
    at: (x, y) => {
      const v = x < size;
      const h = y < size;
      return v && h ? c : v || h ? half : ground;
    },
    samples: 2,
  };
}

/** Écossais : une « armure » symétrique de bandes (couleur, largeur) dans les deux sens, tissée en sergé. */
function tartan(p: Params): Pattern {
  const cs = colors(p, "colors", ["#1b4d3e", "#14284b", "#c62828"]).map(hexToRgb);
  const widths = numbers(p, "widths", [0.5, 0.375, 0.0625], 0.01, 6);
  const half = cs.map((c, i) => ({ c, w: widths[i % widths.length] as number }));
  const sett = [...half, ...[...half].reverse()];
  const period = sett.reduce((s, b) => s + b.w, 0);
  const bandAt = (u: number): Rgb => {
    let v = mod(u, period);
    for (const b of sett) {
      if (v < b.w) return b.c;
      v -= b.w;
    }
    return (sett.at(-1) as { c: Rgb }).c;
  };
  const thread = Math.max(period / 96, 1 / 64);
  return {
    width: period,
    height: period,
    at: (x, y) => {
      // Sergé 2/2 : un fil sur deux en diagonale montre la chaîne, sinon la trame ; vu de loin, un mélange.
      const twill = mod(Math.floor(x / thread) + Math.floor(y / thread), 4) < 2;
      return mix(bandAt(x), bandAt(y), twill ? 0.35 : 0.65);
    },
    samples: 2,
  };
}

/** Bruit de valeur périodique (la tuile se raccorde sans couture), en plusieurs octaves. */
function periodicNoise(seed: number, cells: number, octaves: number): (u: number, v: number) => number {
  const layers = Array.from({ length: octaves }, (_, o) => {
    const n = cells * 2 ** o;
    const rand = mulberry32((seed ^ (0x9e3779b9 * (o + 1))) >>> 0);
    const grid = Float64Array.from({ length: n * n }, () => rand());
    return { n, grid, weight: 0.5 ** o };
  });
  const total = layers.reduce((s, l) => s + l.weight, 0);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (u, v) => {
    let sum = 0;
    for (const { n, grid, weight } of layers) {
      const x = mod(u, 1) * n;
      const y = mod(v, 1) * n;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const tx = smooth(x - x0);
      const ty = smooth(y - y0);
      const g = (i: number, j: number) => grid[mod(j, n) * n + mod(i, n)] as number;
      const top = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * tx;
      const bottom = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * tx;
      sum += (top + (bottom - top) * ty) * weight;
    }
    return sum / total;
  };
}

/** Marbré (faux-uni, batik) : deux couleurs mêlées par un bruit reproductible. */
function noise(p: Params, seed: number): Pattern {
  const base = hexToRgb(color(p, "base", "#1e66c8"));
  const accent = hexToRgb(color(p, "accent", "#14284b"));
  const size = num(p, "size", 4, 0.5, 24);
  const contrast = num(p, "contrast", 1, 0.1, 3);
  const n = periodicNoise(seed, Math.max(2, Math.round(num(p, "cells", 4, 1, 16))), 4);
  return {
    width: size,
    height: size,
    at: (x, y) => {
      const v = n(x / size, y / size);
      const t = Math.min(1, Math.max(0, 0.5 + (v - 0.5) * 2.2 * contrast));
      return mix(base, accent, t);
    },
    samples: 1,
    maxPpi: 48,
  };
}

/** Dégradé (ombré) : de la première couleur à la seconde puis retour, sur toute la largeur de la tuile (OKLab). */
function gradient(p: Params): Pattern {
  const from = hexToOklab(color(p, "from", "#14284b"));
  const to = hexToOklab(color(p, "to", "#81c7f0"));
  const width = num(p, "width", 40, 2, 120);
  const steps = 256;
  const ramp = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return hexToRgb(oklabToHex({ L: from.L + (to.L - from.L) * t, a: from.a + (to.a - from.a) * t, b: from.b + (to.b - from.b) * t }));
  });
  return {
    width,
    height: 2,
    at: (x) => {
      const t = 1 - Math.abs(1 - (2 * mod(x, width)) / width); // aller-retour : la tuile se raccorde
      return ramp[Math.round(t * steps)] as Rgb;
    },
    samples: 1,
    maxPpi: 16,
  };
}

function patternOf(source: GeneratedSource): Pattern {
  const p = source.params;
  switch (source.generator as GeneratorId) {
    case "stripes":
      return stripes(p);
    case "dots":
      return dots(p);
    case "checks":
      return checks(p);
    case "gingham":
      return gingham(p);
    case "tartan":
      return tartan(p);
    case "noise":
      return noise(p, source.seed);
    case "gradient":
      return gradient(p);
    default:
      return solid(p);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Rendu

/** Rend la tuile d'un tissu généré à la résolution demandée (abaissée si la tuile serait trop grande). */
export function renderGenerated(source: GeneratedSource, ppi = GENERATED_PPI): RenderedFabric {
  const pattern = patternOf(source);
  let res = Math.min(ppi, pattern.maxPpi ?? ppi);
  if (pattern.width * pattern.height * res * res > MAX_TILE_PIXELS) res = Math.sqrt(MAX_TILE_PIXELS / (pattern.width * pattern.height));
  const w = Math.max(1, Math.round(pattern.width * res));
  const h = Math.max(1, Math.round(pattern.height * res));
  // La tuile fait un nombre entier de pixels : la résolution effective peut différer un peu selon l'axe ;
  // on garde celle de la largeur (l'écart est inférieur à un pixel par tuile).
  const sx = pattern.width / w;
  const sy = pattern.height / h;
  const raster = createRaster(w, h);
  const n = pattern.samples;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const c = pattern.at((x + (i + 0.5) / n) * sx, (y + (j + 0.5) / n) * sy);
          r += c.r;
          g += c.g;
          b += c.b;
        }
      }
      const o = (y * w + x) * 4;
      const k = n * n;
      raster.data[o] = r / k;
      raster.data[o + 1] = g / k;
      raster.data[o + 2] = b / k;
      raster.data[o + 3] = 255;
    }
  }
  return { raster, ppi: w / pattern.width, width: pattern.width, height: pattern.height };
}

/** Couleur moyenne d'un tissu généré (rendu à basse résolution, suréchantillonné : la moyenne n'en dépend presque pas). */
export function generatedAverage(source: GeneratedSource): string {
  return averageColor(renderGenerated(source, 24).raster).hex;
}

/** Empreinte du rendu d'un tissu généré à une résolution donnée (sert aux tests de déterminisme et aux caches). */
export function generatedHash(source: GeneratedSource, ppi = GENERATED_PPI): string {
  return rasterHash(renderGenerated(source, ppi).raster);
}
