// Lecture d'un PDF produit par l'application, pour les tests : on interprète le flux de contenu de chaque page
// (q, Q, cm, m, l, c, re, h et les opérateurs de peinture) et on rend chaque tracé peint avec sa boîte en points PDF.

import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, PDFRef, PDFName, PDFDict } from "pdf-lib";

export interface PaintedPath {
  /** Boîte englobante en points PDF (origine en bas à gauche). */
  box: { x0: number; y0: number; x1: number; y1: number; width: number; height: number };
  op: string;
  lineWidth: number;
  dash: number[];
}

export interface PageContent {
  width: number;
  height: number;
  paths: PaintedPath[];
  images: number;
  texts: number;
}

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  n[0] * m[0] + n[1] * m[2],
  n[0] * m[1] + n[1] * m[3],
  n[2] * m[0] + n[3] * m[2],
  n[2] * m[1] + n[3] * m[3],
  n[4] * m[0] + n[5] * m[2] + m[4],
  n[4] * m[1] + n[5] * m[3] + m[5],
];
const apply = (m: M, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

function tokenize(src: string): string[] {
  const tokens: string[] = [];
  const re = /\[|\]|<[0-9A-Fa-f\s]*>|\((?:\\.|[^\\)])*\)|\/[^\s/[\]()<>]+|[^\s/[\]()<>]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) tokens.push(m[0]);
  return tokens;
}

function streamsOf(doc: PDFDocument, dict: PDFDict): Uint8Array[] {
  const contents = dict.get(PDFName.of("Contents"));
  const refs: unknown[] = contents instanceof PDFArray ? contents.asArray() : [contents];
  const out: Uint8Array[] = [];
  for (const r of refs) {
    const obj = r instanceof PDFRef ? doc.context.lookup(r) : r;
    if (obj instanceof PDFRawStream) out.push(decodePDFRawStream(obj).decode());
  }
  return out;
}

export async function readPdf(bytes: Uint8Array): Promise<PageContent[]> {
  const doc = await PDFDocument.load(bytes);
  const pages: PageContent[] = [];
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const src = streamsOf(doc, page.node)
      .map((b) => new TextDecoder("latin1").decode(b))
      .join("\n");
    const tokens = tokenize(src);
    const stack: { ctm: M; lw: number; dash: number[] }[] = [];
    let state = { ctm: [1, 0, 0, 1, 0, 0] as M, lw: 1, dash: [] as number[] };
    let operands: string[] = [];
    let pts: { x: number; y: number }[] = [];
    const paths: PaintedPath[] = [];
    let images = 0;
    let texts = 0;
    let arrayDepth = 0;
    let arrayVals: number[] = [];
    for (const t of tokens) {
      if (t === "[") {
        arrayDepth++;
        arrayVals = [];
        continue;
      }
      if (t === "]") {
        arrayDepth--;
        operands.push(`[${arrayVals.join(" ")}]`);
        continue;
      }
      if (arrayDepth > 0) {
        if (!Number.isNaN(Number(t))) arrayVals.push(Number(t));
        continue;
      }
      if (/^[-+.\d]/.test(t) || t.startsWith("/") || t.startsWith("<") || t.startsWith("(")) {
        operands.push(t);
        continue;
      }
      const n = operands.map(Number);
      switch (t) {
        case "q":
          stack.push({ ...state, dash: [...state.dash] });
          break;
        case "Q":
          state = stack.pop() ?? state;
          break;
        case "cm":
          state = { ...state, ctm: mul(state.ctm, n as M) };
          break;
        case "w":
          state.lw = n[0] as number;
          break;
        case "d":
          state.dash = (operands[0] ?? "[]")
            .replace(/[[\]]/g, "")
            .split(" ")
            .filter(Boolean)
            .map(Number);
          break;
        case "m":
        case "l":
          pts.push(apply(state.ctm, n[0] as number, n[1] as number));
          break;
        case "c":
          pts.push(apply(state.ctm, n[0] as number, n[1] as number), apply(state.ctm, n[2] as number, n[3] as number), apply(state.ctm, n[4] as number, n[5] as number));
          break;
        case "re": {
          const [x, y, w, h] = n as [number, number, number, number];
          pts.push(apply(state.ctm, x, y), apply(state.ctm, x + w, y), apply(state.ctm, x + w, y + h), apply(state.ctm, x, y + h));
          break;
        }
        case "h":
          break;
        case "S":
        case "s":
        case "f":
        case "f*":
        case "B":
        case "B*":
        case "b":
        case "n":
        case "W":
          if (t === "W") break;
          if (pts.length > 0 && t !== "n") {
            const xs = pts.map((p) => p.x);
            const ys = pts.map((p) => p.y);
            const x0 = Math.min(...xs);
            const y0 = Math.min(...ys);
            const x1 = Math.max(...xs);
            const y1 = Math.max(...ys);
            const scale = Math.sqrt(Math.abs(state.ctm[0] * state.ctm[3] - state.ctm[1] * state.ctm[2]));
            paths.push({ box: { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0 }, op: t, lineWidth: state.lw * scale, dash: state.dash.map((d) => d * scale) });
          }
          pts = [];
          break;
        case "Do":
          images++;
          break;
        case "Tj":
        case "TJ":
          texts++;
          break;
      }
      operands = [];
    }
    pages.push({ width, height, paths, images, texts });
  }
  return pages;
}
