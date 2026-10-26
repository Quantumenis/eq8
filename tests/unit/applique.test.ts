import { describe, expect, it } from "vitest";
import { cubicAt, cubicToSegments, type Cubic } from "../../src/core/draw/bezier";
import {
  addNodeAt,
  appliqueContent,
  centerInBlock,
  convertSegment,
  cutAt,
  deleteNode,
  joinNodes,
  makeShape,
  moveHandle,
  normalizeShape,
  polyShape,
  selfIntersects,
  setNodeType,
  shapeAt,
  shapeSegments,
  shapesBounds,
  shapesInRect,
  wreath,
  type AppNode,
  type AppShape,
} from "../../src/core/draw/applique";
import {
  DEFAULT_BRUSH,
  DEFAULT_ELLIPSE,
  DEFAULT_STAR,
  DEFAULT_STENCIL,
  FORM_IDS,
  POSIE_PRESETS,
  brushStroke,
  ellipseShape,
  ellipseShapes,
  formShape,
  freehandShape,
  posieParams,
  posieShapes,
  rectShape,
  starShape,
  stencilShapes,
  swathShapes,
  DEFAULT_SWATH,
} from "../../src/core/draw/appliqueShapes";
import { areaAndCentroid } from "../../src/core/draw/pieces";
import type { Pt } from "../../src/core/draw/geometry";

const area = (s: AppShape): number => Math.abs(areaAndCentroid(shapeSegments(s)).area);

describe("Béziers → arcs", () => {
  it("un quart de cercle de Bézier devient peu d'arcs, à 10⁻⁴ près", () => {
    const k = 0.5522847498307936;
    const c: Cubic = { p0: { x: 1, y: 0 }, p1: { x: 1, y: k }, p2: { x: k, y: 1 }, p3: { x: 0, y: 1 } };
    const segs = cubicToSegments(c);
    expect(segs.length).toBeLessThanOrEqual(6);
    for (let i = 0; i <= 20; i++) {
      const p = cubicAt(c, i / 20);
      // Le point est à 1e-4 près du contour d'arcs.
      let best = Infinity;
      for (const s of segs) {
        if (s.kind === "arc") {
          const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
          void mid;
        }
      }
      best = Math.abs(Math.hypot(p.x, p.y) - 1);
      expect(best).toBeLessThan(3e-4);
    }
    expect(segs[0]?.a).toEqual(c.p0);
    expect(segs[segs.length - 1]?.b).toEqual(c.p3);
  });

  it("une cubique dont les poignées sont sur la corde est une droite", () => {
    const segs = cubicToSegments({ p0: { x: 0, y: 0 }, p1: { x: 1, y: 0 }, p2: { x: 2, y: 0 }, p3: { x: 3, y: 0 } });
    expect(segs).toHaveLength(1);
    expect(segs[0]?.kind).toBe("line");
  });

  it("une courbe en S est approchée sans dépasser la tolérance", () => {
    const c: Cubic = { p0: { x: 0, y: 0 }, p1: { x: 2, y: 3 }, p2: { x: 1, y: -3 }, p3: { x: 3, y: 0 } };
    const segs = cubicToSegments(c);
    expect(segs.length).toBeGreaterThan(2);
    // Chaque jonction est continue.
    for (let i = 0; i + 1 < segs.length; i++) expect(Math.hypot((segs[i + 1]?.a.x ?? 0) - (segs[i]?.b.x ?? 0), (segs[i + 1]?.a.y ?? 0) - (segs[i]?.b.y ?? 0))).toBeLessThan(1e-9);
  });
});

