import { describe, expect, it } from "vitest";
import { cleanDrawing, newDraft } from "../../src/core/draw/draft";
import type { Pt, Segment } from "../../src/core/draw/geometry";
import { analyzeBlock, interiorPoint, pieceAt, piecePath, type Piece } from "../../src/core/draw/pieces";
import { buildBlock } from "../../src/core/library/builder";
import { LIBRARY_BLOCKS, builtLibraryBlock } from "../../src/core/library/blocks";
import { easyDrawSegments } from "../../src/core/draw/draft";

let n = 0;
const L = (ax: number, ay: number, bx: number, by: number): Segment => ({ id: `s${++n}`, kind: "line", a: { x: ax, y: ay }, b: { x: bx, y: by } });
const A = (ax: number, ay: number, bx: number, by: number, sagitta: number): Segment => ({ id: `s${++n}`, kind: "arc", a: { x: ax, y: ay }, b: { x: bx, y: by }, sagitta });

const totalArea = (pieces: readonly Piece[]) => pieces.reduce((s, p) => s + p.area, 0);

/** Une graine pseudo-aléatoire reproductible (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function libraryPieces(id: string): { pieces: Piece[]; width: number; height: number } {
  const def = LIBRARY_BLOCKS.find((d) => d.id === id);
  if (!def) throw new Error(id);
  const b = builtLibraryBlock(def);
  const segments = easyDrawSegments(b.drawing) ?? [];
  return { pieces: analyzeBlock(b.width, b.height, segments).pieces, width: b.width, height: b.height };
}

describe("corpus de blocs : nombre de pièces", () => {
  const corpus: [string, number][] = [
    ["four-patch", 4],
    ["nine-patch", 9],
    ["half-square-triangle", 2],
    ["ohio-star", 21],
    ["log-cabin", 13],
    ["drunkards-path", 2],
    ["churn-dash", 17],
    ["flying-geese", 3],
  ];
  for (const [id, count] of corpus) {
    it(`${id} = ${count} pièces`, () => {
      expect(libraryPieces(id).pieces).toHaveLength(count);
    });
  }

  it("une diagonale dessinée à la main = 2 triangles de 18 po²", () => {
    const { pieces } = analyzeBlock(6, 6, [L(0, 0, 6, 6)]);
    expect(pieces.map((p) => p.area)).toEqual([18, 18]);
    expect(pieces[0]?.neighbors).toEqual([pieces[1]?.key]);
  });

  it("un bloc sans segment est une seule pièce", () => {
    const { pieces } = analyzeBlock(6, 4, []);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.area).toBe(24);
  });
});

describe("invariant d'aire", () => {
  for (const def of LIBRARY_BLOCKS) {
    it(`${def.name} : la somme des aires des pièces égale l'aire du bloc`, () => {
      const { pieces, width, height } = libraryPieces(def.id);
      expect(Math.abs(totalArea(pieces) - width * height)).toBeLessThan(1e-6);
      for (const p of pieces) expect(p.area).toBeGreaterThan(0);
    });
  }

  it("Drunkard's Path : le quart de cercle a l'aire exacte πr²/4", () => {
    const { pieces } = libraryPieces("drunkards-path");
    const quarter = pieces.reduce((a, b) => (a.area < b.area ? a : b));
    // Le dessin enregistré est arrondi au milliardième de pouce : l'aire est exacte à 10⁻⁸ près.
    expect(quarter.area).toBeCloseTo((Math.PI * 16) / 4, 8);
    // Centre de gravité d'un quart de disque : 4r / 3π de chaque côté.
    expect(quarter.centroid.x).toBeCloseTo((4 * 4) / (3 * Math.PI), 8);
    expect(quarter.centroid.y).toBeCloseTo((4 * 4) / (3 * Math.PI), 8);
  });

  it("deux arcs qui se croisent découpent quatre pièces sans perte d'aire", () => {
    const { pieces } = analyzeBlock(6, 6, [A(0, 3, 6, 3, 2), A(3, 0, 3, 6, -2)]);
    expect(pieces).toHaveLength(4);
    expect(totalArea(pieces)).toBeCloseTo(36, 9);
  });
});

describe("nettoyage (Q-6.1)", () => {
  it("une ligne flottante est supprimée et signalée", () => {
    const floating = L(1, 1, 2, 2);
    const r = analyzeBlock(6, 6, [L(3, 0, 3, 6), floating]);
    expect(r.pieces).toHaveLength(2);
    expect(r.removed.map((s) => s.id)).toEqual([floating.id]);
    expect(r.segments).toHaveLength(1);
  });

  it("un îlot non relié au contour est supprimé (exemple du Log Cabin, p. 120)", () => {
    // Le carré central et ses bûches ne touchent pas le contour : il ne reste que la « bordure ».
    const island = [L(2, 2, 4, 2), L(4, 2, 4, 4), L(4, 4, 2, 4), L(2, 4, 2, 2), L(3, 2, 3, 4)];
    const border = [L(1, 0, 1, 6), L(5, 0, 5, 6)];
    const r = analyzeBlock(6, 6, [...border, ...island]);
    expect(r.removed).toHaveLength(island.length);
    expect(r.pieces).toHaveLength(3);
    expect(totalArea(r.pieces)).toBeCloseTo(36, 9);
  });

  it("un îlot relié par un seul sommet est gardé", () => {
    // Un triangle dont la pointe touche le bord haut du bloc.
    const r = analyzeBlock(6, 6, [L(3, 0, 2, 2), L(2, 2, 4, 2), L(4, 2, 3, 0)]);
    expect(r.removed).toHaveLength(0);
    expect(r.pieces).toHaveLength(2);
    expect(r.pieces.map((p) => p.area).sort((a, b) => a - b)).toEqual([2, 34]);
    // Même chose pour un îlot accroché à un autre segment par un sommet.
    const r2 = analyzeBlock(6, 6, [L(0, 3, 6, 3), L(3, 3, 2, 5), L(2, 5, 4, 5), L(4, 5, 3, 3)]);
    expect(r2.removed).toHaveLength(0);
    expect(r2.pieces).toHaveLength(3);
  });

  it("le bout qui dépasse d'une intersection est retiré ; le segment est signalé comme raccourci", () => {
    const over = L(0, 3, 4, 3);
    const r = analyzeBlock(6, 6, [L(3, 0, 3, 6), over]);
    expect(r.pieces).toHaveLength(3);
    expect(r.trimmed.map((s) => s.id)).toEqual([over.id]);
    expect(r.removed).toHaveLength(0);
  });

  it("les pendants sont retirés de proche en proche", () => {
    const r = analyzeBlock(6, 6, [L(1, 1, 2, 1), L(2, 1, 2, 2), L(2, 2, 3, 3), L(0, 4, 6, 4)]);
    expect(r.removed).toHaveLength(3);
    expect(r.pieces).toHaveLength(2);
  });

  it("une ligne tracée sur le contour ne crée ni pièce ni avertissement", () => {
    const r = analyzeBlock(6, 6, [L(0, 0, 6, 0), L(0, 3, 6, 3)]);
    expect(r.pieces).toHaveLength(2);
    expect(r.removed).toHaveLength(0);
    expect(r.segments).toHaveLength(1);
  });

  it("les jonctions en T et les croisements coupent les segments (un nœud à chaque intersection)", () => {
    const r = analyzeBlock(6, 6, [L(3, 0, 3, 6), L(0, 3, 6, 3), L(3, 3, 6, 0)]);
    expect(r.pieces).toHaveLength(5);
    expect(r.segments).toHaveLength(5);
    expect(r.changed).toBe(true);
  });

  it("le nettoyage est idempotent et les clés ne dépendent ni de l'ordre, ni du sens, ni des identifiants", () => {
    const random = rng(7);
    for (let k = 0; k < 20; k++) {
      const segs: Segment[] = [L(0, 0, 6, 6), L(6, 0, 0, 6), A(0, 3, 6, 3, 1.5 + random()), L(2, 0, 2, 6), L(0, 1, 6, 5)];
      const first = analyzeBlock(6, 6, segs);
      const { draft } = cleanDrawing({ ...newDraft(), segments: segs });
      const again = cleanDrawing(draft);
      expect(again.draft).toBe(draft);
      expect(again.analysis.changed).toBe(false);
      const shuffled = [...segs]
        .reverse()
        .map((s): Segment => (s.kind === "line" ? { ...s, id: `x${s.id}`, a: s.b, b: s.a } : { ...s, id: `x${s.id}`, a: s.b, b: s.a, sagitta: -s.sagitta }));
      const keys = (ps: Piece[]) => ps.map((p) => p.key).sort();
      expect(keys(analyzeBlock(6, 6, shuffled).pieces)).toEqual(keys(first.pieces));
      expect(keys(again.analysis.pieces)).toEqual(keys(first.pieces));
    }
  });
});

describe("propriété : formule d'Euler sur 200 grilles aléatoires avec diagonales", () => {
  it("F = E − V + 1 + C, et chaque diagonale coupe sa case en deux", () => {
    const random = rng(2026);
    for (let k = 0; k < 200; k++) {
      const cols = 2 + Math.floor(random() * 7);
      const rows = 2 + Math.floor(random() * 7);
      const size = 6;
      const segs: Segment[] = [];
      for (let i = 1; i < cols; i++) segs.push(L((size * i) / cols, 0, (size * i) / cols, size));
      for (let j = 1; j < rows; j++) segs.push(L(0, (size * j) / rows, size, (size * j) / rows));
      let diagonals = 0;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const r = random();
          if (r > 0.5) continue;
          const x0 = (size * i) / cols;
          const x1 = (size * (i + 1)) / cols;
          const y0 = (size * j) / rows;
          const y1 = (size * (j + 1)) / rows;
          segs.push(r < 0.25 ? L(x0, y0, x1, y1) : L(x1, y0, x0, y1));
          diagonals++;
        }
      }
      const r = analyzeBlock(size, size, segs);
      const { vertices: V, edges: E, components: C, faces: F } = r.stats;
      expect(F).toBe(E - V + 1 + C);
      expect(r.pieces).toHaveLength(cols * rows + diagonals);
      expect(Math.abs(totalArea(r.pieces) - size * size)).toBeLessThan(1e-6);
      expect(r.removed).toHaveLength(0);
    }
  });
});

describe("utilisation des pièces", () => {
  it("pieceAt trouve la pièce sous un point, interiorPoint est dans la pièce", () => {
    const { pieces } = libraryPieces("drunkards-path");
    const quarter = pieceAt(pieces, { x: 1, y: 1 });
    const rest = pieceAt(pieces, { x: 5, y: 5 });
    expect(quarter?.area).toBeCloseTo(4 * Math.PI, 6);
    expect(rest?.area).toBeCloseTo(36 - 4 * Math.PI, 6);
    expect(pieceAt(pieces, { x: 7, y: 1 })).toBeNull();
    for (const p of libraryPieces("ohio-star").pieces) expect(pieceAt(libraryPieces("ohio-star").pieces, interiorPoint(p))?.key).toBe(p.key);
  });

  it("piecePath écrit un contour fermé avec ses arcs", () => {
    const { pieces } = libraryPieces("drunkards-path");
    const d = piecePath(pieces[0] as Piece);
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("A4 4");
    expect(d.endsWith("Z")).toBe(true);
  });

  it("une pièce concave a un point intérieur hors de son centre de gravité", () => {
    // Un « L » : le centre de gravité d'une pièce en L peut tomber dehors.
    const { pieces } = analyzeBlock(6, 6, [L(2, 0, 2, 4), L(2, 4, 6, 4)]);
    for (const p of pieces) {
      const inside: Pt = interiorPoint(p);
      expect(pieceAt(pieces, inside)?.key).toBe(p.key);
    }
  });
});

describe("bibliothèque de blocs", () => {
  it("chaque bloc a deux colorations (gris puis couleur) qui couvrent toutes ses pièces", () => {
    expect(LIBRARY_BLOCKS.length).toBeGreaterThanOrEqual(20);
    const ids = new Set<string>();
    for (const def of LIBRARY_BLOCKS) {
      expect(ids.has(def.id)).toBe(false);
      ids.add(def.id);
      const built = buildBlock(def);
      const { pieces } = analyzeBlock(built.width, built.height, easyDrawSegments(built.drawing) ?? []);
      expect(built.pieceCount).toBe(pieces.length);
      expect(built.colorings).toHaveLength(2);
      const [grey, color] = built.colorings;
      for (const p of pieces) {
        const g = grey?.fills[p.key];
        expect(g?.kind).toBe("solid");
        if (g?.kind === "solid") expect(g.rgb.slice(1, 3)).toBe(g.rgb.slice(3, 5));
        expect(color?.fills[p.key]).toBeDefined();
      }
      // Au moins deux couleurs différentes : le dessin se lit.
      expect(new Set(Object.values(color?.fills ?? {}).map((f) => (f.kind === "solid" ? f.rgb : f.fabricId))).size).toBeGreaterThan(1);
    }
  });
});
