import { describe, expect, it } from "vitest";
import { newProject } from "../../src/core/project/defaults";
import { addToSketchbook } from "../../src/core/project/commands";
import { instantiateLibraryBlock, LIBRARY_BLOCKS } from "../../src/core/library/blocks";
import type { Project } from "../../src/core/project/model";
import {
  BORDER_STYLES,
  buildBorders,
  finishedSize,
  forcesFourSides,
  hasBlockCounts,
  makeBorder,
  uniformSizes,
  type Border,
  type BorderStyle,
} from "../../src/core/quilt/borders";
import { addBorder, insertBorder, removeBorder, setBorderCount, setBorderSize, setBorderStyle } from "../../src/core/quilt/borderops";
import { newDraft, parseDoc, quiltItemOf, docToJson, type QuiltDraft } from "../../src/core/quilt/doc";
import { pointInPolygon, polygonArea } from "../../src/core/quilt/geom";
import { buildLayout } from "../../src/core/quilt/layout";
import { newLayout, placeBlock, setLayout, slotsForClick } from "../../src/core/quilt/ops";
import { buildScene, slotAtPoint } from "../../src/core/quilt/scene";

function setup() {
  const loaded = newProject(null, 2);
  const block = instantiateLibraryBlock(LIBRARY_BLOCKS[0]!);
  const project: Project = addToSketchbook(loaded.project, "blocks", block).project;
  return { project, ref: { blockId: block.id, coloringId: block.colorings[1]!.id } };
}

const sashed = { kind: "horizontal", nh: 4, nv: 5, bw: 8, bh: 8, sw: 1, sh: 1, sashBorder: true } as const; // 37 × 46
const center = (draft: QuiltDraft) => buildLayout(draft.doc.layout);

function withBorders(draft: QuiltDraft, borders: Border[]): QuiltDraft {
  return { doc: { ...draft.doc, borders }, fills: draft.fills };
}

describe("tailles des bordures (SPEC §3.4)", () => {
  it("un quilt de 37 × 46 po avec des bordures de 1 + 2,5 + 4 po (Tous) fait 52 × 61 po", () => {
    const { project } = setup();
    let draft = setLayout(newDraft("horizontal"), project, sashed);
    expect(center(draft).width).toBe(37);
    draft = withBorders(draft, []);
    for (const size of [1, 2.5, 4]) {
      const added = addBorder(draft, { style: "longH" });
      draft = setBorderSize(added.draft, project, added.id, "left", size); // « Tous » par défaut
    }
    expect(draft.doc.borders).toHaveLength(3);
    const c = center(draft);
    expect(finishedSize(c.width, c.height, draft.doc.borders)).toEqual({ width: 52, height: 61 });
    expect(buildScene(project, draft).bounds).toEqual({ x0: -7.5, y0: -7.5, x1: 44.5, y1: 53.5 });
  });

  it("avec G+D = 3 et H+B = 1 seulement : 43 × 48 po", () => {
    const { project } = setup();
    let draft = setLayout(newDraft("horizontal"), project, sashed);
    const id = draft.doc.borders[0]!.id;
    const lock = { all: false, leftRight: true, topBottom: true };
    draft = setBorderSize(draft, project, id, "left", 3, lock);
    draft = setBorderSize(draft, project, id, "top", 1, lock);
    const b = draft.doc.borders[0]!;
    expect(b.sizes).toEqual({ left: 3, top: 1, right: 3, bottom: 1 });
    const c = center(draft);
    expect(finishedSize(c.width, c.height, draft.doc.borders)).toEqual({ width: 43, height: 48 });
  });

  it("sans verrou, chaque côté est indépendant ; un côté à 0 disparaît", () => {
    const { project } = setup();
    let draft = newDraft("horizontal");
    const id = draft.doc.borders[0]!.id;
    const free = { all: false, leftRight: false, topBottom: false };
    draft = setBorderSize(draft, project, id, "right", 3, free);
    draft = setBorderSize(draft, project, id, "top", 0, free);
    expect(draft.doc.borders[0]!.sizes).toEqual({ left: 1, top: 0, right: 3, bottom: 1 });
    const scene = buildScene(project, draft);
    expect(scene.borders.slots.every((s) => !s.key.includes(".t"))).toBe(true);
  });

  it("un nouveau quilt a une bordure « Longue horizontale » de 1 po sur les quatre côtés", () => {
    const draft = newDraft("horizontal");
    expect(draft.doc.borders).toHaveLength(1);
    expect(draft.doc.borders[0]).toMatchObject({ style: "longH", sizes: { left: 1, top: 1, right: 1, bottom: 1 } });
  });
});

