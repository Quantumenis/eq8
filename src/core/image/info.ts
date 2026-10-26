// Ce qu'on lit d'un fichier image sans le décoder : son type, sa taille en pixels et sa résolution (SPEC §7.1).
// JPEG : bloc JFIF (APP0) puis, à défaut, EXIF (APP1, XResolution) ; PNG : bloc pHYs. Q-7.1 : 75 ppp par défaut.

import { isPng, readPngHeader } from "./png";

/** Résolution supposée d'une image qui n'en déclare pas (Q-7.1 : la recommandation du manuel pour les tissus). */
export const DEFAULT_PPI = 75;
/** Résolutions acceptées ; une valeur hors de cette plage est ignorée (fichier mal renseigné). */
export const MIN_PPI = 10;
export const MAX_PPI = 4800;

export type ImageMime = "image/png" | "image/jpeg";

export interface ImageInfo {
  mime: ImageMime;
  width: number;
  height: number;
  /** Résolution déclarée par le fichier, ou `null`. */
  declaredPpi: number | null;
  /** Résolution retenue : la déclarée si elle est plausible, sinon 75. */
  ppi: number;
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function sniffMime(bytes: Uint8Array): ImageMime | null {
  if (isPng(bytes)) return "image/png";
  if (isJpeg(bytes)) return "image/jpeg";
  return null;
}

function plausible(ppi: number | null): number | null {
  return ppi !== null && Number.isFinite(ppi) && ppi >= MIN_PPI && ppi <= MAX_PPI ? ppi : null;
}

const roundPpi = (v: number): number => (Math.abs(v - Math.round(v)) < 0.05 ? Math.round(v) : Math.round(v * 100) / 100);

/** Résolution d'un bloc EXIF (TIFF) : XResolution et ResolutionUnit de l'IFD0. */
function exifPpi(tiff: Uint8Array): number | null {
  if (tiff.length < 8) return null;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return null;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  let resolution: number | null = null;
  let unit = 2;
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    const tag = u16(entry);
    if (tag === 0x011a) {
      const at = u32(entry + 8);
      if (at + 8 <= tiff.length) {
        const den = u32(at + 4);
        if (den > 0) resolution = u32(at) / den;
      }
    } else if (tag === 0x0128) {
      unit = u16(entry + 8);
    }
  }
  if (resolution === null) return null;
  if (unit === 3) return roundPpi(resolution * 2.54);
  if (unit === 2) return roundPpi(resolution);
  return null;
}

function readJpeg(bytes: Uint8Array): { width: number; height: number; ppi: number | null } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  let jfif: number | null = null;
  let exif: number | null = null;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = bytes[at + 1] as number;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    const length = view.getUint16(at + 2);
    const body = bytes.subarray(at + 4, at + 2 + length);
    if (marker === 0xe0 && body.length >= 12 && String.fromCharCode(...body.subarray(0, 5)) === "JFIF\0") {
      const units = body[7] as number;
      const density = (((body[8] as number) << 8) | (body[9] as number)) >>> 0;
      if (density > 0 && units === 1) jfif = density;
      if (density > 0 && units === 2) jfif = roundPpi(density * 2.54);
    } else if (marker === 0xe1 && body.length > 14 && String.fromCharCode(...body.subarray(0, 4)) === "Exif") {
      exif = exifPpi(body.subarray(6));
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (body.length >= 5) {
        const height = view.getUint16(at + 5);
        const width = view.getUint16(at + 7);
        return { width, height, ppi: plausible(jfif) ?? plausible(exif) };
      }
    } else if (marker === 0xda || marker === 0xd9) {
      break;
    }
    at += 2 + length;
  }
  throw new Error("JPEG sans dimensions");
}

/** Lit le type, la taille et la résolution d'une image ; lève une erreur pour un format non pris en charge. */
export function readImageInfo(bytes: Uint8Array): ImageInfo {
  const mime = sniffMime(bytes);
  if (mime === "image/png") {
    const h = readPngHeader(bytes);
    const declared = plausible(h.ppi);
    return { mime, width: h.width, height: h.height, declaredPpi: declared, ppi: declared ?? DEFAULT_PPI };
  }
  if (mime === "image/jpeg") {
    const j = readJpeg(bytes);
    return { mime, width: j.width, height: j.height, declaredPpi: j.ppi, ppi: j.ppi ?? DEFAULT_PPI };
  }
  throw new Error("Format d'image non pris en charge (JPG ou PNG attendu)");
}

/** Taille réelle d'une image : pixels ÷ ppp (SPEC §7.1). */
export function realSize(widthPx: number, heightPx: number, ppi: number): { width: number; height: number } {
  return { width: widthPx / ppi, height: heightPx / ppi };
}
