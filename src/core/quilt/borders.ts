// Bordures du quilt (SPEC §3) : le modèle, les 22 styles et leur géométrie exacte.
//
// Les bordures sont rangées de l'intérieur vers l'extérieur. Tout est exprimé dans le repère du centre (origine au coin
// haut-gauche du centre, y vers le bas) : les bordures occupent donc des coordonnées négatives ou supérieures à la taille
// du centre. Une bordure est un anneau découpé en pièces ; chaque pièce est un emplacement du calque 1 (clé
// `r<id>.<côté><n>`), dans lequel on peut poser un bloc quand sa forme s'y prête (rectangle ou losange).
//
// La géométrie des styles est reconstituée d'après les illustrations du manuel (Q-3.1) :
//  - un côté est une bande de longueur `len` et d'épaisseur `t` ; on y dessine un motif périodique (n cellules) ;
//  - « long horizontal / vertical » et les styles à carreaux font courir deux côtés sur toute la longueur ; les autres
//    gardent les côtés entre les coins et posent un carré dans chaque coin ;
//  - le « quinconce » (half drop) décale le motif d'une demi-cellule ; les « doubles » empilent deux rangées.

import { clipToRect, polygonArea, rectFrame, type Frame, type Pt } from "./geom";
import type { Slot } from "./layout";

export type BorderStyle =
  | "longH"
  | "longV"
  | "corner"
  | "mitered"
  | "blocks"
  | "hdBlocks"
  | "spaced"
  | "diamonds"
  | "hdDiamonds"
  | "doubleDiamonds"
  | "hdDoubleDiamonds"
  | "bigLittle"
  | "hdBigLittle"
  | "pointsOut"
  | "bigLittleOut"
  | "bigLittleIn"
  | "pointsIn"
  | "tileSquares"
  | "tileOnPoint"
  | "tileOnPointCorners"
  | "blocksAligned"
  | "hdBlocksAligned";

/** Dans l'ordre du ruban (SPEC §3.2). */
export const BORDER_STYLES: readonly BorderStyle[] = [
  "longH",
  "longV",
  "corner",
  "mitered",
  "blocks",
  "hdBlocks",
  "spaced",
  "diamonds",
  "hdDiamonds",
  "doubleDiamonds",
  "hdDoubleDiamonds",
  "bigLittle",
  "hdBigLittle",
  "pointsOut",
  "bigLittleOut",
  "bigLittleIn",
  "pointsIn",
  "tileSquares",
  "tileOnPoint",
  "tileOnPointCorners",
  "blocksAligned",
  "hdBlocksAligned",
];

export type BorderSide = "left" | "top" | "right" | "bottom";
export const BORDER_SIDES: readonly BorderSide[] = ["left", "top", "right", "bottom"];
export type BorderSizes = Record<BorderSide, number>;

export interface Border {
  /** Identifiant stable dans le quilt (partie de la clé des emplacements). */
  id: string;
  style: BorderStyle;
  /** Épaisseur de chaque côté, en pouces (0 = pas de côté). */
  sizes: BorderSizes;
  /** Nombre de blocs (ou de motifs) le long des côtés horizontaux et verticaux. */
  nh: number;
  nv: number;
}

export const DEFAULT_BORDER_SIZE = 1;
export const BORDER_SIZE_STEP = 0.25;
export const BORDER_SIZE_MAX = 60;
export const BORDER_COUNT_MAX = 100;
export const DEFAULT_BORDER_STYLE: BorderStyle = "longH";

type SpanMode = "fullH" | "fullV" | "corner" | "mitered";

interface StyleInfo {
  span: SpanMode;
  /** Les compteurs « blocs dans la bordure » sont actifs. */
  counts: boolean;
  /** Les quatre côtés sont toujours présents (carreaux, SPEC §3.7). */
  fourSides: boolean;
  /** Les compteurs sont liés pour garder des carreaux carrés (Q-3.2). */
  tiles: boolean;
  /** Les blocs s'alignent sur la bordure intérieure (SPEC §3.8). */
  aligned: boolean;
}

