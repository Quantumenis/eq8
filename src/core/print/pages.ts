// Documents d'impression : bloc (SPEC §9.2), quilt (§9.8), découpe rotative (§9.6) et métrage (§9.11).

import type { Pt } from "../draw/geometry";
import type { Paint } from "../project/model";
import { multiply, rotation, translation, type Mat } from "../quilt/geom";
import type { Scene } from "../quilt/scene";
import { formatLength } from "../units";
import { at, boundaryPath, holedPath, linePath, polyPath, rectPath, transformSegments, type Item, type Page } from "./display";
import { cutLength, fillOf, inchFraction, paintName, type Rounding } from "./format";
import { blockPicture, flowBoxes, keyBlock, lineWidth, pagesOf, sizeText, swatch, withFooters, BLACK, type BlockStyle, type PackBox, type PrintContext } from "./kit";
import { textWidth } from "./measure";
import { pageSize, printableArea, tileContent } from "./paper";
import { rotaryChart, type RotaryCut } from "./rotary";
import { lettersByKey } from "./shapes";
import type { PrintBlock } from "./source";
import { KEY_BLOCK_INCHES, type KeyBlockSize } from "./templates";
import { PRINT_TEXT } from "./texts";
import { formatMeters, formatYards, yardageOf, type YardageOptions, type YardageLine, type CutRect } from "./yardage";

const lineH = (size: number) => (size * 1.3) / 72;

// ---------------------------------------------------------------------------------------------------------------
// Bloc

export interface BlockPrintOptions {
  style: BlockStyle;
  printName: boolean;
  /** « Autant que la page en contient ». */
  fillPage: boolean;
  lineWidth: number;
  blockOutline: boolean;
  pieceOutlines: boolean;
}

export function blockPages(block: PrintBlock, ctx: PrintContext, o: BlockPrintOptions): Page[] {
  const area = printableArea(ctx.setup);
  const lw = lineWidth(ctx, o.lineWidth);
  const picture = blockPicture(block, ctx.project, { style: o.style, width: lw, blockOutline: o.blockOutline, pieceOutlines: o.pieceOutlines });
  const nameH = o.printName ? lineH(ctx.fonts.header.size) + 0.05 : 0;
  const content: Item[] = [...(o.printName ? [{ kind: "text" as const, x: 0, y: (ctx.fonts.header.size / 72) * 1.05, text: block.name, role: "header" as const }] : []), at(0, nameH, picture)];
  const w = block.width;
  const h = block.height + nameH;
  const footerText = `${block.name} — ${sizeText(block.width, block.height, ctx.unit)} — ${ctx.projectName}`;
  if (w > area.width + 1e-9 || h > area.height + 1e-9) {
    return withFooters(ctx, tileContent(content, w, h, ctx.setup, PRINT_TEXT.tiles), footerText);
  }
  const count = o.fillPage ? Math.max(1, Math.floor((area.width + 0.25) / (w + 0.25)) * Math.floor((area.height + 0.25) / (h + 0.25))) : 1;
  const boxes: PackBox[] = Array.from({ length: count }, (_, i) => ({ id: `block:${i}`, w, h, items: content }));
  const { placed } = flowBoxes(boxes, area, 0.25);
  return withFooters(ctx, pagesOf(ctx, boxes, placed), footerText);
}

// ---------------------------------------------------------------------------------------------------------------
// Quilt

export interface QuiltPrintOptions {
  style: "line" | "fabric";
  printName: boolean;
  printSize: boolean;
  blockOutlines: boolean;
  pieceOutlines: boolean;
  lineWidth: number;
}

