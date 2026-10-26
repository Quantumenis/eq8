// Le quilt en cours d'édition (SPEC §4) : disposition, blocs posés (calque 1) et éléments libres (calques 1 à 3).
// `QuiltDoc` est ce qu'on enregistre dans `QuiltItem.layout` ; `QuiltDraft` y ajoute la coloration au quilt
// (`QuiltItem.fills`). Tout est immuable : une commande renvoie un nouvel objet, ou le même s'il n'y a rien à changer.

import type { Id, JsonValue, Paint, Project, QuiltItem, BlockPlacement } from "../project/model";
import { BLOCK_LISTS, createId, findBlock } from "../project/model";
import { DEFAULT_TEXT, MAX_TEXT_CHARS, MAX_TEXT_SIZE, MIN_TEXT_SIZE, type TextAlign, type TextSpec } from "../text/glyphs";
import {
  BORDER_SIDES,
  BORDER_STYLES,
  clampSizes,
  defaultBorders,
  makeBorder,
  type Border,
  type BorderSizes,
  type BorderStyle,
} from "./borders";
import { clampLayout, defaultLayout, LAYOUT_KINDS, type LayoutKind, type LayoutParams } from "./layout";

export type Layer = 1 | 2 | 3;
export type Quarter = 0 | 1 | 2 | 3;

/** Un bloc posé dans un emplacement du calque 1 : « coloringId » vide = le dessin au trait. */
export interface SetBlock {
  blockId: Id;
  coloringId: Id | "";
  /** Quarts de tour horaires, puis miroir gauche-droite appliqué avant (voir `unitTransform`). */
  rot: Quarter;
  flip: boolean;
}

export type Clip = "edge" | "border" | "none";

/** Un élément posé librement : bloc d'un Custom Set (calque 1), motif ou pochoir (calques 2 et 3). */
export interface FreeItem {
  id: Id;
  layer: Layer;
  blockId: Id;
  coloringId: Id | "";
  /** Cadre non tourné : coin haut-gauche et taille, dans le repère du centre. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation à l'intérieur du cadre (quarts de tour) et miroir, comme pour un emplacement. */
  rot: Quarter;
  flip: boolean;
  /** Rotation libre du cadre autour de son centre (degrés) et inclinaison horizontale (degrés). */
  angle: number;
  skew: number;
  clip: Clip;
  /** Texte en applique (calque 2) : `blockId` est alors vide, et le bloc est tiré des glyphes de la police. */
  text?: TextSpec;
  /** Broderie du carnet (calque 3) : rendu brouillon ou 3D, et fil (#rrggbb ; absent = le fil de la broderie). */
  embroidery?: { id: Id; render: "draft" | "3d"; thread?: string };
  /** Photo du carnet (calque 1 en Custom Set, calque 2 partout) : toujours un rectangle. */
  photoId?: Id;
}

export interface QuiltDoc {
  v: 1;
  layout: LayoutParams;
  set: Record<string, SetBlock>;
  /** Du fond vers le premier plan (par calque). */
  items: FreeItem[];
  /** Les bordures, de l'intérieur vers l'extérieur (SPEC §3.1). */
  borders: Border[];
}

export interface QuiltDraft {
  doc: QuiltDoc;
  fills: Readonly<Record<string, Paint>>;
}

export function newDoc(kind: LayoutKind, borderStyle?: BorderStyle): QuiltDoc {
  return { v: 1, layout: defaultLayout(kind), set: {}, items: [], borders: defaultBorders(borderStyle) };
}

export function newDraft(kind: LayoutKind = "horizontal", borderStyle?: BorderStyle): QuiltDraft {
  return { doc: newDoc(kind, borderStyle), fills: {} };
}

// ---------------------------------------------------------------------------------------------------------------
// Lecture défensive (le fichier peut avoir été modifié à la main)

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const quarter = (v: unknown): Quarter => ((((Math.round(num(v, 0)) % 4) + 4) % 4) as Quarter);

function parseLayout(v: unknown): LayoutParams | null {
  if (!isRec(v) || typeof v.kind !== "string" || !(LAYOUT_KINDS as readonly string[]).includes(v.kind)) return null;
  const base = defaultLayout(v.kind as LayoutKind) as unknown as Rec;
  const merged: Rec = { ...base };
  for (const [k, val] of Object.entries(v)) if (k in base) merged[k] = val;
  if (v.kind === "stripsH" || v.kind === "stripsV") {
    merged.strips = Array.isArray(v.strips)
      ? v.strips.filter(isRec).map((s) => ({ style: str(s.style) || "plain", width: num(s.width, 2), count: num(s.count, 1), across: num(s.across, 1) }))
      : base.strips;
  }
  return clampLayout(merged as unknown as LayoutParams, 100);
}

