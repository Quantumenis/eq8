// Impression d'une photo ou d'une broderie du quilt (SPEC §9.9), et de la mise en page de photos (SPEC §9.10).
// Une photo est un remplissage « tissu » dont l'identifiant est « photo:<id> » : une seule tuile, à sa taille réelle.

import type { PageLayout, LayoutPhoto } from "../image/pagelayout";
import type { Embroidery } from "../embroidery/embroidery";
import type { PhotoItem } from "../project/model";
import { multiply, rotation, scaling, translation, type Mat } from "../quilt/geom";
import { at, rectPath, type Fill, type Item, type Page } from "./display";
import { flowBoxes, lineWidth, pagesOf, sizeText, withFooters, BLACK, type PackBox, type PrintContext } from "./kit";
import { pageSize, printableArea, tileContent } from "./paper";
import { PRINT_TEXT } from "./texts";

export const photoFabricId = (photoId: string): string => `photo:${photoId}`;
export const isPhotoFabricId = (id: string): boolean => id.startsWith("photo:");

/** Taille réelle de la photo, en pouces (pixels ÷ ppp), telle que la tuile « photo » la déclare. */
export interface PhotoSize {
  width: number;
  height: number;
}

/** Remplissage qui étire la photo sur le rectangle (x, y, w, h). */
export function photoFill(photo: Pick<PhotoItem, "id">, size: PhotoSize, x: number, y: number, w: number, h: number): Fill {
  return { kind: "fabric", fabricId: photoFabricId(photo.id), rgb: "#bdbdbd", mat: [w / size.width, 0, 0, h / size.height, x, y] };
}

export interface PhotoPrintOptions {
  /** Pouces ajoutés de chaque côté pour couvrir la marge de couture d'une photo imprimée sur tissu (1/16 po conseillé). */
  bleed: number;
}

/** Une photo (ou plusieurs copies) à une taille donnée, rangée sur les pages ; mosaïque si elle dépasse la page. */
export function photoPages(ctx: PrintContext, name: string, photo: PhotoItem, size: PhotoSize, w: number, h: number, copies = 1, o: PhotoPrintOptions = { bleed: 0 }): Page[] {
  const bw = w + 2 * o.bleed;
  const bh = h + 2 * o.bleed;
  const make = (id: string): PackBox => ({ id, w: bw, h: bh, items: [{ kind: "path", d: rectPath(0, 0, bw, bh), fill: photoFill(photo, size, 0, 0, bw, bh) }] });
  const boxes = Array.from({ length: Math.max(1, copies) }, (_, i) => make(`photo${i}`));
  const area = printableArea(ctx.setup);
  const { placed, tooBig } = flowBoxes(boxes, area, 0.15);
  let pages = pagesOf(ctx, boxes, placed);
  for (const big of tooBig) pages = pages.concat(tileContent(big.items, big.w, big.h, ctx.setup, PRINT_TEXT.tiles));
  return withFooters(ctx, pages, `${name} — ${sizeText(w, h, ctx.unit)} — ${ctx.projectName}`);
}

/** Une broderie, ses tracés au trait fin à sa taille (le fil de la broderie ou celui qu'on donne). */
export function embroideryPages(ctx: PrintContext, name: string, emb: Embroidery, w: number, h: number, o: { lineWidth: number; thread?: string; copies?: number }): Page[] {
  const sx = w / emb.width;
  const sy = h / emb.height;
  const lw = lineWidth(ctx, o.lineWidth);
  const make = (id: string): PackBox => ({
    id,
    w,
    h,
    items: emb.paths.map((p) => {
      const pts = p.closed ? [...p.points, p.points[0] as [number, number]] : p.points;
      const d = pts.map(([x, y], i) => ({ op: i === 0 ? ("M" as const) : ("L" as const), x: x * sx, y: y * sy }));
      return { kind: "path" as const, d, stroke: { rgb: o.thread ?? emb.thread ?? BLACK, width: lw } };
    }),
  });
  const boxes = Array.from({ length: Math.max(1, o.copies ?? 1) }, (_, i) => make(`emb${i}`));
  const { placed, tooBig } = flowBoxes(boxes, printableArea(ctx.setup), 0.15);
  let pages = pagesOf(ctx, boxes, placed);
  for (const big of tooBig) pages = pages.concat(tileContent(big.items, big.w, big.h, ctx.setup, PRINT_TEXT.tiles));
  return withFooters(ctx, pages, `${name} — ${sizeText(w, h, ctx.unit)} — ${ctx.projectName}`);
}

/** Dimensions de la photo avant rotation (la boîte de la page échange largeur et hauteur pour un quart de tour). */
export function layoutSize(i: LayoutPhoto): { w: number; h: number } {
  return i.rot % 2 === 1 ? { w: i.h, h: i.w } : { w: i.w, h: i.h };
}

/** La similitude d'une photo de la mise en page : rotation et miroirs autour du centre de sa boîte (x, y, w, h). */
export function layoutMat(i: LayoutPhoto): Mat {
  const { w, h } = layoutSize(i);
  let m: Mat = translation(-w / 2, -h / 2);
  if (i.flipH) m = multiply(scaling(-1, 1), m);
  if (i.flipV) m = multiply(scaling(1, -1), m);
  m = multiply(rotation(i.rot * 90), m);
  return multiply(translation(i.x + i.w / 2, i.y + i.h / 2), m);
}

/** La page de la mise en page : chaque photo posée dans sa boîte, tournée et retournée. La grille ne s'imprime pas. */
export function layoutPage(ctx: PrintContext, layout: PageLayout, photos: (photoId: string) => { photo: PhotoItem; size: PhotoSize } | null): Page {
  const size = pageSize(ctx.setup);
  const area = printableArea(ctx.setup);
  const items: Item[] = [];
  for (const i of layout.items) {
    const found = photos(i.photoId);
    if (!found) continue;
    const { w, h } = layoutSize(i);
    items.push({ kind: "group", mat: layoutMat(i), items: [{ kind: "path", d: rectPath(0, 0, w, h), fill: photoFill(found.photo, found.size, 0, 0, w, h) }] });
  }
  return { ...size, items: [at(area.x, area.y, items)] };
}
