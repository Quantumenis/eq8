import { describe, expect, it } from "vitest";
import { newProject } from "../../src/core/project/defaults";
import { addToSketchbook } from "../../src/core/project/commands";
import { readQsp, writeQsp } from "../../src/core/project/qsp";
import { validateProject } from "../../src/core/project/validate";
import { instantiateLibraryBlock, LIBRARY_BLOCKS } from "../../src/core/library/blocks";
import type { Paint, Project } from "../../src/core/project/model";
import {
  IDENTITY_D4,
  SYMMETRY_STATES,
  composeD4,
  newDraft,
  parseDoc,
  placementsOf,
  quiltItemOf,
  symmetryAt,
  type Dihedral,
  type QuiltDraft,
} from "../../src/core/quilt/doc";
import { applySymmetry, orientationOf, placeBlock, setLayout, slotsForClick, eraseSlots, turnSlots, addItem, stackItems, alignItems, centerItems, sameSize } from "../../src/core/quilt/ops";
import {
  advancedRotation,
  alignedRotation,
  brushTargets,
  clickMode,
  fussyCutPiece,
  paintPieces,
  pipetteColor,
  pipetteFabric,
  piecesTouchedBy,
  randomize,
  rotateFabric,
  sampleStroke,
  shiftColor,
  simpleRotation,
  sprayTargets,
  swapTargets,
} from "../../src/core/quilt/paintops";
import { buildScene, pieceAtPoint, slotAtPoint } from "../../src/core/quilt/scene";
import { QuiltEditor } from "../../src/core/quilt/editor";
import { hexToRgb, rgbToHsl } from "../../src/core/color/color";

function setup(blockId = "drunkards-path") {
  const loaded = newProject(null, 2);
  let project: Project = loaded.project;
  const def = LIBRARY_BLOCKS.find((d) => d.id === blockId)!;
  const block = instantiateLibraryBlock(def);
  project = addToSketchbook(project, "blocks", block).project;
  const color = block.colorings[1]!.id; // coloration 2 : en couleur
  return { project, assets: loaded.assets, block, ref: { blockId: block.id, coloringId: color } };
}

const solid = (rgb: string): Paint => ({ kind: "solid", rgb });

