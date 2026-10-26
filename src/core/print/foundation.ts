// Fondation (paper piecing, SPEC §9.4, Q-9.5).
// Une section se coud sur papier si l'on peut ajouter ses pièces une à une, chacune le long d'une seule couture droite
// dont la ligne (prolongée) laisse tout ce qui est déjà cousu du même côté. On le teste à rebours : on retire tant
// qu'on peut une pièce « détachable » (la plus petite d'abord) ; la dernière restante est la pièce 1.
// Découpage automatique : si le bloc entier ne se coud pas d'un coup, on le coupe récursivement par une ligne droite
// qui le traverse de part en part sans couper de pièce ; si aucune coupe n'aboutit, le bloc passe en mode manuel.

import { FillRule, unionD, type PathD } from "clipper2-ts";
import type { Pt, Segment } from "../draw/geometry";
import { boundaryPath, polyPath, type Fill, type Item, type Page } from "./display";
import { solidOf } from "./format";
import { BLACK, flowBoxes, lineWidth, pagesOf, sizeText, withFooters, type PackBox, type Placed, type PrintContext } from "./kit";
import { seamOffset, signedAreaOf } from "./offset";
import { printableArea, tileContent } from "./paper";
import { letterName } from "./shapes";
import type { PrintBlock, PrintPiece } from "./source";
import { PRINT_TEXT } from "./texts";

const EPS = 1e-6;

export interface Section {
  letter: string;
  /** Clés des pièces dans l'ordre de couture (A1, A2…). */
  order: string[];
}

export type Sectioning = { ok: true; sections: Section[] } | { ok: false; reason: "curved" | "impossible" };

interface Line {
  /** Point et direction unitaire. */
  p: Pt;
  d: Pt;
}

