// Aperçu avant impression (SPEC §9.1, §9.5) : les pages dessinées comme elles sortiront, zoom, une ou deux pages
// côte à côte ; pour les gabarits et les fondations, sélection (contour rouge), déplacement, suppression et rotation.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Page, PrintDoc } from "../../core/print/display";
import type { Placed } from "../../core/print/kit";
import { printableArea } from "../../core/print/paper";
import { fr } from "../i18n/fr";
import { drawPage, type CanvasOptions } from "../printOutput";
import { printSettings } from "../printSettings";
import { useFabricTiles } from "../fabricTiles";

export interface PreviewEditing {
  placed: readonly Placed[];
  /** Pivoter est réservé aux gabarits. */
  canRotate: boolean;
  onRemove: (id: string) => void;
  onMove: (id: string, page: number, x: number, y: number) => void;
  onRotate: (id: string) => void;
  onReset: () => void;
}

interface Props {
  doc: PrintDoc;
  canvas: Omit<CanvasOptions, "fonts">;
  busy: boolean;
  onPrint: () => void;
  onExport: () => void;
  onClose: () => void;
  editing?: PreviewEditing | null;
}

const ZOOMS = [24, 36, 48, 64, 96, 128, 192];

function PageCanvas({ page, index, zoom, canvas, selected, onDown }: { page: Page; index: number; zoom: number; canvas: Omit<CanvasOptions, "fonts">; selected: Placed | null; onDown: (e: React.PointerEvent<HTMLCanvasElement>, index: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tiles = useFabricTiles();
  useLayoutEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(page.width * zoom * dpr);
    el.height = Math.round(page.height * zoom * dpr);
    drawPage(ctx, page, { ...canvas, fonts: printSettings.get().fonts }, zoom * dpr);
    if (selected && selected.page === index) {
      const area = printableArea(printSettings.get().setup);
      ctx.save();
      ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, 0, 0);
      ctx.strokeStyle = "#e0262b";
      ctx.lineWidth = 2 / zoom;
      ctx.strokeRect(area.x + selected.x, area.y + selected.y, selected.w, selected.h);
      ctx.restore();
    }
  }, [page, zoom, canvas, selected, index, tiles]);
  return (
    <canvas
      ref={ref}
      className="preview-page"
      data-testid="preview-page"
      data-index={index}
      style={{ width: `${page.width * zoom}px`, height: `${page.height * zoom}px` }}
      onPointerDown={(e) => onDown(e, index)}
    />
  );
}

