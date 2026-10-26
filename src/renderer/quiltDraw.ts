// Dessin du plan Quilt sur un Canvas 2D. Aucune logique d'édition ici : on reçoit une scène et on la peint.
// Tout est tracé dans le repère du centre (pouces) ; le tissu est calé sur le coin du bloc et tourné comme lui.

import { piecePath } from "../core/draw/pieces";
import type { View } from "../core/draw/view";
import type { AssetStore } from "../core/project/assets";
import type { Id, Project } from "../core/project/model";
import type { Layer } from "../core/quilt/doc";
import type { Pt } from "../core/quilt/geom";
import { itemMat, type Scene, type ScenePiece } from "../core/quilt/scene";
import type { Palette } from "./blockDraw";
import { pieceFill } from "./paintView";

export interface QuiltPaint {
  view: View;
  width: number;
  height: number;
  dpr: number;
  scene: Scene;
  project: Project;
  assets: AssetStore;
  hidden: ReadonlySet<Layer>;
  /** La bordure choisie (onglet BORDURES) : ses pièces vides sont grises et son anneau est cerné. */
  selectedBorder: string | null;
  seams: boolean;
  palette: Palette;
  selected: ReadonlySet<Id>;
  /** Poignées visibles sur l'élément sélectionné (un seul). */
  handles: { corners: Pt[]; sides: Pt[]; rotateMode: boolean } | null;
  highlight: ReadonlySet<string>;
  focusKey: string | null;
  ghost: readonly Pt[] | null;
  hoverPoly: readonly Pt[] | null;
  stroke: readonly Pt[] | null;
  tape: { a: Pt; b: Pt } | null;
  edgeMark: { a: Pt; b: Pt } | null;
  grid: { step: number } | null;
  rulers: boolean;
  /** Pouces par unité affichée (1 pour les pouces, 1/2,54 pour les centimètres) et le nom de l'unité. */
  rulerUnit: { perInch: number; label: string };
}

const SEAM = "#24262b";
const SELECT_GREEN = "#2fbf56";
/** Une bordure sélectionnée, sans couleur, s'affiche en gris (SPEC §3.1). */
const SELECTED_BORDER_GRAY = "#a3a8af";

const pathCache = new WeakMap<object, Path2D>();
function blockPath(piece: object, build: () => string): Path2D {
  let p = pathCache.get(piece);
  if (!p) {
    p = new Path2D(build());
    pathCache.set(piece, p);
  }
  return p;
}

function polyPath(poly: readonly Pt[]): Path2D {
  const path = new Path2D();
  poly.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
  path.closePath();
  return path;
}

let hatch: HTMLCanvasElement | null = null;
function hatchTile(color: string): HTMLCanvasElement {
  if (!hatch) {
    hatch = document.createElement("canvas");
    hatch.width = 8;
    hatch.height = 8;
  }
  const c = hatch.getContext("2d");
  if (c) {
    c.clearRect(0, 0, 8, 8);
    c.strokeStyle = color;
    c.globalAlpha = 0.45;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, 8);
    c.lineTo(8, 0);
    c.moveTo(-2, 2);
    c.lineTo(2, -2);
    c.moveTo(6, 10);
    c.lineTo(10, 6);
    c.stroke();
  }
  return hatch;
}

function worldTransform(ctx: CanvasRenderingContext2D, s: QuiltPaint): void {
  const { view, dpr } = s;
  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.originX, dpr * view.originY);
}

/** La tuile d'un tissu pour une pièce, du repère de la pièce vers le monde (échelle réelle). */
function tileTransform(piece: ScenePiece, ppi: number, offset: { x: number; y: number }, rotation: number): DOMMatrix {
  const k = 1 / ppi;
  const world = new DOMMatrix()
    .translate(piece.origin.x, piece.origin.y)
    .rotate(piece.angle)
    .translate(offset.x, offset.y)
    .rotate(rotation)
    .scale(k, k);
  if (!piece.block) return world;
  const m = piece.block.mat;
  return new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]).inverse().multiply(world);
}

