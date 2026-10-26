// Polices installées pour le texte en applique : la liste vient du processus principal, les polices utilisées sont
// chargées à la demande (octets lus par le processus principal, lus par opentype.js ici) puis gardées en mémoire.

import { parse, type Font } from "opentype.js";
import { fontsChanged, setFontLookup } from "../core/text/registry";
import type { FontVariant, InstalledFontInfo } from "../shared/api";
import { getApi } from "./projectActions";

let list: Promise<InstalledFontInfo[]> | null = null;
let known: InstalledFontInfo[] = [];
const loaded = new Map<string, Font | null>();
const loading = new Set<string>();
const listeners = new Set<() => void>();

export function loadFontList(): Promise<InstalledFontInfo[]> {
  list ??= getApi()
    .listInstalledFonts()
    .then((fonts) => {
      known = fonts;
      return fonts;
    })
    .catch(() => []);
  return list;
}

export const installedFonts = (): readonly InstalledFontInfo[] => known;

/** La variante réellement utilisée pour la demande (gras, italique), avec repli sur ce que la famille possède. */
export function variantFor(font: InstalledFontInfo, bold: boolean, italic: boolean): FontVariant | null {
  const wanted: FontVariant = bold ? (italic ? "boldItalic" : "bold") : italic ? "italic" : "regular";
  const order: FontVariant[] = [wanted, bold ? "bold" : italic ? "italic" : "regular", "regular", "bold", "italic", "boldItalic"];
  return order.find((v) => font.files[v]) ?? null;
}

const keyOf = (family: string, variant: FontVariant): string => `${family}|${variant}`;

/** Charge la police (une seule fois) ; les textes concernés sont recalculés quand elle arrive. */
export async function ensureFont(family: string, bold: boolean, italic: boolean): Promise<boolean> {
  const fonts = await loadFontList();
  const info = fonts.find((f) => f.family === family) ?? fonts.find((f) => f.family === "Arial");
  if (!info) return false;
  const variant = variantFor(info, bold, italic);
  if (!variant) return false;
  const key = keyOf(info.family, variant);
  if (loaded.has(key)) return loaded.get(key) !== null;
  if (loading.has(key)) return false;
  loading.add(key);
  try {
    const bytes = await getApi().readInstalledFont(info.family, variant);
    if (!bytes) {
      loaded.set(key, null);
      return false;
    }
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    loaded.set(key, parse(buffer));
    fontsChanged();
    for (const l of listeners) l();
    return true;
  } catch {
    loaded.set(key, null);
    return false;
  } finally {
    loading.delete(key);
  }
}

/** Branche le registre du cœur sur les polices chargées ; une police absente est demandée en arrière-plan. */
export function installFontLookup(): void {
  setFontLookup((family, bold, italic) => {
    const info = known.find((f) => f.family === family) ?? known.find((f) => f.family === "Arial");
    if (!info) {
      void ensureFont(family, bold, italic);
      return null;
    }
    const variant = variantFor(info, bold, italic);
    if (!variant) return null;
    const font = loaded.get(keyOf(info.family, variant));
    if (font === undefined) void ensureFont(family, bold, italic);
    return font ?? null;
  });
}

export function subscribeFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
