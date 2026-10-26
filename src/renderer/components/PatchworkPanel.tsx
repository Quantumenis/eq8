// Photo Patchwork (SPEC §2.11), dans l'onglet DESIGN d'une disposition One Patch : choisir une photo du carnet, la poser
// (Inside, Outside ou Distort Fit), la masquer au besoin, voir le quilt (la couleur moyenne de chaque pièce) puis
// l'appliquer au calque 1. L'aperçu remonte au plan Quilt par `onPreview` ; rien n'est enregistré avant « Appliquer ».

import { useEffect, useMemo, useState } from "react";
import type { Raster } from "../../core/image/raster";
import type { PhotoItem, Project } from "../../core/project/model";
import { PHOTO_FITS, fitPlacement, keepProportions, photoPatchColors, photoPatchFills, type PhotoFit, type PhotoRect } from "../../core/quilt/photopatch";
import type { Paint } from "../../core/project/model";
import type { AssetStore } from "../../core/project/assets";
import type { Scene } from "../../core/quilt/scene";
import { fromInches, toInches, type DisplayUnit } from "../../core/units";
import { fr } from "../i18n/fr";
import { decodeImage } from "../imageEditor";
import { Check, NumberField } from "./fields";

export interface PatchworkPreview {
  ghost: { photoId: string; rect: PhotoRect } | null;
  fills: Record<string, Paint> | null;
}

interface Props {
  project: Project;
  assets: AssetStore;
  scene: Scene;
  unit: DisplayUnit;
  notify: (message: string) => void;
  onPreview: (p: PatchworkPreview | null) => void;
  onApply: (fills: Record<string, Paint>) => void;
}

