import fs from "node:fs";
import path from "node:path";
import { parse, type Font } from "opentype.js";
import { describe, expect, it } from "vitest";
import { polyShape } from "../../src/core/draw/applique";
import { ellipseShape, formShape } from "../../src/core/draw/appliqueShapes";
import { contentOfDrawing } from "../../src/core/draw/content";
import { cleanDrawing, fromDrawing, isEmpty, newDraft, resizeBlock, toDrawing } from "../../src/core/draw/draft";
import { addPolyPiece, polyLoop } from "../../src/core/draw/polydraw";
import { DEFAULT_FONTS } from "../../src/core/print/display";
import type { PrintContext } from "../../src/core/print/kit";
import { defaultPageSetup } from "../../src/core/print/paper";
import { blockSource, quiltSource } from "../../src/core/print/source";
import { templatePages } from "../../src/core/print/templates";
import { addToSketchbook } from "../../src/core/project/commands";
import { newProject } from "../../src/core/project/defaults";
import { emptyNotecard, emptyProject, type BlockItem, type Project } from "../../src/core/project/model";
import { newDraft as newQuilt, parseDoc, placementsOf, docToJson } from "../../src/core/quilt/doc";
import { addItem, addTextItem, setItemText } from "../../src/core/quilt/ops";
import { paintPieces } from "../../src/core/quilt/paintops";
import { buildScene } from "../../src/core/quilt/scene";
import { DEFAULT_TEXT } from "../../src/core/text/glyphs";
import { setFontLookup, textBlockOf } from "../../src/core/text/registry";
import { LIBRARY_ENTRIES, instantiateEntry } from "../../src/core/library/extra";

const arial = path.join(process.env.WINDIR ?? "C:\\Windows", "Fonts", "arial.ttf");
const hasArial = fs.existsSync(arial);

function block(drawing: BlockItem["drawing"], w = 6, h = 6, name = "Bloc"): BlockItem {
  return { id: `b-${name}`, card: emptyNotecard(name), width: w, height: h, drawing, colorings: [] };
}

function projectWith(...entries: string[]): { project: Project; ids: Record<string, string> } {
  let project: Project = newProject(null, 2).project;
  const ids: Record<string, string> = {};
  for (const id of entries) {
    const made = instantiateEntry(LIBRARY_ENTRIES.find((e) => e.id === id)!);
    project = addToSketchbook(project, made.list, made.item).project;
    ids[id] = made.item.id;
  }
  return { project, ids };
}

describe("brouillons : tous les styles se relisent à l'identique", () => {
  it("easy, poly, applique, motif, easy+applique et poly+applique", () => {
    const rect = { kind: "rect" as const, a: 6, b: 6 };
    const styles = ["easy", "poly", "applique", "motif", "easyApplique", "polyApplique"] as const;
    for (const style of styles) {
      let d = newDraft([], style);
      expect(isEmpty(d)).toBe(true);
      expect(d.list).toBe(style === "motif" ? "motifs" : "blocks");
      if (style === "easy" || style === "easyApplique") d = { ...d, segments: [{ id: "s1", kind: "line", a: { x: 0, y: 0 }, b: { x: 6, y: 6 } }] };
      if (style === "poly" || style === "polyApplique") d = { ...d, poly: addPolyPiece({ ...d.poly, grid: rect }, polyLoop(rect, 6, 6, [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 6 }], false)) };
      if (style !== "easy" && style !== "poly") d = { ...d, shapes: [ellipseShape(3, 3, 1, 1), polyShape([{ x: 1, y: 1 }, { x: 2, y: 2 }], false)] };
      expect(isEmpty(d), style).toBe(false);
      const json = toDrawing(d);
      const back = fromDrawing(json, 6, 6, []);
      expect(back.style, style).toBe(style);
      expect(JSON.stringify(toDrawing(back)).replace(/"id":"[^"]*"/g, ""), style).toBe(JSON.stringify(json).replace(/"id":"[^"]*"/g, ""));
      const a = contentOfDrawing(json, 6, 6);
      const b = contentOfDrawing(toDrawing(back), 6, 6);
      expect(b.pieces.map((p) => p.key), style).toEqual(a.pieces.map((p) => p.key));
      expect(b.strands.length, style).toBe(a.strands.length);
      // Le JSON survit à la sérialisation du fichier.
      expect(contentOfDrawing(JSON.parse(JSON.stringify(json)), 6, 6).pieces.map((p) => p.key), style).toEqual(a.pieces.map((p) => p.key));
    }
  });

  it("changer la taille du bloc entraîne les formes et les pièces PolyDraw", () => {
    const rect = { kind: "rect" as const, a: 6, b: 6 };
    let d = newDraft([], "polyApplique");
    d = { ...d, poly: addPolyPiece({ ...d.poly, grid: rect }, polyLoop(rect, 6, 6, [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 6 }], false)), shapes: [ellipseShape(3, 3, 1, 1)] };
    const big = resizeBlock(d, 12, 12);
    const areaBefore = contentOfDrawing(toDrawing(d), 6, 6).pieces.map((p) => p.area);
    const areaAfter = contentOfDrawing(toDrawing(big), 12, 12).pieces.map((p) => p.area);
    expect(areaAfter[0]).toBeCloseTo((areaBefore[0] as number) * 4, 4);
    expect(areaAfter[1]).toBeCloseTo((areaBefore[1] as number) * 4, 2);
  });

  it("cleanDrawing garde la partie applique intacte et nettoie la partie EasyDraw", () => {
    let d = newDraft([], "easyApplique");
    d = {
      ...d,
      segments: [
        { id: "a", kind: "line", a: { x: 0, y: 3 }, b: { x: 6, y: 3 } },
        { id: "b", kind: "line", a: { x: 3, y: 3 }, b: { x: 3, y: 5 } }, // pendant : retiré
      ],
      shapes: [formShape("heart", 1, 1, 3, 3) as ReturnType<typeof ellipseShape>],
    };
    const r = cleanDrawing(d);
    expect(r.analysis.removed).toHaveLength(1);
    expect(r.draft.segments).toHaveLength(2); // la droite est coupée au nœud qu'avait le segment pendant
    expect(r.draft.shapes).toHaveLength(1);
    // Easy (2 pièces) + une pièce d'applique.
    expect(r.analysis.pieces).toHaveLength(3);
  });
});

