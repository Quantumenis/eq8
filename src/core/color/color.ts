// Couleurs (SPEC §5.10, §5.12, §5.13) : conversions RVB, TSV, TSL et OKLab, gammes (nuances & teintes, tons,
// dégradés), tri automatique et distances. Les couleurs du projet s'écrivent « #rrggbb » (minuscules).

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Teinte en degrés (0-360), saturation et valeur (ou luminosité) de 0 à 1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export interface Lab {
  L: number;
  a: number;
  b: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const clampByte = (v: number): number => Math.min(255, Math.max(0, Math.round(v)));

// ---------------------------------------------------------------------------------------------------------------
// Écriture hexadécimale

/** « #rgb », « #rrggbb » ou « rrggbb » (casse indifférente) → « #rrggbb », ou `null` si la saisie n'en est pas une. */
export function parseHex(text: string): string | null {
  const s = text.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`;
  if (/^[0-9a-f]{3}$/.test(s)) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  return null;
}

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("")}`;
}

// ---------------------------------------------------------------------------------------------------------------
// TSV et TSL

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  return { h: hueOf(R, G, B, max, d), s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: clampByte(f(5) * 255), g: clampByte(f(3) * 255), b: clampByte(f(1) * 255) };
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: hueOf(R, G, B, max, d), s: clamp01(s), l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: clampByte(f(0) * 255), g: clampByte(f(8) * 255), b: clampByte(f(4) * 255) };
}

function hueOf(R: number, G: number, B: number, max: number, d: number): number {
  if (d === 0) return 0;
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

// ---------------------------------------------------------------------------------------------------------------
// OKLab (Björn Ottosson, 2020) : un espace où les écarts suivent mieux la perception.

const toLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;

export function rgbToOklab({ r, g, b }: Rgb): Lab {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLab → RVB linéaire (non borné : sert à savoir si la couleur tient dans l'écran). */
function oklabToLinear({ L, a, b }: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function oklabToRgb(lab: Lab): Rgb {
  const [r, g, b] = oklabToLinear(lab);
  return { r: clampByte(fromLinear(clamp01(r))), g: clampByte(fromLinear(clamp01(g))), b: clampByte(fromLinear(clamp01(b))) };
}

function inGamut(lab: Lab): boolean {
  return oklabToLinear(lab).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
}

/** Ramène une couleur dans l'écran en réduisant sa saturation (chroma) à luminosité et teinte constantes. */
function toGamut(lab: Lab): Lab {
  if (inGamut(lab)) return lab;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ L: lab.L, a: lab.a * mid, b: lab.b * mid })) lo = mid;
    else hi = mid;
  }
  return { L: lab.L, a: lab.a * lo, b: lab.b * lo };
}

export const hexToOklab = (hex: string): Lab => rgbToOklab(hexToRgb(hex));
export const oklabToHex = (lab: Lab): string => rgbToHex(oklabToRgb(toGamut(lab)));

// ---------------------------------------------------------------------------------------------------------------
// Distances

/** Distance euclidienne en RVB 0-255 (au plus ≈ 441), la métrique de la tolérance « correspondance » (Q-5.6). */
export function rgbDistance(a: string, b: string): number {
  const p = hexToRgb(a);
  const q = hexToRgb(b);
  return Math.hypot(p.r - q.r, p.g - q.g, p.b - q.b);
}

/** Écart perçu (distance OKLab × 100, comparable à un ΔE) : sert à la recherche par couleur. */
export function perceptualDistance(a: string, b: string): number {
  const p = hexToOklab(a);
  const q = hexToOklab(b);
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b) * 100;
}

// ---------------------------------------------------------------------------------------------------------------
// Gammes (SPEC §5.13, Q-5.4 : 4 à 16 couleurs, 8 au départ, mélange OKLab)

export const RAMP_MIN = 4;
export const RAMP_MAX = 16;
export const RAMP_DEFAULT = 8;

export type RampKind = "shades" | "tones" | "grades";

function checkCount(n: number): number {
  if (!Number.isInteger(n) || n < RAMP_MIN || n > RAMP_MAX) throw new RangeError(`Gamme de ${RAMP_MIN} à ${RAMP_MAX} couleurs`);
  return n;
}

const mixLab = (p: Lab, q: Lab, t: number): Lab => ({ L: p.L + (q.L - p.L) * t, a: p.a + (q.a - p.a) * t, b: p.b + (q.b - p.b) * t });