describe("pose des blocs (SPEC §4.2)", () => {
  it("Ctrl+clic remplit tous les emplacements ; Alt+clic, un sur deux", () => {
    const { project, ref } = setup();
    let draft = newDraft("horizontal"); // 4 × 5
    const scene0 = buildScene(project, draft);
    const clicked = scene0.slots[0]!;
    const all = slotsForClick(scene0, clicked, "all");
    expect(all).toHaveLength(20);
    draft = placeBlock(draft, project, all, ref);
    expect(Object.keys(draft.doc.set)).toHaveLength(20);

    let alt = placeBlock(newDraft("horizontal"), project, slotsForClick(scene0, clicked, "alternate"), ref);
    expect(Object.keys(alt.doc.set)).toHaveLength(10);
    // En damier : aucune paire d'emplacements voisins n'est remplie.
    const rows = buildScene(project, alt).slots.filter((s) => !s.slot.border);
    for (const s of rows) {
      const right = rows.find((o) => o.slot.row === s.slot.row && o.slot.col === s.slot.col + 1);
      if (right) expect(!!s.placed).not.toBe(!!right.placed);
    }
    alt = placeBlock(alt, project, ["b0_0"], ref);
    expect(Object.keys(alt.doc.set)).toHaveLength(10);
  });

  it("poser un bloc remplace le précédent et retire ses retouches de couleur", () => {
    const { project, ref } = setup();
    let draft = placeBlock(newDraft(), project, ["b0_0"], ref);
    const scene = buildScene(project, draft);
    const piece = scene.pieces.find((p) => p.owner === "b0_0")!;
    draft = paintPieces(draft, [piece], solid("#112233"));
    expect(Object.keys(draft.fills)).toEqual([piece.key]);
    const other = setup("nine-patch");
    const project2 = addToSketchbook(project, "blocks", other.block).project;
    draft = placeBlock(draft, project2, ["b0_0"], { blockId: other.block.id, coloringId: "" });
    expect(draft.fills).toEqual({});
    expect(draft.doc.set["b0_0"]!.blockId).toBe(other.block.id);
  });

  it("un emplacement vide se colore par sa clé ; effacer le bloc le rend vide", () => {
    const { project, ref } = setup();
    let draft = newDraft();
    const scene = buildScene(project, draft);
    draft = paintPieces(draft, [scene.pieces[0]!], solid("#abcdef"));
    expect(draft.fills["b0_0"]).toEqual(solid("#abcdef"));
    draft = placeBlock(draft, project, ["b0_0"], ref);
    expect(draft.fills["b0_0"]).toBeUndefined();
    draft = eraseSlots(draft, ["b0_0"]);
    expect(draft.doc.set["b0_0"]).toBeUndefined();
  });

  it("changer la disposition garde les blocs des emplacements qui existent encore", () => {
    const { project, ref } = setup();
    let draft = placeBlock(newDraft(), project, ["b0_0", "b4_3"], ref);
    const layout = draft.doc.layout;
    if (layout.kind !== "horizontal") throw new Error();
    draft = setLayout(draft, project, { ...layout, nh: 2, nv: 2 });
    expect(Object.keys(draft.doc.set)).toEqual(["b0_0"]);
  });

  it("les motifs ne se posent pas au calque 1 des dispositions standard", () => {
    const { project } = setup();
    const motif = { ...setup("nine-patch").block };
    const withMotif = addToSketchbook(project, "motifs", motif).project;
    const draft = placeBlock(newDraft(), withMotif, ["b0_0"], { blockId: motif.id, coloringId: "" });
    expect(draft.doc.set).toEqual({});
  });
});

describe("rotation, miroir et Symétrie (SPEC §4.9, §4.12)", () => {
  it("Pivoter : quatre clics reviennent au départ ; Miroir : deux clics aussi", () => {
    const { project, ref } = setup();
    const d0 = placeBlock(newDraft(), project, ["b0_0"], ref);
    let d = d0;
    for (let i = 0; i < 4; i++) d = turnSlots(d, ["b0_0"], "rotate");
    expect(d.doc.set["b0_0"]).toEqual(d0.doc.set["b0_0"]);
    d = turnSlots(turnSlots(d0, ["b0_0"], "mirror"), ["b0_0"], "mirror");
    expect(d.doc.set["b0_0"]).toEqual(d0.doc.set["b0_0"]);
    expect(turnSlots(d0, ["b0_0"], "rotate").doc.set["b0_0"]!.rot).toBe(1);
  });

  it("le groupe du carré : composition cohérente", () => {
    const r1: Dihedral = { rot: 1, flip: false };
    expect(composeD4(r1, composeD4(r1, composeD4(r1, r1)))).toEqual(IDENTITY_D4);
    const f: Dihedral = { rot: 0, flip: true };
    expect(composeD4(f, f)).toEqual(IDENTITY_D4);
    // Un miroir puis un quart de tour n'est pas un quart de tour puis un miroir.
    expect(composeD4(r1, f)).not.toEqual(composeD4(f, r1));
  });

  it("Symétrie : 16 états distincts sur un bloc asymétrique, le 17ᵉ égale l'état initial", () => {
    const { project, ref } = setup(); // Drunkard's Path : asymétrique
    const all = Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => `b${r}_${c}`)).flat();
    const base = placeBlock(newDraft(), project, all, ref);
    // Une grille 4 × 5 : de quoi voir les deux parités.
    const scene = buildScene(project, base);
    const origin = orientationOf(base);
    const seen = new Set<string>();
    const snapshot = (d: QuiltDraft) =>
      JSON.stringify(
        scene.slots.map((s) => {
          const p = d.doc.set[s.slot.key];
          return p ? [p.rot, p.flip] : null;
        }),
      );
    seen.add(snapshot(base));
    let d = base;
    for (let n = 1; n <= 16; n++) {
      d = applySymmetry(d, origin, scene, n);
      seen.add(snapshot(d));
    }
    expect(seen.size).toBe(17); // l'origine + 16 états tous différents
    d = applySymmetry(d, origin, scene, 17);
    expect(snapshot(d)).toBe(snapshot(base));
    expect(SYMMETRY_STATES).toHaveLength(16);
    expect(symmetryAt(17)).toEqual([IDENTITY_D4, IDENTITY_D4]);
    expect(symmetryAt(34)).toEqual([IDENTITY_D4, IDENTITY_D4]);
  });
});