export function paintQuilt(ctx: CanvasRenderingContext2D, s: QuiltPaint): void {
  const { view, palette, scene, dpr } = s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = palette.surface;
  ctx.fillRect(0, 0, s.width, s.height);

  worldTransform(ctx, s);
  ctx.fillStyle = palette.sheet;
  const bounds = scene.bounds;
  ctx.fillRect(bounds.x0, bounds.y0, bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);

  const patterns = new Map<CanvasImageSource, CanvasPattern | null>();
  const hatchPattern = ctx.createPattern(hatchTile(palette.muted), "repeat");
  const dim = s.hidden.has(1);

  const seamWidth = 1.25 / view.scale;
  for (const layer of [1, 2, 3] as Layer[]) {
    if (s.hidden.has(layer) && layer !== 1) continue;
    ctx.save();
    ctx.globalAlpha = layer === 1 && dim ? 0.28 : 1;
    for (const piece of scene.pieces) {
      if (piece.layer !== layer) continue;
      worldTransform(ctx, s);
      const clipEdge = piece.itemId ? scene.items.find((i) => i.item.id === piece.itemId)?.item.clip === "edge" : false;
      if (clipEdge) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(bounds.x0, bounds.y0, bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
        ctx.clip();
      }
      ctx.save();
      if (piece.block) {
        const m = piece.block.mat;
        ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      }
      const path = piece.block ? blockPath(piece.block.piece, () => piecePath(piece.block!.piece)) : polyPath(piece.poly);
      if (!piece.lineOnly) {
        const fill = pieceFill(s.project, s.assets, piece.paint);
        if (!fill) {
          const chosenBorder = piece.border !== undefined && piece.border === s.selectedBorder;
          ctx.fillStyle = chosenBorder ? SELECTED_BORDER_GRAY : palette.sheet;
          ctx.fill(path);
          if (hatchPattern && !chosenBorder) {
            hatchPattern.setTransform(new DOMMatrix().scale(1 / (dpr * view.scale), 1 / (dpr * view.scale)));
            ctx.fillStyle = hatchPattern;
            ctx.fill(path);
          }
        } else {
          ctx.fillStyle = fill.color;
          const image = fill.tile?.image;
          if (fill.tile && image) {
            let pattern = patterns.get(image);
            if (pattern === undefined) {
              pattern = ctx.createPattern(image, "repeat");
              patterns.set(image, pattern);
            }
            if (pattern) {
              const rotation = piece.paint?.kind === "fabric" ? (piece.paint.rotation ?? 0) : 0;
              pattern.setTransform(tileTransform(piece, fill.tile.ppi, fill.offset ?? { x: 0, y: 0 }, rotation));
              ctx.fillStyle = pattern;
            }
          }
          ctx.fill(path);
        }
      }
      if (s.seams || piece.lineOnly) {
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        // Le trait est dessiné dans le repère du bloc : on rétablit l'épaisseur voulue à l'écran.
        const k = piece.block ? Math.hypot(piece.block.mat[0], piece.block.mat[1]) || 1 : 1;
        ctx.lineWidth = (piece.lineOnly ? 2 : 1.25) / view.scale / k;
        ctx.strokeStyle = piece.lineOnly ? "#3b66b5" : SEAM;
        if (piece.lineOnly) ctx.setLineDash([6 / view.scale / k, 3 / view.scale / k]);
        ctx.stroke(path);
      }
      ctx.restore();
      if (clipEdge) ctx.restore();
    }
    ctx.restore();
  }
  void seamWidth;

  worldTransform(ctx, s);
  // Contour du centre.
  ctx.strokeStyle = SEAM;
  ctx.lineWidth = 1.5 / view.scale;
  ctx.strokeRect(0, 0, scene.width, scene.height);
  if (scene.borders.rings.length > 0) {
    ctx.strokeRect(bounds.x0, bounds.y0, bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
  }
  const ring = s.selectedBorder ? scene.borders.rings.find((r) => r.id === s.selectedBorder) : undefined;
  if (ring) {
    ctx.save();
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2.5 / view.scale;
    ctx.strokeRect(ring.outer.x0, ring.outer.y0, ring.outer.x1 - ring.outer.x0, ring.outer.y1 - ring.outer.y0);
    ctx.setLineDash([5 / view.scale, 4 / view.scale]);
    ctx.strokeRect(ring.inner.x0, ring.inner.y0, ring.inner.x1 - ring.inner.x0, ring.inner.y1 - ring.inner.y0);
    ctx.restore();
  }

  // Grille d'accrochage du Custom Set.
  if (s.grid) {
    ctx.save();
    ctx.strokeStyle = palette.guide;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1 / view.scale;
    let step = s.grid.step;
    while (step * view.scale < 7) step *= 2;
    ctx.beginPath();
    for (let x = 0; x <= scene.width + 1e-9; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, scene.height);
    }
    for (let y = 0; y <= scene.height + 1e-9; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(scene.width, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Pièces choisies par « Sélectionner & vaporiser » (en vert), pièce de la coupe ciblée (pointillés).
  if (s.highlight.size > 0 || s.focusKey) {
    for (const piece of scene.pieces) {
      const green = s.highlight.has(piece.key);
      const focus = s.focusKey === piece.key;
      if (!green && !focus) continue;
      ctx.save();
      if (piece.block) ctx.transform(piece.block.mat[0], piece.block.mat[1], piece.block.mat[2], piece.block.mat[3], piece.block.mat[4], piece.block.mat[5]);
      const k = piece.block ? Math.hypot(piece.block.mat[0], piece.block.mat[1]) || 1 : 1;
      const path = piece.block ? blockPath(piece.block.piece, () => piecePath(piece.block!.piece)) : polyPath(piece.poly);
      ctx.lineJoin = "round";
      if (green) {
        ctx.strokeStyle = SELECT_GREEN;
        ctx.lineWidth = 3 / view.scale / k;
      } else {
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 2.5 / view.scale / k;
        ctx.setLineDash([6 / view.scale / k, 4 / view.scale / k]);
      }
      ctx.stroke(path);
      ctx.restore();
    }
  }

  // Emplacement survolé et bloc fantôme.
  if (s.hoverPoly) {
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2.5 / view.scale;
    ctx.stroke(polyPath(s.hoverPoly));
  }
  if (s.ghost) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = palette.accent;
    ctx.fill(polyPath(s.ghost));
    ctx.restore();
  }

  // Éléments sélectionnés : cadre pointillé (pivoté) et poignées.
  for (const it of scene.items) {
    if (!s.selected.has(it.item.id)) continue;
    ctx.save();
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1.75 / view.scale;
    ctx.setLineDash([5 / view.scale, 4 / view.scale]);
    ctx.stroke(polyPath(it.poly));
    ctx.restore();
  }
  if (s.handles) {
    const r = 5 / view.scale;
    ctx.fillStyle = s.handles.rotateMode ? palette.accent : palette.sheet;
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 1.5 / view.scale;
    for (const h of [...s.handles.corners, ...s.handles.sides]) {
      ctx.beginPath();
      if (s.handles.rotateMode && s.handles.corners.includes(h)) ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
      else ctx.rect(h.x - r, h.y - r, r * 2, r * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Tracé du pinceau, arête repérée pour la rotation du tissu, mètre ruban.
  if (s.stroke && s.stroke.length > 0) {
    ctx.save();
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2 / view.scale;
    ctx.setLineDash([5 / view.scale, 4 / view.scale]);
    ctx.beginPath();
    s.stroke.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();
  }
  if (s.edgeMark) {
    ctx.strokeStyle = "#d9361f";
    ctx.lineWidth = 3 / view.scale;
    ctx.beginPath();
    ctx.moveTo(s.edgeMark.a.x, s.edgeMark.a.y);
    ctx.lineTo(s.edgeMark.b.x, s.edgeMark.b.y);
    ctx.stroke();
  }
  if (s.tape) {
    ctx.strokeStyle = "#d9361f";
    ctx.lineWidth = 2 / view.scale;
    ctx.beginPath();
    ctx.moveTo(s.tape.a.x, s.tape.a.y);
    ctx.lineTo(s.tape.b.x, s.tape.b.y);
    ctx.stroke();
  }

  // Règles : en pixels d'écran, par-dessus.
  if (s.rulers) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.surface;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(0, 0, s.width, 18);
    ctx.fillRect(0, 0, 18, s.height);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.muted;
    ctx.strokeStyle = palette.muted;
    ctx.lineWidth = 1;
    ctx.font = "10px sans-serif";
    const unitPx = view.scale / s.rulerUnit.perInch;
    let step = 1;
    for (const candidate of [1, 2, 5, 10, 20, 50, 100]) {
      step = candidate;
      if (candidate * unitPx >= 40) break;
    }
    const x0 = Math.floor((0 - view.originX) / unitPx / step) * step;
    ctx.beginPath();
    for (let v = x0; v * unitPx + view.originX < s.width; v += step) {
      const x = Math.round(view.originX + v * unitPx) + 0.5;
      if (x < 18) continue;
      ctx.moveTo(x, 12);
      ctx.lineTo(x, 18);
      ctx.fillText(String(v), x + 2, 10);
    }
    const y0 = Math.floor((0 - view.originY) / unitPx / step) * step;
    for (let v = y0; v * unitPx + view.originY < s.height; v += step) {
      const y = Math.round(view.originY + v * unitPx) + 0.5;
      if (y < 18) continue;
      ctx.moveTo(12, y);
      ctx.lineTo(18, y);
      ctx.save();
      ctx.translate(10, y - 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(String(v), 0, 0);
      ctx.restore();
    }
    ctx.stroke();
  }
}

export { itemMat };
