// Sortie PDF de la liste d'affichage (SPEC §10.4) : vectorielle, à l'échelle 1:1 (1 po = 72 pt).
// Chaque page commence par la matrice [72 0 0 −72 0 H] : tout le contenu est ensuite écrit en pouces, y vers le bas,
// exactement comme dans la liste d'affichage. Les arcs deviennent des Béziers cubiques (au plus 90° chacun), les
// tissus des images répétées et découpées à la forme de la pièce, les textes utilisent une police système intégrée
// par sous-ensemble (Q-9.10), ou Helvetica (mêmes métriques qu'Arial) si elle manque.

import fontkit from "@pdf-lib/fontkit";
import {
  appendBezierCurve,
  beginText,
  clip,
  closePath,
  concatTransformationMatrix,
  drawObject,
  endPath,
  endText,
  fill,
  fillAndStroke,
  lineTo,
  LineCapStyle,
  LineJoinStyle,
  moveTo,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  setDashPattern,
  setFillingRgbColor,
  setFontAndSize,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  showText,
  StandardFonts,
  stroke as strokeOp,
  type PDFFont,
  type PDFImage,
  type PDFOperator,
  type PDFPage,
} from "pdf-lib";
import { applyMat, invertMat, multiply, type Mat } from "../quilt/geom";
import { arcToBeziers, matScale, type Fill, type FontRole, type Item, type PathCmd, type PrintDoc, type PrintFonts, type Stroke } from "./display";

/** Une tuile de tissu : ses octets (PNG ou JPEG) et sa taille réelle en pouces. */
export interface FabricTile {
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
}

export interface PdfOptions {
  fonts: PrintFonts;
  /** Octets d'une police système (TrueType), ou rien pour se rabattre sur Helvetica. */
  fontBytes?: (family: string, bold: boolean) => Uint8Array | null | undefined;
  fabrics?: (fabricId: string) => FabricTile | null | undefined;
  author?: string;
  /** Date de création fixe (tests reproductibles). */
  date?: Date;
}

/** Au-delà, un tissu est rendu par sa couleur moyenne (pièce immense ou tuile minuscule). */
const MAX_TILES_PER_FILL = 4000;

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1] as string, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

class FontSet {
  private readonly cache = new Map<string, PDFFont>();
  constructor(
    private readonly doc: PDFDocument,
    private readonly options: PdfOptions,
  ) {}

  async get(family: string, bold: boolean): Promise<{ font: PDFFont; standard: boolean }> {
    const key = `${family}|${bold}`;
    const hit = this.cache.get(key);
    if (hit) return { font: hit, standard: hit.name.startsWith("Helvetica") };
    let font: PDFFont | null = null;
    const bytes = this.options.fontBytes?.(family, bold);
    if (bytes) {
      try {
        font = await this.doc.embedFont(bytes, { subset: true });
      } catch {
        font = null;
      }
    }
    font ??= await this.doc.embedFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
    this.cache.set(key, font);
    return { font, standard: !bytes || font.name.startsWith("Helvetica") };
  }
}

/** Remplace les caractères qu'une police standard (WinAnsi) ne sait pas écrire. */
function encodable(font: PDFFont, text: string): string {
  try {
    font.encodeText(text);
    return text;
  } catch {
    let out = "";
    for (const ch of text) {
      try {
        font.encodeText(ch);
        out += ch;
      } catch {
        out += "?";
      }
    }
    return out;
  }
}

function pathOps(d: readonly PathCmd[]): PDFOperator[] {
  const ops: PDFOperator[] = [];
  for (const c of d) {
    if (c.op === "M") ops.push(moveTo(c.x, c.y));
    else if (c.op === "L") ops.push(lineTo(c.x, c.y));
    else if (c.op === "C") ops.push(appendBezierCurve(c.x1, c.y1, c.x2, c.y2, c.x, c.y));
    else if (c.op === "A") for (const b of arcToBeziers(c)) ops.push(appendBezierCurve(b.x1, b.y1, b.x2, b.y2, b.x, b.y));
    else ops.push(closePath());
  }
  return ops;
}

