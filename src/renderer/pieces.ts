import { easyDrawSegments } from "../core/draw/draft";
import { analyzeBlock, type Piece } from "../core/draw/pieces";
import type { JsonValue } from "../core/project/model";

const cache = new WeakMap<object, { width: number; height: number; pieces: Piece[] }>();

/**
 * Les pièces d'un dessin du carnet (ou de la bibliothèque), calculées une fois par dessin : les projets étant
 * immuables, un même objet `drawing` a toujours les mêmes pièces.
 */
export function piecesOfDrawing(drawing: JsonValue, width: number, height: number): Piece[] | null {
  const segments = easyDrawSegments(drawing);
  if (!segments || typeof drawing !== "object" || drawing === null) return null;
  const hit = cache.get(drawing);
  if (hit && hit.width === width && hit.height === height) return hit.pieces;
  const pieces = analyzeBlock(width, height, segments).pieces;
  cache.set(drawing, { width, height, pieces });
  return pieces;
}
