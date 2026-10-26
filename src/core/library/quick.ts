// Quilts rapides (SPEC §1.8, Q-… : une dizaine, les nôtres) et bibliothèque de dispositions (SPEC §2.14) : des quilts
// prêts à ouvrir ou à ajouter au carnet, construits par code à partir de nos blocs.

import { addLibraryBlock, addToSketchbook } from "../project/commands";
import { newProject } from "../project/defaults";
import type { BlockItem, Project, QuiltItem } from "../project/model";
import { addBorder, setBorderSize } from "../quilt/borderops";
import { BORDER_SIDES, buildBorders, finishedSize, type BorderStyle } from "../quilt/borders";
import { newDraft, quiltItemOf, type QuiltDraft } from "../quilt/doc";
import { buildLayout, defaultLayout, type LayoutKind, type LayoutParams } from "../quilt/layout";
import { placeBlock } from "../quilt/ops";
import { instantiateEntry, libraryEntryById } from "./extra";

export interface BorderSpec {
  style: BorderStyle;
  size: number;
}

export type QuickPattern = "all" | "checker" | "rows";

export interface QuickQuiltDef {
  id: string;
  name: string;
  notes: string;
  layout: LayoutParams;
  /** Identifiants de bibliothèque des blocs posés (au moins un). */
  blocks: string[];
  pattern: QuickPattern;
  borders: BorderSpec[];
}

const lay = (kind: LayoutKind, patch: Record<string, unknown>): LayoutParams => ({ ...defaultLayout(kind), ...patch }) as LayoutParams;

export const QUICK_QUILTS: QuickQuiltDef[] = [
  { id: "nine-patch-checker", name: "Nine Patch en damier", notes: "Nine Patch et Four Patch en alternance, bordure rayée.", layout: lay("horizontal", { nh: 5, nv: 6, bw: 6, bh: 6 }), blocks: ["nine-patch", "four-patch"], pattern: "checker", borders: [{ style: "longH", size: 3 }] },
  { id: "ohio-stars", name: "Étoiles de l'Ohio", notes: "Vingt Ohio Star de 8 po.", layout: lay("horizontal", { nh: 4, nv: 5, bw: 8, bh: 8 }), blocks: ["ohio-star"], pattern: "all", borders: [{ style: "longH", size: 3 }] },
  { id: "pinwheel-baby", name: "Moulinets bébé", notes: "Moulinets bleus pour un petit quilt.", layout: lay("horizontal", { nh: 5, nv: 6, bw: 6, bh: 6 }), blocks: ["pinwheel"], pattern: "all", borders: [{ style: "longH", size: 2 }] },
  { id: "churn-dash-point", name: "Churn Dash sur la pointe", notes: "Churn Dash posés sur la pointe.", layout: lay("onpoint", { nh: 3, nv: 4, b: 8, s: 0 }), blocks: ["churn-dash"], pattern: "all", borders: [{ style: "longH", size: 3 }] },
  { id: "log-cabin-checker", name: "Cabanes de rondins", notes: "Log Cabin et Courthouse Steps en damier.", layout: lay("horizontal", { nh: 4, nv: 5, bw: 10, bh: 10 }), blocks: ["log-cabin", "courthouse-steps"], pattern: "checker", borders: [{ style: "longH", size: 2 }] },
  { id: "stars-hearts", name: "Étoiles et cœurs", notes: "Ohio Star et cœurs appliqués en alternance.", layout: lay("horizontal", { nh: 3, nv: 4, bw: 8, bh: 8 }), blocks: ["ohio-star", "applique-heart"], pattern: "checker", borders: [{ style: "longH", size: 3 }] },
  { id: "dresden-nine", name: "Dresden et Nine Patch", notes: "Dresden Plate entre des Nine Patch.", layout: lay("horizontal", { nh: 3, nv: 3, bw: 8, bh: 8 }), blocks: ["dresden-plate", "nine-patch"], pattern: "checker", borders: [{ style: "longH", size: 4 }] },
  { id: "four-pinwheels", name: "Quatre moulinets", notes: "Blocs de quatre moulinets, rangées alternées.", layout: lay("horizontal", { nh: 3, nv: 4, bw: 9, bh: 9 }), blocks: ["four-pinwheels", "sixteen-patch"], pattern: "rows", borders: [{ style: "longH", size: 2 }] },
  { id: "sixteen-baby", name: "Sixteen Patch bébé", notes: "Seize carreaux en damier.", layout: lay("horizontal", { nh: 5, nv: 6, bw: 6, bh: 6 }), blocks: ["sixteen-patch"], pattern: "all", borders: [{ style: "longH", size: 1.5 }, { style: "longH", size: 3 }] },
  { id: "tulips", name: "Jardin de tulipes", notes: "Tulipes appliquées sur fond crème.", layout: lay("horizontal", { nh: 3, nv: 4, bw: 8, bh: 8, sw: 2, sh: 2, sashBorder: true }), blocks: ["applique-tulip"], pattern: "all", borders: [{ style: "longH", size: 3 }] },
];

