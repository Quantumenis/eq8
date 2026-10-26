// Commandes sur le quilt (SPEC §4.2-4.14) : disposition, pose des blocs, éléments libres, symétrie.
// Chaque commande renvoie le brouillon reçu, tel quel, quand elle ne change rien.

import type { Id, Paint, Project } from "../project/model";
import { findBlock } from "../project/model";
import {
  composeD4,
  symmetryAt,
  type Clip,
  type Dihedral,
  type FreeItem,
  type Layer,
  type Quarter,
  type QuiltDoc,
  type QuiltDraft,
  type SetBlock,
} from "./doc";
import { applyMat, boxOf, type Pt } from "./geom";
import {
  buildLayout,
  clampLayout,
  defaultLayout,
  DEFAULT_MAX_BLOCKS,
  isStandardLayout,
  type CustomLayout,
  type LayoutKind,
  type LayoutParams,
  type LayoutResult,
} from "./layout";
import { buildScene, itemPolygon, sameRef, type Scene, type SceneItem, type SceneSlot } from "./scene";
import { createId } from "../project/model";

type Fills = Readonly<Record<string, Paint>>;

const withDoc = (draft: QuiltDraft, doc: QuiltDoc, fills: Fills = draft.fills): QuiltDraft => (doc === draft.doc && fills === draft.fills ? draft : { doc, fills });

/** Retire les poses et les colorations qui ne correspondent plus à un emplacement ou à une pièce existants. */
export function prune(draft: QuiltDraft, project: Project): QuiltDraft {
  const layout = buildLayout(draft.doc.layout);
  const slotKeys = new Set(layout.slots.filter((s) => s.frame).map((s) => s.key));
  const allSlots = new Set(layout.slots.map((s) => s.key));
  const set = Object.fromEntries(Object.entries(draft.doc.set).filter(([k]) => slotKeys.has(k)));
  const doc = Object.keys(set).length === Object.keys(draft.doc.set).length ? draft.doc : { ...draft.doc, set };
  const scene = buildScene(project, { doc, fills: draft.fills }, layout);
  const live = new Set(scene.pieces.map((p) => p.key));
  void allSlots;
  const kept = Object.entries(draft.fills).filter(([k]) => live.has(k));
  const fills = kept.length === Object.keys(draft.fills).length ? draft.fills : Object.fromEntries(kept);
  return withDoc(draft, doc, fills);
}

// ---------------------------------------------------------------------------------------------------------------
// Disposition

export function newLayout(draft: QuiltDraft, kind: LayoutKind): QuiltDraft {
  return { doc: { v: 1, layout: defaultLayout(kind), set: {}, items: [] }, fills: {} };
}

/** Change les paramètres de la disposition ; les blocs et couleurs des emplacements qui existent encore sont gardés. */
export function setLayout(draft: QuiltDraft, project: Project, params: LayoutParams, maxBlocks = DEFAULT_MAX_BLOCKS): QuiltDraft {
  const layout = clampLayout(params, maxBlocks);
  if (JSON.stringify(layout) === JSON.stringify(draft.doc.layout)) return draft;
  return prune({ doc: { ...draft.doc, layout }, fills: draft.fills }, project);
}

/**
 * Custom Set : change la taille du rectangle central (SPEC §2.12). Avec `keepSizes`, les éléments gardent leur
 * taille (l'espace vide s'ajoute à droite et en bas) ; sans, tout est mis à l'échelle et touche toujours les bords.
 */
export function resizeCustom(draft: QuiltDraft, w: number, h: number, keepSizes: boolean): QuiltDraft {
  const cur = draft.doc.layout;
  if (cur.kind !== "custom") return draft;
  const next = clampLayout({ kind: "custom", w, h }, DEFAULT_MAX_BLOCKS) as CustomLayout;
  if (next.w === cur.w && next.h === cur.h) return draft;
  const fx = next.w / cur.w;
  const fy = next.h / cur.h;
  const items = keepSizes
    ? draft.doc.items
    : draft.doc.items.map((i) => ({ ...i, x: round(i.x * fx), y: round(i.y * fy), w: round(i.w * fx), h: round(i.h * fy) }));
  return withDoc(draft, { ...draft.doc, layout: next, items });
}

