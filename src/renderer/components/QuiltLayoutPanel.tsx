// Onglets NOUVEAU QUILT et DISPOSITION du plan Quilt : choix du style, nombres de blocs et tailles finies.

import { useState } from "react";
import { fromInches, toInches, formatLength, type DisplayUnit } from "../../core/units";
import { LAYOUT_KINDS, buildLayout, type LayoutKind, type LayoutParams, type OnePatchLayout, SIZE_STEP } from "../../core/quilt/layout";
import { ONE_PATCH_SHAPES, SIDE_SHAPES } from "../../core/quilt/onepatch";
import { PLAIN_STRIP, STRIP_STYLES, stripFormulaLength, type Strip, type StripStyle } from "../../core/quilt/strips";
import { fr } from "../i18n/fr";
import { Check, NumberField } from "./fields";

interface Props {
  layout: LayoutParams;
  unit: DisplayUnit;
  maxBlocks: number;
  /** Applique de nouveaux paramètres (une étape d'historique ; `key` fusionne les réglages successifs d'un même champ). */
  onChange: (next: LayoutParams, key?: string) => void;
  /** Change de disposition (nouveau quilt vide). */
  onKind: (kind: LayoutKind) => void;
  /** Custom Set : redimensionne le centre, avec ou sans conservation de la taille des éléments. */
  onResizeCustom: (w: number, h: number, keepSizes: boolean) => void;
}

export function KindChooser({ current, onKind }: { current: LayoutKind; onKind: (kind: LayoutKind) => void }) {
  return (
    <div className="palette-group" data-testid="kind-chooser">
      <h3>{fr.quilt.newTitle}</h3>
      <p className="palette-hint">{fr.quilt.newHelp}</p>
      <div className="kind-grid">
        {LAYOUT_KINDS.map((kind) => (
          <button key={kind} type="button" className="tool-button kind-button" data-testid={`layout-kind-${kind}`} aria-pressed={current === kind} title={fr.quilt.kindHelp[kind]} onClick={() => onKind(kind)}>
            {fr.quilt.kinds[kind]}
          </button>
        ))}
      </div>
      <p className="palette-hint">{fr.quilt.soonKinds}</p>
    </div>
  );
}

/** Une taille : saisie dans la case et curseur ; un clic à côté du curseur saute d'un pas de 0,25 po (0,5 cm). */
function SizeField({ label, value, unit, min, max, onCommit, testId }: { label: string; value: number; unit: DisplayUnit; min: number; max: number; onCommit: (inches: number) => void; testId: string }) {
  const shown = Math.round(fromInches(value, unit) * 1e4) / 1e4;
  const step = unit === "in" ? SIZE_STEP : 0.5;
  const lo = fromInches(min, unit);
  const hi = fromInches(max, unit);
  return (
    <div className="size-field">
      <NumberField
        label={label}
        value={shown}
        decimals={4}
        testId={testId}
        step={step}
        onCommit={(n) => {
          const inches = toInches(n, unit);
          if (inches < min - 1e-9 || inches > max + 1e-9) return false;
          onCommit(inches);
          return true;
        }}
      />
      <input
        type="range"
        className="size-slider"
        min={lo}
        max={Math.min(hi, Math.max(lo + step * 8, shown * 3 + step * 8))}
        step={step}
        value={Math.min(shown, hi)}
        aria-label={label}
        data-testid={`${testId}-slider`}
        onChange={(e) => onCommit(toInches(Number(e.target.value), unit))}
      />
    </div>
  );
}

function CountField({ label, value, max, onCommit, testId }: { label: string; value: number; max: number; onCommit: (n: number) => void; testId: string }) {
  return (
    <NumberField
      label={label}
      value={value}
      decimals={0}
      testId={testId}
      step={1}
      onCommit={(n) => {
        if (!Number.isInteger(n) || n < 1 || n > max) return false;
        onCommit(n);
        return true;
      }}
    />
  );
}

