import { describe, expect, it } from "vitest";
import {
  addColoredBlock,
  addLibraryBlock,
  addToSketchbook,
  clearUnused,
  deleteColoring,
  deleteItem,
  makeColor,
  moveBefore,
  setMaxColorings,
  sortByClickOrder,
  splitColorings,
} from "../../src/core/project/commands";
import { builtInDefaultProject, extractPalette, newProject } from "../../src/core/project/defaults";
import { checkProjectName, projectNameFromPath } from "../../src/core/project/names";
import { readQsp, writeQsp } from "../../src/core/project/qsp";
import { emptyNotecard, type Project } from "../../src/core/project/model";
import { formatLength } from "../../src/core/units";
import { block, coloring, fabric, projectWith, quilt } from "./project-helpers";

const solid = (rgb: string) => ({ "0": { kind: "solid" as const, rgb } });

function stackOf(project: Project, id: string) {
  return project.sketchbook.blocks.find((b) => b.id === id)?.colorings.map((c) => c.id);
}

describe("colorations empilées", () => {
  const input = (_project: Project, id: string, source?: string) => ({
    list: "blocks" as const,
    sourceBlockId: source,
    card: emptyNotecard("Étoile"),
    width: 6,
    height: 6,
    drawing: { d: 1 },
    coloring: coloring(id, solid("#" + id.padEnd(6, "0").slice(0, 6))),
  });

  it("maximum 2 : la 3ᵉ coloration crée un nouveau bloc « 1 sur 1 »", () => {
    let project = projectWith({});
    const first = addColoredBlock(project, input(project, "aaa"));
    expect(first.status).toBe("new-block");
    project = first.project;
    const root = first.blockId;

    const second = addColoredBlock(project, input(project, "bbb", root));
    expect(second.status).toBe("stacked");
    expect(second.status === "stacked" && second.position).toBe(2); // « 2 sur 2 »
    project = second.project;
    expect(stackOf(project, root)).toEqual(["aaa", "bbb"]);

    const third = addColoredBlock(project, input(project, "ccc", root));
    expect(third.status).toBe("new-block");
    expect(third.blockId).not.toBe(root);
    project = third.project;
    expect(project.sketchbook.blocks).toHaveLength(2);
    expect(stackOf(project, root)).toEqual(["aaa", "bbb"]);
    expect(stackOf(project, third.blockId)).toEqual(["ccc"]); // « 1 sur 1 »
  });

  it("maximum 1 : rien ne s'empile, chaque coloration fait un bloc", () => {
    let project = projectWith({}, 1);
    const a = addColoredBlock(project, input(project, "aaa"));
    project = a.project;
    const b = addColoredBlock(project, input(project, "bbb", a.blockId));
    expect(b.status).toBe("new-block");
    expect(b.project.sketchbook.blocks).toHaveLength(2);
  });

  it("maximum 1 : un bloc de bibliothèque à 2 colorations est dépilé en 2 blocs", () => {
    const lib = block("ohio", [coloring("gris", solid("#888888")), coloring("couleur", solid("#cc2222"))], { d: "ohio" });
    const stacked = addLibraryBlock(projectWith({}, 2), "blocks", lib);
    expect(stacked.project.sketchbook.blocks).toHaveLength(1);
    expect(stackOf(stacked.project, "ohio")).toEqual(["gris", "couleur"]);

    const unstacked = addLibraryBlock(projectWith({}, 1), "blocks", lib);
    expect(unstacked.project.sketchbook.blocks).toHaveLength(2);
    expect(unstacked.project.sketchbook.blocks.map((b) => b.colorings.map((c) => c.id))).toEqual([["gris"], ["couleur"]]);
    expect(unstacked.project.sketchbook.blocks[0]?.drawing).toEqual(unstacked.project.sketchbook.blocks[1]?.drawing);
    expect(new Set(unstacked.blockIds).size).toBe(2);
  });

  it("une coloration identique à une coloration déjà empilée est signalée comme doublon", () => {
    const a = addColoredBlock(projectWith({}), input(projectWith({}), "aaa"));
    const again = addColoredBlock(a.project, { ...input(a.project, "zzz", a.blockId), coloring: coloring("zzz", solid("#aaa000")) });
    expect(again.status).toBe("duplicate");
    expect(again.project).toBe(a.project);
  });

  it("un dessin modifié repart d'un nouveau bloc même avec un bloc d'origine", () => {
    const a = addColoredBlock(projectWith({}), input(projectWith({}), "aaa"));
    const edited = addColoredBlock(a.project, { ...input(a.project, "bbb", a.blockId), drawing: { d: 2 } });
    expect(edited.status).toBe("new-block");
  });

  it("réduire le maximum ne touche pas aux piles existantes", () => {
    const project = projectWith({ blocks: [block("b", [coloring("1"), coloring("2")])] }, 2);
    const reduced = setMaxColorings(project, 1);
    expect(reduced.sketchbook.blocks[0]?.colorings).toHaveLength(2);
    expect(setMaxColorings(project, 99).settings.maxColorings).toBe(10);
    expect(setMaxColorings(project, 2)).toBe(project);
  });

  it("scinder coupe la pile à la coloration choisie et déplace les quilts concernés", () => {
    const project = projectWith({
      blocks: [block("b", [coloring("c1"), coloring("c2"), coloring("c3")])],
      quilts: [quilt("q", [{ blockId: "b", coloringId: "c3" }, { blockId: "b", coloringId: "c1" }])],
    }, 5);
    const result = splitColorings(project, "blocks", "b", "c2");
    expect(result).toBeDefined();
    const next = result!.project;
    expect(stackOf(next, "b")).toEqual(["c1"]);
    expect(stackOf(next, result!.newBlockId)).toEqual(["c2", "c3"]);
    expect(next.sketchbook.blocks.map((b) => b.id)).toEqual(["b", result!.newBlockId]); // inséré juste après
    expect(next.sketchbook.quilts[0]?.placements).toEqual([
      { blockId: result!.newBlockId, coloringId: "c3" },
      { blockId: "b", coloringId: "c1" },
    ]);
    // La première coloration ne peut pas être scindée.
    expect(splitColorings(project, "blocks", "b", "c1")).toBeUndefined();
  });
});

