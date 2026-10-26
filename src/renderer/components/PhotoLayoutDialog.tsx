// Mise en page de photos (SPEC §9.10) : une page blanche, les photos du carnet à droite, des photos posées à leur taille
// enregistrée, déplacées, redimensionnées, pivotées, retournées, alignées, mises en mosaïque, puis imprimées.
// Fermer la fenêtre efface la page.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { readImageInfo } from "../../core/image/info";
import {
  addPhoto,
  alignPhotos,
  deletePhotos,
  mirrorPhotos,
  movePhotos,
  newPageLayout,
  pastePhotos,
  placePhotos,
  resizePhoto,
  rotatePhotos,
  setGrid,
  tilePhoto,
  type LayoutPhoto,
  type PageLayout,
  type PlacePreset,
} from "../../core/image/pagelayout";
import { layoutPage } from "../../core/print/photo";
import { printableArea } from "../../core/print/paper";
import type { PrintDoc } from "../../core/print/display";
import type { PhotoItem } from "../../core/project/model";
import { formatLength, fromInches, toInches, type DisplayUnit } from "../../core/units";
import { fabricTiles, useFabricTiles } from "../fabricTiles";
import { fr } from "../i18n/fr";
import { drawPage, exportPdf, printDoc } from "../printOutput";
import { printContext, usePrintSettings } from "../printSettings";
import { currentProjectName } from "../projectActions";
import { useSession } from "../projectSession";
import { Modal } from "./Modal";
import { Check, NumberField } from "./fields";

const SCALE = 52; // pixels par pouce dans la fenêtre

