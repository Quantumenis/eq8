// Le brouillon d'un bloc EasyDraw : sa taille, son accrochage, ses segments et ses repères.
// Toutes les opérations sont pures (brouillon → brouillon) ; une opération sans effet renvoie le brouillon reçu.

import { createId, type Id, type JsonValue, type Paint, type ThreadStroke } from "../project/model";
import {
  EPS,
  boundsOf,
  clean,
  cleanPt,
  dist,
  insideRect,
  lerp,
  samePoint,
  type Pt,
  type Segment,
} from "./geometry";
import { analyzeBlock, type PieceAnalysis } from "./pieces";
import type { SnapSettings } from "./snap";

export interface BlockDraft {
  /** Taille finie du bloc, en pouces. */
  width: number;
  height: number;
  snapX: number;
  snapY: number;
  graph: { show: boolean; divX: number; divY: number };
  snap: { grid: boolean; nodes: boolean; lines: boolean };
  segments: Segment[];
  /** Repères : ne s'impriment pas et survivent à un nouveau bloc. */
  guides: Segment[];
  /** Coloration en cours (onglet COLORATION), par clé de pièce. */
  fills: Record<string, Paint>;
  /** Fils des coutures de la coloration en cours, par clé de section (voir threads.ts). */
  threads: Record<string, ThreadStroke>;
}

export const DEFAULT_BLOCK_SIZE = 6;
export const DEFAULT_SNAP_PER_BLOCK = 24;
export const MAX_SNAP = 1000;

export function newDraft(guides: Segment[] = []): BlockDraft {
  return {
    width: DEFAULT_BLOCK_SIZE,
    height: DEFAULT_BLOCK_SIZE,
    snapX: DEFAULT_SNAP_PER_BLOCK,
    snapY: DEFAULT_SNAP_PER_BLOCK,
    graph: { show: true, divX: DEFAULT_BLOCK_SIZE, divY: DEFAULT_BLOCK_SIZE },
    snap: { grid: true, nodes: true, lines: false },
    segments: [],
    guides,
    fills: {},
    threads: {},
  };
}

export function snapSettingsOf(d: BlockDraft): SnapSettings {
  return {
    width: d.width,
    height: d.height,
    snapX: d.snapX,
    snapY: d.snapY,
    toGrid: d.snap.grid,
    toNodes: d.snap.nodes,
    toLines: d.snap.lines,
  };
}

/** Le dessin tel qu'il est enregistré dans un bloc du carnet (les repères n'y sont pas). */
export interface EasyDrawing {
  kind: "easydraw";
  segments: Segment[];
}

export function toDrawing(d: BlockDraft): JsonValue {
  return { kind: "easydraw", segments: d.segments.map(cleanSegment) } as unknown as JsonValue;
}

export function fromDrawing(
  drawing: JsonValue,
  width: number,
  height: number,
  guides: Segment[],
  fills: Record<string, Paint> = {},
  threads: Record<string, ThreadStroke> = {},
): BlockDraft {
  const base = {
    ...newDraft(guides),
    width,
    height,
    graph: { show: true, divX: Math.max(1, Math.round(width)), divY: Math.max(1, Math.round(height)) },
    fills: { ...fills },
    threads: { ...threads },
  };
  const d = drawing as { kind?: string; segments?: Segment[] } | null;
  if (d && d.kind === "easydraw" && Array.isArray(d.segments)) {
    return { ...base, snapX: suggestSnap(width), snapY: suggestSnap(height), segments: d.segments.map((s) => ({ ...s, id: createId() })) };
  }
  return { ...base, snapX: suggestSnap(width), snapY: suggestSnap(height) };
}

function suggestSnap(size: number): number {
  return Math.max(1, Math.min(MAX_SNAP, Math.round(size * 4)));
}

export function cleanSegment(s: Segment): Segment {
  return s.kind === "line"
    ? { id: s.id, kind: "line", a: cleanPt(s.a), b: cleanPt(s.b) }
    : { id: s.id, kind: "arc", a: cleanPt(s.a), b: cleanPt(s.b), sagitta: clean(s.sagitta) };
}

