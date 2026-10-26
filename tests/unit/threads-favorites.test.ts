import { describe, expect, it } from "vitest";
import { FUSSY_BIG_STEP, FUSSY_STEP, fussyCut, offsetOf, paintPieces } from "../../src/core/draw/coloring";
import { easyDrawSegments } from "../../src/core/draw/draft";
import { analyzeBlock } from "../../src/core/draw/pieces";
import { DEFAULT_THREAD, applyThread, sectionAt, sectionKey, sectionsOf } from "../../src/core/draw/threads";
import { LIBRARY_BLOCKS, instantiateLibraryBlock } from "../../src/core/library/blocks";
import {
  MAX_ITEMS_PER_STYLE,
  editLibrary,
  newFavoriteLibrary,
  pasteIntoStyle,
  readFavorites,
  removeFromStyle,
  styleItems,
  writeFavorites,
} from "../../src/core/library/favorites";
import { addAsset } from "../../src/core/project/assets";
import { encodePng } from "../../src/core/image/png";
import { createRaster } from "../../src/core/image/raster";
import { fabricToPhoto, makeImageFabric, photoToFabric } from "../../src/core/project/images";
import { emptyNotecard, type Paint, type ThreadItem } from "../../src/core/project/model";
import { readQsp, writeQsp } from "../../src/core/project/qsp";
import { transferItems } from "../../src/core/project/transfer";
import { block, coloring, fabric, projectWith } from "./project-helpers";

function ninePatch() {
  const def = LIBRARY_BLOCKS.find((d) => d.id === "nine-patch");
  if (!def) throw new Error("nine-patch");
  const b = instantiateLibraryBlock(def);
  return { block: b, pieces: analyzeBlock(b.width, b.height, easyDrawSegments(b.drawing) ?? []).pieces };
}

describe("coupe ciblée (Q-5.1)", () => {
  it("décale le tissu d'une pièce par pas de 1/16 et 1/2 po ; sans effet sur un uni", () => {
    const fills: Record<string, Paint> = { a: { kind: "fabric", fabricId: "f" }, b: { kind: "solid", rgb: "#ffffff" } };
    const once = fussyCut(fills, "a", FUSSY_STEP, 0);
    expect(offsetOf(once.a)).toEqual({ x: 0.0625, y: 0 });
    const twice = fussyCut(once, "a", 0, -FUSSY_BIG_STEP);
    expect(offsetOf(twice.a)).toEqual({ x: 0.0625, y: -0.5 });
    expect(fussyCut(fills, "b", 1, 1)).toBe(fills);
    // Revenir à zéro retire le décalage (pas de champ inutile dans le fichier).
    expect(fussyCut(once, "a", -FUSSY_STEP, 0).a).toEqual({ kind: "fabric", fabricId: "f" });
  });

  it("repeindre la pièce avec le même tissu garde son décalage", () => {
    const fills = fussyCut({ a: { kind: "fabric", fabricId: "f" } }, "a", 0.5, 0.5);
    expect(paintPieces(fills, ["a"], { kind: "fabric", fabricId: "f" })).toBe(fills);
  });

  it("le décalage et les fils survivent à l'enregistrement du projet", () => {
    const f = fabric("f1");
    const b = block("b1", [{ id: "c1", fills: { p1: { kind: "fabric", fabricId: "f1", offset: { x: 0.25, y: -1 } } }, threads: { s1: { rgb: "#ff0000", style: "dash", weight: 3 } } }]);
    const project = projectWith({ fabrics: [f], blocks: [b] });
    const back = readQsp(writeQsp(project, new Map())).project;
    expect(back).toEqual(project);
  });

  it("un fichier au style de fil inconnu est refusé", () => {
    const b = block("b1", [{ id: "c1", fills: {}, threads: { s1: { rgb: "#ff0000", style: "zigzag" as "dash", weight: 3 } } }]);
    expect(() => readQsp(writeQsp(projectWith({ blocks: [b] }), new Map()))).toThrow(/style de fil/);
  });
});

