import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { ACTUAL_SIZE, fitView, pan, stepZoom, toWorld, zoomAt, zoomPercent, type View } from "../../core/draw/view";
import type { Pt } from "../../core/quilt/geom";
import { readPalette, type Palette } from "../blockDraw";
import { fr } from "../i18n/fr";
import { useFabricTiles } from "../fabricTiles";
import { paintQuilt, type QuiltPaint } from "../quiltDraw";

export interface PointerInfo {
  kind: "down" | "move" | "up" | "leave";
  world: Pt;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  /** Pixels d'écran par pouce, pour convertir les tolérances de clic. */
  scale: number;
}

type Shared = Omit<QuiltPaint, "view" | "width" | "height" | "dpr" | "palette">;

interface Props {
  paint: Shared;
  onPointer: (info: PointerInfo) => void;
  /** Un bloc glissé depuis la palette est lâché sur le quilt. */
  onDrop?: (world: Pt, payload: string) => void;
  cursor: string;
  /** Change quand la taille du centre change : le quilt est alors recadré (tant qu'on n'a pas zoomé). */
  fitKey: string;
  /** Texte de la barre du bas (taille finie du quilt…). */
  footer: string;
}

export const DROP_MIME = "application/x-quilt-studio-block";

export function QuiltCanvas({ paint, onPointer, onDrop, cursor, fitKey, footer }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ scale: ACTUAL_SIZE / 4, originX: 40, originY: 40 });
  const [themeTick, setThemeTick] = useState(0);
  const [pointer, setPointer] = useState<Pt | null>(null);
  const fitted = useRef(true);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const paletteRef = useRef<Palette | null>(null);
  const live = useRef({ view, onPointer });
  live.current = { view, onPointer };
  useFabricTiles();

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Le cadrage vise le quilt fini (bordures comprises) ; l'origine reste le coin haut-gauche du centre.
  const bounds = paint.scene.bounds;
  const totalW = bounds.x1 - bounds.x0;
  const totalH = bounds.y1 - bounds.y0;
  const fittedView = useCallback(
    (areaW: number, areaH: number): View => {
      const v = fitView(areaW, areaH, totalW, totalH, paint.rulers ? 40 : 28);
      return { ...v, originX: v.originX - bounds.x0 * v.scale, originY: v.originY - bounds.y0 * v.scale };
    },
    [totalW, totalH, bounds.x0, bounds.y0, paint.rulers],
  );
  useLayoutEffect(() => {
    fitted.current = true;
  }, [fitKey]);
  useLayoutEffect(() => {
    if (fitted.current && size.width > 0 && size.height > 0) setView(fittedView(size.width, size.height));
  }, [size, fittedView, fitKey]);

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

  // Dessin.
  useLayoutEffect(() => {
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
    paintQuilt(ctx, { ...paint, view, width: size.width, height: size.height, dpr, palette: paletteRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint, view, size, themeTick]);

  const worldOf = useCallback((e: { clientX: number; clientY: number }): Pt => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return toWorld(live.current.view, e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0));
  }, []);

  const info = (kind: PointerInfo["kind"], e: ReactPointerEvent): PointerInfo => ({
    kind,
    world: worldOf(e),
    shift: e.shiftKey,
    ctrl: e.ctrlKey || e.metaKey,
    alt: e.altKey,
    scale: live.current.view.scale,
  });

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || e.button === 2) {
      panning.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    live.current.onPointer(info("down", e));
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = panning.current;
    if (p) {
      fitted.current = false;
      setView((v) => pan(v, e.clientX - p.x, e.clientY - p.y));
      panning.current = { x: e.clientX, y: e.clientY };
      return;
    }
    setPointer(worldOf(e));
    live.current.onPointer(info("move", e));
  };
  const onUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (panning.current) {
      panning.current = null;
      return;
    }
    if (!dragging.current) return;
    dragging.current = false;
    live.current.onPointer(info("up", e));
  };

  const onWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    fitted.current = false;
    if (e.ctrlKey || e.metaKey) setView((v) => zoomAt(v, v.scale * Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top));
    else setView((v) => pan(v, -e.deltaX, -e.deltaY));
  };

  const zoomBy = (direction: 1 | -1) => {
    fitted.current = false;
    setView((v) => zoomAt(v, stepZoom(v.scale, direction), size.width / 2, size.height / 2));
  };
  const fit = () => {
    fitted.current = true;
    setView(fittedView(size.width, size.height));
  };

  // Ctrl++, Ctrl+−, Ctrl+0 (comme dans le plan Bloc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(1);
      } else if (e.key === "-") {
        e.preventDefault();
        zoomBy(-1);
      } else if (e.key === "0") {
        e.preventDefault();
        fit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const dropHandlers = onDrop
    ? {
        onDragOver: (e: DragEvent) => {
          if (e.dataTransfer.types.includes(DROP_MIME)) e.preventDefault();
        },
        onDrop: (e: DragEvent) => {
          const payload = e.dataTransfer.getData(DROP_MIME);
          if (!payload) return;
          e.preventDefault();
          onDrop(worldOf(e), payload);
        },
      }
    : {};

  return (
    <div className="block-stage quilt-stage" ref={wrapRef} data-testid="quilt-stage">
      <canvas
        ref={canvasRef}
        className="block-canvas"
        data-testid="quilt-canvas"
        data-scale={view.scale}
        data-origin-x={view.originX}
        data-origin-y={view.originY}
        data-pieces={paint.scene.pieces.length}
        data-slots={paint.scene.slots.length}
        data-items={paint.scene.items.length}
        data-width={paint.scene.width}
        data-height={paint.scene.height}
        data-total-width={totalW}
        data-total-height={totalH}
        data-borders={paint.scene.borders.rings.length}
        tabIndex={0}
        style={{ width: size.width, height: size.height, cursor }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={(e) => {
          setPointer(null);
          if (!dragging.current) live.current.onPointer(info("leave", e));
        }}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        {...dropHandlers}
      />
      <div className="block-zoom" role="group" aria-label={fr.draw.zoom}>
        <button type="button" className="btn btn--small" data-testid="quilt-zoom-out" title={fr.draw.zoomOut} onClick={() => zoomBy(-1)}>
          −
        </button>
        <button type="button" className="btn btn--small" data-testid="quilt-zoom" title={fr.draw.zoomActual} onClick={() => { fitted.current = false; setView((v) => zoomAt(v, ACTUAL_SIZE, size.width / 2, size.height / 2)); }}>
          {zoomPercent(view)} %
        </button>
        <button type="button" className="btn btn--small" data-testid="quilt-zoom-in" title={fr.draw.zoomIn} onClick={() => zoomBy(1)}>
          +
        </button>
        <button type="button" className="btn btn--small" data-testid="quilt-fit" title={fr.draw.zoomFit} onClick={fit}>
          {fr.draw.fit}
        </button>
      </div>
      <div className="quilt-finished" data-testid="quilt-size">
        {footer}
      </div>
      <div className="block-readout" data-testid="quilt-pointer">
        {pointer ? `${pointer.x.toFixed(2)} ; ${pointer.y.toFixed(2)}` : ""}
      </div>
    </div>
  );
}
