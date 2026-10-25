import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { migrateProject } from "../../src/core/project/migrate";
import { FORMAT_VERSION } from "../../src/core/project/model";
import { readQsp } from "../../src/core/project/qsp";
import { ProjectFormatError, validateProject } from "../../src/core/project/validate";

/** Un fichier de la version 0 (ébauche interne antérieure au format publié). */
const V0 = {
  formatVersion: 0,
  colors: [
    { id: "col-1", name: "Rouge vif", notes: "pour les étoiles", color: "#FF0000" },
    { id: "col-2", name: "Bleu court", color: "#0af" },
  ],
  threads: [{ id: "th-1", name: "Fil doré", color: "#C9A227" }],
  fabrics: [{ id: "fab-1", name: "Uni bleu", notes: "n°1", color: "#1E66C8" }],
  blocks: [
    {
      id: "blk-1",
      name: "Ohio Star",
      notes: "bloc de 9 pièces",
      size: 9,
      drawing: { lines: [[0, 0, 9, 9]] },
      colorings: [{ id: "cl-1", fills: { "0": "#FF0000", "1": "#FFFFFF" } }],
    },
  ],
  motifs: [{ id: "mot-1", name: "Cœur", size: 4, colorings: [] }],
  quilts: [
    {
      id: "q-1",
      name: "Mon premier quilt",
      notes: "à finir",
      layout: { cols: 3, rows: 3 },
      blocks: [{ block: "blk-1", coloring: "cl-1" }],
      fills: { "bordure": "#102030" },
    },
  ],
  embroideries: [{ id: "emb-1", name: "Fleur", content: { points: [1, 2] } }],
};

describe("migration du format", () => {
  it("v0 → v1 sans perte", () => {
    const project = validateProject(migrateProject(V0));
    expect(project.formatVersion).toBe(FORMAT_VERSION);
    expect(project.settings.maxColorings).toBe(2);

    const [red, blue] = project.sketchbook.colors;
    expect(red).toMatchObject({ id: "col-1", rgb: "#ff0000" });
    expect(red?.card).toMatchObject({ name: "Rouge vif", notes: "pour les étoiles" });
    expect(blue?.rgb).toBe("#00aaff"); // #0af développé

    expect(project.sketchbook.threads[0]).toMatchObject({ id: "th-1", rgb: "#c9a227" });
    expect(project.sketchbook.threads[0]?.card.name).toBe("Fil doré");

    const fab = project.sketchbook.fabrics[0];
    expect(fab?.card).toMatchObject({ name: "Uni bleu", notes: "n°1" });
    expect(fab?.averageColor).toBe("#1e66c8");

    const blk = project.sketchbook.blocks[0];
    expect(blk).toMatchObject({ id: "blk-1", width: 9, height: 9, drawing: { lines: [[0, 0, 9, 9]] } });
    expect(blk?.card).toMatchObject({ name: "Ohio Star", notes: "bloc de 9 pièces" });
    expect(blk?.colorings[0]?.fills).toEqual({ "0": { kind: "solid", rgb: "#ff0000" }, "1": { kind: "solid", rgb: "#ffffff" } });
    expect(project.sketchbook.motifs[0]).toMatchObject({ id: "mot-1", width: 4, height: 4 });

    const q = project.sketchbook.quilts[0];
    expect(q?.card.name).toBe("Mon premier quilt");
    expect(q?.placements).toEqual([{ blockId: "blk-1", coloringId: "cl-1" }]);
    expect(q?.fills).toEqual({ bordure: { kind: "solid", rgb: "#102030" } });
    expect(q?.layout).toEqual({ cols: 3, rows: 3 });
    expect(project.sketchbook.embroideries[0]?.content).toEqual({ points: [1, 2] });
  });

  it("un fichier v0 s'ouvre depuis une archive .qsp", () => {
    const loaded = readQsp(zipSync({ "project.json": strToU8(JSON.stringify(V0)) }));
    expect(loaded.project.sketchbook.blocks).toHaveLength(1);
  });

  it("un projet déjà à jour traverse la migration sans changement", () => {
    const current = { formatVersion: FORMAT_VERSION, marker: 1 };
    expect(migrateProject(current)).toBe(current);
  });

  it("refuse une version future et une version absurde", () => {
    expect(() => migrateProject({ formatVersion: FORMAT_VERSION + 1 })).toThrow(/plus récente/);
    expect(() => migrateProject({ formatVersion: -1 })).toThrow(ProjectFormatError);
    expect(() => migrateProject({ formatVersion: "1" })).toThrow(ProjectFormatError);
    expect(() => migrateProject([])).toThrow(ProjectFormatError);
  });

  it("un v0 incomplet ou mal formé donne une erreur de format, pas une exception brute", () => {
    expect(() => validateProject(migrateProject({ formatVersion: 0, blocks: "n'importe quoi" }))).not.toThrow();
    expect(() => validateProject(migrateProject({ formatVersion: 0, blocks: [{ colorings: [null] }] }))).not.toThrow();
  });
});
