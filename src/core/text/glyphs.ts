// Texte en applique (SPEC §4.15) : les glyphes d'une police deviennent des pièces (les contours intérieurs d'un « A »
// ou d'un « O » sont des trous). La taille donnée est la hauteur d'une capitale, en pouces.

import type { Font, PathCommand } from "opentype.js";
import { cubicToSegments, type Cubic } from "../draw/bezier";
import type { Pt, Segment } from "../draw/geometry";
import { areaAndCentroid, flatten, pieceFromBoundary, type Piece } from "../draw/pieces";

export type TextAlign = "left" | "center" | "right";

export interface TextSpec {
  text: string;
  family: string;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  /** Hauteur d'une capitale, en pouces. */
  size: number;
}

export const DEFAULT_TEXT: TextSpec = { text: "", family: "Arial", bold: false, italic: false, align: "left", size: 1 };
export const MIN_TEXT_SIZE = 0.2;
export const MAX_TEXT_SIZE = 12;
export const MAX_TEXT_CHARS = 400;

export interface TextBlock {
  /** Taille de la boîte : l'encre du texte, calée sur le coin haut-gauche. */
  width: number;
  height: number;
  /** Une pièce par lettre (ou par morceau de lettre), avec ses trous. */
  pieces: Piece[];
}

interface Contour {
  segments: Segment[];
  polygon: Pt[];
  area: number;
}

function quadToCubic(p0: Pt, q: Pt, p: Pt): Cubic {
  return {
    p0,
    p1: { x: p0.x + (2 / 3) * (q.x - p0.x), y: p0.y + (2 / 3) * (q.y - p0.y) },
    p2: { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) },
    p3: p,
  };
}

/** Les contours fermés d'un tracé opentype (y vers le bas, comme le bloc). */
function contoursOf(commands: readonly PathCommand[], id: string): Contour[] {
  const out: Contour[] = [];
  let cubics: Cubic[] = [];
  let start: Pt = { x: 0, y: 0 };
  let cur: Pt = start;
  const close = (): void => {
    if (cubics.length > 0 && (Math.abs(cur.x - start.x) > 1e-9 || Math.abs(cur.y - start.y) > 1e-9)) {
      cubics.push({ p0: cur, p1: cur, p2: start, p3: start });
    }
    if (cubics.length > 1) {
      const segments: Segment[] = [];
      cubics.forEach((c, i) => segments.push(...cubicToSegments(c, `${id}.${out.length}.${i}`)));
      if (segments.length >= 3) {
        const polygon = flatten(segments);
        out.push({ segments, polygon, area: areaAndCentroid(segments).area });
      }
    }
    cubics = [];
  };
  for (const c of commands) {
    if (c.type === "M") {
      close();
      start = { x: c.x as number, y: c.y as number };
      cur = start;
    } else if (c.type === "L") {
      const p = { x: c.x as number, y: c.y as number };
      cubics.push({ p0: cur, p1: cur, p2: p, p3: p });
      cur = p;
    } else if (c.type === "Q") {
      const p = { x: c.x as number, y: c.y as number };
      cubics.push(quadToCubic(cur, { x: c.x1 as number, y: c.y1 as number }, p));
      cur = p;
    } else if (c.type === "C") {
      const p = { x: c.x as number, y: c.y as number };
      cubics.push({ p0: cur, p1: { x: c.x1 as number, y: c.y1 as number }, p2: { x: c.x2 as number, y: c.y2 as number }, p3: p });
      cur = p;
    } else close();
  }
  close();
  return out;
}

function containsPoint(poly: readonly Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Pt;
    const b = poly[j] as Pt;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Un point franchement à l'intérieur d'un contour (le milieu de sa plus longue corde horizontale). */
function insidePointOf(c: Contour): Pt {
  const ys = c.polygon.map((p) => p.y);
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  const xs: number[] = [];
  const poly = c.polygon;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Pt;
    const b = poly[j] as Pt;
    if (a.y > y !== b.y > y) xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
  }
  xs.sort((p, q) => p - q);
  let best = { x: poly[0]?.x ?? 0, y, w: -1 };
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const w = (xs[k + 1] as number) - (xs[k] as number);
    if (w > best.w) best = { x: ((xs[k] as number) + (xs[k + 1] as number)) / 2, y, w };
  }
  return { x: best.x, y: best.y };
}

