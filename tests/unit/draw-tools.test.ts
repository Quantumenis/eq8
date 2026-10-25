import { describe, expect, it } from "vitest";
import { BlockEditor } from "../../src/core/draw/editor";
import {
  addSegments,
  convertToGuides,
  deleteSegments,
  isValidSnapCount,
  moveNode,
  moveSegments,
  newDraft,
  resizeBlock,
  setSagitta,
  snapSettingsOf,
  toDrawing,
  type BlockDraft,
} from "../../src/core/draw/draft";
import { boundsOf, segmentLength, type Pt, type Segment } from "../../src/core/draw/geometry";
import { addNodesAt, addNodesAtIntersections, crossingsOf, partitionParams, staggerParams } from "../../src/core/draw/nodes";
import { nearestGridPoint, snapPoint, toleranceInInches } from "../../src/core/draw/snap";
import { arcSegment, gridSegments, hitTest, lineSegment } from "../../src/core/draw/tools";
import { transformSelection } from "../../src/core/draw/transform";
import { ACTUAL_SIZE, fitView, stepZoom, toScreen, toWorld, zoomAt, zoomPercent } from "../../src/core/draw/view";

const P = (x: number, y: number): Pt => ({ x, y });
const withSegments = (segs: Segment[], draft: BlockDraft = newDraft()): BlockDraft => addSegments(draft, segs).draft;

describe("accrochage", () => {
  const settings = snapSettingsOf(newDraft()); // 6 po, 24 points : un point tous les 0,25
  it("le point de grille le plus proche", () => {
    expect(nearestGridPoint(P(1.1, 2.9), settings)).toEqual(P(1.0, 3.0));
    expect(nearestGridPoint(P(1.13, 2.87), settings)).toEqual(P(1.25, 2.75));
    expect(nearestGridPoint(P(-3, 99), settings)).toEqual(P(0, 6));
  });

  it("priorité nœud > grille", () => {
    const segs = [lineSegment(P(0, 0), P(1.1, 1.1))];
    // (1,1) est un point de grille ; (1,1) est aussi à 0,14 du nœud (1,1 ; 1,1). Le nœud est dans la tolérance : il gagne.
    expect(snapPoint(P(1.05, 1.05), settings, segs, 0.2)).toEqual({ point: P(1.1, 1.1), kind: "node" });
    // Hors tolérance : la grille.
    expect(snapPoint(P(1.05, 1.05), settings, segs, 0.01)).toEqual({ point: P(1, 1), kind: "grid" });
    // Nœuds coupés : la grille.
    expect(snapPoint(P(1.05, 1.05), { ...settings, toNodes: false }, segs, 0.2).kind).toBe("grid");
  });

  it("accrochage aux lignes quand la grille est coupée", () => {
    const segs = [lineSegment(P(0, 0), P(6, 6))];
    const s = { ...settings, toGrid: false, toNodes: false, toLines: true };
    const r = snapPoint(P(3, 3.2), s, segs, 0.5);
    expect(r.kind).toBe("line");
    expect(r.point.x).toBeCloseTo(3.1, 9);
    expect(r.point.y).toBeCloseTo(3.1, 9);
    expect(snapPoint(P(3, 3.2), s, segs, 0.05).kind).toBe("free");
  });

  it("la tolérance en pixels devient des pouces selon le zoom", () => {
    expect(toleranceInInches(8, ACTUAL_SIZE)).toBeCloseTo(8 / 96, 12);
    expect(toleranceInInches(8, ACTUAL_SIZE * 4)).toBeCloseTo(8 / 384, 12);
  });

  it("le nombre de points égale la taille ou en est un multiple", () => {
    expect(isValidSnapCount(6, 6)).toBe(true);
    expect(isValidSnapCount(6, 24)).toBe(true);
    expect(isValidSnapCount(6, 25)).toBe(false);
    expect(isValidSnapCount(15, 150)).toBe(true);
    expect(isValidSnapCount(6, 0)).toBe(false);
  });
});

