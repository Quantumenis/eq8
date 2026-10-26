// Commandes sur les bordures (SPEC §3.3-3.10). Comme les autres commandes du quilt, chacune renvoie le brouillon reçu
// quand elle ne change rien.

import type { Paint, Project } from "../project/model";
import {
  BORDER_COUNT_MAX,
  BORDER_SIDES,
  BORDER_SIZE_MAX,
  buildBorders,
  clampSizes,
  DEFAULT_BORDER_SIZE,
  forcesFourSides,
  hasBlockCounts,
  isTileStyle,
  makeBorder,
  nextBorderId,
  ringOf,
  suggestCounts,
  uniformSizes,
  type Border,
  type BorderSide,
  type BorderSizes,
  type BorderStyle,
} from "./borders";
import type { QuiltDraft } from "./doc";
import { buildLayout } from "./layout";
import { prune } from "./ops";

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Verrouillage des tailles (SPEC §3.4) : « Tous », « G+D », « H+B » ; rien de coché = côtés indépendants. */
export interface SizeLock {
  all: boolean;
  leftRight: boolean;
  topBottom: boolean;
}
export const DEFAULT_LOCK: SizeLock = { all: true, leftRight: false, topBottom: false };

const withBorders = (draft: QuiltDraft, borders: Border[]): QuiltDraft => ({ doc: { ...draft.doc, borders }, fills: draft.fills });

/** Retire le contenu (blocs posés et couleurs) d'une bordure. */
function clearContent(draft: QuiltDraft, id: string): QuiltDraft {
  const prefix = `r${id}.`;
  const set = Object.fromEntries(Object.entries(draft.doc.set).filter(([k]) => !k.startsWith(prefix)));
  const fills: Record<string, Paint> = Object.fromEntries(Object.entries(draft.fills).filter(([k]) => !k.startsWith(prefix)));
  const same = Object.keys(set).length === Object.keys(draft.doc.set).length && Object.keys(fills).length === Object.keys(draft.fills).length;
  return same ? draft : { doc: { ...draft.doc, set }, fills };
}

const centerSize = (draft: QuiltDraft): { width: number; height: number } => buildLayout(draft.doc.layout);

/** Une bordure toute neuve : style par défaut, 1 po, ou le clone (style, tailles et nombres, sans contenu) de `from`. */
function freshBorder(draft: QuiltDraft, style: BorderStyle, from: Border | undefined): Border {
  const id = nextBorderId(draft.doc.borders);
  if (from) return makeBorder(id, from.style, from.sizes, { nh: from.nh, nv: from.nv });
  const c = centerSize(draft);
  return makeBorder(id, style, uniformSizes(DEFAULT_BORDER_SIZE), suggestCounts(c.width, c.height, uniformSizes(DEFAULT_BORDER_SIZE)));
}

export interface AddBorderOptions {
  /** Style des bordures neuves (« Style de bordure par défaut »). */
  style: BorderStyle;
  /** La bordure sélectionnée : sert de modèle pour le clonage et de repère pour l'insertion. */
  selected?: string | null;
  clone?: boolean;
}

/** Ajouter : une bordure vierge à l'extérieur. */
export function addBorder(draft: QuiltDraft, options: AddBorderOptions): { draft: QuiltDraft; id: string } {
  const list = draft.doc.borders;
  const model = options.clone ? (list.find((b) => b.id === options.selected) ?? list[list.length - 1]) : undefined;
  const border = freshBorder(draft, options.style, model);
  return { draft: withBorders(draft, [...list, border]), id: border.id };
}

/** Insérer : une bordure vierge à l'intérieur de la bordure sélectionnée (la plus intérieure sans sélection). */
export function insertBorder(draft: QuiltDraft, options: AddBorderOptions): { draft: QuiltDraft; id: string } {
  const list = draft.doc.borders;
  const at = Math.max(0, list.findIndex((b) => b.id === options.selected));
  const model = options.clone ? list[at] : undefined;
  const border = freshBorder(draft, options.style, model);
  const next = [...list.slice(0, at), border, ...list.slice(at)];
  return { draft: withBorders(draft, next), id: border.id };
}

/** Supprimer la bordure sélectionnée, avec son contenu. */
export function removeBorder(draft: QuiltDraft, project: Project, id: string): QuiltDraft {
  const list = draft.doc.borders;
  if (!list.some((b) => b.id === id)) return draft;
  return prune(clearContent(withBorders(draft, list.filter((b) => b.id !== id)), id), project);
}