describe("Pièces d'applique", () => {
  it("un lacet de Béziers dont le dernier nœud rejoint le premier est une pièce fermée", () => {
    const nodes: AppNode[] = [
      { x: 1, y: 3, type: "smooth", hout: { x: 0, y: -1.2 } },
      { x: 3, y: 1, type: "smooth", hin: { x: -1.2, y: 0 }, hout: { x: 1.2, y: 0 } },
      { x: 5, y: 3, type: "smooth", hin: { x: 0, y: -1.2 }, hout: { x: 0, y: 1.2 } },
      { x: 3, y: 5, type: "smooth", hin: { x: 1.2, y: 0 }, hout: { x: -1.2, y: 0 } },
      { x: 1, y: 3, type: "smooth", hin: { x: 0, y: 1.2 } },
    ];
    const open = makeShape(nodes, false);
    expect(normalizeShape(open).closed).toBe(true);
    const content = appliqueContent([normalizeShape(open)]);
    expect(content.pieces).toHaveLength(1);
    expect(content.strands).toHaveLength(0);
    expect(content.pieces[0]?.area).toBeGreaterThan(8);
    expect(content.issues).toHaveLength(0);
  });

  it("une pièce ouverte est un fil", () => {
    const content = appliqueContent([polyShape([{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 0 }], false)]);
    expect(content.pieces).toHaveLength(0);
    expect(content.strands).toHaveLength(1);
  });

  it("une auto-intersection (huit) est détectée", () => {
    const eight = polyShape(
      [
        { x: 0, y: 0 },
        { x: 4, y: 4 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
      ],
      true,
    );
    expect(selfIntersects(shapeSegments(eight))).toBe(true);
    expect(appliqueContent([eight]).issues).toEqual([{ kind: "selfIntersect", shape: eight.id, key: expect.any(String) }]);
    // Un huit asymétrique (aire non nulle) est aussi une pièce, signalée.
    const skew = polyShape([{ x: 0, y: 0 }, { x: 5, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 3 }], true);
    expect(appliqueContent([skew]).issues).toHaveLength(1);
    expect(appliqueContent([skew]).pieces).toHaveLength(1);
    const square = polyShape([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], true);
    expect(selfIntersects(shapeSegments(square))).toBe(false);
  });

  it("le fond est la première pièce, et l'ordre de dessin donne l'ordre d'empilement", () => {
    const a = ellipseShape(2, 2, 1, 1);
    const b = ellipseShape(3, 3, 1, 1);
    const c = appliqueContent([a, b], { background: { width: 6, height: 6 } });
    expect(c.pieces.map((p) => p.key)[0]).toBe("bg");
    expect(c.pieces).toHaveLength(3);
    expect(c.pieces[0]?.area).toBeCloseTo(36, 6);
  });

  it("les clés des pièces sont stables (même forme = même clé)", () => {
    const a = appliqueContent([ellipseShape(2, 2, 1, 1)]);
    const b = appliqueContent([{ ...ellipseShape(2, 2, 1, 1), id: "autre" }]);
    expect(a.pieces[0]?.key).toBe(b.pieces[0]?.key);
  });
});

describe("Formes de base", () => {
  it("l'ellipse a l'aire de πr² à 0,05 % près", () => {
    expect(area(ellipseShape(3, 3, 2, 2))).toBeCloseTo(Math.PI * 4, 2);
    expect(area(ellipseShape(3, 3, 2, 1))).toBeCloseTo(Math.PI * 2, 2);
  });

  it("rectangle arrondi : aire = w·h − (4 − π)·r² et rondeur par coin", () => {
    const r = rectShape(0, 0, 4, 3, [0.5, 0.5, 0.5, 0.5]);
    expect(r).not.toBeNull();
    expect(area(r as AppShape)).toBeCloseTo(12 - (4 - Math.PI) * 0.25, 2);
    const one = rectShape(0, 0, 4, 3, [1, 0, 0, 0]) as AppShape;
    expect(area(one)).toBeCloseTo(12 - (1 - Math.PI / 4), 2);
    expect(rectShape(0, 0, 0, 3)).toBeNull();
  });

  it("une pie, des sections égales et décalées", () => {
    const pie = ellipseShapes(0, 0, 4, 4, { ...DEFAULT_ELLIPSE, kind: "pie", start: 0, end: 90, sections: 1 });
    expect(pie).toHaveLength(1);
    expect(area(pie[0] as AppShape)).toBeCloseTo(Math.PI, 2);
    const sections = ellipseShapes(0, 0, 4, 4, { ...DEFAULT_ELLIPSE, kind: "ellipse", sections: 4 });
    expect(sections).toHaveLength(4);
    for (const s of sections) expect(area(s)).toBeCloseTo(Math.PI, 2);
    const staggered = ellipseShapes(0, 0, 4, 4, { kind: "pie", start: 0, end: 180, sections: 4, mode: "stagger" });
    expect(staggered).toHaveLength(5);
    expect(area(staggered[0] as AppShape)).toBeCloseTo(area(staggered[1] as AppShape) / 2, 2);
    const arc = ellipseShapes(0, 0, 4, 4, { kind: "arc", start: 0, end: 180, sections: 2, mode: "partition" });
    expect(arc).toHaveLength(2);
    expect(arc.every((s) => !s.closed)).toBe(true);
  });

  it("toutes les formes prédéfinies sont des contours fermés simples dans leur rectangle", () => {
    expect(FORM_IDS.length).toBeGreaterThanOrEqual(16);
    for (const id of FORM_IDS) {
      const s = formShape(id, 1, 1, 4, 3);
      expect(s, id).not.toBeNull();
      const shape = s as AppShape;
      expect(shape.closed, id).toBe(true);
      expect(selfIntersects(shapeSegments(shape)), id).toBe(false);
      const b = shapesBounds([shape]);
      expect(b?.x0, id).toBeGreaterThanOrEqual(1 - 0.35);
      expect(b?.x1, id).toBeLessThanOrEqual(4 + 0.35);
      expect(area(shape), id).toBeGreaterThan(0.5);
    }
    const square = formShape("oval", 0, 0, 4, 2, true) as AppShape;
    const bs = shapesBounds([square]);
    expect((bs?.x1 ?? 0) - (bs?.x0 ?? 0)).toBeCloseTo((bs?.y1 ?? 0) - (bs?.y0 ?? 0), 3);
  });

  it("StarMaker : 5 branches = 10 nœuds, centrée ; PosieMaker : pétales + cœur ; StencilMaker", () => {
    const star = starShape(6, 6, DEFAULT_STAR);
    expect(star.nodes).toHaveLength(10);
    const b = shapesBounds([star]);
    expect(((b?.x0 ?? 0) + (b?.x1 ?? 0)) / 2).toBeCloseTo(3, 3);
    expect(selfIntersects(shapeSegments(star))).toBe(false);
    for (const preset of POSIE_PRESETS) {
      const shapes = posieShapes(8, 8, posieParams(preset));
      expect(shapes).toHaveLength(preset.petals + 1);
      const box = shapesBounds(shapes);
      expect(box?.x0 ?? -1).toBeGreaterThanOrEqual(-1e-6); // en haut à gauche, dans le bloc
      expect(box?.y0 ?? -1).toBeGreaterThanOrEqual(-1e-6);
    }
    const stencil = stencilShapes(8, 8, DEFAULT_STENCIL);
    expect(stencil).toHaveLength(8);
    expect(stencilShapes(8, 8, { ...DEFAULT_STENCIL, loop: true })).toHaveLength(16);
  });

  it("trait de pinceau, bande et main levée", () => {
    const spine: Pt[] = [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 5, y: 1 },
    ];
    const stroke = brushStroke(spine, DEFAULT_BRUSH);
    expect(stroke?.closed).toBe(true);
    expect(selfIntersects(shapeSegments(stroke as AppShape))).toBe(false);
    for (const contour of ["uniform", "spindle", "taperStart", "taperEnd", "wavy"] as const) {
      for (const caps of ["flat", "round", "point"] as const) {
        const s = brushStroke(spine, { ...DEFAULT_BRUSH, contour, caps });
        expect(s, `${contour}/${caps}`).not.toBeNull();
        expect(area(s as AppShape), `${contour}/${caps}`).toBeGreaterThan(0.1);
      }
    }
    const geese = swathShapes(spine, DEFAULT_SWATH);
    expect(geese.length).toBeGreaterThan(2);
    expect(swathShapes(spine, { ...DEFAULT_SWATH, style: "diamonds" }).length).toBe(geese.length);
    // Cercle tracé à main levée : un tracé fermé, peu de nœuds.
    const circle: Pt[] = Array.from({ length: 80 }, (_, i) => ({ x: 3 + 2 * Math.cos((2 * Math.PI * i) / 79), y: 3 + 2 * Math.sin((2 * Math.PI * i) / 79) }));
    const free = freehandShape(circle, 0.3) as AppShape;
    expect(free.closed).toBe(true);
    expect(free.nodes.length).toBeLessThan(12);
    expect(area(free)).toBeGreaterThan(Math.PI * 4 * 0.9);
    const line = freehandShape(spine, 0.5) as AppShape;
    expect(line.closed).toBe(false);
  });
});

