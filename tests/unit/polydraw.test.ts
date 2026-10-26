import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRIDS,
  addPolyNode,
  addPolyPiece,
  clonePolyPieces,
  deletePolyNode,
  emptyPoly,
  gridEdge,
  gridPivot,
  gridPoints,
  gridRotation,
  mirrorPolyPieces,
  movePolyNode,
  movePolyPieces,
  nearestGridPoint,
  polyContent,
  polyLoop,
  polyNodes,
  polyPieceAt,
  setGrid,
  type PolyGrid,
} from "../../src/core/draw/polydraw";
import type { Pt } from "../../src/core/draw/geometry";

const has = (pts: Pt[], x: number, y: number): boolean => pts.some((p) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6);

describe("grilles PolyDraw", () => {
  it("Rectangle : (a + 1) × (b + 1) points", () => {
    const pts = gridPoints({ kind: "rect", a: 4, b: 3 }, 8, 6);
    expect(pts).toHaveLength(5 * 4);
    expect(has(pts, 2, 4)).toBe(true);
    expect(nearestGridPoint({ kind: "rect", a: 4, b: 3 }, 8, 6, { x: 2.2, y: 3.9 }).point).toEqual({ x: 2, y: 4 });
  });

  it("Cercle à 3 anneaux et 8 rayons : les points attendus", () => {
    const g: PolyGrid = { kind: "circle", a: 3, b: 8 };
    const pts = gridPoints(g, 8, 8);
    // Centre, 2 anneaux × 8 rayons, et les quatre coins (les rayons diagonaux y arrivent).
    expect(pts).toHaveLength(1 + 2 * 8 + 4);
    expect(has(pts, 4, 4)).toBe(true);
    expect(has(pts, 4 + 2, 4)).toBe(true); // anneau 1 (rayon 2), rayon 0°
    expect(has(pts, 4 + 4, 4)).toBe(true); // anneau 2 (rayon 4) : au milieu du bord
    expect(has(pts, 4, 4 - 4)).toBe(true);
    const r = 2 * Math.SQRT1_2;
    expect(has(pts, 4 + r, 4 + r)).toBe(true); // diagonale, anneau 1
    expect(has(pts, 0, 0)).toBe(true);
    expect(has(pts, 8, 8)).toBe(true);
    // Les anneaux partiels des coins : avec 4 anneaux, un troisième anneau dépasse le bord.
    const more = gridPoints({ kind: "circle", a: 4, b: 8 }, 8, 8);
    expect(more.length).toBeGreaterThan(1 + 3 * 8 + 4);
  });

  it("Arc : quarts de cercle depuis le coin bas-gauche", () => {
    const g: PolyGrid = { kind: "arc", a: 3, b: 4 };
    const pts = gridPoints(g, 6, 6);
    expect(has(pts, 0, 6)).toBe(true);
    expect(has(pts, 3, 6)).toBe(true); // anneau 1 (rayon 3), rayon 0°
    expect(has(pts, 0, 3)).toBe(true); // rayon 90°
    expect(has(pts, 6, 6)).toBe(true);
    expect(has(pts, 0, 0)).toBe(true);
    const diag = 3 * Math.SQRT1_2;
    expect(has(pts, diag, 6 - diag)).toBe(true); // anneau 1, rayon 45°
  });

  it("Étoile 8 branches, Kaléidoscope et Octogone : points sur le contour et au centre", () => {
    const star = gridPoints(DEFAULT_GRIDS.star8, 8, 8);
    const c = 8 / (2 + Math.SQRT2);
    expect(has(star, c, 0)).toBe(true);
    expect(has(star, c, c)).toBe(true);
    expect(has(star, 4, 4)).toBe(true);
    expect(star.length).toBeGreaterThan(21);
    const kal = gridPoints({ kind: "kaleido", a: 2, b: 2 }, 8, 8);
    expect(has(kal, 4, 4)).toBe(true);
    expect(has(kal, 8, 4)).toBe(true);
    expect(has(kal, 6, 6)).toBe(true);
    expect(has(kal, 8, 6)).toBe(true);
    const oct = gridPoints({ kind: "octagon", a: 1, b: 1 }, 8, 8);
    const s = (8 / 2) * (Math.SQRT2 - 1);
    expect(has(oct, 4 + s, 0)).toBe(true);
    expect(has(oct, 8, 4 - s)).toBe(true);
    expect(has(oct, 0, 0)).toBe(true);
  });

  it("rotation propre à la grille : Étoile 8 branches = 45°", () => {
    expect(gridRotation(DEFAULT_GRIDS.star8)).toBe(45);
    expect(gridRotation({ kind: "circle", a: 3, b: 8 })).toBe(45);
    expect(gridRotation({ kind: "circle", a: 3, b: 6 })).toBe(60);
    expect(gridRotation({ kind: "rect", a: 4, b: 4 })).toBe(90);
    expect(gridRotation({ kind: "arc", a: 3, b: 6 })).toBe(15);
    expect(gridPivot({ kind: "arc", a: 3, b: 6 }, 6, 6)).toEqual({ x: 0, y: 6 });
    expect(gridPivot(DEFAULT_GRIDS.circle, 6, 6)).toEqual({ x: 3, y: 3 });
  });
});

