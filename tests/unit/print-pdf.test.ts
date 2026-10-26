import { describe, expect, it } from "vitest";
import { DEFAULT_FONTS, rectPath, type PrintDoc } from "../../src/core/print/display";
import { writePdf } from "../../src/core/print/pdf";
import { readPdf } from "./pdf-reader";

const FIXED = new Date("2026-10-26T12:00:00Z");

describe("PDF : échelle 1:1", () => {
  it("un carré de 6 po mesure 432 × 432 pt ; un carré de 10 cm mesure 283,46 pt", async () => {
    const cm10 = 10 / 2.54;
    const doc: PrintDoc = {
      title: "Échelle",
      pages: [
        {
          width: 8.5,
          height: 11,
          items: [
            { kind: "path", d: rectPath(1, 1, 6, 6), stroke: { rgb: "#000000", width: 1 } },
            { kind: "group", mat: [1, 0, 0, 1, 1, 7.5], items: [{ kind: "path", d: rectPath(0, 0, cm10, cm10), fill: { kind: "rgb", rgb: "#ff0000" } }] },
            { kind: "text", x: 1, y: 0.8, text: "Carré de 6 po — échelle", role: "header" },
          ],
        },
      ],
    };
    const pdf = await writePdf(doc, { fonts: DEFAULT_FONTS, date: FIXED });
    const [page] = await readPdf(pdf);
    expect(page?.width).toBeCloseTo(612, 6);
    expect(page?.height).toBeCloseTo(792, 6);
    const [square, metric] = page?.paths ?? [];
    expect(square?.box.width).toBeCloseTo(432, 6);
    expect(square?.box.height).toBeCloseTo(432, 6);
    // Origine en bas à gauche : le haut du carré est à 1 po du haut de la page.
    expect(square?.box.y1).toBeCloseTo(792 - 72, 6);
    expect(square?.lineWidth).toBeCloseTo(1, 6);
    expect(metric?.box.width).toBeCloseTo(283.46, 2);
    expect(metric?.box.height).toBeCloseTo(283.46, 2);
    expect(page?.texts).toBe(1);
  });

  it("un arc devient des Béziers qui restent sur le cercle", async () => {
    const doc: PrintDoc = {
      title: "Arc",
      pages: [{ width: 8.5, height: 11, items: [{ kind: "path", d: [{ op: "M", x: 4, y: 2 }, { op: "A", cx: 2, cy: 2, r: 2, start: 0, sweep: Math.PI, x: 0, y: 2 }], stroke: { rgb: "#000000", width: 1 } }] }],
    };
    const [page] = await readPdf(await writePdf(doc, { fonts: DEFAULT_FONTS, date: FIXED }));
    const box = page?.paths[0]?.box;
    // Demi-cercle (bas, y vers le bas) : 4 po de large ; les points de contrôle dépassent de 2·(4/3)·tan(π/8)·… au plus.
    expect(box?.width).toBeCloseTo(288, 6);
  });
});