describe("coloration au quilt (SPEC §5.2-5.4)", () => {
  it("pinceau avec Ctrl : la pièce est colorée dans tous les blocs identiques ; Alt : un sur deux", () => {
    const { project, ref } = setup();
    const slots = Array.from({ length: 3 }, (_, r) => Array.from({ length: 3 }, (_, c) => `b${r}_${c}`)).flat();
    let draft = placeBlock(newDraft(), project, slots, ref);
    const scene = buildScene(project, draft);
    const piece = scene.pieces.find((p) => p.owner === "b0_0" && p.pieceKey)!;
    const ctrl = brushTargets(scene, piece, clickMode(true, false));
    expect(ctrl).toHaveLength(9); // 3 × 3 blocs : la même pièce dans chacun des blocs identiques
    expect(ctrl.every((p) => p.pieceKey === piece.pieceKey)).toBe(true);
    draft = paintPieces(draft, ctrl, solid("#00ff00"));
    expect(Object.keys(draft.fills)).toHaveLength(9);
    const alt = brushTargets(scene, piece, clickMode(false, true));
    expect(alt).toHaveLength(5); // le damier des blocs : (0,0), (0,2), (1,1), (2,0), (2,2)
    expect(brushTargets(scene, piece, "one")).toEqual([piece]);
  });

  it("bombe : les pièces semblables du bloc, du calque (Ctrl) ou des blocs alternés (Alt)", () => {
    const { project, ref } = setup();
    const draft = placeBlock(newDraft(), project, ["b0_0", "b0_1", "b1_0", "b1_1"], ref);
    const scene = buildScene(project, draft);
    const piece = scene.pieces.find((p) => p.owner === "b0_0" && p.paint)!;
    const same = sprayTargets(scene, piece, "one");
    expect(same.length).toBeGreaterThan(0);
    expect(same.every((p) => p.owner === "b0_0")).toBe(true);
    const layer = sprayTargets(scene, piece, "all");
    expect(layer.length).toBeGreaterThan(same.length);
    expect(layer.every((p) => JSON.stringify(p.paint) === JSON.stringify(piece.paint))).toBe(true);
    const alt = sprayTargets(scene, piece, "alternate");
    expect(alt.length).toBeLessThan(layer.length);
  });

  it("échange : toute pièce de cette couleur, sur tous les calques", () => {
    const { project, ref } = setup();
    let draft = placeBlock(newDraft(), project, ["b0_0", "b3_3"], ref);
    const scene = buildScene(project, draft);
    const piece = scene.pieces.find((p) => p.owner === "b0_0" && p.paint?.kind === "solid")!;
    const swapped = swapTargets(scene, piece);
    expect(swapped.some((p) => p.owner === "b3_3")).toBe(true);
    draft = paintPieces(draft, swapped, solid("#010203"));
    const after = buildScene(project, draft);
    expect(swapTargets(after, after.pieces.find((p) => p.key === piece.key)!)).toHaveLength(swapped.length);
  });

  it("les pinceaux Ligne, Rectangle et Ovale colorent toutes les pièces touchées", () => {
    const { project } = setup();
    const draft = newDraft("onepatch" as never);
    void draft;
    const d = { ...newDraft("horizontal") };
    const scene = buildScene(project, d);
    // Une ligne horizontale à y = 4 traverse les 4 emplacements de la première ligne.
    const touched = piecesTouchedBy(scene, sampleStroke("line", [{ x: 0.1, y: 4 }, { x: 31.9, y: 4 }]), 1);
    expect(touched.map((p) => p.key).sort()).toEqual(["b0_0", "b0_1", "b0_2", "b0_3"]);
    // Un rectangle en contour touche toutes les pièces de son pourtour, pas celles du dedans.
    const rect = piecesTouchedBy(scene, sampleStroke("rect", [{ x: 4, y: 4 }, { x: 28, y: 36 }]), 1);
    expect(rect.length).toBeGreaterThan(4);
    expect(rect.some((p) => p.key === "b2_1")).toBe(false);
    const oval = piecesTouchedBy(scene, sampleStroke("oval", [{ x: 2, y: 2 }, { x: 30, y: 38 }]), 1);
    expect(oval.length).toBeGreaterThan(4);
  });

  it("pipettes : le tissu ou l'uni le plus proche de la couleur moyenne", () => {
    const { project } = setup();
    const avg = project.sketchbook.fabrics[3]!.averageColor;
    expect(pipetteFabric(project, solid(avg))).toEqual({ kind: "fabric", fabricId: project.sketchbook.fabrics[3]!.id });
    const nearest = pipetteColor(project, { kind: "fabric", fabricId: project.sketchbook.fabrics[0]!.id });
    expect(nearest?.kind).toBe("solid");
    expect(pipetteColor(project, solid("#123456"))).toEqual(solid("#123456"));
  });
});

