import fs from "node:fs";
import path from "node:path";
import { parse, type Font } from "opentype.js";
import { describe, expect, it } from "vitest";
import { textBlock, DEFAULT_TEXT } from "../../src/core/text/glyphs";
import { groupFonts, readFontNames, variantOf } from "../../src/core/text/sfnt";
import { setFontLookup, textBlockOf } from "../../src/core/text/registry";
import { pieceAt } from "../../src/core/draw/pieces";

const FONTS = path.join(process.env.WINDIR ?? "C:\\Windows", "Fonts");
const arialFile = path.join(FONTS, "arial.ttf");
const hasArial = fs.existsSync(arialFile);

function load(file: string): Font {
  const buf = fs.readFileSync(file);
  return parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
}

describe.skipIf(!hasArial)("Texte en applique (Arial)", () => {
  const font = hasArial ? load(arialFile) : (null as unknown as Font);

  it("« A » donne une pièce avec un trou, et « O » aussi", () => {
    const a = textBlock(font, { ...DEFAULT_TEXT, text: "A", size: 2 });
    expect(a?.pieces).toHaveLength(1);
    expect(a?.pieces[0]?.holes).toHaveLength(1);
    expect(a?.pieces[0]?.holePolygons).toHaveLength(1);
    // Le trou est de sens inverse : l'aire de la pièce est celle du contour moins celle du trou.
    const o = textBlock(font, { ...DEFAULT_TEXT, text: "O", size: 2 });
    expect(o?.pieces[0]?.holes).toHaveLength(1);
    const piece = o?.pieces[0];
    expect(piece).toBeDefined();
    const middle = { x: (piece?.bounds.x0 ?? 0) + ((piece?.bounds.x1 ?? 0) - (piece?.bounds.x0 ?? 0)) / 2, y: (piece?.bounds.y0 ?? 0) + ((piece?.bounds.y1 ?? 0) - (piece?.bounds.y0 ?? 0)) / 2 };
    // Le centre du « O » est dans le trou : aucune pièce n'est cliquée.
    expect(pieceAt(o?.pieces ?? [], middle)).toBeNull();
    // Mais l'anneau est cliqué.
    expect(pieceAt(o?.pieces ?? [], { x: (piece?.bounds.x0 ?? 0) + 0.05, y: middle.y })).toBe(piece);
    // Un « B » a deux trous ; un « I » aucun.
    expect(textBlock(font, { ...DEFAULT_TEXT, text: "B" })?.pieces[0]?.holes).toHaveLength(2);
    expect(textBlock(font, { ...DEFAULT_TEXT, text: "I" })?.pieces[0]?.holes).toBeUndefined();
  });

  it("la taille « 2 po » donne une capitale d'environ 2 po (± 15 %)", () => {
    for (const size of [1, 2, 3.5]) {
      const h = textBlock(font, { ...DEFAULT_TEXT, text: "H", size });
      expect(h).not.toBeNull();
      expect(Math.abs((h?.height ?? 0) / size - 1)).toBeLessThan(0.15);
    }
  });

  it("plusieurs lignes, alignement, texte vide", () => {
    const one = textBlock(font, { ...DEFAULT_TEXT, text: "AB", size: 1 });
    const two = textBlock(font, { ...DEFAULT_TEXT, text: "AB\nAB", size: 1 });
    expect(two?.height ?? 0).toBeGreaterThan((one?.height ?? 0) * 1.8);
    expect(two?.pieces.length).toBe(4);
    const left = textBlock(font, { ...DEFAULT_TEXT, text: "AAAA\nA", size: 1 });
    const right = textBlock(font, { ...DEFAULT_TEXT, text: "AAAA\nA", size: 1, align: "right" });
    const lastLeft = left?.pieces[left.pieces.length - 1];
    const lastRight = right?.pieces[right.pieces.length - 1];
    expect((lastRight?.bounds.x0 ?? 0) - (lastLeft?.bounds.x0 ?? 0)).toBeGreaterThan(1.5);
    expect(textBlock(font, { ...DEFAULT_TEXT, text: "   " })).toBeNull();
    expect(textBlock(font, { ...DEFAULT_TEXT, text: "" })).toBeNull();
  });

  it("le bloc est calé sur son coin haut-gauche", () => {
    const t = textBlock(font, { ...DEFAULT_TEXT, text: "Quilt", size: 1.5 });
    expect(Math.min(...(t?.pieces.map((p) => p.bounds.x0) ?? [1]))).toBeCloseTo(0, 4);
    expect(Math.min(...(t?.pieces.map((p) => p.bounds.y0) ?? [1]))).toBeCloseTo(0, 4);
    expect(Math.max(...(t?.pieces.map((p) => p.bounds.x1) ?? [0]))).toBeCloseTo(t?.width ?? -1, 4);
  });

  it("le registre rend un bloc quand la police est là, rien sinon", () => {
    const spec = { ...DEFAULT_TEXT, text: "Ab", size: 1 };
    setFontLookup(() => null);
    expect(textBlockOf(spec)).toBeNull();
    setFontLookup((family) => (family === "Arial" ? font : null));
    expect(textBlockOf(spec)?.pieces.length).toBe(2);
    expect(textBlockOf(spec)).toBe(textBlockOf(spec)); // mis en cache
    setFontLookup(() => null);
  });
});

describe.skipIf(!hasArial)("Noms des polices installées", () => {
  it("Arial et sa variante grasse sont reconnues", async () => {
    const read = (file: string) => async (offset: number, length: number) => {
      const fd = fs.openSync(file, "r");
      try {
        const buf = Buffer.alloc(length);
        const n = fs.readSync(fd, buf, 0, length, offset);
        return new Uint8Array(buf.buffer, buf.byteOffset, n);
      } finally {
        fs.closeSync(fd);
      }
    };
    const names = await readFontNames(read(arialFile), fs.statSync(arialFile).size);
    expect(names?.family).toBe("Arial");
    expect(names?.bold).toBe(false);
    const boldFile = path.join(FONTS, "arialbd.ttf");
    const bold = await readFontNames(read(boldFile), fs.statSync(boldFile).size);
    expect(bold).toMatchObject({ family: "Arial", bold: true, italic: false });
    expect(variantOf(bold ?? { bold: false, italic: false })).toBe("bold");
    const grouped = groupFonts([
      { file: "arial.ttf", names: names! },
      { file: "arialbd.ttf", names: bold! },
    ]);
    expect(grouped).toEqual([{ family: "Arial", files: { regular: "arial.ttf", bold: "arialbd.ttf" } }]);
  });

  it("un fichier qui n'est pas une police est refusé", async () => {
    const junk = new Uint8Array(64).fill(7);
    expect(await readFontNames(async (o, l) => junk.subarray(o, o + l), junk.length)).toBeNull();
  });
});