export function PrintPreview({ doc, canvas, busy, onPrint, onExport, onClose, editing }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [two, setTwo] = useState(true);
  const [fitZoom, setFitZoom] = useState(48);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const drag = useRef<{ id: string; page: number; start: { x: number; y: number }; origin: { x: number; y: number } } | null>(null);
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number } | null>(null);

  const first = doc.pages[0];
  // Ajuster : une page (ou deux) tient dans la zone visible.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !first) return;
    const w = el.clientWidth - 48;
    const h = el.clientHeight - 48;
    const cols = two && doc.pages.length > 1 ? 2 : 1;
    setFitZoom(Math.max(12, Math.min((w - (cols - 1) * 24) / (first.width * cols), h / first.height)));
  }, [first, two, doc.pages.length]);
  const z = zoom ?? fitZoom;

  const selected = useMemo<Placed | null>(() => {
    const p = editing?.placed.find((q) => q.id === selectedId) ?? null;
    if (!p || !dragDelta) return p;
    return { ...p, x: p.x + dragDelta.x, y: p.y + dragDelta.y };
  }, [editing, selectedId, dragDelta]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!editing || !selectedId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        editing.onRemove(selectedId);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, selectedId]);

  const toPage = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const area = printableArea(printSettings.get().setup);
    return { x: (e.clientX - r.left) / z - area.x, y: (e.clientY - r.top) / z - area.y };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>, index: number) => {
    if (!editing) return;
    const p = toPage(e);
    const hit = [...editing.placed].reverse().find((q) => q.page === index && q.id !== "key" && q.id !== "head" && p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h);
    setSelectedId(hit?.id ?? null);
    if (!hit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: hit.id, page: index, start: p, origin: { x: hit.x, y: hit.y } };
    setDragDelta({ x: 0, y: 0 });
    const move = (ev: PointerEvent) => {
      const g = drag.current;
      if (!g) return;
      const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const area = printableArea(printSettings.get().setup);
      setDragDelta({ x: (ev.clientX - r.left) / z - area.x - g.start.x, y: (ev.clientY - r.top) / z - area.y - g.start.y });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const g = drag.current;
      drag.current = null;
      setDragDelta(null);
      if (!g) return;
      const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const area = printableArea(printSettings.get().setup);
      const dx = (ev.clientX - r.left) / z - area.x - g.start.x;
      const dy = (ev.clientY - r.top) / z - area.y - g.start.y;
      if (Math.abs(dx) > 1e-3 || Math.abs(dy) > 1e-3) editing.onMove(g.id, g.page, g.origin.x + dx, g.origin.y + dy);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const zoomStep = (dir: 1 | -1) => {
    const cur = z;
    const next = dir > 0 ? ZOOMS.find((v) => v > cur + 0.5) : [...ZOOMS].reverse().find((v) => v < cur - 0.5);
    setZoom(next ?? cur);
  };

  return (
    <div className="modal-backdrop">
      <div className="print-preview" role="dialog" aria-modal="true" aria-label={fr.print.previewTitle(doc.title)} data-testid="print-preview" data-pages={doc.pages.length}>
        <header className="print-preview-bar">
          <h2>{fr.print.previewTitle(doc.title)}</h2>
          <span className="muted" data-testid="preview-count">
            {fr.print.pages(doc.pages.length)}
          </span>
          <span className="toolbar-spacer" />
          <button type="button" className="btn btn--small" onClick={() => zoomStep(1)} data-testid="preview-zoom-in">
            {fr.print.zoomIn}
          </button>
          <button type="button" className="btn btn--small" onClick={() => zoomStep(-1)} data-testid="preview-zoom-out">
            {fr.print.zoomOut}
          </button>
          <button type="button" className="btn btn--small" onClick={() => setZoom(null)} data-testid="preview-fit">
            {fr.print.fit}
          </button>
          <label className="check">
            <input type="checkbox" checked={two} onChange={(e) => setTwo(e.target.checked)} data-testid="preview-two" />
            <span>{fr.print.twoPages}</span>
          </label>
          <button type="button" className="btn btn--small" disabled={busy} onClick={onExport} data-testid="preview-export">
            {fr.print.exportPdf}
          </button>
          <button type="button" className="btn btn--small btn--primary" disabled={busy} onClick={onPrint} data-testid="preview-print">
            {fr.print.print}
          </button>
          <button type="button" className="btn btn--small" onClick={onClose} data-testid="preview-close">
            {fr.print.close}
          </button>
        </header>
        {editing && (
          <div className="print-preview-edit">
            <span className="muted">{fr.print.previewEditHelp}</span>
            {editing.canRotate && (
              <button type="button" className="btn btn--small" disabled={!selectedId} onClick={() => selectedId && editing.onRotate(selectedId)} data-testid="preview-rotate">
                {fr.print.rotate30}
              </button>
            )}
            <button
              type="button"
              className="btn btn--small"
              disabled={!selectedId}
              data-testid="preview-remove"
              onClick={() => {
                if (selectedId) editing.onRemove(selectedId);
                setSelectedId(null);
              }}
            >
              {fr.print.remove}
            </button>
            <button type="button" className="btn btn--small" onClick={editing.onReset} data-testid="preview-reset">
              {fr.print.resetLayout}
            </button>
          </div>
        )}
        <div
          className={`print-preview-pages${two ? " print-preview-pages--two" : ""}`}
          ref={scroller}
          onWheel={(e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            zoomStep(e.deltaY < 0 ? 1 : -1);
          }}
        >
          {doc.pages.map((page, i) => (
            <div className="preview-sheet" key={i}>
              <PageCanvas page={page} index={i} zoom={z} canvas={canvas} selected={selected} onDown={onDown} />
              <span className="preview-label">{fr.print.pageOf(i + 1, doc.pages.length)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
