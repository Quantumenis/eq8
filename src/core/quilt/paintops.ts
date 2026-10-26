// Coloration au quilt (SPEC §5.2-5.7, §5.15) : pinceaux, bombe, échange, coupe ciblée, rotation du tissu,
// pipettes et outil Aléatoire. Toutes les fonctions sont pures (brouillon → brouillon).

import { hexToRgb, hslToRgb, perceptualDistance, rgbDistance, rgbToHex, rgbToHsl } from "../color/color";
import { samePaint } from "../draw/coloring";
import type { Id, Paint, Project } from "../project/model";
import { distanceToSegment, pointInPolygon, polygonCentroid, type Pt } from "./geom";
import type { QuiltDraft } from "./doc";
import { sameRef, type Scene, type ScenePiece } from "./scene";

type Fills = Readonly<Record<string, Paint>>;

export type ClickMode = "one" | "all" | "alternate";

/** Le mode d'un clic : Ctrl = tous, Alt = un sur deux. */
export function clickMode(ctrl: boolean, alt: boolean): ClickMode {
  return ctrl ? "all" : alt ? "alternate" : "one";
}

function setPaints(draft: QuiltDraft, keys: readonly string[], paintOf: (key: string) => Paint | null): QuiltDraft {
  let fills: Record<string, Paint> | null = null;
  for (const key of keys) {
    const next = paintOf(key);
    if (!next) continue;
    const cur = (fills ?? draft.fills)[key];
    if (cur && JSON.stringify(cur) === JSON.stringify(next)) continue;
    fills ??= { ...draft.fills };
    fills[key] = next;
  }
  return fills ? { doc: draft.doc, fills } : draft;
}

/** Pose un habillage ; ce qu'on pose n'emporte pas la coupe ciblée ni la rotation de l'ancien tissu. */
export function paintKeys(draft: QuiltDraft, keys: readonly string[], paint: Paint): QuiltDraft {
  const clean: Paint = paint.kind === "fabric" ? { kind: "fabric", fabricId: paint.fabricId } : paint;
  return setPaints(draft, keys, () => clean);
}

// ---------------------------------------------------------------------------------------------------------------
// Pinceau

const parity = (p: ScenePiece): number => (p.row + p.col) % 2;

/**
 * Les pièces que touche un clic du pinceau « un point » : la pièce, ou (Ctrl) la même pièce dans tous les blocs
 * identiques, ou (Alt) dans un bloc identique sur deux.
 */
export function brushTargets(scene: Scene, piece: ScenePiece, mode: ClickMode): ScenePiece[] {
  // Texte en applique : un clic colore tout le texte de la boîte.
  if (piece.text) return scene.pieces.filter((p) => p.owner === piece.owner);
  if (mode === "one" || !piece.ref || piece.pieceKey === "") return [piece];
  return scene.pieces.filter(
    (p) => p.layer === piece.layer && p.pieceKey === piece.pieceKey && sameRef(p.ref, piece.ref) && (mode === "all" || (p.role === piece.role && parity(p) === parity(piece))),
  );
}

export type BrushStyle = "dot" | "freehand" | "line" | "rect" | "oval";

/** Échantillonne un chemin : la polyligne (une ligne, un rectangle ou un ovale en contour) en points rapprochés. */
export function sampleStroke(style: BrushStyle, points: readonly Pt[], step = 0.05): Pt[] {
  if (points.length === 0) return [];
  const first = points[0] as Pt;
  const last = points[points.length - 1] as Pt;
  let outline: Pt[];
  if (style === "line") outline = [first, last];
  else if (style === "rect") outline = [first, { x: last.x, y: first.y }, last, { x: first.x, y: last.y }, first];
  else if (style === "oval") {
    const cx = (first.x + last.x) / 2;
    const cy = (first.y + last.y) / 2;
    const rx = Math.abs(last.x - first.x) / 2;
    const ry = Math.abs(last.y - first.y) / 2;
    const n = Math.max(24, Math.ceil((2 * Math.PI * Math.max(rx, ry)) / step));
    outline = Array.from({ length: n + 1 }, (_, i) => ({ x: cx + rx * Math.cos((2 * Math.PI * i) / n), y: cy + ry * Math.sin((2 * Math.PI * i) / n) }));
  } else outline = [...points];
  const out: Pt[] = [outline[0] as Pt];
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i - 1] as Pt;
    const b = outline[i] as Pt;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/** Toutes les pièces touchées par un chemin (pinceaux Main levée, Ligne, Rectangle, Ovale). */
