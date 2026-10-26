// PNG en TypeScript pur : encodage RVBA 8 bits (avec la résolution, bloc pHYs) et décodage des PNG non entrelacés.
// L'interface décode les images avec le navigateur ; ce module sert à écrire les images retouchées du plan Image et
// les tissus générés copiés vers Photos, et aux tests.

import { unzlibSync, zlibSync } from "fflate";
import { createRaster, type Raster } from "./raster";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const INCH_PER_METER = 39.37007874015748;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = (CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/** Pixels par mètre écrits dans pHYs pour une résolution en pixels par pouce. */
export function ppiToPpm(ppi: number): number {
  return Math.round(ppi * INCH_PER_METER);
}

/** Résolution relue d'un bloc pHYs : arrondie à l'entier quand l'écart vient seulement de la conversion en mètres. */
export function ppmToPpi(ppm: number): number {
  const ppi = ppm / INCH_PER_METER;
  return Math.abs(ppi - Math.round(ppi)) < 0.05 ? Math.round(ppi) : Math.round(ppi * 100) / 100;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Encode une image RVBA en PNG ; `ppi` est enregistré dans le fichier (bloc pHYs). Le résultat est déterministe. */
export function encodePng(raster: Raster, ppi?: number): Uint8Array {
  const { width, height, data } = raster;
  const stride = width * 4;
  const filtered = new Uint8Array((stride + 1) * height);
  const candidates = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const prev = y > 0 ? row - stride : -1;
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const line = candidates[f] as Uint8Array;
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const x = data[row + i] as number;
        const a = i >= 4 ? (data[row + i - 4] as number) : 0;
        const b = prev >= 0 ? (data[prev + i] as number) : 0;
        const c = prev >= 0 && i >= 4 ? (data[prev + i - 4] as number) : 0;
        const v = f === 0 ? x : f === 1 ? x - a : f === 2 ? x - b : f === 3 ? x - ((a + b) >> 1) : x - paeth(a, b, c);
        const byte = v & 0xff;
        line[i] = byte;
        score += byte < 128 ? byte : 256 - byte;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    filtered[y * (stride + 1)] = best;
    filtered.set(candidates[best] as Uint8Array, y * (stride + 1) + 1);
  }

  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RVBA
  const parts: Uint8Array[] = [new Uint8Array(SIGNATURE), chunk("IHDR", ihdr)];
  if (ppi !== undefined && ppi > 0) {
    const phys = new Uint8Array(9);
    const pv = new DataView(phys.buffer);
    pv.setUint32(0, ppiToPpm(ppi));
    pv.setUint32(4, ppiToPpm(ppi));
    phys[8] = 1; // unité : le mètre
    parts.push(chunk("pHYs", phys));
  }
  parts.push(chunk("IDAT", zlibSync(filtered, { level: 6 })), chunk("IEND", new Uint8Array(0)));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && SIGNATURE.every((b, i) => bytes[i] === b);
}

interface PngChunk {
  type: string;
  data: Uint8Array;
}

function* chunks(bytes: Uint8Array): Generator<PngChunk> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (at + 12 + length > bytes.length) throw new Error("PNG tronqué");
    yield { type, data: bytes.subarray(at + 8, at + 8 + length) };
    if (type === "IEND") return;
    at += 12 + length;
  }
}

export interface PngHeader {
  width: number;
  height: number;
  /** Résolution en pixels par pouce (bloc pHYs en mètres), ou `null` si le fichier n'en donne pas. */
  ppi: number | null;
}

