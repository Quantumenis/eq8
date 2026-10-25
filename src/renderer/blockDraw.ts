// Dessin du plan Bloc sur un Canvas 2D (écran). Aucune logique d'édition ici : on reçoit un état et on le peint.

import type { BlockDraft } from "../core/draw/draft";
import { arcOf, type Pt, type Segment } from "../core/draw/geometry";
import type { SnapResult } from "../core/draw/snap";
import { toScreen, toWorld, type View } from "../core/draw/view";

export interface Palette {
  surface: string;
  sheet: string;
  line: string;
  accent: string;
  muted: string;
  guide: string;
}

export function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    surface: v("--surface-2", "#ebe8e2"),
    sheet: v("--sheet", "#ffffff"),
    line: v("--text", "#24262b"),
    accent: v("--accent-block", "#e0a526"),
    muted: v("--text-muted", "#6a6f78"),
    guide: v("--focus", "#1f5fa8"),
  };
}

export interface Scene {
  view: View;
  width: number;
  height: number;
  dpr: number;
  draft: BlockDraft;
  selection: ReadonlySet<string>;
  /** Aperçu en cours de tracé (ligne, arc, grille), en pointillés. */
  preview: readonly Segment[];
  hover: SnapResult | null;
  /** Outil Édition : nœuds visibles et, pour un arc sélectionné, ses poignées. */
  showNodes: boolean;
  palette: Palette;
}

function tracePath(ctx: CanvasRenderingContext2D, view: View, seg: Segment): void {
  const a = toScreen(view, seg.a);
  const b = toScreen(view, seg.b);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  if (seg.kind === "line") {
    ctx.lineTo(b.x, b.y);
    return;
  }
  const g = arcOf(seg);
  const c = toScreen(view, g.center);
  ctx.arc(c.x, c.y, g.radius * view.scale, g.startAngle, g.startAngle + g.sweep, g.sweep < 0);
}

function square(ctx: CanvasRenderingContext2D, p: Pt, half: number): void {
  ctx.fillRect(p.x - half, p.y - half, half * 2, half * 2);
  ctx.strokeRect(p.x - half, p.y - half, half * 2, half * 2);
}

export function paint(ctx: CanvasRenderingContext2D, s: Scene): void {
  const { view, palette, draft } = s;
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  ctx.fillStyle = palette.surface;
  ctx.fillRect(0, 0, s.width, s.height);

  const topLeft = toScreen(view, { x: 0, y: 0 });
  const bottomRight = toScreen(view, { x: draft.width, y: draft.height });
  ctx.fillStyle = palette.sheet;
  ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

  // Papier millimétré : ne s'imprime pas.
  if (draft.graph.show) {
    ctx.save();
    ctx.strokeStyle = palette.guide;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1;
    const stepX = (draft.width / draft.graph.divX) * view.scale;
    const stepY = (draft.height / draft.graph.divY) * view.scale;
    ctx.beginPath();
    if (stepX >= 4) {
      for (let i = 0; i <= draft.graph.divX; i++) {
        const x = Math.round(topLeft.x + i * stepX) + 0.5;
        ctx.moveTo(x, topLeft.y);
        ctx.lineTo(x, bottomRight.y);
      }
    }
    if (stepY >= 4) {
      for (let j = 0; j <= draft.graph.divY; j++) {
        const y = Math.round(topLeft.y + j * stepY) + 0.5;
        ctx.moveTo(topLeft.x, y);
        ctx.lineTo(bottomRight.x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // Points d'accrochage, seulement ceux qui sont visibles et assez espacés.
  const gridX = draft.width / draft.snapX;
  const gridY = draft.height / draft.snapY;
  if (draft.snap.grid && gridX * view.scale >= 7 && gridY * view.scale >= 7) {
    const w0 = toWorld(view, 0, 0);
    const w1 = toWorld(view, s.width, s.height);
    const i0 = Math.max(0, Math.floor(w0.x / gridX));
    const i1 = Math.min(draft.snapX, Math.ceil(w1.x / gridX));
    const j0 = Math.max(0, Math.floor(w0.y / gridY));
    const j1 = Math.min(draft.snapY, Math.ceil(w1.y / gridY));
    ctx.fillStyle = palette.muted;
    ctx.globalAlpha = 0.55;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const p = toScreen(view, { x: i * gridX, y: j * gridY });
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Contour du bloc.
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

  // Repères.
  ctx.save();
  ctx.strokeStyle = palette.guide;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  for (const seg of draft.guides) {
    tracePath(ctx, view, seg);
    ctx.stroke();
  }
  ctx.restore();

  // Dessin.
  ctx.lineCap = "round";
  for (const seg of draft.segments) {
    const selected = s.selection.has(seg.id);
    ctx.strokeStyle = selected ? palette.accent : palette.line;
    ctx.lineWidth = selected ? 4 : 2;
    tracePath(ctx, view, seg);
    ctx.stroke();
  }

  // Aperçu du tracé.
  if (s.preview.length > 0) {
    ctx.save();
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    for (const seg of s.preview) {
      tracePath(ctx, view, seg);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Édition : nœuds, tente et point chaud.
  if (s.showNodes) {
    ctx.fillStyle = palette.sheet;
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 1.5;
    for (const seg of draft.segments) {
      square(ctx, toScreen(view, seg.a), 3.5);
      square(ctx, toScreen(view, seg.b), 3.5);
    }
    const picked = draft.segments.filter((seg) => s.selection.has(seg.id));
    if (picked.length === 1 && picked[0]?.kind === "arc") {
      const g = arcOf(picked[0]);
      const a = toScreen(view, picked[0].a);
      const b = toScreen(view, picked[0].b);
      const tent = toScreen(view, g.tent);
      const apex = toScreen(view, g.apex);
      ctx.save();
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(tent.x, tent.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = palette.accent;
      ctx.strokeStyle = palette.line;
      square(ctx, tent, 5); // la tente
      ctx.beginPath(); // le point chaud
      ctx.arc(apex.x, apex.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Marque d'accrochage sous le pointeur.
  if (s.hover) {
    const p = toScreen(view, s.hover.point);
    ctx.lineWidth = 1.5;
    if (s.hover.kind === "node") {
      ctx.strokeStyle = palette.accent;
      ctx.strokeRect(p.x - 6, p.y - 6, 12, 12);
    } else if (s.hover.kind === "grid") {
      ctx.strokeStyle = palette.accent;
      ctx.beginPath();
      ctx.moveTo(p.x - 5, p.y);
      ctx.lineTo(p.x + 5, p.y);
      ctx.moveTo(p.x, p.y - 5);
      ctx.lineTo(p.x, p.y + 5);
      ctx.stroke();
    } else {
      ctx.strokeStyle = palette.guide;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