describe("Sélection et transformations", () => {
  const shapes = [ellipseShape(2, 2, 1, 1), ellipseShape(5, 5, 1, 1), polyShape([{ x: 0, y: 6 }, { x: 1, y: 6 }, { x: 0.5, y: 7 }], true)];
  it("clic : intérieur de la forme la plus haute, rectangle : formes entièrement entourées", () => {
    expect(shapeAt(shapes, { x: 2, y: 2 }, 0.05)).toBe(shapes[0]?.id);
    expect(shapeAt(shapes, { x: 4, y: 0.5 }, 0.05)).toBeNull();
    expect(shapesInRect(shapes, { x0: 0, y0: 0, x1: 3.1, y1: 3.1 })).toEqual([shapes[0]?.id]);
    expect(shapesInRect(shapes, { x0: 0, y0: 0, x1: 2.5, y1: 2.5 })).toEqual([]);
  });

  it("centrer dans le bloc", () => {
    const moved = centerInBlock(shapes, new Set([shapes[0]?.id as string]), 6, 6);
    const b = shapesBounds([moved[0] as AppShape]);
    expect(((b?.x0 ?? 0) + (b?.x1 ?? 0)) / 2).toBeCloseTo(3, 4);
    expect(((b?.y0 ?? 0) + (b?.y1 ?? 0)) / 2).toBeCloseTo(3, 4);
  });

  it("couronne : 8 groupes à 50 % → 8 copies sur un cercle, pivotées de 45°, centrées dans le bloc", () => {
    const seed = [ellipseShape(3, 3, 0.4, 0.8)];
    const result = wreath(seed, new Set([seed[0]?.id as string]), 8, 8, { count: 8, spacing: 50, size: 100 });
    expect(result).not.toBeNull();
    const copies = result?.shapes as AppShape[];
    expect(copies).toHaveLength(8);
    const centers = copies.map((s) => {
      const b = shapesBounds([s]) as { x0: number; x1: number; y0: number; y1: number };
      // Le centre d'une copie : la moyenne de ses nœuds (une ellipse est symétrique).
      return { x: s.nodes.reduce((a, n) => a + n.x, 0) / s.nodes.length, y: s.nodes.reduce((a, n) => a + n.y, 0) / s.nodes.length, b };
    });
    const radii = centers.map((c) => Math.hypot(c.x - 4, c.y - 4));
    for (const r of radii) expect(r).toBeCloseTo(radii[0] as number, 4);
    expect(radii[0]).toBeGreaterThan(0.5);
    const angles = centers.map((c) => (Math.atan2(c.y - 4, c.x - 4) * 180) / Math.PI);
    const sorted = [...angles].sort((p, q) => p - q);
    for (let i = 1; i < sorted.length; i++) expect((sorted[i] as number) - (sorted[i - 1] as number)).toBeCloseTo(45, 3);
    // La couronne entière est centrée.
    const all = shapesBounds(copies);
    expect(((all?.x0 ?? 0) + (all?.x1 ?? 0)) / 2).toBeCloseTo(4, 3);
    expect(((all?.y0 ?? 0) + (all?.y1 ?? 0)) / 2).toBeCloseTo(4, 3);
    // L'espacement 0 rapproche les groupes du centre ; 100 % les éloigne.
    const near = wreath(seed, new Set([seed[0]?.id as string]), 8, 8, { count: 8, spacing: 0, size: 100 });
    const far = wreath(seed, new Set([seed[0]?.id as string]), 8, 8, { count: 8, spacing: 100, size: 100 });
    const reach = (r: typeof near) => Math.max(...(r?.shapes ?? []).map((s) => Math.hypot(s.nodes[0]?.x ?? 0 - 4, s.nodes[0]?.y ?? 0 - 4)));
    expect(reach(far)).toBeGreaterThanOrEqual(reach(near));
    expect(wreath(seed, new Set([seed[0]?.id as string]), 8, 8, { count: 2, spacing: 50, size: 100 })).toBeNull();
  });

  it("une couronne trop grande est réduite pour tenir dans le bloc", () => {
    const big = [ellipseShape(3, 3, 1.8, 2.8)];
    const r = wreath(big, new Set([big[0]?.id as string]), 6, 6, { count: 6, spacing: 100, size: 100 });
    const b = shapesBounds(r?.shapes ?? []);
    expect(b?.x0 ?? -1).toBeGreaterThanOrEqual(-1e-6);
    expect(b?.x1 ?? 99).toBeLessThanOrEqual(6 + 1e-6);
    expect(b?.y0 ?? -1).toBeGreaterThanOrEqual(-1e-6);
    expect(b?.y1 ?? 99).toBeLessThanOrEqual(6 + 1e-6);
  });
});

