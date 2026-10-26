// Dispositions de quilts (SPEC §2) : paramètres, tailles finies et emplacements (« slots ») du calque 1.
// Toutes les tailles sont des tailles finies, en pouces, sans marge de couture. Le repère est celui du centre du quilt :
// origine au coin haut-gauche du centre, x vers la droite, y vers le bas.

import { clipToRect, framePolygon, polygonArea, rectFrame, type Frame, type Pt } from "./geom";
import { DEFAULT_ONE_PATCH, onePatchPieces, onePatchSize, type OnePatchParams } from "./onepatch";
import { PLAIN_STRIP, stripPieces, type Strip } from "./strips";

export type LayoutKind = "horizontal" | "onpoint" | "varpoint" | "stripsH" | "stripsV" | "onepatch" | "custom";
export const LAYOUT_KINDS: readonly LayoutKind[] = ["horizontal", "onpoint", "varpoint", "stripsH", "stripsV", "onepatch", "custom"];

/** Dispositions « standard » : le bloc remplit un emplacement prédéfini (SPEC §4.1). Les autres se posent par glisser-déposer. */
export function isStandardLayout(kind: LayoutKind): boolean {
  return kind !== "custom" && kind !== "onepatch";
}

export interface HorizontalLayout {
  kind: "horizontal";
  nh: number;
  nv: number;
  /** Taille finie des blocs. */
  bw: number;
  bh: number;
  /** Largeur du lattis (entre deux colonnes) et hauteur (entre deux lignes) ; 0 = pas de lattis. */
  sw: number;
  sh: number;
  /** Lattis aussi autour de l'ensemble des blocs. */
  sashBorder: boolean;
}

export interface OnPointLayout {
  kind: "onpoint";
  /** 1 : triangles dans les coins ; 2 : une couture (voir PROGRESS : à valider, Q-2.4). */
  style: 1 | 2;
  nh: number;
  nv: number;
  /** Longueur du côté du bloc. */
  b: number;
  /** Lattis sur tous les côtés du bloc. */
  s: number;
}

export interface VarPointLayout {
  kind: "varpoint";
  style: 1 | 2;
  nh: number;
  nv: number;
  /** Largeur et hauteur de pointe à pointe, à travers le bloc. */
  w: number;
  h: number;
  /** Lattis, ajouté horizontalement tout autour du bloc. */
  s: number;
}

export interface StripsLayout {
  kind: "stripsH" | "stripsV";
  /** Longueur commune à toutes les bandes. */
  length: number;
  strips: Strip[];
  selected: number;
}

export interface OnePatchLayout extends OnePatchParams {
  kind: "onepatch";
}

export interface CustomLayout {
  kind: "custom";
  w: number;
  h: number;
}

export type LayoutParams = HorizontalLayout | OnPointLayout | VarPointLayout | StripsLayout | OnePatchLayout | CustomLayout;

// Bornes (Q-2.2) et pas des curseurs (Q-2.1).
export const BLOCK_SIZE_RANGE = { min: 0.5, max: 120 };
export const SASH_SIZE_RANGE = { min: 0, max: 24 };
export const CUSTOM_SIZE_RANGE = { min: 1, max: 300 };
export const SIZE_STEP = 0.25;
export const DEFAULT_MAX_BLOCKS = 24;
export const HARD_MAX_BLOCKS = 100;

export type SlotRole = "block" | "lattis" | "cornerstone" | "triangle" | "piece" | "border";

export interface Slot {
  /** Clé stable de l'emplacement (clé des pièces du quilt : voir scene.ts). */
  key: string;
  role: SlotRole;
  /** Contour dans le repère du centre. */
  poly: Pt[];
  /** Un bloc peut être posé ici ; il s'étire sur `frame`. */
  frame?: Frame;
  /** Position dans la grille des blocs, pour « un emplacement sur deux » (Alt). */
  row: number;
  col: number;
  /** Identifiant de la bordure à laquelle l'emplacement appartient (calque 1, hors du centre). */
  border?: string;
}

