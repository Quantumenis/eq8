// Opérations sur le carnet. Ce sont des fonctions pures « projet → projet » : l'historique les exécute pour
// annuler/rétablir. Une opération qui ne change rien renvoie le projet reçu, tel quel (même référence).

import {
  BLOCK_LISTS,
  DEFAULT_MAX_COLORINGS,
  MAX_MAX_COLORINGS,
  MIN_MAX_COLORINGS,
  createId,
  emptyNotecard,
  type BlockItem,
  type BlockListKey,
  type Coloring,
  type ColorItem,
  type Id,
  type ItemOfList,
  type JsonValue,
  type ListKey,
  type Notecard,
  type Paint,
  type Project,
  type SectionId,
  type Sketchbook,
} from "./model";
import { fabricUseCount, quiltsUsingBlock, quiltsUsingColoring, unusedBlockIds, unusedFabricIds } from "./usage";

// ---------------------------------------------------------------------------------------------------------------
// Utilitaires

function withList<K extends ListKey>(project: Project, key: K, items: Sketchbook[K]): Project {
  return { ...project, sketchbook: { ...project.sketchbook, [key]: items } };
}

/** Égalité profonde de deux valeurs JSON (l'ordre des clés n'a pas d'importance). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => k in (b as object) && jsonEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Copie sans la clé « id » à aucune profondeur : deux éléments identiques au détail d'identité près sont égaux. */
function withoutIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (k !== "id") out[k] = withoutIds(v);
    return out;
  }
  return value;
}

export function sameContent(a: unknown, b: unknown): boolean {
  return jsonEqual(withoutIds(a), withoutIds(b));
}

export function normalizeRgb(rgb: string): string {
  const s = rgb.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(s)) throw new Error(`Couleur invalide : ${rgb}`);
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Ajouter au carnet

export type AddResult<K extends ListKey> =
  | { status: "added"; project: Project; item: ItemOfList[K] }
  | { status: "duplicate"; project: Project; existingId: Id };

/** « Ajouter au carnet » : un élément identique à un autre déjà présent n'est pas ajouté une seconde fois. */
export function addToSketchbook<K extends ListKey>(project: Project, list: K, item: ItemOfList[K]): AddResult<K> {
  const items = project.sketchbook[list] as ItemOfList[K][];
  const existing = items.find((other) => sameContent(other, item));
  if (existing) return { status: "duplicate", project, existingId: existing.id };
  return { status: "added", project: withList(project, list, [...items, item] as Sketchbook[K]), item };
}

export function makeColor(rgb: string, name = ""): ColorItem {
  return { id: createId(), card: emptyNotecard(name), rgb: normalizeRgb(rgb) };
}

// ---------------------------------------------------------------------------------------------------------------
// Colorations empilées (règle du Quick Start, p. 30)

export interface ColoredBlockInput {
  list: BlockListKey;
  /** Bloc du carnet dont on est parti (« Modifier »), s'il y en a un. */
  sourceBlockId?: Id | undefined;
  card: Notecard;
  width: number;
  height: number;
  drawing: JsonValue;
  /** La coloration à ajouter ; `null` pour le seul dessin au trait. */
  coloring: Coloring | null;
}

export type ColoredBlockResult =
  | { status: "stacked"; project: Project; blockId: Id; position: number }
  | { status: "new-block"; project: Project; blockId: Id }
  | { status: "duplicate"; project: Project; blockId: Id };

/**
 * Ajoute au carnet un bloc coloré. Même dessin que le bloc d'origine et pile non pleine : la coloration s'empile ;
 * pile pleine (ou maximum à 1) : un nouveau bloc est créé, avec cette seule coloration.
 */
export function addColoredBlock(project: Project, input: ColoredBlockInput): ColoredBlockResult {
  const max = project.settings.maxColorings;
  const source = input.sourceBlockId
    ? project.sketchbook[input.list].find((b) => b.id === input.sourceBlockId)
    : undefined;
  const sameDrawing =
    source !== undefined &&
    source.width === input.width &&
    source.height === input.height &&
    sameContent(source.drawing, input.drawing); // les identifiants des segments changent à chaque « Modifier »

  if (source && sameDrawing) {
    if (input.coloring === null || source.colorings.some((c) => sameContent(c, input.coloring))) {
      return { status: "duplicate", project, blockId: source.id };
    }
    if (source.colorings.length < max) {
      const updated: BlockItem = { ...source, colorings: [...source.colorings, input.coloring] };
      return {
        status: "stacked",
        project: withList(project, input.list, project.sketchbook[input.list].map((b) => (b.id === source.id ? updated : b))),
        blockId: source.id,
        position: updated.colorings.length,
      };
    }
  }

  const block: BlockItem = {
    id: createId(),
    card: input.card,
    width: input.width,
    height: input.height,
    drawing: input.drawing,
    colorings: input.coloring ? [input.coloring] : [],
  };
  const added = addToSketchbook(project, input.list, block);
  if (added.status === "duplicate") return { status: "duplicate", project, blockId: added.existingId };
  return { status: "new-block", project: added.project, blockId: block.id };
}

