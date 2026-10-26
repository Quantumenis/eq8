import { contentOfDrawing } from "../core/draw/content";
import type { Piece } from "../core/draw/pieces";
import type { JsonValue } from "../core/project/model";

/**
 * Les pièces d'un dessin du carnet (ou de la bibliothèque), calculées une fois par dessin : les projets étant
 * immuables, un même objet `drawing` a toujours les mêmes pièces.
 */
export function piecesOfDrawing(drawing: JsonValue, width: number, height: number): Piece[] | null {
  if (typeof drawing !== "object" || drawing === null) return null;
  return contentOfDrawing(drawing, width, height).pieces;
}