describe("quilt : motifs, pochoirs, conversions automatiques (SPEC §4.3)", () => {
  it("un motif au calque 2 et un pochoir au calque 3 : pièces, fils et lignes seules", () => {
    const { project, ids } = projectWith("nine-patch", "motif-heart", "stencil-feather", "stencil-rosette");
    let draft = newQuilt("custom");
    const coloring = (id: string) => ({ blockId: id, coloringId: "" });
    // Un bloc posé au calque 2 se comporte comme un motif ; au calque 3, comme un pochoir.
    draft = addItem(draft, project, { layer: 2, ref: coloring(ids["nine-patch"]!), x: 1, y: 1, w: 6, h: 6 }).draft;
    draft = addItem(draft, project, { layer: 2, ref: coloring(ids["motif-heart"]!), x: 8, y: 1, w: 6, h: 6 }).draft;
    draft = addItem(draft, project, { layer: 3, ref: coloring(ids["nine-patch"]!), x: 1, y: 8, w: 6, h: 6 }).draft;
    draft = addItem(draft, project, { layer: 3, ref: coloring(ids["stencil-feather"]!), x: 8, y: 8, w: 8, h: 8 }).draft;
    // Un pochoir posé au calque 2 devient un motif : ses contours fermés se colorent.
    draft = addItem(draft, project, { layer: 2, ref: coloring(ids["stencil-rosette"]!), x: 17, y: 1, w: 8, h: 8 }).draft;
    const scene = buildScene(project, draft);
    const at = (layer: number) => scene.pieces.filter((p) => p.layer === layer);
    expect(at(2).filter((p) => !p.lineOnly).length).toBeGreaterThan(9); // 9 carrés + le cœur + la rosace
    expect(at(2).every((p) => !p.lineOnly)).toBe(true);
    expect(at(3).length).toBeGreaterThan(0);
    expect(at(3).every((p) => p.lineOnly)).toBe(true);
    expect(scene.strands.filter((s) => s.layer === 3).length).toBeGreaterThan(10);
    expect(scene.slots.filter((s) => s.placed)).toHaveLength(0); // aucun emplacement du calque 1 n'est rempli
    // Les fils (plume) sont suivis jusqu'au bout : un seul bloc de fils par élément.
    expect(new Set(scene.strands.map((s) => s.owner)).size).toBe(1);
  });

  it("le quilt avec motifs et pochoirs survit à l'enregistrement", () => {
    const { project, ids } = projectWith("motif-star");
    let draft = newQuilt("custom");
    draft = addItem(draft, project, { layer: 2, ref: { blockId: ids["motif-star"]!, coloringId: "" }, x: 0, y: 0, w: 6, h: 6 }).draft;
    const back = parseDoc(JSON.parse(JSON.stringify(docToJson(draft.doc))));
    expect(back?.items).toHaveLength(1);
    expect(placementsOf(project, draft.doc)).toHaveLength(1);
  });
});