/** Le dessin d'un quilt dans son repère (pouces, repère du centre). */
export function quiltPicture(scene: Scene, ctx: PrintContext, o: Pick<QuiltPrintOptions, "style" | "blockOutlines" | "pieceOutlines" | "lineWidth">): Item[] {
  const items: Item[] = [];
  const lw = lineWidth(ctx, o.lineWidth);
  for (const layer of [1, 2, 3] as const) {
    for (const p of scene.pieces) {
      if (p.layer !== layer) continue;
      const d = p.block ? holedPath(transformSegments(p.block.piece.boundary, p.block.mat), p.block.piece.holes?.map((h) => transformSegments(h, p.block!.mat))) : polyPath(p.poly);
      if (p.lineOnly) {
        items.push({ kind: "path", d, stroke: { rgb: BLACK, width: lw, dash: [lw * 1.5, lw * 2.5] } });
        continue;
      }
      let fabricMat: Mat | undefined;
      if (p.paint?.kind === "fabric") {
        const off = p.paint.offset ?? { x: 0, y: 0 };
        fabricMat = multiply(translation(p.origin.x, p.origin.y), multiply(rotation(p.angle), multiply(translation(off.x, off.y), rotation(p.paint.rotation ?? 0))));
      }
      const fill = o.style === "fabric" ? (fillOf(ctx.project, p.paint, fabricMat) ?? { kind: "rgb" as const, rgb: "#ffffff" }) : layer > 1 ? { kind: "rgb" as const, rgb: "#ffffff" } : undefined;
      const stroke = o.style === "line" || o.pieceOutlines ? { rgb: BLACK, width: lw } : undefined;
      items.push({ kind: "path", d, ...(fill ? { fill } : {}), ...(stroke ? { stroke } : {}) });
    }
  }
  for (const st of scene.strands) {
    const d = st.strand.segments.flatMap((seg, i) => boundaryPath(transformSegments([seg], st.mat), false).filter((c, k) => i === 0 || k > 0));
    items.push({ kind: "path", d, stroke: { rgb: BLACK, width: lw, ...(st.layer === 3 ? { dash: [lw * 1.5, lw * 2.5] } : {}) } });
  }
  if (o.blockOutlines || o.style === "line") {
    for (const s of scene.slots) items.push({ kind: "path", d: polyPath(s.slot.poly), stroke: { rgb: BLACK, width: lw * 1.5, join: "miter" } });
  }
  const b = scene.bounds;
  items.push({ kind: "path", d: rectPath(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0), stroke: { rgb: BLACK, width: lw * 1.5, join: "miter" } });
  return items;
}

/** Le quilt mis à l'échelle de la page (ce n'est pas du 1:1, SPEC §9.8). */
export function quiltPages(scene: Scene, name: string, ctx: PrintContext, o: QuiltPrintOptions): Page[] {
  const size = pageSize(ctx.setup);
  const area = printableArea(ctx.setup);
  const b = scene.bounds;
  const qw = b.x1 - b.x0;
  const qh = b.y1 - b.y0;
  const items: Item[] = [];
  let top = area.y;
  if (o.printName) {
    top += lineH(ctx.fonts.header.size);
    items.push({ kind: "text", x: area.x, y: top - 0.05, text: name, role: "header", bold: true });
  }
  if (o.printSize) {
    top += lineH(ctx.fonts.number.size);
    items.push({ kind: "text", x: area.x, y: top - 0.03, text: PRINT_TEXT.quilt.size(sizeText(qw, qh, ctx.unit)), role: "number" });
  }
  if (o.printName || o.printSize) top += 0.1;
  const k = Math.min(area.width / qw, (area.y + area.height - top) / qh);
  const x = area.x + (area.width - qw * k) / 2;
  items.push({ kind: "group", mat: [k, 0, 0, k, x - b.x0 * k, top - b.y0 * k], items: quiltPicture(scene, ctx, o) });
  return [{ ...size, items }];
}

// ---------------------------------------------------------------------------------------------------------------
// Découpe rotative

export interface RotaryOptions {
  seam: number;
  rounding: Rounding;
  keyBlock: Exclude<KeyBlockSize, "none">;
}

