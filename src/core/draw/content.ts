// Le contenu d'un dessin de bloc, quel que soit son style : EasyDraw, PolyDraw, applique, motif, ou un mélange
// (pièces + applique). Le dessin enregistré (`BlockItem.drawing`) est du JSON ; on en tire les pièces à colorer, les
// fils (tracés ouverts) et le dessin au trait.
//
//   { kind: "easydraw", segments }
//   { kind: "polydraw", grid, pieces: [{ id, edges }] }
//   { kind: "applique", background, shapes }           bloc d'applique (avec fond) ou motif (sans fond)
//   { kind: "combo", base: <easydraw | polydraw>, shapes }   Easy + Applique, Poly + Applique

import type { Id, JsonValue } from "../project/model";
import { appliqueContent, shapeSegments, type AppNode, type AppShape, type DrawingIssue, type NodeType, type Strand, NODE_TYPES } from "./applique";
import { clean, cleanSegment, type Pt, type Segment } from "./geometry";
import { analyzeBlock, type Piece, type PieceAnalysis } from "./pieces";
import { GRID_KINDS, clampGrid, polyContent, type PolyGrid, type PolyPiece, type PolyState, emptyPoly } from "./polydraw";

/** Les six styles de dessin du plan Bloc (SPEC §6.0). */
export const BLOCK_STYLES = ["easy", "poly", "applique", "motif", "easyApplique", "polyApplique"] as const;
export type BlockStyle = (typeof BLOCK_STYLES)[number];

export const styleHasPieced = (s: BlockStyle): boolean => s === "easy" || s === "poly" || s === "easyApplique" || s === "polyApplique";
export const styleHasApplique = (s: BlockStyle): boolean => s === "applique" || s === "motif" || s === "easyApplique" || s === "polyApplique";
export const styleIsEasy = (s: BlockStyle): boolean => s === "easy" || s === "easyApplique";
export const styleIsPoly = (s: BlockStyle): boolean => s === "poly" || s === "polyApplique";

/** Ce que contient un dessin enregistré. */
export interface DrawingParts {
  style: BlockStyle;
  segments: Segment[];
  poly: PolyState;
  shapes: AppShape[];
}

export interface DrawingContent {
  pieces: Piece[];
  /** Tracés ouverts de l'applique (fils de matelassage ou de broderie). */
  strands: Strand[];
  issues: DrawingIssue[];
  /** Le dessin au trait : tous les contours (impression « dessin au trait », vignettes). */
  lines: Segment[];
  /** Analyse EasyDraw (nettoyage), quand le dessin a une partie EasyDraw. */
  analysis: PieceAnalysis | null;
  /** PolyDraw : part du bloc couverte par les pièces, et recouvrement. */
  coverage: number | null;
  overlap: boolean;
}

// ---------------------------------------------------------------------------------------------------------------
// Lecture défensive

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const pt = (v: unknown): Pt | null => (isRec(v) && finite(v.x) && finite(v.y) ? { x: v.x, y: v.y } : null);

function parseSegment(v: unknown, i: number): Segment | null {
  if (!isRec(v)) return null;
  const a = pt(v.a);
  const b = pt(v.b);
  if (!a || !b) return null;
  const id = typeof v.id === "string" ? v.id : `s${i}`;
  if (v.kind === "arc" && finite(v.sagitta)) return { id, kind: "arc", a, b, sagitta: v.sagitta };
  if (v.kind === "line") return { id, kind: "line", a, b };
  return null;
}

function parseSegments(v: unknown, max = 20000): Segment[] {
  return Array.isArray(v) ? v.slice(0, max).map(parseSegment).filter((s): s is Segment => s !== null) : [];
}

export function parsePoly(v: unknown): PolyState {
  if (!isRec(v)) return emptyPoly();
  const g = isRec(v.grid) && (GRID_KINDS as readonly string[]).includes(v.grid.kind as string) ? v.grid : null;
  const grid: PolyGrid = g ? clampGrid({ kind: g.kind as PolyGrid["kind"], a: finite(g.a) ? g.a : 1, b: finite(g.b) ? g.b : 1 }) : emptyPoly().grid;
  const pieces: PolyPiece[] = [];
  if (Array.isArray(v.pieces)) {
    for (const [i, p] of v.pieces.slice(0, 5000).entries()) {
      if (!isRec(p)) continue;
      const edges = parseSegments(p.edges, 2000);
      if (edges.length >= 2) pieces.push({ id: typeof p.id === "string" ? p.id : `y${i}`, edges });
    }
  }
  return { grid, pieces };
}

export function parseShapes(v: unknown): AppShape[] {
  if (!Array.isArray(v)) return [];
  const out: AppShape[] = [];
  for (const [i, s] of v.slice(0, 5000).entries()) {
    if (!isRec(s) || !Array.isArray(s.nodes)) continue;
    const nodes: AppNode[] = [];
    for (const n of s.nodes.slice(0, 5000)) {
      if (!isRec(n) || !finite(n.x) || !finite(n.y)) continue;
      const type: NodeType = (NODE_TYPES as readonly string[]).includes(n.type as string) ? (n.type as NodeType) : "corner";
      const node: AppNode = { x: n.x, y: n.y, type };
      const hin = pt(n.hin);
      const hout = pt(n.hout);
      if (hin) node.hin = hin;
      if (hout) node.hout = hout;
      nodes.push(node);
    }
    if (nodes.length >= 2) out.push({ id: typeof s.id === "string" ? s.id : `a${i}`, closed: s.closed === true, nodes });
  }
  return out;
}