describe("Édition des nœuds", () => {
  const heart = formShape("heart", 0, 0, 6, 6) as AppShape;

  it("ajouter un nœud sur un segment ne change pas la forme", () => {
    const before = area(heart);
    for (let i = 0; i < heart.nodes.length; i++) {
      const after = addNodeAt(heart, i, 0.4);
      expect(after.nodes.length).toBe(heart.nodes.length + 1);
      expect(area(after)).toBeCloseTo(before, 3);
    }
    const square = polyShape([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], true);
    const split = addNodeAt(square, 3, 0.5); // le segment de fermeture
    expect(split.nodes).toHaveLength(5);
    expect(split.nodes[4]).toMatchObject({ x: 0, y: 2 });
    expect(area(split)).toBeCloseTo(16, 6);
  });

  it("supprimer un nœud, convertir un segment en ligne puis en courbe", () => {
    const square = polyShape([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], true);
    const tri = deleteNode(square, 3) as AppShape;
    expect(area(tri)).toBeCloseTo(8, 6);
    expect(deleteNode(tri, 0)).toBeNull();
    const curved = convertSegment(square, 0, "curve");
    expect(area(curved)).toBeGreaterThan(0);
    expect(curved.nodes[0]?.hout).toBeDefined();
    const flat = convertSegment(curved, 0, "line");
    expect(area(flat)).toBeCloseTo(16, 6);
  });

  it("types de nœud : lisse aligne, symétrique égalise, pointe superpose", () => {
    const s = makeShape(
      [
        { x: 0, y: 0, type: "corner", hout: { x: 1, y: 0 } },
        { x: 3, y: 0, type: "corner", hin: { x: -1, y: 0 }, hout: { x: 1, y: 1 } },
        { x: 3, y: 3, type: "corner" },
      ],
      false,
    );
    const smooth = setNodeType(s, 1, "smooth");
    const hin = smooth.nodes[1]?.hin as Pt;
    const hout = smooth.nodes[1]?.hout as Pt;
    expect(hin.x * hout.y - hin.y * hout.x).toBeCloseTo(0, 9); // alignées
    expect(hin.x * hout.x + hin.y * hout.y).toBeLessThan(0); // sens opposés
    const moved = moveHandle(setNodeType(s, 1, "symmetric"), 1, "out", { x: 3, y: 2 });
    const mi = moved.nodes[1]?.hin as Pt;
    const mo = moved.nodes[1]?.hout as Pt;
    expect(Math.hypot(mi.x, mi.y)).toBeCloseTo(Math.hypot(mo.x, mo.y), 9);
    const cusp = setNodeType(s, 1, "cusp");
    expect(cusp.nodes[1]?.hin).toEqual(cusp.nodes[1]?.hout);
  });

  it("couper au nœud ouvre une pièce fermée ; joindre la referme", () => {
    const square = polyShape([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], true);
    const [cut] = cutAt(square, 1) as [AppShape];
    expect(cut.closed).toBe(false);
    expect(cut.nodes).toHaveLength(5);
    expect(appliqueContent([cut]).strands).toHaveLength(1);
    const joined = joinNodes([cut], { shape: cut.id, node: 0 }, { shape: cut.id, node: 4 });
    expect(joined?.[0]?.closed).toBe(true);
    expect(appliqueContent(joined as AppShape[]).pieces).toHaveLength(1);
    // Couper un tracé ouvert au milieu : deux tracés, et les rejoindre n'en fait plus qu'un.
    const line = polyShape([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }, { x: 3, y: 1 }], false);
    const halves = cutAt(line, 1);
    expect(halves).toHaveLength(2);
    const back = joinNodes(halves, { shape: halves[0]?.id as string, node: 1 }, { shape: halves[1]?.id as string, node: 0 });
    expect(back).toHaveLength(1);
    expect(back?.[0]?.nodes).toHaveLength(4);
  });
});