/** Diagramme de coupe : la bande grise (cotée verticalement) et la première forme découpée en gris foncé. */
function cutDiagram(c: RotaryCut, ctx: PrintContext, rounding: Rounding): { items: Item[]; w: number; h: number } {
  const len = 2.4;
  const k = Math.min(0.9 / c.strip, 1.1 / c.cut, 0.6);
  const sh = c.strip * k;
  const cw = c.cut * k;
  const light = { kind: "rgb" as const, rgb: "#e2e2e2" };
  const dark = { kind: "rgb" as const, rgb: "#a9a9a9" };
  const thin = { rgb: "#555555", width: 0.5 };
  const items: Item[] = [{ kind: "path", d: rectPath(0, 0, len, sh), fill: light }];
  let shape: Pt[];
  const slant = (deg: number) => sh / Math.tan((deg * Math.PI) / 180);
  switch (c.shape) {
    case "parallelogram45":
    case "diamond45":
      shape = [{ x: 0, y: sh }, { x: cw, y: sh }, { x: cw + slant(45), y: 0 }, { x: slant(45), y: 0 }];
      break;
    case "diamond60":
      shape = [{ x: 0, y: sh }, { x: cw, y: sh }, { x: cw + slant(60), y: 0 }, { x: slant(60), y: 0 }];
      break;
    case "equilateral":
      shape = [{ x: 0, y: sh }, { x: cw, y: sh }, { x: cw / 2, y: 0 }];
      break;
    case "trapezoid45":
      shape = [{ x: 0, y: sh }, { x: cw, y: sh }, { x: cw - sh, y: 0 }, { x: sh, y: 0 }];
      break;
    default:
      shape = [{ x: 0, y: 0 }, { x: cw, y: 0 }, { x: cw, y: sh }, { x: 0, y: sh }];
  }
  items.push({ kind: "path", d: polyPath(shape), fill: dark, stroke: thin });
  if (c.shape === "hst" || c.shape === "qst") items.push({ kind: "path", d: linePath({ x: 0, y: sh }, { x: cw, y: 0 }), stroke: { rgb: BLACK, width: 0.6 } });
  if (c.shape === "qst") items.push({ kind: "path", d: linePath({ x: 0, y: 0 }, { x: cw, y: sh }), stroke: { rgb: BLACK, width: 0.6 } });
  // Cotes : la largeur de bande à droite, la longueur de coupe dessous.
  const fs = ctx.fonts.number.size;
  items.push({ kind: "path", d: linePath({ x: len + 0.12, y: 0 }, { x: len + 0.12, y: sh }), stroke: thin });
  items.push({ kind: "path", d: linePath({ x: len + 0.06, y: 0 }, { x: len + 0.18, y: 0 }), stroke: thin });
  items.push({ kind: "path", d: linePath({ x: len + 0.06, y: sh }, { x: len + 0.18, y: sh }), stroke: thin });
  items.push({ kind: "text", x: len + 0.24, y: sh / 2 + (fs * 0.36) / 72, text: cutLength(c.strip, ctx.unit, rounding), role: "number" });
  const dimY = sh + 0.12;
  items.push({ kind: "path", d: linePath({ x: 0, y: dimY }, { x: cw, y: dimY }), stroke: thin });
  items.push({ kind: "path", d: linePath({ x: 0, y: dimY - 0.06 }, { x: 0, y: dimY + 0.06 }), stroke: thin });
  items.push({ kind: "path", d: linePath({ x: cw, y: dimY - 0.06 }, { x: cw, y: dimY + 0.06 }), stroke: thin });
  items.push({ kind: "text", x: cw / 2, y: dimY + lineH(fs), text: cutLength(c.cut, ctx.unit, rounding), role: "number", align: "center" });
  return { items, w: len + 0.24 + textWidth(cutLength(c.strip, ctx.unit, rounding), fs), h: dimY + lineH(fs) + 0.05 };
}

/** Coupe un texte en lignes qui tiennent dans `width` pouces. */
export function wrapText(text: string, size: number, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && textWidth(next, size) > width) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function countGrid(ctx: PrintContext, counts: readonly { paint: Paint | undefined; count: number; extra?: string }[], width: number): { items: Item[]; h: number } {
  const items: Item[] = [];
  const s = 0.28;
  const fs = ctx.fonts.data.size;
  const colW = 1.35;
  const cols = Math.max(1, Math.floor(width / colW));
  counts.forEach((c, i) => {
    const x = (i % cols) * colW;
    const y = Math.floor(i / cols) * (s + 0.1);
    items.push(swatch(ctx.project, c.paint, x, y, s));
    items.push({ kind: "text", x: x + s + 0.08, y: y + s / 2 + (fs * 0.36) / 72 - (c.extra ? lineH(fs) / 2 : 0), text: PRINT_TEXT.rotary.pieces(c.count), role: "data" });
    if (c.extra) items.push({ kind: "text", x: x + s + 0.08, y: y + s / 2 + (fs * 0.36) / 72 + lineH(fs) / 2, text: c.extra, role: "data", rgb: "#555555" });
  });
  return { items, h: Math.ceil(counts.length / cols) * (s + 0.1) };
}