describe("fils des coutures (SPEC §5.8)", () => {
  it("un Nine Patch a 24 sections (12 intérieures + 12 sur le contour), aux clés indépendantes du sens", () => {
    const { pieces } = ninePatch();
    const sections = sectionsOf(pieces);
    expect(sections).toHaveLength(24);
    const s = sections[0]?.seg;
    if (!s) throw new Error("section");
    expect(sectionKey({ ...s, a: s.b, b: s.a })).toBe(sectionKey(s));
  });

  it("le pinceau fil change une section ; la bombe fil tout le bloc ; seules les propriétés cochées changent", () => {
    const { pieces } = ninePatch();
    const sections = sectionsOf(pieces);
    const hit = sectionAt(sections, { x: 2, y: 1 }, 0.05);
    expect(hit).not.toBeNull();
    const red = { rgb: "#ff0000", style: "dot" as const, weight: 5 };
    const one = applyThread({}, [hit?.key as string], red, { color: true, style: false, weight: false });
    expect(one[hit?.key as string]).toEqual({ ...DEFAULT_THREAD, rgb: "#ff0000" });
    const all = applyThread(one, sections.map((x) => x.key), red, { color: false, style: true, weight: true });
    expect(Object.keys(all)).toHaveLength(24);
    expect(all[hit?.key as string]).toEqual({ rgb: "#ff0000", style: "dot", weight: 5 });
    expect(Object.values(all).filter((t) => t.rgb === "#ff0000")).toHaveLength(1);
    expect(applyThread(all, [hit?.key as string], red, { color: false, style: false, weight: false })).toBe(all);
  });
});

describe("images du carnet", () => {
  const png = encodePng(createRaster(8, 8, { r: 10, g: 20, b: 30 }), 96);

  it("Copier vers Tissus puis Copier vers Photos réutilisent la même image", () => {
    const store = new Map<string, Uint8Array>();
    const { project, hash } = addAsset(projectWith({}), store, png, "image/png");
    const withPhoto = { ...project, sketchbook: { ...project.sketchbook, photos: [{ id: "ph", card: emptyNotecard("Photo"), asset: hash, ppi: 96 }] } };
    const asFabric = photoToFabric(withPhoto, "ph", "#0a141e");
    expect(asFabric.project.sketchbook.fabrics[0]?.source).toEqual({ kind: "image", asset: hash, ppi: 96 });
    expect(photoToFabric(asFabric.project, "ph", "#0a141e").duplicate).toBe(true);
    expect(Object.keys(asFabric.project.assets)).toEqual([hash]);
  });

  it("un tissu généré copié vers Photos est rendu en PNG à l'échelle réelle", () => {
    const store = new Map<string, Uint8Array>();
    const project = projectWith({ fabrics: [fabric("f1", "#336699")] });
    const r = fabricToPhoto(project, store, "f1");
    const photo = r.project.sketchbook.photos[0];
    expect(photo?.ppi).toBe(96);
    expect(store.get(photo?.asset as string)).toBeDefined();
    expect(readQsp(writeQsp(r.project, store)).project.sketchbook.photos).toHaveLength(1);
  });
});

