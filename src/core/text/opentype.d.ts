// Déclarations minimales d'opentype.js 2.0.0 (le paquet ne livre pas de types) : seul ce que Quilt Studio utilise.

declare module "opentype.js" {
  export interface PathCommand {
    type: "M" | "L" | "Q" | "C" | "Z";
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }
  export interface Path {
    commands: PathCommand[];
  }
  export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }
  export interface Glyph {
    advanceWidth?: number;
    getPath(x?: number, y?: number, fontSize?: number): Path;
    getBoundingBox(): BoundingBox;
  }
  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    names: Record<string, Record<string, string>>;
    stringToGlyphs(text: string): Glyph[];
    charToGlyph(char: string): Glyph;
    getKerningValue(left: Glyph, right: Glyph): number;
  }
  export function parse(buffer: ArrayBuffer): Font;
}