/** Applique la bordure voulue (tous les côtés à la même taille). */
function withBorders(draft: QuiltDraft, project: Project, borders: readonly BorderSpec[]): QuiltDraft {
  // Le quilt neuf a déjà une bordure de 1 po : on repart d'une liste vide pour que la liste soit exactement celle demandée.
  let d: QuiltDraft = { doc: { ...draft.doc, borders: [] }, fills: draft.fills };
  for (const spec of borders) {
    const r = addBorder(d, { style: spec.style });
    d = r.draft;
    for (const side of BORDER_SIDES) d = setBorderSize(d, project, r.id, side, spec.size, { all: false, leftRight: false, topBottom: false });
  }
  return d;
}

/** Un projet « Sans titre » avec les blocs et le quilt d'un quilt rapide. */
export function buildQuickQuilt(def: QuickQuiltDef): { project: Project; quiltId: string } {
  let project = newProject(null, 2).project;
  const blocks: BlockItem[] = [];
  for (const id of def.blocks) {
    const entry = libraryEntryById(id);
    if (!entry) throw new Error(`Bloc de bibliothèque inconnu : ${id}`);
    const made = instantiateEntry(entry);
    const r = addLibraryBlock(project, made.list, made.item);
    project = r.project;
    const stored = project.sketchbook.blocks.find((b) => b.id === r.blockIds[0]) ?? project.sketchbook.blocks.find((b) => b.card.name === made.item.card.name);
    if (!stored) throw new Error(`Bloc non ajouté : ${id}`);
    blocks.push(stored);
  }
  let draft = newDraft(def.layout.kind);
  draft = { doc: { ...draft.doc, layout: def.layout }, fills: draft.fills };
  draft = withBorders(draft, project, def.borders);
  const layout = buildLayout(def.layout);
  const slots = layout.slots.filter((s) => s.frame && s.role === "block");
  for (const slot of slots) {
    const index = def.pattern === "all" ? 0 : def.pattern === "checker" ? (slot.row + slot.col) % blocks.length : slot.row % blocks.length;
    const block = blocks[index] as BlockItem;
    const coloring = block.colorings[block.colorings.length - 1];
    draft = placeBlock(draft, project, [slot.key], { blockId: block.id, coloringId: coloring?.id ?? "" });
  }
  const item = quiltItemOf(project, draft, def.name);
  project = addToSketchbook(project, "quilts", { ...item, card: { ...item.card, notes: def.notes } }).project;
  return { project, quiltId: item.id };
}

// ---------------------------------------------------------------------------------------------------------------
// Bibliothèque de dispositions

export interface LayoutDef {
  id: string;
  name: string;
  category: string;
  layout: LayoutParams;
  borders: BorderSpec[];
}

const KIND_NAMES: Record<string, string> = { horizontal: "Horizontal", onpoint: "Sur la pointe", custom: "Ensemble personnalisé", stripsH: "Bandes horizontales", stripsV: "Bandes verticales" };

export const LAYOUT_CATEGORIES = ["Mini (moins de 40 po)", "Bébé et enfant", "Couvre-lit", "Grand lit"] as const;

function categoryOf(w: number, h: number): string {
  const m = Math.max(w, h);
  return m < 40 ? LAYOUT_CATEGORIES[0] : m < 60 ? LAYOUT_CATEGORIES[1] : m < 90 ? LAYOUT_CATEGORIES[2] : LAYOUT_CATEGORIES[3];
}