describe("suppression", () => {
  it("un bloc utilisé dans un quilt ne se supprime pas", () => {
    const project = projectWith({
      blocks: [block("b", [coloring("c")]), block("libre")],
      quilts: [quilt("q", [{ blockId: "b", coloringId: "c" }])],
    });
    const refused = deleteItem(project, "blocks", "b");
    expect(refused).toEqual({ ok: false, reason: "used", quiltIds: ["q"] });
    const ok = deleteItem(project, "blocks", "libre");
    expect(ok.ok && ok.project.sketchbook.blocks.map((b) => b.id)).toEqual(["b"]);
    expect(deleteItem(project, "blocks", "absent")).toEqual({ ok: false, reason: "not-found" });
  });

  it("une coloration utilisée ne se supprime pas, une autre si", () => {
    const project = projectWith({
      blocks: [block("b", [coloring("c1"), coloring("c2")])],
      quilts: [quilt("q", [{ blockId: "b", coloringId: "c1" }])],
    });
    expect(deleteColoring(project, "blocks", "b", "c1")).toEqual({ ok: false, reason: "used", quiltIds: ["q"] });
    const res = deleteColoring(project, "blocks", "b", "c2");
    expect(res.ok && stackOf(res.project, "b")).toEqual(["c1"]);
  });

  it("un tissu utilisé est remplacé par un uni (sa couleur moyenne) dans les blocs et les quilts", () => {
    const f = fabric("f", "#336699");
    const project = projectWith({
      fabrics: [f, fabric("g", "#00ff00")],
      blocks: [block("b", [coloring("c", { 0: { kind: "fabric", fabricId: "f" }, 1: { kind: "fabric", fabricId: "g" }, 2: { kind: "solid", rgb: "#ffffff" } })])],
      quilts: [quilt("q", [], { cell: { kind: "fabric", fabricId: "f" } })],
    });
    const res = deleteItem(project, "fabrics", "f");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.replaced).toBe(2);
    expect(res.project.sketchbook.fabrics.map((x) => x.id)).toEqual(["g"]);
    expect(res.project.sketchbook.blocks[0]?.colorings[0]?.fills).toEqual({
      0: { kind: "solid", rgb: "#336699" },
      1: { kind: "fabric", fabricId: "g" },
      2: { kind: "solid", rgb: "#ffffff" },
    });
    expect(res.project.sketchbook.quilts[0]?.fills.cell).toEqual({ kind: "solid", rgb: "#336699" });
  });

  it("effacer l'inutilisé : blocs non posés, tissus utilisés nulle part", () => {
    const project = projectWith({
      fabrics: [fabric("f1"), fabric("f2")],
      blocks: [block("b1", [coloring("c1", { 0: { kind: "fabric", fabricId: "f1" } })]), block("b2")],
      quilts: [quilt("q", [{ blockId: "b1", coloringId: "c1" }])],
    });
    const blocks = clearUnused(project, "blocks");
    expect(blocks.removed).toBe(1);
    expect(blocks.project.sketchbook.blocks.map((b) => b.id)).toEqual(["b1"]);
    const fabrics = clearUnused(project, "fabrics");
    expect(fabrics.project.sketchbook.fabrics.map((f) => f.id)).toEqual(["f1"]);
    expect(clearUnused(project, "colors").project).toBe(project);
  });
});