/** Regroupe des contours en (contour extérieur, trous) selon leur imbrication. */
function groupContours(contours: readonly Contour[]): { outer: Contour; holes: Contour[] }[] {
  const sorted = [...contours].sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const inside = sorted.map((c) => insidePointOf(c));
  const depth = sorted.map((_, i) => {
    let d = 0;
    for (let j = 0; j < i; j++) if (containsPoint((sorted[j] as Contour).polygon, inside[i] as Pt)) d++;
    return d;
  });
  const groups: { outer: Contour; holes: Contour[] }[] = [];
  sorted.forEach((c, i) => {
    if ((depth[i] as number) % 2 === 0) groups.push({ outer: c, holes: [] });
  });
  sorted.forEach((c, i) => {
    if ((depth[i] as number) % 2 === 0) return;
    // Le trou appartient au plus petit contour extérieur qui le contient.
    let host: (typeof groups)[number] | undefined;
    for (const g of groups) {
      if (containsPoint(g.outer.polygon, inside[i] as Pt) && (!host || Math.abs(g.outer.area) < Math.abs(host.outer.area))) host = g;
    }
    host?.holes.push(c);
  });
  return groups;
}

function capHeightOf(font: Font): number {
  const h = font.charToGlyph("H").getBoundingBox();
  const cap = h.y2 - h.y1;
  return cap > 0 ? cap : font.unitsPerEm * 0.7;
}

/** Les pièces d'un texte dans une police. `null` si le texte est vide. */
export function textBlock(font: Font, spec: TextSpec): TextBlock | null {
  const lines = spec.text.slice(0, MAX_TEXT_CHARS).split("\n");
  if (lines.every((l) => l.trim() === "")) return null;
  const size = Math.max(MIN_TEXT_SIZE, Math.min(MAX_TEXT_SIZE, spec.size));
  const em = (size * font.unitsPerEm) / capHeightOf(font); // taille de la police (pouces) pour que la capitale mesure `size`
  const k = em / font.unitsPerEm;
  const lineHeight = em * 1.2;
  // Largeur de chaque ligne, pour l'alignement.
  const layouts = lines.map((line) => {
    const glyphs = font.stringToGlyphs(line);
    const xs: number[] = [];
    let x = 0;
    glyphs.forEach((g, i) => {
      xs.push(x);
      x += (g.advanceWidth ?? 0) * k;
      const next = glyphs[i + 1];
      if (next) x += font.getKerningValue(g, next) * k;
    });
    return { glyphs, xs, width: x };
  });
  const widest = Math.max(...layouts.map((l) => l.width));
  const raw: { contours: Contour[] }[] = [];
  layouts.forEach((layout, row) => {
    const dx = spec.align === "center" ? (widest - layout.width) / 2 : spec.align === "right" ? widest - layout.width : 0;
    const baseline = row * lineHeight;
    layout.glyphs.forEach((g, i) => {
      const path = g.getPath(dx + (layout.xs[i] as number), baseline, em);
      const contours = contoursOf(path.commands, `g${row}.${i}`);
      if (contours.length > 0) raw.push({ contours });
    });
  });
  if (raw.length === 0) return null;
  // Boîte de l'encre, ramenée au coin haut-gauche.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const g of raw) {
    for (const c of g.contours) {
      for (const p of c.polygon) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
    }
  }
  const shift = (segs: readonly Segment[]): Segment[] =>
    segs.map((s) =>
      s.kind === "line"
        ? { id: s.id, kind: "line" as const, a: { x: s.a.x - x0, y: s.a.y - y0 }, b: { x: s.b.x - x0, y: s.b.y - y0 } }
        : { id: s.id, kind: "arc" as const, a: { x: s.a.x - x0, y: s.a.y - y0 }, b: { x: s.b.x - x0, y: s.b.y - y0 }, sagitta: s.sagitta },
    );
  const pieces: Piece[] = [];
  const seen = new Map<string, number>();
  for (const g of raw) {
    for (const grp of groupContours(g.contours)) {
      const piece = pieceFromBoundary(shift(grp.outer.segments), "t", grp.holes.map((h) => shift(h.segments)));
      if (!piece) continue;
      const n = seen.get(piece.key) ?? 0;
      seen.set(piece.key, n + 1);
      if (n > 0) piece.key = `${piece.key}-${n + 1}`;
      pieces.push(piece);
    }
  }
  if (pieces.length === 0) return null;
  return { width: Math.max(0.01, x1 - x0), height: Math.max(0.01, y1 - y0), pieces };
}
