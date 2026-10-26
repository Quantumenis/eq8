// Bordures automatiques (SPEC §3.9, Q-8.1 : « à créer nous-mêmes ») : des bordures prêtes à poser. Chacune règle le
// style, les tailles et les nombres de blocs d'une bordure, puis colore ses pièces avec deux ou trois couleurs unies.
// On les pose d'un clic sur une bordure du quilt ; changer ensuite le style de la bordure les efface.

import type { Paint, Project } from "../project/model";
import { buildBorders, clampSizes, hasBlockCounts, makeBorder, suggestCounts, uniformSizes, type BorderStyle } from "./borders";
import type { QuiltDraft } from "./doc";
import { buildLayout } from "./layout";
import { prune } from "./ops";

export type AutoCategory = "bands" | "squares" | "points";

export interface AutoBorder {
  id: string;
  name: string;
  category: AutoCategory;
  style: BorderStyle;
  /** Épaisseur des quatre côtés, en pouces. */
  size: number;
  /** Couleurs : A (pièces principales), B (alternance et pièces de fond), C (coins). */
  colors: readonly [string, string, string];
  /** Les pièces principales alternent A et B (damiers, pavés). */
  alternate?: boolean;
}

const NAVY = "#2c4a77";
const CREAM = "#f3ead2";
const RUST = "#b5573f";
const SAGE = "#6f8f72";
const PLUM = "#6b3f69";
const GOLD = "#d9a441";
const TEAL = "#2a7f86";
const BLUSH = "#e9b8b3";

export const AUTO_BORDERS: readonly AutoBorder[] = [
  { id: "band", name: "Bande unie", category: "bands", style: "longH", size: 2, colors: [NAVY, NAVY, NAVY] },
  { id: "cornerstones", name: "Bande à carrés de coin", category: "bands", style: "corner", size: 2.5, colors: [NAVY, NAVY, GOLD] },
  { id: "frame", name: "Cadre en onglet", category: "bands", style: "mitered", size: 2, colors: [SAGE, PLUM, SAGE] },
  { id: "checker", alternate: true, name: "Damier", category: "squares", style: "tileSquares", size: 1.5, colors: [NAVY, CREAM, NAVY] },
  { id: "pavers", alternate: true, name: "Pavés", category: "squares", style: "blocks", size: 2, colors: [RUST, CREAM, GOLD] },
  { id: "halfdrop", alternate: true, name: "Pavés en quinconce", category: "squares", style: "hdBlocks", size: 2, colors: [TEAL, CREAM, TEAL] },
  { id: "spaced", name: "Carrés espacés", category: "squares", style: "spaced", size: 2, colors: [PLUM, BLUSH, PLUM] },
  { id: "diamonds", name: "Chaîne de losanges", category: "points", style: "diamonds", size: 2.5, colors: [RUST, CREAM, GOLD] },
  { id: "teeth", name: "Dents de scie", category: "points", style: "pointsOut", size: 2, colors: [NAVY, CREAM, GOLD] },
  { id: "bigLittle", name: "Grands et petits losanges", category: "points", style: "bigLittle", size: 3, colors: [TEAL, CREAM, GOLD] },
];

export const AUTO_CATEGORIES: readonly AutoCategory[] = ["bands", "squares", "points"];

const solid = (rgb: string): Paint => ({ kind: "solid", rgb });

/** Applique une bordure automatique à une bordure du quilt : réglages puis couleurs, le contenu précédent disparaît. */
export function applyAutoBorder(draft: QuiltDraft, project: Project, borderId: string, preset: AutoBorder): QuiltDraft {
  const at = draft.doc.borders.findIndex((b) => b.id === borderId);
  if (at < 0) return draft;
  const center = buildLayout(draft.doc.layout);
  const sizes = clampSizes(preset.style, uniformSizes(preset.size));
  const counts = hasBlockCounts(preset.style) ? suggestCounts(center.width, center.height, sizes) : { nh: 1, nv: 1 };
  const border = makeBorder(borderId, preset.style, sizes, counts);
  const borders = draft.doc.borders.slice();
  borders[at] = border;
  // On repart d'une bordure vide : ni blocs ni couleurs.
  const prefix = `r${borderId}.`;
  const set = Object.fromEntries(Object.entries(draft.doc.set).filter(([k]) => !k.startsWith(prefix)));
  const fills: Record<string, Paint> = Object.fromEntries(Object.entries(draft.fills).filter(([k]) => !k.startsWith(prefix)));
  const doc = { ...draft.doc, borders, set };
  const result = buildBorders(center.width, center.height, borders);
  const [a, b, c] = preset.colors;
  let n = 0;
  for (const slot of result.slots) {
    if (slot.border !== borderId) continue;
    const name = slot.key.slice(prefix.length);
    let rgb: string;
    if (preset.style === "mitered") rgb = name.startsWith("t") || name.startsWith("b") ? a : b;
    else if (name.startsWith("k")) rgb = c;
    else if (slot.role === "border") rgb = preset.alternate && n++ % 2 === 1 ? b : a;
    else rgb = b;
    fills[slot.key] = solid(rgb);
  }
  return prune({ doc, fills }, project);
}
