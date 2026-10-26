// Champs de saisie partagés par les palettes (plan Bloc, plan Image).

import { useEffect, useState } from "react";

/** Champ numérique : valide à Entrée ou en quittant le champ ; une valeur refusée rétablit l'ancienne. */
export function NumberField({
  label,
  value,
  onCommit,
  testId,
  decimals = 2,
  invalid = false,
  title,
  step,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => boolean | void;
  testId: string;
  decimals?: number;
  invalid?: boolean;
  title?: string;
  /** Pas des flèches haut et bas du clavier (sans pas, elles ne font rien). */
  step?: number;
}) {
  const format = (v: number) => String(Math.round(v * 10 ** decimals) / 10 ** decimals).replace(".", ",");
  const [text, setText] = useState(format(value));
  const [focused, setFocused] = useState(false);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (!focused) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);

  const commit = () => {
    const parsed = Number(text.trim().replace(",", "."));
    if (text.trim() === "" || !Number.isFinite(parsed)) {
      setBad(true);
      setText(format(value));
      return;
    }
    const ok = onCommit(parsed);
    setBad(ok === false);
    if (ok === false) setText(format(value));
  };

  return (
    <label className={`field${bad || invalid ? " field--invalid" : ""}`} title={title}>
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        inputMode="decimal"
        value={text}
        data-testid={testId}
        aria-invalid={bad || invalid}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (step && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            e.preventDefault();
            const parsed = Number(text.trim().replace(",", "."));
            const base = Number.isFinite(parsed) ? parsed : value;
            const next = Math.round((base + (e.key === "ArrowUp" ? step : -step)) * 1e6) / 1e6;
            setText(format(next));
            if (onCommit(next) === false) setText(format(value));
          }
        }}
      />
    </label>
  );
}

export function Check({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} data-testid={testId} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
