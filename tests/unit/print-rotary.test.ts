import { describe, expect, it } from "vitest";
import type { Pt, Segment } from "../../src/core/draw/geometry";
import { LIBRARY_BLOCKS, instantiateLibraryBlock } from "../../src/core/library/blocks";
import { cutLength, inchFraction, roundCut } from "../../src/core/print/format";
import { seamOffset } from "../../src/core/print/offset";
import { rotaryChart } from "../../src/core/print/rotary";
import { classifyPieces, letterName, recognize } from "../../src/core/print/shapes";
import { blockSource, orient, type PrintBlock, type PrintPiece } from "../../src/core/print/source";
import { flattenBoundary } from "../../src/core/print/display";
import type { Paint } from "../../src/core/project/model";

const RED: Paint = { kind: "solid", rgb: "#cc2222" };

function polyPiece(key: string, pts: Pt[], paint?: Paint, grain = 0): PrintPiece {
  const boundary: Segment[] = orient(pts.map((a, i) => ({ id: `${key}${i}`, kind: "line", a, b: pts[(i + 1) % pts.length] as Pt })));
  const polygon = flattenBoundary(boundary);
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { key, boundary, polygon, area: 0, inner: { x: cx, y: cy }, grain, ...(paint ? { paint } : {}) };
}

const blockOf = (pieces: PrintPiece[]): PrintBlock => ({ name: "Test", width: 10, height: 10, pieces, lines: [], curved: false });

const square = (x: number, y: number, s: number): Pt[] => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe("Marge de couture (décalage)", () => {
  it("triangle rectangle isocèle de 2 po + 1/4 : boîte de coupe 2,85355… po, soit 2 7/8 au 1/8 (p. 225)", () => {
    const cut = seamOffset(
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 2 },
      ],
      0.25,
      10,
    );
    const xs = cut.map((p) => p.x);
    const w = Math.max(...xs) - Math.min(...xs);
    expect(w).toBeCloseTo(2 + 0.25 * (2 + Math.SQRT2), 6);
    expect(roundCut(w, "1/8", "in")).toBe(2.875);
    expect(inchFraction(roundCut(w, "1/8", "in"))).toBe("2 7/8");
  });
});

describe("Découpe rotative : exemples p. 225-226", () => {
  it("carré A 2 1/2, demi-carré B 2 7/8, quart de carré C 3 1/4", () => {
    const pieces = [
      polyPiece("a", square(0, 0, 2), RED),
      polyPiece("b", [
        { x: 2, y: 0 },
        { x: 4, y: 0 },
        { x: 2, y: 2 },
      ]),
      // Quart de carré : hypoténuse de 2 po sur le droit-fil (horizontale).
      polyPiece("c", [
        { x: 4, y: 2 },
        { x: 6, y: 2 },
        { x: 5, y: 1 },
      ]),
    ];
    const r = rotaryChart(blockOf(pieces), 0.25, "1/8", "in");
    expect(r.cuts.map((c) => [c.letter, c.shape, inchFraction(c.strip)])).toEqual([
      ["A", "square", "2 1/2"],
      ["B", "hst", "2 7/8"],
      ["C", "qst", "3 1/4"],
    ]);
    expect(r.cuts[1]?.exactStrip).toBeCloseTo(2.85355, 5);
    expect(r.cuts[2]?.exactStrip).toBeCloseTo(2 + 0.5 * (1 + Math.SQRT2), 6);
    expect(r.omitted).toEqual([]);
  });

  it("le cas 7 × 5 sur 10 po : 1 7/8 × 2 1/2 au 1/8, et 1,929 × 2,5 sans arrondi", () => {
    const w = 10 / 7;
    const pieces = [polyPiece("r", [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: 2 }, { x: 0, y: 2 }])];
    const eighth = rotaryChart(blockOf(pieces), 0.25, "1/8", "in").cuts[0];
    expect(eighth?.shape).toBe("rectangle");
    expect(`${inchFraction(eighth?.strip ?? 0)} × ${inchFraction(eighth?.cut ?? 0)}`).toBe("1 7/8 × 2 1/2");
    const none = rotaryChart(blockOf(pieces), 0.25, "none", "in").cuts[0];
    expect(none?.strip).toBe(1.929);
    expect(none?.cut).toBe(2.5);
    expect(`${cutLength(none?.strip ?? 0, "in", "none")} × ${cutLength(none?.cut ?? 0, "in", "none")}`).toBe("1,929 po × 2,5 po");
    expect(none?.exactStrip).toBeCloseTo(w + 0.5, 6);
  });

  it("au 1/16 et au millimètre", () => {
    const pieces = [polyPiece("h", [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }])];
    // 3 + 0,85355 = 3,85355 → 3 7/8 au 1/16 (3,875 ; 3,8125 est plus loin).
    expect(inchFraction(rotaryChart(blockOf(pieces), 0.25, "1/16", "in").cuts[0]?.strip ?? 0)).toBe("3 7/8");
    // Métrique : carré fini de 5 cm, marge 0,75 cm → 6,5 cm.
    const cm = (v: number) => v / 2.54;
    const metric = rotaryChart(blockOf([polyPiece("m", square(0, 0, cm(5)))]), cm(0.75), "1/8", "cm").cuts[0];
    expect(cutLength(metric?.strip ?? 0, "cm")).toBe("6,5 cm");
  });

  it("formes reconnues : losanges, parallélogramme, équilatéral, trapèze ; les courbes sont omises", () => {
    const s2 = Math.SQRT2;
    const d45 = polyPiece("d45", [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2 + s2, y: s2 }, { x: s2, y: s2 }]);
    const h60 = Math.sqrt(3);
    const d60 = polyPiece("d60", [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: h60 }, { x: 1, y: h60 }]);
    const par = polyPiece("par", [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 1 }, { x: 1, y: 1 }]);
    const tri = polyPiece("tri", [{ x: 0, y: h60 }, { x: 2, y: h60 }, { x: 1, y: 0 }]);
    const trap = polyPiece("trap", [{ x: 0, y: 1 }, { x: 4, y: 1 }, { x: 3, y: 0 }, { x: 1, y: 0 }]);
    expect([d45, d60, par, tri, trap].map((p) => recognize(p)?.shape)).toEqual(["diamond45", "diamond60", "parallelogram45", "equilateral", "trapezoid45"]);
    // Losange à 45° de 2 po : bande = hauteur + 2 marges (√2 + 0,5), recoupe tous les 2 + 2·0,25/sin 45°.
    const c = rotaryChart(blockOf([d45]), 0.25, "none", "in").cuts[0];
    expect(c?.exactStrip).toBeCloseTo(s2 + 0.5, 6);
    expect(c?.exactCut).toBeCloseTo(2 + 0.5 / Math.sin(Math.PI / 4) - 0.5 / Math.tan(Math.PI / 4) + 0.5 / Math.tan(Math.PI / 4), 6);
    const curved: PrintPiece = {
      ...polyPiece("q", square(0, 0, 2)),
      boundary: orient([
        { id: "1", kind: "line", a: { x: 0, y: 0 }, b: { x: 2, y: 0 } },
        { id: "2", kind: "arc", a: { x: 2, y: 0 }, b: { x: 0, y: 2 }, sagitta: -0.5 },
        { id: "3", kind: "line", a: { x: 0, y: 2 }, b: { x: 0, y: 0 } },
      ]),
    };
    expect(recognize(curved)).toBeNull();
  });
});

