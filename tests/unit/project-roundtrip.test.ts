import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/core/hash";
import { addAsset } from "../../src/core/project/assets";
import { builtInDefaultProject } from "../../src/core/project/defaults";
import { emptyNotecard, emptyProject, type Project } from "../../src/core/project/model";
import { readQsp, writeQsp } from "../../src/core/project/qsp";
import { ProjectFormatError, validateProject } from "../../src/core/project/validate";
import { strToU8, unzipSync, zipSync } from "fflate";
import { block, coloring, fabric, projectWith, quilt } from "./project-helpers";

// Un PNG minimal valide (1 × 1) : le contenu exact importe peu, seule l'empreinte compte.
const PNG_A = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3, 4]);
const PNG_B = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 9, 9, 9, 9]);

function richProject() {
  const assets = new Map<string, Uint8Array>();
  let project: Project = builtInDefaultProject();
  project = addAsset(project, assets, PNG_A, "image/png").project;
  const withB = addAsset(project, assets, PNG_B, "image/png");
  project = withB.project;
  const hashA = sha256Hex(PNG_A);
  const hashB = withB.hash;

  const fabrics = [
    fabric("f-uni", "#336699"),
    { ...fabric("f-img-1"), source: { kind: "image" as const, asset: hashA, ppi: 96 }, averageColor: "#aabbcc" },
    // Deux tissus qui partagent la même image : une seule copie dans l'archive.
    { ...fabric("f-img-2"), source: { kind: "image" as const, asset: hashA, ppi: 150 }, averageColor: "#aabbcc" },
  ];
  const blocks = [
    {
      ...block("b1", [
        coloring("c1", { "0": { kind: "solid", rgb: "#ff0000" }, "1": { kind: "fabric", fabricId: "f-uni" } }),
        coloring("c2", { "0": { kind: "fabric", fabricId: "f-img-1" } }),
      ]),
      drawing: { lines: [[0, 0, 6, 6]], note: "éàü ✓" },
    },
  ];
  const quilts = [
    { ...quilt("q1", [{ blockId: "b1", coloringId: "c1" }], { "cell-0": { kind: "fabric" as const, fabricId: "f-uni" } }), layout: { kind: "horizontal", cols: 4, rows: 5 } },
  ];
  const photos = [{ id: "p1", card: emptyNotecard("Photo"), asset: hashB, ppi: 72 }];
  project = {
    ...project,
    sketchbook: {
      ...project.sketchbook,
      fabrics,
      blocks,
      quilts,
      photos,
      motifs: [block("m1")],
      stencils: [block("s1")],
      embroideries: [{ id: "e1", card: emptyNotecard("Broderie"), content: { stitches: [1, 2, 3] } }],
    },
    frameColors: { blocks: "#e0a526" },
    settings: { maxColorings: 3 },
  };
  project.sketchbook.blocks[0]!.card.notes = "Notes avec accents : éèà";
  project.sketchbook.blocks[0]!.card.back.categories = ["Étoiles", "Traditionnel"];
  return { project, assets, hashA, hashB };
}

