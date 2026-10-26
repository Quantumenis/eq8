// Copier des éléments d'un carnet vers un autre (favoris → projet, projet → favoris, import depuis un projet).
// Les tissus cités par les colorations d'un bloc l'accompagnent, et les images suivent leurs tissus et photos.

import { addAsset, type AssetStore } from "./assets";
import { addToSketchbook, sameContent } from "./commands";
import { createId, type BlockItem, type FabricItem, type Id, type ItemOfList, type ListKey, type Paint, type Project } from "./model";

export interface Source {
  project: Project;
  assets: AssetStore;
}

export interface TransferResult {
  project: Project;
  /** Identifiants (dans la cible) des éléments ajoutés, dans l'ordre demandé. */
  added: Id[];
  duplicates: number;
}

function copyAsset(target: Project, targetAssets: AssetStore, source: Source, hash: string): Project {
  const bytes = source.assets.get(hash);
  const meta = source.project.assets[hash];
  if (!bytes || !meta) throw new Error(`Image manquante : ${hash}`);
  return addAsset(target, targetAssets, bytes, meta.mime).project;
}

/** Le tissu de la cible identique à `fabric` (au détail d'identité près), ou une copie ajoutée à la cible. */
function ensureFabric(target: Project, targetAssets: AssetStore, source: Source, fabric: FabricItem): { project: Project; id: Id } {
  const existing = target.sketchbook.fabrics.find((f) => sameContent(f, fabric));
  if (existing) return { project: target, id: existing.id };
  let next = target;
  if (fabric.source.kind === "image") next = copyAsset(next, targetAssets, source, fabric.source.asset);
  const copy: FabricItem = { ...fabric, id: createId() };
  return { project: { ...next, sketchbook: { ...next.sketchbook, fabrics: [...next.sketchbook.fabrics, copy] } }, id: copy.id };
}

/** Recopie un bloc : nouveaux identifiants, et ses tissus rattachés à ceux de la cible (ajoutés au besoin). */
function prepareBlock(target: Project, targetAssets: AssetStore, source: Source, block: BlockItem): { project: Project; block: BlockItem } {
  let next = target;
  const map = new Map<Id, Id>();
  const remap = (paint: Paint): Paint => {
    if (paint.kind !== "fabric") return paint;
    const id = map.get(paint.fabricId);
    return id ? { ...paint, fabricId: id } : paint;
  };
  for (const c of block.colorings) {
    for (const paint of Object.values(c.fills)) {
      if (paint.kind !== "fabric" || map.has(paint.fabricId)) continue;
      const fabric = source.project.sketchbook.fabrics.find((f) => f.id === paint.fabricId);
      if (!fabric) throw new Error(`Tissu introuvable : ${paint.fabricId}`);
      const r = ensureFabric(next, targetAssets, source, fabric);
      next = r.project;
      map.set(paint.fabricId, r.id);
    }
  }
  const copy: BlockItem = {
    ...block,
    id: createId(),
    colorings: block.colorings.map((c) => ({ ...c, id: createId(), fills: Object.fromEntries(Object.entries(c.fills).map(([k, p]) => [k, remap(p)])) })),
  };
  return { project: next, block: copy };
}

/**
 * Ajoute à `target` les éléments `ids` de la liste `list` de `source` (ordre conservé). Un élément identique à un
 * élément déjà présent n'est pas recopié. `targetAssets` reçoit les images nécessaires.
 */
export function transferItems<K extends ListKey>(target: Project, targetAssets: AssetStore, source: Source, list: K, ids: readonly Id[]): TransferResult {
  let project = target;
  const added: Id[] = [];
  let duplicates = 0;
  const items = source.project.sketchbook[list] as ItemOfList[K][];
  for (const id of ids) {
    const item = items.find((i) => i.id === id);
    if (!item) continue;
    let candidate = { ...item, id: createId() } as ItemOfList[K];
    let base = project;
    if (list === "blocks" || list === "motifs" || list === "stencils") {
      const r = prepareBlock(project, targetAssets, source, item as BlockItem);
      candidate = r.block as ItemOfList[K];
      base = r.project;
    } else if (list === "fabrics") {
      const f = item as FabricItem;
      if (f.source.kind === "image") base = copyAsset(base, targetAssets, source, f.source.asset);
    } else if (list === "photos") {
      base = copyAsset(base, targetAssets, source, (item as ItemOfList["photos"]).asset);
    }
    const r = addToSketchbook(base, list, candidate);
    if (r.status === "duplicate") {
      duplicates += 1;
      continue;
    }
    project = r.project;
    added.push(candidate.id);
  }
  return { project, added, duplicates };
}
