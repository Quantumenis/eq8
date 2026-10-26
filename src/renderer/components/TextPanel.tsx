// Palette TEXTE EN APPLIQUE (SPEC §4.15) : le texte, la police (chaque nom dans sa propre police), la taille
// approximative, gras, italique et alignement. Tout le contenu d'une boîte a la même mise en forme.

import { useEffect, useState } from "react";
import { MAX_TEXT_SIZE, MIN_TEXT_SIZE, type TextAlign, type TextSpec } from "../../core/text/glyphs";
import type { InstalledFontInfo } from "../../shared/api";
import { ensureFont, loadFontList } from "../fonts";
import { fr } from "../i18n/fr";
import { Check, NumberField } from "./fields";

interface Props {
  spec: TextSpec | null;
  onChange: (spec: TextSpec) => void;
  unit: "in" | "cm";
}

export function TextPanel({ spec, onChange, unit }: Props) {
  const t = fr.textTool;
  const [fonts, setFonts] = useState<readonly InstalledFontInfo[]>([]);
  useEffect(() => {
    let alive = true;
    void loadFontList().then((list) => alive && setFonts(list));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (spec) void ensureFont(spec.family, spec.bold, spec.italic);
  }, [spec?.family, spec?.bold, spec?.italic]);
  if (!spec) {
    return (
      <div className="palette-group" data-testid="text-panel">
        <h3>{t.title}</h3>
        <p className="palette-hint">{t.help}</p>
        <p className="palette-hint">{t.noBox}</p>
      </div>
    );
  }
  const set = (patch: Partial<TextSpec>) => onChange({ ...spec, ...patch });
  const k = unit === "in" ? 1 : 2.54;
  return (
    <div className="palette-group" data-testid="text-panel">
      <h3>{t.title}</h3>
      <label className="field">
        <span className="field-label">{t.text}</span>
        <textarea className="field-input" rows={3} value={spec.text} placeholder={t.placeholder} data-testid="text-content" onChange={(e) => set({ text: e.target.value })} />
      </label>
      <label className="field">
        <span className="field-label">{t.font}</span>
        <select value={spec.family} data-testid="text-font" style={{ fontFamily: spec.family }} onChange={(e) => set({ family: e.target.value })}>
          {!fonts.some((f) => f.family === spec.family) && <option value={spec.family}>{spec.family}</option>}
          {fonts.map((f) => (
            <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
              {f.family}
            </option>
          ))}
        </select>
      </label>
      {fonts.length === 0 && <p className="palette-hint">{t.fontsNone}</p>}
      <NumberField
        label={t.size}
        value={Math.round(spec.size * k * 100) / 100}
        testId="text-size"
        onCommit={(n) => {
          const inches = n / k;
          if (!(inches >= MIN_TEXT_SIZE && inches <= MAX_TEXT_SIZE)) return false;
          set({ size: inches });
          return true;
        }}
      />
      <div className="button-grid">
        <Check label={t.bold} checked={spec.bold} testId="text-bold" onChange={(bold) => set({ bold })} />
        <Check label={t.italic} checked={spec.italic} testId="text-italic" onChange={(italic) => set({ italic })} />
      </div>
      <label className="field">
        <span className="field-label">{t.align}</span>
        <select value={spec.align} data-testid="text-align" onChange={(e) => set({ align: e.target.value as TextAlign })}>
          {(["left", "center", "right"] as const).map((a) => (
            <option key={a} value={a}>
              {t.aligns[a]}
            </option>
          ))}
        </select>
      </label>
      <p className="palette-hint">{t.paintHelp}</p>
    </div>
  );
}
