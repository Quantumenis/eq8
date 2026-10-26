// La scène d'un quilt : toutes les pièces à dessiner ou à colorer, calques 1 à 3, avec leur clé de coloration.
//
// Clés (clés de `QuiltItem.fills`) :
//  - emplacement sans bloc, ou pièce sans dessin : la clé de l'emplacement ;
//  - bloc posé dans un emplacement : « emplacement/clé de pièce » ;
//  - élément libre : « identifiant/clé de pièce ».
// Une pièce de bloc non retouchée au quilt prend l'habillage de la coloration du bloc.

import { easyDrawSegments } from "../draw/draft";
import { analyzeBlock, type Piece } from "../draw/pieces";
import { samePaint } from "../draw/coloring";
import type { BlockItem, Id, Paint, Project } from "../project/model";
import { findBlock } from "../project/model";
import type { Layer, FreeItem, QuiltDoc, QuiltDraft, SetBlock } from "./doc";
import { resolveRef } from "./doc";
import {
  applyMat,
  boxOf,
  framePolygon,
  frameMat,
  multiply,
  polygonCentroid,
  rotation,
  scaling,
  skewingX,
  translation,
  type Frame,
  type Mat,
  type Pt,
} from "./geom";
import { buildLayout, type LayoutResult, type Slot, type SlotRole } from "./layout";

// ---------------------------------------------------------------------------------------------------------------
// Pièces d'un bloc du carnet (mises en cache : un projet est immuable)

const pieceCache = new WeakMap<object, { width: number; height: number; pieces: Piece[] }>();

export function piecesOfBlock(block: BlockItem): Piece[] {
  const drawing = block.drawing;
  const segments = easyDrawSegments(drawing) ?? [];
  if (typeof drawing === "object" && drawing !== null) {
    const hit = pieceCache.get(drawing);
    if (hit && hit.width === block.width && hit.height === block.height) return hit.pieces;
  }
  const pieces = analyzeBlock(block.width, block.height, segments).pieces;
  if (typeof drawing === "object" && drawing !== null) pieceCache.set(drawing, { width: block.width, height: block.height, pieces });
  return pieces;
}

// ---------------------------------------------------------------------------------------------------------------
// Transformations

/** La transformation du carré unité : miroir d'abord, puis `rot` quarts de tour horaires, autour du centre. */
export function unitTransform(rot: number, flip: boolean): Mat {
  let m: Mat = translation(-0.5, -0.5);
  if (flip) m = multiply(scaling(-1, 1), m);
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) m = multiply([0, 1, -1, 0, 0, 0], m);
  return multiply(translation(0.5, 0.5), m);
}

/** Le cadre d'un élément libre, du carré unité vers le repère du centre. */
export function itemMat(item: Pick<FreeItem, "x" | "y" | "w" | "h" | "angle" | "skew">): Mat {
  const c = { x: item.x + item.w / 2, y: item.y + item.h / 2 };
  let m = translation(-0.5, -0.5);
  m = multiply(scaling(item.w, item.h), m);
  m = multiply(skewingX(item.skew), m);
  m = multiply(rotation(item.angle), m);
  return multiply(translation(c.x, c.y), m);
}

export function itemPolygon(item: FreeItem): Pt[] {
  const m = itemMat(item);
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ].map((p) => applyMat(m, p));
}

/** Angle (degrés) de l'axe x d'une matrice : l'orientation du tissu posé dans une pièce de bloc. */
export function matAngle(m: Mat): number {
  return (Math.atan2(m[1], m[0]) * 180) / Math.PI;
}

// ---------------------------------------------------------------------------------------------------------------
// La scène

export interface ScenePiece {
  /** Clé de `QuiltDraft.fills`. */
  key: string;
  /** Clé de la clé de pièce du bloc (vide hors bloc). */
  pieceKey: string;
  /** Emplacement ou élément libre auquel la pièce appartient. */
  owner: string;
  layer: Layer;
  /** Identifiant de l'élément libre, s'il y en a un. */
  itemId?: Id;
  role: SlotRole | "item";
  /** Contour aplati dans le repère du centre (test de clic, découpe). */
  poly: Pt[];
  /** Dessin exact (arcs) d'une pièce de bloc, et la matrice du repère du bloc vers le centre. */
  block?: { piece: Piece; mat: Mat };
  /** Origine et orientation du tissu : le coin du bloc, tourné comme le bloc. */
  origin: Pt;
  angle: number;
  /** L'habillage que la coloration du bloc donne à cette pièce. */
  base?: Paint;
  /** L'habillage effectif (coloration au quilt, sinon celle du bloc). */
  paint?: Paint;
  /** Dessin au trait seulement (pochoirs du calque 3). */
  lineOnly: boolean;
  /** Le bloc posé (identité du bloc et de sa coloration) pour « blocs identiques ». */
  ref?: { blockId: Id; coloringId: Id | "" };
  /** Position pour « un sur deux ». */
  row: number;
  col: number;
}

export interface SceneItem {
  item: FreeItem;
  poly: Pt[];
  mat: Mat;
}

export interface SceneSlot {
  slot: Slot;
  placed: SetBlock | null;
  ref: { blockId: Id; coloringId: Id | "" } | null;
}

export interface Scene {
  width: number;
  height: number;
  layout: LayoutResult;
  slots: SceneSlot[];
  items: SceneItem[];
  pieces: ScenePiece[];
}

function blockMatFor(block: BlockItem, frame: Mat, rot: number, flip: boolean): Mat {
  return multiply(frame, multiply(unitTransform(rot, flip), scaling(1 / block.width, 1 / block.height)));
}