/** En-tête d'un PNG (taille et résolution) sans décoder les pixels. */
export function readPngHeader(bytes: Uint8Array): PngHeader {
  if (!isPng(bytes)) throw new Error("Ce fichier n'est pas un PNG");
  let width = 0;
  let height = 0;
  let ppi: number | null = null;
  for (const c of chunks(bytes)) {
    const v = new DataView(c.data.buffer, c.data.byteOffset, c.data.byteLength);
    if (c.type === "IHDR") {
      width = v.getUint32(0);
      height = v.getUint32(4);
    } else if (c.type === "pHYs" && c.data.length >= 9 && c.data[8] === 1) {
      const ppm = v.getUint32(0);
      if (ppm > 0) ppi = ppmToPpi(ppm);
    } else if (c.type === "IDAT") break;
  }
  if (width === 0 || height === 0) throw new Error("PNG sans en-tête");
  return { width, height, ppi };
}

/** Décode un PNG non entrelacé (toutes profondeurs et tous types de couleur) en RVBA 8 bits. */
export function decodePng(bytes: Uint8Array): Raster {
  if (!isPng(bytes)) throw new Error("Ce fichier n'est pas un PNG");
  let width = 0;
  let height = 0;
  let depth = 8;
  let colorType = 6;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  for (const c of chunks(bytes)) {
    if (c.type === "IHDR") {
      const v = new DataView(c.data.buffer, c.data.byteOffset, c.data.byteLength);
      width = v.getUint32(0);
      height = v.getUint32(4);
      depth = c.data[8] as number;
      colorType = c.data[9] as number;
      interlace = c.data[12] as number;
    } else if (c.type === "PLTE") palette = c.data;
    else if (c.type === "tRNS") trns = c.data;
    else if (c.type === "IDAT") idat.push(c.data);
  }
  if (interlace !== 0) throw new Error("PNG entrelacé non pris en charge");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error("Type de couleur PNG inconnu");
  const raster = createRaster(width, height);
  const joined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let at = 0;
  for (const d of idat) {
    joined.set(d, at);
    at += d.length;
  }
  const raw = unzlibSync(joined);
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((width * channels * depth) / 8);
  let prev = new Uint8Array(stride);
  let line = new Uint8Array(stride);
  const max = (1 << depth) - 1;
  for (let y = 0; y < height; y++) {
    const base = y * (stride + 1);
    const filter = raw[base] as number;
    for (let i = 0; i < stride; i++) {
      const x = raw[base + 1 + i] as number;
      const a = i >= bpp ? (line[i - bpp] as number) : 0;
      const b = prev[i] as number;
      const c = i >= bpp ? (prev[i - bpp] as number) : 0;
      line[i] = (filter === 0 ? x : filter === 1 ? x + a : filter === 2 ? x + b : filter === 3 ? x + ((a + b) >> 1) : x + paeth(a, b, c)) & 0xff;
    }
    const sample = (index: number): number => {
      if (depth === 8) return line[index] as number;
      if (depth === 16) return line[index * 2] as number;
      const bit = index * depth;
      return ((line[bit >> 3] as number) >> (8 - depth - (bit & 7))) & max;
    };
    const scale = (v: number) => (depth >= 8 ? v : Math.round((v * 255) / max));
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let r: number;
      let g: number;
      let bl: number;
      let al = 255;
      if (colorType === 3) {
        const p = sample(x);
        r = palette?.[p * 3] ?? 0;
        g = palette?.[p * 3 + 1] ?? 0;
        bl = palette?.[p * 3 + 2] ?? 0;
        al = trns && p < trns.length ? (trns[p] as number) : 255;
      } else if (colorType === 0 || colorType === 4) {
        r = g = bl = scale(sample(x * channels));
        if (colorType === 4) al = scale(sample(x * channels + 1));
      } else {
        r = scale(sample(x * channels));
        g = scale(sample(x * channels + 1));
        bl = scale(sample(x * channels + 2));
        if (colorType === 6) al = scale(sample(x * channels + 3));
      }
      raster.data[o] = r;
      raster.data[o + 1] = g;
      raster.data[o + 2] = bl;
      raster.data[o + 3] = al;
    }
    [prev, line] = [line, prev];
  }
  return raster;
}
