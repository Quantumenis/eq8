// Plan Image, version 1 (SPEC §7.1-7.7) : importer une image, mettre un tissu à l'échelle, recadrer, redresser,
// pivoter, retourner, incliner, redimensionner, puis « Ajouter comme tissu » ou « Enregistrer dans Photos ».

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { hexToRgb, parseHex } from "../../core/color/color";
import { sha256Hex } from "../../core/hash";
import type { ImageDoc } from "../../core/image/editor";
import {
  CROP_PRESETS,
  clampRect,
  crop,
  flip,
  ppiForMeasure,
  ppiForWidth,
  presetRect,
  resize,
  rotate,
  shear,
  straightenAngle,
  type PixelRect,
  type Resample,
} from "../../core/image/ops";
import { encodePng } from "../../core/image/png";
import { averageColor } from "../../core/image/raster";
import { addToSketchbook } from "../../core/project/commands";
import { makeImageFabric, makePhoto } from "../../core/project/images";
import type { FabricItem, PhotoItem } from "../../core/project/model";
import { formatLength, fromInches, toInches, type DisplayUnit } from "../../core/units";
import { fr } from "../i18n/fr";
import { decodeImage, imageEditor, originalImage, rasterCanvas, setOriginalImage, useImageEditor } from "../imageEditor";
import { getApi } from "../projectActions";
import { session } from "../projectSession";
import { useDialogs } from "./Dialogs";
import { Check, NumberField } from "./fields";

type ImageTool = "pan" | "crop" | "straighten" | "measure";
const TOOLS: ImageTool[] = ["pan", "crop", "straighten", "measure"];

/** Demandes venues d'ailleurs (menu Fichier > Importer une image, « Modifier » une photo du carnet). */
export interface ImageRequests {
  /** Compteur : chaque incrément ouvre la boîte d'import. */
  importImage: number;
  /** La photo du carnet à poser sur le plan (avec l'instant de la demande). */
  editPhoto: { id: string; at: number } | null;
}

interface Props {
  unit: DisplayUnit;
  notify: (message: string) => void;
  /** Appelée après un ajout au carnet : « Ajouter au carnet » enregistre le projet. */
  onAdded: () => Promise<void>;
  requests: ImageRequests;
}

interface Pt {
  x: number;
  y: number;
}

interface View {
  /** Pixels d'écran par pixel de l'image. */
  zoom: number;
  originX: number;
  originY: number;
}

const RULER = 22;
const HANDLE_PX = 8;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 32;

function fitView(width: number, height: number, doc: ImageDoc | null): View {
  if (!doc || width <= 0 || height <= 0) return { zoom: 1, originX: RULER + 16, originY: RULER + 16 };
  const room = { w: width - RULER - 32, h: height - RULER - 32 };
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, room.w / doc.raster.width, room.h / doc.raster.height));
  return {
    zoom,
    originX: RULER + 16 + (room.w - doc.raster.width * zoom) / 2,
    originY: RULER + 16 + (room.h - doc.raster.height * zoom) / 2,
  };
}

const baseName = (file: string) => file.replace(/\.[^.]+$/, "");

/** Demandes déjà traitées : elles survivent au démontage du plan (on change de plan, puis on revient). */
const handled = { importImage: 0, editPhotoAt: 0 };

/** Recherche de la poignée du cadre de recadrage sous le pointeur (coins, milieux des côtés, intérieur). */
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

function handleAt(rect: PixelRect, p: Pt, tol: number): Handle | null {
  const xs = { w: rect.x, c: rect.x + rect.width / 2, e: rect.x + rect.width };
  const ys = { n: rect.y, c: rect.y + rect.height / 2, s: rect.y + rect.height };
  const near = (a: number, b: number) => Math.abs(a - b) <= tol;
  const candidates: [Handle, number, number][] = [
    ["nw", xs.w, ys.n],
    ["n", xs.c, ys.n],
    ["ne", xs.e, ys.n],
    ["e", xs.e, ys.c],
    ["se", xs.e, ys.s],
    ["s", xs.c, ys.s],
    ["sw", xs.w, ys.s],
    ["w", xs.w, ys.c],
  ];
  for (const [h, x, y] of candidates) if (near(p.x, x) && near(p.y, y)) return h;
  if (p.x > rect.x && p.x < rect.x + rect.width && p.y > rect.y && p.y < rect.y + rect.height) return "move";
  return null;
}

function moveHandle(start: PixelRect, h: Handle, dx: number, dy: number, w: number, hgt: number): PixelRect {
  let { x, y, width, height } = start;
  if (h === "move") {
    x = Math.min(w - width, Math.max(0, x + dx));
    y = Math.min(hgt - height, Math.max(0, y + dy));
    return { x, y, width, height };
  }
  let x0 = x;
  let y0 = y;
  let x1 = x + width;
  let y1 = y + height;
  if (h.includes("w")) x0 = Math.min(x1 - 1, Math.max(0, x0 + dx));
  if (h.includes("e")) x1 = Math.max(x0 + 1, Math.min(w, x1 + dx));
  if (h.includes("n")) y0 = Math.min(y1 - 1, Math.max(0, y0 + dy));
  if (h.includes("s")) y1 = Math.max(y0 + 1, Math.min(hgt, y1 + dy));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

const roundRect = (r: PixelRect): PixelRect => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });

export function ImageWorkspace({ unit, notify, onAdded, requests }: Props) {
  const editor = useImageEditor();
  const dialogs = useDialogs();
  const doc = editor.doc;
  const t = fr.image;
  const [tool, setTool] = useState<ImageTool>("pan");
  const [cropRect, setCropRect] = useState<PixelRect | null>(null);
  const [line, setLine] = useState<{ a: Pt; b: Pt } | null>(null);
  const [measure, setMeasure] = useState<{ a: Pt; b: Pt } | null>(null);
  const [scaleWidth, setScaleWidth] = useState(6);
  const [measureLength, setMeasureLength] = useState(1);
  const [angle, setAngle] = useState(15);
  const [cropAfter, setCropAfter] = useState(false);
  const [background, setBackground] = useState("#ffffff");
  const [shearH, setShearH] = useState(0);
  const [shearV, setShearV] = useState(0);
  const [resizeUnit, setResizeUnit] = useState<"px" | DisplayUnit>("px");
  const [keepRatio, setKeepRatio] = useState(true);
  const [size, setSize] = useState({ w: 0, h: 0, res: 75 });
  const [method, setMethod] = useState<Resample>("normal");
  const [busy, setBusy] = useState(false);

  // À chaque nouvelle image (ou retouche), les valeurs proposées suivent l'image.
  useEffect(() => {
    if (!doc) return;
    setScaleWidth(Math.round((doc.raster.width / doc.ppi) * 100) / 100);
    setSize({ w: doc.raster.width, h: doc.raster.height, res: doc.ppi });
    setResizeUnit("px");
    setCropRect((r) => (r ? clampRect(doc.raster, r) : null));
  }, [doc]);

  const chooseTool = (next: ImageTool) => {
    setTool(next);
    if (next === "crop" && doc && !cropRect) setCropRect({ x: 0, y: 0, width: doc.raster.width, height: doc.raster.height });
  };

  const run = (label: string, change: (d: ImageDoc) => ImageDoc) => {
    try {
      return editor.execute(label, change);
    } catch (error) {
      notify(t.failed(String((error as Error).message ?? error)));
      return false;
    }
  };

  // ---- Fichier -------------------------------------------------------------------------------------------------

  /** Image modifiée et jamais enregistrée : la proposer à Photos avant de la remplacer (SPEC §7.2). */
  const keepOrDiscard = async (): Promise<void> => {
    if (!editor.modified) return;
    const save = await dialogs.confirm(t.unsavedQuestion, { detail: t.unsavedDetail, okLabel: t.saveToPhotos });
    if (save) savePhoto();
  };

  const importImage = async () => {
    const chosen = await getApi().importImages(false);
    const file = chosen?.[0];
    if (!file) return;
    if (!file.bytes) return notify(file.error === "too-large" ? t.tooLarge : t.unreadable(file.name));
    await keepOrDiscard();
    setBusy(true);
    try {
      const decoded = await decodeImage(file.bytes);
      editor.load({ raster: decoded.raster, ppi: decoded.ppi, name: baseName(file.name) });
      setOriginalImage({ bytes: file.bytes, mime: decoded.mime });
      setCropRect(null);
      setLine(null);
      setMeasure(null);
      const real = `${formatLength(decoded.raster.width / decoded.ppi, unit)} × ${formatLength(decoded.raster.height / decoded.ppi, unit)}`;
      notify(t.imported(decoded.raster.width, decoded.raster.height, decoded.ppi, real, decoded.declaredPpi === null));
    } catch (error) {
      notify((error as Error).message === "too-large" ? t.tooLarge : t.unreadable(file.name));
    } finally {
      setBusy(false);
    }
  };

  // Menu Fichier > Importer une image (Ctrl+I).
  useEffect(() => {
    if (requests.importImage === handled.importImage) return;
    handled.importImage = requests.importImage;
    void importImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests.importImage]);

  // « Modifier » une photo du carnet : elle est posée sur le plan.
  useEffect(() => {
    const req = requests.editPhoto;
    if (!req || req.at === handled.editPhotoAt) return;
    handled.editPhotoAt = req.at;
    void (async () => {
      const photo = session.project.sketchbook.photos.find((p) => p.id === req.id);
      const bytes = photo ? session.assets.get(photo.asset) : undefined;
      if (!photo || !bytes) return notify(t.photoMissing);
      await keepOrDiscard();
      try {
        const decoded = await decodeImage(bytes);
        editor.load({ raster: decoded.raster, ppi: photo.ppi, name: photo.card.name || t.untitled }, photo.id);
        setOriginalImage({ bytes, mime: decoded.mime });
        setCropRect(null);
        notify(t.photoLoaded(photo.card.name || t.untitled));
      } catch {
        notify(t.unreadable(photo.card.name || t.untitled));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests.editPhoto]);

  const removeImage = async () => {
    if (!doc) return;
    if (!(await dialogs.confirm(t.removeQuestion, { detail: t.removeDetail, okLabel: t.remove }))) return;
    editor.load(null);
    setOriginalImage(null);
    setCropRect(null);
  };

  /** Octets à enregistrer : le fichier d'origine s'il n'a pas été retouché, sinon un PNG (avec sa résolution). */
  const bytesToStore = (d: ImageDoc): { bytes: Uint8Array; mime: string } => {
    if (!editor.modified && originalImage) return originalImage;
    return { bytes: encodePng(d.raster, d.ppi), mime: "image/png" };
  };

  const addAsFabric = () => {
    if (!doc) return;
    const { bytes, mime } = bytesToStore(doc);
    const hash = sha256Hex(bytes);
    const fabric: FabricItem = makeImageFabric(hash, Math.round(doc.ppi * 1e6) / 1e6, doc.name, averageColor(doc.raster).hex);
    if (addToSketchbook(session.project, "fabrics", fabric).status === "duplicate") return notify(fr.sketchbook.alreadyThere(fr.itemSingular.fabrics));
    session.executeWithAsset(t.addFabricHistory, bytes, mime, () => (p) => addToSketchbook(p, "fabrics", fabric).project);
    editor.markSaved();
    notify(t.fabricAdded(doc.name));
    void onAdded();
  };

  function savePhoto() {
    const d = imageEditor.doc;
    if (!d) return;
    const { bytes, mime } = bytesToStore(d);
    const photo: PhotoItem = makePhoto(sha256Hex(bytes), Math.round(d.ppi * 1e6) / 1e6, d.name);
    if (addToSketchbook(session.project, "photos", photo).status === "duplicate") return notify(fr.sketchbook.alreadyThere(fr.itemSingular.photos));
    session.executeWithAsset(t.addPhotoHistory, bytes, mime, () => (p) => addToSketchbook(p, "photos", photo).project);
    imageEditor.markSaved();
    notify(t.photoAdded(d.name));
    void onAdded();
  }

  // ---- Retouches -----------------------------------------------------------------------------------------------

  const bg = hexToRgb(background);
  const real = doc ? { w: doc.raster.width / doc.ppi, h: doc.raster.height / doc.ppi } : null;

  const applyScale = () => {
    const inches = toInches(scaleWidth, unit);
    if (!(inches > 0)) return notify(t.scale.invalid);
    run(t.scale.history, (d) => ({ ...d, ppi: ppiForWidth(d.raster.width, inches) }));
  };

  const measured = measure ? Math.hypot(measure.b.x - measure.a.x, measure.b.y - measure.a.y) : 0;
  const applyMeasure = () => {
    const inches = toInches(measureLength, unit);
    if (!measure || measured < 1) return notify(t.measure.needLine);
    if (!(inches > 0)) return notify(t.scale.invalid);
    run(t.scale.history, (d) => ({ ...d, ppi: ppiForMeasure(measured, inches) }));
  };

  const applyCrop = () => {
    if (!doc || !cropRect) return;
    const r = clampRect(doc.raster, cropRect);
    if (!r) return;
    if (r.x === 0 && r.y === 0 && r.width === doc.raster.width && r.height === doc.raster.height) return notify(t.crop.nothing);
    if (run(t.crop.history, (d) => ({ ...d, raster: crop(d.raster, r) }))) setCropRect(null);
    setTool("pan");
  };

  const applyStraighten = () => {
    if (!line) return notify(t.straighten.needLine);
    const a = straightenAngle(line.a, line.b);
    if (Math.abs(a) < 1e-9) return notify(t.straighten.already);
    if (run(t.straighten.history, (d) => ({ ...d, raster: rotate(d.raster, a, bg, false) }))) {
      setLine(null);
      notify(t.straighten.done(Math.round(a * 100) / 100));
    }
  };

  const resizeTarget = (): { w: number; h: number; ppi: number } | null => {
    if (!doc) return null;
    const res = resizeUnit === "cm" ? size.res * 2.54 : size.res; // la résolution saisie en pixels par cm devient des ppp
    if (!(res > 0)) return null;
    if (resizeUnit === "px") return { w: Math.round(size.w), h: Math.round(size.h), ppi: res };
    return { w: Math.round(toInches(size.w, resizeUnit) * res), h: Math.round(toInches(size.h, resizeUnit) * res), ppi: res };
  };

  const applyResize = () => {
    const target = resizeTarget();
    if (!target || target.w < 1 || target.h < 1 || target.w * target.h > 50_000_000) return notify(t.resize.invalid);
    run(t.resize.history, (d) => ({ ...d, ppi: target.ppi, raster: target.w === d.raster.width && target.h === d.raster.height ? d.raster : resize(d.raster, target.w, target.h, method) }));
  };

  /** Les champs du redimensionnement dans l'unité choisie. */
  const showSize = (u: "px" | DisplayUnit) => {
    if (!doc) return;
    setResizeUnit(u);
    if (u === "px") setSize({ w: doc.raster.width, h: doc.raster.height, res: doc.ppi });
    else setSize({ w: fromInches(doc.raster.width / doc.ppi, u), h: fromInches(doc.raster.height / doc.ppi, u), res: u === "cm" ? doc.ppi / 2.54 : doc.ppi });
  };

  const setResizeDim = (key: "w" | "h", v: number): boolean => {
    if (!doc || !(v > 0)) return false;
    const ratio = doc.raster.height / doc.raster.width;
    setSize((s) => (keepRatio ? (key === "w" ? { ...s, w: v, h: v * ratio } : { ...s, h: v, w: v / ratio }) : { ...s, [key]: v }));
    return true;
  };

  const applyPreset = (id: string) => {
    const preset = CROP_PRESETS.find((p) => p.id === id);
    if (!doc || !preset) return;
    const rect = presetRect(preset, doc.ppi, doc.raster.width, doc.raster.height);
    if (!rect) return notify(t.crop.tooBig(preset.label));
    setTool("crop");
    setCropRect(rect);
  };

  // ---- Raccourcis : Échap abandonne le tracé en cours ------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.target instanceof HTMLInputElement) return;
      setLine(null);
      setMeasure(null);
      if (tool === "crop") setCropRect(doc ? { x: 0, y: 0, width: doc.raster.width, height: doc.raster.height } : null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, doc]);

  const cropInUnit = (v: number) => (doc ? fromInches(v / doc.ppi, unit) : 0);
  const cropFromUnit = (v: number) => (doc ? toInches(v, unit) * doc.ppi : 0);
  const unitLabel = unit === "in" ? t.units.in : t.units.cm;

  const palette = (
    <aside className="palette palette--image" aria-label={fr.palette.title}>
      <h2 className="palette-title">{fr.ribbon.image[0]}</h2>
      <div className="palette-group">
        <div className="button-grid">
          <button type="button" className="btn btn--small" data-testid="image-import" disabled={busy} onClick={() => void importImage()}>
            {t.import}
          </button>
          <button type="button" className="btn btn--small" data-testid="image-remove" disabled={!doc} onClick={() => void removeImage()}>
            {t.remove}
          </button>
        </div>
        {doc && real ? (
          <p className="palette-hint" data-testid="image-info">
            {t.info(doc.raster.width, doc.raster.height, Math.round(doc.ppi * 100) / 100, `${formatLength(real.w, unit)} × ${formatLength(real.h, unit)}`)}
          </p>
        ) : (
          <p className="palette-hint">{t.empty}</p>
        )}
      </div>

      {doc && (
        <>
          <div className="palette-group">
            <h3>{t.addTitle}</h3>
            <div className="button-grid">
              <button type="button" className="btn btn--small btn--primary" data-testid="image-add-fabric" onClick={addAsFabric}>
                {t.addFabric}
              </button>
              <button type="button" className="btn btn--small" data-testid="image-add-photo" onClick={savePhoto}>
                {t.saveToPhotos}
              </button>
            </div>
          </div>

          <div className="palette-group" role="group" aria-label={t.toolsTitle}>
            <h3>{t.toolsTitle}</h3>
            <div className="tool-grid">
              {TOOLS.map((id) => (
                <button key={id} type="button" className="tool-button" data-testid={`itool-${id}`} aria-pressed={tool === id} onClick={() => chooseTool(id)}>
                  {t.tools[id]}
                </button>
              ))}
            </div>
            <p className="palette-hint">{t.toolHelp[tool]}</p>
          </div>

          <div className="palette-group">
            <h3>{t.scale.title}</h3>
            <p className="palette-hint">{t.scale.help}</p>
            <div className="field-row">
              <NumberField label={`${t.scale.width} (${unitLabel})`} value={scaleWidth} step={unit === "in" ? 0.25 : 0.5} testId="image-scale-width" onCommit={(v) => (v > 0 ? (setScaleWidth(v), true) : false)} />
              <button type="button" className="btn btn--small" data-testid="image-scale-apply" onClick={applyScale}>
                {t.scale.apply}
              </button>
            </div>
            <p className="palette-hint">{t.measure.help}</p>
            <div className="field-row">
              <NumberField label={`${t.measure.length} (${unitLabel})`} value={measureLength} step={unit === "in" ? 0.25 : 0.5} testId="image-measure-length" onCommit={(v) => (v > 0 ? (setMeasureLength(v), true) : false)} />
              <button type="button" className="btn btn--small" data-testid="image-measure-apply" disabled={!measure} onClick={applyMeasure}>
                {t.scale.apply}
              </button>
            </div>
            {measure && <p className="palette-hint" data-testid="image-measured">{t.measure.measured(Math.round(measured))}</p>}
          </div>

          {tool === "crop" && cropRect && (
            <div className="palette-group" data-testid="crop-panel">
              <h3>{t.crop.title}</h3>
              <div className="field-grid">
                <NumberField label={`X (${unitLabel})`} value={cropInUnit(cropRect.x)} testId="crop-x" onCommit={(v) => (setCropRect(roundRect({ ...cropRect, x: cropFromUnit(v) })), true)} />
                <NumberField label={`Y (${unitLabel})`} value={cropInUnit(cropRect.y)} testId="crop-y" onCommit={(v) => (setCropRect(roundRect({ ...cropRect, y: cropFromUnit(v) })), true)} />
                <NumberField label={`${t.crop.width} (${unitLabel})`} value={cropInUnit(cropRect.width)} testId="crop-w" onCommit={(v) => (v > 0 ? (setCropRect(roundRect({ ...cropRect, width: cropFromUnit(v) })), true) : false)} />
                <NumberField label={`${t.crop.height} (${unitLabel})`} value={cropInUnit(cropRect.height)} testId="crop-h" onCommit={(v) => (v > 0 ? (setCropRect(roundRect({ ...cropRect, height: cropFromUnit(v) })), true) : false)} />
              </div>
              <label className="field">
                <span className="field-label">{t.crop.presets}</span>
                <select className="field-input" value="" data-testid="crop-preset" onChange={(e) => e.target.value && applyPreset(e.target.value)}>
                  <option value="">{t.crop.choosePreset}</option>
                  {CROP_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="palette-hint" data-testid="crop-size">
                {t.crop.pixels(cropRect.width, cropRect.height)}
              </p>
              <div className="button-grid">
                <button type="button" className="btn btn--small btn--primary" data-testid="crop-apply" title={t.crop.apply} onClick={applyCrop}>
                  ✓ {t.crop.apply}
                </button>
                <button
                  type="button"
                  className="btn btn--small"
                  data-testid="crop-reset"
                  title={t.crop.reset}
                  onClick={() => setCropRect({ x: 0, y: 0, width: doc.raster.width, height: doc.raster.height })}
                >
                  ↺ {t.crop.reset}
                </button>
              </div>
            </div>
          )}

          <div className="palette-group">
            <h3>{t.straighten.title}</h3>
            <p className="palette-hint">{t.straighten.help}</p>
            <button type="button" className="btn btn--small" data-testid="straighten-apply" disabled={!line} onClick={applyStraighten}>
              {t.straighten.apply}
            </button>
          </div>

          <div className="palette-group">
            <h3>{t.rotate.title}</h3>
            <div className="button-grid">
              <button type="button" className="btn btn--small" data-testid="rotate-ccw" onClick={() => run(t.rotate.history, (d) => ({ ...d, raster: rotate(d.raster, 90, bg, false) }))}>
                {t.rotate.ccw}
              </button>
              <button type="button" className="btn btn--small" data-testid="rotate-cw" onClick={() => run(t.rotate.history, (d) => ({ ...d, raster: rotate(d.raster, -90, bg, false) }))}>
                {t.rotate.cw}
              </button>
              <button type="button" className="btn btn--small" data-testid="flip-h" onClick={() => run(t.flip.history, (d) => ({ ...d, raster: flip(d.raster, "horizontal") }))}>
                {t.flip.horizontal}
              </button>
              <button type="button" className="btn btn--small" data-testid="flip-v" onClick={() => run(t.flip.history, (d) => ({ ...d, raster: flip(d.raster, "vertical") }))}>
                {t.flip.vertical}
              </button>
            </div>
            <div className="field-row">
              <NumberField label={t.rotate.angle} value={angle} testId="rotate-angle" onCommit={(v) => (Math.abs(v) <= 360 ? (setAngle(v), true) : false)} />
              <button type="button" className="btn btn--small" data-testid="rotate-apply" onClick={() => run(t.rotate.history, (d) => ({ ...d, raster: rotate(d.raster, angle, bg, cropAfter) }))}>
                {t.apply}
              </button>
            </div>
            <Check label={t.rotate.cropAfter} checked={cropAfter} onChange={setCropAfter} testId="rotate-crop-after" />
            <label className="field field--inline">
              <span className="field-label">{t.background}</span>
              <input type="color" value={background} data-testid="image-background" onChange={(e) => setBackground(parseHex(e.target.value) ?? "#ffffff")} />
            </label>
          </div>

          <div className="palette-group">
            <h3>{t.shear.title}</h3>
            <div className="field-row">
              <NumberField label={t.shear.horizontal} value={shearH} testId="shear-h" onCommit={(v) => (Math.abs(v) <= 45 ? (setShearH(v), true) : false)} />
              <NumberField label={t.shear.vertical} value={shearV} testId="shear-v" onCommit={(v) => (Math.abs(v) <= 45 ? (setShearV(v), true) : false)} />
            </div>
            <button
              type="button"
              className="btn btn--small"
              data-testid="shear-apply"
              disabled={shearH === 0 && shearV === 0}
              onClick={() => run(t.shear.history, (d) => ({ ...d, raster: shear(d.raster, shearH, shearV, bg) }))}
            >
              {t.apply}
            </button>
          </div>

          <div className="palette-group">
            <h3>{t.resize.title}</h3>
            <label className="field">
              <span className="field-label">{t.resize.units}</span>
              <select className="field-input" value={resizeUnit} data-testid="resize-unit" onChange={(e) => showSize(e.target.value as "px" | DisplayUnit)}>
                <option value="px">{t.units.px}</option>
                <option value="in">{t.units.in}</option>
                <option value="cm">{t.units.cm}</option>
              </select>
            </label>
            <div className="field-row">
              <NumberField label={t.resize.width} value={size.w} decimals={resizeUnit === "px" ? 0 : 3} testId="resize-w" onCommit={(v) => setResizeDim("w", v)} />
              <NumberField label={t.resize.height} value={size.h} decimals={resizeUnit === "px" ? 0 : 3} testId="resize-h" onCommit={(v) => setResizeDim("h", v)} />
            </div>
            <Check label={t.resize.keepRatio} checked={keepRatio} onChange={setKeepRatio} testId="resize-keep" />
            <NumberField
              label={resizeUnit === "cm" ? t.resize.resolutionCm : t.resize.resolution}
              value={size.res}
              testId="resize-res"
              onCommit={(v) => (v > 0 ? (setSize((s) => ({ ...s, res: v })), true) : false)}
            />
            <label className="field">
              <span className="field-label">{t.resize.method}</span>
              <select className="field-input" value={method} data-testid="resize-method" onChange={(e) => setMethod(e.target.value as Resample)}>
                <option value="normal">{t.resize.methods.normal}</option>
                <option value="bilinear">{t.resize.methods.bilinear}</option>
                <option value="bicubic">{t.resize.methods.bicubic}</option>
              </select>
            </label>
            <button type="button" className="btn btn--small" data-testid="resize-apply" onClick={applyResize}>
              {t.apply}
            </button>
          </div>
        </>
      )}
    </aside>
  );

  return (
    <>
      {palette}
      <main className="worktable worktable--image-edit" data-testid="worktable">
        <ImageStage
          doc={doc}
          tool={tool}
          unit={unit}
          crop={tool === "crop" ? cropRect : null}
          onCrop={setCropRect}
          line={line}
          onLine={setLine}
          measure={measure}
          onMeasure={setMeasure}
        />
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Zone de dessin : l'image, ses règles (pouces ou cm, à l'échelle réelle), le cadre de recadrage et les tracés

interface StageProps {
  doc: ImageDoc | null;
  tool: ImageTool;
  unit: DisplayUnit;
  crop: PixelRect | null;
  onCrop: (rect: PixelRect) => void;
  line: { a: Pt; b: Pt } | null;
  onLine: (line: { a: Pt; b: Pt } | null) => void;
  measure: { a: Pt; b: Pt } | null;
  onMeasure: (line: { a: Pt; b: Pt } | null) => void;
}

type StageDrag =
  | { kind: "pan"; x: number; y: number }
  | { kind: "crop"; handle: Handle; start: PixelRect; from: Pt }
  | { kind: "line"; target: "line" | "measure"; a: Pt };

function readColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return { surface: v("--surface-2", "#ebe8e2"), text: v("--text", "#24262b"), muted: v("--text-muted", "#6a6f78"), accent: v("--accent-image", v("--accent-block", "#e0a526")), panel: v("--surface", "#f4f2ee") };
}

function ImageStage({ doc, tool, unit, crop: cropRect, onCrop, line, onLine, measure, onMeasure }: StageProps) {
  const t = fr.image;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ zoom: 1, originX: RULER + 16, originY: RULER + 16 });
  const [tick, setTick] = useState(0);
  const drag = useRef<StageDrag | null>(null);
  const fitted = useRef(true);
  const lastDoc = useRef<ImageDoc | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measureBox = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measureBox();
    const observer = new ResizeObserver(measureBox);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Nouvelle image, ou image de taille différente : on l'ajuste à la fenêtre.
  useLayoutEffect(() => {
    const prev = lastDoc.current;
    lastDoc.current = doc;
    const sameSize = prev && doc && prev.raster.width === doc.raster.width && prev.raster.height === doc.raster.height;
    if (!sameSize) fitted.current = true;
    if (fitted.current) setView(fitView(box.width, box.height, doc));
  }, [doc, box]);

  const fit = useCallback(() => {
    fitted.current = true;
    setView(fitView(box.width, box.height, doc));
  }, [box, doc]);

  const zoomAt = useCallback((zoom: number, x: number, y: number) => {
    fitted.current = false;
    setView((v) => {
      const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
      return { zoom: z, originX: x - ((x - v.originX) * z) / v.zoom, originY: y - ((y - v.originY) * z) / v.zoom };
    });
  }, []);

  const actualSize = () => zoomAt(1, box.width / 2, box.height / 2);

  // Peinture.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || box.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = readColors();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = c.surface;
    ctx.fillRect(0, 0, box.width, box.height);
    if (!doc) return;
    const { zoom, originX, originY } = view;
    const w = doc.raster.width * zoom;
    const h = doc.raster.height * zoom;
    ctx.imageSmoothingEnabled = zoom < 1;
    ctx.drawImage(rasterCanvas(doc.raster), originX, originY, w, h);
    ctx.strokeStyle = c.muted;
    ctx.lineWidth = 1;
    ctx.strokeRect(originX - 0.5, originY - 0.5, w + 1, h + 1);

    // Recadrage : la partie coupée est voilée (elle apparaît « transparente »), le cadre en pointillés avec ses poignées.
    if (cropRect) {
      const x = originX + cropRect.x * zoom;
      const y = originY + cropRect.y * zoom;
      const cw = cropRect.width * zoom;
      const ch = cropRect.height * zoom;
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.62)";
      ctx.beginPath();
      ctx.rect(originX, originY, w, h);
      ctx.rect(x, y, cw, ch);
      ctx.fill("evenodd");
      ctx.strokeStyle = c.text;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, cw, ch);
      ctx.setLineDash([]);
      ctx.fillStyle = c.accent;
      for (const [hx, hy] of [
        [x, y],
        [x + cw / 2, y],
        [x + cw, y],
        [x + cw, y + ch / 2],
        [x + cw, y + ch],
        [x + cw / 2, y + ch],
        [x, y + ch],
        [x, y + ch / 2],
      ] as const) {
        ctx.fillRect(hx - 4, hy - 4, 8, 8);
        ctx.strokeRect(hx - 4, hy - 4, 8, 8);
      }
      ctx.restore();
    }

    // Tracés : ligne de redressement, segment de mesure.
    for (const [seg, dashed] of [
      [line, false],
      [measure, true],
    ] as const) {
      if (!seg) continue;
      ctx.save();
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 2;
      if (dashed) ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(originX + seg.a.x * zoom, originY + seg.a.y * zoom);
      ctx.lineTo(originX + seg.b.x * zoom, originY + seg.b.y * zoom);
      ctx.stroke();
      ctx.fillStyle = c.accent;
      for (const p of [seg.a, seg.b]) {
        ctx.beginPath();
        ctx.arc(originX + p.x * zoom, originY + p.y * zoom, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Règles : graduées dans l'unité d'affichage, à l'échelle réelle de l'image (pixels ÷ ppp).
    ctx.fillStyle = c.panel;
    ctx.fillRect(0, 0, box.width, RULER);
    ctx.fillRect(0, 0, RULER, box.height);
    const pxPerUnit = (unit === "in" ? doc.ppi : doc.ppi / 2.54) * zoom;
    const minor = unit === "in" ? (pxPerUnit >= 64 ? 8 : pxPerUnit >= 24 ? 4 : 1) : pxPerUnit >= 30 ? 10 : pxPerUnit >= 12 ? 2 : 1;
    const labelEvery = Math.max(1, Math.ceil(28 / pxPerUnit));
    ctx.strokeStyle = c.muted;
    ctx.fillStyle = c.text;
    ctx.font = "10px system-ui, sans-serif";
    ctx.beginPath();
    const maxUnits = Math.ceil(Math.max(box.width, box.height) / Math.max(pxPerUnit, 1e-6)) + 2;
    for (let k = -Math.ceil(originX / pxPerUnit) * minor - minor; k <= maxUnits * minor; k++) {
      const x = originX + (k / minor) * pxPerUnit;
      if (x < RULER || x > box.width) continue;
      const major = k % minor === 0;
      ctx.moveTo(Math.round(x) + 0.5, RULER);
      ctx.lineTo(Math.round(x) + 0.5, RULER - (major ? 10 : 5));
      if (major && (k / minor) % labelEvery === 0) ctx.fillText(String(k / minor), x + 2, 10);
    }
    for (let k = -Math.ceil(originY / pxPerUnit) * minor - minor; k <= maxUnits * minor; k++) {
      const y = originY + (k / minor) * pxPerUnit;
      if (y < RULER || y > box.height) continue;
      const major = k % minor === 0;
      ctx.moveTo(RULER, Math.round(y) + 0.5);
      ctx.lineTo(RULER - (major ? 10 : 5), Math.round(y) + 0.5);
      if (major && (k / minor) % labelEvery === 0) ctx.fillText(String(k / minor), 2, y - 2);
    }
    ctx.stroke();
    ctx.fillStyle = c.muted;
    ctx.fillText(unit === "in" ? "po" : "cm", 3, 12);
  });
  void tick;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey) {
        setView((v) => {
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * Math.pow(1.2, -e.deltaY / 100)));
          return { zoom: z, originX: x - ((x - v.originX) * z) / v.zoom, originY: y - ((y - v.originY) * z) / v.zoom };
        });
      } else setView((v) => ({ ...v, originX: v.originX - e.deltaX, originY: v.originY - e.deltaY }));
      fitted.current = false;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const toImage = (e: { clientX: number; clientY: number }): Pt => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = (e.clientX - (rect?.left ?? 0) - view.originX) / view.zoom;
    const y = (e.clientY - (rect?.top ?? 0) - view.originY) / view.zoom;
    return doc ? { x: Math.min(doc.raster.width, Math.max(0, x)), y: Math.min(doc.raster.height, Math.max(0, y)) } : { x, y };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!doc) return;
    const p = toImage(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || tool === "pan") {
      drag.current = { kind: "pan", x: e.clientX, y: e.clientY };
      return;
    }
    if (tool === "crop" && cropRect) {
      const handle = handleAt(cropRect, p, HANDLE_PX / view.zoom);
      if (handle) drag.current = { kind: "crop", handle, start: cropRect, from: p };
      else {
        drag.current = { kind: "crop", handle: "se", start: { x: p.x, y: p.y, width: 1, height: 1 }, from: p };
        onCrop(roundRect({ x: p.x, y: p.y, width: 1, height: 1 }));
      }
      return;
    }
    if (tool === "straighten" || tool === "measure") {
      // Les extrémités tombent sur des pixels entiers de l'image (une mesure se lit en pixels).
      const a = { x: Math.round(p.x), y: Math.round(p.y) };
      drag.current = { kind: "line", target: tool === "straighten" ? "line" : "measure", a };
      (tool === "straighten" ? onLine : onMeasure)({ a, b: a });
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = drag.current;
    if (!g || !doc) return;
    if (g.kind === "pan") {
      fitted.current = false;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      g.x = e.clientX;
      g.y = e.clientY;
      setView((v) => ({ ...v, originX: v.originX + dx, originY: v.originY + dy }));
      return;
    }
    const p = toImage(e);
    if (g.kind === "crop") onCrop(roundRect(moveHandle(g.start, g.handle, p.x - g.from.x, p.y - g.from.y, doc.raster.width, doc.raster.height)));
    else (g.target === "line" ? onLine : onMeasure)({ a: g.a, b: { x: Math.round(p.x), y: Math.round(p.y) } });
    setTick((n) => n + 1);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (g?.kind === "line") {
      const p = toImage(e);
      if (Math.hypot(p.x - g.a.x, p.y - g.a.y) < 1) (g.target === "line" ? onLine : onMeasure)(null);
    }
  };

  const cursor = !doc ? "default" : tool === "pan" ? "grab" : "crosshair";

  return (
    <div className="image-stage" ref={wrapRef} data-testid="image-stage">
      <canvas
        ref={canvasRef}
        className="image-canvas"
        data-testid="image-canvas"
        data-zoom={view.zoom}
        data-origin-x={view.originX}
        data-origin-y={view.originY}
        data-width={doc?.raster.width ?? 0}
        data-height={doc?.raster.height ?? 0}
        data-ppi={doc?.ppi ?? 0}
        style={{ width: box.width, height: box.height, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={t.canvasLabel}
      />
      {!doc && (
        <div className="image-empty" data-testid="image-empty">
          <p>{t.emptyStage}</p>
        </div>
      )}
      {doc && (
        <div className="block-zoom" role="group" aria-label={fr.draw.zoom}>
          <button type="button" className="btn btn--small" data-testid="image-zoom-out" title={fr.draw.zoomOut} onClick={() => zoomAt(view.zoom / 1.25, box.width / 2, box.height / 2)}>
            −
          </button>
          <button type="button" className="btn btn--small" data-testid="image-actual" title={t.actualSize} onClick={actualSize}>
            {Math.round(view.zoom * 100)} %
          </button>
          <button type="button" className="btn btn--small" data-testid="image-zoom-in" title={fr.draw.zoomIn} onClick={() => zoomAt(view.zoom * 1.25, box.width / 2, box.height / 2)}>
            +
          </button>
          <button type="button" className="btn btn--small" data-testid="image-fit" title={t.fit} onClick={fit}>
            {t.fitShort}
          </button>
        </div>
      )}
    </div>
  );
}