/** Le nombre de points doit égaler la taille (en unité d'affichage) ou en être un multiple. */
export function isValidSnapCount(sizeInDisplayUnit: number, count: number): boolean {
  if (!Number.isInteger(count) || count < 1 || count > MAX_SNAP) return false;
  const rounded = Math.round(sizeInDisplayUnit);
  if (Math.abs(sizeInDisplayUnit - rounded) > 1e-6 || rounded < 1) return true; // taille non entière : pas de contrainte
  return count % rounded === 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Ajouter, supprimer, déplacer

/** Retire de `seg` (une droite) les parties superposées à une droite déjà dessinée ; renvoie les morceaux restants. */
function trimCollinear(seg: Extract<Segment, { kind: "line" }>, others: readonly Segment[]): Segment[] {
  let pieces: Extract<Segment, { kind: "line" }>[] = [seg];
  for (const other of others) {
    if (other.kind !== "line") continue;
    const next: Extract<Segment, { kind: "line" }>[] = [];
    for (const piece of pieces) {
      const dx = piece.b.x - piece.a.x;
      const dy = piece.b.y - piece.a.y;
      const len = Math.hypot(dx, dy);
      const lineDist = (p: Pt) => Math.abs((p.x - piece.a.x) * dy - (p.y - piece.a.y) * dx) / len;
      if (lineDist(other.a) > EPS || lineDist(other.b) > EPS) {
        next.push(piece);
        continue;
      }
      const param = (p: Pt) => ((p.x - piece.a.x) * dx + (p.y - piece.a.y) * dy) / (len * len);
      const lo = Math.max(0, Math.min(param(other.a), param(other.b)));
      const hi = Math.min(1, Math.max(param(other.a), param(other.b)));
      if (hi - lo <= EPS / len) {
        next.push(piece);
        continue;
      }
      if (lo > EPS / len) next.push({ id: createId(), kind: "line", a: piece.a, b: lerp(piece.a, piece.b, lo) });
      if (hi < 1 - EPS / len) next.push({ id: createId(), kind: "line", a: lerp(piece.a, piece.b, hi), b: piece.b });
    }
    pieces = next;
  }
  return pieces;
}

function sameArc(a: Extract<Segment, { kind: "arc" }>, b: Segment): boolean {
  if (b.kind !== "arc") return false;
  const forward = samePoint(a.a, b.a) && samePoint(a.b, b.b) && Math.abs(a.sagitta - b.sagitta) <= EPS;
  const backward = samePoint(a.a, b.b) && samePoint(a.b, b.a) && Math.abs(a.sagitta + b.sagitta) <= EPS;
  return forward || backward;
}

export interface AddResult {
  draft: BlockDraft;
  /** Identifiants des segments réellement ajoutés (après retrait des superpositions). */
  added: Id[];
}

/** Ajoute des segments : ceux qui sortent du bloc ou sont réduits à un point sont ignorés, les superpositions retirées. */
export function addSegments(draft: BlockDraft, segments: readonly Segment[]): AddResult {
  let current = draft.segments;
  const added: Id[] = [];
  for (const raw of segments) {
    const seg = cleanSegment(raw);
    if (dist(seg.a, seg.b) <= EPS) continue;
    if (!insideRect(boundsOf(seg), draft.width, draft.height)) continue;
    const pieces =
      seg.kind === "line" ? trimCollinear(seg, current) : current.some((o) => sameArc(seg, o)) ? [] : [seg];
    for (const piece of pieces) {
      if (dist(piece.a, piece.b) <= EPS) continue;
      current = [...current, piece];
      added.push(piece.id);
    }
  }
  return added.length === 0 ? { draft, added } : { draft: { ...draft, segments: current }, added };
}

export function insideRectOfDraft(draft: BlockDraft, seg: Segment): boolean {
  return insideRect(boundsOf(seg), draft.width, draft.height);
}

export function deleteSegments(draft: BlockDraft, ids: readonly Id[]): BlockDraft {
  const drop = new Set(ids);
  if (!draft.segments.some((s) => drop.has(s.id))) return draft;
  return { ...draft, segments: draft.segments.filter((s) => !drop.has(s.id)) };
}

export function replaceSegments(draft: BlockDraft, replacements: ReadonlyMap<Id, Segment[]>): BlockDraft {
  const out: Segment[] = [];
  for (const s of draft.segments) {
    const r = replacements.get(s.id);
    if (r) out.push(...r);
    else out.push(s);
  }
  return { ...draft, segments: out };
}

export function translateSegment(s: Segment, dx: number, dy: number): Segment {
  const a = { x: s.a.x + dx, y: s.a.y + dy };
  const b = { x: s.b.x + dx, y: s.b.y + dy };
  return s.kind === "line" ? { id: s.id, kind: "line", a, b } : { id: s.id, kind: "arc", a, b, sagitta: s.sagitta };
}

/** Déplace des segments ; refusé (brouillon inchangé) si l'un d'eux sortirait du bloc. */
export function moveSegments(draft: BlockDraft, ids: readonly Id[], dx: number, dy: number): BlockDraft {
  if (Math.abs(dx) <= 1e-12 && Math.abs(dy) <= 1e-12) return draft;
  const move = new Set(ids);
  const moved = draft.segments.map((s) => (move.has(s.id) ? cleanSegment(translateSegment(s, dx, dy)) : s));
  if (moved.some((s, i) => s !== draft.segments[i] && !insideRect(boundsOf(s), draft.width, draft.height))) return draft;
  return { ...draft, segments: moved };
}

/** Déplace un nœud : toutes les extrémités qui coïncident avec `from` vont en `to`. */
export function moveNode(draft: BlockDraft, from: Pt, to: Pt): BlockDraft {
  if (samePoint(from, to, 1e-12)) return draft;
  let touched = false;
  const moved = draft.segments.map((s) => {
    const moveA = samePoint(s.a, from);
    const moveB = samePoint(s.b, from);
    if (!moveA && !moveB) return s;
    touched = true;
    const a = moveA ? cleanPt(to) : s.a;
    const b = moveB ? cleanPt(to) : s.b;
    return s.kind === "line" ? { id: s.id, kind: "line" as const, a, b } : { id: s.id, kind: "arc" as const, a, b, sagitta: s.sagitta };
  });
  if (!touched) return draft;
  const ok = moved.every((s) => dist(s.a, s.b) > EPS && insideRect(boundsOf(s), draft.width, draft.height));
  return ok ? { ...draft, segments: moved } : draft;
}

/** Règle la flèche d'un arc ; refusé si l'arc sortirait du bloc ou s'il dégénère en droite. */
export function setSagitta(draft: BlockDraft, id: Id, sagitta: number): BlockDraft {
  const seg = draft.segments.find((s) => s.id === id);
  if (!seg || seg.kind !== "arc") return draft;
  const value = clean(sagitta);
  if (Math.abs(value) < 1e-4 || value === seg.sagitta) return draft;
  const next: Segment = { ...seg, sagitta: value };
  if (!insideRect(boundsOf(next), draft.width, draft.height)) return draft;
  return { ...draft, segments: draft.segments.map((s) => (s.id === id ? next : s)) };
}

// ---------------------------------------------------------------------------------------------------------------
// Repères

/** Convertit des segments (tout le dessin si `ids` est `null`) en repères. */
export function convertToGuides(draft: BlockDraft, ids: readonly Id[] | null): BlockDraft {
  const pick = ids === null ? new Set(draft.segments.map((s) => s.id)) : new Set(ids);
  const moving = draft.segments.filter((s) => pick.has(s.id));
  if (moving.length === 0) return draft;
  return {
    ...draft,
    segments: draft.segments.filter((s) => !pick.has(s.id)),
    guides: [...draft.guides, ...moving.map((s) => ({ ...s, id: createId() }))],
  };
}

export function clearGuides(draft: BlockDraft): BlockDraft {
  return draft.guides.length === 0 ? draft : { ...draft, guides: [] };
}

// ---------------------------------------------------------------------------------------------------------------
// Taille et réglages

/** Change la taille du bloc : le dessin suit proportionnellement. Refusé pour une taille nulle ou absurde. */
export function resizeBlock(draft: BlockDraft, width: number, height: number): BlockDraft {
  if (!(width >= 0.25 && height >= 0.25 && width <= 120 && height <= 120)) return draft;
  if (Math.abs(width - draft.width) <= 1e-12 && Math.abs(height - draft.height) <= 1e-12) return draft;
  const fx = width / draft.width;
  const fy = height / draft.height;
  const scale = (s: Segment): Segment => {
    const a = cleanPt({ x: s.a.x * fx, y: s.a.y * fy });
    const b = cleanPt({ x: s.b.x * fx, y: s.b.y * fy });
    if (s.kind === "line") return { id: s.id, kind: "line", a, b };
    const old = dist(s.a, s.b);
    return { id: s.id, kind: "arc", a, b, sagitta: clean(old === 0 ? s.sagitta : (s.sagitta * dist(a, b)) / old) };
  };
  return {
    ...draft,
    width,
    height,
    graph: { ...draft.graph, divX: Math.max(1, Math.round(width)), divY: Math.max(1, Math.round(height)) },
    segments: draft.segments.map(scale),
    guides: draft.guides.map(scale),
  };
}

export function setSnapCounts(draft: BlockDraft, snapX: number, snapY: number): BlockDraft {
  if (snapX === draft.snapX && snapY === draft.snapY) return draft;
  if (!Number.isInteger(snapX) || !Number.isInteger(snapY) || snapX < 1 || snapY < 1 || snapX > MAX_SNAP || snapY > MAX_SNAP) return draft;
  return { ...draft, snapX, snapY };
}

export function setSnapOption(draft: BlockDraft, key: keyof BlockDraft["snap"], value: boolean): BlockDraft {
  return draft.snap[key] === value ? draft : { ...draft, snap: { ...draft.snap, [key]: value } };
}

export function setGraphPaper(draft: BlockDraft, patch: Partial<BlockDraft["graph"]>): BlockDraft {
  const next = { ...draft.graph, ...patch };
  if (!Number.isInteger(next.divX) || !Number.isInteger(next.divY) || next.divX < 1 || next.divY < 1 || next.divX > 200 || next.divY > 200) return draft;
  if (next.show === draft.graph.show && next.divX === draft.graph.divX && next.divY === draft.graph.divY) return draft;
  return { ...draft, graph: next };
}

/** Un brouillon sans aucun segment (le contour du bloc n'est pas un segment). */
export function isEmpty(draft: BlockDraft): boolean {
  return draft.segments.length === 0;
}

/** Les segments d'un dessin EasyDraw enregistré, ou `null` si ce n'en est pas un (bloc vide, autre style). */
export function easyDrawSegments(drawing: JsonValue): Segment[] | null {
  const d = drawing as { kind?: string; segments?: Segment[] } | null;
  return d && d.kind === "easydraw" && Array.isArray(d.segments) ? d.segments : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Pièces et coloration

/**
 * Nettoyage du passage à COLORATION et de l'ajout au carnet (SPEC §6.2, Q-6.1) : coupe aux intersections, retrait
 * des segments pendants et des îlots. Le brouillon reçu est renvoyé tel quel s'il était déjà propre.
 */
export function cleanDrawing(draft: BlockDraft): { draft: BlockDraft; analysis: PieceAnalysis } {
  const analysis = analyzeBlock(draft.width, draft.height, draft.segments);
  if (!analysis.changed) return { draft, analysis };
  return { draft: { ...draft, segments: analysis.segments.map(cleanSegment) }, analysis };
}

export function setFills(draft: BlockDraft, fills: Readonly<Record<string, Paint>>): BlockDraft {
  return fills === draft.fills ? draft : { ...draft, fills: { ...fills } };
}

export function setThreads(draft: BlockDraft, threads: Readonly<Record<string, ThreadStroke>>): BlockDraft {
  return threads === draft.threads ? draft : { ...draft, threads: { ...threads } };
}
