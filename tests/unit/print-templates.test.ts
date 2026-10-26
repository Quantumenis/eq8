import { describe, expect, it } from "vitest";
import { emptyNotecard, emptyProject, type BlockItem } from "../../src/core/project/model";
import { DEFAULT_FONTS, linePath, type PrintDoc } from "../../src/core/print/display";
import type { PrintContext } from "../../src/core/print/kit";
import { defaultPageSetup, tileContent, tileGrid, type PageSetup } from "../../src/core/print/paper";
import { writePdf } from "../../src/core/print/pdf";
import { blockSource } from "../../src/core/print/source";
import { templatePages } from "../../src/core/print/templates";
import { PRINT_TEXT } from "../../src/core/print/texts";
import { formatMeters, formatYards, shelfPack, splice, fatQuarterCount, yardageOf, roundYards } from "../../src/core/print/yardage";
import { readPdf } from "./pdf-reader";

const LETTER: PageSetup = { paper: "letter", orientation: "portrait", margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5 } };

function ctx(setup = LETTER): PrintContext {
  return { project: emptyProject(), projectName: "Essai", fonts: DEFAULT_FONTS, setup, unit: "in", minLine: 0.75 };
}

function plainBlock(w: number, h: number): BlockItem {
  return { id: "b", card: emptyNotecard("Carré"), width: w, height: h, drawing: { kind: "easydraw", segments: [] }, colorings: [] };
}

async function pdfOf(pages: PrintDoc["pages"]) {
  return readPdf(await writePdf({ title: "t", pages }, { fonts: DEFAULT_FONTS, date: new Date(0) }));
}

describe("Gabarits à l'échelle (MISSION)", () => {
  it("un carré fini de 6 po sans marge mesure 432 × 432 pt", async () => {
    const block = blockSource(plainBlock(6, 6), null, { width: 6, height: 6 }, false, "Carré");
    const doc = templatePages(block, ctx(), { seam: 0.25, printSeam: false, keyBlock: "small", lineWidth: 1 });
    expect(doc.pages).toHaveLength(1);
    const [page] = await pdfOf(doc.pages);
    const big = page?.paths.filter((p) => p.box.width > 400) ?? [];
    expect(big).toHaveLength(1);
    expect(big[0]?.box.width).toBeCloseTo(432, 6);
    expect(big[0]?.box.height).toBeCloseTo(432, 6);
    expect(big[0]?.dash).toEqual([]);
  });

  it("avec une marge de 0,25 po, la ligne de coupe mesure 468 × 468 pt et la couture (en tirets) 432", async () => {
    const block = blockSource(plainBlock(6, 6), null, { width: 6, height: 6 }, false, "Carré");
    const doc = templatePages(block, ctx(), { seam: 0.25, printSeam: true, keyBlock: "small", lineWidth: 1 });
    const [page] = await pdfOf(doc.pages);
    const cut = page?.paths.find((p) => Math.abs(p.box.width - 468) < 0.01);
    const sew = page?.paths.find((p) => Math.abs(p.box.width - 432) < 0.01);
    expect(cut?.box.height).toBeCloseTo(468, 4);
    expect(cut?.dash).toEqual([]);
    expect(sew?.box.height).toBeCloseTo(432, 6);
    expect(sew?.dash.length).toBe(2);
  });

  it("un carré de 10 cm mesure 283,46 pt", async () => {
    const s = 10 / 2.54;
    const block = blockSource(plainBlock(s, s), null, { width: s, height: s }, false, "Carré");
    const doc = templatePages(block, { ...ctx(), unit: "cm" }, { seam: 0.75 / 2.54, printSeam: false, keyBlock: "none", lineWidth: 1 });
    const [page] = await pdfOf(doc.pages);
    const sq = page?.paths.find((p) => p.box.width > 200);
    expect(sq?.box.width).toBeCloseTo(283.46, 2);
    expect(sq?.box.height).toBeCloseTo(283.46, 2);
  });

  it("taille personnalisée et miroir : le bloc est mis à la taille demandée", async () => {
    const block = blockSource(plainBlock(6, 6), null, { width: 4, height: 3 }, true, "Rect");
    expect(block.pieces[0]?.area).toBeCloseTo(12, 9);
    const doc = templatePages(block, ctx(), { seam: 0, printSeam: false, keyBlock: "none", lineWidth: 1 });
    const [page] = await pdfOf(doc.pages);
    const r = page?.paths.find((p) => p.box.width > 250);
    expect(r?.box.width).toBeCloseTo(288, 6);
    expect(r?.box.height).toBeCloseTo(216, 6);
  });
});