export function rotaryPages(block: PrintBlock, ctx: PrintContext, o: RotaryOptions): Page[] {
  const area = printableArea(ctx.setup);
  const result = rotaryChart(block, o.seam, o.rounding, ctx.unit);
  const boxes: PackBox[] = [];
  const hs = ctx.fonts.header.size;
  const ds = ctx.fonts.data.size;
  const roundingText = ctx.unit === "cm" ? PRINT_TEXT.rotary.rounding.mm : PRINT_TEXT.rotary.rounding[o.rounding];
  const head: Item[] = [
    { kind: "text", x: 0, y: (hs / 72) * 1.05, text: PRINT_TEXT.rotary.title(block.name), role: "header", bold: true },
    { kind: "text", x: 0, y: lineH(hs) + lineH(ds), text: PRINT_TEXT.rotary.settings(cutLength(o.seam, ctx.unit, "1/16"), roundingText), role: "data" },
  ];
  let y = lineH(hs) + lineH(ds) + 0.15;
  const size = KEY_BLOCK_INCHES[o.keyBlock];
  const kb = keyBlock(block, ctx.project, lettersByKey(result.classes), size, ctx.fonts);
  head.push({ kind: "group", mat: [1, 0, 0, 1, 0, y], items: kb.items });
  const colored = keyBlock(block, ctx.project, new Map(), size, ctx.fonts, true);
  head.push({ kind: "group", mat: [1, 0, 0, 1, kb.width + 0.3, y], items: colored.items });
  y += Math.max(kb.height, colored.height) + 0.1;
  boxes.push({ id: "head", w: area.width, h: y, items: head });
  for (const c of result.cuts) {
    const diagram = cutDiagram(c, ctx, o.rounding);
    const leftW = 0.35;
    const rightX = leftW + 3.3;
    const strip = cutLength(c.strip, ctx.unit, o.rounding);
    const cut = cutLength(c.cut, ctx.unit, o.rounding);
    const text = PRINT_TEXT.rotary.instruction[c.shape](strip, cut) + (c.mirrorOf ? ` ${PRINT_TEXT.mirrored(c.mirrorOf)}` : "");
    const lines = wrapText(text, ds, area.width - leftW);
    const grid = countGrid(
      ctx,
      c.counts.map((x) => ({ paint: x.paint, count: x.count, ...(c.perCut > 1 ? { extra: PRINT_TEXT.rotary.cuts(x.cuts, PRINT_TEXT.rotary.squares(x.cuts)) } : {}) })),
      area.width - rightX,
    );
    const rowH = Math.max(diagram.h, grid.h);
    const items: Item[] = [
      { kind: "text", x: 0, y: 0.22, text: c.letter, role: "symbol", size: ctx.fonts.symbol.size * 1.75, bold: true },
      at(leftW, 0.05, diagram.items),
      at(rightX, 0.05, grid.items),
      ...lines.map((l, i): Item => ({ kind: "text", x: leftW, y: 0.05 + rowH + 0.05 + lineH(ds) * (i + 1), text: l, role: "data" })),
      { kind: "path", d: linePath({ x: 0, y: 0 }, { x: area.width, y: 0 }), stroke: { rgb: "#c8c8c8", width: 0.5 } },
    ];
    boxes.push({ id: `row:${c.letter}`, w: area.width, h: 0.05 + rowH + 0.1 + lineH(ds) * lines.length + 0.05, items });
  }
  const notes = result.cuts.length === 0 ? [PRINT_TEXT.rotary.none] : result.omitted.length > 0 ? [PRINT_TEXT.rotary.missing(result.omitted.join(", "))] : [];
  notes.push(PRINT_TEXT.rotary.hint);
  const noteLines = notes.flatMap((n) => wrapText(n, ds, area.width));
  boxes.push({ id: "notes", w: area.width, h: lineH(ds) * (noteLines.length + 0.5), items: noteLines.map((l, i) => ({ kind: "text", x: 0, y: lineH(ds) * (i + 1), text: l, role: "data" })) });
  const { placed } = flowBoxes(boxes, area, 0.12);
  return withFooters(ctx, pagesOf(ctx, boxes, placed), `${block.name} — ${sizeText(block.width, block.height, ctx.unit)} — ${ctx.projectName}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Métrage

export interface YardageDocOptions extends YardageOptions {
  /** Afficher la laize dans l'unité choisie. */
  laizeText: string;
}

export function yardagePages(groups: { id: string; paint: Paint | undefined; rects: CutRect[] }[], name: string, ctx: PrintContext, o: YardageDocOptions): { pages: Page[]; lines: YardageLine[] } {
  const area = printableArea(ctx.setup);
  const lines = yardageOf(groups, o);
  const hs = ctx.fonts.header.size;
  const ns = ctx.fonts.number.size;
  const boxes: PackBox[] = [];
  const settings = PRINT_TEXT.yardage.settings(o.laizeText, cutLength(o.seam, ctx.unit, "1/16")) + (o.fatQuarters ? ` · ${PRINT_TEXT.yardage.fatQuarters(`${inchFraction(o.fatQuarter.length)} × ${inchFraction(o.fatQuarter.width)} po`)}` : "");
  boxes.push({
    id: "head",
    w: area.width,
    h: lineH(hs) + lineH(ns) * 2.5,
    items: [
      { kind: "text", x: 0, y: (hs / 72) * 1.05, text: PRINT_TEXT.yardage.title(name), role: "header", bold: true },
      { kind: "text", x: 0, y: lineH(hs) + lineH(ns), text: settings, role: "number" },
    ],
  });
  const sw = 0.45;
  const colName = sw + 0.15;
  const colPieces = area.width - 2.6;
  const colYard = area.width - 1.6;
  for (const l of lines) {
    const pn = paintName(ctx.project, l.paint);
    const yard = o.fatQuarters ? PRINT_TEXT.yardage.fq(l.fatQuarters) : `${formatYards(l.yards)} (${formatMeters(l.meters)})`;
    const rowItems: Item[] = [
      swatch(ctx.project, l.paint, 0, 0.05, sw),
      { kind: "text", x: colName, y: 0.05 + lineH(ns), text: pn.name, role: "number" },
      ...(pn.reference ? [{ kind: "text" as const, x: colName, y: 0.05 + lineH(ns) * 2, text: pn.reference, role: "number" as const, rgb: "#555555" }] : []),
      { kind: "text", x: colPieces, y: 0.05 + lineH(ns), text: String(l.pieces), role: "number", align: "right" },
      { kind: "text", x: colYard, y: 0.05 + lineH(ns), text: yard, role: "number" },
      { kind: "path", d: linePath({ x: 0, y: sw + 0.12 }, { x: area.width, y: sw + 0.12 }), stroke: { rgb: "#d0d0d0", width: 0.5 } },
    ];
    boxes.push({ id: `y:${l.id}`, w: area.width, h: sw + 0.17, items: rowItems });
  }
  const note = wrapText(lines.length === 0 ? PRINT_TEXT.yardage.empty : PRINT_TEXT.yardage.notes, ctx.fonts.data.size, area.width);
  boxes.push({ id: "notes", w: area.width, h: lineH(ctx.fonts.data.size) * (note.length + 1), items: note.map((t, i) => ({ kind: "text", x: 0, y: lineH(ctx.fonts.data.size) * (i + 1.5), text: t, role: "data" })) });
  const { placed } = flowBoxes(boxes, area, 0.05);
  return { pages: withFooters(ctx, pagesOf(ctx, boxes, placed), `${name} — ${ctx.projectName}`), lines };
}

/** « 42 po (106,7 cm) » ou « 110 cm (43,3 po) ». */
export function laizeText(inches: number, unit: "in" | "cm"): string {
  return unit === "in" ? `${formatLength(inches, "in", 2)} (${formatLength(inches, "cm", 1)})` : `${formatLength(inches, "cm", 1)} (${formatLength(inches, "in", 1)})`;
}

