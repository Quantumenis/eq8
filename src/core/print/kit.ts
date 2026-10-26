// Briques communes des impressions : contexte, image d'un bloc (4 styles), bloc clé, pastilles, pied de page,
// répartition de boîtes sur les pages.

import type { Paint, Project } from "../project/model";
import type { DisplayUnit } from "../units";
import { formatLength } from "../units";
import { IDENTITY } from "../quilt/geom";
import { at, boundaryPath, holedPath, rectPath, segmentPath, type Item, type Page, type PrintFonts, type Stroke } from "./display";
import { fillOf } from "./format";
import { pageSize, printableArea, type PageSetup } from "./paper";
import type { PrintBlock } from "./source";

export interface PrintContext {
  project: Project;
  projectName: string;
  fonts: PrintFonts;
  setup: PageSetup;
  unit: DisplayUnit;
  /** Épaisseur minimale des traits (points) : Préférences > Options d'impression (1 px = 0,75 pt par défaut). */
  minLine: number;
}

export const BLACK = "#000000";

export const lineWidth = (ctx: PrintContext, w: number): number => Math.max(ctx.minLine, w);

export type BlockStyle = "line" | "stencil" | "applique" | "fabric";

export interface PictureOptions {
  style: BlockStyle;
  /** Épaisseur du trait, en points. */
  width: number;
  blockOutline: boolean;
  pieceOutlines: boolean;
  /** Une lettre par pièce (bloc clé), à la taille `letterSize` (points). */
  letters?: Map<string, string>;
  letterSize?: number;
}

/** L'image d'un bloc dans son repère (pouces, origine au coin haut-gauche). */
export function blockPicture(block: PrintBlock, project: Project, o: PictureOptions): Item[] {
  const items: Item[] = [];
  const stroke: Stroke = { rgb: BLACK, width: o.width };
  if (o.style === "fabric" || o.style === "applique") {
    for (const p of block.pieces) {
      const fill = o.style === "applique" ? { kind: "rgb" as const, rgb: "#ffffff" } : (fillOf(project, p.paint, p.fabricMat ?? IDENTITY) ?? { kind: "rgb" as const, rgb: "#ffffff" });
      items.push({ kind: "path", d: holedPath(p.boundary, p.holes), fill, ...(o.style === "applique" || o.pieceOutlines ? { stroke } : {}) });
    }
  }
  if (o.style === "line" || o.style === "stencil") {
    const s: Stroke = o.style === "stencil" ? { ...stroke, dash: [o.width * 1.5, o.width * 2.5] } : stroke;
    for (const seg of block.lines) items.push({ kind: "path", d: segmentPath(seg), stroke: s });
  }
  if (o.blockOutline || o.style === "line" || o.style === "applique") {
    items.push({ kind: "path", d: rectPath(0, 0, block.width, block.height), stroke: { ...stroke, join: "miter" } });
  }
  if (o.letters) {
    for (const p of block.pieces) {
      const letter = o.letters.get(p.key);
      if (!letter) continue;
      const size = o.letterSize ?? 8;
      items.push({ kind: "text", x: p.inner.x, y: p.inner.y + (size * 0.36) / 72, text: letter, role: "symbol", size, align: "center" });
    }
  }
  return items;
}

/** Le bloc clé : une miniature du bloc (contours seuls) avec une lettre par pièce, mise à `size` pouces de large. */
export function keyBlock(block: PrintBlock, project: Project, letters: Map<string, string>, size: number, fonts: PrintFonts, colored = false): { items: Item[]; width: number; height: number } {
  const k = size / Math.max(block.width, block.height);
  const pic = blockPicture(block, project, { style: colored ? "fabric" : "applique", width: 0.6, blockOutline: true, pieceOutlines: true, letters, letterSize: fonts.symbol.size / k });
  return { items: [{ kind: "group", mat: [k, 0, 0, k, 0, 0], items: pic }], width: block.width * k, height: block.height * k };
}