describe("Lettres et comptes par couleur", () => {
  it("Ohio Star : carrés A (4 crème, 1 rouge) et quarts de carré B (4 crème, 8 marine, 4 ciel)", () => {
    const def = LIBRARY_BLOCKS.find((d) => d.id === "ohio-star");
    if (!def) throw new Error("Ohio Star absent");
    const block = instantiateLibraryBlock(def);
    const src = blockSource(block, block.colorings[1] ?? null, { width: block.width, height: block.height }, false, "Ohio Star");
    const r = rotaryChart(src, 0.25, "1/8", "in");
    const [cream, navy, red, sky] = def.colors.map((c) => c.toLowerCase());
    const counts = (letter: string) => Object.fromEntries(r.cuts.find((c) => c.letter === letter)?.counts.map((c) => [c.paint?.kind === "solid" ? c.paint.rgb.toLowerCase() : "?", c.count]) ?? []);
    expect(r.cuts.map((c) => [c.letter, c.shape, inchFraction(c.strip)])).toEqual([
      ["A", "square", "2 1/2"],
      ["B", "qst", "3 1/4"],
    ]);
    expect(counts("A")).toEqual({ [cream as string]: 4, [red as string]: 1 });
    expect(counts("B")).toEqual({ [cream as string]: 4, [navy as string]: 8, [sky as string]: 4 });
    // Quarts de carré : un carré donne 4 triangles.
    expect(r.cuts[1]?.counts.find((c) => c.paint?.kind === "solid" && c.paint.rgb.toLowerCase() === navy)?.cuts).toBe(2);
  });

  it("Churn Dash : demi-carrés 2 7/8, rectangles 1 1/2 × 2 1/2, carré 2 1/2", () => {
    const def = LIBRARY_BLOCKS.find((d) => d.id === "churn-dash");
    if (!def) throw new Error("Churn Dash absent");
    const block = instantiateLibraryBlock(def);
    const src = blockSource(block, block.colorings[1] ?? null, { width: block.width, height: block.height }, false, "Churn Dash");
    const r = rotaryChart(src, 0.25, "1/8", "in");
    const summary = r.cuts.map((c) => `${c.shape}:${inchFraction(c.strip)}x${inchFraction(c.cut)}:${c.counts.reduce((s, x) => s + x.count, 0)}`).sort();
    expect(summary).toEqual(["hst:2 7/8x2 7/8:8", "rectangle:1 1/2x2 1/2:8", "square:2 1/2x2 1/2:1"]);
  });

  it("une forme et sa forme miroir ont des lettres distinctes ; rotation = même lettre", () => {
    const par = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 1 }, { x: 1, y: 1 }];
    const mirrored = par.map((p) => ({ x: 10 - p.x, y: p.y + 3 }));
    const rotated = par.map((p) => ({ x: 8 - p.x, y: 9 - p.y }));
    const classes = classifyPieces([polyPiece("p1", par), polyPiece("p2", mirrored), polyPiece("p3", rotated)]);
    expect(classes.map((c) => [c.letter, c.pieces.length, c.mirrorOf ?? ""])).toEqual([
      ["A", 2, ""],
      ["B", 1, "A"],
    ]);
  });

  it("noms de lettres", () => {
    expect([0, 25, 26, 27, 51, 52].map(letterName)).toEqual(["A", "Z", "AA", "AB", "AZ", "BA"]);
  });
});