export function piecesTouchedBy(scene: Scene, samples: readonly Pt[], layer: number): ScenePiece[] {
  const hit = new Set<ScenePiece>();
  const candidates = scene.pieces.filter((p) => p.layer === layer && !p.lineOnly);
  const boxes = new Map<ScenePiece, [number, number, number, number]>();
  for (const p of candidates) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const q of p.poly) {
      x0 = Math.min(x0, q.x);
      y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
    }
    boxes.set(p, [x0, y0, x1, y1]);
  }
  for (const s of samples) {
    // Le dernier de la liste est le plus haut : un point ne colore que la pièce visible.
    for (let i = candidates.length - 1; i >= 0; i--) {
      const p = candidates[i] as ScenePiece;
      const b = boxes.get(p) as [number, number, number, number];
      if (s.x < b[0] || s.x > b[2] || s.y < b[1] || s.y > b[3]) continue;
      if (pointInPolygon(p.poly, s)) {
        hit.add(p);
        break;
      }
    }
  }
  return [...hit];
}

// ---------------------------------------------------------------------------------------------------------------
// Bombe et échange

/**
 * Bombe : les pièces semblables (même habillage, pièces non colorées comprises) du bloc de la pièce ; avec Ctrl
 * celles du calque ; avec Alt celles des blocs de même parité. Hors bloc (One Patch, bandes), tout le calque.
 */
export function sprayTargets(scene: Scene, piece: ScenePiece, mode: ClickMode): ScenePiece[] {
  const like = (p: ScenePiece): boolean => samePaint(p.paint, piece.paint);
  const sameLayer = scene.pieces.filter((p) => p.layer === piece.layer && !p.lineOnly && like(p));
  if (piece.pieceKey === "" && piece.role !== "item") {
    // Une pièce d'emplacement : un emplacement non colorié ou un morceau de lattis.
    if (mode === "all") return sameLayer;
    if (mode === "alternate") return sameLayer.filter((p) => parity(p) === parity(piece));
    return sameLayer.filter((p) => p.owner === piece.owner || (p.pieceKey === "" && p.role !== "block" && piece.role !== "block" && p.role === piece.role && p.border === piece.border));
  }
  if (mode === "one") return sameLayer.filter((p) => p.owner === piece.owner);
  if (mode === "all") return sameLayer;
  return sameLayer.filter((p) => parity(p) === parity(piece));
}

/** Échange : toutes les pièces de même habillage, dans tout le quilt (ou, avec `layer`, sur ce calque seulement). */
export function swapTargets(scene: Scene, piece: ScenePiece, layer?: number): ScenePiece[] {
  if (!piece.paint) return [];
  return scene.pieces.filter((p) => p.paint && samePaint(p.paint, piece.paint) && (layer === undefined || p.layer === layer));
}

export function paintPieces(draft: QuiltDraft, pieces: readonly ScenePiece[], paint: Paint): QuiltDraft {
  return paintKeys(
    draft,
    pieces.map((p) => p.key),
    paint,
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Coupe ciblée et rotation du tissu

/** Les pièces qui n'ont pas encore de retouche reprennent l'habillage de leur bloc avant d'être retouchées. */
function withBase(draft: QuiltDraft, piece: ScenePiece): QuiltDraft {
  if (draft.fills[piece.key] || !piece.base) return draft;
  return { doc: draft.doc, fills: { ...draft.fills, [piece.key]: piece.base } };
}

const MAX_OFFSET = 1000;
const roundTo = (v: number, p = 1e9): number => Math.round(v * p) / p;

function fabricWith(paint: Extract<Paint, { kind: "fabric" }>, patch: { offset?: { x: number; y: number }; rotation?: number }): Paint {
  const out: Extract<Paint, { kind: "fabric" }> = { kind: "fabric", fabricId: paint.fabricId };
  const offset = patch.offset ?? paint.offset;
  const rotation = patch.rotation ?? paint.rotation ?? 0;
  if (offset && (offset.x !== 0 || offset.y !== 0)) out.offset = offset;
  if (rotation !== 0) out.rotation = rotation;
  return out;
}

/** Normalise un angle dans [0, 360) (arrondi pour éviter la dérive). */
export const normalizeAngle = (a: number): number => {
  const r = roundTo(((a % 360) + 360) % 360, 1e6);
  return r >= 360 ? 0 : r;
};

/** Le décalage du tissu est exprimé dans le repère du tissu (tourné) : on ramène un déplacement du centre. */
export function toFabricSpace(piece: ScenePiece, dx: number, dy: number): Pt {
  const paint = piece.paint;
  const rot = ((piece.angle + (paint?.kind === "fabric" ? (paint.rotation ?? 0) : 0)) * Math.PI) / 180;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: c * dx + s * dy, y: -s * dx + c * dy };
}

/** Décale le tissu d'une pièce de (dx, dy) pouces mesurés dans le repère du centre. */
export function fussyCutPiece(draft: QuiltDraft, piece: ScenePiece, dx: number, dy: number): QuiltDraft {
  const d = withBase(draft, piece);
  const paint = d.fills[piece.key];
  if (!paint || paint.kind !== "fabric" || (dx === 0 && dy === 0)) return draft;
  const v = toFabricSpace(piece, dx, dy);
  const cur = paint.offset ?? { x: 0, y: 0 };
  const offset = {
    x: roundTo(Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, cur.x + v.x))),
    y: roundTo(Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, cur.y + v.y))),
  };
  return { doc: d.doc, fills: { ...d.fills, [piece.key]: fabricWith(paint, { offset }) } };
}