const r6 = (v: number) => Math.round(v * 1e6);
function edgeId(s: Segment): string {
  const a = `${r6(s.a.x)},${r6(s.a.y)}`;
  const b = `${r6(s.b.x)},${r6(s.b.y)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const lineOf = (s: Segment): Line => {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const n = Math.hypot(dx, dy) || 1;
  return { p: s.a, d: { x: dx / n, y: dy / n } };
};

/** Côté d'un point par rapport à une droite (> 0, < 0, ou 0 à EPS près). */
const side = (l: Line, q: Pt): number => {
  const c = l.d.x * (q.y - l.p.y) - l.d.y * (q.x - l.p.x);
  return Math.abs(c) <= EPS ? 0 : Math.sign(c);
};

/** −1, +1 si tous les sommets de la pièce sont d'un même côté (ou sur la droite), 0 si elle chevauche, NaN si elle est sur la droite. */
function pieceSide(l: Line, piece: PrintPiece): number {
  let s = 0;
  for (const seg of piece.boundary) {
    const v = side(l, seg.a);
    if (v === 0) continue;
    if (s === 0) s = v;
    else if (v !== s) return 0;
  }
  return s === 0 ? NaN : s;
}

/** Les arêtes que la pièce partage avec un ensemble d'autres pièces. */
function sharedEdges(piece: PrintPiece, others: readonly PrintPiece[]): Segment[] {
  const ids = new Set<string>();
  for (const o of others) for (const s of o.boundary) ids.add(edgeId(s));
  return piece.boundary.filter((s) => ids.has(edgeId(s)));
}

/** La pièce peut-elle être la dernière cousue de `set` ? (une seule couture droite, le reste d'un seul côté) */
function detachable(piece: PrintPiece, rest: readonly PrintPiece[]): boolean {
  const shared = sharedEdges(piece, rest);
  if (shared.length === 0) return false;
  const l = lineOf(shared[0] as Segment);
  if (!shared.every((s) => side(l, s.a) === 0 && side(l, s.b) === 0)) return false;
  // Les arêtes partagées doivent former un seul segment continu.
  const ts = shared.map((s) => [(s.a.x - l.p.x) * l.d.x + (s.a.y - l.p.y) * l.d.y, (s.b.x - l.p.x) * l.d.x + (s.b.y - l.p.y) * l.d.y].sort((a, b) => a - b) as [number, number]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ts.length; i++) if ((ts[i] as [number, number])[0] > (ts[i - 1] as [number, number])[1] + EPS) return false;
  const ps = pieceSide(l, piece);
  if (!(ps === 1 || ps === -1)) return false;
  return rest.every((o) => pieceSide(l, o) === -ps);
}

/** Ordre de couture d'une section, ou `null` si elle ne se coud pas d'un seul tenant. */
export function sewingOrder(pieces: readonly PrintPiece[]): string[] | null {
  let rest = [...pieces];
  const removed: string[] = [];
  while (rest.length > 1) {
    const candidates = rest.filter((p) => detachable(p, rest.filter((o) => o !== p))).sort((a, b) => a.area - b.area);
    const p = candidates[0];
    if (!p) return null;
    removed.push(p.key);
    rest = rest.filter((o) => o !== p);
  }
  return [...rest.map((p) => p.key), ...removed.reverse()];
}

/** Les coupes droites possibles d'un ensemble de pièces : chaque pièce entièrement d'un côté, les deux côtés non vides. */
function cuts(pieces: readonly PrintPiece[]): [PrintPiece[], PrintPiece[]][] {
  const seen = new Set<string>();
  const out: [PrintPiece[], PrintPiece[]][] = [];
  for (const p of pieces) {
    for (const s of p.boundary) {
      const l = lineOf(s);
      const a: PrintPiece[] = [];
      const b: PrintPiece[] = [];
      let ok = true;
      for (const q of pieces) {
        const v = pieceSide(l, q);
        if (v === 1) a.push(q);
        else if (v === -1) b.push(q);
        else {
          ok = false;
          break;
        }
      }
      if (!ok || a.length === 0 || b.length === 0) continue;
      const key = a
        .map((x) => x.key)
        .sort()
        .join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([a, b]);
    }
  }
  return out;
}

function split(pieces: readonly PrintPiece[], depth: number, memo: Map<string, PrintPiece[][] | null>): PrintPiece[][] | null {
  const id = pieces
    .map((p) => p.key)
    .sort()
    .join(",");
  const hit = memo.get(id);
  if (hit !== undefined) return hit;
  const result = splitUncached(pieces, depth, memo);
  memo.set(id, result);
  return result;
}

function splitUncached(pieces: readonly PrintPiece[], depth: number, memo: Map<string, PrintPiece[][] | null>): PrintPiece[][] | null {
  if (sewingOrder(pieces)) return [[...pieces]];
  if (depth > 12) return null;
  let best: PrintPiece[][] | null = null;
  for (const [a, b] of cuts(pieces)) {
    const left = split(a, depth + 1, memo);
    if (!left) continue;
    const right = split(b, depth + 1, memo);
    if (!right) continue;
    const all = [...left, ...right];
    if (!best || all.length < best.length) best = all;
    if (best.length === 2) break;
  }
  return best;
}

const corner = (ps: readonly PrintPiece[]) =>
  ps.reduce((c, p) => p.polygon.reduce((d, q) => ({ x: Math.min(d.x, q.x), y: Math.min(d.y, q.y) }), c), { x: Infinity, y: Infinity });

/** Découpage automatique en sections et numérotation (A1, A2… ; B1…). */
export function autoSections(block: PrintBlock): Sectioning {
  if (block.pieces.some((p) => p.boundary.some((s) => s.kind === "arc"))) return { ok: false, reason: "curved" };
  const groups = split(block.pieces, 0, new Map());
  if (!groups) return { ok: false, reason: "impossible" };
  groups.sort((g, h) => {
    const a = corner(g);
    const b = corner(h);
    return Math.round((a.y - b.y) * 1e4) || a.x - b.x;
  });
  return { ok: true, sections: groups.map((g, i) => ({ letter: letterName(i), order: sewingOrder(g) ?? g.map((p) => p.key) })) };
}

/** Vérifie un sectionnement manuel : chaque section doit se coudre dans l'ordre donné ; renvoie les sections fautives. */
export function checkSections(block: PrintBlock, sections: readonly Section[]): string[] {
  const bad: string[] = [];
  for (const s of sections) {
    const pieces = s.order.map((k) => block.pieces.find((p) => p.key === k)).filter((p): p is PrintPiece => !!p);
    for (let i = 1; i < pieces.length; i++) {
      if (!detachable(pieces[i] as PrintPiece, pieces.slice(0, i))) {
        bad.push(s.letter);
        break;
      }
    }
  }
  return bad;
}

/** Le contour (polygone) d'une section : l'union de ses pièces. */
export function sectionOutline(pieces: readonly PrintPiece[]): Pt[] {
  const paths = pieces.map((p) => p.polygon.map((q) => ({ x: q.x, y: q.y }))) as PathD[];
  const u = unionD(paths, [], FillRule.NonZero, 7);
  let best: Pt[] = [];
  for (const path of u) {
    const pts = path.map((q) => ({ x: q.x, y: q.y }));
    if (Math.abs(signedAreaOf(pts)) > Math.abs(signedAreaOf(best))) best = pts;
  }
  return best;
}

/** Numéro de chaque pièce (clé → « A1 »). */
export function pieceNumbers(sections: readonly Section[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of sections) s.order.forEach((k, i) => m.set(k, `${s.letter}${i + 1}`));
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// Pages

export type FoundationStyle = "line" | "gray" | "color";

export interface FoundationOptions {
  style: FoundationStyle;
  /** Marge autour de chaque section (pouces). */
  seam: number;
  numbering: boolean;
  /** Une section par gabarit (sinon le bloc entier, sections cernées). */
  separate: boolean;
  printName: boolean;
  /** « Autant de blocs que la page en contient » (aperçu non modifiable). */
  fillPage: boolean;
  lineWidth: number;
}

const GRAY = "#d9d9d9";

function pieceFill(ctx: PrintContext, p: PrintPiece, style: FoundationStyle): Fill | undefined {
  if (style === "gray") return { kind: "rgb", rgb: GRAY };
  if (style === "color") {
    const rgb = solidOf(ctx.project, p.paint);
    return rgb ? { kind: "rgb", rgb } : undefined;
  }
  return undefined;
}

/** Le dessin d'un groupe de pièces (une section ou le bloc) dans un repère dont l'origine est le coin de sa marge. */
function unitBox(id: string, pieces: readonly PrintPiece[], sections: readonly Section[], ctx: PrintContext, o: FoundationOptions, title: string | null): PackBox {
  const outlines = o.separate ? [sectionOutline(pieces)] : sections.map((s) => sectionOutline(s.order.map((k) => pieces.find((p) => p.key === k)).filter((p): p is PrintPiece => !!p)));
  const whole = o.separate ? (outlines[0] as Pt[]) : sectionOutline(pieces);
  const cut = seamOffset(whole, o.seam);
  const xs = cut.map((p) => p.x);
  const ys = cut.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const titleH = title ? (ctx.fonts.header.size * 1.4) / 72 : 0;
  const lw = lineWidth(ctx, o.lineWidth);
  const numbers = pieceNumbers(sections);
  const items: Item[] = [];
  for (const p of pieces) {
    const fill = pieceFill(ctx, p, o.style);
    items.push({ kind: "path", d: boundaryPath(p.boundary), ...(fill ? { fill } : {}), stroke: { rgb: BLACK, width: lw } });
  }
  for (const out of outlines) items.push({ kind: "path", d: polyPath(out), stroke: { rgb: BLACK, width: lw * 2, join: "miter" } });
  if (o.seam > 0) items.push({ kind: "path", d: polyPath(cut), stroke: { rgb: BLACK, width: lw, dash: [3, 2.5], join: "miter" } });
  if (o.numbering) {
    const ns = ctx.fonts.number.size;
    for (const p of pieces) {
      const n = numbers.get(p.key);
      if (n) items.push({ kind: "text", x: p.inner.x, y: p.inner.y + (ns * 0.36) / 72, text: n, role: "number", align: "center" });
    }
  }
  const content: Item[] = [{ kind: "group", mat: [1, 0, 0, 1, -x0, -y0 + titleH], items }];
  if (title) content.push({ kind: "text", x: 0, y: (ctx.fonts.header.size / 72) * 1.05, text: title, role: "header", bold: true });
  return { id, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 + titleH, items: content };
}

/** Les pages d'une fondation ; `edits` porte les sections supprimées et déplacées dans l'aperçu (§9.5). */
export function foundationPages(block: PrintBlock, sections: readonly Section[], ctx: PrintContext, o: FoundationOptions, edits: { removed: string[]; moves: Record<string, { page: number; x: number; y: number }> } = { removed: [], moves: {} }): { pages: Page[]; placed: Placed[] } {
  const area = printableArea(ctx.setup);
  const boxes: PackBox[] = [];
  const pieceOf = (k: string) => block.pieces.find((p) => p.key === k);
  if (o.separate) {
    sections.forEach((s, i) => {
      if (edits.removed.includes(s.letter)) return;
      const pieces = s.order.map(pieceOf).filter((p): p is PrintPiece => !!p);
      const box = unitBox(`sec:${s.letter}`, pieces, [s], ctx, o, o.printName && i === 0 ? block.name : null);
      const fixed = edits.moves[box.id];
      boxes.push(fixed ? { ...box, fixed } : box);
    });
  } else {
    boxes.push(unitBox("sec:all", block.pieces, sections, ctx, o, o.printName ? block.name : null));
  }
  if (o.fillPage && boxes.length > 0) {
    // Autant de copies que la page en contient.
    const per = boxes.reduce((s, b) => s + (b.w + 0.2) * (b.h + 0.2), 0);
    const copies = Math.max(1, Math.floor((area.width * area.height) / Math.max(per, 1e-6)));
    const base = boxes.map(({ fixed: _fixed, ...b }) => b);
    boxes.length = 0;
    for (let c = 0; c < copies; c++) for (const b of base) boxes.push({ ...b, id: `${b.id}#${c}` });
  }
  const { placed, tooBig } = flowBoxes(boxes, area, 0.2);
  let pages = pagesOf(ctx, boxes, placed);
  for (const big of tooBig) pages = pages.concat(tileContent(big.items, big.w, big.h, ctx.setup, PRINT_TEXT.tiles));
  return { pages: withFooters(ctx, pages, `${block.name} — ${sizeText(block.width, block.height, ctx.unit)} — ${ctx.projectName}`), placed };
}