export function PatchworkPanel({ project, assets, scene, unit, notify, onPreview, onApply }: Props) {
  const t = fr.m9.patchwork;
  const photos = project.sketchbook.photos;
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [fit, setFit] = useState<PhotoFit>("inside");
  const [rect, setRect] = useState<PhotoRect | null>(null);
  const [mask, setMask] = useState<PhotoRect | null>(null);
  const [ratio, setRatio] = useState(true);
  const [showQuilt, setShowQuilt] = useState(false);
  const [raster, setRaster] = useState<Raster | null>(null);
  const photo: PhotoItem | undefined = photos.find((p) => p.id === photoId);

  useEffect(() => {
    let alive = true;
    setRaster(null);
    const bytes = photo ? assets.get(photo.asset) : undefined;
    if (bytes) void decodeImage(bytes).then((d) => alive && setRaster(d.raster)).catch(() => alive && notify(fr.shape.trace.failed));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId]);

  const place = (f: PhotoFit) => {
    if (!raster) return;
    setFit(f);
    setRect(fitPlacement(f, raster.width, raster.height, scene.width, scene.height));
    setMask(null);
  };
  useEffect(() => {
    if (raster && !rect) place(fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raster]);

  const pieces = useMemo(() => scene.slots.filter((s) => s.slot.role === "piece").map((s) => ({ key: s.slot.key, poly: s.slot.poly })), [scene]);
  const colors = useMemo(() => (raster && rect && showQuilt ? photoPatchColors(raster, rect, pieces, mask) : null), [raster, rect, mask, pieces, showQuilt]);

  useEffect(() => {
    if (!photoId || !rect) return onPreview(null);
    onPreview({ ghost: showQuilt ? null : { photoId, rect }, fills: colors ? photoPatchFills(colors) : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId, rect, colors, showQuilt]);
  useEffect(() => () => onPreview(null), []);

  const inUnit = (v: number) => Math.round(fromInches(v, unit) * 100) / 100;
  const edit = (patch: Partial<PhotoRect>) => rect && setRect((r) => (r ? { ...r, ...patch } : r));
  const maskNow: PhotoRect = mask ?? { x0: 0, y0: 0, x1: scene.width, y1: scene.height };

  return (
    <div className="palette-group" data-testid="patchwork-panel">
      <h3>{t.title}</h3>
      <p className="palette-hint">{t.help}</p>
      {photos.length === 0 ? (
        <p className="palette-hint">{t.none}</p>
      ) : (
        <label className="field">
          <span className="field-label">{t.choose}</span>
          <select value={photoId ?? ""} data-testid="patch-photo" onChange={(e) => setPhotoId(e.target.value || null)}>
            <option value="">—</option>
            {photos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.card.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {photo && (
        <>
          <span className="palette-subtitle">{t.fit}</span>
          <div className="button-grid">
            {PHOTO_FITS.map((f) => (
              <button key={f} type="button" className="tool-button tool-button--small" data-testid={`patch-fit-${f}`} aria-pressed={fit === f} onClick={() => place(f)}>
                {t.fits[f]}
              </button>
            ))}
          </div>
          {rect && (
            <>
              <div className="field-row">
                <NumberField label="X" value={inUnit(rect.x0)} testId="patch-x0" onCommit={(n) => (edit({ x0: toInches(n, unit) }), true)} />
                <NumberField label="Y" value={inUnit(rect.y0)} testId="patch-y0" onCommit={(n) => (edit({ y0: toInches(n, unit) }), true)} />
              </div>
              <div className="field-row">
                <NumberField
                  label={fr.shape.selection.width}
                  value={inUnit(rect.x1 - rect.x0)}
                  testId="patch-w"
                  onCommit={(n) => {
                    if (!(n > 0) || !raster) return false;
                    const next = { ...rect, x1: rect.x0 + toInches(n, unit) };
                    setRect(ratio ? keepProportions(next, raster.width / raster.height) : next);
                    return true;
                  }}
                />
                <NumberField label={fr.shape.selection.height} value={inUnit(rect.y1 - rect.y0)} testId="patch-h" onCommit={(n) => (n > 0 ? (edit({ y1: rect.y0 + toInches(n, unit) }), true) : false)} />
              </div>
              <Check label={t.keepRatio} checked={ratio} testId="patch-ratio" onChange={setRatio} />
              <span className="palette-subtitle">{t.mask}</span>
              <div className="field-row">
                <NumberField label={t.maskX0} value={inUnit(maskNow.x0)} testId="mask-x0" onCommit={(n) => (setMask({ ...maskNow, x0: toInches(n, unit) }), true)} />
                <NumberField label={t.maskX1} value={inUnit(maskNow.x1)} testId="mask-x1" onCommit={(n) => (setMask({ ...maskNow, x1: toInches(n, unit) }), true)} />
              </div>
              <div className="field-row">
                <NumberField label={t.maskY0} value={inUnit(maskNow.y0)} testId="mask-y0" onCommit={(n) => (setMask({ ...maskNow, y0: toInches(n, unit) }), true)} />
                <NumberField label={t.maskY1} value={inUnit(maskNow.y1)} testId="mask-y1" onCommit={(n) => (setMask({ ...maskNow, y1: toInches(n, unit) }), true)} />
              </div>
              <div className="button-grid">
                <button type="button" className="btn btn--small" data-testid="patch-automask" onClick={() => setMask({ x0: 0, y0: 0, x1: scene.width, y1: scene.height })}>
                  {t.autoMask}
                </button>
                <button type="button" className="btn btn--small" data-testid="patch-reset-mask" onClick={() => setMask(null)}>
                  {t.resetMask}
                </button>
              </div>
              <div className="button-grid">
                <button type="button" className="tool-button tool-button--small" data-testid="patch-show-photo" aria-pressed={!showQuilt} onClick={() => setShowQuilt(false)}>
                  {t.show}
                </button>
                <button type="button" className="tool-button tool-button--small" data-testid="patch-show-quilt" aria-pressed={showQuilt} onClick={() => setShowQuilt(true)}>
                  {t.quilt}
                </button>
              </div>
              <button
                type="button"
                className="btn btn--primary btn--small"
                data-testid="patch-apply"
                onClick={() => {
                  if (!raster || !rect) return;
                  const fills = photoPatchFills(photoPatchColors(raster, rect, pieces, mask));
                  onApply(fills);
                  notify(t.applied(Object.keys(fills).length));
                }}
              >
                {t.apply}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
