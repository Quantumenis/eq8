import { describe, expect, it } from "vitest";
import { ALL_CATEGORIES, ENTRY_TAGS, searchByCategories, searchCards } from "../../src/core/library/categories";
import { EMBROIDERY_LIBRARY, instantiateEmbroidery, parseEmbroidery } from "../../src/core/embroidery/embroidery";
import { LIBRARY_ENTRIES, instantiateEntry } from "../../src/core/library/extra";
import { LAYOUT_LIBRARY, QUICK_QUILTS, buildLayoutItem, buildQuickQuilt, layoutFinishedSize } from "../../src/core/library/quick";
import { searchByText } from "../../src/core/library/search";
import { addToSketchbook } from "../../src/core/project/commands";
import { newProject } from "../../src/core/project/defaults";
import { emptyNotecard, type PhotoItem } from "../../src/core/project/model";
import { parseDoc, newDraft } from "../../src/core/quilt/doc";
import { addEmbroideryItem, addPhotoItem, setEmbroideryOptions } from "../../src/core/quilt/ops";
import { buildScene } from "../../src/core/quilt/scene";
import { validateProject } from "../../src/core/project/validate";

describe("recherche de blocs (SPEC §8.3, §8.4)", () => {
  const cards = LIBRARY_ENTRIES.map((e) => ({ id: e.id, card: instantiateEntry(e).item.card }));

  it("« etoile » trouve « Étoile » sans tenir compte des accents ni de la casse", () => {
    const hay = [{ card: { ...emptyNotecard("Étoile de l'Ohio"), reference: "", notes: "" } }, { card: emptyNotecard("Nine Patch") }];
    expect(searchCards(hay, (i) => i.card, "etoile")).toHaveLength(1);
    expect(searchCards(hay, (i) => i.card, "ÉTOILE de l")).toHaveLength(1);
    expect(searchByText(hay, (i) => [i.card.name], "ETOILE")).toHaveLength(1);
    expect(searchCards(hay, (i) => i.card, "ohio", { name: false, reference: true, notes: false })).toHaveLength(0);
    expect(searchCards(hay, (i) => i.card, "patch nine")).toHaveLength(0); // sensible à l'ordre des mots
  });

  it("la recherche ET sur 2 catégories est correcte", () => {
    const both = searchByCategories(cards, (c) => c.card.back.categories, ["Étoile", "Triangles"]);
    expect(both.length).toBeGreaterThan(3);
    for (const c of both) {
      expect(c.card.back.categories).toContain("Étoile");
      expect(c.card.back.categories).toContain("Triangles");
    }
    const one = searchByCategories(cards, (c) => c.card.back.categories, ["Étoile"]);
    expect(one.length).toBeGreaterThan(both.length);
    expect(searchByCategories(cards, (c) => c.card.back.categories, ["Étoile", "Pochoir"])).toHaveLength(0);
    expect(searchByCategories(cards, (c) => c.card.back.categories, [])).toHaveLength(0);
    expect(searchByCategories(cards, (c) => c.card.back.categories, ["étoile"]).length).toBe(one.length);
    expect(searchByCategories(cards, (c) => c.card.back.categories, ["Étoile"], 2)).toHaveLength(2);
  });

  it("les catégories des éléments intégrés existent toutes dans les 5 sections", () => {
    for (const [id, tags] of Object.entries(ENTRY_TAGS)) {
      expect(LIBRARY_ENTRIES.some((e) => e.id === id), id).toBe(true);
      for (const t of tags) expect(ALL_CATEGORIES, `${id}: ${t}`).toContain(t);
    }
  });
});

describe("broderies (SPEC §4.6)", () => {
  it("la bibliothèque a une dizaine de modèles, relus et mesurés", () => {
    expect(EMBROIDERY_LIBRARY.length).toBeGreaterThanOrEqual(10);
    for (const def of EMBROIDERY_LIBRARY) {
      const item = instantiateEmbroidery(def);
      const emb = parseEmbroidery(item.content);
      expect(emb, def.id).not.toBeNull();
      expect(emb?.paths.length, def.id).toBeGreaterThan(0);
      for (const p of emb?.paths ?? []) for (const [x, y] of p.points) {
        expect(x, def.id).toBeGreaterThanOrEqual(-0.01);
        expect(y, def.id).toBeGreaterThanOrEqual(-0.01);
        expect(x, def.id).toBeLessThanOrEqual((emb?.width ?? 0) + 0.01);
        expect(y, def.id).toBeLessThanOrEqual((emb?.height ?? 0) + 0.01);
      }
    }
    expect(parseEmbroidery({ kind: "stitches", width: -1, height: 1, paths: [] })).toBeNull();
    expect(parseEmbroidery(null)).toBeNull();
  });

  it("une broderie au calque 3 : fils colorés, rendu 3D plus épais, fil changé, fichier relu", () => {
    let project = newProject(null, 2).project;
    const item = instantiateEmbroidery(EMBROIDERY_LIBRARY[2]!);
    project = addToSketchbook(project, "embroideries", item).project;
    let draft = newDraft("custom");
    const r = addEmbroideryItem(draft, project, { embroideryId: item.id, x: 2, y: 2, w: 3, h: 3 });
    expect(r.id).not.toBeNull();
    draft = r.draft;
    let scene = buildScene(project, draft);
    const mine = scene.strands.filter((s) => s.owner === r.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((s) => s.layer === 3 && s.thread?.rgb === "#c62828")).toBe(true);
    const thin = mine[0]!.thread!.width;
    draft = setEmbroideryOptions(draft, r.id!, { render: "3d", thread: "#1e66c8" });
    scene = buildScene(project, draft);
    const after = scene.strands.filter((s) => s.owner === r.id);
    expect(after[0]!.thread!.width).toBeGreaterThan(thin);
    expect(after.every((s) => s.thread?.rgb === "#1e66c8")).toBe(true);
    const back = parseDoc(JSON.parse(JSON.stringify({ ...draft.doc })));
    expect(back?.items[0]?.embroidery).toEqual({ id: item.id, render: "3d", thread: "#1e66c8" });
    expect(back?.items[0]?.layer).toBe(3);
    expect(addEmbroideryItem(draft, project, { embroideryId: "absent", x: 0, y: 0, w: 1, h: 1 }).id).toBeNull();
  });
});

