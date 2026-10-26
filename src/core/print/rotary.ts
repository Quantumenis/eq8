// Tableau de découpe rotative (SPEC §9.6, Q-9.6) : pour chaque lettre de pièce découpable au cutter, la largeur de
// la bande, la longueur de coupe et le nombre de pièces par couleur.
// Méthode exacte : la pièce est mise dans son orientation de coupe, décalée de la marge avec des coins en onglet,
// puis on mesure sa boîte (p. 226 : « prolonger les lignes de marge aux coins jusqu'à leur croisement, puis mesurer »)
// et on arrondit au plus proche (1/8 ou 1/16 po, ou au millimètre en métrique ; sans arrondi : au millième).

import type { Pt } from "../draw/geometry";
import type { DisplayUnit } from "../units";
import { rotation } from "../quilt/geom";
import { applyMat } from "../quilt/geom";
import { roundCut, type Rounding } from "./format";
import { seamOffset } from "./offset";
import { classifyPieces, recognize, type PieceClass, type RotaryShape } from "./shapes";
import type { PrintBlock } from "./source";

/** Les onglets des formes reconnues (angles ≥ 45°… jusqu'à 30° pour le trapèze) ne sont jamais écrêtés ici. */
const ROTARY_MITER_LIMIT = 10;

export interface RotaryCount {
  id: string;
  paint: PieceClass["counts"][number]["paint"];
  /** Nombre de pièces finies. */
  count: number;
  /** Nombre de formes à couper dans la bande (carrés pour les triangles demi-carré et quart de carré). */
  cuts: number;
}

export interface RotaryCut {
  letter: string;
  mirrorOf?: string;
  shape: RotaryShape;
  /** Largeur de la bande et longueur de coupe, arrondies (pouces). */
  strip: number;
  cut: number;
  /** Les mêmes, exactes. */
  exactStrip: number;
  exactCut: number;
  /** Pièces obtenues par forme coupée : 2 (une diagonale), 4 (deux diagonales) ou 1. */
  perCut: number;
  counts: RotaryCount[];
  cls: PieceClass;
}

export interface RotaryResult {
  cuts: RotaryCut[];
  /** Lettres des pièces non découpables au cutter (à imprimer en gabarits). */
  omitted: string[];
  classes: PieceClass[];
}

function bbox(poly: readonly Pt[]): { w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { w: x1 - x0, h: y1 - y0 };
}

/** Longueur du plus long côté horizontal (à 10⁻⁶ près) d'un polygone. */
function longestHorizontal(poly: readonly Pt[]): number {
  let best = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Pt;
    const b = poly[(i + 1) % poly.length] as Pt;
    if (Math.abs(a.y - b.y) < 1e-6) best = Math.max(best, Math.abs(a.x - b.x));
  }
  return best;
}

/** Largeur de bande et longueur de coupe exactes d'une forme reconnue, mise dans son orientation de coupe. */
export function cutSize(polygon: readonly Pt[], shape: RotaryShape, align: number, seam: number): { strip: number; cut: number } {
  const r = rotation((align * 180) / Math.PI);
  const aligned = polygon.map((p) => applyMat(r, p));
  const cutLine = seamOffset(aligned, seam, ROTARY_MITER_LIMIT);
  const { w, h } = bbox(cutLine);
  switch (shape) {
    case "square":
    case "hst":
      return { strip: Math.max(w, h), cut: Math.max(w, h) };
    case "qst":
      return { strip: w, cut: w };
    case "rectangle":
      return { strip: Math.min(w, h), cut: Math.max(w, h) };
    case "equilateral":
      return { strip: h, cut: w };
    case "parallelogram45":
    case "diamond45":
    case "diamond60":
    case "trapezoid45":
      return { strip: h, cut: longestHorizontal(cutLine) };
  }
}

const PER_CUT: Record<RotaryShape, number> = {
  square: 1,
  rectangle: 1,
  hst: 2,
  qst: 4,
  parallelogram45: 1,
  diamond45: 1,
  diamond60: 1,
  equilateral: 1,
  trapezoid45: 1,
};

export function rotaryChart(block: PrintBlock, seam: number, rounding: Rounding, unit: DisplayUnit): RotaryResult {
  const classes = classifyPieces(block.pieces);
  const cuts: RotaryCut[] = [];
  const omitted: string[] = [];
  for (const cls of classes) {
    const rec = recognize(cls.first);
    if (!rec) {
      omitted.push(cls.letter);
      continue;
    }
    const exact = cutSize(cls.first.polygon, rec.shape, rec.align, seam);
    const perCut = PER_CUT[rec.shape];
    cuts.push({
      letter: cls.letter,
      ...(cls.mirrorOf ? { mirrorOf: cls.mirrorOf } : {}),
      shape: rec.shape,
      strip: roundCut(exact.strip, rounding, unit),
      cut: roundCut(exact.cut, rounding, unit),
      exactStrip: exact.strip,
      exactCut: exact.cut,
      perCut,
      counts: cls.counts.map((c) => ({ id: c.id, paint: c.paint, count: c.count, cuts: Math.ceil(c.count / perCut) })),
      cls,
    });
  }
  return { cuts, omitted, classes };
}
