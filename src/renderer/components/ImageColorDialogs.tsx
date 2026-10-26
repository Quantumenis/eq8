// Plan Image : « Ajuster la couleur » (SPEC §7.8) et « Histogramme, luminosité, contraste » (SPEC §7.9). Chaque
// réglage montre un aperçu Avant / Après sur une version réduite de l'image ; « Appliquer » le fait sur l'image
// (annulable) et la boîte reste ouverte ; « Fermer » abandonne.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ADJUST_PRESETS,
  IDENTITY_MIX,
  applyColorway,
  applyHueMap,
  applyPreset,
  brightnessContrast,
  channelMixer,
  colorAccent,
  colorBalance,
  colorize,
  dominantColors,
  emptyHueMap,
  equalize,
  histogram,
  randomPalette,
  readyPalette,
  shiftAssignment,
  shiftHsl,
  shiftRgb,
  type ChannelMatrix,
  type EqualizeMode,
  type HueMap,
} from "../../core/image/adjust";
import { resize } from "../../core/image/ops";
import type { Raster } from "../../core/image/raster";
import { fr } from "../i18n/fr";
import { rasterCanvas } from "../imageEditor";
import { Modal } from "./Modal";
import { NumberField } from "./fields";

const PREVIEW = 220;

function preview(r: Raster): Raster {
  const k = Math.min(1, PREVIEW / Math.max(r.width, r.height));
  return k >= 1 ? r : resize(r, Math.max(1, Math.round(r.width * k)), Math.max(1, Math.round(r.height * k)), "bilinear");
}

