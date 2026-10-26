// Onglet BORDURES du plan Quilt (SPEC §3) : style, choix de la bordure, ajout, suppression, tailles et nombres de blocs.

import { useMemo, useState } from "react";
import type { DisplayUnit } from "../../core/units";
import {
  BORDER_SIDES,
  BORDER_SIZE_MAX,
  BORDER_SIZE_STEP,
  BORDER_STYLES,
  borderPreview,
  forcesFourSides,
  hasBlockCounts,
  isAlignedStyle,
  isTileStyle,
  type Border,
  type BorderSide,
  type BorderStyle,
} from "../../core/quilt/borders";
import type { SizeLock } from "../../core/quilt/borderops";
import { AUTO_BORDERS, AUTO_CATEGORIES, type AutoBorder, type AutoCategory } from "../../core/quilt/borderpresets";
import { fr } from "../i18n/fr";
import { Check, NumberField } from "./fields";
import { SizeField } from "./QuiltLayoutPanel";

const previewCache = new Map<BorderStyle, ReturnType<typeof borderPreview>>();
const preview = (style: BorderStyle) => {
  let p = previewCache.get(style);
  if (!p) {
    p = borderPreview(style);
    previewCache.set(style, p);
  }
  return p;
};

/** La vignette d'un style : un petit centre blanc entouré de la bordure. */
function StyleThumb({ style }: { style: BorderStyle }) {
  const p = preview(style);
  return (
    <svg viewBox={`-2 -2 ${p.width} ${p.height}`} width="100%" height="100%" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <rect x={0} y={0} width={8} height={8} fill="var(--sheet)" />
      {p.polys.map((poly, i) => (
        <polygon key={i} points={poly.map((q) => `${q.x},${q.y}`).join(" ")} fill={i % 2 === 0 ? "#5d86bd" : "#bcd0ea"} stroke="#2b3d57" strokeWidth={0.08} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** La vignette d'une bordure automatique : le style, avec les couleurs de la bordure. */
function AutoThumb({ preset }: { preset: AutoBorder }) {
  const p = preview(preset.style);
  const [a, b, c] = preset.colors;
  return (
    <svg viewBox={`-2 -2 ${p.width} ${p.height}`} width="100%" height="100%" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <rect x={0} y={0} width={8} height={8} fill="var(--sheet)" />
      {p.polys.map((poly, i) => (
        <polygon key={i} points={poly.map((q) => `${q.x},${q.y}`).join(" ")} fill={i % 3 === 0 ? a : i % 3 === 1 ? b : c} stroke="#24262b" strokeWidth={0.06} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

interface Props {
  borders: readonly Border[];
  selectedId: string | null;
  unit: DisplayUnit;
  keepBorders: boolean;
  defaultStyle: BorderStyle;
  onSelect: (id: string) => void;
  onAdd: (clone: boolean) => void;
  onInsert: (clone: boolean) => void;
  onRemove: () => void;
  onStyle: (style: BorderStyle) => void;
  onSize: (side: BorderSide, inches: number, lock: SizeLock) => void;
  onCount: (which: "nh" | "nv", n: number) => void;
  onMatchInner: () => void;
  onKeep: (keep: boolean) => void;
  onDefaultStyle: (style: BorderStyle) => void;
}

export function BorderPanel({ borders, selectedId, unit, keepBorders, defaultStyle, onSelect, onAdd, onInsert, onRemove, onStyle, onSize, onCount, onMatchInner, onKeep, onDefaultStyle }: Props) {
  const [lock, setLock] = useState<SizeLock>({ all: true, leftRight: false, topBottom: false });
  const [clone, setClone] = useState(false);
  const index = borders.findIndex((b) => b.id === selectedId);
  const selected = index >= 0 ? (borders[index] as Border) : null;
  const four = selected ? forcesFourSides(selected.style) : false;
  const counts = selected ? hasBlockCounts(selected.style) : false;

  return (
    <>
      <div className="palette-group" data-testid="border-panel">
        <h3>{fr.quilt.borders.styleTitle}</h3>
        <div className="border-styles" role="group" aria-label={fr.quilt.borders.styleTitle} data-testid="border-styles">
          {BORDER_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              className="border-style"
              data-testid={`border-style-${style}`}
              aria-pressed={selected?.style === style}
              disabled={!selected}
              title={fr.quilt.borders.styles[style]}
              aria-label={fr.quilt.borders.styles[style]}
              onClick={() => onStyle(style)}
            >
              <StyleThumb style={style} />
            </button>
          ))}
        </div>
        <p className="palette-hint" data-testid="border-style-name">
          {selected ? fr.quilt.borders.styles[selected.style] : fr.quilt.borders.none}
        </p>
      </div>

      <div className="palette-group">
        <h3>{fr.quilt.borders.choose}</h3>
        <div className="coloring-nav" data-testid="border-nav">
          <button type="button" className="btn btn--small" data-testid="border-prev" aria-label="◀" disabled={index <= 0} onClick={() => onSelect((borders[index - 1] as Border).id)}>
            ◀
          </button>
          <span data-testid="border-position" data-count={borders.length} data-index={index + 1}>
            {borders.length === 0 ? fr.quilt.borders.none : fr.quilt.borders.position(index + 1, borders.length)}
          </span>
          <button type="button" className="btn btn--small" data-testid="border-next" aria-label="▶" disabled={index < 0 || index >= borders.length - 1} onClick={() => onSelect((borders[index + 1] as Border).id)}>
            ▶
          </button>
        </div>
        <p className="palette-hint">{fr.quilt.borders.hint}</p>
        <div className="button-grid">
          <button type="button" className="btn btn--small" data-testid="border-add" title={fr.quilt.borders.addHelp} onClick={() => onAdd(clone)}>
            {fr.quilt.borders.add}
          </button>
          <button type="button" className="btn btn--small" data-testid="border-insert" title={fr.quilt.borders.addHelp} onClick={() => onInsert(clone)}>
            {fr.quilt.borders.insert}
          </button>
          <button type="button" className="btn btn--small" data-testid="border-remove" disabled={!selected} onClick={onRemove}>
            {fr.quilt.borders.remove}
          </button>
        </div>
        <Check label={fr.quilt.borders.clone} checked={clone} testId="border-clone" onChange={setClone} />
        <p className="palette-hint">{fr.quilt.borders.cloneHelp}</p>
      </div>

      {selected && (
        <div className="palette-group" data-testid="border-sizes" data-border={selected.id}>
          <h3>{fr.quilt.borders.sizes}</h3>
          {BORDER_SIDES.map((side) => (
            <SizeField
              key={side}
              label={fr.quilt.borders.sides[side]}
              value={selected.sizes[side]}
              unit={unit}
              min={four ? BORDER_SIZE_STEP : 0}
              max={BORDER_SIZE_MAX}
              testId={`border-size-${side}`}
              onCommit={(inches) => onSize(side, inches, lock)}
            />
          ))}
          <span className="palette-subtitle">{fr.quilt.borders.lock}</span>
          <div className="button-grid">
            <Check label={fr.quilt.borders.lockAll} checked={lock.all} testId="border-lock-all" onChange={(v) => setLock({ all: v, leftRight: v ? false : lock.leftRight, topBottom: v ? false : lock.topBottom })} />
            <label className={`check${lock.all ? " check--disabled" : ""}`}>
              <input type="checkbox" checked={lock.leftRight} disabled={lock.all} data-testid="border-lock-lr" onChange={(e) => setLock({ ...lock, leftRight: e.target.checked })} />
              <span>{fr.quilt.borders.lockLeftRight}</span>
            </label>
            <label className={`check${lock.all ? " check--disabled" : ""}`}>
              <input type="checkbox" checked={lock.topBottom} disabled={lock.all} data-testid="border-lock-tb" onChange={(e) => setLock({ ...lock, topBottom: e.target.checked })} />
              <span>{fr.quilt.borders.lockTopBottom}</span>
            </label>
          </div>
          <p className="palette-hint">{four ? fr.quilt.borders.tilesHelp : fr.quilt.borders.zeroHelp}</p>
        </div>
      )}

      {selected && (
        <div className="palette-group" data-testid="border-counts">
          <h3>{fr.quilt.borders.counts}</h3>
          {counts ? (
            <>
              <div className="field-row">
                <NumberField label={fr.quilt.borders.horizontal} value={selected.nh} decimals={0} testId="border-nh" step={1} onCommit={(n) => (Number.isInteger(n) && n >= 1 && n <= 100 ? (onCount("nh", n), true) : false)} />
                <NumberField label={fr.quilt.borders.vertical} value={selected.nv} decimals={0} testId="border-nv" step={1} onCommit={(n) => (Number.isInteger(n) && n >= 1 && n <= 100 ? (onCount("nv", n), true) : false)} />
              </div>
              {isTileStyle(selected.style) && <p className="palette-hint">{fr.quilt.borders.tilesHelp}</p>}
              {isAlignedStyle(selected.style) && (
                <>
                  <p className="palette-hint">{fr.quilt.borders.alignedHelp}</p>
                  <button type="button" className="btn btn--small" data-testid="border-match" disabled={index === 0} onClick={onMatchInner}>
                    {fr.quilt.borders.matchInner}
                  </button>
                </>
              )}
            </>
          ) : (
            <p className="palette-hint">{selected.style === "mitered" ? fr.quilt.borders.mitered : fr.quilt.borders.noCounts}</p>
          )}
        </div>
      )}

      <div className="palette-group">
        <Check label={fr.quilt.borders.keep} checked={keepBorders} testId="border-keep" onChange={onKeep} />
        <label className="field">
          <span className="field-label">{fr.quilt.borders.defaultStyle}</span>
          <select className="field-input" value={defaultStyle} data-testid="border-default-style" onChange={(e) => onDefaultStyle(e.target.value as BorderStyle)}>
            {BORDER_STYLES.map((s) => (
              <option key={s} value={s}>
                {fr.quilt.borders.styles[s]}
              </option>
            ))}
          </select>
        </label>
        <p className="palette-hint">{fr.quilt.borders.defaultStyleHelp}</p>
      </div>
    </>
  );
}

/** Les bordures automatiques (onglet DESIGN) : une catégorie, puis une bordure à poser d'un clic sur le quilt. */
export function AutoBorders({ active, onPick }: { active: string | null; onPick: (preset: AutoBorder | null) => void }) {
  const [category, setCategory] = useState<AutoCategory>("bands");
  const list = useMemo(() => AUTO_BORDERS.filter((p) => p.category === category), [category]);
  return (
    <div className="palette-group" data-testid="auto-borders">
      <h3>{fr.quilt.borders.auto.title}</h3>
      <p className="palette-hint">{fr.quilt.borders.auto.help}</p>
      <label className="field">
        <select className="field-input" value={category} data-testid="auto-category" aria-label={fr.quilt.borders.auto.title} onChange={(e) => setCategory(e.target.value as AutoCategory)}>
          {AUTO_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {fr.quilt.borders.auto.categories[c]}
            </option>
          ))}
        </select>
      </label>
      <div className="border-styles" role="listbox" aria-label={fr.quilt.borders.auto.title}>
        {list.map((p) => (
          <button key={p.id} type="button" role="option" aria-selected={active === p.id} className="border-style" data-testid={`auto-border-${p.id}`} title={p.name} aria-label={p.name} onClick={() => onPick(active === p.id ? null : p)}>
            <AutoThumb preset={p} />
          </button>
        ))}
      </div>
      {active && (
        <p className="palette-hint palette-hint--strong" data-testid="auto-border-hint">
          {fr.quilt.borders.auto.pickBorder}
        </p>
      )}
    </div>
  );
}