const round = (v: number): number => Math.round(v * 1e6) / 1e6;

// ---------------------------------------------------------------------------------------------------------------
// Pose des blocs au calque 1 (dispositions standard)

export interface BlockRef {
  blockId: Id;
  coloringId: Id | "";
}

function setBlock(project: Project, existing: SetBlock | undefined, ref: BlockRef, keepRotation: boolean): SetBlock | null {
  const found = findBlock(project, ref.blockId);
  if (!found || found.list !== "blocks") return null;
  const same = existing && existing.blockId === ref.blockId && existing.coloringId === ref.coloringId;
  return { blockId: ref.blockId, coloringId: ref.coloringId, rot: keepRotation && existing ? existing.rot : same ? existing.rot : 0, flip: keepRotation && existing ? existing.flip : same ? existing.flip : false };
}

/** Pose un bloc dans des emplacements (un clic, Ctrl : tous, Alt : un sur deux). Le bloc précédent est remplacé. */
export function placeBlock(draft: QuiltDraft, project: Project, slotKeys: readonly string[], ref: BlockRef, keepRotation = false): QuiltDraft {
  if (!isStandardLayout(draft.doc.layout.kind)) return draft;
  const layout = buildLayout(draft.doc.layout);
  const ok = new Set(layout.slots.filter((s) => s.frame && s.role !== "piece").map((s) => s.key));
  const set = { ...draft.doc.set };
  let fills: Record<string, Paint> | null = null;
  let changed = false;
  for (const key of slotKeys) {
    if (!ok.has(key)) continue;
    const next = setBlock(project, set[key], ref, keepRotation);
    if (!next) continue;
    const cur = set[key];
    if (cur && cur.blockId === next.blockId && cur.coloringId === next.coloringId && cur.rot === next.rot && cur.flip === next.flip) continue;
    set[key] = next;
    changed = true;
    // Les retouches de l'ancien contenu (et la couleur de l'emplacement vide) disparaissent.
    fills ??= { ...draft.fills };
    for (const k of Object.keys(fills)) if (k === key || k.startsWith(`${key}/`)) delete fills[k];
  }
  return changed ? { doc: { ...draft.doc, set }, fills: fills ?? draft.fills } : draft;
}

/** Les emplacements où poser un bloc selon le clic : un seul, tous (Ctrl), un sur deux (Alt). */
export function slotsForClick(scene: Scene, clicked: SceneSlot, mode: "one" | "all" | "alternate"): string[] {
  const blocks = scene.slots.filter((s) => s.slot.frame && s.slot.role !== "piece");
  if (mode === "one") return [clicked.slot.key];
  if (mode === "all") return blocks.filter((s) => s.slot.role === clicked.slot.role || s.slot.role === "block").map((s) => s.slot.key);
  const parity = (clicked.slot.row + clicked.slot.col) % 2;
  return blocks.filter((s) => s.slot.role === clicked.slot.role && (s.slot.row + s.slot.col) % 2 === parity).map((s) => s.slot.key);
}

/** Efface le contenu d'un emplacement : l'emplacement redevient vide et coloriable. */
export function eraseSlots(draft: QuiltDraft, slotKeys: readonly string[]): QuiltDraft {
  const set = { ...draft.doc.set };
  let changed = false;
  let fills: Record<string, Paint> | null = null;
  for (const key of slotKeys) {
    if (set[key]) {
      delete set[key];
      changed = true;
    }
    for (const k of Object.keys(draft.fills)) {
      if (k === key || k.startsWith(`${key}/`)) {
        fills ??= { ...draft.fills };
        delete fills[k];
        changed = true;
      }
    }
  }
  return changed ? { doc: { ...draft.doc, set }, fills: fills ?? draft.fills } : draft;
}

