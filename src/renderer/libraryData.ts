// Contenu des bibliothèques pour l'interface : la bibliothèque intégrée vue comme un carnet en lecture seule
// (identifiants stables), le presse-papiers des bibliothèques et l'accès aux « Mes favoris ».

import { LIBRARY_BLOCKS, builtLibraryBlock, libraryTree } from "../core/library/blocks";
import { LIBRARY_FABRICS, fabricLibraryTree, instantiateLibraryFabric } from "../core/library/fabrics";
import { readFavorites, writeFavorites, type FavoriteKind, type FavoriteLibrary } from "../core/library/favorites";
import { LIBRARY_THREADS, instantiateLibraryThread, threadLibraryTree } from "../core/library/threads";
import type { Source } from "../core/project/transfer";
import { emptyNotecard, emptyProject, type AnyItem, type BlockItem, type Id } from "../core/project/model";
import { LIBRARY_NAME } from "../core/library/blocks";
import { getApi } from "./projectActions";

export type LibraryKind = FavoriteKind;

export interface BuiltinTree {
  category: string;
  styles: { style: string; ids: Id[] }[];
}

const builtins = new Map<LibraryKind, { source: Source; tree: BuiltinTree[] }>();

/** La bibliothèque intégrée d'un type : un carnet en lecture seule (identifiants stables) et son arbre. */
export function builtinLibrary(kind: LibraryKind): { source: Source; tree: BuiltinTree[] } {
  let hit = builtins.get(kind);
  if (hit) return hit;
  const project = emptyProject();
  if (kind === "blocks") {
    project.sketchbook.blocks = LIBRARY_BLOCKS.map((def): BlockItem => {
      const b = builtLibraryBlock(def);
      const card = { ...emptyNotecard(def.name), notes: def.notes, reference: `${LIBRARY_NAME} — ${def.category}`, back: { classification: def.style, categories: [def.category] } };
      return { id: def.id, card, width: b.width, height: b.height, drawing: b.drawing, colorings: b.colorings };
    });
    hit = { source: { project, assets: new Map() }, tree: libraryTree().map((c) => ({ category: c.category, styles: c.styles.map((s) => ({ style: s.style, ids: s.blocks.map((b) => b.id) })) })) };
  } else if (kind === "fabrics") {
    project.sketchbook.fabrics = LIBRARY_FABRICS.map((def) => ({ ...instantiateLibraryFabric(def), id: def.id }));
    hit = { source: { project, assets: new Map() }, tree: fabricLibraryTree().map((c) => ({ category: c.category, styles: c.styles.map((s) => ({ style: s.style, ids: s.fabrics.map((f) => f.id) })) })) };
  } else {
    project.sketchbook.threads = LIBRARY_THREADS.map((def) => ({ ...instantiateLibraryThread(def), id: def.id }));
    hit = { source: { project, assets: new Map() }, tree: threadLibraryTree().map((c) => ({ category: c.category, styles: c.styles.map((s) => ({ style: s.style, ids: s.threads.map((t) => t.id) })) })) };
  }
  builtins.set(kind, hit);
  return hit;
}

export function itemsOf(source: Source, kind: LibraryKind): AnyItem[] {
  return source.project.sketchbook[kind] as AnyItem[];
}

/** Presse-papiers des bibliothèques (Copier, puis Coller dans un style de Mes favoris) ; il survit à la fermeture. */
export let libraryClipboard: { kind: LibraryKind; items: { source: Source; id: Id }[] } | null = null;

export function setLibraryClipboard(value: typeof libraryClipboard): void {
  libraryClipboard = value;
}

/** Charge toutes les bibliothèques de favoris d'un type (les fichiers illisibles sont signalés à part). */
export async function loadFavorites(kind: LibraryKind): Promise<{ libraries: FavoriteLibrary[]; broken: string[] }> {
  const api = getApi();
  const listing = await api.listFavorites(kind);
  const libraries: FavoriteLibrary[] = [];
  const broken: string[] = [];
  for (const { name } of listing) {
    const bytes = await api.readFavorite(kind, name);
    try {
      if (!bytes) throw new Error("absent");
      const lib = readFavorites(bytes);
      if (lib.kind !== kind) throw new Error("type");
      libraries.push({ ...lib, name });
    } catch {
      broken.push(name);
    }
  }
  return { libraries, broken };
}

export async function saveFavorite(lib: FavoriteLibrary, create = false) {
  return getApi().writeFavorite(lib.kind, lib.name, writeFavorites(lib), create);
}