const SIZE_CASES = [uniformSizes(1), uniformSizes(2.5), { left: 1, top: 3, right: 2, bottom: 0.5 }, { left: 0, top: 2, right: 2, bottom: 2 }, { left: 2, top: 0, right: 0, bottom: 2 }];

function ringArea(width: number, height: number, border: Border): number {
  const s = border.sizes;
  return (width + s.left + s.right) * (height + s.top + s.bottom) - width * height;
}

describe("géométrie des 22 styles (SPEC §3.2)", () => {
  it("il y a 22 styles", () => {
    expect(BORDER_STYLES).toHaveLength(22);
    expect(new Set(BORDER_STYLES).size).toBe(22);
  });

  for (const style of BORDER_STYLES) {
    it(`${style} : la somme des aires des pièces égale l'aire de l'anneau et les pièces ne se recouvrent pas`, () => {
      for (const sizes of SIZE_CASES) {
        const border = makeBorder("b1", style, sizes, { nh: 4, nv: 5 });
        const result = buildBorders(20, 24, [border]);
        const total = result.slots.reduce((sum, s) => sum + polygonArea(s.poly), 0);
        expect(Math.abs(total - ringArea(20, 24, border))).toBeLessThan(1e-6);
        // Chaque pièce est dans l'anneau.
        for (const s of result.slots) for (const p of s.poly) expect(p.x >= result.bounds.x0 - 1e-9 && p.x <= result.bounds.x1 + 1e-9 && p.y >= result.bounds.y0 - 1e-9 && p.y <= result.bounds.y1 + 1e-9).toBe(true);
      }
    });

    it(`${style} : chaque point de l'anneau est couvert par une seule pièce`, () => {
      const border = makeBorder("b1", style, { left: 1.5, top: 2, right: 1, bottom: 2.5 }, { nh: 4, nv: 5 });
      const result = buildBorders(12, 15, [border]);
      let seed = 12345;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
      const b = result.bounds;
      let tested = 0;
      for (let i = 0; i < 4000; i++) {
        const p = { x: b.x0 + rnd() * (b.x1 - b.x0), y: b.y0 + rnd() * (b.y1 - b.y0) };
        const inCenter = p.x >= 0 && p.x <= 12 && p.y >= 0 && p.y <= 15;
        const hits = result.slots.filter((s) => pointInPolygon(s.poly, p)).length;
        expect(hits).toBe(inCenter ? 0 : 1);
        if (!inCenter) tested += 1;
      }
      expect(tested).toBeGreaterThan(500);
    });
  }

  it("nombre de pièces pour 4 × 5 blocs", () => {
    const count = (style: BorderStyle) => buildBorders(20, 24, [makeBorder("b1", style, uniformSizes(2), { nh: 4, nv: 5 })]).slots.length;
    expect(count("longH")).toBe(4);
    expect(count("longV")).toBe(4);
    expect(count("mitered")).toBe(4);
    expect(count("corner")).toBe(8); // 4 côtés + 4 coins
    expect(count("blocks")).toBe(2 * 4 + 2 * 5 + 4);
    expect(count("hdBlocks")).toBe(2 * (4 + 5) + 2 * (5 + 6) + 4); // deux rangées, la seconde a une cellule de plus
    expect(count("spaced")).toBe(2 * (2 * 4 + 1) + 2 * (2 * 5 + 1) + 4); // n carrés et n + 1 bandes par côté
    expect(count("diamonds")).toBe(2 * (3 * 4 + 2) + 2 * (3 * 5 + 2) + 4);
    expect(count("pointsOut")).toBe(2 * (2 * 4 + 1) + 2 * (2 * 5 + 1) + 4);
    expect(count("tileSquares")).toBe(2 * 4 + 2 * 5);
    expect(count("tileOnPoint")).toBe(2 * (3 * 4 + 2) + 2 * (3 * 5 + 2));
    expect(count("tileOnPointCorners")).toBe(2 * (3 * 4 + 2) + 2 * (3 * 5 + 2) + 4);
  });

  it("les carreaux ont toujours 4 côtés, et leurs pièces aussi (carreaux carrés)", () => {
    expect(forcesFourSides("tileSquares")).toBe(true);
    expect(forcesFourSides("tileOnPoint")).toBe(true);
    expect(forcesFourSides("tileOnPointCorners")).toBe(true);
    expect(forcesFourSides("blocks")).toBe(false);
    const { project } = setup();
    let draft = newDraft("horizontal");
    const id = draft.doc.borders[0]!.id;
    draft = setBorderStyle(draft, project, id, "tileSquares");
    draft = setBorderSize(draft, project, id, "left", 0);
    expect(draft.doc.borders[0]!.sizes).toEqual({ left: 0.25, top: 0.25, right: 0.25, bottom: 0.25 });
    const result = buildBorders(32, 40, draft.doc.borders);
    expect(result.slots.every((s) => s.poly.length === 4)).toBe(true);
    const keys = new Set(result.slots.map((s) => s.key.split(".")[1]![0]));
    expect([...keys].sort()).toEqual(["b", "l", "r", "t"]);
  });

  it("Losanges : les losanges sont des emplacements de bloc ; les triangles, des pièces", () => {
    const result = buildBorders(20, 24, [makeBorder("b1", "diamonds", uniformSizes(2), { nh: 4, nv: 5 })]);
    const blocks = result.slots.filter((s) => s.role === "border");
    expect(blocks).toHaveLength(4 + 4 + 5 + 5 + 4);
  });

  it("les compteurs de blocs ne sont actifs que pour les styles qui en ont", () => {
    expect(hasBlockCounts("longH")).toBe(false);
    expect(hasBlockCounts("corner")).toBe(false);
    expect(hasBlockCounts("mitered")).toBe(false);
    expect(hasBlockCounts("blocks")).toBe(true);
    expect(hasBlockCounts("diamonds")).toBe(true);
  });
});

