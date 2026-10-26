// Image de décalque (SPEC §6.5), disponible dans tous les styles : importer, position et taille, clarté, recadrer,
// masquer, supprimer. L'image n'est pas enregistrée avec le bloc.

import { useRef, useState } from "react";
import type { BlockDraft } from "../../core/draw/draft";
import { DEFAULT_TRACE_PPI, TRACE_FITS, type TraceFit, type TraceImage } from "../../core/draw/trace";
import { fr } from "../i18n/fr";
import { getApi } from "../projectActions";
import { NumberField } from "./fields";

interface Props {
  draft: BlockDraft;
  run: (label: string, change: (d: BlockDraft) => BlockDraft) => boolean;
  notify: (message: string) => void;
}

function mimeOf(name: string): string {
  return /\.jpe?g$/i.test(name) ? "image/jpeg" : "image/png";
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function TracePanel({ draft, run, notify }: Props) {
  const trace = draft.trace;
  const original = useRef<{ src: string; pxW: number; pxH: number } | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const t = fr.shape.trace;

  const set = (patch: Partial<TraceImage>, label: string = fr.shape.history.trace) => run(label, (d) => (d.trace ? { ...d, trace: { ...d.trace, ...patch } } : d));

  const importImage = async () => {
    const files = await getApi().importImages(false);
    const file = files?.[0];
    if (!file) return;
    if (!file.bytes) return notify(t.failed);
    const src = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: mimeOf(file.name) }));
    const img = await loadImage(src);
    if (!img) return notify(t.failed);
    original.current = { src, pxW: img.naturalWidth, pxH: img.naturalHeight };
    setCrop({ x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight });
    setCropOpen(true); // la boîte de recadrage s'ouvre d'abord
    run(fr.shape.history.trace, (d) => ({ ...d, trace: { src, pxW: img.naturalWidth, pxH: img.naturalHeight, ppi: DEFAULT_TRACE_PPI, fit: "inside", clarity: 60, visible: true } }));
    notify(t.imported);
  };

  const applyCrop = async () => {
    if (!trace || !crop) return;
    const img = await loadImage(trace.src);
    if (!img) return notify(t.failed);
    const x = Math.max(0, Math.min(img.naturalWidth - 1, Math.round(crop.x)));
    const y = Math.max(0, Math.min(img.naturalHeight - 1, Math.round(crop.y)));
    const w = Math.max(1, Math.min(img.naturalWidth - x, Math.round(crop.w)));
    const h = Math.max(1, Math.min(img.naturalHeight - y, Math.round(crop.h)));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(img, x, y, w, h, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return notify(t.failed);
    set({ src: URL.createObjectURL(blob), pxW: w, pxH: h }, fr.shape.history.trace);
    setCrop({ x: 0, y: 0, w, h });
    setCropOpen(false);
    notify(t.cropped);
  };

  const resetCrop = () => {
    const o = original.current;
    if (!o) return;
    set({ src: o.src, pxW: o.pxW, pxH: o.pxH });
    setCrop({ x: 0, y: 0, w: o.pxW, h: o.pxH });
  };

  return (
    <div className="palette-group" data-testid="trace-panel">
      <h3>{t.title}</h3>
      <div className="button-grid">
        <button type="button" className="btn btn--small" data-testid="trace-import" onClick={() => void importImage()}>
          {t.import}
        </button>
        <button type="button" className="btn btn--small" data-testid="trace-remove" disabled={!trace} onClick={() => run(fr.shape.history.trace, (d) => ({ ...d, trace: null }))}>
          {t.remove}
        </button>
      </div>
      {!trace && <p className="palette-hint">{t.help}</p>}
      {trace && (
        <>
          <label className="field">
            <span className="field-label">{t.fit}</span>
            <select value={trace.fit} data-testid="trace-fit" onChange={(e) => set({ fit: e.target.value as TraceFit })}>
              {TRACE_FITS.map((f) => (
                <option key={f} value={f}>
                  {t.fits[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t.clarity}</span>
            <input type="range" min={0} max={100} value={trace.clarity} data-testid="trace-clarity" onChange={(e) => set({ clarity: Number(e.target.value) })} />
          </label>
          <div className="button-grid">
            <button type="button" className="btn btn--small" data-testid="trace-toggle" aria-pressed={!trace.visible} onClick={() => set({ visible: !trace.visible })}>
              {trace.visible ? t.hide : t.show}
            </button>
            <button type="button" className="btn btn--small" data-testid="trace-crop" aria-pressed={cropOpen} onClick={() => setCropOpen((o) => !o)}>
              {t.crop}
            </button>
          </div>
          {cropOpen && crop && (
            <div data-testid="trace-crop-box">
              <div className="field-row">
                <NumberField label={t.cropX} value={crop.x} decimals={0} testId="trace-crop-x" onCommit={(n) => (n >= 0 ? (setCrop({ ...crop, x: n }), true) : false)} />
                <NumberField label={t.cropY} value={crop.y} decimals={0} testId="trace-crop-y" onCommit={(n) => (n >= 0 ? (setCrop({ ...crop, y: n }), true) : false)} />
              </div>
              <div className="field-row">
                <NumberField label={t.cropW} value={crop.w} decimals={0} testId="trace-crop-w" onCommit={(n) => (n >= 1 ? (setCrop({ ...crop, w: n }), true) : false)} />
                <NumberField label={t.cropH} value={crop.h} decimals={0} testId="trace-crop-h" onCommit={(n) => (n >= 1 ? (setCrop({ ...crop, h: n }), true) : false)} />
              </div>
              <div className="button-grid">
                <button type="button" className="btn btn--small" data-testid="trace-crop-apply" onClick={() => void applyCrop()}>
                  ✓ {t.cropApply}
                </button>
                <button type="button" className="btn btn--small" data-testid="trace-crop-reset" onClick={resetCrop}>
                  ↺ {t.cropReset}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
