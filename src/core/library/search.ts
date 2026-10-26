// Recherche de tissus et de fils (SPEC §8.5) : par proximité de la couleur moyenne, ou par texte (nom, numéro).

import { perceptualDistance } from "../color/color";

export const SEARCH_MAX_DEFAULT = 50;
export const SEARCH_MAX_LIMIT = 999;

export function clampSearchMax(n: number): number {
  return Number.isInteger(n) ? Math.min(SEARCH_MAX_LIMIT, Math.max(1, n)) : SEARCH_MAX_DEFAULT;
}

/** Les `max` éléments les plus proches de `target` (couleur moyenne), du plus proche au plus éloigné ; tri stable. */
export function searchByColor<T>(items: readonly T[], colorOf: (item: T) => string, target: string, max = SEARCH_MAX_DEFAULT): T[] {
  return items
    .map((item, index) => ({ item, index, d: perceptualDistance(colorOf(item), target) }))
    .sort((a, b) => a.d - b.d || a.index - b.index)
    .slice(0, clampSearchMax(max))
    .map((x) => x.item);
}

/** Texte sans casse ni accents (Q-8.2). */
export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Recherche par sous-chaîne (nom ou numéro), sans casse ni accents. */
export function searchByText<T>(items: readonly T[], fieldsOf: (item: T) => string[], query: string, max = SEARCH_MAX_DEFAULT): T[] {
  const q = foldText(query);
  if (!q) return [];
  return items.filter((item) => fieldsOf(item).some((f) => foldText(f).includes(q))).slice(0, clampSearchMax(max));
}
