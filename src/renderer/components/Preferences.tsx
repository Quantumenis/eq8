import { useState } from "react";
import { clampMaxColorings, setMaxColorings } from "../../core/project/commands";
import { MAX_MAX_COLORINGS, MIN_MAX_COLORINGS } from "../../core/project/model";
import type { Preferences as Prefs, UnitPref } from "../../shared/api";
import { fr } from "../i18n/fr";
import { useSession } from "../projectSession";
import { Modal } from "./Modal";
import { MIN_LINE_CHOICES, printSettings, usePrintSettings } from "../printSettings";

interface Props {
  prefs: Prefs;
  onChange: (patch: Partial<Pick<Prefs, "unit" | "maxColorings">>) => Promise<void>;
  onReset: (alsoPalette: boolean) => Promise<void>;
  onSavePalette: () => Promise<void>;
  onClose: () => void;
}

export function Preferences({ prefs, onChange, onReset, onSavePalette, onClose }: Props) {
  const session = useSession();
  const [alsoPalette, setAlsoPalette] = useState(false);
  const print = usePrintSettings();

  const changeColorings = (raw: string) => {
    const value = clampMaxColorings(Number(raw));
    void onChange({ maxColorings: value });
    session.execute("Nombre maximal de colorations", (p) => setMaxColorings(p, value));
  };

  return (
    <Modal
      title={fr.prefs.title}
      size="medium"
      testId="preferences"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn--primary" data-autofocus onClick={onClose}>
          {fr.prefs.close}
        </button>
      }
    >
      <fieldset className="prefs-group">
        <legend>{fr.prefs.units}</legend>
        {(["in", "cm"] as UnitPref[]).map((unit) => (
          <label key={unit} className="radio">
            <input
              type="radio"
              name="unit"
              value={unit}
              checked={prefs.unit === unit}
              data-testid={`unit-${unit}`}
              onChange={() => void onChange({ unit })}
            />
            {unit === "in" ? fr.prefs.inches : fr.prefs.cm}
          </label>
        ))}
        <p className="muted">{fr.prefs.unitsHelp}</p>
      </fieldset>

      <fieldset className="prefs-group">
        <legend>{fr.prefs.colorings}</legend>
        <input
          type="number"
          min={MIN_MAX_COLORINGS}
          max={MAX_MAX_COLORINGS}
          step={1}
          value={session.project.settings.maxColorings}
          data-testid="max-colorings"
          onChange={(e) => changeColorings(e.target.value)}
        />
        <p className="muted">{fr.prefs.coloringsHelp}</p>
      </fieldset>

      <fieldset className="prefs-group">
        <legend>{fr.prefs.printOptions}</legend>
        <label className="field">
          <span className="field-label">{fr.print.setup.minLine}</span>
          <select value={print.minLinePx} data-testid="prefs-min-line" onChange={(e) => printSettings.update({ minLinePx: Number(e.target.value) })}>
            {MIN_LINE_CHOICES.map((n) => (
              <option key={n} value={n}>
                {fr.print.setup.minLinePx(n)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="prefs-group">
        <legend>{fr.prefs.palette}</legend>
        <p className="muted">{fr.prefs.paletteHelp}</p>
        <button type="button" className="btn" data-testid="save-palette" onClick={() => void onSavePalette()}>
          {fr.prefs.paletteSave}
        </button>
      </fieldset>

      <fieldset className="prefs-group">
        <legend>{fr.prefs.restore}</legend>
        <label className="radio">
          <input type="checkbox" checked={alsoPalette} onChange={(e) => setAlsoPalette(e.target.checked)} />
          {fr.prefs.restoreAlso}
        </label>
        <button type="button" className="btn" data-testid="restore-prefs" onClick={() => void onReset(alsoPalette)}>
          {fr.prefs.restore}
        </button>
      </fieldset>
    </Modal>
  );
}
