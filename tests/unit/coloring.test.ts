import { describe, expect, it } from "vitest";
import {
  displayColor,
  findPaletteEntry,
  paintPieces,
  paletteEntries,
  pruneFills,
  pushRecent,
  samePaint,
  similarPieces,
} from "../../src/core/draw/coloring";
import { easyDrawSegments, fromDrawing, toDrawing } from "../../src/core/draw/draft";
import { analyzeBlock } from "../../src/core/draw/pieces";
import { LIBRARY_BLOCKS, instantiateLibraryBlock } from "../../src/core/library/blocks";
import { addColoredBlock, addLibraryBlock, makeColor } from "../../src/core/project/commands";
import { builtInDefaultProject } from "../../src/core/project/defaults";
import { emptyNotecard, type FabricItem, type Paint, type Project } from "../../src/core/project/model";

const solid = (rgb: string): Paint => ({ kind: "solid", rgb });

function ninePatch() {
  const def = LIBRARY_BLOCKS.find((d) => d.id === "nine-patch");
  if (!def) throw new Error("nine-patch");
  const block = instantiateLibraryBlock(def);
  const pieces = analyzeBlock(block.width, block.height, easyDrawSegments(block.drawing) ?? []).pieces;
  return { block, pieces };
}

describe("pinceau et bombe", () => {
  it("le pinceau colore une pièce ; recolorer avec la même couleur ne change rien", () => {
    const { pieces } = ninePatch();
    const key = pieces[0]?.key as string;
    const once = paintPieces({}, [key], solid("#c62828"));
    expect(once[key]).toEqual(solid("#c62828"));
    expect(paintPieces(once, [key], solid("#C62828"))).toBe(once);
  });

  it("la bombe recolore toutes les pièces de même couleur, et elles seules", () => {
    const { block, pieces } = ninePatch();
    const fills = block.colorings[1]?.fills ?? {};
    // Le Nine Patch couleur : 5 cases foncées, 4 claires.
    const dark = pieces.filter((p) => samePaint(fills[p.key], solid("#14284b")));
    expect(dark).toHaveLength(5);
    const targets = similarPieces(pieces, fills, dark[0]?.key as string);
    expect(targets.sort()).toEqual(dark.map((p) => p.key).sort());
    const sprayed = paintPieces(fills, targets, solid("#f9d71c"));
    for (const p of pieces) {
      const isDark = dark.some((d) => d.key === p.key);
      expect(sprayed[p.key]).toEqual(isDark ? solid("#f9d71c") : fills[p.key]);
    }
  });

  it("la bombe sur une pièce non colorée vise toutes les pièces non colorées", () => {
    const { pieces } = ninePatch();
    const fills = paintPieces({}, [pieces[0]?.key as string], solid("#000000"));
    expect(similarPieces(pieces, fills, pieces[1]?.key as string)).toHaveLength(8);
    expect(similarPieces(pieces, fills, "inconnue")).toEqual([]);
  });

  it("les clés des pièces disparues sont retirées", () => {
    const { pieces } = ninePatch();
    const fills = { ...paintPieces({}, [pieces[0]?.key as string], solid("#000000")), ancienne: solid("#ffffff") };
    expect(Object.keys(pruneFills(fills, pieces))).toEqual([pieces[0]?.key]);
  });
});

