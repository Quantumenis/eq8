// Ce qu'on imprime (SPEC §9.1) : un « bloc d'impression », c'est-à-dire des pièces à leur taille finie, dans un repère
// en pouces dont l'origine est le coin haut-gauche du bloc. Il vient du plan Bloc (le bloc et sa coloration, à la taille
// du plan ou à une taille personnalisée) ou du plan Quilt (l'élément cliqué : bloc posé, lattis, cornerstone, bloc de
// bordure, bande, élément libre — « Utiliser la taille du quilt », blocs déformés compris).

import type { Pt, Segment } from "../draw/geometry";
import { interiorPoint, type Piece } from "../draw/pieces";
import type { BlockItem, Coloring, Paint, Project } from "../project/model";
import { applyMat, multiply, rotation as rotationDeg, scaling, translation, type Mat } from "../quilt/geom";
import { contentOfBlock, piecesOfBlock, type Scene, type ScenePiece } from "../quilt/scene";
import { flattenBoundary, transformSegments } from "./display";
import { signedAreaOf } from "./offset";

export interface PrintPiece {
  /** Clé de coloration (bloc : clé de pièce ; quilt : clé de la scène). */
  key: string;
  /** Contour exact (arcs compris), sens positif. */
  boundary: Segment[];
  /** Contour aplati à 10⁻⁴ po. */
  polygon: Pt[];
  /** Trous (texte) : contours exacts, de sens inverse, et leur aplati. */
  holes?: Segment[][];
  holePolygons?: Pt[][];
  area: number;
  /** Un point bien à l'intérieur (lettres, étiquettes). */
  inner: Pt;
  paint?: Paint;
  /** Direction du droit-fil (radians) dans le repère d'impression : l'axe x du tissu posé. */
  grain: number;
  /** Décalage (coupe ciblée) et origine du tissu dans le repère d'impression, pour « avec les tissus ». */
  fabricMat?: Mat;
}

export interface PrintBlock {
  name: string;
  width: number;
  height: number;
  pieces: PrintPiece[];
  /** Les coutures (chacune une fois), pour le dessin au trait et le pochoir. */
  lines: Segment[];
  /** Les pièces ont-elles des courbes ? */
  curved: boolean;
  /** Clés des pièces dont le contour se coupe lui-même (applique) : les gabarits ne s'impriment pas. */
  invalid?: string[];
}

/** Contour en sens positif (aire positive dans le repère y vers le bas). */
export function orient(segs: Segment[]): Segment[] {
  const poly = flattenBoundary(segs, 1e-3);
  if (signedAreaOf(poly) >= 0) return segs;
  return [...segs].reverse().map((s) => (s.kind === "line" ? { ...s, a: s.b, b: s.a } : { ...s, a: s.b, b: s.a, sagitta: -s.sagitta }));
}

function makePiece(key: string, boundary: Segment[], paint: Paint | undefined, grain: number, fabricMat?: Mat, holes: readonly (readonly Segment[])[] = []): PrintPiece {
  const b = orient(boundary);
  const polygon = flattenBoundary(b);
  const area = Math.abs(signedAreaOf(polygon));
  const fake = { polygon, centroid: centroidOf(polygon), area } as unknown as Piece;
  const p: PrintPiece = { key, boundary: b, polygon, area, inner: interiorPoint(fake), grain };
  if (holes.length > 0) {
    // Le contour est de sens positif : les trous tournent dans l'autre sens.
    const fixed = holes.map((h) => (signedAreaOf(flattenBoundary(h, 1e-3)) > 0 ? reverseSegments(h) : [...h]));
    p.holes = fixed;
    p.holePolygons = fixed.map((h) => flattenBoundary(h));
    p.inner = interiorPoint({ ...fake, holePolygons: p.holePolygons } as unknown as Piece);
  }
  if (paint) p.paint = paint;
  if (fabricMat) p.fabricMat = fabricMat;
  return p;
}

function reverseSegments(segs: readonly Segment[]): Segment[] {
  return [...segs].reverse().map((s) => (s.kind === "line" ? { ...s, a: s.b, b: s.a } : { ...s, a: s.b, b: s.a, sagitta: -s.sagitta }));
}