/** « Effacer le quilt » : tout le contenu disparaît, la disposition reste. */
export function clearQuilt(draft: QuiltDraft): QuiltDraft {
  if (Object.keys(draft.doc.set).length === 0 && draft.doc.items.length === 0 && Object.keys(draft.fills).length === 0) return draft;
  return { doc: { ...draft.doc, set: {}, items: [] }, fills: {} };
}

/** Pivoter (+90°) et Miroir : sur des emplacements posés. */
export function turnSlots(draft: QuiltDraft, slotKeys: readonly string[], what: "rotate" | "mirror"): QuiltDraft {
  const set = { ...draft.doc.set };
  let changed = false;
  for (const key of slotKeys) {
    const s = set[key];
    if (!s) continue;
    const t: Dihedral = what === "rotate" ? { rot: 1, flip: false } : { rot: 0, flip: true };
    const next = composeD4(t, { rot: s.rot, flip: s.flip });
    set[key] = { ...s, rot: next.rot as Quarter, flip: next.flip };
    changed = true;
  }
  return changed ? { doc: { ...draft.doc, set }, fills: draft.fills } : draft;
}

/**
 * Symétrie (SPEC §4.12) : applique l'état n d'un cycle de 17 clics aux blocs posés, à partir de leur orientation de
 * départ `base`. Les blocs « pairs » et « impairs » suivent le damier des emplacements.
 */
export function applySymmetry(draft: QuiltDraft, base: Readonly<Record<string, Dihedral>>, scene: Scene, clicks: number): QuiltDraft {
  const [even, odd] = symmetryAt(clicks);
  const set = { ...draft.doc.set };
  let changed = false;
  for (const s of scene.slots) {
    const placed = set[s.slot.key];
    if (!placed) continue;
    const start = base[s.slot.key] ?? { rot: placed.rot, flip: placed.flip };
    const t = (s.slot.row + s.slot.col) % 2 === 0 ? even : odd;
    const next = composeD4(t, start);
    if (next.rot !== placed.rot || next.flip !== placed.flip) {
      set[s.slot.key] = { ...placed, rot: next.rot as Quarter, flip: next.flip };
      changed = true;
    }
  }
  return changed ? { doc: { ...draft.doc, set }, fills: draft.fills } : draft;
}

/** L'orientation actuelle des blocs posés (point de départ d'un cycle de Symétrie). */
export function orientationOf(draft: QuiltDraft): Record<string, Dihedral> {
  return Object.fromEntries(Object.entries(draft.doc.set).map(([k, s]) => [k, { rot: s.rot, flip: s.flip }]));
}

// ---------------------------------------------------------------------------------------------------------------
// Éléments libres (Custom Set au calque 1, calques 2 et 3)

export const DEFAULT_DROP_SIZE = 6;

function freeOk(layout: LayoutParams, layer: Layer): boolean {
  return layer !== 1 || layout.kind === "custom";
}

/** Pose un bloc, motif ou pochoir librement, à la position (x, y) de son coin haut-gauche. */
export function addItem(draft: QuiltDraft, project: Project, input: { layer: Layer; ref: BlockRef; x: number; y: number; w?: number; h?: number }): { draft: QuiltDraft; id: Id | null } {
  if (!freeOk(draft.doc.layout, input.layer)) return { draft, id: null };
  const found = findBlock(project, input.ref.blockId);
  if (!found) return { draft, id: null };
  const w = input.w ?? found.block.width;
  const h = input.h ?? found.block.height;
  const item: FreeItem = {
    id: createId(),
    layer: input.layer,
    blockId: input.ref.blockId,
    coloringId: input.ref.coloringId,
    x: round(input.x),
    y: round(input.y),
    w: round(w),
    h: round(h),
    rot: 0,
    flip: false,
    angle: 0,
    skew: 0,
    clip: "edge",
  };
  return { draft: { doc: { ...draft.doc, items: [...draft.doc.items, item] }, fills: draft.fills }, id: item.id };
}

