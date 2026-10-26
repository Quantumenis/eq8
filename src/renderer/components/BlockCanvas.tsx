import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addSegments, moveNode, moveSegments, setSagitta, snapSettingsOf, translateSegment, type BlockDraft } from "../../core/draw/draft";
import type { BlockEditor } from "../../core/draw/editor";
import { arcOf, boundsOf, dist, project, sagittaThrough, unionBounds, type Pt, type Segment } from "../../core/draw/geometry";
import { addNodesAt } from "../../core/draw/nodes";
import { pieceAt, type Piece } from "../../core/draw/pieces";
import { snapPoint, toleranceInInches, type SnapResult } from "../../core/draw/snap";
import { arcSegment, gridSegments, hitTest, lineSegment } from "../../core/draw/tools";
import { ACTUAL_SIZE, ZOOM_STEP, fitView, pan, stepZoom, toWorld, zoomAt, zoomPercent, type View } from "../../core/draw/view";
import { formatLength, type DisplayUnit } from "../../core/units";
import type { Id } from "../../core/project/model";
import { paint, readPalette, type Palette } from "../blockDraw";
import { fr } from "../i18n/fr";

export type Tool = "pick" | "edit" | "line" | "arc" | "grid";
export type NodeMode = "move" | "here";

/** Onglet COLORATION : les pièces remplacent les outils de dessin. */
export interface ColoringLayer {
  pieces: readonly Piece[];
  /** Couleur d'affichage d'une pièce, ou `null` si elle n'est pas colorée. */
  colorOf: (key: string) => string | null;
  /** Pièces entourées en vert (Sélectionner & vaporiser). */
  highlight: ReadonlySet<string>;
  onPiece: (piece: Piece | null) => void;
  cursor: string;
}

interface Props {
  editor: BlockEditor;
  tool: Tool;
  selection: readonly Id[];
  onSelect: (ids: readonly Id[]) => void;
  grid: { cols: number; rows: number };
  nodeMode: NodeMode;
  unit: DisplayUnit;
  onAdded: (ids: readonly Id[]) => void;
  lastAdded: readonly Id[];
  coloring?: ColoringLayer | undefined;
}

type Drag =
  | { kind: "draw"; tool: "line" | "arc" | "grid"; start: Pt; current: Pt; flipped: boolean }
  | { kind: "move"; ids: Id[]; ref: Pt; downRaw: Pt; dx: number; dy: number }
  | { kind: "node"; node: Pt; target: Pt }
  | { kind: "sagitta"; id: Id; handle: "apex" | "tent"; value: number }
  | { kind: "pan"; x: number; y: number };

const SEGMENT_PICK_PX = 8;
const NODE_PICK_PX = 10;
const SNAP_PX = 10;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