function RasterView({ raster, label, testId }: { raster: Raster; label: string; testId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    el.width = raster.width;
    el.height = raster.height;
    ctx.drawImage(rasterCanvas(raster), 0, 0);
  }, [raster]);
  return (
    <figure className="adjust-view">
      <canvas ref={ref} className="adjust-canvas" data-testid={testId} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

type Tab = "balance" | "rgb" | "hsl" | "colorize" | "accent" | "hueMap" | "mixer" | "colorway";
const TABS: Tab[] = ["balance", "rgb", "hsl", "colorize", "accent", "hueMap", "mixer", "colorway"];

interface ColorProps {
  raster: Raster;
  onApply: (next: Raster) => void;
  onClose: () => void;
}

export function ColorAdjustDialog({ raster, onApply, onClose }: ColorProps) {
  const t = fr.m9.color;
  const small = useMemo(() => preview(raster), [raster]);
  const [tab, setTab] = useState<Tab>("balance");
  const [strength, setStrength] = useState(100);
  const [rgb, setRgb] = useState({ r: 0, g: 0, b: 0 });
  const [hsl, setHsl] = useState({ h: 0, s: 0, l: 0 });
  const [col, setCol] = useState({ color: "#a0522d", intensity: 100 });
  const [acc, setAcc] = useState({ from: 330, to: 30, fade: 100 });
  const [hue, setHue] = useState<HueMap>(emptyHueMap());
  const [sector, setSector] = useState(0);
  const [mix, setMix] = useState<ChannelMatrix>(IDENTITY_MIX);
  const [ways, setWays] = useState({ count: 2, kind: "ready" as "ready" | "random", start: 0, seed: 1, shift: 0 });

  const found = useMemo(() => dominantColors(small, ways.count), [small, ways.count]);
  const palette = useMemo(() => {
    const base = ways.kind === "ready" ? readyPalette(ways.start, 0.65, 0.5) : randomPalette(ways.seed, 12);
    return shiftAssignment(base, ways.shift).slice(0, found.length);
  }, [ways, found.length]);

  const compute = (r: Raster): Raster => {
    switch (tab) {
      case "balance":
        return colorBalance(r, strength / 100);
      case "rgb":
        return shiftRgb(r, rgb.r, rgb.g, rgb.b);
      case "hsl":
        return shiftHsl(r, hsl.h, hsl.s, hsl.l);
      case "colorize":
        return colorize(r, col.color, col.intensity / 100);
      case "accent":
        return colorAccent(r, acc.from, acc.to, acc.fade / 100);
      case "hueMap":
        return applyHueMap(r, hue);
      case "mixer":
        return channelMixer(r, mix);
      case "colorway":
        return applyColorway(r, dominantColors(r, ways.count), palette);
    }
  };
  const after = useMemo(() => compute(small), [tab, strength, rgb, hsl, col, acc, hue, mix, ways, small, palette]);

  const slider = (label: string, value: number, min: number, max: number, set: (v: number) => void, testId: string) => (
    <label className="field">
      <span className="field-label">
        {label} : {value}
      </span>
      <input type="range" min={min} max={max} value={value} data-testid={testId} onChange={(e) => set(Number(e.target.value))} />
    </label>
  );

  return (
    <Modal
      title={t.title}
      size="wide"
      testId="color-dialog"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--primary" data-testid="color-apply" onClick={() => onApply(compute(raster))}>
            {t.apply}
          </button>
          <button type="button" className="btn" data-testid="color-close" onClick={onClose}>
            {t.close}
          </button>
        </>
      }
    >
      <div className="adjust-layout">
        <div className="adjust-options">
          <div className="tool-grid" role="tablist">
            {TABS.map((id) => (
              <button key={id} type="button" role="tab" className="tool-button tool-button--small" aria-selected={tab === id} aria-pressed={tab === id} data-testid={`color-tab-${id}`} onClick={() => setTab(id)}>
                {t.tabs[id]}
              </button>
            ))}
          </div>
          {tab === "balance" && (
            <>
              <p className="palette-hint">{t.balanceHelp}</p>
              {slider(t.strength, strength, 0, 100, setStrength, "color-strength")}
            </>
          )}
          {tab === "rgb" && (
            <>
              {slider(t.red, rgb.r, -100, 100, (v) => setRgb({ ...rgb, r: v }), "color-r")}
              {slider(t.green, rgb.g, -100, 100, (v) => setRgb({ ...rgb, g: v }), "color-g")}
              {slider(t.blue, rgb.b, -100, 100, (v) => setRgb({ ...rgb, b: v }), "color-b")}
            </>
          )}
          {tab === "hsl" && (
            <>
              {slider(t.hue, hsl.h, -180, 180, (v) => setHsl({ ...hsl, h: v }), "color-h")}
              {slider(t.saturation, hsl.s, -100, 100, (v) => setHsl({ ...hsl, s: v }), "color-s")}
              {slider(t.lightness, hsl.l, -100, 100, (v) => setHsl({ ...hsl, l: v }), "color-l")}
            </>
          )}
          {tab === "colorize" && (
            <>
              <label className="field">
                <span className="field-label">{t.colorizeColor}</span>
                <input type="color" value={col.color} data-testid="colorize-color" onChange={(e) => setCol({ ...col, color: e.target.value })} />
              </label>
              {slider(t.intensity, col.intensity, 0, 100, (v) => setCol({ ...col, intensity: v }), "colorize-intensity")}
            </>
          )}
          {tab === "accent" && (
            <>
              {slider(t.accentFrom, acc.from, 0, 359, (v) => setAcc({ ...acc, from: v }), "accent-from")}
              {slider(t.accentTo, acc.to, 0, 359, (v) => setAcc({ ...acc, to: v }), "accent-to")}
              {slider(t.accentFade, acc.fade, 0, 100, (v) => setAcc({ ...acc, fade: v }), "accent-fade")}
            </>
          )}
          {tab === "hueMap" && (
            <>
              <div className="hue-wheel" role="listbox" aria-label={t.tabs.hueMap}>
                {Array.from({ length: 12 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    role="option"
                    aria-selected={sector === i}
                    className={`hue-sector${sector === i ? " hue-sector--on" : ""}`}
                    style={{ background: `hsl(${i * 30 + 15} 70% 50%)`, outline: hue.targets[i] !== null ? "2px solid #24262b" : undefined }}
                    title={t.sector(i)}
                    data-testid={`hue-sector-${i}`}
                    onClick={() => setSector(i)}
                  />
                ))}
              </div>
              <p className="palette-hint">{t.sector(sector)}</p>
              {slider(t.sectorTarget, hue.targets[sector] ?? sector * 30, 0, 359, (v) => setHue({ ...hue, targets: hue.targets.map((x, i) => (i === sector ? v : x)) }), "hue-target")}
              <button type="button" className="btn btn--small" data-testid="hue-clear" onClick={() => setHue({ ...hue, targets: hue.targets.map((x, i) => (i === sector ? null : x)) })}>
                {t.sectorClear}
              </button>
              {slider(t.hueSat, hue.saturation, -100, 100, (v) => setHue({ ...hue, saturation: v }), "hue-sat")}
              {slider(t.hueLight, hue.lightness, -100, 100, (v) => setHue({ ...hue, lightness: v }), "hue-light")}
            </>
          )}
          {tab === "mixer" && (
            <>
              {mix.map((row, o) => (
                <div key={o}>
                  <span className="palette-subtitle">{t.mixerOut(t.channels[o] as string)}</span>
                  <div className="field-row">
                    {row.map((v, i) => (
                      <NumberField
                        key={i}
                        label={t.channels[i] as string}
                        value={v}
                        decimals={2}
                        testId={`mix-${o}-${i}`}
                        onCommit={(n) => {
                          if (!(n >= -2 && n <= 2)) return false;
                          setMix(mix.map((r, ro) => (ro === o ? r.map((x, ci) => (ci === i ? n : x)) : r)) as unknown as ChannelMatrix);
                          return true;
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn--small" onClick={() => setMix(IDENTITY_MIX)}>
                {t.reset}
              </button>
            </>
          )}
          {tab === "colorway" && (
            <>
              {slider(t.colorwayCount, ways.count, 1, 4, (v) => setWays({ ...ways, count: v, shift: 0 }), "ways-count")}
              <label className="field">
                <span className="field-label">{t.colorwayPalette}</span>
                <select value={ways.kind} data-testid="ways-kind" onChange={(e) => setWays({ ...ways, kind: e.target.value as "ready" | "random" })}>
                  <option value="ready">{t.palettes.ready}</option>
                  <option value="random">{t.palettes.random}</option>
                </select>
              </label>
              {ways.kind === "ready" ? slider(t.wheelStart, ways.start, 0, 330, (v) => setWays({ ...ways, start: v - (v % 30) }), "ways-start") : (
                <button type="button" className="btn btn--small" data-testid="ways-random" onClick={() => setWays({ ...ways, seed: ways.seed + 1 })}>
                  {t.random}
                </button>
              )}
              <button type="button" className="btn btn--small" data-testid="ways-shift" onClick={() => setWays({ ...ways, shift: ways.shift + 1 })}>
                {t.shift}
              </button>
              <p className="palette-hint">{t.found}</p>
              <div className="swatch-row">
                {found.map((c, i) => (
                  <span key={i} className="swatch swatch--small" style={{ background: c }} title={c} />
                ))}
              </div>
              <p className="palette-hint">{t.replacement}</p>
              <div className="swatch-row">
                {palette.map((c, i) => (
                  <span key={i} className="swatch swatch--small" style={{ background: c }} title={c} data-testid="ways-swatch" />
                ))}
              </div>
            </>
          )}
        </div>
        <div className="adjust-previews">
          <RasterView raster={small} label={t.before} testId="color-before" />
          <RasterView raster={after} label={t.after} testId="color-after" />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------

function HistogramCanvas({ before, after, show }: { before: Raster; after: Raster | null; show: { r: boolean; g: boolean; b: boolean; l: boolean } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const w = 512;
    const h = 160;
    el.width = w;
    el.height = h;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--sheet").trim() || "#fff";
    ctx.fillRect(0, 0, w, h);
    const draw = (r: Raster, fill: string, alpha: number) => {
      const hist = histogram(r);
      const channels: [keyof typeof show, number[], string][] = [
        ["l", hist.l, fill],
        ["r", hist.r, "#d33"],
        ["g", hist.g, "#3a3"],
        ["b", hist.b, "#33d"],
      ];
      for (const [key, bins, color] of channels) {
        if (!show[key]) continue;
        const max = Math.max(...bins, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = key === "l" ? fill : color;
        bins.forEach((v, i) => {
          const bh = (v / max) * (h - 4);
          ctx.fillRect(i * 2, h - bh, 2, bh);
        });
      }
      ctx.globalAlpha = 1;
    };
    draw(before, "#888888", 0.55);
    if (after) draw(after, "#f06292", 0.45);
  }, [before, after, show]);
  return <canvas ref={ref} className="histogram-canvas" data-testid="histogram-canvas" />;
}

export function HistogramDialog({ raster, onApply, onClose }: ColorProps) {
  const t = fr.m9.histogram;
  const small = useMemo(() => preview(raster), [raster]);
  const [show, setShow] = useState({ r: false, g: false, b: false, l: true });
  const [mode, setMode] = useState<EqualizeMode>("yuv");
  const [bc, setBc] = useState({ b: 0, c: 0 });
  const [pending, setPending] = useState<{ kind: "eq" | "preset" | "bc"; preset?: (typeof ADJUST_PRESETS)[number] } | null>(null);
  const run = (r: Raster): Raster => {
    if (!pending) return r;
    if (pending.kind === "eq") return equalize(r, mode);
    if (pending.kind === "preset") return applyPreset(r, pending.preset ?? "lighten");
    return brightnessContrast(r, bc.b, bc.c);
  };
  const after = useMemo(() => (pending ? run(small) : null), [pending, mode, bc, small]);
  return (
    <Modal
      title={t.title}
      size="wide"
      testId="histogram-dialog"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--primary" data-testid="histogram-apply" disabled={!pending} onClick={() => (onApply(run(raster)), setPending(null))}>
            {t.apply}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {fr.m9.color.close}
          </button>
        </>
      }
    >
      <HistogramCanvas before={small} after={after} show={show} />
      <p className="palette-hint">
        {t.before} · {t.after}
      </p>
      <div className="check-row">
        {(["l", "r", "g", "b"] as const).map((k) => (
          <label key={k} className="check">
            <input type="checkbox" checked={show[k]} data-testid={`histogram-show-${k}`} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />
            <span>{t.channels[k]}</span>
          </label>
        ))}
      </div>
      <div className="palette-group">
        <h3>{t.equalize}</h3>
        <label className="field">
          <span className="field-label">{t.mode}</span>
          <select value={mode} data-testid="equalize-mode" onChange={(e) => (setMode(e.target.value as EqualizeMode), setPending({ kind: "eq" }))}>
            {(["rgb", "yuv", "gray"] as const).map((m) => (
              <option key={m} value={m}>
                {t.modes[m]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--small" data-testid="equalize-preview" onClick={() => setPending({ kind: "eq" })}>
          {t.equalize}
        </button>
      </div>
      <div className="palette-group">
        <h3>{t.presets}</h3>
        <div className="button-grid">
          {ADJUST_PRESETS.map((p) => (
            <button key={p} type="button" className="btn btn--small" data-testid={`preset-${p}`} onClick={() => setPending({ kind: "preset", preset: p })}>
              {t.presetNames[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="palette-group">
        <label className="field">
          <span className="field-label">
            {t.brightness} : {bc.b}
          </span>
          <input type="range" min={-100} max={100} value={bc.b} data-testid="brightness" onChange={(e) => (setBc({ ...bc, b: Number(e.target.value) }), setPending({ kind: "bc" }))} />
        </label>
        <label className="field">
          <span className="field-label">
            {t.contrast} : {bc.c}
          </span>
          <input type="range" min={-100} max={100} value={bc.c} data-testid="contrast" onChange={(e) => (setBc({ ...bc, c: Number(e.target.value) }), setPending({ kind: "bc" }))} />
        </label>
      </div>
    </Modal>
  );
}