function parseText(v: unknown): TextSpec | undefined {
  if (!isRec(v)) return undefined;
  const align: TextAlign = v.align === "center" || v.align === "right" ? v.align : "left";
  return {
    text: str(v.text).slice(0, MAX_TEXT_CHARS),
    family: str(v.family).slice(0, 100) || DEFAULT_TEXT.family,
    bold: v.bold === true,
    italic: v.italic === true,
    align,
    size: Math.max(MIN_TEXT_SIZE, Math.min(MAX_TEXT_SIZE, num(v.size, DEFAULT_TEXT.size))),
  };
}

/** Relit les bordures ; un fichier sans bordures (avant M6) n'en a pas. */
function parseBorders(v: unknown): Border[] {
  if (!Array.isArray(v)) return [];
  const out: Border[] = [];
  const seen = new Set<string>();
  for (const b of v.slice(0, 50)) {
    if (!isRec(b) || typeof b.id !== "string" || b.id === "" || b.id.includes("/") || b.id.includes(".") || seen.has(b.id)) continue;
    if (typeof b.style !== "string" || !(BORDER_STYLES as readonly string[]).includes(b.style)) continue;
    const style = b.style as BorderStyle;
    const raw = isRec(b.sizes) ? b.sizes : {};
    const sizes = {} as BorderSizes;
    for (const side of BORDER_SIDES) sizes[side] = num(raw[side], 1);
    seen.add(b.id);
    out.push(makeBorder(b.id, style, clampSizes(style, sizes), { nh: num(b.nh, 8), nv: num(b.nv, 8) }));
  }
  return out;
}

