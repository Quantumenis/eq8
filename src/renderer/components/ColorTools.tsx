// Outils des couleurs (SPEC §5.10, §5.12, §5.13) : notre sélecteur (TSV, RVB, TSL, hexadécimal), les gammes
// Nuances & teintes, Tons et Dégradés (OKLab, 4 à 16 couleurs), le tri manuel ou automatique, et le menu contextuel
// qui les ouvre (clic droit sur une couleur, dans le carnet ou dans la palette).

import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  RAMP_DEFAULT,
  RAMP_MAX,
  RAMP_MIN,
  grades,
  hexToRgb,
  hslToRgb,
  hsvToRgb,
  insertInRamp,
  parseHex,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  shadesAndTints,
  tones,
  type ColorSortKey,
  type Hsv,
  type RampKind,
  type SortDirection,
} from "../../core/color/color";
import { sortByClickOrder, sortColorsAuto } from "../../core/project/commands";
import { addColors } from "../../core/project/images";
import type { Id } from "../../core/project/model";
import { fr } from "../i18n/fr";
import { useSession } from "../projectSession";
import { Modal } from "./Modal";
import { SortDialog } from "./SortDialog";

/** Ordre des couleurs avant le dernier tri de la session (« Défaire le tri »). */
let orderBeforeSort: Id[] | null = null;

// ---------------------------------------------------------------------------------------------------------------
// Sélecteur de couleur

function ByteField({ label, value, max, onCommit, testId }: { label: string; value: number; max: number; onCommit: (v: number) => void; testId: string }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  const commit = () => {
    const n = Number(text.trim().replace(",", "."));
    if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(0, n)));
    else setText(String(value));
  };
  return (
    <label className="field field--tiny">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        inputMode="numeric"
        value={text}
        data-testid={testId}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </label>
  );
}

/** Carré saturation × valeur, et réglette de teinte (TSV). */
function SvSquare({ hsv, onChange }: { hsv: Hsv; onChange: (hsv: Hsv) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const at = (e: ReactPointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const s = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    onChange({ h: hsv.h, s, v });
  };
  return (
    <div
      ref={ref}
      className="sv-square"
      data-testid="picker-sv"
      style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        at(e);
      }}
      onPointerMove={(e) => dragging.current && at(e)}
      onPointerUp={() => (dragging.current = false)}
    >
      <span className="sv-cursor" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
    </div>
  );
}