describe("bordures alignées (SPEC §3.8)", () => {
  const topEdges = (slots: { key: string; poly: { x: number; y: number }[] }[], id: string): number[] => {
    const xs = new Set<number>();
    for (const s of slots) {
      if (!s.key.startsWith(`r${id}.t`)) continue;
      for (const p of s.poly) xs.add(Math.round(p.x * 1e6) / 1e6);
    }
    return [...xs].sort((a, b) => a - b);
  };

  it("« Blocs alignés à l'intérieur » : deux blocs de plus, et les arêtes tombent sur celles de la bordure intérieure", () => {
    const inner = makeBorder("b1", "blocks", uniformSizes(2), { nh: 4, nv: 5 });
    const outer = makeBorder("b2", "blocksAligned", uniformSizes(2), { nh: 4, nv: 5 });
    const plainOuter = makeBorder("b3", "blocks", uniformSizes(2), { nh: 4, nv: 5 });
    const aligned = buildBorders(20, 24, [inner, outer]);
    const unaligned = buildBorders(20, 24, [inner, plainOuter]);
    const innerEdges = topEdges(aligned.slots, "b1").filter((x) => x >= 0 && x <= 20);
    const outerEdges = topEdges(aligned.slots, "b2");
    for (const x of innerEdges) expect(outerEdges).toContain(x);
    // Quatre blocs, plus un bloc de chaque côté (alignés sur les coins de la bordure intérieure).
    expect(aligned.slots.filter((s) => s.key.startsWith("rb2.t"))).toHaveLength(4 + 2);
    // Avec le style Blocs ordinaire, ils ne tombent pas sur les arêtes de la bordure intérieure.
    const plainEdges = topEdges(unaligned.slots, "b3");
    expect(innerEdges.every((x) => plainEdges.includes(x))).toBe(false);
    // Verticalement aussi.
    const ys = (id: string) => new Set(aligned.slots.filter((s) => s.key.startsWith(`r${id}.l`)).flatMap((s) => s.poly.map((p) => Math.round(p.y * 1e6) / 1e6)));
    for (const y of ys("b1")) if (y >= 0 && y <= 24) expect(ys("b2").has(y)).toBe(true);
  });

  it("« Blocs en quinconce alignés » : la rangée décalée tombe au milieu des cellules", () => {
    const inner = makeBorder("b1", "corner", uniformSizes(2), { nh: 4, nv: 5 });
    const outer = makeBorder("b2", "hdBlocksAligned", uniformSizes(2), { nh: 4, nv: 5 });
    const result = buildBorders(20, 24, [inner, outer]);
    const top = result.slots.filter((s) => s.key.startsWith("rb2.t"));
    // Rangée extérieure (v de 1 à 2 en dehors) et rangée intérieure : n + 2 et n + 3 cellules.
    expect(top).toHaveLength(6 + 7);
  });
});