const STYLE_INFO: Record<BorderStyle, StyleInfo> = {
  longH: { span: "fullH", counts: false, fourSides: false, tiles: false, aligned: false },
  longV: { span: "fullV", counts: false, fourSides: false, tiles: false, aligned: false },
  corner: { span: "corner", counts: false, fourSides: false, tiles: false, aligned: false },
  mitered: { span: "mitered", counts: false, fourSides: false, tiles: false, aligned: false },
  blocks: { span: "corner", counts: true, fourSides: false, tiles: false, aligned: false },
  hdBlocks: { span: "corner", counts: true, fourSides: false, tiles: false, aligned: false },
  spaced: { span: "corner", counts: true, fourSides: false, tiles: false, aligned: false },
  diamonds: { span: "corner", counts: true, fourSides: false, tiles: false, aligned: false },
  hdDiamonds: { span: "corner", counts: true, fourSides: false, tiles: false, aligned: false },
  doubleDiamonds: { span: "corner", counts: true, fourSides: false, tiles: false, aligned: false },
  hdDoubleDiamonds: { span: "corner", counts: true, fourSides: false, tiles: false, aligned: false },
  bigLittle: { span: "corner", counts: true, fourSides: false, tiles: false, aligned: false },
  hdBigLittle: { span: "corner", counts: true, fourSides: false, tiles: false, aligned: false },
  pointsOut: { span: "corner", counts: true, fourSides: false, tiles: false, aligned: false },
  bigLittleOut: { span: "corner", counts: true, fourSides: false, tiles: false, aligned: false },
  bigLittleIn: { span: "corner", counts: true, fourSides: false, tiles: false, aligned: false },
  pointsIn: { span: "corner", counts: true, fourSides: false, tiles: false, aligned: false },
  tileSquares: { span: "fullH", counts: true, fourSides: true, tiles: true, aligned: false },
  tileOnPoint: { span: "fullH", counts: true, fourSides: true, tiles: true, aligned: false },
  tileOnPointCorners: { span: "corner", counts: true, fourSides: true, tiles: true, aligned: false },
  blocksAligned: { span: "fullH", counts: true, fourSides: false, tiles: false, aligned: true },
  hdBlocksAligned: { span: "fullH", counts: true, fourSides: false, tiles: false, aligned: true },
};

export const styleInfo = (style: BorderStyle): StyleInfo => STYLE_INFO[style];
export const hasBlockCounts = (style: BorderStyle): boolean => STYLE_INFO[style].counts;
export const forcesFourSides = (style: BorderStyle): boolean => STYLE_INFO[style].fourSides;
export const isTileStyle = (style: BorderStyle): boolean => STYLE_INFO[style].tiles;
export const isAlignedStyle = (style: BorderStyle): boolean => STYLE_INFO[style].aligned;
/** On peut poser des blocs partout sauf dans « Onglet » (SPEC §3.1). */
export const acceptsBlocks = (style: BorderStyle): boolean => style !== "mitered";

const EPS = 1e-9;
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;
const clampNum = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------------------------------------------
// Modèle

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function uniformSizes(size: number): BorderSizes {
  return { left: size, top: size, right: size, bottom: size };
}

/** Les tailles respectent les bornes ; les styles à carreaux gardent leurs quatre côtés (au moins un pas). */
export function clampSizes(style: BorderStyle, sizes: BorderSizes): BorderSizes {
  const min = forcesFourSides(style) ? BORDER_SIZE_STEP : 0;
  const one = (v: number): number => round6(clampNum(Number.isFinite(v) ? v : DEFAULT_BORDER_SIZE, min, BORDER_SIZE_MAX));
  return { left: one(sizes.left), top: one(sizes.top), right: one(sizes.right), bottom: one(sizes.bottom) };
}

const clampCount = (v: number): number => clampNum(Math.round(Number.isFinite(v) ? v : 1), 1, BORDER_COUNT_MAX);

/** Le prochain identifiant libre (b1, b2…). */
export function nextBorderId(borders: readonly Border[]): string {
  let max = 0;
  for (const b of borders) {
    const n = /^b(\d+)$/.exec(b.id);
    if (n) max = Math.max(max, Number(n[1]));
  }
  return `b${max + 1}`;
}

/** Nombre de blocs conseillé : des blocs à peu près carrés le long de chaque côté du centre. */
export function suggestCounts(innerW: number, innerH: number, sizes: BorderSizes): { nh: number; nv: number } {
  const tH = Math.max(BORDER_SIZE_STEP, (sizes.top + sizes.bottom) / 2 || DEFAULT_BORDER_SIZE);
  const tV = Math.max(BORDER_SIZE_STEP, (sizes.left + sizes.right) / 2 || DEFAULT_BORDER_SIZE);
  return { nh: clampCount(innerW / tH), nv: clampCount(innerH / tV) };
}