function strokeOps(s: Stroke, scale: number): PDFOperator[] {
  const [r, g, b] = hexRgb(s.rgb);
  const k = 1 / 72 / scale;
  return [
    setStrokingRgbColor(r, g, b),
    setLineWidth(s.width * k),
    setLineJoin(s.join === "miter" ? LineJoinStyle.Miter : LineJoinStyle.Round),
    setLineCap(s.join === "miter" ? LineCapStyle.Butt : LineCapStyle.Round),
    setDashPattern(
      (s.dash ?? []).map((v) => v * k),
      0,
    ),
  ];
}

/** Boîte d'un tracé (points de contrôle compris : elle contient la courbe). */
function pathBox(d: readonly PathCmd[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const c of d) {
    if (c.op === "M" || c.op === "L") grow(c.x, c.y);
    else if (c.op === "C") {
      grow(c.x1, c.y1);
      grow(c.x2, c.y2);
      grow(c.x, c.y);
    } else if (c.op === "A") {
      grow(c.cx - c.r, c.cy - c.r);
      grow(c.cx + c.r, c.cy + c.r);
    }
  }
  return { x0, y0, x1, y1 };
}

class PageWriter {
  readonly ops: PDFOperator[] = [];
  private readonly fontNames = new Map<PDFFont, string>();
  private readonly imageNames = new Map<PDFImage, string>();

  constructor(
    private readonly page: PDFPage,
    private readonly fonts: FontSet,
    private readonly options: PdfOptions,
    private readonly images: Map<string, PDFImage | null>,
    private readonly doc: PDFDocument,
  ) {}

