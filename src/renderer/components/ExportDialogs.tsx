// Export d'une image (SPEC §10.1, Q-10.1 : PNG, JPG, SVG et PDF ; taille en po ou cm, affichage en pixels ;
// 72 à 600 ppp, 150 par défaut ; JPG qualité 50) et export d'une sélection (§10.2 : PNG, presse-papiers, impression).

import { useMemo, useState } from "react";
import { rectPath, type Item, type PrintDoc } from "../../core/print/display";
import { printableArea, pageSize } from "../../core/print/paper";
import { pictureToSvg } from "../../core/print/svg";
import { encodePng } from "../../core/image/png";
import { MAX_PIXELS } from "../../core/image/raster";
import { formatLength, fromInches, toInches, type DisplayUnit } from "../../core/units";
import type { ExportKind } from "../../shared/api";
import { fr } from "../i18n/fr";
import { buildPdf, drawItems, exportBytes, printDoc, svgFabrics } from "../printOutput";
import { printSettings, usePrintSettings } from "../printSettings";
import { getApi } from "../projectActions";
import { useSession } from "../projectSession";
import { Modal } from "./Modal";
import { Check, NumberField } from "./fields";

/** Une image à exporter : des éléments dans un repère en pouces, et la zone (x0, y0, largeur, hauteur) à garder. */
export interface Picture {
  name: string;
  x0: number;
  y0: number;
  width: number;
  height: number;
  /** Les éléments, selon les contours demandés. */
  items: (o: { pieceOutlines: boolean; blockOutlines: boolean }) => Item[];
}

export const RESOLUTIONS = [72, 96, 150, 200, 300, 600] as const;
const MAX_SIDE = 16000;

/** Rendu raster d'une image : `w × h` pouces à `dpi` pixels par pouce, fond blanc. */
export function rasterize(items: readonly Item[], pic: Pick<Picture, "x0" | "y0" | "width" | "height">, w: number, dpi: number, canvasOptions: Parameters<typeof drawItems>[2]): HTMLCanvasElement {
  const k = (w / pic.width) * dpi;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(pic.width * k));
  canvas.height = Math.max(1, Math.round(pic.height * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(k, 0, 0, k, -pic.x0 * k, -pic.y0 * k);
  drawItems(ctx, items, canvasOptions, k);
  return canvas;
}

export function canvasPng(canvas: HTMLCanvasElement, dpi: number): Uint8Array {
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Uint8Array();
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return encodePng({ width: data.width, height: data.height, data: data.data }, dpi);
}

async function canvasJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality / 100));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : new Uint8Array();
}

type Format = "png" | "jpg" | "svg" | "pdf";