/** Dégradé de `from` (à gauche) vers `to` (à droite) en `n` couleurs ; les extrémités sont exactement les deux couleurs. */
export function grades(from: string, to: string, n = RAMP_DEFAULT): string[] {
  checkCount(n);
  const p = hexToOklab(from);
  const q = hexToOklab(to);
  return Array.from({ length: n }, (_, i) => (i === 0 ? from.toLowerCase() : i === n - 1 ? to.toLowerCase() : oklabToHex(mixLab(p, q, i / (n - 1)))));
}

/** Les luminosités extrêmes d'une gamme Nuances & teintes (presque noir, presque blanc). */
const SHADE_L = 0.18;
const TINT_L = 0.96;

/**
 * Nuances & teintes : du plus foncé au plus clair, la teinte de la couleur gardée. La couleur elle-même prend la place
 * que lui donne sa luminosité ; vers les extrémités, la saturation diminue (le noir et le blanc n'en ont pas).
 */
export function shadesAndTints(color: string, n = RAMP_DEFAULT): string[] {
  checkCount(n);
  const c = hexToOklab(color);
  const Lc = Math.min(TINT_L - 0.02, Math.max(SHADE_L + 0.02, c.L));
  return Array.from({ length: n }, (_, i) => {
    const L = SHADE_L + ((TINT_L - SHADE_L) * i) / (n - 1);
    const k = L <= Lc ? (L - SHADE_L) / (Lc - SHADE_L) : (TINT_L - L) / (TINT_L - Lc);
    const chroma = 0.25 + 0.75 * clamp01(k);
    return oklabToHex({ L, a: c.a * chroma, b: c.b * chroma });
  });
}

/** Tons : la couleur (à gauche) de plus en plus grise, à luminosité égale. */
export function tones(color: string, n = RAMP_DEFAULT): string[] {
  checkCount(n);
  const c = hexToOklab(color);
  return Array.from({ length: n }, (_, i) => (i === 0 ? color.toLowerCase() : oklabToHex({ L: c.L, a: c.a * (1 - i / (n - 1)), b: c.b * (1 - i / (n - 1)) })));
}

/** La couleur à insérer avant `index` dans une gamme (Insérer) : le milieu OKLab avec sa voisine de gauche. */
export function insertInRamp(ramp: readonly string[], index: number): string[] {
  if (ramp.length >= RAMP_MAX || index < 0 || index >= ramp.length) return [...ramp];
  const right = ramp[index] as string;
  const left = ramp[index - 1];
  const color = left ? oklabToHex(mixLab(hexToOklab(left), hexToOklab(right), 0.5)) : right;
  return [...ramp.slice(0, index), color, ...ramp.slice(index)];
}

// ---------------------------------------------------------------------------------------------------------------
// Tri automatique (SPEC §5.10, Q-5.3)

export type ColorSortKey = "hue" | "lightness" | "saturation";
export type SortDirection = "asc" | "desc";

/** En dessous de cette saturation (TSL), une couleur est un gris : le tri automatique les regroupe à part, en fin. */
export const GREY_SATURATION = 0.08;

export function isGrey(hex: string): boolean {
  const { s, l } = rgbToHsl(hexToRgb(hex));
  return s < GREY_SATURATION || l < 0.04 || l > 0.98;
}

/**
 * Ordre des éléments triés par teinte, luminosité (OKLab) ou saturation. Les gris viennent après les couleurs, du
 * plus clair au plus foncé (ou l'inverse en ordre décroissant). Le tri est stable.
 */
export function sortColors<T>(items: readonly T[], rgbOf: (item: T) => string, key: ColorSortKey, direction: SortDirection): T[] {
  const sign = direction === "asc" ? 1 : -1;
  const measured = items.map((item, index) => {
    const hex = rgbOf(item);
    const hsl = rgbToHsl(hexToRgb(hex));
    const value = key === "hue" ? hsl.h : key === "lightness" ? hexToOklab(hex).L : hsl.s;
    return { item, index, grey: isGrey(hex), value, light: hexToOklab(hex).L };
  });
  measured.sort((x, y) => {
    if (x.grey !== y.grey) return x.grey ? 1 : -1;
    const d = x.grey ? sign * (y.light - x.light) : sign * (x.value - y.value);
    return d !== 0 ? d : x.index - y.index;
  });
  return measured.map((m) => m.item);
}

/** Luminance relative (WCAG) : sert à choisir un texte lisible sur une couleur. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}