function layoutDef(id: string, layout: LayoutParams, border: number | null): LayoutDef {
  const borders: BorderSpec[] = border ? [{ style: "longH", size: border }] : [];
  const r = buildLayout(layout);
  const total = finishedSize(r.width, r.height, buildBordersList(layout, borders));
  const kind = KIND_NAMES[layout.kind] ?? layout.kind;
  const nh = "nh" in layout ? `${layout.nh} × ${layout.nv}` : "";
  return { id, name: `${kind} ${nh}`.trim() + ` — ${Math.round(total.width)} × ${Math.round(total.height)} po`, category: categoryOf(total.width, total.height), layout, borders };
}

function buildBordersList(layout: LayoutParams, specs: readonly BorderSpec[]) {
  let d = newDraft(layout.kind);
  d = { doc: { ...d.doc, layout }, fills: d.fills };
  return withBorders(d, newProject(null, 2).project, specs).doc.borders;
}

const H = (nh: number, nv: number, b: number, extra: Record<string, unknown> = {}) => lay("horizontal", { nh, nv, bw: b, bh: b, ...extra });
const P = (nh: number, nv: number, b: number) => lay("onpoint", { nh, nv, b, s: 0 });

export const LAYOUT_LIBRARY: LayoutDef[] = [
  layoutDef("h-3x3-8", H(3, 3, 8), 2),
  layoutDef("h-3x4-8", H(3, 4, 8), 3),
  layoutDef("h-4x4-6", H(4, 4, 6), 2),
  layoutDef("h-4x5-6", H(4, 5, 6), 3),
  layoutDef("h-5x6-6", H(5, 6, 6), 3),
  layoutDef("h-5x5-9", H(5, 5, 9), 4),
  layoutDef("h-6x8-8", H(6, 8, 8), 4),
  layoutDef("h-7x9-10", H(7, 9, 10), 5),
  layoutDef("h-8x10-10", H(8, 10, 10), 6),
  layoutDef("h-9x10-12", H(9, 10, 12), 6),
  layoutDef("h-4x5-8-lattis", H(4, 5, 8, { sw: 2, sh: 2, sashBorder: true }), 3),
  layoutDef("h-5x6-8-lattis", H(5, 6, 8, { sw: 2, sh: 2, sashBorder: true }), 4),
  layoutDef("h-6x7-9-lattis", H(6, 7, 9, { sw: 3, sh: 3, sashBorder: true }), 4),
  layoutDef("h-3x3-6", H(3, 3, 6), null),
  layoutDef("h-2x3-10", H(2, 3, 10), 2),
  layoutDef("p-2x3-8", P(2, 3, 8), 2),
  layoutDef("p-3x3-10", P(3, 3, 10), 3),
  layoutDef("p-3x4-10", P(3, 4, 10), 3),
  layoutDef("p-4x5-10", P(4, 5, 10), 4),
  layoutDef("p-5x6-12", P(5, 6, 12), 5),
  layoutDef("c-48x60", lay("custom", { w: 48, h: 60 }), 2),
  layoutDef("c-36x45", lay("custom", { w: 36, h: 45 }), 2),
  layoutDef("c-60x80", lay("custom", { w: 60, h: 80 }), 4),
  layoutDef("c-90x100", lay("custom", { w: 90, h: 100 }), 5),
  layoutDef("c-30x30", lay("custom", { w: 30, h: 30 }), 2),
];

/** La disposition de la bibliothèque comme quilt du carnet (aucun bloc posé). */
export function buildLayoutItem(def: LayoutDef): QuiltItem {
  const project = newProject(null, 2).project;
  let draft = newDraft(def.layout.kind);
  draft = { doc: { ...draft.doc, layout: def.layout }, fills: draft.fills };
  draft = withBorders(draft, project, def.borders);
  return quiltItemOf(project, draft, def.name);
}

export function layoutFinishedSize(def: LayoutDef): { width: number; height: number } {
  const r = buildLayout(def.layout);
  const b = buildBorders(r.width, r.height, buildBordersList(def.layout, def.borders));
  return { width: b.bounds.x1 - b.bounds.x0, height: b.bounds.y1 - b.bounds.y0 };
}