describe("ajouter au carnet", () => {
  it("un élément identique est signalé « déjà présent », sans doublon", () => {
    const project = builtInDefaultProject();
    const color = makeColor("#abcdef", "Nouveau");
    const first = addToSketchbook(project, "colors", color);
    expect(first.status).toBe("added");
    const again = addToSketchbook(first.project, "colors", { ...makeColor("#ABCDEF", "Nouveau") });
    expect(again.status).toBe("duplicate");
    expect(again.project).toBe(first.project);
    expect(again.status === "duplicate" && again.existingId).toBe(color.id);
    // Même couleur, autre nom : c'est un autre élément.
    expect(addToSketchbook(first.project, "colors", makeColor("#abcdef", "Autre nom")).status).toBe("added");
  });
});

describe("ordre du carnet", () => {
  const project = projectWith({ colors: ["a", "b", "c", "d"].map((id) => ({ ...makeColor("#000000", id), id })) });
  const ids = (p: Project) => p.sketchbook.colors.map((c) => c.id);

  it("tri par clics : les cliqués d'abord, les autres à la suite dans leur ordre", () => {
    expect(ids(sortByClickOrder(project, "colors", ["c", "a"]))).toEqual(["c", "a", "b", "d"]);
    expect(ids(sortByClickOrder(project, "colors", ["d", "c", "b", "a"]))).toEqual(["d", "c", "b", "a"]);
    expect(sortByClickOrder(project, "colors", [])).toBe(project);
    expect(sortByClickOrder(project, "colors", ["a", "b"])).toBe(project);
    expect(ids(sortByClickOrder(project, "colors", ["x", "b", "b"]))).toEqual(["b", "a", "c", "d"]);
  });

  it("glisser-déposer : dépose avant l'élément visé, ou à la fin", () => {
    expect(ids(moveBefore(project, "colors", "d", "b"))).toEqual(["a", "d", "b", "c"]);
    expect(ids(moveBefore(project, "colors", "a", null))).toEqual(["b", "c", "d", "a"]);
    expect(moveBefore(project, "colors", "a", "b")).toBe(project); // déjà juste avant
    expect(moveBefore(project, "colors", "a", "a")).toBe(project);
    expect(moveBefore(project, "colors", "a", "inconnu")).toBe(project);
  });
});

describe("palette par défaut", () => {
  it("un nouveau projet reprend la palette enregistrée, sans quilts, dans son ordre", () => {
    const base = projectWith({
      colors: [makeColor("#111111", "z"), makeColor("#222222", "a")],
      blocks: [block("b", [coloring("c")])],
      quilts: [quilt("q", [{ blockId: "b", coloringId: "c" }])],
      embroideries: [{ id: "e", card: emptyNotecard(), content: null }],
    });
    const palette = extractPalette(base, new Map());
    const loaded = readQsp(writeQsp(palette.project, palette.assets));
    const fresh = newProject(loaded, 3);
    expect(fresh.project.sketchbook.colors.map((c) => c.card.name)).toEqual(["z", "a"]);
    expect(fresh.project.sketchbook.blocks).toHaveLength(1);
    expect(fresh.project.sketchbook.quilts).toHaveLength(0);
    expect(fresh.project.sketchbook.embroideries).toHaveLength(0);
    expect(fresh.project.settings.maxColorings).toBe(3);
  });

  it("sans palette enregistrée, le contenu d'origine est proposé", () => {
    const fresh = newProject(null);
    expect(fresh.project.sketchbook.colors.length).toBeGreaterThan(10);
    expect(fresh.project.sketchbook.threads.length).toBeGreaterThan(5);
    expect(fresh.project.settings.maxColorings).toBe(2);
  });
});

describe("noms de projet", () => {
  it("accepte les noms ordinaires, accents compris", () => {
    expect(checkProjectName("  Quilt d'été 2026  ")).toEqual({ ok: true, name: "Quilt d'été 2026" });
  });

  it("refuse ce que Windows refuse et toute tentative de sortir du dossier", () => {
    for (const bad of ["", "   ", "a/b", "a\\b", "..\\x", "a:b", "x*y", "q?", 'a"b', "a|b", "a<b", "fin.", "con", "NUL.txt", "com1", "a\u0001b"]) {
      expect(checkProjectName(bad).ok, JSON.stringify(bad)).toBe(false);
    }
    expect(checkProjectName("x".repeat(101))).toEqual({ ok: false, problem: "too-long" });
    expect(checkProjectName("console").ok).toBe(true);
  });

  it("extrait le nom d'affichage d'un chemin", () => {
    expect(projectNameFromPath("C:\\Users\\a\\Documents\\Quilt Studio\\Projets\\Test.qsp")).toBe("Test");
    expect(projectNameFromPath("/tmp/Autre.QSP")).toBe("Autre");
    expect(projectNameFromPath("sans-extension")).toBe("sans-extension");
  });
});

describe("affichage des longueurs", () => {
  it("6 po = 15,24 cm, avec virgule décimale", () => {
    expect(formatLength(6, "cm")).toBe("15,24 cm");
    expect(formatLength(6, "in")).toBe("6 po");
    expect(formatLength(8.5, "in")).toBe("8,5 po");
    expect(formatLength(10, "in", 0)).toBe("10 po");
    expect(formatLength(0, "cm")).toBe("0 cm");
  });
});
