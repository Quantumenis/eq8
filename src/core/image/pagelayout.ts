// Mise en page de photos (SPEC §9.10, plan Image) : une page blanche où l'on pose des photos du carnet à leur taille
// enregistrée, qu'on déplace, redimensionne, pivote, retourne, aligne, répète en mosaïque, puis qu'on imprime.

import { createId, type Id } from "../project/model";

export interface LayoutPhoto {
  id: Id;
  photoId: Id;
  /** Coin haut-gauche et taille sur la page (pouces), après rotation. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Quarts de tour horaires et miroirs de l'image dans son cadre. */
  rot: 0 | 1 | 2 | 3;
  flipH: boolean;
  flipV: boolean;
}

export interface PageLayout {
  /** Zone utile de la page (pouces) : la page moins les marges. */
  width: number;
  height: number;
  items: LayoutPhoto[];
  grid: { show: boolean; snap: boolean; step: number; originX: number; originY: number };
}

export const newPageLayout = (width: number, height: number): PageLayout => ({ width, height, items: [], grid: { show: false, snap: false, step: 0.25, originX: 0, originY: 0 } });

const round = (v: number): number => Math.round(v * 1e6) / 1e6;

export interface Placed {
  layout: PageLayout;
  id: Id | null;
  /** Vrai si la photo ne tenait pas à sa taille enregistrée : elle a été réduite. */
  reduced: boolean;
}

/** Pose une photo à sa taille enregistrée (`w` × `h` pouces) ; réduite, proportions gardées, si elle dépasse la page. */
export function addPhoto(layout: PageLayout, photoId: Id, w: number, h: number, at: { x: number; y: number } = { x: 0, y: 0 }): Placed {
  if (!(w > 0 && h > 0)) return { layout, id: null, reduced: false };
  const k = Math.min(1, layout.width / w, layout.height / h);
  const fw = w * k;
  const fh = h * k;
  const x = Math.max(0, Math.min(layout.width - fw, at.x));
  const y = Math.max(0, Math.min(layout.height - fh, at.y));
  const item: LayoutPhoto = { id: createId(), photoId, x: round(x), y: round(y), w: round(fw), h: round(fh), rot: 0, flipH: false, flipV: false };
  return { layout: { ...layout, items: [...layout.items, item] }, id: item.id, reduced: k < 1 };
}

const only = (layout: PageLayout, ids: ReadonlySet<Id>): LayoutPhoto[] => layout.items.filter((i) => ids.has(i.id));
const update = (layout: PageLayout, ids: ReadonlySet<Id>, f: (i: LayoutPhoto) => LayoutPhoto): PageLayout => ({ ...layout, items: layout.items.map((i) => (ids.has(i.id) ? f(i) : i)) });

function snapped(layout: PageLayout, v: number, origin: number): number {
  const g = layout.grid;
  return g.snap && g.step > 0 ? round(origin + Math.round((v - origin) / g.step) * g.step) : v;
}

/** Déplace les photos, avec accrochage à la grille ; elles restent sur la page. */
export function movePhotos(layout: PageLayout, ids: ReadonlySet<Id>, dx: number, dy: number): PageLayout {
  const chosen = only(layout, ids);
  if (chosen.length === 0) return layout;
  const box = bounds(chosen);
  let mx = dx;
  let my = dy;
  if (layout.grid.snap) {
    mx = snapped(layout, box.x0 + dx, layout.grid.originX) - box.x0;
    my = snapped(layout, box.y0 + dy, layout.grid.originY) - box.y0;
  }
  mx = Math.max(-box.x0, Math.min(layout.width - box.x1, mx));
  my = Math.max(-box.y0, Math.min(layout.height - box.y1, my));
  if (Math.abs(mx) < 1e-9 && Math.abs(my) < 1e-9) return layout;
  return update(layout, ids, (i) => ({ ...i, x: round(i.x + mx), y: round(i.y + my) }));
}

function bounds(items: readonly LayoutPhoto[]): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.min(...items.map((i) => i.x)),
    y0: Math.min(...items.map((i) => i.y)),
    x1: Math.max(...items.map((i) => i.x + i.w)),
    y1: Math.max(...items.map((i) => i.y + i.h)),
  };
}

/** Redimensionne une photo (largeur et hauteur voulues) ; avec `keepRatio`, la largeur impose la hauteur. */
export function resizePhoto(layout: PageLayout, id: Id, w: number, h: number, keepRatio: boolean): PageLayout {
  const cur = layout.items.find((i) => i.id === id);
  if (!cur || !(w > 0.05 && h > 0.05)) return layout;
  const nw = w;
  const nh = keepRatio ? (w * cur.h) / cur.w : h;
  if (cur.x + nw > layout.width + 1e-9 || cur.y + nh > layout.height + 1e-9) return layout;
  return update(layout, new Set([id]), (i) => ({ ...i, w: round(nw), h: round(nh) }));
}

