// Fenêtre de dessin : conversion pouces ↔ pixels écran, zoom et défilement.

import type { Pt } from "./geometry";

export interface View {
  /** Pixels (CSS) par pouce : 96 = taille réelle (100 %). */
  scale: number;
  /** Position à l'écran de l'origine du bloc (son coin supérieur gauche). */
  originX: number;
  originY: number;
}

export const ACTUAL_SIZE = 96;
export const MIN_SCALE = ACTUAL_SIZE * 0.1;
export const MAX_SCALE = ACTUAL_SIZE * 40;
export const ZOOM_STEP = 1.25;

export const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export const toScreen = (v: View, p: Pt): Pt => ({ x: v.originX + p.x * v.scale, y: v.originY + p.y * v.scale });
export const toWorld = (v: View, x: number, y: number): Pt => ({ x: (x - v.originX) / v.scale, y: (y - v.originY) / v.scale });
export const zoomPercent = (v: View): number => Math.round((v.scale / ACTUAL_SIZE) * 100);

/** Bloc centré dans la zone, aussi grand que possible (avec une marge). */
export function fitView(areaWidth: number, areaHeight: number, blockWidth: number, blockHeight: number, margin = 32): View {
  const scale = clampScale(Math.min((areaWidth - 2 * margin) / blockWidth, (areaHeight - 2 * margin) / blockHeight));
  return { scale, originX: (areaWidth - blockWidth * scale) / 2, originY: (areaHeight - blockHeight * scale) / 2 };
}

/** Change le zoom en gardant fixe le point d'écran (x, y). */
export function zoomAt(v: View, newScale: number, x: number, y: number): View {
  const scale = clampScale(newScale);
  const w = toWorld(v, x, y);
  return { scale, originX: x - w.x * scale, originY: y - w.y * scale };
}

export function pan(v: View, dx: number, dy: number): View {
  return { ...v, originX: v.originX + dx, originY: v.originY + dy };
}

/** Niveaux de zoom des boutons et de Ctrl+±, en pourcentage de la taille réelle. */
export const ZOOM_PRESETS = [10, 25, 50, 75, 100, 150, 200, 300, 400, 600, 800, 1200, 1600, 2400, 4000];

/** Échelle du niveau de zoom suivant (`direction` 1) ou précédent (-1). */
export function stepZoom(scale: number, direction: 1 | -1): number {
  const percent = (scale / ACTUAL_SIZE) * 100;
  const next =
    direction === 1
      ? ZOOM_PRESETS.find((p) => p > percent * 1.001)
      : [...ZOOM_PRESETS].reverse().find((p) => p < percent / 1.001);
  return clampScale(((next ?? (direction === 1 ? ZOOM_PRESETS.at(-1) : ZOOM_PRESETS[0])) as number) * ACTUAL_SIZE / 100);
}