/**
 * Ajoute un bloc de bibliothèque (plusieurs colorations). Si sa pile dépasse le maximum, elle est « dépilée » en
 * plusieurs blocs dont aucun ne dépasse le maximum.
 */
export function addLibraryBlock(
  project: Project,
  list: BlockListKey,
  block: BlockItem,
): { project: Project; blockIds: Id[]; duplicates: number } {
  const max = project.settings.maxColorings;
  const chunks: Coloring[][] = [];
  for (let i = 0; i < Math.max(block.colorings.length, 1); i += max) chunks.push(block.colorings.slice(i, i + max));

  let current = project;
  const blockIds: Id[] = [];
  let duplicates = 0;
  chunks.forEach((colorings, index) => {
    const piece: BlockItem = { ...block, id: index === 0 ? block.id : createId(), colorings };
    const result = addToSketchbook(current, list, piece);
    if (result.status === "added") {
      current = result.project;
      blockIds.push(piece.id);
    } else {
      duplicates += 1;
    }
  });
  return { project: current, blockIds, duplicates };
}

/**
 * Scinde la pile en deux blocs à partir de la coloration choisie : elle devient la première du nouveau bloc,
 * inséré juste après l'original. Les quilts qui posent les colorations déplacées suivent le nouveau bloc.
 */
export function splitColorings(
  project: Project,
  list: BlockListKey,
  blockId: Id,
  coloringId: Id,
): { project: Project; newBlockId: Id } | undefined {
  const blocks = project.sketchbook[list];
  const index = blocks.findIndex((b) => b.id === blockId);
  const block = blocks[index];
  if (!block) return undefined;
  const at = block.colorings.findIndex((c) => c.id === coloringId);
  if (at < 1) return undefined; // la première coloration ne se scinde pas : il n'y aurait rien à séparer

  const moved = block.colorings.slice(at);
  const newBlock: BlockItem = { ...block, id: createId(), colorings: moved };
  const movedIds = new Set(moved.map((c) => c.id));
  const next = withList(project, list, [
    ...blocks.slice(0, index),
    { ...block, colorings: block.colorings.slice(0, at) },
    newBlock,
    ...blocks.slice(index + 1),
  ]);
  const quilts = next.sketchbook.quilts.map((q) =>
    q.placements.some((p) => movedIds.has(p.coloringId))
      ? { ...q, placements: q.placements.map((p) => (movedIds.has(p.coloringId) ? { ...p, blockId: newBlock.id } : p)) }
      : q,
  );
  return { project: withList(next, "quilts", quilts), newBlockId: newBlock.id };
}

// ---------------------------------------------------------------------------------------------------------------
// Supprimer

export type DeleteResult =
  | { ok: true; project: Project; replaced: number }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "used"; quiltIds: Id[] };

function replaceFabric(paint: Paint, fabricId: Id, rgb: string): Paint {
  return paint.kind === "fabric" && paint.fabricId === fabricId ? { kind: "solid", rgb } : paint;
}

function mapFills(fills: Record<string, Paint>, fn: (p: Paint) => Paint): Record<string, Paint> {
  return Object.fromEntries(Object.entries(fills).map(([k, p]) => [k, fn(p)]));
}

/**
 * Supprime un élément du carnet.
 * - Un bloc, motif ou pochoir posé dans un quilt ne se supprime pas.
 * - Un tissu utilisé est remplacé par une couleur unie (sa couleur moyenne) dans les blocs et quilts concernés ;
 *   l'interface prévient avant d'appeler cette opération.
 */
export function deleteItem(project: Project, list: ListKey, id: Id): DeleteResult {
  const items = project.sketchbook[list] as { id: Id }[];
  if (!items.some((item) => item.id === id)) return { ok: false, reason: "not-found" };

  if ((BLOCK_LISTS as readonly string[]).includes(list)) {
    const quiltIds = quiltsUsingBlock(project, id);
    if (quiltIds.length > 0) return { ok: false, reason: "used", quiltIds };
  }

  let next = withList(project, list, items.filter((item) => item.id !== id) as Sketchbook[typeof list]);
  let replaced = 0;
  if (list === "fabrics") {
    const fabric = project.sketchbook.fabrics.find((f) => f.id === id);
    if (fabric) {
      replaced = fabricUseCount(project, id);
      const swap = (p: Paint): Paint => replaceFabric(p, id, fabric.averageColor);
      if (replaced > 0) {
        for (const blockList of BLOCK_LISTS) {
          next = withList(
            next,
            blockList,
            next.sketchbook[blockList].map((b) => ({
              ...b,
              colorings: b.colorings.map((c) => ({ ...c, fills: mapFills(c.fills, swap) })),
            })),
          );
        }
        next = withList(next, "quilts", next.sketchbook.quilts.map((q) => ({ ...q, fills: mapFills(q.fills, swap) })));
      }
    }
  }
  return { ok: true, project: next, replaced };
}