/** Une pastille d'habillage (tissu à l'échelle réelle, ou couleur) de `s` pouces. */
export function swatch(project: Project, paint: Paint | undefined, x: number, y: number, s: number): Item {
  const fill = fillOf(project, paint, [1, 0, 0, 1, x, y]) ?? { kind: "rgb" as const, rgb: "#ffffff" };
  return { kind: "path", d: rectPath(x, y, s, s), fill, stroke: { rgb: "#555555", width: 0.5, join: "miter" } };
}

/** Taille lisible d'un bloc : « 6 × 6 po ». */
export function sizeText(w: number, h: number, unit: DisplayUnit): string {
  const a = formatLength(w, unit, 3).replace(/ (po|cm)$/, "");
  return `${a} × ${formatLength(h, unit, 3)}`;
}

/** Pied de page (en bas à gauche) : nom, taille, projet ; et le numéro de page à droite. */
export function footer(ctx: PrintContext, text: string, page: number, pages: number): Item[] {
  const size = pageSize(ctx.setup);
  const y = size.height - Math.max(0.18, ctx.setup.margins.bottom / 2);
  return [
    { kind: "text", x: ctx.setup.margins.left, y, text, role: "footer", rgb: "#333333" },
    { kind: "text", x: size.width - ctx.setup.margins.right, y, text: `${page} / ${pages}`, role: "footer", align: "right", rgb: "#333333" },
  ];
}

/** Ajoute le pied de page à toutes les pages. */
export function withFooters(ctx: PrintContext, pages: Page[], text: string): Page[] {
  return pages.map((p, i) => ({ ...p, items: [...p.items, ...footer(ctx, text, i + 1, pages.length)] }));
}

/** Une boîte à ranger : contenu (repère local, origine en haut à gauche), taille, et un identifiant. */
export interface PackBox {
  id: string;
  w: number;
  h: number;
  items: Item[];
  /** Position imposée (aperçu modifié) : page et coin haut-gauche dans la zone utile. */
  fixed?: { page: number; x: number; y: number };
}

export interface Placed {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Range des boîtes par rangées dans la zone utile des pages, à la suite (comme un texte) ; `gap` les sépare.
 * La première page peut commencer plus bas (`firstTop`). Les boîtes trop grandes pour une page sont refusées.
 */
export function flowBoxes(boxes: readonly PackBox[], area: { width: number; height: number }, gap: number, firstTop = 0): { placed: Placed[]; tooBig: PackBox[] } {
  const placed: Placed[] = [];
  const tooBig: PackBox[] = [];
  let page = 0;
  let x = 0;
  let y = firstTop;
  let rowH = 0;
  for (const b of boxes) {
    if (b.fixed) {
      placed.push({ id: b.id, page: b.fixed.page, x: b.fixed.x, y: b.fixed.y, w: b.w, h: b.h });
      continue;
    }
    if (b.w > area.width + 1e-9 || b.h > area.height + 1e-9) {
      tooBig.push(b);
      continue;
    }
    if (x > 0 && x + b.w > area.width + 1e-9) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
    }
    if (y + b.h > area.height + 1e-9) {
      page += 1;
      x = 0;
      y = 0;
      rowH = 0;
    }
    placed.push({ id: b.id, page, x, y, w: b.w, h: b.h });
    x += b.w + gap;
    rowH = Math.max(rowH, b.h);
  }
  return { placed, tooBig };
}

/** Construit les pages d'un rangement : chaque boîte est posée à sa place dans la zone utile. */
export function pagesOf(ctx: PrintContext, boxes: readonly PackBox[], placed: readonly Placed[], extra: (page: number) => Item[] = () => []): Page[] {
  const size = pageSize(ctx.setup);
  const area = printableArea(ctx.setup);
  const count = placed.reduce((m, p) => Math.max(m, p.page + 1), 0);
  const pages: Page[] = [];
  for (let i = 0; i < count; i++) {
    const items: Item[] = [...extra(i)];
    for (const p of placed.filter((q) => q.page === i)) {
      const box = boxes.find((b) => b.id === p.id);
      if (box) items.push(at(area.x + p.x, area.y + p.y, box.items, box.id));
    }
    pages.push({ ...size, items });
  }
  return pages;
}

export { boundaryPath };