export function PhotoLayoutDialog({ unit, notify, onClose }: { unit: DisplayUnit; notify: (m: string) => void; onClose: () => void }) {
  const t = fr.m9.layout;
  const current = useSession();
  const settings = usePrintSettings();
  const tiles = useFabricTiles();
  const area = printableArea(settings.setup);
  const [layout, setLayout] = useState<PageLayout>(() => newPageLayout(area.width, area.height));
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [keepRatio, setKeepRatio] = useState(true);
  const clipboard = useRef<LayoutPhoto[]>([]);
  const drag = useRef<{ id: string; start: { x: number; y: number }; base: PageLayout } | null>(null);
  const ids = useMemo(() => new Set(selected), [selected]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photos = current.project.sketchbook.photos;

  const sizeOf = (photo: PhotoItem): { width: number; height: number } | null => {
    const bytes = current.assets.get(photo.asset);
    if (!bytes) return null;
    try {
      const info = readImageInfo(bytes);
      return { width: info.width / photo.ppi, height: info.height / photo.ppi };
    } catch {
      return null;
    }
  };
  const lookup = (photoId: string) => {
    const photo = photos.find((p) => p.id === photoId);
    const size = photo ? sizeOf(photo) : null;
    return photo && size ? { photo, size } : null;
  };
  const doc = (): PrintDoc => {
    const ctx = printContext(current.project, currentProjectName(), unit, settings);
    return { title: t.title, pages: [layoutPage(ctx, layout, lookup)] };
  };

  // La page est dessinée par le même code que l'impression (donc à l'échelle).
  useLayoutEffect(() => {
    const el = canvasRef.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = layout.width * SCALE;
    const h = layout.height * SCALE;
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    const page = layoutPage(printContext(current.project, currentProjectName(), unit, settings), { ...layout }, lookup);
    const content = page.items[0];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    if (content) drawPage(ctx, { width: layout.width, height: layout.height, items: content.kind === "group" ? content.items : [] }, { fonts: settings.fonts, project: current.project, assets: current.assets }, SCALE);
    // Le contexte de drawPage a sa propre transformation : on le rétablit pour l'appel suivant.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, tiles, current.project, current.assets, unit]);

  const add = (photo: PhotoItem, at?: { x: number; y: number }) => {
    const size = sizeOf(photo);
    if (!size) return notify(fr.m9.patchwork.none);
    const r = addPhoto(layout, photo.id, size.width, size.height, at ?? { x: 0.25 * layout.items.length, y: 0.25 * layout.items.length });
    setLayout(r.layout);
    if (r.id) setSelected([r.id]);
    if (r.reduced) notify(t.reduced);
  };

  const pointOf = (e: React.PointerEvent | React.DragEvent): { x: number; y: number } => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - rect.left) / SCALE, y: (e.clientY - rect.top) / SCALE };
  };

  const hit = (p: { x: number; y: number }): LayoutPhoto | null => {
    for (let i = layout.items.length - 1; i >= 0; i--) {
      const it = layout.items[i] as LayoutPhoto;
      if (p.x >= it.x && p.x <= it.x + it.w && p.y >= it.y && p.y <= it.y + it.h) return it;
    }
    return null;
  };

  const first = layout.items.find((i) => i.id === selected[0]);
  const inUnit = (v: number) => Math.round(fromInches(v, unit) * 1e3) / 1e3;
  const apply = (f: (l: PageLayout) => PageLayout) => setLayout((l) => f(l));
  const need = () => selected.length === 0 && (notify(fr.shape.selection.needSelection), true);

  return (
    <Modal
      title={t.title}
      size="wide"
      testId="photo-layout"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn"
            data-testid="layout-print"
            onClick={() => {
              if (layout.items.length === 0) return notify(t.emptyPage);
              void printDoc(doc(), current.project, current.assets, settings.fonts, 1).then((r) => notify(r.ok ? t.printed : t.failed));
            }}
          >
            {t.print}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="layout-export"
            onClick={() => {
              if (layout.items.length === 0) return notify(t.emptyPage);
              void exportPdf(doc(), current.project, current.assets, settings.fonts).then((r) => r && notify(r.ok ? t.exported(r.path) : t.failed));
            }}
          >
            {t.exportPdf}
          </button>
          <button type="button" className="btn btn--primary" data-testid="layout-close" onClick={onClose}>
            {t.close}
          </button>
        </>
      }
    >
      <div className="layout-grid">
        <div className="layout-page-wrap">
          <div
            className="layout-page"
            data-testid="layout-page"
            data-items={layout.items.length}
            style={{ width: layout.width * SCALE, height: layout.height * SCALE }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("application/x-quilt-photo");
              const photo = photos.find((p) => p.id === id);
              if (photo) add(photo, pointOf(e));
            }}
            onPointerDown={(e) => {
              const p = pointOf(e);
              const h = hit(p);
              if (!h) return setSelected([]);
              const next = e.shiftKey ? (selected.includes(h.id) ? selected.filter((s) => s !== h.id) : [...selected, h.id]) : selected.includes(h.id) ? selected : [h.id];
              setSelected(next);
              drag.current = { id: h.id, start: p, base: layout };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const p = pointOf(e);
              setLayout(movePhotos(d.base, new Set(selected), p.x - d.start.x, p.y - d.start.y));
            }}
            onPointerUp={() => (drag.current = null)}
          >
            <canvas ref={canvasRef} className="layout-canvas" style={{ width: layout.width * SCALE, height: layout.height * SCALE }} />
            <svg className="layout-overlay" width={layout.width * SCALE} height={layout.height * SCALE} viewBox={`0 0 ${layout.width} ${layout.height}`}>
              {layout.grid.show &&
                Array.from({ length: Math.floor((layout.width - layout.grid.originX) / layout.grid.step) + 1 }, (_, i) => <line key={`v${i}`} x1={layout.grid.originX + i * layout.grid.step} x2={layout.grid.originX + i * layout.grid.step} y1={0} y2={layout.height} stroke="#1f5fa8" strokeOpacity={0.25} strokeWidth={0.01} />)}
              {layout.grid.show &&
                Array.from({ length: Math.floor((layout.height - layout.grid.originY) / layout.grid.step) + 1 }, (_, i) => <line key={`h${i}`} y1={layout.grid.originY + i * layout.grid.step} y2={layout.grid.originY + i * layout.grid.step} x1={0} x2={layout.width} stroke="#1f5fa8" strokeOpacity={0.25} strokeWidth={0.01} />)}
              {layout.items.map((i) => (
                <rect key={i.id} x={i.x} y={i.y} width={i.w} height={i.h} fill="none" stroke={ids.has(i.id) ? "#e0a526" : "transparent"} strokeWidth={0.03} strokeDasharray="0.1 0.06" data-testid="layout-item" data-selected={ids.has(i.id)} />
              ))}
            </svg>
          </div>
          <p className="palette-hint">{t.count(layout.items.length)}</p>
        </div>
        <div className="layout-side">
          <h3>{t.photos}</h3>
          {photos.length === 0 && <p className="palette-hint">{t.noPhotos}</p>}
          <div className="layout-photos">
            {photos.map((p) => {
              const view = fabricTiles.photoOf(p, current.project, current.assets);
              return (
                <button key={p.id} type="button" className="layout-photo" draggable data-testid="layout-photo" title={`${p.card.name} — ${t.add}`} onDragStart={(e) => e.dataTransfer.setData("application/x-quilt-photo", p.id)} onClick={() => add(p)}>
                  {view ? <img src={view.url} alt="" draggable={false} /> : null}
                  <span>{p.card.name}</span>
                </button>
              );
            })}
          </div>
          <p className="palette-hint">{t.help}</p>
          {first && (
            <div className="field-row">
              <NumberField label={t.width} value={inUnit(first.w)} testId="layout-w" onCommit={(n) => (apply((l) => resizePhoto(l, first.id, toInches(n, unit), first.h, keepRatio)), true)} />
              <NumberField
                label={t.height}
                value={inUnit(first.h)}
                testId="layout-h"
                onCommit={(n) => (apply((l) => resizePhoto(l, first.id, keepRatio ? (toInches(n, unit) * first.w) / first.h : first.w, toInches(n, unit), false)), true)}
              />
            </div>
          )}
          <Check label={t.keepRatio} checked={keepRatio} testId="layout-ratio" onChange={setKeepRatio} />
          <div className="button-grid">
            <button type="button" className="btn btn--small" data-testid="layout-rot-left" onClick={() => !need() && apply((l) => rotatePhotos(l, ids, -1))}>
              {t.rotateLeft}
            </button>
            <button type="button" className="btn btn--small" data-testid="layout-rot-right" onClick={() => !need() && apply((l) => rotatePhotos(l, ids, 1))}>
              {t.rotateRight}
            </button>
            <button type="button" className="btn btn--small" data-testid="layout-mirror-h" onClick={() => !need() && apply((l) => mirrorPhotos(l, ids, "h"))}>
              {t.mirrorH}
            </button>
            <button type="button" className="btn btn--small" data-testid="layout-mirror-v" onClick={() => !need() && apply((l) => mirrorPhotos(l, ids, "v"))}>
              {t.mirrorV}
            </button>
          </div>
          <div className="button-grid">
            {(Object.keys(t.place) as PlacePreset[]).map((k) => (
              <button key={k} type="button" className="btn btn--small" data-testid={`layout-place-${k}`} onClick={() => !need() && apply((l) => placePhotos(l, ids, k))}>
                {t.place[k]}
              </button>
            ))}
          </div>
          <div className="button-grid">
            {(["top", "bottom", "left", "right"] as const).map((k) => (
              <button key={k} type="button" className="btn btn--small" data-testid={`layout-align-${k}`} disabled={selected.length < 2} onClick={() => apply((l) => alignPhotos(l, selected, k))}>
                {t.align[k]}
              </button>
            ))}
          </div>
          <div className="button-grid">
            <button type="button" className="btn btn--small" data-testid="layout-copy" onClick={() => !need() && (clipboard.current = layout.items.filter((i) => ids.has(i.id)))}>
              {t.copy}
            </button>
            <button
              type="button"
              className="btn btn--small"
              data-testid="layout-paste"
              onClick={() => {
                const r = pastePhotos(layout, clipboard.current);
                setLayout(r.layout);
                setSelected(r.ids);
              }}
            >
              {t.paste}
            </button>
            <button type="button" className="btn btn--small" data-testid="layout-tile" onClick={() => !need() && apply((l) => tilePhoto(l, selected[0] as string))}>
              {t.tile}
            </button>
            <button
              type="button"
              className="btn btn--small"
              data-testid="layout-remove"
              onClick={() => {
                if (need()) return;
                apply((l) => deletePhotos(l, ids));
                setSelected([]);
              }}
            >
              {t.remove}
            </button>
          </div>
          <h3>{t.grid}</h3>
          <Check label={t.showGrid} checked={layout.grid.show} testId="layout-grid-show" onChange={(show) => apply((l) => setGrid(l, { show }))} />
          <Check label={t.snap} checked={layout.grid.snap} testId="layout-grid-snap" onChange={(snap) => apply((l) => setGrid(l, { snap }))} />
          <NumberField label={`${t.step} (${unit === "in" ? "po" : "cm"})`} value={inUnit(layout.grid.step)} testId="layout-grid-step" onCommit={(n) => (n > 0 ? (apply((l) => setGrid(l, { step: toInches(n, unit) })), true) : false)} />
          <p className="palette-hint">{formatLength(layout.width, unit)} × {formatLength(layout.height, unit)}</p>
        </div>
      </div>
    </Modal>
  );
}