export interface LayoutResult {
  width: number;
  height: number;
  slots: Slot[];
}

export function defaultLayout(kind: LayoutKind): LayoutParams {
  switch (kind) {
    case "horizontal":
      // Q-2.3 : 4 × 5 blocs de 8 po, sans lattis ; la bordure vient avec M6.
      return { kind, nh: 4, nv: 5, bw: 8, bh: 8, sw: 0, sh: 0, sashBorder: false };
    case "onpoint":
      return { kind, style: 1, nh: 3, nv: 3, b: 10, s: 1.5 };
    case "varpoint":
      return { kind, style: 1, nh: 3, nv: 3, w: 9, h: 14, s: 2 };
    case "stripsH":
    case "stripsV":
      return { kind, length: 60, strips: [{ ...PLAIN_STRIP }], selected: 0 };
    case "onepatch":
      return { kind, ...DEFAULT_ONE_PATCH };
    case "custom":
      return { kind, w: 48, h: 60 };
  }
}

const rectSlot = (key: string, role: SlotRole, x: number, y: number, w: number, h: number, row: number, col: number): Slot => ({
  key,
  role,
  poly: [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ],
  frame: rectFrame(x, y, w, h),
  row,
  col,
});

function horizontal(p: HorizontalLayout): LayoutResult {
  // Le long de chaque axe : [lattis de bordure,] bloc, lattis, bloc, …, bloc [, lattis de bordure].
  interface Cut {
    pos: number;
    size: number;
    block: boolean;
    index: number;
  }
  const along = (n: number, block: number, sash: number): { cuts: Cut[]; total: number } => {
    const cuts: Cut[] = [];
    let pos = 0;
    let sashIndex = 0;
    const addSash = (): void => {
      if (sash > 0) {
        cuts.push({ pos, size: sash, block: false, index: sashIndex });
        pos += sash;
      }
      sashIndex += 1;
    };
    if (p.sashBorder) addSash();
    for (let i = 0; i < n; i++) {
      cuts.push({ pos, size: block, block: true, index: i });
      pos += block;
      if (i < n - 1 || p.sashBorder) addSash();
    }
    return { cuts, total: pos };
  };
  const xs = along(p.nh, p.bw, p.sw);
  const ys = along(p.nv, p.bh, p.sh);
  const slots: Slot[] = [];
  for (const cy of ys.cuts) {
    for (const cx of xs.cuts) {
      if (cx.block && cy.block) slots.push(rectSlot(`b${cy.index}_${cx.index}`, "block", cx.pos, cy.pos, cx.size, cy.size, cy.index, cx.index));
      else if (cx.block || cy.block) slots.push(rectSlot(`${cy.block ? "v" : "h"}${cy.index}_${cx.index}`, "lattis", cx.pos, cy.pos, cx.size, cy.size, cy.index, cx.index));
      else slots.push(rectSlot(`k${cy.index}_${cx.index}`, "cornerstone", cx.pos, cy.pos, cx.size, cy.size, cy.index, cx.index));
    }
  }
  return { width: xs.total, height: ys.total, slots };
}

/**
 * Sur la pointe et pointe variable (SPEC §2.4-2.5) : des losanges de pointe à pointe L × H, un lattis `sh` à
 * l'horizontale et `sv` à la verticale. Les losanges se placent sur un réseau en quinconce de pas (L + sh) × (H + sv) ;
 * le centre mesure n_h pas × n_v pas ; ce qui dépasse est coupé au centre (triangles de bord et de coin).
 */
