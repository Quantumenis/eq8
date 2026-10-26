// « Mes favoris » (SPEC §8.7) : des bibliothèques personnelles de blocs, de tissus ou de fils, rangées en styles.
// Fichier : une archive au format .qsp (le contenu est un carnet ordinaire, images comprises) avec en plus
// `library.json` : le type, le nom et les styles (listes d'identifiants des éléments du carnet).

import { emptyProject, type AnyItem, type Id, type Project } from "../project/model";
import { readQspWithExtras, writeQsp, type LoadedProject } from "../project/qsp";
import { transferItems, type Source } from "../project/transfer";
import { ProjectFormatError } from "../project/validate";
import { strFromU8, strToU8 } from "fflate";

export const FAVORITE_KINDS = ["blocks", "fabrics", "threads"] as const;
export type FavoriteKind = (typeof FAVORITE_KINDS)[number];
export const FAVORITES_EXTENSION = ".qsl";
const LIBRARY_ENTRY = "library.json";

export const MIN_STYLES = 1;
export const MAX_STYLES = 59;
export const MAX_ITEMS_PER_STYLE = 254;

export interface FavoriteStyle {
  name: string;
  items: Id[];
}

export interface FavoriteLibrary {
  kind: FavoriteKind;
  name: string;
  styles: FavoriteStyle[];
  /** Le carnet qui porte les éléments (et, pour des blocs, les tissus qu'ils citent). */
  content: LoadedProject;
}

export const styleName = (index: number): string => `Style ${index + 1}`;

export function newFavoriteLibrary(kind: FavoriteKind, name: string, styleCount: number): FavoriteLibrary {
  const n = clampStyles(styleCount);
  return { kind, name, styles: Array.from({ length: n }, (_, i) => ({ name: styleName(i), items: [] })), content: { project: emptyProject(), assets: new Map() } };
}

export function clampStyles(n: number): number {
  return Number.isInteger(n) ? Math.min(MAX_STYLES, Math.max(MIN_STYLES, n)) : MIN_STYLES;
}

/** Les éléments d'un style, dans l'ordre. */
export function styleItems(lib: FavoriteLibrary, index: number): AnyItem[] {
  const style = lib.styles[index];
  if (!style) return [];
  const list = lib.content.project.sketchbook[lib.kind] as AnyItem[];
  return style.items.map((id) => list.find((i) => i.id === id)).filter((i): i is AnyItem => i !== undefined);
}

/** Change le nom et le nombre de styles (les styles retirés en fin de liste perdent leurs éléments). */
export function editLibrary(lib: FavoriteLibrary, name: string, styleCount: number): FavoriteLibrary {
  const n = clampStyles(styleCount);
  const styles = Array.from({ length: n }, (_, i) => lib.styles[i] ?? { name: styleName(i), items: [] });
  return prune({ ...lib, name, styles });
}

export function renameStyle(lib: FavoriteLibrary, index: number, name: string): FavoriteLibrary {
  if (!lib.styles[index] || !name.trim()) return lib;
  return { ...lib, styles: lib.styles.map((s, i) => (i === index ? { ...s, name: name.trim() } : s)) };
}

/**
 * « Coller » dans un style : les éléments copiés (d'un projet, de la bibliothèque intégrée…) rejoignent le contenu
 * de la bibliothèque. Un style compte au plus 254 éléments ; le surplus est refusé.
 */
export function pasteIntoStyle(lib: FavoriteLibrary, index: number, source: Source, ids: readonly Id[]): { lib: FavoriteLibrary; added: number; refused: number; duplicates: number } {
  const style = lib.styles[index];
  if (!style) return { lib, added: 0, refused: ids.length, duplicates: 0 };
  const room = MAX_ITEMS_PER_STYLE - style.items.length;
  const accepted = ids.slice(0, Math.max(0, room));
  const assets = new Map(lib.content.assets);
  const r = transferItems(lib.content.project, assets, source, lib.kind, accepted);
  const styles = lib.styles.map((s, i) => (i === index ? { ...s, items: [...s.items, ...r.added] } : s));
  return {
    lib: { ...lib, styles, content: { project: r.project, assets } },
    added: r.added.length,
    refused: ids.length - accepted.length,
    duplicates: r.duplicates,
  };
}

