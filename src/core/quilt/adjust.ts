// Outil Ajuster (SPEC §4.10) : poignées d'un élément libre, redimensionnement, rotation et inclinaison à la souris.

import type { FreeItem } from "./doc";
import { applyMat, type Pt } from "./geom";
import { itemMat } from "./scene";

/** Une poignée : sa position dans le cadre (0, 0,5 ou 1 sur chaque axe). */
export interface Handle {
  hx: 0 | 0.5 | 1;
  hy: 0 | 0.5 | 1;
}

export const CORNER_HANDLES: Handle[] = [
  { hx: 0, hy: 0 },
  { hx: 1, hy: 0 },
  { hx: 1, hy: 1 },
  { hx: 0, hy: 1 },
];
export const SIDE_HANDLES: Handle[] = [
  { hx: 0.5, hy: 0 },
  { hx: 1, hy: 0.5 },
  { hx: 0.5, hy: 1 },
  { hx: 0, hy: 0.5 },
];

export const isCorner = (h: Handle): boolean => h.hx !== 0.5 && h.hy !== 0.5;

export function handlePoint(item: FreeItem, h: Handle): Pt {
  return applyMat(itemMat(item), { x: h.hx, y: h.hy });
}

export function itemCenter(item: FreeItem): Pt {
  return { x: item.x + item.w / 2, y: item.y + item.h / 2 };
}

/** La poignée touchée par un point (tolérance en pouces), les coins avant les côtés. */
export function hitHandle(item: FreeItem, p: Pt, tolerance: number): Handle | null {
  for (const h of [...CORNER_HANDLES, ...SIDE_HANDLES]) {
    const q = handlePoint(item, h);
    if (Math.hypot(q.x - p.x, q.y - p.y) <= tolerance) return h;
  }
  return null;
}

const MIN_SIZE = 0.05;

/**
 * Tire une poignée : le point opposé reste fixe. Les axes sont ceux du cadre tourné ; avec `keepProportions`, une
 * poignée de coin garde le rapport largeur / hauteur de départ.
 */
export function resizeByHandle(item: FreeItem, h: Handle, pointer: Pt, keepProportions: boolean): Pick<FreeItem, "x" | "y" | "w" | "h"> {
  const t = (item.angle * Math.PI) / 180;
  const u = { x: Math.cos(t), y: Math.sin(t) };
  const v = { x: -Math.sin(t), y: Math.cos(t) };
  const c = itemCenter(item);
  const opposite = { x: c.x + u.x * (0.5 - h.hx) * item.w + v.x * (0.5 - h.hy) * item.h, y: c.y + u.y * (0.5 - h.hx) * item.w + v.y * (0.5 - h.hy) * item.h };
  const d = { x: pointer.x - opposite.x, y: pointer.y - opposite.y };
  let du = d.x * u.x + d.y * u.y;
  let dv = d.x * v.x + d.y * v.y;
  // Une poignée de côté ne change qu'une dimension.
  let w = h.hx === 0.5 ? item.w : Math.max(MIN_SIZE, Math.abs(du));
  let hh = h.hy === 0.5 ? item.h : Math.max(MIN_SIZE, Math.abs(dv));
  if (keepProportions && isCorner(h)) {
    const ratio = item.w / item.h;
    if (w / hh > ratio) w = hh * ratio;
    else hh = w / ratio;
    du = Math.sign(du || 1) * w;
    dv = Math.sign(dv || 1) * hh;
  }
  // Le nouveau centre : milieu entre le point fixe et le bord tiré (sur l'axe qui change).
  const cu = h.hx === 0.5 ? (c.x - opposite.x) * u.x + (c.y - opposite.y) * u.y : (Math.sign(du || 1) * w) / 2;
  const cv = h.hy === 0.5 ? (c.x - opposite.x) * v.x + (c.y - opposite.y) * v.y : (Math.sign(dv || 1) * hh) / 2;
  const nc = { x: opposite.x + u.x * cu + v.x * cv, y: opposite.y + u.y * cu + v.y * cv };
  return { x: nc.x - w / 2, y: nc.y - hh / 2, w, h: hh };
}

/** Rotation à la souris : l'angle du pointeur autour du centre, moins l'angle de la poignée au départ. */
export function rotateByPointer(item: FreeItem, startPointer: Pt, pointer: Pt): number {
  const c = itemCenter(item);
  const a0 = Math.atan2(startPointer.y - c.y, startPointer.x - c.x);
  const a1 = Math.atan2(pointer.y - c.y, pointer.x - c.x);
  return ((item.angle + ((a1 - a0) * 180) / Math.PI) % 360 + 360) % 360;
}

/** Inclinaison à la souris (poignée de côté haut ou bas) : le décalage horizontal du pointeur, ramené à un angle. */
export function skewByPointer(item: FreeItem, h: Handle, pointer: Pt): number {
  const c = itemCenter(item);
  const t = (item.angle * Math.PI) / 180;
  const u = { x: Math.cos(t), y: Math.sin(t) };
  const du = (pointer.x - c.x) * u.x + (pointer.y - c.y) * u.y;
  const side = h.hy === 0 ? -1 : 1;
  const angle = (Math.atan2(du * side, item.h / 2) * 180) / Math.PI;
  return Math.max(-80, Math.min(80, angle));
}