describe("rotation du tissu (SPEC §5.6) et coupe ciblée", () => {
  it("avancée : départ 10°, n = 8 donne 55, 100, 145…", () => {
    let a = 0;
    const seq: number[] = [];
    for (let i = 0; i < 3; i++) {
      a = advancedRotation(a, 10, 8);
      seq.push(a);
    }
    expect(seq).toEqual([55, 100, 145]);
  });

  it("avancée : n = 6 depuis 0 donne 60, 120, 180", () => {
    let a = 0;
    const seq: number[] = [];
    for (let i = 0; i < 3; i++) {
      a = advancedRotation(a, 0, 6);
      seq.push(a);
    }
    expect(seq).toEqual([60, 120, 180]);
  });

  it("simple : +90° par clic, quatre clics = tour complet", () => {
    let a = 0;
    for (let i = 0; i < 4; i++) a = simpleRotation(a);
    expect(a).toBe(0);
    expect(simpleRotation(270)).toBe(0);
  });

  it("une pièce tissée : la rotation et la coupe ciblée s'enregistrent et survivent à l'aller-retour", () => {
    const { project, assets, ref } = setup();
    const fabric = project.sketchbook.fabrics[0]!;
    let draft = placeBlock(newDraft(), project, ["b0_0"], ref);
    let scene = buildScene(project, draft);
    const piece = scene.pieces.find((p) => p.owner === "b0_0")!;
    draft = paintPieces(draft, [piece], { kind: "fabric", fabricId: fabric.id });
    scene = buildScene(project, draft);
    draft = rotateFabric(draft, [scene.pieces.find((p) => p.key === piece.key)!], (_, cur) => simpleRotation(cur));
    expect(draft.fills[piece.key]).toEqual({ kind: "fabric", fabricId: fabric.id, rotation: 90 });
    scene = buildScene(project, draft);
    draft = fussyCutPiece(draft, scene.pieces.find((p) => p.key === piece.key)!, 1, 0);
    const paint = draft.fills[piece.key] as Extract<Paint, { kind: "fabric" }>;
    expect(paint.rotation).toBe(90);
    // Le tissu est tourné de 90° : un décalage de 1 po vers la droite est un décalage vertical dans le repère du tissu.
    expect(paint.offset?.x ?? 0).toBeCloseTo(0, 6);
    expect(Math.abs(paint.offset?.y ?? 0)).toBeCloseTo(1, 6);
    // Le projet qui porte ce quilt reste valide, et le fichier se relit identique.
    const withQuilt = addToSketchbook(project, "quilts", quiltItemOf(project, draft, "Q")).project;
    expect(() => validateProject(withQuilt)).not.toThrow();
    const back = readQsp(writeQsp(withQuilt, assets));
    expect(back.project.sketchbook.quilts[0]!.fills[piece.key]).toEqual(paint);
  });

  it("aligner sur un bord : le tissu suit la plus longue arête", () => {
    const { project } = setup("half-square-triangle");
    const { ref } = setup("half-square-triangle");
    const p2 = addToSketchbook(project, "blocks", instantiateLibraryBlock(LIBRARY_BLOCKS.find((d) => d.id === "half-square-triangle")!)).project;
    const block = p2.sketchbook.blocks.at(-1)!;
    const draft = placeBlock(newDraft(), p2, ["b0_0"], { blockId: block.id, coloringId: "" });
    const scene = buildScene(p2, draft);
    const piece = scene.pieces.find((p) => p.owner === "b0_0")!;
    void ref;
    // Un triangle rectangle : la plus longue arête est l'hypoténuse (45° ou −45°).
    const angle = alignedRotation(piece, 0)!;
    expect([45, 135, 225, 315]).toContain(Math.round(angle));
    expect(alignedRotation(piece, 1, 1)).not.toBeNull();
  });
});