describe("nœuds", () => {
  const diagonal = (): { draft: BlockDraft; id: string } => {
    const seg = lineSegment(P(0, 0), P(5, 0));
    return { draft: withSegments([seg]), id: seg.id };
  };

  it("partitionner en 5 : nœuds en i/5", () => {
    expect(partitionParams(5)).toEqual([0.2, 0.4, 0.6, 0.8].map((v, i) => (i + 1) / 5));
    const { draft, id } = diagonal();
    const next = addNodesAt(draft, id, partitionParams(5));
    expect(next.segments).toHaveLength(5);
    expect(next.segments.map((s) => s.b.x)).toEqual([1, 2, 3, 4, 5]);
    expect(next.segments.map((s) => s.a.x)).toEqual([0, 1, 2, 3, 4]);
  });

  it("décaler en 5 : nœuds en (i − ½)/5, deux demi-parts aux extrémités", () => {
    expect(staggerParams(5)).toEqual([0.1, 0.3, 0.5, 0.7, 0.9]);
    const { draft, id } = diagonal();
    const next = addNodesAt(draft, id, staggerParams(5));
    expect(next.segments.map((s) => segmentLength(s))).toEqual([0.5, 1, 1, 1, 1, 0.5]);
  });

  it("moitié et tiers", () => {
    const { draft, id } = diagonal();
    expect(addNodesAt(draft, id, partitionParams(2)).segments.map((s) => s.b.x)).toEqual([2.5, 5]);
    expect(addNodesAt(draft, id, partitionParams(3)).segments).toHaveLength(3);
  });

  it("couper un arc garde le cercle et la longueur totale", () => {
    const arc = arcSegment(P(0, 0), P(4, 0), false);
    const draft = withSegments([arc]);
    const next = addNodesAt(draft, arc.id, partitionParams(4));
    expect(next.segments).toHaveLength(4);
    const total = next.segments.reduce((sum, s) => sum + segmentLength(s), 0);
    expect(total).toBeCloseTo(segmentLength(arc), 7);
  });

  it("aux intersections : un cas connu (droite, droite et arc)", () => {
    const h = lineSegment(P(0, 3), P(6, 3));
    const v = lineSegment(P(2, 0), P(2, 6));
    const d = lineSegment(P(0, 0), P(6, 6));
    const arc = arcSegment(P(0, 6), P(6, 6), true); // demi-cercle de centre (3, 6), rayon 3, vers les y décroissants
    let draft = withSegments([h, v, d, arc]);
    const found = crossingsOf(draft, h.id);
    // h croise v (2, 3), d (3, 3) et l'arc (sommet en (3, 3)) : le sommet de l'arc est sur h.
    expect(found.map((c) => c.other).sort()).toEqual([arc.id, d.id, v.id].sort());
    expect(found.find((c) => c.other === v.id)?.point).toEqual(P(2, 3));
    draft = addNodesAtIntersections(draft, h.id);
    // h est coupée en x = 2 et x = 3 → trois morceaux (2, 1, 3) ; v coupée en (2, 3) → deux morceaux ; d coupée en (3, 3) → deux morceaux.
    const lengthsOnH = draft.segments.filter((s) => s.a.y === 3 && s.b.y === 3).map((s) => s.b.x - s.a.x);
    expect(lengthsOnH.sort()).toEqual([1, 2, 3]);
    expect(draft.segments.filter((s) => s.a.x === 2 && s.b.x === 2)).toHaveLength(2);
  });

  it("déplacer un nœud entraîne toutes les extrémités qui coïncident", () => {
    const a = lineSegment(P(0, 0), P(3, 3));
    const b = lineSegment(P(3, 3), P(6, 0));
    const draft = withSegments([a, b]);
    const moved = moveNode(draft, P(3, 3), P(3, 4));
    expect(moved.segments.map((s) => [s.a, s.b])).toEqual([
      [P(0, 0), P(3, 4)],
      [P(3, 4), P(6, 0)],
    ]);
    expect(moveNode(draft, P(3, 3), P(3, 9))).toBe(draft); // hors du bloc : refusé
  });

  it("régler la flèche d'un arc, refusé hors du bloc", () => {
    const arc = arcSegment(P(1, 3), P(5, 3), false);
    const draft = withSegments([arc]);
    const flat = setSagitta(draft, arc.id, 1);
    expect(flat.segments[0]?.kind === "arc" && flat.segments[0].sagitta).toBe(1);
    expect(setSagitta(draft, arc.id, 5)).toBe(draft);
    expect(setSagitta(draft, arc.id, 0)).toBe(draft);
  });
});

