// Modèle du projet (format .qsp, version 1). Tout est sérialisable en JSON : pas de undefined, de Date ni de classes.
// La clé « id » est réservée à l'identité propre d'un objet ; les références utilisent d'autres noms (fabricId, blockId…).

export const FORMAT_VERSION = 1;

export type Id = string;

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Fiche (Nom, Référence, Notes) et son verso (classement et catégories). */
export interface Notecard {
  name: string;
  reference: string;
  notes: string;
  back: { classification: string; categories: string[] };
}

export interface ItemBase {
  id: Id;
  card: Notecard;
}

/** Décalage du tissu dans une pièce (coupe ciblée, SPEC §5.5), en pouces. */
export interface FabricOffset {
  x: number;
  y: number;
}

/**
 * Ce qu'on applique sur une pièce : un tissu du carnet ou une couleur unie (recopiée, sans lien avec la palette).
 * Le tissu se pose à l'échelle réelle, calé sur le coin du bloc, décalé de `offset` s'il a été « coupé » à la main,
 * et tourné de `rotation` degrés (plan Quilt, SPEC §5.6).
 */
export type Paint = { kind: "fabric"; fabricId: Id; offset?: FabricOffset; rotation?: number } | { kind: "solid"; rgb: string };

/** Styles de fil (Q-5.2) : continu, tirets, pointillés, point-tiret. */
export const THREAD_STYLES = ["solid", "dash", "dot", "dashdot"] as const;
export type ThreadStyle = (typeof THREAD_STYLES)[number];
/** Épaisseurs de fil (Q-5.2) : de 1 (fin) à 5 (épais). */
export const MIN_THREAD_WEIGHT = 1;
export const MAX_THREAD_WEIGHT = 5;

/** Le fil d'une couture (contour de pièce) : couleur recopiée d'un fil du carnet, style et épaisseur (SPEC §5.8). */
export interface ThreadStroke {
  rgb: string;
  style: ThreadStyle;
  weight: number;
}

/**
 * Une manière de colorer un bloc. `fills` associe une clé de pièce (M3) à son habillage ; `threads` (facultatif)
 * associe une clé de couture (une section du contour des pièces) à son fil.
 */
export interface Coloring {
  id: Id;
  fills: Record<string, Paint>;
  threads?: Record<string, ThreadStroke>;
}

/** Bloc, motif ou pochoir : le dessin au trait est la « coloration 0 », puis une pile de colorations. */
export interface BlockItem extends ItemBase {
  /** Taille finie, en pouces. */
  width: number;
  height: number;
  /** Dessin au trait (défini au jalon M2). */
  drawing: JsonValue;
  colorings: Coloring[];
}

export interface BlockPlacement {
  blockId: Id;
  coloringId: Id;
}

export interface QuiltItem extends ItemBase {
  /** Disposition et bordures (jalons M5 et M6). */
  layout: JsonValue;
  /** Blocs posés : sert aux règles de suppression. */
  placements: BlockPlacement[];
  /** Coloration au niveau du quilt, par clé de cellule. */
  fills: Record<string, Paint>;
}

export type FabricSource =
  | { kind: "generated"; generator: string; seed: number; params: { [key: string]: JsonValue } }
  | { kind: "image"; asset: string; ppi: number };

export interface FabricItem extends ItemBase {
  source: FabricSource;
  /** Couleur moyenne (#rrggbb) : remplace le tissu quand il est supprimé alors qu'il est utilisé. */
  averageColor: string;
}

export interface ColorItem extends ItemBase {
  rgb: string;
}

export interface PhotoItem extends ItemBase {
  asset: string;
  ppi: number;
}

export interface ThreadItem extends ItemBase {
  rgb: string;
}

export interface EmbroideryItem extends ItemBase {
  content: JsonValue;
}

export interface AssetMeta {
  mime: string;
  size: number;
}

export interface Sketchbook {
  quilts: QuiltItem[];
  blocks: BlockItem[];
  motifs: BlockItem[];
  stencils: BlockItem[];
  fabrics: FabricItem[];
  colors: ColorItem[];
  photos: PhotoItem[];
  threads: ThreadItem[];
  embroideries: EmbroideryItem[];
}

export interface ProjectSettings {
  /** Nombre maximal de colorations empilées par bloc (1 à 10, 2 par défaut). */
  maxColorings: number;
}

export interface Project {
  formatVersion: typeof FORMAT_VERSION;
  settings: ProjectSettings;
  sketchbook: Sketchbook;
  /** Images importées, nommées par leur empreinte SHA-256. Les octets vivent dans l'archive, pas dans le JSON. */
  assets: Record<string, AssetMeta>;
  /** Couleur du cadre autour de l'élément sélectionné, par section du carnet. */
  frameColors: Partial<Record<SectionId, string>>;
}

/** Les 7 sections du carnet. */
export const SECTION_IDS = ["quilts", "blocks", "fabrics", "colors", "photos", "threads", "embroideries"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** Les listes du carnet : la section Blocs en contient trois (blocs, motifs, pochoirs). */
export const LIST_KEYS = [
  "quilts",
  "blocks",
  "motifs",
  "stencils",
  "fabrics",
  "colors",
  "photos",
  "threads",
  "embroideries",
] as const;
export type ListKey = (typeof LIST_KEYS)[number];

export interface ItemOfList {
  quilts: QuiltItem;
  blocks: BlockItem;
  motifs: BlockItem;
  stencils: BlockItem;
  fabrics: FabricItem;
  colors: ColorItem;
  photos: PhotoItem;
  threads: ThreadItem;
  embroideries: EmbroideryItem;
}

export type AnyItem = ItemOfList[ListKey];

export const BLOCK_LISTS = ["blocks", "motifs", "stencils"] as const;
export type BlockListKey = (typeof BLOCK_LISTS)[number];

export function isBlockList(key: ListKey): key is BlockListKey {
  return (BLOCK_LISTS as readonly string[]).includes(key);
}

export function sectionOf(key: ListKey): SectionId {
  return isBlockList(key) ? "blocks" : (key as SectionId);
}

export const DEFAULT_MAX_COLORINGS = 2;
export const MIN_MAX_COLORINGS = 1;
export const MAX_MAX_COLORINGS = 10;

export function emptyNotecard(name = ""): Notecard {
  return { name, reference: "", notes: "", back: { classification: "", categories: [] } };
}

export function emptySketchbook(): Sketchbook {
  return {
    quilts: [],
    blocks: [],
    motifs: [],
    stencils: [],
    fabrics: [],
    colors: [],
    photos: [],
    threads: [],
    embroideries: [],
  };
}

export function emptyProject(maxColorings = DEFAULT_MAX_COLORINGS): Project {
  return {
    formatVersion: FORMAT_VERSION,
    settings: { maxColorings },
    sketchbook: emptySketchbook(),
    assets: {},
    frameColors: {},
  };
}

let idCounter = 0;

/** Identifiant unique : UUID v4 quand l'environnement le fournit, compteur sinon. */
export function createId(): Id {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  idCounter += 1;
  return `id-${Date.now().toString(36)}-${idCounter}`;
}

export function findItem<K extends ListKey>(project: Project, list: K, id: Id): ItemOfList[K] | undefined {
  return (project.sketchbook[list] as ItemOfList[K][]).find((item) => item.id === id);
}

/** Un bloc, motif ou pochoir, quelle que soit sa liste. */
export function findBlock(project: Project, id: Id): { list: BlockListKey; block: BlockItem } | undefined {
  for (const list of BLOCK_LISTS) {
    const block = project.sketchbook[list].find((b) => b.id === id);
    if (block) return { list, block };
  }
  return undefined;
}
