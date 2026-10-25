// Ajout de nœuds sur un segment (outil Édition). Un « nœud » est une extrémité : ajouter un nœud revient à couper
// le segment en deux. La planarisation du jalon M3 traitera ensuite le dessin comme un graphe.

import { createId, type Id } from "../project/model";
import { cleanSegment, replaceSegments, type BlockDraft } from "./draft";
import { EPS, segmentLength, subSegment, type Pt, type Segment } from "./geometry";
import { intersect } from "./intersect";

/** Paramètres des nœuds d'un partage en N parts égales : i / N. */
export function partitionParams(n: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < n; i++) out.push(i / n);
  return out;
}

/**
 * Paramètres d'un partage « en quinconce » (Q-6.2) : (i − ½) / N pour i = 1 à N. Les deux parts d'extrémité
 * valent une demi-part, les autres une part entière.
 */
export function staggerParams(n: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= n; i++) out.push((i - 0.5) / n);
  return out;
}

/** Nombre de parts admis pour Partitionner et Décaler. */
export const MAX_PARTS = 64;

/** Coupe un segment aux paramètres donnés (en ignorant ceux qui sont aux extrémités ou en double). */
export function splitSegment(seg: Segment, params: readonly number[]): Segment[] {
  const minGap = EPS / Math.max(segmentLength(seg), EPS);
  const ts: number[] = [];
  for (const t of [...params].sort((a, b) => a - b)) {
    if (t <= minGap || t >= 1 - minGap) continue;
    if (ts.length > 0 && t - (ts.at(-1) as number) <= minGap) continue;
    ts.push(t);
  }
  if (ts.length === 0) return [seg];
  const bounds = [0, ...ts, 1];
  const pieces: Segment[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    pieces.push(cleanSegment(subSegment(seg, bounds[i] as number, bounds[i + 1] as number, i === 0 ? seg.id : createId())));
  }
  return pieces;
}

/** Ajoute des nœuds sur un segment aux paramètres donnés. */
export function addNodesAt(draft: BlockDraft, id: Id, params: readonly number[]): BlockDraft {
  const seg = draft.segments.find((s) => s.id === id);
  if (!seg) return draft;
  const pieces = splitSegment(seg, params);
  if (pieces.length === 1) return draft;
  return replaceSegments(draft, new Map([[id, pieces]]));
}

/** Croisements du segment `id` avec tous les autres (hors extrémités du segment lui-même). */
export function crossingsOf(draft: BlockDraft, id: Id): { other: Id; point: Pt; t: number; u: number }[] {
  const seg = draft.segments.find((s) => s.id === id);
  if (!seg) return [];
  const out: { other: Id; point: Pt; t: number; u: number }[] = [];
  for (const other of draft.segments) {
    if (other.id === id) continue;
    for (const c of intersect(seg, other)) out.push({ other: other.id, point: c.point, t: c.t, u: c.u });
  }
  return out;
}

/** Nœuds aux intersections : le segment choisi et ceux qui le croisent sont coupés aux croisements. */
export function addNodesAtIntersections(draft: BlockDraft, id: Id): BlockDraft {
  const crossings = crossingsOf(draft, id);
  if (crossings.length === 0) return draft;
  const params = new Map<Id, number[]>();
  const push = (key: Id, t: number) => params.set(key, [...(params.get(key) ?? []), t]);
  for (const c of crossings) {
    push(id, c.t);
    push(c.other, c.u);
  }
  const replacements = new Map<Id, Segment[]>();
  for (const [key, ts] of params) {
    const seg = draft.segments.find((s) => s.id === key);
    if (seg) replacements.set(key, splitSegment(seg, ts));
  }
  if ([...replacements.values()].every((p) => p.length === 1)) return draft;
  return replaceSegments(draft, replacements);
}