describe("outils", () => {
  it("la grille 3 × 3 sur un bloc de 6 po : exactement 4 segments intérieurs", () => {
    const segs = gridSegments(newDraft(), P(0, 0), P(6, 6), 3, 3);
    expect(segs).toHaveLength(4);
    const xs = segs.filter((s) => s.a.x === s.b.x).map((s) => s.a.x).sort();
    const ys = segs.filter((s) => s.a.y === s.b.y).map((s) => s.a.y).sort();
    expect(xs).toEqual([2, 4]);
    expect(ys).toEqual([2, 4]);
    for (const s of segs) expect(segmentLength(s)).toBe(6);
  });

  it("une grille dans une grille : les côtés superposés ne sont pas dessinés deux fois", () => {
    let draft = withSegments(gridSegments(newDraft(), P(0, 0), P(6, 6), 3, 3));
    expect(draft.segments).toHaveLength(4);
    // 2 × 2 dans la cellule centrale (2,2)-(4,4) : ses quatre côtés existent déjà, restent 2 lignes intérieures.
    draft = withSegments(gridSegments(draft, P(2, 2), P(4, 4), 2, 2), draft);
    expect(draft.segments).toHaveLength(6);
    // Une cellule hors des lignes existantes ajoute ses côtés manquants.
    const lone = withSegments(gridSegments(newDraft(), P(1, 1), P(3, 3), 1, 1));
    expect(lone.segments).toHaveLength(4);
  });

  it("une ligne superposée à une ligne existante est réduite à la partie nouvelle", () => {
    let draft = withSegments([lineSegment(P(0, 3), P(4, 3))]);
    draft = withSegments([lineSegment(P(2, 3), P(6, 3))], draft);
    expect(draft.segments).toHaveLength(2);
    expect(draft.segments[1]).toMatchObject({ a: P(4, 3), b: P(6, 3) });
    expect(withSegments([lineSegment(P(1, 3), P(2, 3))], draft)).toBe(draft); // entièrement superposée : rien
    expect(withSegments([lineSegment(P(1, 1), P(1, 1))])).toEqual(newDraft()); // réduite à un point : rien
    expect(withSegments([lineSegment(P(0, 0), P(7, 0))])).toEqual(newDraft()); // hors du bloc : rien
  });

  it("la sélection se trouve au clic, dans la tolérance", () => {
    const a = lineSegment(P(0, 0), P(6, 0));
    const b = arcSegment(P(0, 6), P(6, 6), true);
    const segs = [a, b];
    expect(hitTest(segs, P(3, 0.05), 0.1)).toBe(a.id);
    expect(hitTest(segs, P(3, 3.02), 0.1)).toBe(b.id);
    expect(hitTest(segs, P(3, 1.5), 0.1)).toBeNull();
  });

  it("supprimer et déplacer", () => {
    const a = lineSegment(P(1, 1), P(2, 2));
    const draft = withSegments([a]);
    expect(moveSegments(draft, [a.id], 1, 0).segments[0]).toMatchObject({ a: P(2, 1), b: P(3, 2) });
    expect(moveSegments(draft, [a.id], 9, 0)).toBe(draft);
    expect(deleteSegments(draft, [a.id]).segments).toHaveLength(0);
    expect(deleteSegments(draft, ["inconnu"])).toBe(draft);
  });
});

