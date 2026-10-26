import { describe, expect, it } from "vitest";
import { buildLayout, clampLayout, defaultLayout, type LayoutParams } from "../../src/core/quilt/layout";
import { polygonArea } from "../../src/core/quilt/geom";
import { ONE_PATCH_SHAPES, onePatchPieces, onePatchSize, DEFAULT_ONE_PATCH } from "../../src/core/quilt/onepatch";
import { STRIP_STYLES, checkerboardCount, stripFormulaLength, stripPieces, type Strip } from "../../src/core/quilt/strips";

const totalArea = (polys: { poly: { x: number; y: number }[] }[]) => polys.reduce((s, p) => s + polygonArea(p.poly), 0);

describe("tailles des dispositions (SPEC §2)", () => {
  it("Horizontal 4 × 5 blocs de 8 po, lattis de 1 po et bordure de lattis : un centre de 37 × 46 po", () => {
    const r = buildLayout({ kind: "horizontal", nh: 4, nv: 5, bw: 8, bh: 8, sw: 1, sh: 1, sashBorder: true });
    expect(r.width).toBeCloseTo(37, 9);
    expect(r.height).toBeCloseTo(46, 9);
    // 20 blocs, des lattis et des cornerstones ; l'ensemble pave exactement le centre.
    expect(r.slots.filter((s) => s.role === "block")).toHaveLength(20);
    expect(r.slots.filter((s) => s.role === "cornerstone")).toHaveLength(5 * 6);
    expect(totalArea(r.slots)).toBeCloseTo(37 * 46, 6);
  });

  it("Horizontal sans bordure de lattis : n·b + (n − 1)·lattis", () => {
    const r = buildLayout({ kind: "horizontal", nh: 4, nv: 5, bw: 8, bh: 8, sw: 1, sh: 1, sashBorder: false });
    expect(r.width).toBe(35);
    expect(r.height).toBe(44);
    expect(totalArea(r.slots)).toBeCloseTo(35 * 44, 6);
  });

  it("Horizontal sans lattis : seulement des blocs", () => {
    const r = buildLayout(defaultLayout("horizontal"));
    expect(r.slots.every((s) => s.role === "block")).toBe(true);
    expect(r.slots).toHaveLength(20);
    expect(r.width).toBe(32);
    expect(r.height).toBe(40);
  });

  it("Sur la pointe 3 × 3 blocs de 10 avec un lattis de 1,5 : 48,790 po (capture p. 40)", () => {
    const r = buildLayout({ kind: "onpoint", style: 1, nh: 3, nv: 3, b: 10, s: 1.5 });
    expect(r.width).toBeCloseTo(48.79, 3);
    expect(r.height).toBeCloseTo(48.79, 3);
    expect(r.width).toBeCloseTo(3 * 11.5 * Math.SQRT2, 9);
    // Les emplacements-blocs sont carrés (côté 10) et les pièces couvrent tout le centre.
    const blocks = r.slots.filter((s) => s.role === "block");
    expect(blocks).toHaveLength(13); // 3 × 3 + 2 × 2
    expect(polygonArea(blocks[0]!.poly)).toBeCloseTo(100, 6);
    expect(totalArea(r.slots)).toBeCloseTo(r.width * r.height, 5);
  });

  it("Pointe variable 3 × 3 de 9 × 14 avec un lattis de 2 : 33,000 × 51,333 po (capture p. 41)", () => {
    const r = buildLayout({ kind: "varpoint", style: 1, nh: 3, nv: 3, w: 9, h: 14, s: 2 });
    expect(r.width).toBeCloseTo(33, 9);
    expect(r.height).toBeCloseTo(51.333333, 5);
    expect(totalArea(r.slots)).toBeCloseTo(r.width * r.height, 5);
  });

  it("Sur la pointe sans lattis : les losanges et les triangles de bord pavent le centre", () => {
    const r = buildLayout({ kind: "onpoint", style: 1, nh: 4, nv: 3, b: 8, s: 0 });
    expect(r.slots.every((s) => s.role === "block" || s.role === "triangle")).toBe(true);
    expect(totalArea(r.slots)).toBeCloseTo(r.width * r.height, 5);
  });

  it("Custom Set : un rectangle vide", () => {
    const r = buildLayout({ kind: "custom", w: 48, h: 60 });
    expect(r.width).toBe(48);
    expect(r.height).toBe(60);
    expect(r.slots).toHaveLength(0);
  });

  it("les bornes de Q-2.2 et le maximum de blocs", () => {
    const c = clampLayout({ kind: "horizontal", nh: 500, nv: 0, bw: 9999, bh: 0, sw: -3, sh: 90, sashBorder: false }, 24);
    if (c.kind !== "horizontal") throw new Error();
    expect(c.nh).toBe(24);
    expect(c.nv).toBe(1);
    expect(c.bw).toBe(120);
    expect(c.bh).toBe(0.5);
    expect(c.sw).toBe(0);
    expect(c.sh).toBe(24);
    const wide = clampLayout({ kind: "horizontal", nh: 500, nv: 1, bw: 1, bh: 1, sw: 0, sh: 0, sashBorder: false }, 100);
    if (wide.kind !== "horizontal") throw new Error();
    expect(wide.nh).toBe(100);
  });
});