describe.skipIf(!hasArial)("quilt : texte en applique (SPEC §4.15)", () => {
  const font: Font = hasArial
    ? (() => {
        const buf = fs.readFileSync(arial);
        return parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
      })()
    : (null as unknown as Font);

  it("une boîte de texte au calque 2 : une pièce par lettre, rendue seulement quand la police est là", () => {
    const project = emptyProject();
    const spec = { ...DEFAULT_TEXT, text: "Quilt", size: 1.5 };
    let draft = newQuilt("custom");
    const added = addTextItem(draft, { x: 2, y: 3, w: 4, h: 2, spec });
    draft = added.draft;
    setFontLookup(() => null);
    expect(buildScene(project, draft).pieces.filter((p) => p.owner === added.id)).toHaveLength(0);
    setFontLookup((family) => (family === "Arial" ? font : null));
    const scene = buildScene(project, draft);
    const mine = (s: ReturnType<typeof buildScene>) => s.pieces.filter((p) => p.owner === added.id);
    expect(mine(scene)).toHaveLength(6); // le « i » a deux pièces : le jambage et le point
    expect(mine(scene).every((p) => p.layer === 2 && p.text === true)).toBe(true);
    // Le texte est posé au coin (2 ; 3) de sa boîte.
    const minX = Math.min(...mine(scene).flatMap((p) => p.poly.map((q) => q.x)));
    expect(minX).toBeGreaterThanOrEqual(2 - 1e-3);
    // Modifier le texte recale la boîte sur l'encre.
    const tb = textBlockOf({ ...spec, text: "Quilt !" })!;
    const next = setItemText(draft, added.id, { ...spec, text: "Quilt !" }, { w: tb.width, h: tb.height });
    expect(next.doc.items[0]?.w).toBeCloseTo(tb.width, 6);
    expect(mine(buildScene(project, next))).toHaveLength(8); // « ! » : deux pièces de plus
    // Le texte fait partie du fichier mais pas des « blocs posés » du carnet.
    expect(placementsOf(project, next.doc)).toHaveLength(0);
    const reread = parseDoc(JSON.parse(JSON.stringify(docToJson(next.doc))));
    expect(reread?.items[0]?.text?.text).toBe("Quilt !");
    expect(reread?.items[0]?.layer).toBe(2);
    setFontLookup(() => null);
  });

  it("le pinceau colore tout le texte, et le gabarit de « A » imprime le trou", () => {
    setFontLookup((family) => (family === "Arial" ? font : null));
    const project = emptyProject();
    let draft = newQuilt("custom");
    const added = addTextItem(draft, { x: 0, y: 0, w: 2, h: 2, spec: { ...DEFAULT_TEXT, text: "AA", size: 2 } });
    draft = added.draft;
    const scene = buildScene(project, draft);
    const letters = scene.pieces.filter((p) => p.owner === added.id);
    expect(letters).toHaveLength(2);
    draft = paintPieces(draft, letters, { kind: "solid", rgb: "#c62828" });
    expect(buildScene(project, draft).pieces.filter((p) => p.owner === added.id).every((p) => p.paint?.kind === "solid")).toBe(true);
    // Gabarit : les deux « A » font une seule forme ; la lettre a deux contours de couture (extérieur + trou) et deux de coupe.
    const ctx: PrintContext = { project, projectName: "Essai", fonts: DEFAULT_FONTS, setup: defaultPageSetup("US"), unit: "in", minLine: 0.75 };
    const source = quiltSource(buildScene(project, draft), added.id, "Texte", null, false)!;
    expect(source.pieces).toHaveLength(2);
    expect(source.pieces[0]?.holes).toHaveLength(1);
    const withSeam = templatePages(source, ctx, { seam: 0.25, printSeam: true, keyBlock: "none", lineWidth: 1 });
    const strokes = (flag: boolean) => {
      const out: { dash: boolean }[] = [];
      const visit = (items: readonly { kind: string; items?: unknown; stroke?: { dash?: number[] } }[]): void => {
        for (const it of items) {
          if (it.kind === "group") visit(it.items as never);
          else if (it.kind === "path" && it.stroke) out.push({ dash: !!it.stroke.dash });
        }
      };
      withSeam.pages.forEach((p) => visit(p.items as never));
      return out.filter((s) => s.dash === flag).length;
    };
    // Coupe : contour + trou (continus). Couture : contour + trou (tirets) ; la flèche de droit-fil est aussi continue (3 traits).
    expect(strokes(true)).toBe(2);
    expect(strokes(false)).toBeGreaterThanOrEqual(2);
    setFontLookup(() => null);
  });
});

describe("gabarits d'applique : les pièces qui se coupent sont refusées", () => {
  it("un bloc d'applique dont une pièce se recoupe est signalé, un autre non", () => {
    const bad = block(toDrawing({ ...newDraft([], "motif"), shapes: [polyShape([{ x: 0, y: 0 }, { x: 5, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 3 }], true)] }));
    expect(blockSource(bad, null, { width: 6, height: 6 }, false, "x").invalid).toHaveLength(1);
    const good = block(toDrawing({ ...newDraft([], "motif"), shapes: [ellipseShape(3, 3, 2, 2)] }));
    expect(blockSource(good, null, { width: 6, height: 6 }, false, "x").invalid).toBeUndefined();
  });
});