describe("pièces PolyDraw", () => {
  const rect: PolyGrid = { kind: "rect", a: 6, b: 6 };

  it("PolyLigne sur 4 points puis fermeture : un carré d'aire attendue", () => {
    const edges = polyLoop(rect, 6, 6, [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }], false);
    const state = addPolyPiece({ ...emptyPoly("rect"), grid: rect }, edges);
    expect(state.pieces).toHaveLength(1);
    const content = polyContent(state.pieces, 6, 6);
    expect(content.pieces).toHaveLength(1);
    expect(content.pieces[0]?.area).toBeCloseTo(9, 9);
    expect(content.coverage).toBeCloseTo(9 / 36, 9);
    expect(content.overlap).toBe(false);
    // Un contour sans aire n'est pas une pièce.
    expect(addPolyPiece(emptyPoly(), polyLoop(rect, 6, 6, [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }], false)).pieces).toHaveLength(0);
  });

  it("PolyArc suit l'anneau entre deux points du même anneau, une droite sinon", () => {
    const g: PolyGrid = { kind: "circle", a: 3, b: 8 };
    const a = { x: 6, y: 4 };
    const b = { x: 4 + 2 * Math.SQRT1_2, y: 4 + 2 * Math.SQRT1_2 };
    const arc = gridEdge(g, 8, 8, a, b, true);
    expect(arc.kind).toBe("arc");
    if (arc.kind === "arc") {
      const n = Math.hypot(b.y - a.y, b.x - a.x);
      expect(Math.abs(arc.sagitta)).toBeCloseTo(2 - Math.sqrt(4 - (n / 2) ** 2), 6);
    }
    // Deux anneaux différents : une droite. Sans PolyArc : une droite.
    expect(gridEdge(g, 8, 8, { x: 6, y: 4 }, { x: 8, y: 4 }, true).kind).toBe("line");
    expect(gridEdge(g, 8, 8, a, b, false).kind).toBe("line");
    // Sur une grille rectangulaire, PolyArc trace des droites.
    expect(gridEdge(rect, 6, 6, { x: 1, y: 1 }, { x: 2, y: 2 }, true).kind).toBe("line");
  });

  it("un secteur d'anneau (arcs et rayons) a l'aire exacte", () => {
    const g: PolyGrid = { kind: "circle", a: 3, b: 8 };
    const O = { x: 4, y: 4 };
    const p = (r: number, k: number): Pt => ({ x: O.x + r * Math.cos((Math.PI * k) / 4), y: O.y + r * Math.sin((Math.PI * k) / 4) });
    const edges = [
      gridEdge(g, 8, 8, p(2, 0), p(4, 0), true),
      gridEdge(g, 8, 8, p(4, 0), p(4, 1), true),
      gridEdge(g, 8, 8, p(4, 1), p(2, 1), true),
      gridEdge(g, 8, 8, p(2, 1), p(2, 0), true),
    ];
    const state = addPolyPiece({ ...emptyPoly(), grid: g }, edges);
    const area = polyContent(state.pieces).pieces[0]?.area ?? 0;
    expect(area).toBeCloseTo(((Math.PI / 4) * (16 - 4)) / 2, 6);
  });

  it("cloner et pivoter selon la grille, miroirs, déplacement", () => {
    const g: PolyGrid = { kind: "circle", a: 3, b: 8 };
    const edges = polyLoop(g, 8, 8, [{ x: 4, y: 4 }, { x: 8, y: 4 }, { x: 4 + 4 * Math.SQRT1_2, y: 4 + 4 * Math.SQRT1_2 }], false);
    let state = addPolyPiece({ ...emptyPoly(), grid: g }, edges);
    const id = state.pieces[0]!.id;
    const cloned = clonePolyPieces(state, new Set([id]), 8, 8, true);
    expect(cloned.state.pieces).toHaveLength(2);
    const copy = cloned.state.pieces[1]!;
    // La copie est pivotée de 45° autour du centre : le nœud (8, 4) devient (4 + 4cos45, 4 + 4sin45).
    expect(polyNodes(copy).some((p) => Math.abs(p.x - (4 + 4 * Math.SQRT1_2)) < 1e-6 && Math.abs(p.y - (4 + 4 * Math.SQRT1_2)) < 1e-6)).toBe(true);
    // Cloner sans pivoter : la copie est identique.
    const same = clonePolyPieces(state, new Set([id]), 8, 8, false).state.pieces[1]!;
    expect(polyNodes(same)).toEqual(polyNodes(state.pieces[0]!));
    // Miroir gauche-droite d'une pièce, puis déplacement.
    state = mirrorPolyPieces(state, new Set([id]), "lr", 8, 8);
    expect(polyNodes(state.pieces[0]!)[1]).toEqual({ x: 0, y: 4 });
    const moved = movePolyPieces(state, new Set([id]), 1, 0);
    expect(polyNodes(moved.pieces[0]!)[1]).toEqual({ x: 1, y: 4 });
  });

  it("édition : déplacer, ajouter et supprimer un nœud", () => {
    let state = addPolyPiece({ ...emptyPoly(), grid: rect }, polyLoop(rect, 6, 6, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], false));
    const id = state.pieces[0]!.id;
    state = movePolyNode(state, id, 2, { x: 5, y: 5 }, 6, 6);
    expect(polyContent(state.pieces).pieces[0]?.area).toBeCloseTo(16 + 0.5 * 4 * 1 + 0.5 * 4 * 1 - 0, 0);
    expect(polyNodes(state.pieces[0]!)[2]).toEqual({ x: 5, y: 5 });
    state = addPolyNode(state, id, 0, { x: 2, y: 0 }, 6, 6);
    expect(state.pieces[0]!.edges).toHaveLength(5);
    state = deletePolyNode(state, id, 1, 6, 6);
    expect(state.pieces[0]!.edges).toHaveLength(4);
    // Impossible de descendre sous un triangle.
    const tri = addPolyPiece({ ...emptyPoly(), grid: rect }, polyLoop(rect, 6, 6, [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }], false));
    expect(deletePolyNode(tri, tri.pieces[0]!.id, 0, 6, 6)).toBe(tri);
    // La pièce est retrouvée par un clic.
    expect(polyPieceAt(state, { x: 1, y: 1 }, 0.05)).toBe(id);
    expect(polyPieceAt(state, { x: 5.9, y: 0.1 }, 0.05)).toBeNull();
  });

  it("changer de grille ou de compteurs garde les pièces", () => {
    const state = addPolyPiece({ ...emptyPoly(), grid: rect }, polyLoop(rect, 6, 6, [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }], false));
    const next = setGrid(state, { kind: "circle", a: 4, b: 8 });
    expect(next.pieces).toHaveLength(1);
    expect(next.grid.kind).toBe("circle");
    expect(setGrid(next, { kind: "circle", a: 4, b: 8 })).toBe(next);
    expect(setGrid(state, { kind: "circle", a: 0, b: 0 }).grid).toMatchObject({ a: 1, b: 2 });
  });
});