export function makeBorder(id: string, style: BorderStyle, sizes: BorderSizes, counts: { nh: number; nv: number }): Border {
  return { id, style, sizes: clampSizes(style, sizes), nh: clampCount(counts.nh), nv: clampCount(counts.nv) };
}

/** Une bordure « Longue horizontale » de 1 po sur les quatre côtés (nouveau quilt, SPEC §3.1). */
export function defaultBorders(style: BorderStyle = DEFAULT_BORDER_STYLE): Border[] {
  return [makeBorder("b1", style, uniformSizes(DEFAULT_BORDER_SIZE), { nh: 8, nv: 10 })];
}

/** La taille finie du quilt : le centre plus toutes les bordures. */
export function totalSizes(borders: readonly Border[]): BorderSizes {
  const sum = uniformSizes(0);
  for (const b of borders) for (const side of BORDER_SIDES) sum[side] = round6(sum[side] + b.sizes[side]);
  return sum;
}

export function finishedSize(centerW: number, centerH: number, borders: readonly Border[]): { width: number; height: number } {
  const t = totalSizes(borders);
  return { width: round6(centerW + t.left + t.right), height: round6(centerH + t.top + t.bottom) };
}

// ---------------------------------------------------------------------------------------------------------------
// Motifs d'un côté : des polygones dans le repère local de la bande (u le long, v de l'arête intérieure vers l'extérieure)

export type PieceKind = "rect" | "rhombus" | "plain";

export interface LocalPiece {
  poly: Pt[];
  kind: PieceKind;
}

