// Affichage d'un habillage (tissu ou couleur) : remplissage du canvas, échantillon CSS des palettes et des vignettes.

import type { CSSProperties } from "react";
import { displayColor } from "../core/draw/coloring";
import type { AssetStore } from "../core/project/assets";
import type { FabricItem, Paint, Project } from "../core/project/model";
import type { PieceFill } from "./blockDraw";
import { fabricBackground, fabricTiles, type Tile } from "./fabricTiles";

export function fabricOf(project: Project, paint: Paint | null | undefined): FabricItem | null {
  if (!paint || paint.kind !== "fabric") return null;
  return project.sketchbook.fabrics.find((f) => f.id === paint.fabricId) ?? null;
}

export function tileOfPaint(project: Project, assets: AssetStore, paint: Paint | null | undefined): Tile | null {
  const fabric = fabricOf(project, paint);
  return fabric ? fabricTiles.tileOf(fabric, project, assets) : null;
}

/** Remplissage d'une pièce : la couleur unie, ou la tuile du tissu (avec sa couleur moyenne en attendant). */
export function pieceFill(project: Project, assets: AssetStore, paint: Paint | undefined): PieceFill | null {
  const color = displayColor(project, paint);
  if (!color || !paint) return null;
  if (paint.kind === "solid") return { color };
  return { color, tile: tileOfPaint(project, assets, paint), offset: paint.offset ?? { x: 0, y: 0 } };
}

/** Pixels d'écran par pouce de tissu dans un échantillon de palette (un échantillon montre environ 3 po de tissu). */
export const SWATCH_INCHES = 3;

/** Style CSS d'un échantillon : la couleur, ou le tissu répété à l'échelle de l'échantillon. */
export function swatchStyle(project: Project, assets: AssetStore, paint: Paint | null | undefined, sizePx: number): CSSProperties {
  const color = displayColor(project, paint ?? undefined) ?? "#9e9e9e";
  if (!paint || paint.kind === "solid") return { background: color };
  return fabricBackground(tileOfPaint(project, assets, paint), sizePx / SWATCH_INCHES, color) as CSSProperties;
}