function centroidOf(poly: readonly Pt[]): Pt {
  const a = signedAreaOf(poly);
  if (Math.abs(a) < 1e-12) return poly[0] ?? { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as Pt;
    const q = poly[(i + 1) % poly.length] as Pt;
    const k = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * k;
    cy += (p.y + q.y) * k;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Clé d'une couture, indépendante du sens de parcours. */
function edgeKey(s: Segment): string {
  const r = (v: number) => Math.round(v * 1e5);
  const fw = `${r(s.a.x)},${r(s.a.y)}`;
  const bw = `${r(s.b.x)},${r(s.b.y)}`;
  const sag = s.kind === "arc" ? r(s.sagitta) : 0;
  return fw <= bw ? `${s.kind}|${fw}|${bw}|${sag}` : `${s.kind}|${bw}|${fw}|${-sag}`;
}

export function uniqueEdges(pieces: readonly PrintPiece[]): Segment[] {
  const seen = new Map<string, Segment>();
  for (const p of pieces) for (const s of p.boundary) if (!seen.has(edgeKey(s))) seen.set(edgeKey(s), s);
  return [...seen.values()];
}

/** Matrice de la taille finie et du miroir : le bloc de `w0 × h0` devient `w × h`, retourné horizontalement si demandé. */
function sizeMat(w0: number, h0: number, w: number, h: number, mirror: boolean): Mat {
  const m: Mat = scaling(w / w0, h / h0);
  return mirror ? multiply([-1, 0, 0, 1, w, 0], m) : m;
}

/** Un bloc du carnet (ou du plan Bloc) : coloration choisie (null = dessin au trait), taille et miroir. */
export function blockSource(block: BlockItem, coloring: Coloring | null, size: { width: number; height: number }, mirror: boolean, name: string): PrintBlock {
  const m = sizeMat(block.width, block.height, size.width, size.height, mirror);
  const pieces = piecesOfBlock(block).map((piece) => {
    const paint = coloring?.fills[piece.key];
    const fabricMat = paintMat(paint, mirror ? [-1, 0, 0, 1, size.width, 0] : [1, 0, 0, 1, 0, 0]);
    return makePiece(piece.key, transformSegments(piece.boundary, m), paint, 0, fabricMat, (piece.holes ?? []).map((h) => transformSegments(h, m)));
  });
  const drawing = contentOfBlock(block).lines;
  const outline: Segment[] = [
    { id: "o1", kind: "line", a: { x: 0, y: 0 }, b: { x: block.width, y: 0 } },
    { id: "o2", kind: "line", a: { x: block.width, y: 0 }, b: { x: block.width, y: block.height } },
    { id: "o3", kind: "line", a: { x: block.width, y: block.height }, b: { x: 0, y: block.height } },
    { id: "o4", kind: "line", a: { x: 0, y: block.height }, b: { x: 0, y: 0 } },
  ];
  const lines = transformSegments([...outline, ...drawing], m);
  const invalid = contentOfBlock(block).issues.filter((i) => i.kind === "selfIntersect").map((i) => (i.kind === "selfIntersect" ? i.key : ""));
  return { name, width: size.width, height: size.height, pieces, lines, curved: lines.some((s) => s.kind === "arc"), ...(invalid.length > 0 ? { invalid } : {}) };
}

/** Origine du tissu (coupe ciblée comprise) : le coin du bloc, décalé de `offset`, tourné de `rotation`. */
function paintMat(paint: Paint | undefined, base: Mat): Mat | undefined {
  if (!paint || paint.kind !== "fabric") return undefined;
  const off = paint.offset ?? { x: 0, y: 0 };
  return multiply(base, multiply(translation(off.x, off.y), rotationDeg(paint.rotation ?? 0)));
}

export interface QuiltElement {
  /** Emplacement ou élément libre (le `owner` des pièces de la scène). */
  owner: string;
  name: string;
  /** Taille finie dans le quilt (cadre redressé). */
  width: number;
  height: number;
  /** Contour dans le repère du centre (mise en évidence en vert). */
  outline: Pt[];
}

/** Le repère redressé d'un élément du quilt : son côté « haut » devient horizontal. */
function elementFrame(scene: Scene, owner: string): { angle: number; outline: Pt[] } | null {
  const slot = scene.slots.find((s) => s.slot.key === owner);
  if (slot) {
    const f = slot.slot.frame;
    return { angle: f ? Math.atan2(f.u.y, f.u.x) : 0, outline: slot.slot.poly };
  }
  const item = scene.items.find((i) => i.item.id === owner);
  if (item) return { angle: Math.atan2(item.mat[1], item.mat[0]), outline: item.poly };
  return null;
}

function scenePieceBoundary(p: ScenePiece): Segment[] {
  if (p.block) return transformSegments(p.block.piece.boundary, p.block.mat);
  return p.poly.map((a, i) => ({ id: `e${i}`, kind: "line" as const, a, b: p.poly[(i + 1) % p.poly.length] as Pt }));
}

/** Les pièces d'un élément du quilt, dans le repère du centre puis redressées et calées à l'origine. */
function elementPieces(scene: Scene, owner: string): { pieces: ScenePiece[]; mat: Mat; width: number; height: number; outline: Pt[] } | null {
  const frame = elementFrame(scene, owner);
  const pieces = scene.pieces.filter((p) => p.owner === owner && !p.lineOnly);
  if (!frame || pieces.length === 0) return null;
  const r = rotationDeg((-frame.angle * 180) / Math.PI);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of frame.outline) {
    const q = applyMat(r, p);
    x0 = Math.min(x0, q.x);
    y0 = Math.min(y0, q.y);
    x1 = Math.max(x1, q.x);
    y1 = Math.max(y1, q.y);
  }
  return { pieces, mat: multiply(translation(-x0, -y0), r), width: x1 - x0, height: y1 - y0, outline: frame.outline };
}

/** Description de l'élément cliqué du quilt : nom, taille finie, contour. */
export function quiltElement(scene: Scene, project: Project, owner: string, names: Record<string, string>): QuiltElement | null {
  const e = elementPieces(scene, owner);
  if (!e) return null;
  const ref = e.pieces.find((p) => p.ref)?.ref;
  const block = ref ? [...project.sketchbook.blocks, ...project.sketchbook.motifs, ...project.sketchbook.stencils].find((b) => b.id === ref.blockId) : undefined;
  const role = e.pieces[0]?.role ?? "block";
  const name = block?.card.name || names[role] || names.block || "";
  return { owner, name, width: e.width, height: e.height, outline: e.outline };
}

/**
 * Les pièces d'un élément du quilt à imprimer. Sans `size`, c'est « Utiliser la taille du quilt » (les blocs
 * étirés ou déformés le restent) ; avec `size`, le bloc redressé est mis à cette taille.
 */
export function quiltSource(scene: Scene, owner: string, name: string, size: { width: number; height: number } | null, mirror: boolean): PrintBlock | null {
  const e = elementPieces(scene, owner);
  if (!e) return null;
  const w = size?.width ?? e.width;
  const h = size?.height ?? e.height;
  const m = multiply(sizeMat(e.width, e.height, w, h, mirror), e.mat);
  const pieces = e.pieces.map((sp) => {
    const boundary = transformSegments(scenePieceBoundary(sp), m);
    const fabricAngle = sp.angle + (sp.paint?.kind === "fabric" ? (sp.paint.rotation ?? 0) : 0);
    const a = (fabricAngle * Math.PI) / 180;
    const grain = Math.atan2(m[1] * Math.cos(a) + m[3] * Math.sin(a), m[0] * Math.cos(a) + m[2] * Math.sin(a));
    let fabricMat: Mat | undefined;
    if (sp.paint?.kind === "fabric") {
      const off = sp.paint.offset ?? { x: 0, y: 0 };
      const world = multiply(translation(sp.origin.x, sp.origin.y), multiply(rotationDeg(sp.angle), multiply(translation(off.x, off.y), rotationDeg(sp.paint.rotation ?? 0))));
      fabricMat = multiply(m, world);
    }
    return makePiece(sp.key, boundary, sp.paint, grain, fabricMat, (sp.block?.piece.holes ?? []).map((h) => transformSegments(h, multiply(m, sp.block!.mat))));
  });
  const lines = uniqueEdges(pieces);
  return { name, width: w, height: h, pieces, lines, curved: lines.some((s) => s.kind === "arc") };
}
