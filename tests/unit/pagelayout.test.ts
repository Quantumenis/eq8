import { describe, expect, it } from "vitest";
import {
  addPhoto,
  alignPhotos,
  deletePhotos,
  mirrorPhotos,
  movePhotos,
  newPageLayout,
  pastePhotos,
  placePhotos,
  resizePhoto,
  rotatePhotos,
  setGrid,
  tilePhoto,
} from "../../src/core/image/pagelayout";
import { createRaster } from "../../src/core/image/raster";
import { encodePng } from "../../src/core/image/png";
import { applyMat } from "../../src/core/quilt/geom";
import { DEFAULT_FONTS } from "../../src/core/print/display";
import type { PrintContext } from "../../src/core/print/kit";
import { defaultPageSetup } from "../../src/core/print/paper";
import { layoutMat, layoutPage, photoPages } from "../../src/core/print/photo";
import { writePdf } from "../../src/core/print/pdf";
import { emptyNotecard, emptyProject, type PhotoItem } from "../../src/core/project/model";
import { readPdf } from "./pdf-reader";

const set = (...ids: (string | null)[]) => new Set(ids.filter((i): i is string => i !== null));

describe("mise en page de photos (SPEC §9.10)", () => {
  it("une photo se pose à sa taille enregistrée, ou est réduite si elle ne tient pas", () => {
    let l = newPageLayout(7.5, 10);
    const a = addPhoto(l, "p1", 3, 2);
    expect(a.reduced).toBe(false);
    expect(a.layout.items[0]).toMatchObject({ w: 3, h: 2 });
    const big = addPhoto(a.layout, "p2", 15, 10);
    expect(big.reduced).toBe(true);
    expect(big.layout.items[1]).toMatchObject({ w: 7.5, h: 5 });
    expect(addPhoto(l, "p3", 0, 1).id).toBeNull();
    l = a.layout;
  });

  it("déplacer (avec la grille), redimensionner avec proportions, pivoter, miroir", () => {
    let l = addPhoto(newPageLayout(8, 10), "p", 4, 2).layout;
    const id = l.items[0]!.id;
    l = setGrid(l, { snap: true, step: 0.25 });
    l = movePhotos(l, set(id), 1.13, 0.9);
    expect(l.items[0]).toMatchObject({ x: 1.25, y: 1 });
    l = movePhotos(l, set(id), 100, 100); // reste sur la page
    expect(l.items[0]).toMatchObject({ x: 4, y: 8 });
    l = resizePhoto(l, id, 2, 99, true);
    expect(l.items[0]).toMatchObject({ w: 2, h: 1 });
    expect(resizePhoto(l, id, 20, 20, true)).toBe(l); // dépasserait la page
    l = placePhotos(l, set(id), "centerPage");
    expect(l.items[0]).toMatchObject({ x: 3, y: 4.5 });
    l = rotatePhotos(l, set(id), 1);
    expect(l.items[0]).toMatchObject({ w: 1, h: 2, rot: 1, x: 3.5, y: 4 });
    l = rotatePhotos(l, set(id), -1);
    expect(l.items[0]).toMatchObject({ rot: 0, w: 2, h: 1 });
    l = mirrorPhotos(l, set(id), "h");
    expect(l.items[0]?.flipH).toBe(true);
    expect(deletePhotos(l, set(id)).items).toHaveLength(0);
  });

  it("aligner sur la première, préréglages, copier-coller, mosaïque", () => {
    let l = newPageLayout(8, 10);
    for (const [i, y] of [[0, 1], [1, 4]] as const) l = movePhotos(addPhoto(l, `p${i}`, 2, 2, { x: i * 3, y }).layout, set(), 0, 0);
    const [a, b] = l.items;
    l = alignPhotos(l, [a!.id, b!.id], "top");
    expect(l.items[1]!.y).toBe(a!.y);
    l = placePhotos(l, set(a!.id), "bottom");
    expect(l.items[0]!.y).toBe(8);
    const pasted = pastePhotos(l, [a!]);
    expect(pasted.ids).toHaveLength(1);
    expect(pasted.layout.items).toHaveLength(3);
    const tiled = tilePhoto(addPhoto(newPageLayout(6, 4), "t", 2, 2).layout, addPhoto(newPageLayout(6, 4), "t", 2, 2).id ?? "");
    expect(tiled.items).toHaveLength(1); // identifiant inconnu : rien ne change
    const one = addPhoto(newPageLayout(6, 4), "t", 2, 2);
    expect(tilePhoto(one.layout, one.id!).items).toHaveLength(6);
  });

  it("la similitude d'une photo tournée envoie son coin haut-gauche au bon endroit", () => {
    const l = rotatePhotos(movePhotos(addPhoto(newPageLayout(8, 10), "p", 4, 2).layout, set(), 0, 0), set(), 1);
    expect(l.items).toHaveLength(1);
    const item = { id: "i", photoId: "p", x: 1, y: 1, w: 2, h: 4, rot: 1 as const, flipH: false, flipV: false };
    // Avant rotation : 4 × 2 ; le quart de tour horaire fait du coin haut-gauche (0,0) le coin haut-droit de la boîte.
    const m = layoutMat(item);
    const p = applyMat(m, { x: 0, y: 0 });
    expect(p.x).toBeCloseTo(3, 9);
    expect(p.y).toBeCloseTo(1, 9);
    const q = applyMat(m, { x: 4, y: 2 });
    expect(q.x).toBeCloseTo(1, 9);
    expect(q.y).toBeCloseTo(5, 9);
  });
});