/** Relit le quilt d'un fichier ; `null` si la disposition est illisible. */
export function parseDoc(value: JsonValue): QuiltDoc | null {
  if (!isRec(value)) return null;
  const layout = parseLayout(value.layout);
  if (!layout) return null;
  const set: Record<string, SetBlock> = {};
  if (isRec(value.set)) {
    for (const [key, s] of Object.entries(value.set)) {
      if (isRec(s) && typeof s.blockId === "string") set[key] = { blockId: s.blockId, coloringId: str(s.coloringId), rot: quarter(s.rot), flip: s.flip === true };
    }
  }
  const items: FreeItem[] = [];
  if (Array.isArray(value.items)) {
    for (const i of value.items) {
      if (!isRec(i) || typeof i.id !== "string" || typeof i.blockId !== "string") continue;
      const text = parseText(i.text);
      const emb = isRec(i.embroidery) && typeof i.embroidery.id === "string" ? i.embroidery : null;
      const photoId = typeof i.photoId === "string" && i.photoId ? i.photoId : undefined;
      const layer = text ? 2 : emb ? 3 : photoId ? (i.layer === 2 ? 2 : 1) : i.layer === 2 || i.layer === 3 ? i.layer : 1;
      items.push({
        id: i.id,
        layer,
        blockId: i.blockId,
        coloringId: str(i.coloringId),
        x: num(i.x, 0),
        y: num(i.y, 0),
        w: Math.max(0.01, num(i.w, 1)),
        h: Math.max(0.01, num(i.h, 1)),
        rot: quarter(i.rot),
        flip: i.flip === true,
        angle: num(i.angle, 0),
        skew: Math.max(-80, Math.min(80, num(i.skew, 0))),
        clip: i.clip === "border" || i.clip === "none" ? i.clip : "edge",
        ...(text ? { text } : {}),
        ...(emb
          ? { embroidery: { id: emb.id as string, render: emb.render === "3d" ? ("3d" as const) : ("draft" as const), ...(typeof emb.thread === "string" && /^#[0-9a-f]{6}$/i.test(emb.thread) ? { thread: emb.thread } : {}) } }
          : {}),
        ...(photoId ? { photoId } : {}),
      });
    }
  }
  return { v: 1, layout, set, items, borders: parseBorders(value.borders) };
}

export const docToJson = (doc: QuiltDoc): JsonValue => doc as unknown as JsonValue;

// ---------------------------------------------------------------------------------------------------------------
// Ce que le quilt pose (règles de suppression, SPEC §1.13)

/** Le bloc (et sa coloration) qu'une référence désigne : la coloration prime, car « Scinder » peut avoir changé de bloc. */
export function resolveRef(project: Project, ref: { blockId: Id; coloringId: Id | "" }): { blockId: Id; coloringId: Id | "" } | null {
  if (ref.coloringId) {
    for (const list of BLOCK_LISTS) {
      for (const b of project.sketchbook[list]) if (b.colorings.some((c) => c.id === ref.coloringId)) return { blockId: b.id, coloringId: ref.coloringId };
    }
    // Coloration supprimée : on retombe sur le dessin au trait si le bloc existe encore.
    return findBlock(project, ref.blockId) ? { blockId: ref.blockId, coloringId: "" } : null;
  }
  return findBlock(project, ref.blockId) ? { blockId: ref.blockId, coloringId: "" } : null;
}

/** La liste des `placements` d'un quilt : sans doublon, références résolues. */
export function placementsOf(project: Project, doc: QuiltDoc): BlockPlacement[] {
  const seen = new Set<string>();
  const out: BlockPlacement[] = [];
  const add = (ref: { blockId: Id; coloringId: Id | "" }): void => {
    const r = resolveRef(project, ref);
    if (!r) return;
    const key = `${r.blockId}|${r.coloringId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ blockId: r.blockId, coloringId: r.coloringId });
  };
  for (const s of Object.values(doc.set)) add(s);
  for (const i of doc.items) if (!i.text && !i.embroidery && !i.photoId) add(i);
  return out;
}

/** L'élément du carnet correspondant à un quilt édité (nouveau identifiant, fiche vide). */
export function quiltItemOf(project: Project, draft: QuiltDraft, name: string, id: Id = createId()): QuiltItem {
  return {
    id,
    card: { name, reference: "", notes: "", back: { classification: "", categories: [] } },
    layout: docToJson(draft.doc),
    placements: placementsOf(project, draft.doc),
    fills: { ...draft.fills },
  };
}

/** Deux quilts identiques (même disposition, même pose, même coloration) : le carnet ne les ajoute pas deux fois. */
export function sameDraft(a: QuiltDraft, b: QuiltDraft): boolean {
  return JSON.stringify([a.doc, sortedEntries(a.fills)]) === JSON.stringify([b.doc, sortedEntries(b.fills)]);
}

function sortedEntries(fills: Readonly<Record<string, Paint>>): [string, Paint][] {
  return Object.entries(fills).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
}

// ---------------------------------------------------------------------------------------------------------------
// Symétries du carré (rotations d'un quart de tour, miroir) : le groupe D4

/** Une transformation du carré unité, comme (miroir d'abord, puis `rot` quarts de tour horaires). */
export interface Dihedral {
  rot: Quarter;
  flip: boolean;
}

/**
 * Matrice 2×2 de la transformation sur des coordonnées centrées : miroir (x → −x) puis rotation horaire
 * (écran, y vers le bas) : (x, y) → (−y, x).
 */
function d4Matrix(t: Dihedral): [number, number, number, number] {
  let m: [number, number, number, number] = t.flip ? [-1, 0, 0, 1] : [1, 0, 0, 1];
  for (let i = 0; i < t.rot; i++) m = [-m[2], -m[3], m[0], m[1]]; // R·M avec R = [[0,−1],[1,0]]
  return m;
}

export function composeD4(after: Dihedral, before: Dihedral): Dihedral {
  const a = d4Matrix(after);
  const b = d4Matrix(before);
  const m = [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3]];
  for (const flip of [false, true]) {
    for (const rot of [0, 1, 2, 3] as const) {
      const c = d4Matrix({ rot, flip });
      if (c.every((v, i) => v === m[i])) return { rot, flip };
    }
  }
  return before;
}

export const IDENTITY_D4: Dihedral = { rot: 0, flip: false };

const R1: Dihedral = { rot: 1, flip: false };
const R2: Dihedral = { rot: 2, flip: false };
const R3: Dihedral = { rot: 3, flip: false };
const F0: Dihedral = { rot: 0, flip: true };
const F1: Dihedral = { rot: 1, flip: true };
const F2: Dihedral = { rot: 2, flip: true };
const F3: Dihedral = { rot: 3, flip: true };

/**
 * Les 16 états de l'outil Symétrie (Q-4.5) : à chaque clic, une paire (transformation des blocs « pairs »,
 * transformation des blocs « impairs » du damier). Les 7 premiers appliquent la même transformation à tous les blocs
 * (les plus visibles) ; les suivants ne touchent qu'une parité, puis les deux rotations croisées. Le 17ᵉ clic revient
 * à l'état d'origine.
 */
export const SYMMETRY_STATES: readonly (readonly [Dihedral, Dihedral])[] = [
  [R1, R1],
  [R2, R2],
  [R3, R3],
  [F0, F0],
  [F2, F2],
  [F1, F1],
  [F3, F3],
  [R1, IDENTITY_D4],
  [R2, IDENTITY_D4],
  [R3, IDENTITY_D4],
  [F0, IDENTITY_D4],
  [F2, IDENTITY_D4],
  [F1, IDENTITY_D4],
  [F3, IDENTITY_D4],
  [R1, R3],
  [R3, R1],
];

/** L'état n (0 = origine) d'un cycle de 17 clics. */
export function symmetryAt(clicks: number): readonly [Dihedral, Dihedral] {
  const n = ((clicks % 17) + 17) % 17;
  return n === 0 ? [IDENTITY_D4, IDENTITY_D4] : (SYMMETRY_STATES[n - 1] as readonly [Dihedral, Dihedral]);
}