export function updateItem(draft: QuiltDraft, id: Id, patch: Partial<Omit<FreeItem, "id" | "layer">>): QuiltDraft {
  const at = draft.doc.items.findIndex((i) => i.id === id);
  if (at < 0) return draft;
  const cur = draft.doc.items[at] as FreeItem;
  const next: FreeItem = { ...cur, ...patch };
  next.w = Math.max(0.01, round(next.w));
  next.h = Math.max(0.01, round(next.h));
  next.x = round(next.x);
  next.y = round(next.y);
  next.angle = round(((next.angle % 360) + 360) % 360);
  next.skew = Math.max(-80, Math.min(80, round(next.skew)));
  if (JSON.stringify(cur) === JSON.stringify(next)) return draft;
  const items = draft.doc.items.slice();
  items[at] = next;
  return { doc: { ...draft.doc, items }, fills: draft.fills };
}

export function updateItems(draft: QuiltDraft, ids: readonly Id[], change: (item: FreeItem) => Partial<Omit<FreeItem, "id" | "layer">>): QuiltDraft {
  let next = draft;
  for (const id of ids) {
    const item = next.doc.items.find((i) => i.id === id);
    if (item) next = updateItem(next, id, change(item));
  }
  return next;
}

export function deleteItems(draft: QuiltDraft, ids: readonly Id[]): QuiltDraft {
  const drop = new Set(ids);
  if (!draft.doc.items.some((i) => drop.has(i.id))) return draft;
  const fills = Object.fromEntries(Object.entries(draft.fills).filter(([k]) => !drop.has(k.split("/")[0] as string)));
  return { doc: { ...draft.doc, items: draft.doc.items.filter((i) => !drop.has(i.id)) }, fills };
}

/** « Effacer le bloc » d'un élément libre : il reste un contour vide (ici : on retire les retouches de couleur). */
export function eraseItems(draft: QuiltDraft, ids: readonly Id[]): QuiltDraft {
  const drop = new Set(ids);
  const keys = Object.keys(draft.fills).filter((k) => drop.has(k.split("/")[0] as string));
  if (keys.length === 0) return draft;
  const fills = { ...draft.fills };
  for (const k of keys) delete fills[k];
  return { doc: draft.doc, fills };
}

/** Copier-coller : les copies apparaissent décalées vers le bas et la droite, et on les sélectionne. */
export function pasteItems(draft: QuiltDraft, copies: readonly FreeItem[], offset: number): { draft: QuiltDraft; ids: Id[] } {
  if (copies.length === 0) return { draft, ids: [] };
  const made = copies.map((c): FreeItem => ({ ...c, id: createId(), x: round(c.x + offset), y: round(c.y + offset) }));
  return { draft: { doc: { ...draft.doc, items: [...draft.doc.items, ...made] }, fills: draft.fills }, ids: made.map((m) => m.id) };
}

export type StackMove = "front" | "back" | "forward" | "backward";

/** Empiler : premier plan, arrière-plan, d'un cran. L'ordre ne mélange pas les calques. */
export function stackItems(draft: QuiltDraft, ids: readonly Id[], move: StackMove): QuiltDraft {
  const chosen = new Set(ids);
  let items = draft.doc.items.slice();
  const bounds = (layer: Layer): number[] => items.map((i, n) => (i.layer === layer ? n : -1)).filter((n) => n >= 0);
  for (const id of ids) {
    const at = items.findIndex((i) => i.id === id);
    if (at < 0) continue;
    const item = items[at] as FreeItem;
    const same = bounds(item.layer);
    const pos = same.indexOf(at);
    let target = pos;
    if (move === "front") target = same.length - 1;
    else if (move === "back") target = 0;
    else if (move === "forward") target = Math.min(same.length - 1, pos + 1);
    else target = Math.max(0, pos - 1);
    if (target === pos) continue;
    const without = items.filter((_, n) => n !== at);
    const sameWithout = without.map((i, n) => (i.layer === item.layer ? n : -1)).filter((n) => n >= 0);
    const insertAt = target >= sameWithout.length ? (sameWithout.length > 0 ? (sameWithout[sameWithout.length - 1] as number) + 1 : without.length) : (sameWithout[target] as number);
    without.splice(insertAt, 0, item);
    items = without;
  }
  void chosen;
  return items.every((i, n) => i === draft.doc.items[n]) ? draft : { doc: { ...draft.doc, items }, fills: draft.fills };
}