export function LayoutPanel({ layout, unit, maxBlocks, onChange, onKind, onResizeCustom }: Props) {
  const [equalBlock, setEqualBlock] = useState(true);
  const [equalSash, setEqualSash] = useState(true);
  const [equalCustom, setEqualCustom] = useState(false);
  const [keepSizes, setKeepSizes] = useState(false);
  const [cloneStrip, setCloneStrip] = useState(true);
  const result = buildLayout(layout);
  const set = <T extends LayoutParams>(next: T, key?: string) => onChange(next, key);

  const centre = (
    <div className="palette-group">
      <span className="palette-subtitle">{fr.quilt.centerSize}</span>
      <div className="center-size" data-testid="center-size" data-width={result.width} data-height={result.height}>
        {formatLength(result.width, unit, 3)} × {formatLength(result.height, unit, 3)}
      </div>
    </div>
  );

  let body: React.ReactNode = null;
  if (layout.kind === "horizontal") {
    const l = layout;
    body = (
      <>
        <div className="palette-group">
          <h3>{fr.quilt.numberOfBlocks}</h3>
          <CountField label={fr.quilt.horizontal} value={l.nh} max={maxBlocks} testId="count-h" onCommit={(nh) => set({ ...l, nh })} />
          <CountField label={fr.quilt.vertical} value={l.nv} max={maxBlocks} testId="count-v" onCommit={(nv) => set({ ...l, nv })} />
        </div>
        <div className="palette-group">
          <h3>{fr.quilt.blockSize}</h3>
          <Check label={fr.quilt.keepEqual} checked={equalBlock} testId="equal-block" onChange={setEqualBlock} />
          <SizeField label={fr.quilt.width} value={l.bw} unit={unit} min={0.5} max={120} testId="block-w" onCommit={(bw) => set({ ...l, bw, ...(equalBlock ? { bh: bw } : {}) }, "bw")} />
          <SizeField label={fr.quilt.height} value={l.bh} unit={unit} min={0.5} max={120} testId="block-h" onCommit={(bh) => set({ ...l, bh, ...(equalBlock ? { bw: bh } : {}) }, "bh")} />
        </div>
        <div className="palette-group">
          <h3>{fr.quilt.sashSize}</h3>
          <p className="palette-hint">{fr.quilt.sashZero}</p>
          <Check label={fr.quilt.keepEqual} checked={equalSash} testId="equal-sash" onChange={setEqualSash} />
          <SizeField label={fr.quilt.width} value={l.sw} unit={unit} min={0} max={24} testId="sash-w" onCommit={(sw) => set({ ...l, sw, ...(equalSash ? { sh: sw } : {}) }, "sw")} />
          <SizeField label={fr.quilt.height} value={l.sh} unit={unit} min={0} max={24} testId="sash-h" onCommit={(sh) => set({ ...l, sh, ...(equalSash ? { sw: sh } : {}) }, "sh")} />
          <Check label={fr.quilt.sashBorder} checked={l.sashBorder} testId="sash-border" onChange={(sashBorder) => set({ ...l, sashBorder })} />
        </div>
      </>
    );
  } else if (layout.kind === "onpoint" || layout.kind === "varpoint") {
    const l = layout;
    body = (
      <>
        <div className="palette-group">
          <h3>{fr.quilt.style}</h3>
          <div className="radio-row">
            {([1, 2] as const).map((style) => (
              <label key={style} className="check">
                <input type="radio" name="point-style" checked={l.style === style} data-testid={`point-style-${style}`} onChange={() => set({ ...l, style } as LayoutParams)} />
                <span>{style === 1 ? fr.quilt.styleCorners : fr.quilt.styleSeam}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="palette-group">
          <h3>{fr.quilt.numberOfBlocks}</h3>
          <CountField label={fr.quilt.horizontal} value={l.nh} max={maxBlocks} testId="count-h" onCommit={(nh) => set({ ...l, nh } as LayoutParams)} />
          <CountField label={fr.quilt.vertical} value={l.nv} max={maxBlocks} testId="count-v" onCommit={(nv) => set({ ...l, nv } as LayoutParams)} />
        </div>
        <div className="palette-group">
          <h3>{fr.quilt.blockSize}</h3>
          {l.kind === "onpoint" ? (
            <SizeField label={fr.quilt.blockSide} value={l.b} unit={unit} min={0.5} max={120} testId="block-b" onCommit={(b) => set({ ...l, b }, "b")} />
          ) : (
            <>
              <SizeField label={fr.quilt.pointWidth} value={l.w} unit={unit} min={0.5} max={120} testId="block-w" onCommit={(w) => set({ ...l, w }, "w")} />
              <SizeField label={fr.quilt.pointHeight} value={l.h} unit={unit} min={0.5} max={120} testId="block-h" onCommit={(h) => set({ ...l, h }, "h")} />
            </>
          )}
        </div>
        <div className="palette-group">
          <h3>{fr.quilt.sashAround}</h3>
          <p className="palette-hint">{fr.quilt.sashZero}</p>
          <SizeField label={fr.quilt.width} value={l.s} unit={unit} min={0} max={24} testId="sash-s" onCommit={(s) => set({ ...l, s } as LayoutParams, "s")} />
        </div>
      </>
    );
  } else if (layout.kind === "stripsH" || layout.kind === "stripsV") {
    const l = layout;
    const strip = l.strips[l.selected] as Strip;
    const edit = (patch: Partial<Strip>, key?: string) => set({ ...l, strips: l.strips.map((s, i) => (i === l.selected ? { ...s, ...patch } : s)) }, key);
    const add = (at: number) => {
      const made: Strip = cloneStrip ? { ...strip } : { ...PLAIN_STRIP };
      const strips = [...l.strips.slice(0, at), made, ...l.strips.slice(at)];
      set({ ...l, strips, selected: at });
    };
    const formula = stripFormulaLength(strip);
    body = (
      <>
        <div className="palette-group">
          <h3>{fr.quilt.strips.choose}</h3>
          <div className="field-row strip-nav">
            <button type="button" className="btn btn--small" data-testid="strip-prev" title={fr.quilt.strips.previous} aria-label={fr.quilt.strips.previous} disabled={l.selected === 0} onClick={() => set({ ...l, selected: l.selected - 1 })}>
              ◄
            </button>
            <span data-testid="strip-position">{fr.quilt.strips.position(l.selected + 1, l.strips.length)}</span>
            <button type="button" className="btn btn--small" data-testid="strip-next" title={fr.quilt.strips.next} aria-label={fr.quilt.strips.next} disabled={l.selected >= l.strips.length - 1} onClick={() => set({ ...l, selected: l.selected + 1 })}>
              ►
            </button>
          </div>
          <div className="button-grid">
            <button type="button" className="btn btn--small" data-testid="strip-add" onClick={() => add(l.strips.length)}>
              {fr.quilt.strips.add}
            </button>
            <button type="button" className="btn btn--small" data-testid="strip-insert" onClick={() => add(l.selected)}>
              {fr.quilt.strips.insert}
            </button>
            <button
              type="button"
              className="btn btn--small"
              data-testid="strip-remove"
              disabled={l.strips.length <= 1}
              onClick={() => set({ ...l, strips: l.strips.filter((_, i) => i !== l.selected), selected: Math.max(0, l.selected - 1) })}
            >
              {fr.quilt.strips.remove}
            </button>
          </div>
          <Check label={fr.quilt.strips.clone} checked={cloneStrip} testId="strip-clone" onChange={setCloneStrip} />
        </div>
        <div className="palette-group">
          <label className="field">
            <span className="field-label">{fr.quilt.strips.style}</span>
            <select className="field-input" value={strip.style} data-testid="strip-style" onChange={(e) => edit({ style: e.target.value as StripStyle })}>
              {STRIP_STYLES.map((s) => (
                <option key={s} value={s}>
                  {fr.quilt.strips.styles[s]}
                </option>
              ))}
            </select>
          </label>
          <SizeField label={fr.quilt.strips.width} value={strip.width} unit={unit} min={0.25} max={120} testId="strip-width" onCommit={(width) => edit({ width }, `sw${l.selected}`)} />
          <CountField label={fr.quilt.strips.along} value={strip.count} max={100} testId="strip-count" onCommit={(count) => edit({ count })} />
          {strip.style === "checkerboard" && <CountField label={fr.quilt.strips.across} value={strip.across} max={100} testId="strip-across" onCommit={(across) => edit({ across })} />}
          {Number.isFinite(formula) && <p className="palette-hint">{fr.quilt.strips.formula(formatLength(formula, unit, 3))}</p>}
        </div>
        <div className="palette-group">
          <SizeField label={fr.quilt.stripLength} value={l.length} unit={unit} min={1} max={300} testId="strip-length" onCommit={(length) => set({ ...l, length }, "length")} />
        </div>
      </>
    );
  } else if (layout.kind === "onepatch") {
    const l: OnePatchLayout = layout;
    const side = SIDE_SHAPES.includes(l.shape);
    body = (
      <>
        <div className="palette-group">
          <label className="field">
            <span className="field-label">{fr.quilt.onePatch.shape}</span>
            <select className="field-input" value={l.shape} data-testid="onepatch-shape" onChange={(e) => set({ ...l, shape: e.target.value as OnePatchLayout["shape"] })}>
              {ONE_PATCH_SHAPES.map((s) => (
                <option key={s} value={s}>
                  {fr.quilt.onePatch.shapes[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="palette-group">
          <h3>{fr.quilt.onePatch.units}</h3>
          <CountField label={fr.quilt.horizontal} value={l.nh} max={maxBlocks} testId="count-h" onCommit={(nh) => set({ ...l, nh })} />
          <CountField label={fr.quilt.vertical} value={l.nv} max={maxBlocks} testId="count-v" onCommit={(nv) => set({ ...l, nv })} />
        </div>
        <div className="palette-group">
          <h3>{fr.quilt.onePatch.size}</h3>
          <SizeField label={side ? fr.quilt.onePatch.side : fr.quilt.width} value={l.w} unit={unit} min={0.5} max={120} testId="block-w" onCommit={(w) => set({ ...l, w }, "w")} />
          {!side && <SizeField label={fr.quilt.height} value={l.h} unit={unit} min={0.5} max={120} testId="block-h" onCommit={(h) => set({ ...l, h }, "h")} />}
          {l.shape === "custom" && (
            <>
              <SizeField label={fr.quilt.onePatch.shearX} value={Math.abs(l.shearX)} unit={unit} min={0} max={l.w} testId="shear-x" onCommit={(shearX) => set({ ...l, shearX }, "shearX")} />
              <SizeField label={fr.quilt.onePatch.shearY} value={Math.abs(l.shearY)} unit={unit} min={0} max={l.h} testId="shear-y" onCommit={(shearY) => set({ ...l, shearY }, "shearY")} />
            </>
          )}
        </div>
      </>
    );
  } else if (layout.kind === "custom") {
    const l = layout;
    body = (
      <div className="palette-group">
        <h3>{fr.quilt.custom.size}</h3>
        <Check label={fr.quilt.keepEqual} checked={equalCustom} testId="equal-custom" onChange={setEqualCustom} />
        <SizeField label={fr.quilt.width} value={l.w} unit={unit} min={1} max={300} testId="custom-w" onCommit={(w) => onResizeCustom(w, equalCustom ? w : l.h, keepSizes)} />
        <SizeField label={fr.quilt.height} value={l.h} unit={unit} min={1} max={300} testId="custom-h" onCommit={(h) => onResizeCustom(equalCustom ? h : l.w, h, keepSizes)} />
        <Check label={fr.quilt.custom.keepSizes} checked={keepSizes} testId="custom-keep" onChange={setKeepSizes} />
      </div>
    );
  }

  return (
    <>
      <div className="palette-group">
        <label className="field">
          <span className="field-label">{fr.quilt.layoutLabel}</span>
          <select className="field-input" value={layout.kind} data-testid="layout-kind" onChange={(e) => onKind(e.target.value as LayoutKind)}>
            {LAYOUT_KINDS.map((k) => (
              <option key={k} value={k}>
                {fr.quilt.kinds[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {centre}
      {body}
    </>
  );
}
