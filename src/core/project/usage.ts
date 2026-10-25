// Qui utilise quoi : base des règles de suppression et du nettoyage des éléments inutilisés.

import { BLOCK_LISTS, type BlockListKey, type Id, type Paint, type Project } from "./model";

function paintsOf(project: Project): Paint[] {
  const paints: Paint[] = [];
  for (const list of BLOCK_LISTS) {
    for (const block of project.sketchbook[list]) for (const c of block.colorings) paints.push(...Object.values(c.fills));
  }
  for (const quilt of project.sketchbook.quilts) paints.push(...Object.values(quilt.fills));
  return paints;
}

/** Quilts qui posent ce bloc (toutes colorations confondues). */
export function quiltsUsingBlock(project: Project, blockId: Id): Id[] {
  return project.sketchbook.quilts.filter((q) => q.placements.some((p) => p.blockId === blockId)).map((q) => q.id);
}

/** Quilts qui posent cette coloration précise. */
export function quiltsUsingColoring(project: Project, coloringId: Id): Id[] {
  return project.sketchbook.quilts.filter((q) => q.placements.some((p) => p.coloringId === coloringId)).map((q) => q.id);
}

/** Nombre d'habillages (pièces de blocs ou de quilts) qui utilisent ce tissu. */
export function fabricUseCount(project: Project, fabricId: Id): number {
  return paintsOf(project).filter((p) => p.kind === "fabric" && p.fabricId === fabricId).length;
}

export function unusedBlockIds(project: Project, list: BlockListKey): Id[] {
  return project.sketchbook[list].filter((b) => quiltsUsingBlock(project, b.id).length === 0).map((b) => b.id);
}

export function unusedFabricIds(project: Project): Id[] {
  const used = new Set<Id>();
  for (const p of paintsOf(project)) if (p.kind === "fabric") used.add(p.fabricId);
  return project.sketchbook.fabrics.filter((f) => !used.has(f.id)).map((f) => f.id);
}
