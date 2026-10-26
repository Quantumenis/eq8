// Recherche de blocs (SPEC §8.3, §8.4) : par champs de la fiche (nom, référence, notes ; sous-chaîne, sans casse ni
// accents) et par catégories (jusqu'à 20, toutes obligatoires). Les catégories d'un bloc sont au verso de sa fiche.

import type { Notecard } from "../project/model";
import { clampSearchMax, foldText, SEARCH_MAX_DEFAULT } from "./search";

/** Les 5 sections de catégories (SPEC §8.4) et les nôtres (Q-8.1). */
export const CATEGORY_SECTIONS: { id: string; categories: string[] }[] = [
  { id: "Difficulté et piéçage", categories: ["Débutant", "Intermédiaire", "Avancé", "Carrés", "Triangles", "Courbes", "Bandes", "Grille"] },
  { id: "Fêtes", categories: ["Noël", "Pâques", "Halloween", "Saint-Valentin", "Automne"] },
  { id: "Événements", categories: ["Naissance", "Mariage", "Anniversaire"] },
  { id: "Pièces", categories: ["Étoile", "Moulinet", "Cabane de rondins", "Damier"] },
  { id: "Applique", categories: ["Applique", "Fleur", "Cœur", "Feuille", "Insecte", "Couronne", "Pochoir"] },
];

export const ALL_CATEGORIES: readonly string[] = CATEGORY_SECTIONS.flatMap((s) => s.categories);
export const MAX_CATEGORIES = 20;

/** Les catégories de recherche de nos éléments intégrés, par identifiant de bibliothèque. */
export const ENTRY_TAGS: Record<string, string[]> = {
  "four-patch": ["Débutant", "Carrés", "Damier"],
  "nine-patch": ["Débutant", "Carrés", "Damier"],
  "sixteen-patch": ["Débutant", "Carrés", "Damier"],
  "double-four-patch": ["Intermédiaire", "Carrés", "Damier"],
  "rail-fence": ["Débutant", "Bandes"],
  "jacobs-ladder": ["Intermédiaire", "Carrés", "Triangles"],
  "log-cabin": ["Intermédiaire", "Bandes", "Cabane de rondins"],
  "courthouse-steps": ["Intermédiaire", "Bandes", "Cabane de rondins"],
  "half-square-triangle": ["Débutant", "Triangles"],
  "flying-geese": ["Intermédiaire", "Triangles"],
  "geese-column": ["Intermédiaire", "Triangles"],
  pinwheel: ["Débutant", "Triangles", "Moulinet"],
  "four-pinwheels": ["Débutant", "Triangles", "Moulinet"],
  "broken-dishes": ["Débutant", "Triangles"],
  "birds-in-the-air": ["Débutant", "Triangles"],
  hourglass: ["Débutant", "Triangles"],
  "bow-tie": ["Intermédiaire", "Triangles"],
  snowball: ["Débutant", "Carrés"],
  "square-in-a-square": ["Débutant", "Triangles"],
  "diamond-in-a-square": ["Débutant", "Triangles"],
  "economy-block": ["Débutant", "Carrés", "Triangles"],
  "churn-dash": ["Intermédiaire", "Triangles", "Carrés"],
  "shoo-fly": ["Débutant", "Triangles", "Étoile"],
  "dutchmans-puzzle": ["Intermédiaire", "Triangles", "Moulinet"],
  "friendship-star": ["Débutant", "Triangles", "Étoile"],
  "ohio-star": ["Intermédiaire", "Triangles", "Étoile"],
  "sawtooth-star": ["Intermédiaire", "Triangles", "Étoile"],
  "variable-star": ["Intermédiaire", "Triangles", "Étoile"],
  "drunkards-path": ["Avancé", "Courbes"],
  "drunkards-path-four": ["Avancé", "Courbes"],
  "orange-peel": ["Avancé", "Courbes"],
  "lemoyne-star": ["Avancé", "Grille", "Étoile"],
  "dresden-plate": ["Avancé", "Grille", "Courbes"],
  "applique-heart": ["Applique", "Cœur", "Saint-Valentin", "Mariage"],
  "applique-tulip": ["Applique", "Fleur"],
  "applique-flower": ["Applique", "Fleur"],
  "applique-wreath": ["Applique", "Feuille", "Couronne", "Noël"],
  "applique-star": ["Applique", "Étoile", "Noël"],
  "applique-butterfly": ["Applique", "Insecte", "Naissance"],
  "motif-heart": ["Applique", "Cœur", "Saint-Valentin"],
  "motif-tulip": ["Applique", "Fleur"],
  "motif-flower": ["Applique", "Fleur"],
  "motif-wreath": ["Applique", "Feuille", "Couronne", "Noël"],
  "motif-star": ["Applique", "Étoile", "Noël"],
  "stencil-rosette": ["Pochoir", "Fleur"],
  "stencil-loops": ["Pochoir", "Fleur"],
  "stencil-feather": ["Pochoir", "Feuille"],
  "stencil-heart": ["Pochoir", "Cœur"],
};

export interface CardFields {
  name: boolean;
  reference: boolean;
  notes: boolean;
}

export const ALL_FIELDS: CardFields = { name: true, reference: true, notes: true };

/**
 * Recherche par champs de la fiche : sous-chaîne, sans casse ni accents, dans l'ordre des mots. « Trouver au plus N »
 * (1 à 999, 50 par défaut).
 */
export function searchCards<T>(items: readonly T[], cardOf: (item: T) => Notecard, query: string, fields: CardFields = ALL_FIELDS, max = SEARCH_MAX_DEFAULT): T[] {
  const q = foldText(query);
  if (!q) return [];
  const out: T[] = [];
  for (const item of items) {
    const c = cardOf(item);
    const hay = [fields.name ? c.name : "", fields.reference ? c.reference : "", fields.notes ? c.notes : ""];
    if (hay.some((h) => foldText(h).includes(q))) out.push(item);
    if (out.length >= clampSearchMax(max)) break;
  }
  return out;
}

/** Recherche par catégories : le bloc doit avoir toutes les catégories choisies (ET logique, 20 au plus). */
export function searchByCategories<T>(items: readonly T[], categoriesOf: (item: T) => readonly string[], wanted: readonly string[], max = SEARCH_MAX_DEFAULT): T[] {
  const need = [...new Set(wanted.map(foldText))].slice(0, MAX_CATEGORIES);
  if (need.length === 0) return [];
  const out: T[] = [];
  for (const item of items) {
    const has = new Set(categoriesOf(item).map(foldText));
    if (need.every((c) => has.has(c))) out.push(item);
    if (out.length >= clampSearchMax(max)) break;
  }
  return out;
}