describe("outil Aléatoire (SPEC §5.15)", () => {
  const hueOf = (hex: string) => rgbToHsl(hexToRgb(hex)).h;

  it("la teinte +40 répétée tourne en boucle (circulaire)", () => {
    let c = "#ff0000";
    const seen: number[] = [];
    for (let i = 0; i < 7; i++) {
      c = shiftColor(c, 40, 0, 0);
      seen.push(Math.round(hueOf(c)));
    }
    // +40 sur 240 = +60° : 60, 120, 180, 240, 300, 0 (360), 60…
    expect(seen).toEqual([60, 120, 180, 240, 300, 0, 60]);
  });

  it("la saturation −20 répétée sature à 0 ; la luminosité sature aussi", () => {
    let c = "#cc3344";
    for (let i = 0; i < 20; i++) c = shiftColor(c, 0, -20, 0);
    expect(rgbToHsl(hexToRgb(c)).s).toBe(0);
    let d = "#cc3344";
    for (let i = 0; i < 20; i++) d = shiftColor(d, 0, 0, 20);
    expect(d).toBe("#ffffff");
    let e = "#cc3344";
    for (let i = 0; i < 20; i++) e = shiftColor(e, 0, 0, -20);
    expect(e).toBe("#000000");
  });

  it("la correspondance à tolérance 0 ne remplace que les couleurs identiques", () => {
    const { project } = setup();
    const exact = project.sketchbook.colors[2]!.rgb;
    let draft = newDraft();
    const scene = buildScene(project, draft);
    draft = paintPieces(draft, [scene.pieces[0]!], solid(exact));
    draft = paintPieces(draft, [scene.pieces[1]!], solid("#123457"));
    // Un tissu dont la couleur moyenne n'est pas un uni du carnet.
    const odd = project.sketchbook.fabrics.find((f) => !project.sketchbook.colors.some((c) => c.rgb === f.averageColor))!;
    draft = paintPieces(draft, [scene.pieces[2]!], { kind: "fabric", fabricId: odd.id });
    const s2 = buildScene(project, draft);
    const out = randomize(draft, s2, project, { kind: "matchColors", tolerance: 0 });
    // Seule la pièce dont l'uni existe déjà dans le carnet est réécrite (et identique) ; les autres sont intactes.
    expect(out.fills[scene.pieces[0]!.key]).toEqual(solid(exact));
    expect(out.fills[scene.pieces[1]!.key]).toEqual(solid("#123457"));
    expect(out.fills[scene.pieces[2]!.key]!.kind).toBe("fabric");
    const loose = randomize(draft, s2, project, { kind: "matchColors", tolerance: 500 });
    expect(project.sketchbook.colors.map((c) => c.rgb)).toContain((loose.fills[scene.pieces[1]!.key] as { rgb: string }).rgb);
    expect(loose.fills[scene.pieces[2]!.key]!.kind).toBe("solid");
    const fabrics = randomize(draft, s2, project, { kind: "matchFabrics", tolerance: 500 });
    expect(fabrics.fills[scene.pieces[0]!.key]!.kind).toBe("fabric");
  });

  it("les zones non colorées ne sont jamais touchées ; le décalage convertit les tissus en unis", () => {
    const { project } = setup();
    let draft = newDraft();
    const scene = buildScene(project, draft);
    draft = paintPieces(draft, [scene.pieces[0]!], { kind: "fabric", fabricId: project.sketchbook.fabrics[0]!.id });
    const out = randomize(draft, buildScene(project, draft), project, { kind: "shift", hue: 0, saturation: 0, lightness: 0 });
    expect(Object.keys(out.fills)).toEqual([scene.pieces[0]!.key]);
    expect(out.fills[scene.pieces[0]!.key]).toEqual({ kind: "solid", rgb: project.sketchbook.fabrics[0]!.averageColor });
  });

  it("aléatoire : des unis du carnet, sans doublon tant que possible, déterministe selon la graine", () => {
    const { project } = setup();
    let draft = newDraft();
    const scene = buildScene(project, draft);
    const colors = project.sketchbook.colors.map((c) => c.rgb);
    const pieces = scene.pieces.slice(0, 5);
    pieces.forEach((p, i) => (draft = paintPieces(draft, [p], solid(`#0000${(i + 1).toString(16).padStart(2, "0")}`))));
    const a = randomize(draft, buildScene(project, draft), project, { kind: "random", seed: 7 });
    const b = randomize(draft, buildScene(project, draft), project, { kind: "random", seed: 7 });
    expect(a.fills).toEqual(b.fills);
    const used = pieces.map((p) => (a.fills[p.key] as { rgb: string }).rgb);
    expect(new Set(used).size).toBe(5);
    for (const u of used) expect(colors).toContain(u);
  });
});