/** Supprime des éléments d'un style (et du contenu s'ils ne sont plus dans aucun style). */
export function removeFromStyle(lib: FavoriteLibrary, index: number, ids: readonly Id[]): FavoriteLibrary {
  const drop = new Set(ids);
  const styles = lib.styles.map((s, i) => (i === index ? { ...s, items: s.items.filter((id) => !drop.has(id)) } : s));
  return prune({ ...lib, styles });
}

/** Retire du contenu ce qu'aucun style ne cite plus (et, pour des blocs, les tissus qu'aucun bloc restant n'utilise). */
function prune(lib: FavoriteLibrary): FavoriteLibrary {
  const listed = new Set(lib.styles.flatMap((s) => s.items));
  const book = lib.content.project.sketchbook;
  let project: Project = { ...lib.content.project, sketchbook: { ...book, [lib.kind]: (book[lib.kind] as AnyItem[]).filter((i) => listed.has(i.id)) } };
  if (lib.kind === "blocks") {
    const used = new Set<Id>();
    for (const b of project.sketchbook.blocks) for (const c of b.colorings) for (const p of Object.values(c.fills)) if (p.kind === "fabric") used.add(p.fabricId);
    project = { ...project, sketchbook: { ...project.sketchbook, fabrics: project.sketchbook.fabrics.filter((f) => used.has(f.id)) } };
  }
  return { ...lib, content: { ...lib.content, project } };
}

export function writeFavorites(lib: FavoriteLibrary): Uint8Array {
  const meta = { formatVersion: 1, kind: lib.kind, name: lib.name, styles: lib.styles };
  return writeQsp(lib.content.project, lib.content.assets, { [LIBRARY_ENTRY]: strToU8(JSON.stringify(meta)) });
}

/** Lit une bibliothèque de favoris ; lève une `ProjectFormatError` si le fichier est inutilisable. */
export function readFavorites(bytes: Uint8Array): FavoriteLibrary {
  const loaded = readQspWithExtras(bytes, [LIBRARY_ENTRY]);
  const raw = loaded.extras[LIBRARY_ENTRY];
  if (!raw) throw new ProjectFormatError("Ce fichier n'est pas une bibliothèque de favoris (library.json absent).");
  let meta: unknown;
  try {
    meta = JSON.parse(strFromU8(raw));
  } catch {
    throw new ProjectFormatError("library.json : JSON invalide.");
  }
  const m = (typeof meta === "object" && meta !== null ? meta : {}) as Record<string, unknown>;
  if (m.formatVersion !== 1) throw new ProjectFormatError("library.json : version 1 attendue");
  if (!(FAVORITE_KINDS as readonly unknown[]).includes(m.kind)) throw new ProjectFormatError("library.json : type de bibliothèque inconnu");
  const kind = m.kind as FavoriteKind;
  if (typeof m.name !== "string") throw new ProjectFormatError("library.json : nom attendu");
  if (!Array.isArray(m.styles) || m.styles.length < MIN_STYLES || m.styles.length > MAX_STYLES) throw new ProjectFormatError("library.json : de 1 à 59 styles attendus");
  const known = new Set((loaded.project.sketchbook[kind] as AnyItem[]).map((i) => i.id));
  const styles: FavoriteStyle[] = m.styles.map((s: unknown, i: number) => {
    const r = (typeof s === "object" && s !== null ? s : {}) as Record<string, unknown>;
    const items = Array.isArray(r.items) ? r.items.filter((id): id is string => typeof id === "string" && known.has(id)) : [];
    return { name: typeof r.name === "string" && r.name.trim() ? r.name : styleName(i), items: items.slice(0, MAX_ITEMS_PER_STYLE) };
  });
  return prune({ kind, name: m.name, styles, content: { project: loaded.project, assets: loaded.assets } });
}