  private fontName(font: PDFFont): string {
    let name = this.fontNames.get(font);
    if (!name) {
      name = this.page.node.newFontDictionary(font.name, font.ref).toString().replace(/^\//, "");
      this.fontNames.set(font, name);
    }
    return name;
  }

  private imageName(image: PDFImage): string {
    let name = this.imageNames.get(image);
    if (!name) {
      name = this.page.node.newXObject("Im", image.ref).toString().replace(/^\//, "");
      this.imageNames.set(image, name);
    }
    return name;
  }

  private async tileImage(fabricId: string): Promise<{ image: PDFImage; tile: FabricTile } | null> {
    const tile = this.options.fabrics?.(fabricId);
    if (!tile) return null;
    let image = this.images.get(fabricId);
    if (image === undefined) {
      try {
        image = tile.mime === "image/jpeg" ? await this.doc.embedJpg(tile.bytes) : await this.doc.embedPng(tile.bytes);
      } catch {
        image = null;
      }
      this.images.set(fabricId, image);
    }
    return image ? { image, tile } : null;
  }

  private async fillFabric(d: readonly PathCmd[], f: Extract<Fill, { kind: "fabric" }>): Promise<void> {
    const [r, g, b] = hexRgb(f.rgb);
    // La couleur moyenne d'abord : elle bouche les joints entre les tuiles.
    this.ops.push(setFillingRgbColor(r, g, b), ...pathOps(d), fill());
    const found = await this.tileImage(f.fabricId);
    const inv = invertMat(f.mat);
    if (!found || !inv) return;
    const { image, tile } = found;
    const box = pathBox(d);
    let u0 = Infinity;
    let v0 = Infinity;
    let u1 = -Infinity;
    let v1 = -Infinity;
    for (const p of [
      { x: box.x0, y: box.y0 },
      { x: box.x1, y: box.y0 },
      { x: box.x0, y: box.y1 },
      { x: box.x1, y: box.y1 },
    ]) {
      const q = applyMat(inv, p);
      u0 = Math.min(u0, q.x);
      v0 = Math.min(v0, q.y);
      u1 = Math.max(u1, q.x);
      v1 = Math.max(v1, q.y);
    }
    const i0 = Math.floor(u0 / tile.width);
    const i1 = Math.floor(u1 / tile.width);
    const j0 = Math.floor(v0 / tile.height);
    const j1 = Math.floor(v1 / tile.height);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > MAX_TILES_PER_FILL) return;
    const name = this.imageName(image);
    this.ops.push(pushGraphicsState(), ...pathOps(d), clip(), endPath());
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const m = multiply(f.mat, [tile.width, 0, 0, -tile.height, i * tile.width, (j + 1) * tile.height]);
        this.ops.push(pushGraphicsState(), concatTransformationMatrix(...m), drawObject(name), popGraphicsState());
      }
    }
    this.ops.push(popGraphicsState());
  }

  async items(list: readonly Item[], scale: number): Promise<void> {
    for (const it of list) {
      if (it.kind === "group") {
        this.ops.push(pushGraphicsState(), concatTransformationMatrix(...it.mat));
        if (it.clip) this.ops.push(...pathOps(it.clip), clip(), endPath());
        await this.items(it.items, scale * matScale(it.mat));
        this.ops.push(popGraphicsState());
      } else if (it.kind === "path") {
        if (it.fill?.kind === "fabric") {
          await this.fillFabric(it.d, it.fill);
          if (it.stroke) this.ops.push(...strokeOps(it.stroke, scale), ...pathOps(it.d), endStroke());
          continue;
        }
        if (it.fill) {
          const [r, g, b] = hexRgb(it.fill.rgb);
          this.ops.push(setFillingRgbColor(r, g, b));
        }
        if (it.stroke) this.ops.push(...strokeOps(it.stroke, scale));
        this.ops.push(...pathOps(it.d));
        if (it.fill && it.stroke) this.ops.push(fillAndStroke());
        else if (it.fill) this.ops.push(fill());
        else if (it.stroke) this.ops.push(endStroke());
        else this.ops.push(endPath());
      } else {
        await this.text(it, scale);
      }
    }
  }

  private async text(it: Extract<Item, { kind: "text" }>, scale: number): Promise<void> {
    const spec = this.options.fonts[it.role as FontRole];
    const size = it.size ?? spec.size;
    const { font } = await this.fonts.get(spec.family, it.bold ?? false);
    const text = encodable(font, it.text);
    if (text.length === 0) return;
    const width = font.widthOfTextAtSize(text, size) / 72;
    const x = it.align === "center" ? it.x - width / 2 : it.align === "right" ? it.x - width : it.x;
    const k = size / 72;
    const [r, g, b] = hexRgb(it.rgb ?? "#000000");
    void scale;
    this.ops.push(
      setFillingRgbColor(r, g, b),
      beginText(),
      setFontAndSize(this.fontName(font), 1),
      setTextMatrix(k, 0, 0, -k, x, it.y),
      showText(font.encodeText(text)),
      endText(),
    );
  }
}

/** « S » : pdf-lib l'appelle `stroke`, renommé ici pour ne pas le confondre avec le type Stroke. */
const endStroke = (): PDFOperator => strokeOp();

/** Écrit le document en PDF. */
export async function writePdf(docModel: PrintDoc, options: PdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const date = options.date ?? new Date();
  doc.setTitle(docModel.title);
  doc.setCreator("Quilt Studio");
  doc.setProducer("Quilt Studio");
  if (options.author) doc.setAuthor(options.author);
  doc.setCreationDate(date);
  doc.setModificationDate(date);
  const fonts = new FontSet(doc, options);
  const images = new Map<string, PDFImage | null>();
  for (const pageModel of docModel.pages) {
    const page = doc.addPage([pageModel.width * 72, pageModel.height * 72]);
    const writer = new PageWriter(page, fonts, options, images, doc);
    const base: Mat = [72, 0, 0, -72, 0, pageModel.height * 72];
    writer.ops.push(pushGraphicsState(), concatTransformationMatrix(...base));
    await writer.items(pageModel.items, 1);
    writer.ops.push(popGraphicsState());
    page.pushOperators(...writer.ops);
  }
  return doc.save();
}