describe("Mosaïque sur plusieurs pages (Q-9.1)", () => {
  it("un gabarit de 20 × 20 po en Lettre portrait (marges 0,5) tient sur 3 × 3 pages, plus le plan d'assemblage", async () => {
    expect(tileGrid(20.24, 20.24, 7.5, 10)).toMatchObject({ cols: 3, rows: 3 });
    const block = blockSource(plainBlock(20, 20), null, { width: 20, height: 20 }, false, "Grand");
    const doc = templatePages(block, ctx(), { seam: 0.25, printSeam: true, keyBlock: "small", lineWidth: 1 });
    // Page 1 : le bloc clé ; puis 9 pages de mosaïque ; puis le plan.
    expect(doc.pages).toHaveLength(1 + 9 + 1);
    const pdf = await pdfOf(doc.pages);
    expect(pdf).toHaveLength(11);
    // La ligne de coupe traverse plusieurs pages : chaque page de mosaïque est découpée à la zone utile.
    for (const p of pdf.slice(1, 10)) expect(p.paths.length).toBeGreaterThan(0);
  });

  it("les pages vides ne sont pas émises", () => {
    const items = [{ kind: "path" as const, d: linePath({ x: 0, y: 0 }, { x: 20, y: 20 }), stroke: { rgb: "#000000", width: 1 } }];
    const pages = tileContent(items, 20, 20, LETTER, PRINT_TEXT.tiles);
    // 3 × 3 fenêtres ; la diagonale ne traverse que L1-C1, L1-C2, L2-C2, L2-C3 et L3-C3 ; + 1 plan.
    expect(pages).toHaveLength(5 + 1);
  });

  it("le format par défaut suit le pays (A4 en France, Lettre aux États-Unis)", () => {
    expect(defaultPageSetup("FR").paper).toBe("a4");
    expect(defaultPageSetup("US").paper).toBe("letter");
    expect(defaultPageSetup(null).paper).toBe("a4");
  });
});

describe("Métrage (Q-9.9, cas calculés à la main)", () => {
  const opts = { width: 42, seam: 0.25, fatQuarters: false, fatQuarter: { length: 18, width: 21 } };
  const squares = (n: number, s: number) => Array.from({ length: n }, () => ({ w: s, h: s }));

  it("20 carrés de 4 po finis (4,5 coupés) sur 42 po : 9 par rangée, 3 rangées, 13,5 po = 3/8 yd", () => {
    const pack = shelfPack(squares(20, 4.5), 42);
    expect(pack.shelves.map((s) => Math.round(s.used / 4.5))).toEqual([9, 9, 2]);
    expect(pack.length).toBeCloseTo(13.5, 9);
    const [line] = yardageOf([{ id: "a", paint: undefined, rects: squares(20, 4.5) }], opts);
    expect(line?.inches).toBeCloseTo(13.5, 9);
    expect((line?.inches ?? 0) / 36).toBeCloseTo(0.375, 9);
    expect(line?.yards).toBe(0.375);
    expect(formatYards(line?.yards ?? 0)).toBe("3/8 yd");
    expect(formatMeters(line?.meters ?? 0)).toBe("0,4 m");
  });

  it("bordure raboutée : 60 po finis × 2 po (60,5 × 2,5 coupés) sur 42 po = 2 tronçons de 30,5, 5 po de tissu", () => {
    expect(splice({ w: 60.5, h: 2.5 }, 42, 0.25)).toEqual([
      { w: 30.5, h: 2.5 },
      { w: 30.5, h: 2.5 },
    ]);
    const [line] = yardageOf([{ id: "b", paint: undefined, rects: [{ w: 60.5, h: 2.5 }] }], opts);
    expect(line?.inches).toBeCloseTo(5, 9);
    expect(line?.yards).toBe(0.25);
  });

  it("rotation de 90° quand elle réduit la rangée ; les grandes pièces d'abord", () => {
    // 3 rectangles 10 × 2 (couchés) et un carré de 6 : rangées 6 (carré + 3 rectangles = 36 ≤ 42).
    const pack = shelfPack([{ w: 2, h: 10 }, { w: 2, h: 10 }, { w: 10, h: 2 }, { w: 6, h: 6 }], 42);
    expect(pack.length).toBe(6);
  });

  it("coupons : 20 carrés de 4,5 dans des coupons de 18 × 21 = 2 coupons", () => {
    expect(fatQuarterCount(squares(20, 4.5), { length: 18, width: 21 }, 0.25)).toBe(2);
    const [line] = yardageOf([{ id: "a", paint: undefined, rects: squares(20, 4.5) }], { ...opts, fatQuarters: true });
    expect(line?.fatQuarters).toBe(2);
  });

  it("métrique : 10 carrés de 11,5 cm sur 110 cm = 2 rangées, 23 cm, soit 0,3 m (arrondi aux 10 cm supérieurs)", () => {
    const s = 11.5 / 2.54;
    const [line] = yardageOf([{ id: "m", paint: undefined, rects: squares(10, s) }], { ...opts, width: 110 / 2.54, seam: 0.75 / 2.54 });
    expect((line?.inches ?? 0) * 2.54).toBeCloseTo(23, 9);
    expect(line?.meters).toBe(0.3);
    expect(roundYards(line?.inches ?? 0)).toBe(0.375);
  });
});