describe("éléments libres (SPEC §4.10-4.14)", () => {
  it("Custom Set : poser, aligner, centrer, mêmes tailles, empiler", () => {
    const { project, ref } = setup();
    let draft = newDraft("custom");
    const add = (x: number, y: number) => {
      const r = addItem(draft, project, { layer: 1, ref, x, y, w: 6, h: 6 });
      draft = r.draft;
      return r.id!;
    };
    const a = add(0, 0);
    const b = add(10, 5);
    const c = add(20, 9);
    expect(draft.doc.items).toHaveLength(3);
    draft = alignItems(draft, [a, b, c], "left");
    expect(draft.doc.items.map((i) => i.x)).toEqual([0, 0, 0]);
    draft = alignItems(draft, [a, b, c], "top");
    expect(draft.doc.items.map((i) => i.y)).toEqual([0, 0, 0]);
    draft = centerItems(draft, [b], "both");
    expect(draft.doc.items[1]!.x).toBeCloseTo((48 - 6) / 2, 9);
    expect(draft.doc.items[1]!.y).toBeCloseTo((60 - 6) / 2, 9);
    draft = { ...draft, doc: { ...draft.doc, items: draft.doc.items.map((i) => (i.id === c ? { ...i, w: 12, h: 3 } : i)) } };
    draft = sameSize(draft, [a, c], "both");
    expect(draft.doc.items.find((i) => i.id === c)!.w).toBeCloseTo(6, 9);
    expect(draft.doc.items.find((i) => i.id === c)!.h).toBeCloseTo(6, 9);
    draft = stackItems(draft, [a], "front");
    expect(draft.doc.items.at(-1)!.id).toBe(a);
    draft = stackItems(draft, [a], "back");
    expect(draft.doc.items[0]!.id).toBe(a);
    // Un bloc posé librement n'est pas permis au calque 1 d'une disposition standard.
    expect(addItem(newDraft("horizontal"), project, { layer: 1, ref, x: 0, y: 0 }).id).toBeNull();
    expect(addItem(newDraft("horizontal"), project, { layer: 2, ref, x: 0, y: 0 }).id).not.toBeNull();
  });

  it("une pièce d'un bloc pivoté de 45° est cliquable à sa place", () => {
    const { project, ref } = setup("nine-patch");
    let draft = newDraft("custom");
    const r = addItem(draft, project, { layer: 1, ref, x: 10, y: 10, w: 10, h: 10 });
    draft = r.draft;
    draft = { ...draft, doc: { ...draft.doc, items: draft.doc.items.map((i) => ({ ...i, angle: 45 })) } };
    const scene = buildScene(project, draft);
    // Le centre du bloc (15, 15) est dans la pièce centrale ; (10.5, 10.5) est hors du losange.
    expect(pieceAtPoint(scene, { x: 15, y: 15 })).not.toBeNull();
    expect(pieceAtPoint(scene, { x: 10.2, y: 10.2 })).toBeNull();
    expect(slotAtPoint(scene, { x: 15, y: 15 })).toBeNull();
  });
});