export type RotateMethod = "simple" | "advanced" | "edge";

/** Rotation avancée : « départ + 360/n » au premier clic (pièce non tournée), puis + 360/n à chaque clic (SPEC §5.6). */
export function advancedRotation(current: number, start: number, n: number): number {
  const step = 360 / Math.max(1, Math.min(16, Math.round(n)));
  return normalizeAngle(current === 0 ? start + step : current + step);
}

/** Rotation simple : + 90° dans le sens horaire. */
export const simpleRotation = (current: number): number => normalizeAngle(current + 90);

/** Les arêtes d'une pièce, de la plus longue à la plus courte : angle (degrés) et longueur. */
export function edgesByLength(poly: readonly Pt[]): { angle: number; length: number; a: Pt; b: Pt }[] {
  const edges = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length] as Pt;
    return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y), angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
  });
  return edges.filter((e) => e.length > 1e-9).sort((x, y) => y.length - x.length || x.angle - y.angle);
}

/** Aligne le tissu sur l'arête n° `edgeIndex` (0 = la plus longue), puis tourne de `quarters` quarts de tour. */
export function alignedRotation(piece: ScenePiece, edgeIndex: number, quarters = 0): number | null {
  const edges = edgesByLength(piece.poly);
  if (edges.length === 0) return null;
  const e = edges[((edgeIndex % edges.length) + edges.length) % edges.length];
  if (!e) return null;
  return normalizeAngle(e.angle - piece.angle + quarters * 90);
}

export function rotateFabric(draft: QuiltDraft, pieces: readonly ScenePiece[], rotationOf: (piece: ScenePiece, current: number) => number | null): QuiltDraft {
  let next = draft;
  for (const piece of pieces) {
    const d = withBase(next, piece);
    const paint = d.fills[piece.key];
    if (!paint || paint.kind !== "fabric") continue;
    const rotation = rotationOf(piece, paint.rotation ?? 0);
    if (rotation === null) continue;
    next = { doc: d.doc, fills: { ...d.fills, [piece.key]: fabricWith({ ...paint, rotation: undefined }, { rotation: normalizeAngle(rotation) }) } };
  }
  return next;
}

// ---------------------------------------------------------------------------------------------------------------
// Pipettes (SPEC §5.7)

export function pipetteFabric(project: Project, paint: Paint | undefined): Paint | null {
  if (!paint) return null;
  if (paint.kind === "fabric") return { kind: "fabric", fabricId: paint.fabricId };
  return nearest(project.sketchbook.fabrics, (f) => f.averageColor, paint.rgb, (f) => ({ kind: "fabric", fabricId: f.id }));
}

export function pipetteColor(project: Project, paint: Paint | undefined): Paint | null {
  if (!paint) return null;
  if (paint.kind === "solid") return { kind: "solid", rgb: paint.rgb };
  const avg = project.sketchbook.fabrics.find((f) => f.id === paint.fabricId)?.averageColor;
  return avg ? nearest(project.sketchbook.colors, (c) => c.rgb, avg, (c) => ({ kind: "solid", rgb: c.rgb })) : null;
}

function nearest<T>(items: readonly T[], rgbOf: (item: T) => string, target: string, make: (item: T) => Paint): Paint | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const item of items) {
    const d = perceptualDistance(rgbOf(item), target);
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  }
  return best ? make(best) : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Aléatoire (SPEC §5.15, Q-5.5, Q-5.6)

/** Les pas sont sur l'échelle 0-240 du sélecteur Windows : ±40 = ±60° de teinte, ±20 = ±1/12 de saturation ou de luminosité. */
export const SCALE_240 = 240;