function pointLayout(nh: number, nv: number, L: number, H: number, sh: number, sv: number): LayoutResult {
  const cw = L + sh;
  const ch = H + sv;
  const width = nh * cw;
  const height = nv * ch;
  const slots: Slot[] = [];
  const eps = 1e-9;
  const push = (key: string, role: SlotRole, poly: Pt[], frame: Frame | undefined, row: number, col: number): void => {
    const clipped = clipToRect(poly, 0, 0, width, height);
    if (clipped.length >= 3 && polygonArea(clipped) > 1e-9) slots.push({ key, role, poly: clipped, ...(frame ? { frame } : {}), row, col });
  };
  for (let j = -1; j <= 2 * nv + 1; j++) {
    for (let i = -1; i <= 2 * nh + 1; i++) {
      const cx = (i * cw) / 2;
      const cy = (j * ch) / 2;
      if ((((i - j) % 2) + 2) % 2 === 0) {
        // Un losange-bloc.
        const top = { x: cx, y: cy - H / 2 };
        const right = { x: cx + L / 2, y: cy };
        const bottom = { x: cx, y: cy + H / 2 };
        const left = { x: cx - L / 2, y: cy };
        const whole = left.x >= -eps && right.x <= width + eps && top.y >= -eps && bottom.y <= height + eps;
        if (whole) push(`b${i}_${j}`, "block", [top, right, bottom, left], { o: top, u: { x: L / 2, y: H / 2 }, v: { x: -L / 2, y: H / 2 } }, j, i);
        else push(`t${i}_${j}`, "triangle", [top, right, bottom, left], undefined, j, i);
        if (sh > 0 || sv > 0) {
          // Lattis vers le bas-droite et le bas-gauche.
          const r2 = { x: cx + cw / 2, y: cy + ch / 2 };
          push(`s${i}_${j}r`, "lattis", [right, bottom, { x: r2.x - L / 2, y: r2.y }, { x: r2.x, y: r2.y - H / 2 }], undefined, j, i);
          const l2 = { x: cx - cw / 2, y: cy + ch / 2 };
          push(`s${i}_${j}l`, "lattis", [left, bottom, { x: l2.x + L / 2, y: l2.y }, { x: l2.x, y: l2.y - H / 2 }], undefined, j, i);
        }
      } else if (sh > 0 && sv > 0) {
        // Un bloc de coin du lattis (cornerstone), au milieu de quatre losanges.
        push(
          `k${i}_${j}`,
          "cornerstone",
          [
            { x: cx - sh / 2, y: cy },
            { x: cx, y: cy - sv / 2 },
            { x: cx + sh / 2, y: cy },
            { x: cx, y: cy + sv / 2 },
          ],
          undefined,
          j,
          i,
        );
      }
    }
  }
  return { width, height, slots };
}

function strips(p: StripsLayout): LayoutResult {
  const slots: Slot[] = [];
  let offset = 0;
  p.strips.forEach((strip, index) => {
    for (const piece of stripPieces(strip, p.length)) {
      // Repère local (x le long, y en travers) → quilt : bandes horizontales empilées, ou verticales côte à côte.
      const poly = piece.poly.map((q) => (p.kind === "stripsH" ? { x: q.x, y: q.y + offset } : { x: q.y + offset, y: q.x }));
      const xs = poly.map((q) => q.x);
      const ys = poly.map((q) => q.y);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      const slot: Slot = {
        key: `s${index}.${piece.key}`,
        role: piece.blockable ? "block" : "piece",
        poly,
        row: p.kind === "stripsH" ? index : 0,
        col: p.kind === "stripsH" ? 0 : index,
      };
      if (piece.blockable) slot.frame = rectFrame(x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0);
      slots.push(slot);
    }
    offset += strip.width;
  });
  return p.kind === "stripsH" ? { width: p.length, height: offset, slots } : { width: offset, height: p.length, slots };
}

function onePatch(p: OnePatchLayout): LayoutResult {
  const size = onePatchSize(p);
  const slots = onePatchPieces(p).map((piece, i): Slot => ({ key: piece.key, role: "piece", poly: piece.poly, row: i, col: 0 }));
  return { ...size, slots };
}

