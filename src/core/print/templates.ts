// Gabarits (SPEC §9.3, §9.5, Q-9.2 à Q-9.4) : chaque forme de pièce est imprimée une fois, à l'échelle 1:1, avec
// la ligne de coupe en trait continu, la ligne de couture en tirets, une flèche de droit-fil, sa lettre, le nombre à
// couper et le nom du bloc. Le bloc clé (miniature lettrée) ouvre la première page. Une pièce plus grande que la page
// est répartie en mosaïque. L'aperçu peut supprimer, déplacer et pivoter (par 30°) les gabarits.

import type { Pt } from "../draw/geometry";
import { applyMat, multiply, rotation, translation, type Mat } from "../quilt/geom";
import { boundaryPath, linePath, polyPath, transformSegments, type Item, type Page } from "./display";
import { BLACK, flowBoxes, keyBlock, lineWidth, pagesOf, sizeText, withFooters, type PackBox, type PrintContext } from "./kit";
import { seamOffset } from "./offset";
import { printableArea, tileContent } from "./paper";
import { classifyPieces, lettersByKey, type PieceClass } from "./shapes";
import type { PrintBlock } from "./source";
import { textWidth } from "./measure";
import { PRINT_TEXT } from "./texts";

export type KeyBlockSize = "none" | "small" | "large";
export const KEY_BLOCK_INCHES: Record<Exclude<KeyBlockSize, "none">, number> = { small: 2, large: 3.5 };

export interface TemplateOptions {
  /** Largeur de la marge (pouces) et « Imprimer la marge ». */
  seam: number;
  printSeam: boolean;
  keyBlock: KeyBlockSize;
  /** Épaisseur du trait (points). */
  lineWidth: number;
}

/** Les retouches de l'aperçu (SPEC §9.5) : gabarits supprimés, pivotés, déplacés. */
export interface TemplateEdits {
  removed: string[];
  rotations: Record<string, number>;
  moves: Record<string, { page: number; x: number; y: number }>;
}

export const NO_EDITS: TemplateEdits = { removed: [], rotations: {}, moves: {} };

const PAD = 0.12;
const GAP = 0.15;