export function ExportImageDialog({ pictures, unit, notify, onClose, initialFormat = "png" }: { pictures: { whole: Picture; selected: Picture | null }; unit: DisplayUnit; notify: (m: string) => void; onClose: () => void; initialFormat?: Format }) {
  const current = useSession();
  const settings = usePrintSettings();
  const [format, setFormat] = useState<Format>(initialFormat);
  const [which, setWhich] = useState<"whole" | "selected">(pictures.selected ? "selected" : "whole");
  const pic = which === "selected" && pictures.selected ? pictures.selected : pictures.whole;
  const initialW = Math.min(pic.width, 8);
  const [size, setSize] = useState({ w: initialW, h: (initialW * pic.height) / pic.width, keep: true });
  const [dpi, setDpi] = useState(150);
  const [quality, setQuality] = useState(50);
  const [outlines, setOutlines] = useState({ pieceOutlines: true, blockOutlines: true });
  const [busy, setBusy] = useState(false);

  const px = { w: Math.round(size.w * dpi), h: Math.round(size.h * dpi) };
  const raster = format === "png" || format === "jpg";
  const tooBig = raster && (px.w > MAX_SIDE || px.h > MAX_SIDE || px.w * px.h > MAX_PIXELS);
  const items = useMemo(() => pic.items(outlines), [pic, outlines]);

  const choose = (w: "whole" | "selected") => {
    setWhich(w);
    const p = w === "selected" && pictures.selected ? pictures.selected : pictures.whole;
    const nw = Math.min(p.width, 8);
    setSize({ w: nw, h: (nw * p.height) / p.width, keep: true });
  };

  const run = async () => {
    setBusy(true);
    try {
      const canvasOptions = { fonts: settings.fonts, project: current.project, assets: current.assets };
      const s = size.w / pic.width;
      const scaled: Item[] = [{ kind: "group", mat: [s, 0, 0, size.h / pic.height, -pic.x0 * s, (-pic.y0 * size.h) / pic.height], items }];
      let bytes: Uint8Array;
      let kind: ExportKind;
      if (format === "png" || format === "jpg") {
        const canvas = rasterize(items, pic, size.w, dpi, canvasOptions);
        bytes = format === "png" ? canvasPng(canvas, dpi) : await canvasJpeg(canvas, quality);
        kind = format;
      } else if (format === "svg") {
        bytes = new TextEncoder().encode(pictureToSvg(scaled, size.w, size.h, { fonts: settings.fonts, fabrics: svgFabrics(current.project, current.assets) }, "#ffffff"));
        kind = "svg";
      } else {
        const doc: PrintDoc = { title: pic.name, pages: [{ width: size.w, height: size.h, items: scaled }] };
        bytes = await buildPdf(doc, current.project, current.assets, settings.fonts);
        kind = "pdf";
      }
      const r = await exportBytes(kind, pic.name, bytes);
      if (r) notify(r.ok ? fr.print.exported(r.path) : fr.print.exportFailed);
      if (r?.ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  const v = (inches: number) => Math.round(fromInches(inches, unit) * 1000) / 1000;
  return (
    <Modal
      title={fr.print.image.title}
      size="narrow"
      testId="export-image"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {fr.print.close}
          </button>
          <button type="button" className="btn btn--primary" data-testid="export-image-go" disabled={busy || tooBig} onClick={() => void run()}>
            {fr.print.image.export}
          </button>
        </>
      }
    >
      <fieldset className="prefs-group">
        <legend>{fr.print.image.format}</legend>
        {(Object.keys(fr.print.image.formats) as Format[]).map((f) => (
          <label key={f} className="radio">
            <input type="radio" name="export-format" checked={format === f} data-testid={`export-format-${f}`} onChange={() => setFormat(f)} />
            {fr.print.image.formats[f]}
          </label>
        ))}
      </fieldset>
      {pictures.selected && (
        <fieldset className="prefs-group">
          <legend>{fr.print.image.what}</legend>
          <label className="radio">
            <input type="radio" name="export-what" checked={which === "whole"} data-testid="export-whole" onChange={() => choose("whole")} />
            {fr.print.image.wholeQuilt}
          </label>
          <label className="radio">
            <input type="radio" name="export-what" checked={which === "selected"} data-testid="export-selected" onChange={() => choose("selected")} />
            {fr.print.image.selectedBlock}
          </label>
        </fieldset>
      )}
      <fieldset className="prefs-group">
        <legend>{fr.print.image.dimensions}</legend>
        <div className="button-row">
          <NumberField
            label={fr.print.width}
            value={v(size.w)}
            decimals={3}
            testId="export-width"
            onCommit={(n) => {
              const w = toInches(n, unit);
              if (!(w > 0 && w <= 400)) return false;
              setSize((sz) => ({ ...sz, w, h: sz.keep ? (w * pic.height) / pic.width : sz.h }));
              return true;
            }}
          />
          <NumberField
            label={fr.print.height}
            value={v(size.h)}
            decimals={3}
            testId="export-height"
            onCommit={(n) => {
              const h = toInches(n, unit);
              if (!(h > 0 && h <= 400)) return false;
              setSize((sz) => ({ ...sz, h, w: sz.keep ? (h * pic.width) / pic.height : sz.w }));
              return true;
            }}
          />
        </div>
        <Check label={fr.print.image.keepRatio} checked={size.keep} testId="export-keep" onChange={(keep) => setSize((sz) => ({ ...sz, keep, h: keep ? (sz.w * pic.height) / pic.width : sz.h }))} />
        {raster && (
          <label className="field">
            <span className="field-label">{fr.print.image.resolution}</span>
            <select value={dpi} data-testid="export-dpi" onChange={(e) => setDpi(Number(e.target.value))}>
              {RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {r} ppp
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="muted" data-testid="export-pixels">
          {raster ? fr.print.image.pixels(px.w, px.h) : `${formatLength(size.w, unit, 2)} × ${formatLength(size.h, unit, 2)}`}
        </p>
        {tooBig && <p className="palette-hint palette-hint--strong">{fr.print.image.tooBig}</p>}
        {format === "jpg" && <NumberField label={fr.print.image.quality} value={quality} decimals={0} testId="export-quality" onCommit={(n) => (Number.isInteger(n) && n >= 0 && n <= 100 ? (setQuality(n), true) : false)} />}
      </fieldset>
      <fieldset className="prefs-group">
        <legend>{fr.print.options}</legend>
        <Check label={fr.print.pieceOutlines} checked={outlines.pieceOutlines} testId="export-piece-outlines" onChange={(x) => setOutlines((o) => ({ ...o, pieceOutlines: x }))} />
        <Check label={fr.print.blockOutlines} checked={outlines.blockOutlines} testId="export-block-outlines" onChange={(x) => setOutlines((o) => ({ ...o, blockOutlines: x }))} />
      </fieldset>
    </Modal>
  );
}

/** La boîte de l'export d'une sélection : enregistrer en PNG, copier, imprimer. */
export function SelectionDialog({ picture, notify, onClose }: { picture: Picture; notify: (m: string) => void; onClose: () => void }) {
  const current = useSession();
  const settings = usePrintSettings();
  const [busy, setBusy] = useState(false);
  const items = useMemo<Item[]>(() => [{ kind: "group", mat: [1, 0, 0, 1, 0, 0], clip: rectPath(picture.x0, picture.y0, picture.width, picture.height), items: picture.items({ pieceOutlines: true, blockOutlines: true }) }], [picture]);
  const dpi = 150;
  const png = () => canvasPng(rasterize(items, picture, picture.width, dpi, { fonts: settings.fonts, project: current.project, assets: current.assets }), dpi);
  const act = async (what: "save" | "copy" | "print") => {
    setBusy(true);
    try {
      if (what === "save") {
        const r = await exportBytes("png", picture.name, png());
        if (r) notify(r.ok ? fr.print.exported(r.path) : fr.print.exportFailed);
        if (r?.ok) onClose();
      } else if (what === "copy") {
        const ok = await getApi().copyImage(png());
        notify(ok ? fr.print.selection.copied : fr.print.exportFailed);
        if (ok) onClose();
      } else {
        const setup = printSettings.get().setup;
        const area = printableArea(setup);
        const k = Math.min(area.width / picture.width, area.height / picture.height);
        const doc: PrintDoc = { title: picture.name, pages: [{ ...pageSize(setup), items: [{ kind: "group", mat: [k, 0, 0, k, area.x - picture.x0 * k, area.y - picture.y0 * k], items }] }] };
        const r = await printDoc(doc, current.project, current.assets, settings.fonts, 1);
        notify(r.ok ? fr.print.printed : r.error === "cancelled" ? fr.print.printCancelled : fr.print.printFailed);
        if (r.ok) onClose();
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={fr.print.selection.title}
      size="narrow"
      testId="export-selection"
      onClose={onClose}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          {fr.print.close}
        </button>
      }
    >
      <div className="button-column">
        <button type="button" className="btn" disabled={busy} data-testid="selection-save" onClick={() => void act("save")}>
          {fr.print.selection.save}
        </button>
        <button type="button" className="btn" disabled={busy} data-testid="selection-copy" onClick={() => void act("copy")}>
          {fr.print.selection.copy}
        </button>
        <button type="button" className="btn" disabled={busy} data-testid="selection-print" onClick={() => void act("print")}>
          {fr.print.selection.print}
        </button>
      </div>
    </Modal>
  );
}