export function buildLayout(p: LayoutParams): LayoutResult {
  switch (p.kind) {
    case "horizontal":
      return horizontal(p);
    case "onpoint": {
      // Le côté du bloc est l'arête du carré posé sur la pointe : sa diagonale vaut b·√2 ; le lattis de largeur s
      // s'ajoute sur tous les côtés, soit s·√2 à l'horizontale et à la verticale.
      const d = p.b * Math.SQRT2;
      const sd = p.s * Math.SQRT2;
      return pointLayout(p.nh, p.nv, d, d, sd, sd);
    }
    case "varpoint":
      // Le lattis est horizontal ; il est mis à l'échelle verticalement dans le rapport H/L.
      return pointLayout(p.nh, p.nv, p.w, p.h, p.s, (p.s * p.h) / p.w);
    case "stripsH":
    case "stripsV":
      return strips(p);
    case "onepatch":
      return onePatch(p);
    case "custom":
      return { width: p.w, height: p.h, slots: [] };
  }
}

/** Le polygone d'un emplacement-bloc (le cadre où le bloc s'étire). */
export function slotBlockPolygon(slot: Slot): Pt[] {
  return slot.frame ? framePolygon(slot.frame) : slot.poly;
}

/** Les emplacements où l'on peut poser un bloc. */
export function blockSlots(result: LayoutResult): Slot[] {
  return result.slots.filter((s) => s.frame && s.role !== "piece");
}

const clampNum = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const clampInt = (v: number, lo: number, hi: number): number => clampNum(Math.round(Number.isFinite(v) ? v : lo), lo, hi);
const finiteOr = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Ramène des paramètres (lus d'un fichier ou saisis) dans les bornes. */
export function clampLayout(p: LayoutParams, maxBlocks = DEFAULT_MAX_BLOCKS): LayoutParams {
  const n = (v: number) => clampInt(v, 1, Math.min(HARD_MAX_BLOCKS, Math.max(1, maxBlocks)));
  const size = (v: number) => round6(clampNum(finiteOr(v, 1), BLOCK_SIZE_RANGE.min, BLOCK_SIZE_RANGE.max));
  const sash = (v: number) => round6(clampNum(finiteOr(v, 0), SASH_SIZE_RANGE.min, SASH_SIZE_RANGE.max));
  switch (p.kind) {
    case "horizontal":
      return { ...p, nh: n(p.nh), nv: n(p.nv), bw: size(p.bw), bh: size(p.bh), sw: sash(p.sw), sh: sash(p.sh), sashBorder: !!p.sashBorder };
    case "onpoint":
      return { ...p, style: p.style === 2 ? 2 : 1, nh: n(p.nh), nv: n(p.nv), b: size(p.b), s: sash(p.s) };
    case "varpoint":
      return { ...p, style: p.style === 2 ? 2 : 1, nh: n(p.nh), nv: n(p.nv), w: size(p.w), h: size(p.h), s: sash(p.s) };
    case "stripsH":
    case "stripsV": {
      const list = p.strips.length > 0 ? p.strips : [{ ...PLAIN_STRIP }];
      return {
        ...p,
        length: round6(clampNum(finiteOr(p.length, 60), CUSTOM_SIZE_RANGE.min, CUSTOM_SIZE_RANGE.max)),
        strips: list.slice(0, 100).map((s) => ({ ...s, width: round6(clampNum(finiteOr(s.width, 2), 0.25, 120)), count: clampInt(s.count, 1, 100), across: clampInt(s.across, 1, 100) })),
        selected: clampInt(p.selected, 0, list.length - 1),
      };
    }
    case "onepatch":
      return {
        ...p,
        nh: n(p.nh),
        nv: n(p.nv),
        w: size(p.w),
        h: size(p.h),
        shearX: round6(clampNum(finiteOr(p.shearX, 0), -p.w, p.w)),
        shearY: round6(clampNum(finiteOr(p.shearY, 0), -p.h, p.h)),
      };
    case "custom":
      return { ...p, w: round6(clampNum(finiteOr(p.w, 48), CUSTOM_SIZE_RANGE.min, CUSTOM_SIZE_RANGE.max)), h: round6(clampNum(finiteOr(p.h, 60), CUSTOM_SIZE_RANGE.min, CUSTOM_SIZE_RANGE.max)) };
  }
}