function boxOf(pts: readonly Pt[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

/** Flèche à deux pointes de `a` à `b`. */
function arrow(a: Pt, b: Pt, width: number): Item[] {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const h = 0.09;
  const head = (p: Pt, dir: number): Item => ({
    kind: "path",
    d: polyPath(
      [
        { x: p.x + h * Math.cos(dir + 2.7), y: p.y + h * Math.sin(dir + 2.7) },
        p,
        { x: p.x + h * Math.cos(dir - 2.7), y: p.y + h * Math.sin(dir - 2.7) },
      ],
      false,
    ),
    stroke: { rgb: BLACK, width },
  });
  return [{ kind: "path", d: linePath(a, b), stroke: { rgb: BLACK, width } }, head(b, ang), head(a, ang + Math.PI)];
}

/** Le gabarit d'une forme, dans un repère local dont l'origine est le coin haut-gauche de sa boîte. */
export function templateBox(cls: PieceClass, block: PrintBlock, ctx: PrintContext, o: TemplateOptions, rotationDeg = 0): PackBox {
  const piece = cls.first;
  const c = piece.inner;
  const r: Mat = multiply(translation(c.x, c.y), multiply(rotation(rotationDeg), translation(-c.x, -c.y)));
  const sewing = transformSegments(piece.boundary, r);
  const poly = piece.polygon.map((p) => applyMat(r, p));
  const withSeam = o.printSeam && o.seam > 0;
  const cut = withSeam ? seamOffset(poly, o.seam) : poly;
  const b = boxOf(cut);
  const shift = translation(PAD - b.x0, PAD - b.y0);
  const w = b.x1 - b.x0 + 2 * PAD;
  const h = b.y1 - b.y0 + 2 * PAD;
  const lw = lineWidth(ctx, o.lineWidth);
  const items: Item[] = [];
  if (withSeam) items.push({ kind: "path", d: polyPath(cut), stroke: { rgb: BLACK, width: lw, join: "miter" } });
  items.push({ kind: "path", d: boundaryPath(sewing), stroke: withSeam ? { rgb: BLACK, width: lw, dash: [4, 3] } : { rgb: BLACK, width: lw, join: "miter" } });
  // Lettre, nombre à couper et nom du bloc, au point intérieur.
  const inner = applyMat(r, c);
  const total = cls.pieces.length;
  const letterSize = ctx.fonts.symbol.size * 1.75;
  const lineH = (ctx.fonts.number.size * 1.25) / 72;
  let y = inner.y - lineH;
  items.push({ kind: "text", x: inner.x, y, text: cls.letter, role: "symbol", size: letterSize, align: "center", bold: true });
  y += lineH * 1.1;
  items.push({ kind: "text", x: inner.x, y, text: PRINT_TEXT.cutCount(total), role: "number", align: "center" });
  if (cls.mirrorOf) {
    y += lineH;
    items.push({ kind: "text", x: inner.x, y, text: PRINT_TEXT.mirrored(cls.mirrorOf), role: "number", align: "center" });
  }
  y += lineH;
  items.push({ kind: "text", x: inner.x, y, text: block.name, role: "number", align: "center" });
  // Flèche de droit-fil : parallèle au droit-fil du tissu, sous les textes.
  const span = Math.min(1.2, Math.max(0.35, 0.45 * Math.min(b.x1 - b.x0, b.y1 - b.y0)));
  const g = piece.grain + (rotationDeg * Math.PI) / 180;
  const mid = { x: inner.x, y: y + lineH * 0.9 };
  items.push(...arrow({ x: mid.x - (span / 2) * Math.cos(g), y: mid.y - (span / 2) * Math.sin(g) }, { x: mid.x + (span / 2) * Math.cos(g), y: mid.y + (span / 2) * Math.sin(g) }, Math.max(ctx.minLine, 0.5)));
  return { id: `tpl:${cls.letter}`, w, h, items: [{ kind: "group", mat: shift, items }] };
}

export interface TemplateDoc {
  pages: Page[];
  /** Gabarits rangés (pour l'aperçu modifiable) : page, position et taille dans la zone utile. */
  placed: { id: string; page: number; x: number; y: number; w: number; h: number }[];
  classes: PieceClass[];
}

/** Les pages des gabarits d'un bloc. */
export function templatePages(block: PrintBlock, ctx: PrintContext, o: TemplateOptions, edits: TemplateEdits = NO_EDITS): TemplateDoc {
  const classes = classifyPieces(block.pieces);
  const area = printableArea(ctx.setup);
  const boxes: PackBox[] = [];
  // En-tête de la première page : le nom, puis le bloc clé.
  const headerH = (ctx.fonts.header.size * 1.6) / 72;
  const header: Item[] = [{ kind: "text", x: 0, y: (ctx.fonts.header.size / 72) * 1.05, text: block.name, role: "header", bold: true }];
  let headW = textWidth(block.name, ctx.fonts.header.size, true);
  let headH = headerH;
  if (o.keyBlock !== "none") {
    const kb = keyBlock(block, ctx.project, lettersByKey(classes), KEY_BLOCK_INCHES[o.keyBlock], ctx.fonts);
    header.push({ kind: "group", mat: [1, 0, 0, 1, 0, headerH], items: kb.items });
    headW = Math.max(headW, kb.width);
    headH += kb.height;
  }
  boxes.push({ id: "key", w: Math.min(area.width, headW), h: headH + 0.05, items: header });
  for (const cls of classes) {
    if (edits.removed.includes(cls.letter)) continue;
    const box = templateBox(cls, block, ctx, o, edits.rotations[cls.letter] ?? 0);
    const fixed = edits.moves[box.id];
    boxes.push(fixed ? { ...box, fixed } : box);
  }
  const { placed, tooBig } = flowBoxes(boxes, area, GAP);
  let pages = pagesOf(ctx, boxes, placed);
  // Les gabarits plus grands que la page : une mosaïque chacun.
  for (const big of tooBig) {
    pages = pages.concat(tileContent(big.items, big.w, big.h, ctx.setup, PRINT_TEXT.tiles));
  }
  const footerText = `${block.name} — ${sizeText(block.width, block.height, ctx.unit)} — ${ctx.projectName}`;
  return { pages: withFooters(ctx, pages, footerText), placed, classes };
}