describe("transformations", () => {
  const sel = (draft: BlockDraft) => draft.segments.map((s) => s.id);

  it("la rotation de 90° d'une sélection est exacte", () => {
    const draft = withSegments([lineSegment(P(1, 2), P(3, 2))]); // centre (2, 2)
    const r = transformSelection(draft, sel(draft), { kind: "rotate", degrees: 90 }, false);
    if (!r.ok) throw new Error(r.reason);
    expect(r.draft.segments[0]).toMatchObject({ a: P(2, 1), b: P(2, 3) });
    const r180 = transformSelection(draft, sel(draft), { kind: "rotate", degrees: 180 }, false);
    if (!r180.ok) throw new Error(r180.reason);
    expect(r180.draft.segments[0]).toMatchObject({ a: P(3, 2), b: P(1, 2) });
    const r270 = transformSelection(draft, sel(draft), { kind: "rotate", degrees: 270 }, false);
    if (!r270.ok) throw new Error(r270.reason);
    expect(r270.draft.segments[0]).toMatchObject({ a: P(2, 3), b: P(2, 1) });
  });

  it("quatre rotations de 90° ramènent au point de départ", () => {
    let draft = withSegments([arcSegment(P(1, 1), P(3, 2), false)]);
    const start = JSON.stringify(draft.segments);
    for (let i = 0; i < 4; i++) {
      const r = transformSelection(draft, sel(draft), { kind: "rotate", degrees: 90 }, false);
      if (!r.ok) throw new Error(r.reason);
      draft = r.draft;
    }
    expect(JSON.stringify(draft.segments)).toBe(start);
  });

  it("rotation libre", () => {
    const draft = withSegments([lineSegment(P(1, 3), P(5, 3))]);
    const r = transformSelection(draft, sel(draft), { kind: "rotate", degrees: 45 }, false);
    if (!r.ok) throw new Error(r.reason);
    const s = r.draft.segments[0] as Extract<Segment, { kind: "line" }>;
    expect(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)).toBeCloseTo(4, 8);
    expect(Math.abs(s.b.x - s.a.x)).toBeCloseTo(Math.abs(s.b.y - s.a.y), 8);
  });

  it("miroirs par rapport aux axes du bloc, avec et sans clone", () => {
    const draft = withSegments([lineSegment(P(1, 1), P(2, 3))]);
    const lr = transformSelection(draft, sel(draft), { kind: "mirror", axis: "lr" }, true);
    if (!lr.ok) throw new Error(lr.reason);
    expect(lr.draft.segments).toHaveLength(2);
    expect(lr.draft.segments[1]).toMatchObject({ a: P(5, 1), b: P(4, 3) });
    expect(lr.ids).toEqual([lr.draft.segments[1]?.id]);
    const tb = transformSelection(draft, sel(draft), { kind: "mirror", axis: "tb" }, false);
    if (!tb.ok) throw new Error(tb.reason);
    expect(tb.draft.segments[0]).toMatchObject({ a: P(1, 5), b: P(2, 3) });
    const dl = transformSelection(draft, sel(draft), { kind: "mirror", axis: "diagLeft" }, false);
    if (!dl.ok) throw new Error(dl.reason);
    expect(dl.draft.segments[0]).toMatchObject({ a: P(1, 1), b: P(3, 2) });
    const dr = transformSelection(draft, sel(draft), { kind: "mirror", axis: "diagRight" }, false);
    if (!dr.ok) throw new Error(dr.reason);
    expect(dr.draft.segments[0]).toMatchObject({ a: P(5, 5), b: P(3, 4) });
  });

  it("le miroir inverse la courbure d'un arc ; il garde les arcs dans le bloc", () => {
    const arc = arcSegment(P(1, 2), P(3, 2), false);
    const draft = withSegments([arc]);
    const r = transformSelection(draft, sel(draft), { kind: "mirror", axis: "tb" }, false);
    if (!r.ok) throw new Error(r.reason);
    const mirrored = r.draft.segments[0] as Extract<Segment, { kind: "arc" }>;
    expect(mirrored.sagitta).toBe(-1);
    // L'arc d'origine bombe vers les y croissants ; son image, vers les y décroissants.
    expect(boundsOf(arc).y1).toBeCloseTo(3, 9);
    expect(boundsOf(mirrored).y0).toBeCloseTo(3, 9);
  });

  it("diagonales refusées sur un bloc non carré ; sortie du bloc refusée", () => {
    const rect = resizeBlock(newDraft(), 6, 4);
    const draft = withSegments([lineSegment(P(1, 1), P(2, 3))], rect);
    expect(transformSelection(draft, sel(draft), { kind: "mirror", axis: "diagLeft" }, false)).toEqual({ ok: false, reason: "not-square" });
    expect(transformSelection(draft, [], { kind: "rotate", degrees: 90 }, false)).toEqual({ ok: false, reason: "empty" });
    const wide = withSegments([lineSegment(P(0, 2), P(6, 2))], rect);
    expect(transformSelection(wide, sel(wide), { kind: "rotate", degrees: 90 }, false)).toEqual({ ok: false, reason: "outside" });
  });

  it("redimensionner en pourcentage autour du centre de la sélection", () => {
    const draft = withSegments([lineSegment(P(2, 3), P(4, 3))]);
    const r = transformSelection(draft, sel(draft), { kind: "scale", sx: 1.5, sy: 1 }, false);
    if (!r.ok) throw new Error(r.reason);
    expect(r.draft.segments[0]).toMatchObject({ a: P(1.5, 3), b: P(4.5, 3) });
    expect(transformSelection(draft, sel(draft), { kind: "scale", sx: 0, sy: 1 }, false)).toEqual({ ok: false, reason: "invalid" });
    expect(transformSelection(draft, sel(draft), { kind: "scale", sx: 4, sy: 1 }, false)).toEqual({ ok: false, reason: "outside" });
  });
});