/** Supprime une seule coloration d'un bloc (refusé si un quilt la pose). */
export function deleteColoring(project: Project, list: BlockListKey, blockId: Id, coloringId: Id): DeleteResult {
  const block = project.sketchbook[list].find((b) => b.id === blockId);
  if (!block || !block.colorings.some((c) => c.id === coloringId)) return { ok: false, reason: "not-found" };
  const quiltIds = quiltsUsingColoring(project, coloringId);
  if (quiltIds.length > 0) return { ok: false, reason: "used", quiltIds };
  const updated: BlockItem = { ...block, colorings: block.colorings.filter((c) => c.id !== coloringId) };
  return {
    ok: true,
    project: withList(project, list, project.sketchbook[list].map((b) => (b.id === blockId ? updated : b))),
    replaced: 0,
  };
}

/** « Effacer tout ce qui est inutilisé » : blocs non posés dans un quilt, tissus utilisés nulle part. */
export function clearUnused(project: Project, list: ListKey): { project: Project; removed: number } {
  let ids: Id[] = [];
  if ((BLOCK_LISTS as readonly string[]).includes(list)) ids = unusedBlockIds(project, list as BlockListKey);
  else if (list === "fabrics") ids = unusedFabricIds(project);
  if (ids.length === 0) return { project, removed: 0 };
  const drop = new Set(ids);
  const items = project.sketchbook[list] as { id: Id }[];
  return { project: withList(project, list, items.filter((i) => !drop.has(i.id)) as Sketchbook[typeof list]), removed: ids.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Ordre

/** Tri par clics successifs : les éléments cliqués passent en tête dans l'ordre des clics, les autres suivent tels quels. */
export function sortByClickOrder(project: Project, list: ListKey, clicked: Id[]): Project {
  const items = project.sketchbook[list] as { id: Id }[];
  const byId = new Map(items.map((i) => [i.id, i]));
  const first = clicked.filter((id, i) => byId.has(id) && clicked.indexOf(id) === i).map((id) => byId.get(id) as { id: Id });
  const rest = items.filter((i) => !clicked.includes(i.id));
  const ordered = [...first, ...rest];
  if (ordered.every((item, i) => item === items[i])) return project;
  return withList(project, list, ordered as Sketchbook[typeof list]);
}

/** Glisser-déposer : l'élément est déposé juste avant `beforeId` (ou à la fin si `null`). */
export function moveBefore(project: Project, list: ListKey, id: Id, beforeId: Id | null): Project {
  const items = project.sketchbook[list] as { id: Id }[];
  const moving = items.find((i) => i.id === id);
  if (!moving || id === beforeId) return project;
  const rest = items.filter((i) => i.id !== id);
  const at = beforeId === null ? rest.length : rest.findIndex((i) => i.id === beforeId);
  if (at < 0) return project;
  const ordered = [...rest.slice(0, at), moving, ...rest.slice(at)];
  if (ordered.every((item, i) => item === items[i])) return project;
  return withList(project, list, ordered as Sketchbook[typeof list]);
}

// ---------------------------------------------------------------------------------------------------------------
// Fiches et réglages

export function updateCard<K extends ListKey>(
  project: Project,
  list: K,
  id: Id,
  change: (card: Notecard) => Notecard,
): Project {
  const items = project.sketchbook[list] as ItemOfList[K][];
  let changed = false;
  const next = items.map((item) => {
    if (item.id !== id) return item;
    const card = change(item.card);
    if (sameContent(card, item.card)) return item;
    changed = true;
    return { ...item, card };
  });
  return changed ? withList(project, list, next as Sketchbook[K]) : project;
}

export function setFrameColor(project: Project, section: SectionId, rgb: string | null): Project {
  const current = project.frameColors[section];
  if (rgb === null) {
    if (current === undefined) return project;
    const { [section]: _dropped, ...rest } = project.frameColors;
    void _dropped;
    return { ...project, frameColors: rest };
  }
  const value = normalizeRgb(rgb);
  if (current === value) return project;
  return { ...project, frameColors: { ...project.frameColors, [section]: value } };
}

export function clampMaxColorings(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_COLORINGS;
  return Math.min(MAX_MAX_COLORINGS, Math.max(MIN_MAX_COLORINGS, Math.round(value)));
}

export function setMaxColorings(project: Project, value: number): Project {
  const max = clampMaxColorings(value);
  if (max === project.settings.maxColorings) return project;
  return { ...project, settings: { ...project.settings, maxColorings: max } };
}