describe("SHA-256", () => {
  it("vecteurs officiels", () => {
    expect(sha256Hex(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(strToU8("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(strToU8("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("identique à node:crypto sur des tailles autour des frontières de bloc", () => {
    for (const size of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 65537]) {
      const data = randomBytes(size);
      expect(sha256Hex(data)).toBe(createHash("sha256").update(data).digest("hex"));
    }
  });
});

describe("format .qsp : aller-retour", () => {
  it("un projet riche relu est identique en profondeur", () => {
    const { project, assets } = richProject();
    const loaded = readQsp(writeQsp(project, assets));
    expect(loaded.project).toEqual(project);
    // Le projet relu est lui-même un projet valide et stable.
    expect(validateProject(JSON.parse(JSON.stringify(loaded.project)))).toEqual(project);
  });

  it("les octets des images reviennent intacts", () => {
    const { project, assets, hashA, hashB } = richProject();
    const loaded = readQsp(writeQsp(project, assets));
    expect(loaded.assets.get(hashA)).toEqual(PNG_A);
    expect(loaded.assets.get(hashB)).toEqual(PNG_B);
  });

  it("une image utilisée par deux tissus n'est stockée qu'une fois", () => {
    const { project, assets } = richProject();
    // On relit l'archive brute : project.json + une entrée par image distincte.
    const entries = Object.keys(unzipSync(writeQsp(project, assets))).sort();
    expect(entries).toEqual(["assets/" + sha256Hex(PNG_A) + ".png", "assets/" + sha256Hex(PNG_B) + ".png", "project.json"].sort());
  });

  it("deux ajouts de la même image donnent une seule entrée", () => {
    const assets = new Map<string, Uint8Array>();
    let project = emptyProject();
    project = addAsset(project, assets, PNG_A, "image/png").project;
    const again = addAsset(project, assets, new Uint8Array(PNG_A), "image/png");
    expect(again.project).toBe(project);
    expect(assets.size).toBe(1);
  });

  it("l'écriture est déterministe", () => {
    const { project, assets } = richProject();
    expect(writeQsp(project, assets)).toEqual(writeQsp(project, assets));
  });

  it("les images non citées ne sont pas écrites", () => {
    const assets = new Map<string, Uint8Array>();
    const { project } = addAsset(emptyProject(), assets, PNG_A, "image/png");
    const loaded = readQsp(writeQsp(project, assets));
    expect(loaded.assets.size).toBe(0);
    expect(loaded.project.assets).toEqual({});
  });
});

describe("format .qsp : fichiers invalides", () => {
  const zipWith = (json: unknown, extra: Record<string, Uint8Array> = {}) =>
    zipSync({ "project.json": strToU8(JSON.stringify(json)), ...extra });

  it("refuse ce qui n'est pas une archive", () => {
    expect(() => readQsp(strToU8("pas un zip"))).toThrow(ProjectFormatError);
  });

  it("refuse une archive sans project.json", () => {
    expect(() => readQsp(zipSync({ "autre.txt": strToU8("x") }))).toThrow(/project\.json/);
  });

  it("refuse un projet créé par une version plus récente", () => {
    expect(() => readQsp(zipWith({ ...emptyProject(), formatVersion: 2 }))).toThrow(/plus récente/);
  });

  it("refuse une référence cassée (quilt qui pose un bloc inexistant)", () => {
    const bad = projectWith({ quilts: [quilt("q", [{ blockId: "absent", coloringId: "x" }])] });
    expect(() => validateProject(bad)).toThrow(ProjectFormatError);
  });

  it("refuse un tissu cité mais absent, et des identifiants en double", () => {
    expect(() =>
      validateProject(projectWith({ blocks: [block("b", [coloring("c", { 0: { kind: "fabric", fabricId: "nope" } })])] })),
    ).toThrow(/tissu introuvable/);
    expect(() => validateProject(projectWith({ blocks: [block("x")], motifs: [block("x")] }))).toThrow(/double/);
  });

  it("refuse une image dont l'empreinte ne correspond pas au nom", () => {
    const assets = new Map<string, Uint8Array>();
    const { project, hash } = addAsset(emptyProject(), assets, PNG_A, "image/png");
    const withPhoto = { ...project, sketchbook: { ...project.sketchbook, photos: [{ id: "p", card: emptyNotecard(), asset: hash, ppi: 72 }] } };
    const tampered = zipWith(withPhoto, { [`assets/${hash}.png`]: PNG_B });
    expect(() => readQsp(tampered)).toThrow(/altérée/);
  });

  it("refuse une image manquante dans l'archive", () => {
    const assets = new Map<string, Uint8Array>();
    const { project, hash } = addAsset(emptyProject(), assets, PNG_A, "image/png");
    const withPhoto = { ...project, sketchbook: { ...project.sketchbook, photos: [{ id: "p", card: emptyNotecard(), asset: hash, ppi: 72 }] } };
    expect(() => readQsp(zipWith(withPhoto))).toThrow(/manquante/);
  });

  it("ignore les entrées inattendues de l'archive (chemins étrangers)", () => {
    const loaded = readQsp(zipWith(emptyProject(), { "../evil.txt": strToU8("x"), "assets/../../x.png": strToU8("x") }));
    expect(loaded.project).toEqual(emptyProject());
  });

  it("refuse un nombre de colorations hors limites et une couleur mal formée", () => {
    expect(() => validateProject({ ...emptyProject(), settings: { maxColorings: 11 } })).toThrow(/maxColorings/);
    expect(() => validateProject(projectWith({ colors: [{ id: "c", card: emptyNotecard(), rgb: "red" }] }))).toThrow(/couleur/);
  });
});