/** Décale une couleur : teinte (circulaire), saturation et luminosité (elles saturent aux extrêmes). */
export function shiftColor(hex: string, dHue: number, dSat: number, dLight: number): string {
  const hsl = rgbToHsl(hexToRgb(hex));
  const h = (((hsl.h + (dHue * 360) / SCALE_240) % 360) + 360) % 360;
  const s = Math.min(1, Math.max(0, hsl.s + dSat / SCALE_240));
  const l = Math.min(1, Math.max(0, hsl.l + dLight / SCALE_240));
  return rgbToHex(hslToRgb({ h, s, l }));
}

/** La couleur moyenne d'un habillage (un tissu devient sa couleur moyenne unie). */
export function averageOf(project: Project, paint: Paint): string {
  return paint.kind === "solid" ? paint.rgb : (project.sketchbook.fabrics.find((f) => f.id === paint.fabricId)?.averageColor ?? "#9e9e9e");
}

export type RandomizeOptions =
  | { kind: "shift"; hue: number; saturation: number; lightness: number }
  | { kind: "random"; seed: number }
  | { kind: "matchColors"; tolerance: number }
  | { kind: "matchFabrics"; tolerance: number };

/** Petit générateur déterministe (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * L'outil Aléatoire : s'applique à toutes les pièces colorées du quilt (les autres ne sont jamais touchées).
 * - « shift » : chaque habillage devient sa couleur moyenne unie, puis la teinte, la saturation et la luminosité sont décalées ;
 * - « random » : chaque couleur distincte est remplacée par un uni du carnet tiré au hasard, sans doublon tant que possible ;
 * - « matchColors » / « matchFabrics » : l'uni ou le tissu du carnet le plus proche, seulement si l'écart RVB ≤ tolérance.
 */
export function randomize(draft: QuiltDraft, scene: Scene, project: Project, options: RandomizeOptions): QuiltDraft {
  const colored = scene.pieces.filter((p) => p.paint && !p.lineOnly);
  const keys = colored.map((p) => p.key);
  const paintOf = new Map(colored.map((p) => [p.key, p.paint as Paint]));
  // Les pièces qui n'ont pas de retouche gardent leur habillage de bloc : on l'écrit au quilt seulement si elle change.
  const newPaint = (paint: Paint): Paint | null => {
    switch (options.kind) {
      case "shift": {
        const avg = averageOf(project, paint);
        return { kind: "solid", rgb: shiftColor(avg, options.hue, options.saturation, options.lightness) };
      }
      case "matchColors": {
        const avg = averageOf(project, paint);
        const best = closest(project.sketchbook.colors.map((c) => c.rgb), avg);
        return best && rgbDistance(best, avg) <= options.tolerance ? { kind: "solid", rgb: best } : null;
      }
      case "matchFabrics": {
        const avg = averageOf(project, paint);
        let best: { id: Id; rgb: string } | null = null;
        let bestD = Infinity;
        for (const f of project.sketchbook.fabrics) {
          const d = rgbDistance(f.averageColor, avg);
          if (d < bestD) {
            bestD = d;
            best = { id: f.id, rgb: f.averageColor };
          }
        }
        return best && bestD <= options.tolerance ? { kind: "fabric", fabricId: best.id } : null;
      }
      case "random":
        return null;
    }
  };
  if (options.kind === "random") {
    const palette = project.sketchbook.colors.map((c) => c.rgb);
    if (palette.length === 0) return draft;
    const next = rng(options.seed);
    const distinct: string[] = [];
    for (const k of keys) {
      const id = paintId(paintOf.get(k) as Paint);
      if (!distinct.includes(id)) distinct.push(id);
    }
    const bag: string[] = [];
    const mapping = new Map<string, string>();
    for (const id of distinct) {
      if (bag.length === 0) bag.push(...palette);
      const at = Math.floor(next() * bag.length);
      mapping.set(id, bag.splice(at, 1)[0] as string);
    }
    return setPaints(draft, keys, (k) => ({ kind: "solid", rgb: mapping.get(paintId(paintOf.get(k) as Paint)) as string }));
  }
  return setPaints(draft, keys, (k) => newPaint(paintOf.get(k) as Paint));
}

const paintId = (p: Paint): string => (p.kind === "solid" ? `s:${p.rgb.toLowerCase()}` : `f:${p.fabricId}`);

function closest(colors: readonly string[], target: string): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of colors) {
    const d = rgbDistance(c, target);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export { distanceToSegment, polygonCentroid };
export type { Fills };
