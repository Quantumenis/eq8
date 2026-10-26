import { describe, expect, it } from "vitest";
import { contentOfDrawing } from "../../src/core/draw/content";
import { LIBRARY_ENTRIES, builtEntry, instantiateEntry, libraryEntryTree } from "../../src/core/library/extra";
import { addLibraryBlock } from "../../src/core/project/commands";
import { emptyProject } from "../../src/core/project/model";

describe("bibliothèque intégrée complète (M8)", () => {
  it("compte une quarantaine d'éléments, avec des identifiants uniques", () => {
    expect(LIBRARY_ENTRIES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(LIBRARY_ENTRIES.map((e) => e.id)).size).toBe(LIBRARY_ENTRIES.length);
    const lists = new Set(LIBRARY_ENTRIES.map((e) => e.list));
    expect(lists).toEqual(new Set(["blocks", "motifs", "stencils"]));
    expect(libraryEntryTree().length).toBeGreaterThanOrEqual(7);
  });

  it("chaque élément a un dessin valide, dans son bloc, sans auto-intersection", () => {
    for (const e of LIBRARY_ENTRIES) {
      const b = builtEntry(e);
      const content = contentOfDrawing(b.drawing, e.width, e.height);
      expect(content.pieces.length + content.strands.length, e.id).toBeGreaterThan(0);
      expect(content.issues, e.id).toEqual([]);
      for (const p of content.pieces) {
        expect(p.bounds.x0, e.id).toBeGreaterThanOrEqual(-1e-6);
        expect(p.bounds.y0, e.id).toBeGreaterThanOrEqual(-1e-6);
        expect(p.bounds.x1, e.id).toBeLessThanOrEqual(e.width + 1e-6);
        expect(p.bounds.y1, e.id).toBeLessThanOrEqual(e.height + 1e-6);
        expect(p.area, e.id).toBeGreaterThan(1e-4);
      }
      // Les colorations couvrent toutes les pièces.
      for (const c of b.colorings) for (const p of content.pieces) expect(c.fills[p.key], `${e.id} ${p.key}`).toBeDefined();
      if (e.list === "stencils") expect(b.colorings).toHaveLength(0);
      else expect(b.colorings).toHaveLength(2);
    }
  });

  it("les blocs PolyDraw remplissent le bloc sans recouvrement", () => {
    for (const id of ["lemoyne-star", "dresden-plate"]) {
      const e = LIBRARY_ENTRIES.find((x) => x.id === id)!;
      const content = contentOfDrawing(builtEntry(e).drawing, e.width, e.height);
      expect(content.coverage, id).toBeCloseTo(1, 6);
      expect(content.overlap, id).toBe(false);
      const sum = content.pieces.reduce((s, p) => s + p.area, 0);
      expect(sum, id).toBeCloseTo(e.width * e.height, 5);
    }
    const star = LIBRARY_ENTRIES.find((x) => x.id === "lemoyne-star")!;
    expect(contentOfDrawing(builtEntry(star).drawing, 8, 8).pieces).toHaveLength(16);
    const plate = LIBRARY_ENTRIES.find((x) => x.id === "dresden-plate")!;
    expect(contentOfDrawing(builtEntry(plate).drawing, 8, 8).pieces).toHaveLength(21);
  });

  it("un bloc d'applique a un fond ; un motif n'en a pas ; un pochoir a des fils ou des contours", () => {
    const heart = LIBRARY_ENTRIES.find((x) => x.id === "applique-heart")!;
    const hc = contentOfDrawing(builtEntry(heart).drawing, 6, 6);
    expect(hc.pieces[0]?.key).toBe("bg");
    expect(hc.pieces).toHaveLength(2);
    const motif = LIBRARY_ENTRIES.find((x) => x.id === "motif-heart")!;
    expect(contentOfDrawing(builtEntry(motif).drawing, 6, 6).pieces).toHaveLength(1);
    const feather = LIBRARY_ENTRIES.find((x) => x.id === "stencil-feather")!;
    expect(contentOfDrawing(builtEntry(feather).drawing, 8, 8).strands.length).toBeGreaterThan(10);
    const butterfly = LIBRARY_ENTRIES.find((x) => x.id === "applique-butterfly")!;
    expect(contentOfDrawing(builtEntry(butterfly).drawing, 6, 6).strands).toHaveLength(2);
  });

  it("l'élément arrive dans la liste du carnet qui lui correspond", () => {
    let project = emptyProject();
    for (const id of ["applique-heart", "motif-star", "stencil-rosette", "nine-patch"]) {
      const made = instantiateEntry(LIBRARY_ENTRIES.find((x) => x.id === id)!);
      project = addLibraryBlock(project, made.list, made.item).project;
    }
    expect(project.sketchbook.blocks).toHaveLength(2);
    expect(project.sketchbook.motifs).toHaveLength(1);
    expect(project.sketchbook.stencils).toHaveLength(1);
  });
});