export function BlockCanvas({ editor, tool, selection, onSelect, grid, nodeMode, unit, onAdded, lastAdded, coloring }: Props) {
  const draft = editor.draft;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ scale: ACTUAL_SIZE, originX: 40, originY: 40 });
  const [pointer, setPointer] = useState<Pt | null>(null);
  const [hover, setHover] = useState<SnapResult | null>(null);
  const [dragTick, setDragTick] = useState(0);
  const [themeTick, setThemeTick] = useState(0);
  const fitted = useRef(true);
  const drag = useRef<Drag | null>(null);
  const paletteRef = useRef<Palette | null>(null);

  const selected = useMemo(() => new Set(selection), [selection]);
  const live = useRef({ draft, view, tool, selected, grid, nodeMode, onSelect, onAdded, lastAdded, coloring });
  live.current = { draft, view, tool, selected, grid, nodeMode, onSelect, onAdded, lastAdded, coloring };

  const refresh = useCallback(() => setDragTick((n) => n + 1), []);

  // Taille de la zone de dessin.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Tant que l'utilisateur n'a pas zoomé ni défilé, le bloc occupe toute la zone.
  useLayoutEffect(() => {
    if (fitted.current && size.width > 0 && size.height > 0) setView(fitView(size.width, size.height, draft.width, draft.height));
  }, [size, draft.width, draft.height]);

  // Thème : les couleurs sont relues quand il change.
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((n) => n + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => setThemeTick((n) => n + 1);
    media.addEventListener("change", onMedia);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", onMedia);
    };
  }, []);

  // Ce qui s'affiche pendant un geste (sans toucher à l'historique).
  const gesture = (() => {
    const d = drag.current;
    let shown: BlockDraft = draft;
    let preview: Segment[] = [];
    if (!d) return { shown, preview };
    if (d.kind === "draw") {
      if (d.tool === "line") preview = [lineSegment(d.start, d.current)];
      else if (d.tool === "arc") preview = [arcSegment(d.start, d.current, d.flipped)];
      else preview = gridSegments(draft, d.start, d.current, grid.cols, grid.rows);
      if (d.tool === "grid") {
        const x0 = Math.min(d.start.x, d.current.x);
        const x1 = Math.max(d.start.x, d.current.x);
        const y0 = Math.min(d.start.y, d.current.y);
        const y1 = Math.max(d.start.y, d.current.y);
        preview = [
          ...preview,
          lineSegment({ x: x0, y: y0 }, { x: x1, y: y0 }),
          lineSegment({ x: x1, y: y0 }, { x: x1, y: y1 }),
          lineSegment({ x: x1, y: y1 }, { x: x0, y: y1 }),
          lineSegment({ x: x0, y: y1 }, { x: x0, y: y0 }),
        ];
      }
    } else if (d.kind === "move") {
      const ids = new Set(d.ids);
      shown = { ...draft, segments: draft.segments.map((s) => (ids.has(s.id) ? translateSegment(s, d.dx, d.dy) : s)) };
    } else if (d.kind === "node") {
      shown = moveNode(draft, d.node, d.target);
    } else if (d.kind === "sagitta") {
      shown = setSagitta(draft, d.id, d.value);
    }
    return { shown, preview };
  })();

  // Peinture.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(size.width * dpr);
    const h = Math.round(size.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    paletteRef.current = readPalette();
    paint(ctx, {
      view,
      width: size.width,
      height: size.height,
      dpr,
      draft: gesture.shown,
      selection: selected,
      preview: gesture.preview,
      hover: coloring ? null : hover,
      showNodes: !coloring && tool === "edit",
      palette: paletteRef.current,
      coloring: coloring ? { pieces: coloring.pieces, colorOf: coloring.colorOf, highlight: coloring.highlight } : null,
    });
  });
  void themeTick;
  void dragTick;

  // Zoom et défilement.
  const applyView = useCallback((next: View, keepFit = false) => {
    if (!keepFit) fitted.current = false;
    setView(next);
  }, []);

  const zoomBy = useCallback(
    (factor: number, x?: number, y?: number) => {
      const v = live.current.view;
      applyView(zoomAt(v, v.scale * factor, x ?? size.width / 2, y ?? size.height / 2));
    },
    [applyView, size],
  );

  const zoomStep = useCallback(
    (direction: 1 | -1) => {
      const v = live.current.view;
      applyView(zoomAt(v, stepZoom(v.scale, direction), size.width / 2, size.height / 2));
    },
    [applyView, size],
  );

  const fit = useCallback(() => {
    fitted.current = true;
    setView(fitView(size.width, size.height, live.current.draft.width, live.current.draft.height));
  }, [size]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey) zoomBy(Math.pow(ZOOM_STEP, -e.deltaY / 100), e.clientX - rect.left, e.clientY - rect.top);
      else if (e.shiftKey) applyView(pan(live.current.view, -e.deltaY, 0));
      else applyView(pan(live.current.view, -e.deltaX, -e.deltaY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy, applyView]);

  // ---- Coordonnées et accrochage ------------------------------------------------------------------------------

  const rawPoint = (e: { clientX: number; clientY: number }): Pt => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return toWorld(live.current.view, e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0));
  };

  const snap = (raw: Pt, exclude?: readonly Segment[], excludeNode?: Pt): SnapResult => {
    const { draft: d, view: v } = live.current;
    const nodeSource = [...(exclude ? d.segments.filter((s) => !exclude.includes(s)) : d.segments), ...d.guides];
    return snapPoint(raw, snapSettingsOf(d), nodeSource, toleranceInInches(SNAP_PX, v.scale), nodeSource, excludeNode);
  };

  const tol = (px: number) => toleranceInInches(px, live.current.view.scale);

  // ---- Souris --------------------------------------------------------------------------------------------------

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    canvas.focus();
    const raw = rawPoint(e);
    const { draft: d, tool: t, selected: sel } = live.current;

    if (e.button === 1) {
      e.preventDefault();
      drag.current = { kind: "pan", x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    const layer = live.current.coloring;
    if (layer) {
      layer.onPiece(pieceAt(layer.pieces, raw));
      return;
    }

    if (t === "line" || t === "arc" || t === "grid") {
      const start = snap(raw).point;
      drag.current = { kind: "draw", tool: t, start, current: start, flipped: false };
      canvas.setPointerCapture(e.pointerId);
      refresh();
      return;
    }

    if (t === "pick") {
      const hit = hitTest(d.segments, raw, tol(SEGMENT_PICK_PX), sel);
      if (e.shiftKey) {
        if (hit) live.current.onSelect(sel.has(hit) ? [...sel].filter((id) => id !== hit) : [...sel, hit]);
        return;
      }
      if (!hit) {
        if (sel.size > 0) live.current.onSelect([]);
        return;
      }
      const ids = sel.has(hit) ? [...sel] : [hit];
      if (!sel.has(hit)) live.current.onSelect(ids);
      const chosen = d.segments.filter((s) => ids.includes(s.id));
      let ref = chosen[0]?.a ?? raw;
      let best = Infinity;
      for (const s of chosen) {
        for (const p of [s.a, s.b]) {
          const dd = dist(p, raw);
          if (dd < best) {
            best = dd;
            ref = p;
          }
        }
      }
      drag.current = { kind: "move", ids, ref, downRaw: raw, dx: 0, dy: 0 };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Outil Édition.
    const only = sel.size === 1 ? d.segments.find((s) => s.id === [...sel][0]) : undefined;
    if (only?.kind === "arc") {
      const g = arcOf(only);
      const handleTol = tol(NODE_PICK_PX);
      const handle = dist(g.apex, raw) <= handleTol ? "apex" : dist(g.tent, raw) <= handleTol ? "tent" : null;
      if (handle) {
        drag.current = { kind: "sagitta", id: only.id, handle, value: only.sagitta };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
    }
    if (live.current.nodeMode === "here") {
      const hit = hitTest(d.segments, raw, tol(SEGMENT_PICK_PX), sel);
      const seg = d.segments.find((s) => s.id === hit);
      if (seg) {
        const snapped = snap(raw).point;
        const onSnapped = project(seg, snapped);
        const pr = onSnapped.distance <= tol(SEGMENT_PICK_PX) ? onSnapped : project(seg, raw);
        editor.execute(fr.draw.history.addNode, (draft0) => addNodesAt(draft0, seg.id, [pr.t]));
        live.current.onSelect([seg.id]);
      }
      return;
    }
    let node: Pt | null = null;
    let nodeD = tol(NODE_PICK_PX);
    for (const s of d.segments) {
      for (const p of [s.a, s.b]) {
        const dd = dist(p, raw) - (sel.has(s.id) ? 1e-9 : 0);
        if (dd <= nodeD) {
          node = p;
          nodeD = dd;
        }
      }
    }
    if (node) {
      drag.current = { kind: "node", node, target: node };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    const hit = hitTest(d.segments, raw, tol(SEGMENT_PICK_PX), sel);
    live.current.onSelect(hit ? [hit] : []);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const raw = rawPoint(e);
    setPointer(raw);
    const g = drag.current;
    const { draft: d, tool: t } = live.current;
    if (!g) {
      setHover(!live.current.coloring && (t === "line" || t === "arc" || t === "grid") ? snap(raw) : null);
      return;
    }
    if (g.kind === "pan") {
      applyView(pan(live.current.view, e.clientX - g.x, e.clientY - g.y));
      g.x = e.clientX;
      g.y = e.clientY;
      return;
    }
    if (g.kind === "draw") {
      const s = snap(raw);
      g.current = s.point;
      setHover(s);
    } else if (g.kind === "move") {
      const chosen = d.segments.filter((s) => g.ids.includes(s.id));
      const target = snap({ x: g.ref.x + (raw.x - g.downRaw.x), y: g.ref.y + (raw.y - g.downRaw.y) }, chosen).point;
      let dx = target.x - g.ref.x;
      let dy = target.y - g.ref.y;
      const box = unionBounds(chosen.map(boundsOf));
      if (box) {
        dx = Math.min(d.width - box.x1, Math.max(-box.x0, dx));
        dy = Math.min(d.height - box.y1, Math.max(-box.y0, dy));
      }
      g.dx = dx;
      g.dy = dy;
      setHover({ point: { x: g.ref.x + dx, y: g.ref.y + dy }, kind: "grid" });
    } else if (g.kind === "node") {
      const s = snap(raw, undefined, g.node);
      g.target = s.point;
      setHover(s);
    } else if (g.kind === "sagitta") {
      const seg = d.segments.find((s) => s.id === g.id);
      if (seg) {
        const s = sagittaThrough(seg.a, seg.b, raw);
        g.value = g.handle === "tent" ? s / 2 : s;
      }
    }
    refresh();
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    const g = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setHover(null);
    if (!g || cancelled || g.kind === "pan") {
      refresh();
      return;
    }
    if (g.kind === "draw") {
      let seg: Segment[] = [];
      if (g.tool === "line") seg = [lineSegment(g.start, g.current)];
      else if (g.tool === "arc") seg = [arcSegment(g.start, g.current, g.flipped)];
      else seg = gridSegments(live.current.draft, g.start, g.current, live.current.grid.cols, live.current.grid.rows);
      if (seg.length > 0) {
        let added: Id[] = [];
        const label = g.tool === "line" ? fr.draw.history.line : g.tool === "arc" ? fr.draw.history.arc : fr.draw.history.grid;
        editor.execute(label, (d0) => {
          const r = addSegments(d0, seg);
          added = r.added;
          return r.draft;
        });
        if (added.length > 0) live.current.onAdded(added);
      }
    } else if (g.kind === "move") {
      if (g.dx !== 0 || g.dy !== 0) editor.execute(fr.draw.history.move, (d0) => moveSegments(d0, g.ids, g.dx, g.dy));
    } else if (g.kind === "node") {
      editor.execute(fr.draw.history.moveNode, (d0) => moveNode(d0, g.node, g.target));
    } else if (g.kind === "sagitta") {
      editor.execute(fr.draw.history.arcShape, (d0) => setSagitta(d0, g.id, g.value));
    }
    refresh();
  };

  // ---- Clavier -------------------------------------------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const { draft: d, selected: sel, tool: t } = live.current;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "+" || e.key === "=" || e.code === "NumpadAdd")) {
        e.preventDefault();
        zoomStep(1);
      } else if (mod && (e.key === "-" || e.code === "NumpadSubtract")) {
        e.preventDefault();
        zoomStep(-1);
      } else if (mod && (e.key === "0" || e.code === "Numpad0")) {
        e.preventDefault();
        fit();
      } else if (live.current.coloring) {
        // Onglet COLORATION : seuls les raccourcis du zoom concernent la zone de dessin.
        return;
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        live.current.onSelect(d.segments.map((s) => s.id));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (sel.size === 0) return;
        e.preventDefault();
        editor.execute(fr.draw.history.remove, (d0) => ({ ...d0, segments: d0.segments.filter((s) => !sel.has(s.id)) }));
        live.current.onSelect([]);
      } else if (e.key === "Escape") {
        if (drag.current) {
          drag.current = null;
          setHover(null);
          refresh();
        } else if (sel.size > 0) live.current.onSelect([]);
      } else if (e.key === " " && !mod) {
        const g = drag.current;
        if (g?.kind === "draw" && g.tool === "arc") {
          e.preventDefault();
          g.flipped = !g.flipped;
          refresh();
        } else if (!g && (t === "pick" || t === "edit") && live.current.lastAdded.length > 0) {
          e.preventDefault();
          const alive = new Set(d.segments.map((s) => s.id));
          live.current.onSelect(live.current.lastAdded.filter((id) => alive.has(id)));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, fit, refresh, zoomStep]);

  const cursor = coloring ? coloring.cursor : tool === "pick" ? "default" : tool === "edit" ? "cell" : "crosshair";

  return (
    <div
      className="block-stage"
      ref={wrapRef}
      data-testid="block-stage"
      data-segments={JSON.stringify(draft.segments)}
      data-guides={draft.guides.length}
      data-pieces={coloring?.pieces.length}
      data-filled={coloring?.pieces.filter((p) => coloring.colorOf(p.key) !== null).length}
    >
      <canvas
        ref={canvasRef}
        className="block-canvas"
        data-testid="block-canvas"
        data-scale={view.scale}
        data-origin-x={view.originX}
        data-origin-y={view.originY}
        data-selected={selection.length}
        tabIndex={0}
        style={{ width: size.width, height: size.height, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onPointerLeave={() => {
          setPointer(null);
          if (!drag.current) setHover(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={fr.draw.canvasLabel}
      />
      <div className="block-zoom" role="group" aria-label={fr.draw.zoom}>
        <button type="button" className="btn btn--small" data-testid="zoom-out" title={fr.draw.zoomOut} onClick={() => zoomStep(-1)}>
          −
        </button>
        <button
          type="button"
          className="btn btn--small"
          data-testid="zoom-level"
          title={fr.draw.zoomActual}
          onClick={() => applyView(zoomAt(view, ACTUAL_SIZE, size.width / 2, size.height / 2))}
        >
          {zoomPercent(view)} %
        </button>
        <button type="button" className="btn btn--small" data-testid="zoom-in" title={fr.draw.zoomIn} onClick={() => zoomStep(1)}>
          +
        </button>
        <button type="button" className="btn btn--small" data-testid="zoom-fit" title={fr.draw.zoomFit} onClick={fit}>
          {fr.draw.fit}
        </button>
      </div>
      <div className="block-readout" data-testid="block-readout">
        {pointer
          ? fr.draw.readout(formatLength(Math.min(draft.width, Math.max(0, pointer.x)), unit), formatLength(Math.min(draft.height, Math.max(0, pointer.y)), unit))
          : fr.draw.readoutIdle}
      </div>
    </div>
  );
}


