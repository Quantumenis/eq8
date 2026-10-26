// Les polices utilisables par le texte en applique. Le cœur ne lit aucun fichier : l'interface enregistre une fonction
// qui rend une police déjà chargée (ou `null` tant qu'elle ne l'est pas). Les blocs de texte sont mis en cache.

import type { Font } from "opentype.js";
import { textBlock, type TextBlock, type TextSpec } from "./glyphs";

export type FontLookup = (family: string, bold: boolean, italic: boolean) => Font | null;

let lookup: FontLookup = () => null;
let version = 0;
const cache = new Map<string, TextBlock | null>();

export function setFontLookup(fn: FontLookup): void {
  lookup = fn;
  cache.clear();
  version += 1;
}

/** À appeler quand une police vient d'être chargée : les textes en attente seront recalculés. */
export function fontsChanged(): void {
  cache.clear();
  version += 1;
}

export const fontVersion = (): number => version;

const keyOf = (s: TextSpec): string => JSON.stringify([s.text, s.family, s.bold, s.italic, s.align, s.size]);

/** Le bloc de texte d'une spécification, ou `null` si la police n'est pas (encore) disponible ou le texte vide. */
export function textBlockOf(spec: TextSpec): TextBlock | null {
  const key = keyOf(spec);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const font = lookup(spec.family, spec.bold, spec.italic);
  if (!font) return null; // pas de cache : la police peut arriver
  const block = textBlock(font, spec);
  if (cache.size > 200) cache.clear();
  cache.set(key, block);
  return block;
}