/** Pivote de ±90° autour du centre de chaque photo ; la boîte échange sa largeur et sa hauteur. */
export function rotatePhotos(layout: PageLayout, ids: ReadonlySet<Id>, direction: 1 | -1): PageLayout {
  let ok = true;
  const next = update(layout, ids, (i) => {
    const cx = i.x + i.w / 2;
    const cy = i.y + i.h / 2;
    const w = i.h;
    const h = i.w;
    const x = cx - w / 2;
    const y = cy - h / 2;
    if (x < -1e-9 || y < -1e-9 || x + w > layout.width + 1e-9 || y + h > layout.height + 1e-9) ok = false;
    return { ...i, x: round(x), y: round(y), w: round(w), h: round(h), rot: ((((i.rot + direction) % 4) + 4) % 4) as LayoutPhoto["rot"] };
  });
  return ok ? next : layout;
}

export function mirrorPhotos(layout: PageLayout, ids: ReadonlySet<Id>, axis: "h" | "v"): PageLayout {
  return update(layout, ids, (i) => (axis === "h" ? { ...i, flipH: !i.flipH } : { ...i, flipV: !i.flipV }));
}

export type PlacePreset = "centerPage" | "centerH" | "centerV" | "top" | "bottom" | "left" | "right";

/** Préréglages de position : centrer sur la page, horizontalement, verticalement, ou aller contre un bord. */
export function placePhotos(layout: PageLayout, ids: ReadonlySet<Id>, preset: PlacePreset): PageLayout {
  return update(layout, ids, (i) => {
    switch (preset) {
      case "centerPage":
        return { ...i, x: round((layout.width - i.w) / 2), y: round((layout.height - i.h) / 2) };
      case "centerH":
        return { ...i, x: round((layout.width - i.w) / 2) };
      case "centerV":
        return { ...i, y: round((layout.height - i.h) / 2) };
      case "top":
        return { ...i, y: 0 };
      case "bottom":
        return { ...i, y: round(layout.height - i.h) };
      case "left":
        return { ...i, x: 0 };
      case "right":
        return { ...i, x: round(layout.width - i.w) };
    }
  });
}

/** Aligne sur la première photo choisie : haut, bas, gauche ou droite. */
export function alignPhotos(layout: PageLayout, ids: readonly Id[], side: "top" | "bottom" | "left" | "right"): PageLayout {
  const first = layout.items.find((i) => i.id === ids[0]);
  if (!first || ids.length < 2) return layout;
  return update(layout, new Set(ids.slice(1)), (i) => {
    switch (side) {
      case "top":
        return { ...i, y: first.y };
      case "bottom":
        return { ...i, y: round(first.y + first.h - i.h) };
      case "left":
        return { ...i, x: first.x };
      case "right":
        return { ...i, x: round(first.x + first.w - i.w) };
    }
  });
}

export function deletePhotos(layout: PageLayout, ids: ReadonlySet<Id>): PageLayout {
  return layout.items.some((i) => ids.has(i.id)) ? { ...layout, items: layout.items.filter((i) => !ids.has(i.id)) } : layout;
}

/** Copier / coller : des copies décalées, posées si elles tiennent sur la page. */
export function pastePhotos(layout: PageLayout, copies: readonly LayoutPhoto[], offset = 0.25): { layout: PageLayout; ids: Id[] } {
  const ids: Id[] = [];
  const items = [...layout.items];
  for (const c of copies) {
    const x = Math.min(c.x + offset, layout.width - c.w);
    const y = Math.min(c.y + offset, layout.height - c.h);
    const copy: LayoutPhoto = { ...c, id: createId(), x: round(Math.max(0, x)), y: round(Math.max(0, y)) };
    items.push(copy);
    ids.push(copy.id);
  }
  return { layout: { ...layout, items }, ids };
}

/** Mosaïque : la photo est répétée sur toute la page (les copies qui dépassent sont omises). */
export function tilePhoto(layout: PageLayout, id: Id): PageLayout {
  const base = layout.items.find((i) => i.id === id);
  if (!base || base.w <= 0 || base.h <= 0) return layout;
  const items: LayoutPhoto[] = [];
  const cols = Math.floor(layout.width / base.w + 1e-9);
  const rows = Math.floor(layout.height / base.h + 1e-9);
  const total = Math.max(1, cols) * Math.max(1, rows);
  if (total > 400) return layout;
  for (let r = 0; r < Math.max(1, rows); r++) for (let c = 0; c < Math.max(1, cols); c++) items.push({ ...base, id: createId(), x: round(c * base.w), y: round(r * base.h) });
  return { ...layout, items: [...layout.items.filter((i) => i.id !== id), ...items] };
}

export function setGrid(layout: PageLayout, patch: Partial<PageLayout["grid"]>): PageLayout {
  const g = { ...layout.grid, ...patch };
  if (!(g.step > 0 && g.step <= 12)) return layout;
  return { ...layout, grid: g };
}
