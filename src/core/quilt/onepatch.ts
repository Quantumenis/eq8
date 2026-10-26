// One Patch (SPEC §2.9) : une seule forme répétée sur tout le quilt. Le nombre d'unités compte les formes entières
// ou partielles visibles par ligne et par colonne, en coupant au bord du centre (Q-2.7).

import { clipToRect, polygonArea, type Pt } from "./geom";

export const ONE_PATCH_SHAPES = ["square", "rectangle", "diamond", "triangle", "hexagon", "longHexagon", "cobblestone", "octagon", "custom"] as const;
export type OnePatchShape = (typeof ONE_PATCH_SHAPES)[number];

export interface OnePatchParams {
  shape: OnePatchShape;
  /** Nombre d'unités : horizontal × vertical. */
  nh: number;
  nv: number;
  /**
   * Largeur et hauteur d'encombrement. Pour le carré, l'hexagone (côté), le pavé et l'octogone, `w` est la seule taille
   * (`h` est ignoré).
   */
  w: number;
  h: number;
  /** « Personnalisé » : inclinaison des côtés (glissières horizontale et verticale), en pouces. */
  shearX: number;
  shearY: number;
}

/** Les formes dont la taille se règle par une seule longueur. */
export const SIDE_SHAPES: readonly OnePatchShape[] = ["square", "hexagon", "cobblestone", "octagon"];

export const DEFAULT_ONE_PATCH: OnePatchParams = { shape: "square", nh: 8, nv: 10, w: 3, h: 3, shearX: 0, shearY: 0 };

export interface PatchPiece {
  key: string;
  poly: Pt[];
}

interface Lattice {
  /** Vecteurs du réseau : l'unité (r, c) est posée en c·colVec + r·rowVec. */
  colVec: Pt;
  rowVec: Pt;
  /** Les polygones d'une unité, dans son repère. */
  units: Pt[][];
  width: number;
  height: number;
}

const P = (x: number, y: number): Pt => ({ x, y });

function lattice(p: OnePatchParams): Lattice {
  const w = p.w;
  const h = SIDE_SHAPES.includes(p.shape) ? p.w : p.h;
  switch (p.shape) {
    case "square":
    case "rectangle":
      return { colVec: P(w, 0), rowVec: P(0, h), units: [[P(0, 0), P(w, 0), P(w, h), P(0, h)]], width: p.nh * w, height: p.nv * h };
    case "diamond":
      return { colVec: P(w, 0), rowVec: P(w / 2, h / 2), units: [[P(0, h / 2), P(w / 2, 0), P(w, h / 2), P(w / 2, h)]], width: p.nh * w, height: p.nv * (h / 2) };
    case "triangle":
      // Une unité = une paire de triangles (pointe en haut, pointe en bas) ; « horizontal » compte les triangles.
      return {
        colVec: P(w, 0),
        rowVec: P(0, h),
        units: [
          [P(0, h), P(w, h), P(w / 2, 0)],
          [P(w / 2, 0), P(w * 1.5, 0), P(w, h)],
        ],
        width: ((p.nh + 1) * w) / 2,
        height: p.nv * h,
      };
    case "hexagon": {
      const hw = Math.sqrt(3) * w;
      return {
        colVec: P(hw, 0),
        rowVec: P(hw / 2, 1.5 * w),
        units: [[P(hw / 2, 0), P(hw, w / 2), P(hw, 1.5 * w), P(hw / 2, 2 * w), P(0, 1.5 * w), P(0, w / 2)]],
        width: p.nh * hw,
        height: p.nv * 1.5 * w,
      };
    }
    case "longHexagon":
      return {
        colVec: P(w, 0),
        rowVec: P(w / 2, (3 * h) / 4),
        units: [[P(w / 2, 0), P(w, h / 4), P(w, (3 * h) / 4), P(w / 2, h), P(0, (3 * h) / 4), P(0, h / 4)]],
        width: p.nh * w,
        height: p.nv * ((3 * h) / 4),
      };
    case "cobblestone":
      return { colVec: P(w, 0), rowVec: P(w / 2, w), units: [[P(0, 0), P(w, 0), P(w, w), P(0, w)]], width: p.nh * w, height: p.nv * w };
    case "octagon": {
      // Octogone régulier de largeur w, et le petit carré (sur la pointe) du coin bas-droit.
      const t = w / (1 + Math.SQRT2);
      const a = (w - t) / 2;
      const oct = [P(a, 0), P(a + t, 0), P(w, a), P(w, a + t), P(a + t, w), P(a, w), P(0, a + t), P(0, a)];
      const sq = [P(w, w - a), P(w + a, w), P(w, w + a), P(w - a, w)];
      return { colVec: P(w, 0), rowVec: P(0, w), units: [oct, sq], width: p.nh * w, height: p.nv * w };
    }
    case "custom":
      // Parallélogramme (0,0), (w, ky), (w + kx, h + ky), (kx, h) : il pave le plan par translations.
      return {
        colVec: P(w, p.shearY),
        rowVec: P(p.shearX, h),
        units: [[P(0, 0), P(w, p.shearY), P(w + p.shearX, h + p.shearY), P(p.shearX, h)]],
        width: p.nh * w,
        height: p.nv * h,
      };
  }
}

/** Taille du centre d'un One Patch. */
export function onePatchSize(p: OnePatchParams): { width: number; height: number } {
  const l = lattice(p);
  return { width: l.width, height: l.height };
}

/** Les pièces d'un One Patch : chaque unité (entière ou partielle) coupée au rectangle du centre. */
export function onePatchPieces(p: OnePatchParams): PatchPiece[] {
  const l = lattice(p);
  const out: PatchPiece[] = [];
  const spread = Math.abs(l.rowVec.x / Math.max(l.colVec.x, 1e-9)) + Math.abs(l.colVec.y / Math.max(l.rowVec.y, 1e-9));
  const baseRows = Math.ceil(l.height / Math.max(Math.abs(l.rowVec.y), 1e-9));
  // Un réseau incliné verticalement (glissière) décale chaque colonne : il faut davantage de lignes.
  const rowsExtra = 2 + Math.ceil(((l.width / l.colVec.x + baseRows * spread + 4) * Math.abs(l.colVec.y)) / Math.max(Math.abs(l.rowVec.y), 1e-9));
  const maxRow = baseRows + rowsExtra;
  for (let r = -rowsExtra; r <= maxRow; r++) {
    // Colonnes utiles : celles dont l'unité touche [0, largeur], compte tenu du décalage de la ligne.
    const base = r * l.rowVec.x;
    const first = Math.floor((-base - l.colVec.x * 2) / l.colVec.x) - Math.ceil(spread);
    const last = Math.ceil((l.width - base) / l.colVec.x) + 2 + Math.ceil(spread);
    for (let c = first; c <= last; c++) {
      const ox = c * l.colVec.x + r * l.rowVec.x;
      const oy = c * l.colVec.y + r * l.rowVec.y;
      l.units.forEach((unit, k) => {
        const clipped = clipToRect(
          unit.map((q) => P(q.x + ox, q.y + oy)),
          0,
          0,
          l.width,
          l.height,
        );
        if (clipped.length >= 3 && polygonArea(clipped) > 1e-9) out.push({ key: `r${r}c${c}${l.units.length > 1 ? `.${k}` : ""}`, poly: clipped });
      });
    }
  }
  return out;
}