/** « Ajouter des couleurs » : choisir, ajouter au carnet, recommencer (plusieurs couleurs d'affilée). */
export function ColorPickerDialog({ initial, onClose }: { initial: string; onClose: () => void }) {
  const session = useSession();
  const [hex, setHex] = useState(initial);
  // La teinte est gardée à part : elle ne doit pas sauter à 0 quand la couleur devient grise.
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(hexToRgb(initial)));
  const [hexText, setHexText] = useState(initial);
  const [added, setAdded] = useState<string[]>([]);
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  const t = fr.colors.picker;

  const setFromHex = (next: string, keepHue = false) => {
    setHex(next);
    setHexText(next);
    const h = rgbToHsv(hexToRgb(next));
    setHsv(keepHue && h.s === 0 ? { ...h, h: hsv.h } : h);
  };
  const setFromHsv = (next: Hsv) => {
    setHsv(next);
    const value = rgbToHex(hsvToRgb(next));
    setHex(value);
    setHexText(value);
  };

  const add = () => {
    let r: ReturnType<typeof addColors> | null = null;
    session.execute(fr.colors.history.add, (p) => {
      r = addColors(p, [hex]);
      return r.project;
    });
    const result = r as ReturnType<typeof addColors> | null;
    if (result && result.added.length > 0) setAdded((a) => [...a, hex]);
  };

  return (
    <Modal
      title={t.title}
      size="medium"
      testId="color-picker"
      onClose={onClose}
      footer={
        <>
          <span className="muted" data-testid="picker-added">
            {t.added(added.length)}
          </span>
          <span className="modal-footer-spacer" />
          <button type="button" className="btn btn--primary" data-testid="picker-add" onClick={add}>
            {t.add}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {fr.dialogs.close}
          </button>
        </>
      }
    >
      <div className="picker">
        <div className="picker-visual">
          <SvSquare hsv={hsv} onChange={setFromHsv} />
          <input
            type="range"
            className="hue-slider"
            min={0}
            max={359}
            value={Math.round(hsv.h)}
            aria-label={t.hue}
            data-testid="picker-hue"
            onChange={(e) => setFromHsv({ ...hsv, h: Number(e.target.value) })}
          />
        </div>
        <div className="picker-fields">
          <div className="picker-preview" style={{ background: hex }} data-testid="picker-preview" data-rgb={hex} />
          <label className="field">
            <span className="field-label">{t.hex}</span>
            <input
              className="field-input"
              value={hexText}
              data-testid="picker-hex"
              onChange={(e) => {
                setHexText(e.target.value);
                const parsed = parseHex(e.target.value);
                if (parsed) setFromHex(parsed);
              }}
              onBlur={() => setHexText(hex)}
            />
          </label>
          <fieldset className="picker-group">
            <legend>{t.rgb}</legend>
            <ByteField label="R" value={rgb.r} max={255} testId="picker-r" onCommit={(v) => setFromHex(rgbToHex({ ...rgb, r: v }))} />
            <ByteField label="V" value={rgb.g} max={255} testId="picker-g" onCommit={(v) => setFromHex(rgbToHex({ ...rgb, g: v }))} />
            <ByteField label="B" value={rgb.b} max={255} testId="picker-b" onCommit={(v) => setFromHex(rgbToHex({ ...rgb, b: v }))} />
          </fieldset>
          <fieldset className="picker-group">
            <legend>{t.hsl}</legend>
            <ByteField label="T" value={Math.round(hsl.h)} max={359} testId="picker-hsl-h" onCommit={(v) => setFromHex(rgbToHex(hslToRgb({ ...hsl, h: v })))} />
            <ByteField label="S" value={Math.round(hsl.s * 100)} max={100} testId="picker-hsl-s" onCommit={(v) => setFromHex(rgbToHex(hslToRgb({ ...hsl, s: v / 100 })), true)} />
            <ByteField label="L" value={Math.round(hsl.l * 100)} max={100} testId="picker-hsl-l" onCommit={(v) => setFromHex(rgbToHex(hslToRgb({ ...hsl, l: v / 100 })), true)} />
          </fieldset>
          <fieldset className="picker-group">
            <legend>{t.hsv}</legend>
            <ByteField label="T" value={Math.round(hsv.h)} max={359} testId="picker-hsv-h" onCommit={(v) => setFromHsv({ ...hsv, h: v })} />
            <ByteField label="S" value={Math.round(hsv.s * 100)} max={100} testId="picker-hsv-s" onCommit={(v) => setFromHsv({ ...hsv, s: v / 100 })} />
            <ByteField label="V" value={Math.round(hsv.v * 100)} max={100} testId="picker-hsv-v" onCommit={(v) => setFromHsv({ ...hsv, v: v / 100 })} />
          </fieldset>
        </div>
      </div>
      {added.length > 0 && (
        <div className="picker-added-strip" aria-label={t.addedList}>
          {added.map((c, i) => (
            <span key={i} className="swatch swatch--small" style={{ background: c }} title={c} />
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Gammes

function rampOf(kind: RampKind, base: string, second: string, n: number): string[] {
  if (kind === "shades") return shadesAndTints(base, n);
  if (kind === "tones") return tones(base, n);
  return grades(base, second, n);
}

/** Nuances & teintes, Tons, Dégradés : une gamme de 4 à 16 couleurs, modifiable, ajoutée à la fin de la palette. */
export function RampDialog({ kind, base, onClose, notify }: { kind: RampKind; base: string; onClose: () => void; notify: (m: string) => void }) {
  const session = useSession();
  const colors = session.project.sketchbook.colors;
  const [second, setSecond] = useState(() => colors.find((c) => c.rgb !== base)?.rgb ?? "#ffffff");
  const [count, setCount] = useState(RAMP_DEFAULT);
  const [ramp, setRamp] = useState(() => rampOf(kind, base, second, RAMP_DEFAULT));
  const [selected, setSelected] = useState(0);
  const t = fr.colors.ramp;

  const regenerate = (n: number, other = second) => {
    setCount(n);
    setRamp(rampOf(kind, base, other, n));
    setSelected((s) => Math.min(s, n - 1));
  };

  const add = () => {
    let r: ReturnType<typeof addColors> | null = null;
    session.execute(t.history, (p) => {
      r = addColors(p, ramp);
      return r.project;
    });
    const result = r as ReturnType<typeof addColors> | null;
    notify(t.added(result?.added.length ?? 0, result?.duplicates ?? 0));
    onClose();
  };

  return (
    <Modal
      title={t.titles[kind]}
      size="wide"
      testId="ramp-dialog"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" data-testid="ramp-insert" disabled={ramp.length >= RAMP_MAX} onClick={() => setRamp((r) => insertInRamp(r, selected))}>
            {t.insert}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="ramp-remove"
            disabled={ramp.length <= RAMP_MIN}
            onClick={() => {
              setRamp((r) => r.filter((_, i) => i !== selected));
              setSelected((s) => Math.max(0, Math.min(s, ramp.length - 2)));
            }}
          >
            {t.remove}
          </button>
          <span className="modal-footer-spacer" />
          <button type="button" className="btn btn--primary" data-testid="ramp-add" onClick={add}>
            {t.add}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {fr.dialogs.cancel}
          </button>
        </>
      }
    >
      <p className="muted">{t.help[kind]}</p>
      <div className="ramp-controls">
        <label className="field field--tiny">
          <span className="field-label">{t.count}</span>
          <input
            type="number"
            className="field-input"
            min={RAMP_MIN}
            max={RAMP_MAX}
            value={count}
            data-testid="ramp-count"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= RAMP_MIN && n <= RAMP_MAX) regenerate(n);
            }}
          />
        </label>
        {kind === "grades" && (
          <div className="ramp-second">
            <span className="field-label">{t.second}</span>
            <div className="swatch-row" role="listbox" aria-label={t.second}>
              {colors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={c.rgb === second}
                  className={`swatch swatch--small${c.rgb === second ? " swatch--current" : ""}`}
                  style={{ background: c.rgb }}
                  title={c.card.name || c.rgb}
                  data-testid="ramp-second"
                  data-rgb={c.rgb}
                  onClick={() => {
                    setSecond(c.rgb);
                    regenerate(count, c.rgb);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="ramp-strip" role="listbox" aria-label={t.titles[kind]} data-testid="ramp-strip" data-count={ramp.length}>
        {ramp.map((c, i) => (
          <button
            key={`${i}-${c}`}
            type="button"
            role="option"
            aria-selected={i === selected}
            className={`ramp-swatch${i === selected ? " ramp-swatch--selected" : ""}`}
            style={{ background: c }}
            title={`${c} — ${fr.coloring.rgb(c)}`}
            data-testid="ramp-swatch"
            data-rgb={c}
            onClick={() => setSelected(i)}
          />
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Tri automatique

export function ColorSortDialog({ onClose, notify }: { onClose: () => void; notify: (m: string) => void }) {
  const session = useSession();
  const [key, setKey] = useState<ColorSortKey>("hue");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const t = fr.colors.sort;
  return (
    <Modal
      title={t.autoTitle}
      size="narrow"
      testId="color-sort-dialog"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {fr.dialogs.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            data-testid="color-sort-apply"
            onClick={() => {
              orderBeforeSort = session.project.sketchbook.colors.map((c) => c.id);
              session.execute(t.history, (p) => sortColorsAuto(p, key, direction));
              notify(t.done);
              onClose();
            }}
          >
            {t.apply}
          </button>
        </>
      }
    >
      <fieldset className="radio-group">
        <legend>{t.by}</legend>
        {(["hue", "lightness", "saturation"] as const).map((k) => (
          <label key={k} className="check">
            <input type="radio" name="sort-key" checked={key === k} data-testid={`color-sort-${k}`} onChange={() => setKey(k)} />
            <span>{t.keys[k]}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="radio-group">
        <legend>{t.order}</legend>
        {(["asc", "desc"] as const).map((d) => (
          <label key={d} className="check">
            <input type="radio" name="sort-direction" checked={direction === d} data-testid={`color-sort-${d}`} onChange={() => setDirection(d)} />
            <span>{t.directions[d]}</span>
          </label>
        ))}
      </fieldset>
      <p className="muted">{t.greys}</p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Menu contextuel des couleurs

type ColorDialog = { kind: "picker"; rgb: string } | { kind: "ramp"; ramp: RampKind; rgb: string } | { kind: "sort-auto" } | { kind: "sort-manual" } | null;

/** Le menu « clic droit sur une couleur » et ses boîtes de dialogue. */
export function useColorTools(notify: (message: string) => void): { openMenu: (rgb: string, event: MouseEvent) => void; openPicker: (rgb?: string) => void; element: ReactNode } {
  const session = useSession();
  const [menu, setMenu] = useState<{ rgb: string; x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<ColorDialog>(null);
  const t = fr.colors.menu;

  const openMenu = useCallback((rgb: string, event: MouseEvent) => {
    event.preventDefault();
    setMenu({ rgb, x: Math.min(event.clientX, window.innerWidth - 240), y: Math.min(event.clientY, window.innerHeight - 280) });
  }, []);
  const openPicker = useCallback((rgb = "#cc3333") => setDialog({ kind: "picker", rgb }), []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const choose = (next: ColorDialog) => {
    setMenu(null);
    setDialog(next);
  };

  const element = (
    <>
      {menu && (
        <div className="menu menu--context" role="menu" data-testid="color-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" role="menuitem" data-testid="cmenu-add" onClick={() => choose({ kind: "picker", rgb: menu.rgb })}>
            {t.add}
          </button>
          <button type="button" role="menuitem" data-testid="cmenu-shades" onClick={() => choose({ kind: "ramp", ramp: "shades", rgb: menu.rgb })}>
            {t.shades}
          </button>
          <button type="button" role="menuitem" data-testid="cmenu-tones" onClick={() => choose({ kind: "ramp", ramp: "tones", rgb: menu.rgb })}>
            {t.tones}
          </button>
          <button type="button" role="menuitem" data-testid="cmenu-grades" onClick={() => choose({ kind: "ramp", ramp: "grades", rgb: menu.rgb })}>
            {t.grades}
          </button>
          <div className="menu-group" role="group" aria-label={t.sort}>
            <span className="menu-title">{t.sort}</span>
            <button type="button" role="menuitem" data-testid="cmenu-sort-manual" onClick={() => choose({ kind: "sort-manual" })}>
              {t.sortManual}
            </button>
            <button type="button" role="menuitem" data-testid="cmenu-sort-auto" onClick={() => choose({ kind: "sort-auto" })}>
              {t.sortAuto}
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="cmenu-sort-undo"
              disabled={!orderBeforeSort}
              onClick={() => {
                const order = orderBeforeSort;
                setMenu(null);
                if (!order) return;
                session.execute(fr.colors.sort.undoHistory, (p) => sortByClickOrder(p, "colors", order));
                orderBeforeSort = null;
                notify(fr.colors.sort.undone);
              }}
            >
              {t.sortUndo}
            </button>
          </div>
        </div>
      )}
      {dialog?.kind === "picker" && <ColorPickerDialog initial={dialog.rgb} onClose={() => setDialog(null)} />}
      {dialog?.kind === "ramp" && <RampDialog kind={dialog.ramp} base={dialog.rgb} notify={notify} onClose={() => setDialog(null)} />}
      {dialog?.kind === "sort-auto" && <ColorSortDialog notify={notify} onClose={() => setDialog(null)} />}
      {dialog?.kind === "sort-manual" && (
        <SortDialog
          list="colors"
          items={session.project.sketchbook.colors}
          onApply={(clicked) => {
            setDialog(null);
            if (clicked.length === 0) return;
            orderBeforeSort = session.project.sketchbook.colors.map((c) => c.id);
            session.execute(fr.sketchbook.sort, (p) => sortByClickOrder(p, "colors", clicked));
          }}
        />
      )}
    </>
  );
  return { openMenu, openPicker, element };
}