function update(draft: QuiltDraft, id: string, change: (b: Border) => Border): QuiltDraft {
  const at = draft.doc.borders.findIndex((b) => b.id === id);
  if (at < 0) return draft;
  const cur = draft.doc.borders[at] as Border;
  const next = change(cur);
  if (JSON.stringify(cur) === JSON.stringify(next)) return draft;
  const list = draft.doc.borders.slice();
  list[at] = next;
  return withBorders(draft, list);
}

/** Les carreaux restent carrés : l'autre compteur suit (Q-3.2). */
function squareCounts(draft: QuiltDraft, border: Border, changed: "nh" | "nv"): Border {
  const c = centerSize(draft);
  const result = buildBorders(c.width, c.height, draft.doc.borders.map((b) => (b.id === border.id ? border : b)));
  const ring = ringOf(result, border.id);
  if (!ring) return border;
  const s = border.sizes;
  const full = border.style !== "tileOnPointCorners";
  const spanH = full ? ring.outer.x1 - ring.outer.x0 : ring.inner.x1 - ring.inner.x0;
  const spanV = ring.inner.y1 - ring.inner.y0;
  void s;
  if (changed === "nh") return { ...border, nv: Math.min(BORDER_COUNT_MAX, Math.max(1, Math.round((border.nh * spanV) / spanH))) };
  return { ...border, nh: Math.min(BORDER_COUNT_MAX, Math.max(1, Math.round((border.nv * spanH) / spanV))) };
}

/** Change le style : le contenu de la bordure disparaît (SPEC §3.9) ; les carreaux ont toujours leurs quatre côtés. */
export function setBorderStyle(draft: QuiltDraft, project: Project, id: string, style: BorderStyle): QuiltDraft {
  const cur = draft.doc.borders.find((b) => b.id === id);
  if (!cur || cur.style === style) return draft;
  let next: Border = { ...cur, style, sizes: clampSizes(style, cur.sizes) };
  if (isTileStyle(style)) next = squareCounts(draft, next, "nh");
  return prune(clearContent(update(draft, id, () => next), id), project);
}

/** Règle la taille d'un côté ; le verrouillage fait suivre les autres côtés. */
export function setBorderSize(draft: QuiltDraft, project: Project, id: string, side: BorderSide, value: number, lock: SizeLock = DEFAULT_LOCK): QuiltDraft {
  const cur = draft.doc.borders.find((b) => b.id === id);
  if (!cur) return draft;
  const v = round6(Math.min(BORDER_SIZE_MAX, Math.max(0, Number.isFinite(value) ? value : 0)));
  const sizes: BorderSizes = { ...cur.sizes };
  const horizontalPair = side === "left" || side === "right";
  if (lock.all) for (const s of BORDER_SIDES) sizes[s] = v;
  else if (lock.leftRight && horizontalPair) sizes.left = sizes.right = v;
  else if (lock.topBottom && !horizontalPair) sizes.top = sizes.bottom = v;
  else sizes[side] = v;
  const next = update(draft, id, (b) => ({ ...b, sizes: clampSizes(b.style, sizes) }));
  return next === draft ? draft : prune(next, project);
}

/** Règle le nombre de blocs d'un sens ; pour les carreaux, l'autre sens suit. */
export function setBorderCount(draft: QuiltDraft, project: Project, id: string, which: "nh" | "nv", value: number): QuiltDraft {
  const cur = draft.doc.borders.find((b) => b.id === id);
  if (!cur || !hasBlockCounts(cur.style)) return draft;
  const n = Math.min(BORDER_COUNT_MAX, Math.max(1, Math.round(Number.isFinite(value) ? value : 1)));
  let next: Border = { ...cur, [which]: n };
  if (isTileStyle(cur.style)) next = squareCounts(draft, next, which);
  const out = update(draft, id, () => next);
  return out === draft ? draft : prune(out, project);
}

/** Pose tous les compteurs d'une bordure au même nombre (utile aux styles alignés : SPEC §3.8). */
export function matchCounts(draft: QuiltDraft, project: Project, id: string, from: string): QuiltDraft {
  const src = draft.doc.borders.find((b) => b.id === from);
  const dst = draft.doc.borders.find((b) => b.id === id);
  if (!src || !dst || !hasBlockCounts(dst.style)) return draft;
  const out = update(draft, id, (b) => ({ ...b, nh: src.nh, nv: src.nv }));
  return out === draft ? draft : prune(out, project);
}

export { forcesFourSides };