/** Centre les éléments (horizontalement, verticalement, ou les deux) au centre exact du centre du quilt. */
export function centerItems(draft: QuiltDraft, ids: readonly Id[], axis: "h" | "v" | "both"): QuiltDraft {
  const layout = buildLayout(draft.doc.layout);
  return updateItems(draft, ids, (i) => {
    const box = boxOf(itemPolygon(i));
    const dx = layout.width / 2 - (box.x0 + box.x1) / 2;
    const dy = layout.height / 2 - (box.y0 + box.y1) / 2;
    return { x: axis === "v" ? i.x : i.x + dx, y: axis === "h" ? i.y : i.y + dy };
  });
}

export function clipItems(draft: QuiltDraft, ids: readonly Id[], clip: Clip): QuiltDraft {
  return updateItems(draft, ids, () => ({ clip }));
}

/** Aligner sur l'ancre (le premier élément sélectionné) : l'encombrement des côtés gauches, droits, hauts ou bas. */
export function alignItems(draft: QuiltDraft, ids: readonly Id[], side: "left" | "right" | "top" | "bottom"): QuiltDraft {
  const [anchorId, ...rest] = ids;
  const anchor = draft.doc.items.find((i) => i.id === anchorId);
  if (!anchor) return draft;
  const a = boxOf(itemPolygon(anchor));
  return updateItems(draft, rest, (i) => {
    const b = boxOf(itemPolygon(i));
    if (side === "left") return { x: i.x + (a.x0 - b.x0) };
    if (side === "right") return { x: i.x + (a.x1 - b.x1) };
    if (side === "top") return { y: i.y + (a.y0 - b.y0) };
    return { y: i.y + (a.y1 - b.y1) };
  });
}

/** Même taille que l'ancre : l'encombrement horizontal et vertical (pas la longueur du côté d'un bloc pivoté). */
export function sameSize(draft: QuiltDraft, ids: readonly Id[], dim: "width" | "height" | "both"): QuiltDraft {
  const [anchorId, ...rest] = ids;
  const anchor = draft.doc.items.find((i) => i.id === anchorId);
  if (!anchor) return draft;
  const a = boxOf(itemPolygon(anchor));
  const aw = a.x1 - a.x0;
  const ah = a.y1 - a.y0;
  return updateItems(draft, rest, (i) => {
    const b = boxOf(itemPolygon(i));
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    const patch: Partial<FreeItem> = {};
    if ((dim === "width" || dim === "both") && bw > 1e-9) patch.w = i.w * (aw / bw);
    if ((dim === "height" || dim === "both") && bh > 1e-9) patch.h = i.h * (ah / bh);
    return patch;
  });
}

/** Position et taille d'un élément « X, Y » : mesurées depuis le coin haut-gauche du centre, bordures exclues. */
export function itemExtent(item: FreeItem): { x: number; y: number; w: number; h: number } {
  const box = boxOf(itemPolygon(item));
  return { x: box.x0, y: box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0 };
}

/** Accrochage à la grille (SPEC §4.8). */
export function snapTo(v: number, step: number): number {
  return step > 0 ? Math.round(v / step) * step : v;
}

export { applyMat, sameRef };
export type { LayoutResult, Pt, SceneItem };