function blockPieces(
  project: Project,
  block: BlockItem,
  coloringId: Id | "",
  frame: Mat,
  rot: number,
  flip: boolean,
  fills: Readonly<Record<string, Paint>>,
  ownerKey: string,
  keyPrefix: string,
  layer: Layer,
  extra: Pick<ScenePiece, "owner" | "role" | "row" | "col"> & { itemId?: Id },
  lineOnly: boolean,
): ScenePiece[] {
  const coloring = coloringId ? block.colorings.find((c) => c.id === coloringId) : undefined;
  const mat = blockMatFor(block, frame, rot, flip);
  const origin = applyMat(mat, { x: 0, y: 0 });
  const angle = matAngle(mat);
  void ownerKey;
  return piecesOfBlock(block).map((piece) => {
    const key = `${keyPrefix}/${piece.key}`;
    const base = coloring?.fills[piece.key];
    const paint = fills[key] ?? base;
    const sp: ScenePiece = {
      key,
      pieceKey: piece.key,
      layer,
      poly: piece.polygon.map((p) => applyMat(mat, p)),
      block: { piece, mat },
      origin,
      angle,
      lineOnly,
      ref: { blockId: block.id, coloringId },
      ...extra,
    };
    if (base) sp.base = base;
    if (paint) sp.paint = paint;
    return sp;
  });
}

/** Construit la scène : pièces du calque 1 (emplacements et éléments), puis calques 2 et 3, dans l'ordre d'affichage. */
export function buildScene(project: Project, draft: QuiltDraft, layout: LayoutResult = buildLayout(draft.doc.layout)): Scene {
  const { doc, fills } = draft;
  const pieces: ScenePiece[] = [];
  const slots: SceneSlot[] = [];
  const items: SceneItem[] = [];

  for (const slot of layout.slots) {
    const placed = doc.set[slot.key] ?? null;
    const ref = placed ? resolveRef(project, placed) : null;
    const block = ref ? findBlock(project, ref.blockId)?.block : undefined;
    slots.push({ slot, placed, ref });
    if (placed && ref && block && slot.frame) {
      pieces.push(
        ...blockPieces(
          project,
          block,
          ref.coloringId,
          frameMat(slot.frame),
          placed.rot,
          placed.flip,
          fills,
          slot.key,
          slot.key,
          1,
          { owner: slot.key, role: slot.role, row: slot.row, col: slot.col },
          false,
        ),
      );
    } else {
      const paint = fills[slot.key];
      const box = boxOf(slot.poly);
      const sp: ScenePiece = {
        key: slot.key,
        pieceKey: "",
        owner: slot.key,
        layer: 1,
        role: slot.role,
        poly: slot.poly,
        origin: { x: box.x0, y: box.y0 },
        angle: 0,
        lineOnly: false,
        row: slot.row,
        col: slot.col,
      };
      if (paint) sp.paint = paint;
      pieces.push(sp);
    }
  }

  const sceneItems = [...doc.items].sort((a, b) => a.layer - b.layer);
  for (const item of sceneItems) {
    const ref = resolveRef(project, item);
    const block = ref ? findBlock(project, ref.blockId)?.block : undefined;
    const mat = itemMat(item);
    items.push({ item, poly: itemPolygon(item), mat });
    if (!ref || !block) continue;
    pieces.push(
      ...blockPieces(
        project,
        block,
        ref.coloringId,
        mat,
        item.rot,
        item.flip,
        fills,
        item.id,
        item.id,
        item.layer,
        { owner: item.id, itemId: item.id, role: "item", row: 0, col: 0 },
        item.layer === 3,
      ),
    );
  }

  return { width: layout.width, height: layout.height, layout, slots, items, pieces };
}

/** Les clés de coloration qui existent dans la scène (les autres viennent d'une disposition changée). */
export function liveKeys(scene: Scene): Set<string> {
  return new Set(scene.pieces.map((p) => p.key));
}

export function piecesAt(scene: Scene, p: Pt, layer?: Layer): ScenePiece[] {
  const hits: ScenePiece[] = [];
  for (const piece of scene.pieces) {
    if (layer && piece.layer !== layer) continue;
    if (piece.lineOnly) continue;
    if (pointInPoly(piece.poly, p)) hits.push(piece);
  }
  return hits;
}

/** La pièce visible sous un point : la plus haute dans l'ordre d'affichage. */
export function pieceAtPoint(scene: Scene, p: Pt, layer?: Layer): ScenePiece | null {
  const hits = piecesAt(scene, p, layer);
  return hits.length > 0 ? (hits[hits.length - 1] as ScenePiece) : null;
}

function pointInPoly(poly: readonly Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Pt;
    const b = poly[j] as Pt;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** L'emplacement dont le cadre contient le point (pour poser un bloc). */
export function slotAtPoint(scene: Scene, p: Pt): SceneSlot | null {
  for (let i = scene.slots.length - 1; i >= 0; i--) {
    const s = scene.slots[i] as SceneSlot;
    if (!s.slot.frame) continue;
    if (pointInPoly(s.slot.poly, p)) return s;
  }
  return null;
}

/** L'élément libre le plus haut sous le point (cadre pivoté compris). */
export function itemAtPoint(scene: Scene, p: Pt, layer?: Layer): SceneItem | null {
  for (let i = scene.items.length - 1; i >= 0; i--) {
    const it = scene.items[i] as SceneItem;
    if (layer && it.item.layer !== layer) continue;
    if (pointInPoly(it.poly, p)) return it;
  }
  return null;
}

export const sameRef = (a: { blockId: Id; coloringId: Id | "" } | null | undefined, b: { blockId: Id; coloringId: Id | "" } | null | undefined): boolean =>
  !!a && !!b && a.blockId === b.blockId && a.coloringId === b.coloringId;

export { polygonCentroid, framePolygon, samePaint };
export type { Frame };