describe("quilts en bandes (SPEC §2.8)", () => {
  const strip = (style: Strip["style"], n = 4, width = 6, across = 3): Strip => ({ style, width, count: n, across });

  it("Damier : longueur 60, largeur 10, 3 en travers = 18 le long", () => {
    expect(checkerboardCount(60, 10, 3)).toBe(18);
    expect(stripFormulaLength({ style: "checkerboard", width: 10, count: 18, across: 3 })).toBeCloseTo(60, 9);
  });

  it("les autres formules de la p. 47", () => {
    expect(stripFormulaLength(strip("blocks", 4, 15))).toBe(60);
    expect(stripFormulaLength(strip("diamonds", 5, 12))).toBe(60);
    expect(stripFormulaLength(strip("doubleDiamonds", 4, 10))).toBe(20);
    expect(stripFormulaLength(strip("pointsA", 6, 5))).toBe(60);
  });

  it("chaque style pave exactement sa bande (longueur 24, N = 4)", () => {
    for (const style of STRIP_STYLES) {
      const pieces = stripPieces(strip(style), 24);
      expect(totalArea(pieces), style).toBeCloseTo(24 * 6, 6);
    }
  });

  it("nombre de pièces de chaque style pour N = 4", () => {
    const counts: Record<string, number> = {
      plain: 1,
      blocks: 4,
      halfDropBlocks: 5,
      spacedSquares: 9, // 4 carrés + 5 espaceurs
      pointsA: 9, // 4 pointes + 5 fonds (dont deux demis)
      pointsB: 9,
      diamonds: 4 + 5 + 5,
      halfDropDiamonds: 5 + 4 + 4,
      doubleDiamonds: 4 + 4 + 5 + 5 + 5,
      halfDropDoubleDiamonds: 5 + 4 + 4 + (5 * 8 - 8), // les triangles de fond qui dépassent des deux bouts disparaissent
      checkerboard: 4 * 3,
    };
    for (const style of STRIP_STYLES) expect(stripPieces(strip(style), 24), style).toHaveLength(counts[style] as number);
  });

  it("la disposition en bandes empile les largeurs ; les bandes verticales sont transposées", () => {
    const strips: Strip[] = [strip("blocks", 4, 6), strip("plain", 1, 2)];
    const h = buildLayout({ kind: "stripsH", length: 24, strips, selected: 0 });
    expect(h.width).toBe(24);
    expect(h.height).toBe(8);
    expect(h.slots.filter((s) => s.role === "block")).toHaveLength(4);
    const v = buildLayout({ kind: "stripsV", length: 24, strips, selected: 0 });
    expect(v.width).toBe(8);
    expect(v.height).toBe(24);
    expect(totalArea(v.slots)).toBeCloseTo(8 * 24, 6);
  });
});

describe("One Patch (SPEC §2.9)", () => {
  it("chaque forme pave le centre : somme des aires = aire du centre", () => {
    for (const shape of ONE_PATCH_SHAPES) {
      const p = { ...DEFAULT_ONE_PATCH, shape, nh: 6, nv: 7, w: 3, h: 4, shearX: shape === "custom" ? 1 : 0, shearY: shape === "custom" ? 0.5 : 0 };
      const size = onePatchSize(p);
      expect(totalArea(onePatchPieces(p)), shape).toBeCloseTo(size.width * size.height, 5);
    }
  });

  it("une disposition One Patch n'a que des pièces à colorer", () => {
    const r = buildLayout({ kind: "onepatch", ...DEFAULT_ONE_PATCH });
    expect(r.slots.length).toBe(80);
    expect(r.slots.every((s) => s.role === "piece")).toBe(true);
  });

  it("toutes les dispositions se construisent avec leurs valeurs par défaut", () => {
    for (const kind of ["horizontal", "onpoint", "varpoint", "stripsH", "stripsV", "onepatch", "custom"] as const) {
      const p: LayoutParams = defaultLayout(kind);
      const r = buildLayout(p);
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
    }
  });
});