describe("transfert et Mes favoris (SPEC §8.7)", () => {
  it("un bloc copié emporte ses tissus (et leurs images) ; un tissu identique déjà présent est réutilisé", () => {
    const srcStore = new Map<string, Uint8Array>();
    let src = projectWith({});
    const added = addAsset(src, srcStore, encodePng(createRaster(4, 4, { r: 1, g: 2, b: 3 }), 75), "image/png");
    src = added.project;
    const imgFabric = { ...makeImageFabric(added.hash, 75, "Scan", "#010203"), id: "fi" };
    const plain = fabric("fp", "#123456");
    const b = block("b1", [coloring("c1", { p1: { kind: "fabric", fabricId: "fi" }, p2: { kind: "fabric", fabricId: "fp" }, p3: { kind: "solid", rgb: "#ffffff" } })]);
    src = { ...src, sketchbook: { ...src.sketchbook, fabrics: [imgFabric, plain], blocks: [b] } };

    const targetStore = new Map<string, Uint8Array>();
    const target = projectWith({ fabrics: [{ ...plain, id: "already" }] });
    const r = transferItems(target, targetStore, { project: src, assets: srcStore }, "blocks", ["b1"]);
    expect(r.added).toHaveLength(1);
    const copied = r.project.sketchbook.blocks[0];
    const fills = copied?.colorings[0]?.fills ?? {};
    expect(fills.p2).toEqual({ kind: "fabric", fabricId: "already" });
    const newImg = r.project.sketchbook.fabrics.find((f) => f.source.kind === "image");
    expect(fills.p1).toEqual({ kind: "fabric", fabricId: newImg?.id });
    expect(targetStore.has(added.hash)).toBe(true);
    // Le résultat est un projet valide (références et images résolues).
    expect(readQsp(writeQsp(r.project, targetStore)).project.sketchbook.blocks).toHaveLength(1);
    // Une seconde copie est un doublon.
    expect(transferItems(r.project, targetStore, { project: src, assets: srcStore }, "blocks", ["b1"]).duplicates).toBe(1);
  });

  it("créer, coller, enregistrer, relire, supprimer", () => {
    const threads: ThreadItem[] = ["#ff0000", "#00ff00", "#0000ff"].map((rgb, i) => ({ id: `t${i}`, card: emptyNotecard(`Fil ${i}`), rgb }));
    const source = { project: projectWith({ threads }), assets: new Map<string, Uint8Array>() };
    let lib = newFavoriteLibrary("threads", "Mes fils", 3);
    expect(lib.styles.map((s) => s.name)).toEqual(["Style 1", "Style 2", "Style 3"]);
    lib = pasteIntoStyle(lib, 1, source, ["t0", "t2"]).lib;
    expect(styleItems(lib, 1).map((t) => t.card.name)).toEqual(["Fil 0", "Fil 2"]);

    const back = readFavorites(writeFavorites(lib));
    expect(back.name).toBe("Mes fils");
    expect(back.kind).toBe("threads");
    expect(styleItems(back, 1).map((t) => t.card.name)).toEqual(["Fil 0", "Fil 2"]);

    const removed = removeFromStyle(back, 1, [back.styles[1]?.items[0] as string]);
    expect(styleItems(removed, 1).map((t) => t.card.name)).toEqual(["Fil 2"]);
    expect(removed.content.project.sketchbook.threads).toHaveLength(1);

    const fewer = editLibrary(removed, "Fils", 1);
    expect(fewer.styles).toHaveLength(1);
    expect(fewer.content.project.sketchbook.threads).toHaveLength(0);
  });

  it("un style refuse au-delà de 254 éléments", () => {
    const threads: ThreadItem[] = Array.from({ length: 260 }, (_, i) => ({ id: `t${i}`, card: emptyNotecard(`Fil ${i}`), rgb: "#000000" }));
    const r = pasteIntoStyle(newFavoriteLibrary("threads", "Beaucoup", 1), 0, { project: projectWith({ threads }), assets: new Map() }, threads.map((t) => t.id));
    expect(r.added).toBe(MAX_ITEMS_PER_STYLE);
    expect(r.refused).toBe(6);
  });

  it("des blocs en favoris gardent leurs tissus ; un fichier sans library.json est refusé", () => {
    const f = fabric("f1");
    const b = block("b1", [coloring("c1", { p: { kind: "fabric", fabricId: "f1" } })]);
    const lib = pasteIntoStyle(newFavoriteLibrary("blocks", "Mes blocs", 1), 0, { project: projectWith({ fabrics: [f], blocks: [b] }), assets: new Map() }, ["b1"]).lib;
    const back = readFavorites(writeFavorites(lib));
    expect(back.content.project.sketchbook.fabrics).toHaveLength(1);
    expect(styleItems(back, 0)).toHaveLength(1);
    expect(() => readFavorites(writeQsp(projectWith({}), new Map()))).toThrow(/library\.json/);
  });
});