describe("pipette et palette", () => {
  const fabric: FabricItem = {
    id: "tissu-1",
    card: emptyNotecard("Pois"),
    source: { kind: "generated", generator: "dots", seed: 1, params: {} },
    averageColor: "#336699",
  };
  const project: Project = (() => {
    const p = builtInDefaultProject();
    return { ...p, sketchbook: { ...p.sketchbook, fabrics: [fabric] } };
  })();

  it("la pipette renvoie la bonne entrée de palette (onglet et élément)", () => {
    const red = project.sketchbook.colors.find((c) => c.rgb === "#c62828");
    expect(findPaletteEntry(project, solid("#C62828"))).toMatchObject({ tab: "colors", id: red?.id });
    expect(findPaletteEntry(project, { kind: "fabric", fabricId: "tissu-1" })).toMatchObject({ tab: "fabrics", id: "tissu-1", rgb: "#336699" });
    expect(findPaletteEntry(project, solid("#123456"))).toBeNull();
    expect(findPaletteEntry(project, undefined)).toBeNull();
  });

  it("les entrées suivent l'ordre du carnet ; un tissu s'affiche avec sa couleur moyenne", () => {
    const colors = paletteEntries(project, "colors");
    expect(colors.map((c) => c.id)).toEqual(project.sketchbook.colors.map((c) => c.id));
    expect(displayColor(project, { kind: "fabric", fabricId: "tissu-1" })).toBe("#336699");
    expect(displayColor(project, { kind: "fabric", fabricId: "disparu" })).toBe("#9e9e9e");
  });

  it("« Récemment utilisés » : en tête, sans doublon, 12 au plus", () => {
    let recent: Paint[] = [];
    for (let i = 0; i < 15; i++) recent = pushRecent(recent, solid(`#0000${i.toString(16).padStart(2, "0")}`));
    recent = pushRecent(recent, solid("#000005"));
    expect(recent).toHaveLength(12);
    expect(recent[0]).toEqual(solid("#000005"));
    expect(recent.filter((p) => samePaint(p, solid("#000005")))).toHaveLength(1);
  });
});

describe("colorations dans le carnet", () => {
  it("un bloc de bibliothèque arrive avec ses deux colorations (« 2 sur 2 »), ou dépilé si le maximum vaut 1", () => {
    const def = LIBRARY_BLOCKS.find((d) => d.id === "ohio-star");
    if (!def) throw new Error("ohio-star");
    const p2 = builtInDefaultProject(2);
    const r2 = addLibraryBlock(p2, "blocks", instantiateLibraryBlock(def));
    expect(r2.project.sketchbook.blocks).toHaveLength(1);
    expect(r2.project.sketchbook.blocks[0]?.colorings).toHaveLength(2);
    // Un second ajout du même bloc est un doublon.
    expect(addLibraryBlock(r2.project, "blocks", instantiateLibraryBlock(def)).duplicates).toBe(1);

    const r1 = addLibraryBlock(builtInDefaultProject(1), "blocks", instantiateLibraryBlock(def));
    expect(r1.project.sketchbook.blocks.map((b) => b.colorings.length)).toEqual([1, 1]);
  });

  it("« Modifier » puis recolorer empile la coloration, même si les identifiants des segments ont changé", () => {
    const def = LIBRARY_BLOCKS.find((d) => d.id === "four-patch");
    if (!def) throw new Error("four-patch");
    const project = builtInDefaultProject(3);
    const added = addLibraryBlock(project, "blocks", instantiateLibraryBlock(def));
    const block = added.project.sketchbook.blocks[0];
    if (!block) throw new Error("bloc");
    const draft = fromDrawing(block.drawing, block.width, block.height, [], block.colorings[1]?.fills);
    const pieces = analyzeBlock(draft.width, draft.height, draft.segments).pieces;
    const fills = paintPieces(draft.fills, [pieces[0]?.key as string], solid("#26a69a"));
    const result = addColoredBlock(added.project, {
      list: "blocks",
      sourceBlockId: block.id,
      card: emptyNotecard("x"),
      width: draft.width,
      height: draft.height,
      drawing: toDrawing(draft),
      coloring: { id: "c-neuve", fills: { ...fills } },
    });
    expect(result.status).toBe("stacked");
    if (result.status === "stacked") expect(result.position).toBe(3);
  });

  it("une couleur ajoutée au carnet devient une entrée de la palette", () => {
    const project = builtInDefaultProject();
    const color = makeColor("#abcdef", "Essai");
    const next = { ...project, sketchbook: { ...project.sketchbook, colors: [...project.sketchbook.colors, color] } };
    expect(findPaletteEntry(next, solid("#abcdef"))?.id).toBe(color.id);
  });
});