const P = (x: number, y: number): Pt => ({ x, y });
const rectPoly = (u0: number, u1: number, v0: number, v1: number): Pt[] => [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
const rect = (u0: number, u1: number, v0: number, v1: number): LocalPiece => ({ poly: rectPoly(u0, u1, v0, v1), kind: "rect" });
const plain = (...pts: Pt[]): LocalPiece => ({ poly: pts, kind: "plain" });

/** Ne garde que ce qui tombe dans le rectangle ; un losange coupé n'est plus un losange. */
function clipPieces(raw: readonly LocalPiece[], u0: number, u1: number, v0: number, v1: number): LocalPiece[] {
  const out: LocalPiece[] = [];
  for (const piece of raw) {
    const clipped = clipToRect(piece.poly, u0, v0, u1, v1);
    if (clipped.length < 3) continue;
    const area = polygonArea(clipped);
    if (area < EPS) continue;
    const whole = Math.abs(area - polygonArea(piece.poly)) < 1e-9;
    out.push({ poly: clipped, kind: piece.kind === "rect" ? "rect" : whole ? piece.kind : "plain" });
  }
  return out;
}

const uniformBounds = (len: number, n: number): number[] => Array.from({ length: n + 1 }, (_, i) => (i * len) / n);

/** Les bornes d'une rangée décalée d'une demi-cellule : demi-cellules aux deux bouts. */
function halfDropBounds(bounds: readonly number[]): number[] {
  const out = [bounds[0] as number];
  for (let i = 0; i + 1 < bounds.length; i++) out.push(((bounds[i] as number) + (bounds[i + 1] as number)) / 2);
  out.push(bounds[bounds.length - 1] as number);
  return out;
}

function cellsRow(bounds: readonly number[], v0: number, v1: number): LocalPiece[] {
  const out: LocalPiece[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = bounds[i] as number;
    const b = bounds[i + 1] as number;
    if (b - a > EPS) out.push(rect(a, b, v0, v1));
  }
  return out;
}

/**
 * Un motif d'une cellule de largeur c et de hauteur t, centré sur x = 0 ; il comprend aussi les pièces du joint de
 * droite (x = c/2), qui débordent donc sur la cellule suivante.
 */
type Motif = (c: number, t: number) => LocalPiece[];

const diamond = (c: number, t: number): LocalPiece => ({ poly: [P(-c / 2, t / 2), P(0, t), P(c / 2, t / 2), P(0, 0)], kind: "rhombus" });

const MOTIFS: Partial<Record<BorderStyle, Motif>> = {
  diamonds: (c, t) => [diamond(c, t), plain(P(0, 0), P(c, 0), P(c / 2, t / 2)), plain(P(0, t), P(c, t), P(c / 2, t / 2))],
  // Les triangles du joint sont chacun coupés en un petit losange inscrit et deux petits triangles.
  bigLittle: (c, t) => {
    const lower = [
      plain(P(c / 2, 0), P(0.75 * c, t / 4), P(c / 2, t / 2), P(0.25 * c, t / 4)),
      plain(P(0, 0), P(c / 2, 0), P(0.25 * c, t / 4)),
      plain(P(c / 2, 0), P(c, 0), P(0.75 * c, t / 4)),
    ];
    const upper = lower.map((p) => plain(...p.poly.map((q) => P(q.x, t - q.y))));
    return [diamond(c, t), ...lower, ...upper];
  },
  pointsOut: (c, t) => [plain(P(-c / 2, 0), P(c / 2, 0), P(0, t)), plain(P(0, t), P(c, t), P(c / 2, 0))],
  pointsIn: (c, t) => [plain(P(-c / 2, t), P(c / 2, t), P(0, 0)), plain(P(0, 0), P(c, 0), P(c / 2, t))],
  bigLittleOut: (c, t) => [
    plain(P(-c / 2, 0), P(c / 2, 0), P(0, t)),
    plain(P(c / 2, 0), P(0.75 * c, t / 2), P(c / 2, t), P(0.25 * c, t / 2)),
    plain(P(0, t), P(c / 2, t), P(0.25 * c, t / 2)),
    plain(P(c / 2, t), P(c, t), P(0.75 * c, t / 2)),
  ],
  bigLittleIn: (c, t) => [
    plain(P(-c / 2, t), P(c / 2, t), P(0, 0)),
    plain(P(c / 2, t), P(0.75 * c, t / 2), P(c / 2, 0), P(0.25 * c, t / 2)),
    plain(P(0, 0), P(c / 2, 0), P(0.25 * c, t / 2)),
    plain(P(c / 2, 0), P(c, 0), P(0.75 * c, t / 2)),
  ],
};

const MOTIF_OF: Partial<Record<BorderStyle, BorderStyle>> = {
  tileOnPoint: "diamonds",
  tileOnPointCorners: "diamonds",
  hdDiamonds: "diamonds",
  doubleDiamonds: "diamonds",
  hdDoubleDiamonds: "diamonds",
  hdBigLittle: "bigLittle",
};

/** Une rangée du motif répété n fois sur `len`, décalée de `shift` cellule, dans la hauteur [v0, v0 + th]. */
function periodicRow(motif: Motif, len: number, n: number, shift: number, v0: number, th: number): LocalPiece[] {
  const c = len / n;
  const raw: LocalPiece[] = [];
  for (let k = -1; k <= n; k++) {
    const cx = (k + 0.5 - shift) * c;
    for (const p of motif(c, th)) raw.push({ kind: p.kind, poly: p.poly.map((q) => P(q.x + cx, q.y + v0)) });
  }
  return clipPieces(raw, 0, len, v0, v0 + th);
}

/** Carrés espacés : n carrés de côté t (au plus la cellule) séparés par des bandes. */
function spacedRow(len: number, t: number, n: number): LocalPiece[] {
  const sq = Math.min(t, len / n);
  const gap = (len - n * sq) / (n + 1);
  const out: LocalPiece[] = [];
  let u = 0;
  for (let i = 0; i <= n; i++) {
    if (gap > EPS) out.push({ poly: rectPoly(u, u + gap, 0, t), kind: "plain" });
    u += gap;
    if (i < n) {
      out.push(rect(u, u + sq, 0, t));
      u += sq;
    }
  }
  return out;
}

/** Les pièces d'un côté (repère local). `grid` : bornes imposées pour les styles alignés. */
export function sidePieces(style: BorderStyle, len: number, t: number, n: number, grid: readonly number[] | null = null): LocalPiece[] {
  const count = clampCount(n);
  switch (style) {
    case "longH":
    case "longV":
    case "corner":
      return [rect(0, len, 0, t)];
    case "blocks":
    case "tileSquares":
      return cellsRow(uniformBounds(len, count), 0, t);
    case "blocksAligned":
      return cellsRow(grid ?? uniformBounds(len, count), 0, t);
    case "hdBlocks":
    case "hdBlocksAligned": {
      const bounds = style === "hdBlocksAligned" && grid ? grid : uniformBounds(len, count);
      return [...cellsRow(bounds, 0, t / 2), ...cellsRow(halfDropBounds(bounds), t / 2, t)];
    }
    case "spaced":
      return spacedRow(len, t, count);
    case "doubleDiamonds":
    case "hdDoubleDiamonds": {
      const motif = MOTIFS.diamonds as Motif;
      const half = style === "hdDoubleDiamonds";
      return [...periodicRow(motif, len, count, half ? 0.5 : 0, 0, t / 2), ...periodicRow(motif, len, count, 0, t / 2, t / 2)];
    }
    case "mitered":
      return [];
    default: {
      const base = MOTIF_OF[style] ?? style;
      const motif = MOTIFS[base];
      if (!motif) return [rect(0, len, 0, t)];
      const shift = style === "hdDiamonds" || style === "hdBigLittle" ? 0.5 : 0;
      return periodicRow(motif, len, count, shift, 0, t);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// L'anneau d'une bordure

export interface BorderRing {
  id: string;
  index: number;
  inner: Rect;
  outer: Rect;
}

export interface BordersResult {
  slots: Slot[];
  rings: BorderRing[];
  /** Le quilt fini : le centre et toutes les bordures. */
  bounds: Rect;
}

const worldPoly = (side: BorderSide, ref: Rect, u0: number, poly: readonly Pt[]): Pt[] =>
  poly.map((q) => {
    switch (side) {
      case "top":
        return P(u0 + q.x, ref.y0 - q.y);
      case "bottom":
        return P(u0 + q.x, ref.y1 + q.y);
      case "left":
        return P(ref.x0 - q.y, u0 + q.x);
      case "right":
        return P(ref.x1 + q.y, u0 + q.x);
    }
  });

function boxPoly(poly: readonly Pt[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

/** Le cadre où un bloc s'étire : le rectangle, ou le losange (pointe haute, gauche, droite). */
function frameOf(poly: readonly Pt[], kind: PieceKind): Frame | undefined {
  const box = boxPoly(poly);
  if (kind === "rect") return rectFrame(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
  if (kind === "rhombus") {
    const top = poly.reduce((a, b) => (b.y < a.y ? b : a));
    const left = poly.reduce((a, b) => (b.x < a.x ? b : a));
    const right = poly.reduce((a, b) => (b.x > a.x ? b : a));
    return { o: top, u: P(right.x - top.x, right.y - top.y), v: P(left.x - top.x, left.y - top.y) };
  }
  return undefined;
}

const sideCount = (side: BorderSide, b: Border): number => (side === "top" || side === "bottom" ? b.nh : b.nv);

/** Les bornes d'une bande alignée sur la bordure intérieure : cellules sur sa largeur, et les « extras » de chaque bout. */
function alignedGrid(start: number, end: number, pStart: number, pEnd: number, n: number): number[] {
  const cells = uniformBounds(pEnd - pStart, clampCount(n)).map((v) => v + pStart - start);
  const out = [0];
  for (const v of cells) if (v > (out[out.length - 1] as number) + EPS && v < end - start - EPS) out.push(v);
  out.push(end - start);
  return out;
}

/** Construit tous les emplacements des bordures autour d'un centre de `width` × `height`. */
export function buildBorders(width: number, height: number, borders: readonly Border[]): BordersResult {
  const slots: Slot[] = [];
  const rings: BorderRing[] = [];
  let inner: Rect = { x0: 0, y0: 0, x1: width, y1: height };
  let prev: Rect = inner;
  borders.forEach((border, index) => {
    const info = STYLE_INFO[border.style];
    const s = border.sizes;
    const outer: Rect = { x0: inner.x0 - s.left, y0: inner.y0 - s.top, x1: inner.x1 + s.right, y1: inner.y1 + s.bottom };
    rings.push({ id: border.id, index, inner, outer });
    let seq = 0;
    const emit = (name: string, role: "border" | "piece", poly: Pt[], frame: Frame | undefined, row: number): void => {
      const slot: Slot = { key: `r${border.id}.${name}`, role, poly, row, col: seq++, border: border.id };
      if (frame && role === "border") slot.frame = frame;
      slots.push(slot);
    };
    const blockable = acceptsBlocks(border.style);
    const pushLocal = (side: BorderSide, ref: Rect, u0: number, pieces: readonly LocalPiece[], row: number): void => {
      pieces.forEach((piece, i) => {
        const poly = worldPoly(side, ref, u0, piece.poly);
        const frame = blockable ? frameOf(poly, piece.kind) : undefined;
        emit(`${side[0]}${i}`, frame ? "border" : "piece", poly, frame, row);
      });
    };

    if (border.style === "mitered") {
      const quad = (name: string, poly: Pt[], row: number): void => {
        if (polygonArea(poly) > EPS) emit(name, "piece", poly, undefined, row);
      };
      quad("t", [P(outer.x0, outer.y0), P(outer.x1, outer.y0), P(inner.x1, inner.y0), P(inner.x0, inner.y0)], 0);
      quad("r", [P(outer.x1, outer.y0), P(outer.x1, outer.y1), P(inner.x1, inner.y1), P(inner.x1, inner.y0)], 1);
      quad("b", [P(outer.x0, outer.y1), P(inner.x0, inner.y1), P(inner.x1, inner.y1), P(outer.x1, outer.y1)], 2);
      quad("l", [P(outer.x0, outer.y0), P(inner.x0, inner.y0), P(inner.x0, inner.y1), P(outer.x0, outer.y1)], 3);
    } else {
      // Étendue de chaque côté selon le style.
      const horizontalFull = info.span === "fullH";
      const verticalFull = info.span === "fullV";
      const spans: Record<BorderSide, { u0: number; u1: number }> = {
        top: horizontalFull ? { u0: outer.x0, u1: outer.x1 } : { u0: inner.x0, u1: inner.x1 },
        bottom: horizontalFull ? { u0: outer.x0, u1: outer.x1 } : { u0: inner.x0, u1: inner.x1 },
        left: verticalFull ? { u0: outer.y0, u1: outer.y1 } : { u0: inner.y0, u1: inner.y1 },
        right: verticalFull ? { u0: outer.y0, u1: outer.y1 } : { u0: inner.y0, u1: inner.y1 },
      };
      const order: BorderSide[] = ["top", "right", "bottom", "left"];
      order.forEach((side, row) => {
        const t = s[side];
        if (t < EPS) return;
        const { u0, u1 } = spans[side];
        const len = u1 - u0;
        if (len < EPS) return;
        const horizontal = side === "top" || side === "bottom";
        const ref = inner;
        let grid: number[] | null = null;
        if (info.aligned) grid = horizontal ? alignedGrid(u0, u1, prev.x0, prev.x1, sideCount(side, border)) : alignedGrid(u0, u1, prev.y0, prev.y1, sideCount(side, border));
        pushLocal(side, ref, u0, sidePieces(border.style, len, t, sideCount(side, border), grid), row);
      });
      if (info.span === "corner") {
        const corners: [string, Rect, number, number][] = [
          ["k0", { x0: outer.x0, y0: outer.y0, x1: inner.x0, y1: inner.y0 }, s.left, s.top],
          ["k1", { x0: inner.x1, y0: outer.y0, x1: outer.x1, y1: inner.y0 }, s.right, s.top],
          ["k2", { x0: inner.x1, y0: inner.y1, x1: outer.x1, y1: outer.y1 }, s.right, s.bottom],
          ["k3", { x0: outer.x0, y0: inner.y1, x1: inner.x0, y1: outer.y1 }, s.left, s.bottom],
        ];
        for (const [name, r, w, h] of corners) {
          if (w < EPS || h < EPS) continue;
          const poly = [P(r.x0, r.y0), P(r.x1, r.y0), P(r.x1, r.y1), P(r.x0, r.y1)];
          const frame = blockable ? rectFrame(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0) : undefined;
          emit(name, frame ? "border" : "piece", poly, frame, 4);
        }
      }
    }
    prev = inner;
    inner = outer;
  });
  return { slots, rings, bounds: inner };
}

/** Les polygones d'un style, pour sa vignette dans le ruban : un petit quilt central entouré de la bordure. */
export function borderPreview(style: BorderStyle): { polys: Pt[][]; width: number; height: number } {
  const border = makeBorder("b1", style, uniformSizes(2), { nh: 4, nv: 4 });
  const result = buildBorders(8, 8, [border]);
  return { polys: result.slots.map((s) => s.poly), width: result.bounds.x1 - result.bounds.x0, height: result.bounds.y1 - result.bounds.y0 };
}

/** L'anneau d'une bordure dans un résultat (ou `undefined`). */
export const ringOf = (result: BordersResult, id: string): BorderRing | undefined => result.rings.find((r) => r.id === id);
