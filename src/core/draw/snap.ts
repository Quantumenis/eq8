// Accrochage : un point brut (souris) devient un point de grille, un nœud du dessin ou un point d'une ligne.
// Priorité : nœud > grille > ligne. La tolérance est donnée en pixels écran, puis convertie en pouces selon le zoom.

import { clamp, dist, project, samePoint, type Pt, type Segment } from "./geometry";

export interface SnapSettings {
  width: number;
  height: number;
  /** Nombre de points d'accrochage sur la largeur et sur la hauteur (un point tous les width / snapX). */
  snapX: number;
  snapY: number;
  toGrid: boolean;
  toNodes: boolean;
  toLines: boolean;
}

export type SnapKind = "node" | "grid" | "line" | "free";

export interface SnapResult {
  point: Pt;
  kind: SnapKind;
}

/** Tolérance d'accrochage en pouces : `pixels` écran à l'échelle `pixelsPerInch` (zoom compris). */
export function toleranceInInches(pixels: number, pixelsPerInch: number): number {
  return pixels / pixelsPerInch;
}

/** Point de grille le plus proche (toujours dans le bloc). */
export function nearestGridPoint(p: Pt, s: Pick<SnapSettings, "width" | "height" | "snapX" | "snapY">): Pt {
  const stepX = s.width / Math.max(1, s.snapX);
  const stepY = s.height / Math.max(1, s.snapY);
  return {
    x: clamp(Math.round(p.x / stepX), 0, s.snapX) * stepX,
    y: clamp(Math.round(p.y / stepY), 0, s.snapY) * stepY,
  };
}

/** Extrémités des segments : les nœuds du dessin. */
export function nodesOf(segments: readonly Segment[]): Pt[] {
  const out: Pt[] = [];
  for (const seg of segments) out.push(seg.a, seg.b);
  return out;
}

export function snapPoint(
  raw: Pt,
  settings: SnapSettings,
  nodeSource: readonly Segment[],
  tolerance: number,
  lineSource: readonly Segment[] = nodeSource,
  /** Un nœud à ignorer (celui qu'on est en train de déplacer). */
  excludeNode?: Pt,
): SnapResult {
  const inside = { x: clamp(raw.x, 0, settings.width), y: clamp(raw.y, 0, settings.height) };
  if (settings.toNodes) {
    let best: Pt | null = null;
    let bestD = tolerance;
    for (const n of nodesOf(nodeSource)) {
      if (excludeNode && samePoint(n, excludeNode)) continue;
      const d = dist(n, inside);
      if (d <= bestD) {
        best = n;
        bestD = d;
      }
    }
    if (best) return { point: best, kind: "node" };
  }
  if (settings.toGrid) return { point: nearestGridPoint(inside, settings), kind: "grid" };
  if (settings.toLines) {
    let best: Pt | null = null;
    let bestD = tolerance;
    for (const seg of lineSource) {
      const pr = project(seg, inside);
      if (pr.distance <= bestD) {
        best = pr.point;
        bestD = pr.distance;
      }
    }
    if (best) return { point: best, kind: "line" };
  }
  return { point: inside, kind: "free" };
}