describe("le quilt dans le projet", () => {
  it("l'enregistrement et la relecture d'un quilt posé et coloré", () => {
    const { project, ref } = setup();
    let draft = placeBlock(newDraft("onpoint" as never), project, [], ref);
    draft = setLayout(newDraft(), project, defaultLayoutOnPoint());
    const scene = buildScene(project, draft);
    const slots = slotsForClick(scene, scene.slots.find((s) => s.slot.role === "block")!, "all");
    draft = placeBlock(draft, project, slots, ref);
    const item = quiltItemOf(project, draft, "Sur la pointe");
    expect(item.placements).toEqual([ref]);
    const withQuilt = addToSketchbook(project, "quilts", item).project;
    validateProject(withQuilt);
    const doc = parseDoc(withQuilt.sketchbook.quilts[0]!.layout)!;
    expect(doc).toEqual(draft.doc);
    expect(placementsOf(withQuilt, doc)).toEqual(item.placements);
  });

  it("un fichier abîmé : la disposition illisible est refusée, les champs douteux sont ramenés", () => {
    expect(parseDoc(null)).toBeNull();
    expect(parseDoc({ v: 1, layout: { kind: "inconnue" }, set: {}, items: [] })).toBeNull();
    const doc = parseDoc({ v: 1, layout: { kind: "horizontal", nh: 9999, nv: -4 }, set: { a: { blockId: "x", rot: 7, flip: 1 } }, items: [{ id: "i", blockId: "x", layer: 9, w: -4 }] });
    expect(doc?.layout.kind).toBe("horizontal");
    expect((doc!.layout as { nh: number }).nh).toBe(100);
    expect(doc!.set["a"]).toEqual({ blockId: "x", coloringId: "", rot: 3, flip: false });
    expect(doc!.items[0]!.layer).toBe(1);
    expect(doc!.items[0]!.w).toBeGreaterThan(0);
  });

  it("l'éditeur de quilt : annuler et rétablir chaque pose", () => {
    const { project, ref } = setup();
    const editor = new QuiltEditor();
    editor.execute("Poser", (d) => placeBlock(d, project, ["b0_0"], ref));
    editor.execute("Poser", (d) => placeBlock(d, project, ["b0_1"], ref));
    expect(Object.keys(editor.draft.doc.set)).toHaveLength(2);
    editor.undo();
    expect(Object.keys(editor.draft.doc.set)).toEqual(["b0_0"]);
    editor.redo();
    expect(Object.keys(editor.draft.doc.set)).toHaveLength(2);
    // Une commande sans effet n'est pas une étape d'annulation.
    expect(editor.execute("Rien", (d) => placeBlock(d, project, ["b0_0"], ref))).toBe(false);
  });
});

function defaultLayoutOnPoint() {
  return { kind: "onpoint" as const, style: 1 as const, nh: 3, nv: 3, b: 10, s: 1.5 };
}