describe("photos dans le quilt (SPEC §4.7)", () => {
  const photo: PhotoItem = { id: "ph1", card: emptyNotecard("Photo"), asset: "x".repeat(64), ppi: 75 };
  it("calque 1 seulement en Custom Set, calque 2 partout ; la photo est un rectangle de la scène", () => {
    let project = newProject(null, 2).project;
    project = { ...project, sketchbook: { ...project.sketchbook, photos: [photo] }, assets: { ...project.assets, [photo.asset]: { mime: "image/png", size: 1 } } };
    const horizontal = newDraft("horizontal");
    expect(addPhotoItem(horizontal, project, { layer: 1, photoId: "ph1", x: 0, y: 0 }).id).toBeNull();
    const two = addPhotoItem(horizontal, project, { layer: 2, photoId: "ph1", x: 1, y: 1, w: 6, h: 4 });
    expect(two.id).not.toBeNull();
    const scene = buildScene(project, two.draft);
    expect(scene.photos).toHaveLength(1);
    expect(scene.photos[0]).toMatchObject({ photoId: "ph1", layer: 2 });
    const custom = addPhotoItem(newDraft("custom"), project, { layer: 1, photoId: "ph1", x: 0, y: 0 });
    expect(custom.id).not.toBeNull();
    expect(addPhotoItem(custom.draft, project, { layer: 2, photoId: "inconnue", x: 0, y: 0 }).id).toBeNull();
    const back = parseDoc(JSON.parse(JSON.stringify(custom.draft.doc)));
    expect(back?.items[0]?.photoId).toBe("ph1");
  });
});

describe("quilts rapides et bibliothèque de dispositions (SPEC §1.8, §2.14)", () => {
  it("une dizaine de quilts rapides : projets valides, blocs posés dans tous les emplacements", () => {
    expect(QUICK_QUILTS.length).toBeGreaterThanOrEqual(10);
    for (const def of QUICK_QUILTS) {
      const { project, quiltId } = buildQuickQuilt(def);
      expect(validateProject(JSON.parse(JSON.stringify(project))), def.id).toBeTruthy();
      const quilt = project.sketchbook.quilts.find((q) => q.id === quiltId);
      expect(quilt, def.id).toBeDefined();
      const doc = parseDoc(quilt!.layout)!;
      expect(Object.keys(doc.set).length, def.id).toBeGreaterThan(4);
      expect(quilt!.placements.length, def.id).toBeGreaterThanOrEqual(1);
      const scene = buildScene(project, { doc, fills: quilt!.fills });
      expect(scene.pieces.length, def.id).toBeGreaterThan(20);
      // Chaque emplacement de bloc du centre est rempli.
      const empty = scene.slots.filter((s) => s.slot.role === "block" && !s.slot.border && s.slot.frame && !s.placed);
      expect(empty, def.id).toHaveLength(0);
      expect(doc.borders.length, def.id).toBe(def.borders.length);
    }
  });

  it("une vingtaine de dispositions rangées par taille, sans bloc", () => {
    expect(LAYOUT_LIBRARY.length).toBeGreaterThanOrEqual(20);
    expect(new Set(LAYOUT_LIBRARY.map((d) => d.id)).size).toBe(LAYOUT_LIBRARY.length);
    expect(new Set(LAYOUT_LIBRARY.map((d) => d.category)).size).toBeGreaterThanOrEqual(3);
    for (const def of LAYOUT_LIBRARY) {
      const item = buildLayoutItem(def);
      const doc = parseDoc(item.layout)!;
      expect(doc, def.id).not.toBeNull();
      expect(Object.keys(doc.set), def.id).toHaveLength(0);
      expect(item.placements, def.id).toHaveLength(0);
      const size = layoutFinishedSize(def);
      expect(size.width, def.id).toBeGreaterThan(10);
      expect(def.name, def.id).toContain("po");
    }
    const h = LAYOUT_LIBRARY.find((d) => d.id === "h-4x5-6")!;
    // 4 × 6 po de large + bordure de 3 po de chaque côté.
    expect(layoutFinishedSize(h)).toEqual({ width: 30, height: 36 });
  });
});
