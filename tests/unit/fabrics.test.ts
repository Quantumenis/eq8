import { describe, expect, it } from "vitest";
import { generatedAverage, generatedHash, renderGenerated, GENERATORS } from "../../src/core/fabric/generator";
import { averageColor, pixelAt } from "../../src/core/image/raster";
import { LIBRARY_FABRICS, fabricLibraryTree, instantiateLibraryFabric, libraryFabricAverage } from "../../src/core/library/fabrics";
import { LIBRARY_THREADS, instantiateLibraryThread } from "../../src/core/library/threads";
import { searchByColor, searchByText, foldText } from "../../src/core/library/search";
import { addToSketchbook } from "../../src/core/project/commands";
import { builtInDefaultProject } from "../../src/core/project/defaults";
import type { FabricSource } from "../../src/core/project/model";

type Gen = Extract<FabricSource, { kind: "generated" }>;
const gen = (generator: string, params: Gen["params"], seed = 0): Gen => ({ kind: "generated", generator, seed, params });

describe("générateur de tissus", () => {
  it("est déterministe : même graine, même image et même empreinte", () => {
    for (const generator of GENERATORS) {
      const source = gen(generator, {}, 42);
      const a = renderGenerated(source);
      const b = renderGenerated(source);
      expect(a.raster.data).toEqual(b.raster.data);
      expect(generatedHash(source)).toBe(generatedHash(source));
    }
  });

  it("une autre graine change un tissu marbré", () => {
    expect(generatedHash(gen("noise", {}, 1))).not.toBe(generatedHash(gen("noise", {}, 2)));
  });

  it("la couleur moyenne d'un damier noir et blanc 50/50 vaut 127,5 ± 1", () => {
    const tile = renderGenerated(gen("checks", { a: "#000000", b: "#ffffff", size: 0.5 }));
    const { mean } = averageColor(tile.raster);
    for (const v of [mean.r, mean.g, mean.b]) expect(Math.abs(v - 127.5)).toBeLessThanOrEqual(1);
    const hex = generatedAverage(gen("checks", { a: "#000000", b: "#ffffff", size: 0.5 }));
    expect(Math.abs(Number.parseInt(hex.slice(1, 3), 16) - 127.5)).toBeLessThanOrEqual(1);
  });

  it("rend la tuile à l'échelle réelle : un damier de cases de 1 po à 96 ppp a des cases de 96 px", () => {
    const tile = renderGenerated(gen("checks", { a: "#000000", b: "#ffffff", size: 1 }), 96);
    expect(tile.width).toBe(2);
    expect(tile.raster.width).toBe(192);
    expect(tile.ppi).toBe(96);
    expect(pixelAt(tile.raster, 10, 10)[0]).toBe(0);
    expect(pixelAt(tile.raster, 106, 10)[0]).toBe(255);
  });

  it("l'ombré fait l'aller-retour : la tuile se raccorde d'un bord à l'autre", () => {
    const ombre = renderGenerated(gen("gradient", { from: "#000000", to: "#ffffff", width: 10 }), 20);
    const r = ombre.raster;
    expect(Math.abs(pixelAt(r, 0, 0)[0] - pixelAt(r, r.width - 1, 0)[0])).toBeLessThan(10);
    expect(pixelAt(r, r.width / 2, 0)[0]).toBeGreaterThan(245);
  });

  it("des paramètres invalides (venus d'un fichier) retombent sur des valeurs sûres", () => {
    const tile = renderGenerated(gen("dots", { spacing: -5, radius: "x", ground: "bleu" }));
    expect(tile.raster.width).toBeGreaterThan(0);
    const huge = renderGenerated(gen("gradient", { width: 1e9 }));
    expect(huge.raster.width * huge.raster.height).toBeLessThanOrEqual(1_200_000);
  });
});

describe("bibliothèque de tissus et de fils", () => {
  it("compte environ 150 tissus aux identifiants uniques, rangés en catégories et styles", () => {
    expect(LIBRARY_FABRICS.length).toBe(150);
    expect(new Set(LIBRARY_FABRICS.map((f) => f.id)).size).toBe(150);
    const tree = fabricLibraryTree();
    expect(tree.map((c) => c.category)).toEqual(["01 Unis et faux-unis", "02 Géométriques", "03 Carreaux", "04 Dégradés"]);
    expect(tree.flatMap((c) => c.styles).reduce((n, s) => n + s.fabrics.length, 0)).toBe(150);
  });

  it("un tissu de la bibliothèque arrive dans le carnet avec sa couleur moyenne précalculée ; un second ajout est un doublon", () => {
    const def = LIBRARY_FABRICS.find((f) => f.id === "uni-orange");
    if (!def) throw new Error("uni-orange");
    expect(libraryFabricAverage(def)).toBe("#ef6c00");
    const project = builtInDefaultProject();
    const first = addToSketchbook(project, "fabrics", instantiateLibraryFabric(def));
    expect(first.status).toBe("added");
    expect(addToSketchbook(first.project, "fabrics", instantiateLibraryFabric(def)).status).toBe("duplicate");
  });

  it("les fils ont un nom, un numéro unique et une couleur", () => {
    expect(LIBRARY_THREADS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(LIBRARY_THREADS.map((t) => t.number)).size).toBe(LIBRARY_THREADS.length);
    const item = instantiateLibraryThread(LIBRARY_THREADS[0] as (typeof LIBRARY_THREADS)[number]);
    expect(item.card.reference).toMatch(/^QS \d+$/);
    expect(item.rgb).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("un projet neuf contient des tissus par défaut", () => {
    const fabrics = builtInDefaultProject().sketchbook.fabrics;
    expect(fabrics.length).toBeGreaterThanOrEqual(12);
    for (const f of fabrics) expect(f.averageColor).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("recherche", () => {
  it("par couleur : du plus proche au plus éloigné, au plus N résultats", () => {
    const items = [
      { id: "a", rgb: "#ff0000" },
      { id: "b", rgb: "#0000ff" },
      { id: "c", rgb: "#ee1111" },
      { id: "d", rgb: "#00ff00" },
    ];
    expect(searchByColor(items, (i) => i.rgb, "#ff0000", 2).map((i) => i.id)).toEqual(["a", "c"]);
    expect(searchByColor(items, (i) => i.rgb, "#0011ee").map((i) => i.id)[0]).toBe("b");
  });

  it("par couleur dans la bibliothèque : les plus proches d'un rouge sont rouges", () => {
    const found = searchByColor(LIBRARY_FABRICS, libraryFabricAverage, "#c62828", 5);
    expect(found[0]?.id).toBe("uni-rouge");
    expect(found).toHaveLength(5);
  });

  it("par texte (nom ou numéro), sans casse ni accents", () => {
    expect(foldText("Émeraude Foncé")).toBe("emeraude fonce");
    const found = searchByText(LIBRARY_THREADS, (t) => [t.name, t.number], "emeraude");
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((t) => foldText(t.name).includes("emeraude"))).toBe(true);
    expect(searchByText(LIBRARY_THREADS, (t) => [t.name, t.number], "QS 1001").map((t) => t.number)).toEqual(["QS 1001"]);
  });
});