/** Les parties d'un dessin enregistré ; `null` pour un dessin vide ou inconnu (bloc sans dessin). */
export function partsOfDrawing(drawing: JsonValue): DrawingParts | null {
  if (!isRec(drawing)) return null;
  const empty: Omit<DrawingParts, "style"> = { segments: [], poly: emptyPoly(), shapes: [] };
  switch (drawing.kind) {
    case "easydraw":
      return { style: "easy", ...empty, segments: parseSegments(drawing.segments) };
    case "polydraw":
      return { style: "poly", ...empty, poly: parsePoly(drawing) };
    case "applique":
      return { style: drawing.background === false ? "motif" : "applique", ...empty, shapes: parseShapes(drawing.shapes) };
    case "combo": {
      const base = isRec(drawing.base) ? drawing.base : {};
      if (base.kind === "polydraw") return { style: "polyApplique", ...empty, poly: parsePoly(base), shapes: parseShapes(drawing.shapes) };
      return { style: "easyApplique", ...empty, segments: parseSegments(base.segments), shapes: parseShapes(drawing.shapes) };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Écriture

const cleanNodeJson = (n: AppNode): JsonValue => {
  const out: { [k: string]: JsonValue } = { x: clean(n.x), y: clean(n.y), type: n.type };
  if (n.hin) out.hin = { x: clean(n.hin.x), y: clean(n.hin.y) };
  if (n.hout) out.hout = { x: clean(n.hout.x), y: clean(n.hout.y) };
  return out;
};

const shapesJson = (shapes: readonly AppShape[]): JsonValue => shapes.map((s) => ({ id: s.id, closed: s.closed, nodes: s.nodes.map(cleanNodeJson) }));
const polyJson = (poly: PolyState): { [k: string]: JsonValue } => ({
  kind: "polydraw",
  grid: { kind: poly.grid.kind, a: poly.grid.a, b: poly.grid.b },
  pieces: poly.pieces.map((p) => ({ id: p.id, edges: p.edges.map(cleanSegment) as unknown as JsonValue })),
});

/** Le JSON d'un dessin à enregistrer dans le carnet. */
export function drawingOfParts(p: DrawingParts): JsonValue {
  switch (p.style) {
    case "easy":
      return { kind: "easydraw", segments: p.segments.map(cleanSegment) as unknown as JsonValue };
    case "poly":
      return polyJson(p.poly);
    case "applique":
    case "motif":
      return { kind: "applique", background: p.style === "applique", shapes: shapesJson(p.shapes) };
    case "easyApplique":
      return { kind: "combo", base: { kind: "easydraw", segments: p.segments.map(cleanSegment) as unknown as JsonValue }, shapes: shapesJson(p.shapes) };
    case "polyApplique":
      return { kind: "combo", base: polyJson(p.poly), shapes: shapesJson(p.shapes) };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Contenu

const NO_ISSUES: DrawingIssue[] = [];

export function contentOfParts(p: DrawingParts, width: number, height: number): DrawingContent {
  const pieces: Piece[] = [];
  const lines: Segment[] = [];
  let analysis: PieceAnalysis | null = null;
  let coverage: number | null = null;
  let overlap = false;
  if (styleIsEasy(p.style)) {
    analysis = analyzeBlock(width, height, p.segments);
    pieces.push(...analysis.pieces);
    lines.push(...analysis.segments);
  } else if (styleIsPoly(p.style)) {
    const poly = polyContent(p.poly.pieces, width, height);
    pieces.push(...poly.pieces);
    coverage = poly.coverage;
    overlap = poly.overlap;
    for (const piece of poly.pieces) lines.push(...piece.boundary);
  }
  let strands: Strand[] = [];
  let issues = NO_ISSUES;
  if (styleHasApplique(p.style)) {
    const bg = p.style === "applique" ? { width, height } : null;
    const content = appliqueContent(p.shapes, { background: bg });
    pieces.push(...content.pieces);
    strands = content.strands;
    issues = content.issues;
    for (const s of p.shapes) lines.push(...shapeSegments(s));
  }
  if (p.style === "easy" && analysis) {
    // Rien de plus : les segments nettoyés sont le dessin au trait.
  }
  return { pieces, strands, issues, lines, analysis, coverage, overlap };
}

const cache = new WeakMap<object, { width: number; height: number; content: DrawingContent }>();
const EMPTY: DrawingContent = { pieces: [], strands: [], issues: NO_ISSUES, lines: [], analysis: null, coverage: null, overlap: false };

/** Le contenu d'un dessin du carnet ou de la bibliothèque, calculé une fois par dessin (un projet est immuable). */
export function contentOfDrawing(drawing: JsonValue, width: number, height: number): DrawingContent {
  if (typeof drawing === "object" && drawing !== null) {
    const hit = cache.get(drawing);
    if (hit && hit.width === width && hit.height === height) return hit.content;
  }
  const parts = partsOfDrawing(drawing);
  const content = parts ? contentOfParts(parts, width, height) : analysisOfNothing(width, height);
  if (typeof drawing === "object" && drawing !== null) cache.set(drawing, { width, height, content });
  return content;
}

function analysisOfNothing(width: number, height: number): DrawingContent {
  // Un bloc sans dessin reconnu est un bloc EasyDraw vide : une seule pièce, le bloc entier.
  void EMPTY;
  const analysis = analyzeBlock(width, height, []);
  return { pieces: analysis.pieces, strands: [], issues: NO_ISSUES, lines: [], analysis, coverage: null, overlap: false };
}

export const pieceKeysOf = (c: DrawingContent): Set<string> => new Set(c.pieces.map((p) => p.key));

/** Tous les identifiants de formes d'un dessin (sélection). */
export const shapeIds = (shapes: readonly AppShape[]): Id[] => shapes.map((s) => s.id);