describe("commandes sur les bordures", () => {
  it("Ajouter : une bordure à l'extérieur (1 po) ; Insérer : à l'intérieur de la sélection ; Supprimer", () => {
    const { project } = setup();
    let draft = newDraft("horizontal");
    const first = draft.doc.borders[0]!.id;
    const added = addBorder(draft, { style: "blocks", selected: first });
    draft = added.draft;
    expect(draft.doc.borders.map((b) => b.style)).toEqual(["longH", "blocks"]);
    expect(draft.doc.borders[1]!.sizes).toEqual(uniformSizes(1));
    const inserted = insertBorder(draft, { style: "corner", selected: added.id });
    draft = inserted.draft;
    expect(draft.doc.borders.map((b) => b.style)).toEqual(["longH", "corner", "blocks"]);
    expect(new Set(draft.doc.borders.map((b) => b.id)).size).toBe(3);
    draft = removeBorder(draft, project, inserted.id);
    expect(draft.doc.borders.map((b) => b.style)).toEqual(["longH", "blocks"]);
  });

  it("Cloner : style, tailles et nombre de blocs sont copiés, ni les couleurs ni les blocs", () => {
    const { project, ref } = setup();
    let draft = newDraft("horizontal");
    const id = draft.doc.borders[0]!.id;
    draft = setBorderStyle(draft, project, id, "blocks");
    draft = setBorderSize(draft, project, id, "left", 3);
    draft = setBorderCount(draft, project, id, "nh", 7);
    const scene = buildScene(project, draft);
    const slot = scene.slots.find((s) => s.slot.border === id && s.slot.frame)!;
    draft = placeBlock(draft, project, [slot.slot.key], ref);
    expect(Object.keys(draft.doc.set)).toHaveLength(1);
    const cloned = addBorder(draft, { style: "longH", selected: id, clone: true });
    const copy = cloned.draft.doc.borders[1]!;
    expect(copy).toMatchObject({ style: "blocks", nh: 7, sizes: uniformSizes(3) });
    expect(Object.keys(cloned.draft.doc.set).every((k) => k.startsWith(`r${id}.`))).toBe(true);
    expect(Object.keys(cloned.draft.doc.set)).toHaveLength(1);
  });

  it("on pose un bloc dans une bordure (il s'étire) ; changer le style efface le contenu ; pas de blocs dans Onglet", () => {
    const { project, ref } = setup();
    let draft = newDraft("horizontal");
    const id = draft.doc.borders[0]!.id;
    draft = setBorderStyle(draft, project, id, "blocks");
    const scene = buildScene(project, draft);
    const slot = scene.slots.find((s) => s.slot.border === id && s.slot.frame)!;
    // Le point est trouvé par un clic sur le quilt.
    const c = slot.slot.poly.reduce((a, p) => ({ x: a.x + p.x / slot.slot.poly.length, y: a.y + p.y / slot.slot.poly.length }), { x: 0, y: 0 });
    expect(slotAtPoint(scene, c)?.slot.key).toBe(slot.slot.key);
    draft = placeBlock(draft, project, [slot.slot.key], ref);
    expect(Object.keys(draft.doc.set)).toEqual([slot.slot.key]);
    const pieces = buildScene(project, draft).pieces.filter((p) => p.owner === slot.slot.key);
    expect(pieces.length).toBeGreaterThan(0);
    // Les pièces du bloc remplissent exactement l'emplacement (le bloc est étiré).
    const area = pieces.reduce((s, p) => s + polygonArea(p.poly), 0);
    expect(area).toBeCloseTo(polygonArea(slot.slot.poly), 6);
    // Ctrl+clic : toute la bordure, pas le centre.
    const all = slotsForClick(buildScene(project, draft), slot, "all");
    expect(all.length).toBeGreaterThan(4);
    expect(all.every((k) => k.startsWith(`r${id}.`))).toBe(true);
    // Changer de style efface.
    const changed = setBorderStyle(draft, project, id, "diamonds");
    expect(Object.keys(changed.doc.set)).toHaveLength(0);
    // Onglet : aucun emplacement de bloc, et placeBlock ne fait rien.
    const mitered = setBorderStyle(draft, project, id, "mitered");
    const ms = buildScene(project, mitered);
    expect(ms.borders.slots.every((s) => !s.frame)).toBe(true);
    expect(placeBlock(mitered, project, [slot.slot.key], ref)).toBe(mitered);
  });

  it("les bordures reçoivent des blocs aussi dans un Custom Set", () => {
    const { project, ref } = setup();
    let draft = newDraft("custom");
    const id = draft.doc.borders[0]!.id;
    const scene = buildScene(project, draft);
    const slot = scene.slots.find((s) => s.slot.border === id && s.slot.frame)!;
    draft = placeBlock(draft, project, [slot.slot.key], ref);
    expect(Object.keys(draft.doc.set)).toEqual([slot.slot.key]);
  });

  it("Garder les bordures actuelles : les réglages restent, le contenu disparaît", () => {
    const { project, ref } = setup();
    let draft = newDraft("horizontal");
    const id = draft.doc.borders[0]!.id;
    draft = setBorderStyle(draft, project, id, "blocks");
    draft = setBorderSize(draft, project, id, "top", 2.5);
    const scene = buildScene(project, draft);
    draft = placeBlock(draft, project, [scene.slots.find((s) => s.slot.border === id && s.slot.frame)!.slot.key], ref);
    const kept = newLayout(draft, "onpoint", true);
    expect(kept.doc.borders).toEqual(draft.doc.borders);
    expect(Object.keys(kept.doc.set)).toHaveLength(0);
    const reset = newLayout(draft, "onpoint", false);
    expect(reset.doc.borders).toHaveLength(1);
    expect(reset.doc.borders[0]).toMatchObject({ style: "longH", sizes: uniformSizes(1) });
    const styled = newLayout(draft, "onpoint", false, "diamonds");
    expect(styled.doc.borders[0]!.style).toBe("diamonds");
  });

  it("changer la disposition garde les blocs de bordure qui existent encore", () => {
    const { project, ref } = setup();
    let draft = newDraft("horizontal");
    const id = draft.doc.borders[0]!.id;
    draft = setBorderStyle(draft, project, id, "blocks");
    const scene = buildScene(project, draft);
    draft = placeBlock(draft, project, [scene.slots.find((s) => s.slot.border === id && s.slot.frame)!.slot.key], ref);
    const resized = setLayout(draft, project, { kind: "horizontal", nh: 3, nv: 3, bw: 6, bh: 6, sw: 0, sh: 0, sashBorder: false });
    expect(Object.keys(resized.doc.set)).toHaveLength(1);
  });

  it("aller-retour du fichier : les bordures sont écrites et relues ; un ancien fichier n'a pas de bordure", () => {
    const { project } = setup();
    let draft = newDraft("horizontal");
    const id = draft.doc.borders[0]!.id;
    draft = setBorderStyle(draft, project, id, "bigLittle");
    draft = setBorderSize(draft, project, id, "left", 2, { all: false, leftRight: true, topBottom: false });
    const item = quiltItemOf(project, draft, "Test");
    const back = parseDoc(JSON.parse(JSON.stringify(item.layout)));
    expect(back?.borders).toEqual(draft.doc.borders);
    const old = JSON.parse(JSON.stringify(docToJson(draft.doc)));
    delete old.borders;
    expect(parseDoc(old)?.borders).toEqual([]);
    // Valeurs absurdes : ramenées dans les bornes ; styles inconnus ignorés.
    const nasty = parseDoc({ ...old, borders: [{ id: "x", style: "nope", sizes: {}, nh: 1, nv: 1 }, { id: "y", style: "blocks", sizes: { left: -4, top: 1e9, right: "a", bottom: 2 }, nh: 1e9, nv: -3 }] });
    expect(nasty?.borders).toHaveLength(1);
    expect(nasty?.borders[0]).toMatchObject({ id: "y", nh: 100, nv: 1 });
    expect(nasty?.borders[0]!.sizes.left).toBe(0);
    expect(nasty?.borders[0]!.sizes.top).toBe(60);
  });
});

describe("bordures automatiques (SPEC §3.9)", () => {
  it("chacune règle la bordure et colore toutes ses pièces ; changer le style les efface", async () => {
    const { AUTO_BORDERS, applyAutoBorder } = await import("../../src/core/quilt/borderpresets");
    expect(AUTO_BORDERS.length).toBeGreaterThanOrEqual(10);
    const { project } = setup();
    for (const preset of AUTO_BORDERS) {
      const draft = newDraft("horizontal");
      const id = draft.doc.borders[0]!.id;
      const next = applyAutoBorder(draft, project, id, preset);
      const border = next.doc.borders[0]!;
      expect(border.style).toBe(preset.style);
      expect(border.sizes).toEqual(uniformSizes(preset.size));
      const slots = buildScene(project, next).borders.slots;
      expect(Object.keys(next.fills).sort()).toEqual(slots.map((s) => s.key).sort());
      expect(border.nh).toBeGreaterThanOrEqual(1);
      // Les autres bordures et le centre ne bougent pas.
      expect(next.doc.set).toEqual({});
      const restyled = setBorderStyle(next, project, id, preset.style === "blocks" ? "diamonds" : "blocks");
      expect(Object.keys(restyled.fills)).toHaveLength(0);
    }
  });
});