describe("repères et taille du bloc", () => {
  it("convertir en repères : la sélection, ou tout le dessin ; ils survivent à un nouveau bloc", () => {
    const a = lineSegment(P(0, 1), P(6, 1));
    const b = lineSegment(P(0, 2), P(6, 2));
    const draft = withSegments([a, b]);
    const some = convertToGuides(draft, [a.id]);
    expect(some.segments).toHaveLength(1);
    expect(some.guides).toHaveLength(1);
    const all = convertToGuides(draft, null);
    expect(all.segments).toHaveLength(0);
    expect(all.guides).toHaveLength(2);
    expect(toDrawing(all)).toEqual({ kind: "easydraw", segments: [] });

    const editor = new BlockEditor(all);
    editor.startNew();
    expect(editor.draft.guides).toHaveLength(2);
    expect(editor.draft.segments).toHaveLength(0);
  });

  it("redimensionner le bloc fait suivre le dessin", () => {
    const draft = withSegments([lineSegment(P(0, 0), P(6, 6))]);
    const big = resizeBlock(draft, 12, 6);
    expect(big.segments[0]).toMatchObject({ a: P(0, 0), b: P(12, 6) });
    expect(resizeBlock(draft, 0, 6)).toBe(draft);
  });

  it("historique du brouillon : annuler retire le segment", () => {
    const editor = new BlockEditor();
    const seg = lineSegment(P(0, 0), P(6, 6));
    editor.execute("Ligne", (d) => addSegments(d, [seg]).draft);
    expect(editor.draft.segments).toEqual([seg]);
    editor.undo();
    expect(editor.draft.segments).toHaveLength(0);
    editor.redo();
    expect(editor.draft.segments).toHaveLength(1);
  });
});

describe("fenêtre", () => {
  it("le zoom garde fixe le point visé ; conversions réciproques", () => {
    const v = fitView(900, 700, 6, 6);
    const p = toWorld(v, 450, 350);
    expect(p.x).toBeCloseTo(3, 9);
    const z = zoomAt(v, v.scale * 4, 300, 200);
    const before = toWorld(v, 300, 200);
    const after = toWorld(z, 300, 200);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    const s = toScreen(z, P(1, 2));
    const back = toWorld(z, s.x, s.y);
    expect(back.x).toBeCloseTo(1, 9);
    expect(back.y).toBeCloseTo(2, 9);
  });
});

describe("niveaux de zoom", () => {
  it("les boutons suivent des niveaux fixes, 400 % compris", () => {
    let scale = ACTUAL_SIZE;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      scale = stepZoom(scale, 1);
      seen.push(zoomPercent({ scale, originX: 0, originY: 0 }));
    }
    expect(seen).toEqual([150, 200, 300, 400]);
    expect(zoomPercent({ scale: stepZoom(ACTUAL_SIZE * 1.1, -1), originX: 0, originY: 0 })).toBe(100);
    expect(zoomPercent({ scale: stepZoom(ACTUAL_SIZE * 0.1, -1), originX: 0, originY: 0 })).toBe(10); // plancher
  });
});
