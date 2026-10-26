// Bibliothèque intégrée de fils (SPEC §5.8-5.9, §8.1) : une gamme de couleurs générée, avec des noms génériques
// et un numéro (dans le champ Référence de la fiche).

import { hexToOklab, oklabToHex } from "../color/color";
import { createId, emptyNotecard, type ThreadItem } from "../project/model";
import { LIBRARY_NAME } from "./blocks";

export interface LibraryThreadDef {
  id: string;
  name: string;
  /** Numéro du fil (« QS 1204 »). */
  number: string;
  rgb: string;
  category: string;
  style: string;
}

export const THREAD_CATEGORIES = { cotton: "01 Coton", poly: "02 Polyester brillant" } as const;

/** Familles de couleurs : nom du style, teintes (nom, couleur moyenne). */
const FAMILIES: [string, [string, string][]][] = [
  ["Blancs et gris", [["blanc", "#f4f4f2"], ["gris perle", "#c9c9c6"], ["gris", "#8f8f8c"], ["anthracite", "#45474a"]]],
  ["Rouges et roses", [["rouge", "#c62828"], ["cerise", "#a3184a"], ["rose", "#ec7fa5"], ["corail", "#e8645a"]]],
  ["Oranges et jaunes", [["orange", "#ef6c00"], ["abricot", "#f6b26b"], ["jaune", "#f2c200"], ["ocre", "#c98a1b"]]],
  ["Verts", [["vert", "#2e7d32"], ["vert tendre", "#9ccc65"], ["olive", "#7d7f2a"], ["émeraude", "#0f8a5f"]]],
  ["Bleus", [["bleu", "#1e66c8"], ["bleu ciel", "#81c7f0"], ["marine", "#14284b"], ["turquoise", "#26a69a"]]],
  ["Violets", [["violet", "#6a3fa0"], ["lilas", "#c3a6e0"], ["prune", "#6b2d5c"], ["indigo", "#3b3f8f"]]],
  ["Bruns", [["marron", "#6d4c2f"], ["noisette", "#a0703c"], ["sable", "#d8c29a"], ["taupe", "#8a7d70"]]],
];

/** Trois intensités par teinte : clair, moyen (la couleur), foncé. */
const LEVELS: [string, number][] = [
  ["clair", 0.12],
  ["", 0],
  ["foncé", -0.12],
];

function build(): LibraryThreadDef[] {
  const out: LibraryThreadDef[] = [];
  for (const [category, base] of [
    [THREAD_CATEGORIES.cotton, 1000],
    [THREAD_CATEGORIES.poly, 5000],
  ] as const) {
    FAMILIES.forEach(([style, hues], f) => {
      hues.forEach(([name, hex], h) => {
        LEVELS.forEach(([level, dL], l) => {
          const c = hexToOklab(hex);
          const rgb = dL === 0 ? hex : oklabToHex({ L: Math.min(0.97, Math.max(0.1, c.L + dL)), a: c.a, b: c.b });
          const number = `QS ${base + f * 100 + h * 10 + l + 1}`;
          const label = `Fil ${name}${level ? ` ${level}` : ""}`;
          out.push({ id: `${base}-${f}-${h}-${l}`, name: label, number, rgb, category, style });
        });
      });
    });
  }
  return out;
}

export const LIBRARY_THREADS: LibraryThreadDef[] = build();

export function threadLibraryTree(): { category: string; styles: { style: string; threads: LibraryThreadDef[] }[] }[] {
  const tree: { category: string; styles: { style: string; threads: LibraryThreadDef[] }[] }[] = [];
  for (const t of LIBRARY_THREADS) {
    let cat = tree.find((c) => c.category === t.category);
    if (!cat) {
      cat = { category: t.category, styles: [] };
      tree.push(cat);
    }
    let st = cat.styles.find((s) => s.style === t.style);
    if (!st) {
      st = { style: t.style, threads: [] };
      cat.styles.push(st);
    }
    st.threads.push(t);
  }
  return tree;
}

export function instantiateLibraryThread(def: LibraryThreadDef): ThreadItem {
  const card = emptyNotecard(def.name);
  card.reference = def.number;
  card.notes = `${LIBRARY_NAME} — ${def.category}`;
  card.back = { classification: def.style, categories: [def.category] };
  return { id: createId(), card, rgb: def.rgb };
}