describe("impression d'une photo (SPEC §9.9)", () => {
  const photo: PhotoItem = { id: "ph", card: emptyNotecard("Photo"), asset: "a".repeat(64), ppi: 100 };
  const png = encodePng(createRaster(400, 300, { r: 200, g: 40, b: 40 }), 100);
  const ctx: PrintContext = { project: emptyProject(), projectName: "Essai", fonts: DEFAULT_FONTS, setup: defaultPageSetup("US"), unit: "in", minLine: 0.75 };
  const tile = { bytes: png, mime: "image/png", width: 4, height: 3 };

  it("une photo de 4 × 3 po tient sur une page ; à 12 × 9 po en Lettre, elle se répartit en mosaïque", async () => {
    const small = photoPages(ctx, "Photo", photo, { width: 4, height: 3 }, 4, 3);
    expect(small).toHaveLength(1);
    const pdf = await writePdf({ title: "t", pages: small }, { fonts: DEFAULT_FONTS, fabrics: () => tile, date: new Date(0) });
    const [page] = await readPdf(pdf);
    expect(page?.paths.some((p) => Math.abs(p.box.width - 288) < 0.01 && Math.abs(p.box.height - 216) < 0.01)).toBe(true);
    expect(photoPages(ctx, "Photo", photo, { width: 4, height: 3 }, 12, 9).length).toBeGreaterThan(1);
    expect(photoPages(ctx, "Photo", photo, { width: 4, height: 3 }, 4, 3, 2)[0]?.items.length).toBeGreaterThan(1);
    // Marge de 1/16 po de chaque côté pour une photo sur tissu.
    const bleed = photoPages(ctx, "Photo", photo, { width: 4, height: 3 }, 4, 3, 1, { bleed: 1 / 16 });
    const pdf2 = await writePdf({ title: "t", pages: bleed }, { fonts: DEFAULT_FONTS, fabrics: () => tile, date: new Date(0) });
    const [page2] = await readPdf(pdf2);
    expect(page2?.paths.some((p) => Math.abs(p.box.width - 4.125 * 72) < 0.01)).toBe(true);
  });

  it("la page de mise en page place chaque photo dans un groupe pivoté", () => {
    let l = addPhoto(newPageLayout(7.5, 10), "ph", 4, 3).layout;
    l = rotatePhotos(l, set(l.items[0]!.id), 1);
    const page = layoutPage(ctx, l, (id) => (id === "ph" ? { photo, size: { width: 4, height: 3 } } : null));
    expect(page.items).toHaveLength(1);
    const outer = page.items[0]!;
    expect(outer.kind).toBe("group");
    expect(layoutPage(ctx, l, () => null).items[0]).toMatchObject({ kind: "group", items: [] });
  });
});
