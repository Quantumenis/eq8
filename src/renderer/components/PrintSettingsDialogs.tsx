// Mise en page (SPEC §9.13) et Polices de l'imprimante (§9.12), ouvertes par le menu Fichier ou les boîtes d'impression.

import { useState } from "react";
import { DEFAULT_FONTS, FONT_FAMILIES, FONT_ROLES, rectPath, type PrintDoc } from "../../core/print/display";
import { defaultPageSetup, MAX_MARGIN, MIN_MARGIN, PAPER_IDS, pageSize, type PageSetup, type PaperId } from "../../core/print/paper";
import { fromInches, toInches, type DisplayUnit } from "../../core/units";
import { fr } from "../i18n/fr";
import { printDoc } from "../printOutput";
import { FONT_SIZES, MIN_LINE_CHOICES, printSettings, usePrintSettings } from "../printSettings";
import { useSession } from "../projectSession";
import { Modal } from "./Modal";
import { NumberField } from "./fields";

export function PageSetupDialog({ unit, notify }: { unit: DisplayUnit; notify: (m: string) => void }) {
  const s = usePrintSettings();
  const current = useSession();
  const setup = s.setup;
  const update = (patch: Partial<PageSetup>) => printSettings.update({ setup: { ...setup, ...patch } });
  const margin = (side: keyof PageSetup["margins"]) => (
    <NumberField
      label={fr.print.setup[side]}
      value={Math.round(fromInches(setup.margins[side], unit) * 1000) / 1000}
      decimals={3}
      testId={`setup-margin-${side}`}
      onCommit={(n) => {
        const v = toInches(n, unit);
        if (!(v >= MIN_MARGIN - 1e-9 && v <= MAX_MARGIN + 1e-9)) return false;
        update({ margins: { ...setup.margins, [side]: v } });
        return true;
      }}
    />
  );
  const testPage = async () => {
    const size = pageSize(setup);
    const x = setup.margins.left + 0.5;
    const y = setup.margins.top + 0.8;
    const doc: PrintDoc = {
      title: fr.print.setup.testPage,
      pages: [
        {
          ...size,
          items: [
            { kind: "text", x, y: y - 0.3, text: fr.print.setup.testPage, role: "header" },
            { kind: "path", d: rectPath(x, y, 1, 1), stroke: { rgb: "#000000", width: 0.75, join: "miter" } },
            { kind: "text", x: x + 0.5, y: y + 1.25, text: "1 po", role: "number", align: "center" },
            { kind: "path", d: rectPath(x + 2, y, 2 / 2.54, 2 / 2.54), stroke: { rgb: "#000000", width: 0.75, join: "miter" } },
            { kind: "text", x: x + 2 + 1 / 2.54, y: y + 1.25, text: "2 cm", role: "number", align: "center" },
          ],
        },
      ],
    };
    const r = await printDoc(doc, current.project, current.assets, s.fonts, 1);
    notify(r.ok ? fr.print.printed : r.error === "cancelled" ? fr.print.printCancelled : fr.print.printFailed);
  };
  return (
    <Modal
      title={fr.print.setup.title}
      size="narrow"
      testId="page-setup"
      onClose={() => printSettings.closeDialog()}
      footer={
        <>
          <button type="button" className="btn" data-testid="setup-reset" onClick={() => printSettings.update({ setup: defaultPageSetup(s.country), minLinePx: 1 })}>
            {fr.print.setup.reset}
          </button>
          <button type="button" className="btn" onClick={() => void testPage()}>
            {fr.print.setup.testPage}
          </button>
          <button type="button" className="btn btn--primary" data-autofocus onClick={() => printSettings.closeDialog()}>
            {fr.print.close}
          </button>
        </>
      }
    >
      <fieldset className="prefs-group">
        <legend>{fr.print.setup.paper}</legend>
        <select value={setup.paper} data-testid="setup-paper" onChange={(e) => update({ paper: e.target.value as PaperId })}>
          {PAPER_IDS.map((id) => (
            <option key={id} value={id}>
              {fr.print.setup.papers[id]}
            </option>
          ))}
        </select>
      </fieldset>
      <fieldset className="prefs-group">
        <legend>{fr.print.setup.orientation}</legend>
        {(["portrait", "landscape"] as const).map((o) => (
          <label key={o} className="radio">
            <input type="radio" name="orientation" checked={setup.orientation === o} data-testid={`setup-${o}`} onChange={() => update({ orientation: o })} />
            {fr.print.setup[o]}
          </label>
        ))}
      </fieldset>
      <fieldset className="prefs-group">
        <legend>{fr.print.setup.margins}</legend>
        <div className="button-row">
          {margin("left")}
          {margin("right")}
        </div>
        <div className="button-row">
          {margin("top")}
          {margin("bottom")}
        </div>
        <p className="muted">{fr.print.setup.marginsHelp}</p>
      </fieldset>
      <fieldset className="prefs-group">
        <legend>{fr.print.setup.minLine}</legend>
        <select value={s.minLinePx} data-testid="setup-min-line" onChange={(e) => printSettings.update({ minLinePx: Number(e.target.value) })}>
          {MIN_LINE_CHOICES.map((n) => (
            <option key={n} value={n}>
              {fr.print.setup.minLinePx(n)}
            </option>
          ))}
        </select>
      </fieldset>
    </Modal>
  );
}

export function FontsDialog() {
  const s = usePrintSettings();
  const [fonts, setFonts] = useState(s.fonts);
  const change = (next: typeof fonts) => {
    setFonts(next);
    printSettings.update({ fonts: next });
  };
  return (
    <Modal
      title={fr.print.fonts.title}
      size="medium"
      testId="print-fonts-dialog"
      onClose={() => printSettings.closeDialog()}
      footer={
        <>
          <button type="button" className="btn" data-testid="fonts-reset" onClick={() => change(DEFAULT_FONTS)}>
            {fr.print.fonts.reset}
          </button>
          <button type="button" className="btn btn--primary" data-autofocus onClick={() => printSettings.closeDialog()}>
            {fr.print.close}
          </button>
        </>
      }
    >
      <table className="fonts-table">
        <thead>
          <tr>
            <th />
            <th>{fr.print.fonts.family}</th>
            <th>{fr.print.fonts.size}</th>
          </tr>
        </thead>
        <tbody>
          {FONT_ROLES.map((role) => (
            <tr key={role}>
              <td>{fr.print.fonts.roles[role]}</td>
              <td>
                <select value={fonts[role].family} data-testid={`font-${role}-family`} onChange={(e) => change({ ...fonts, [role]: { ...fonts[role], family: e.target.value } })}>
                  {FONT_FAMILIES.map((f) => (
                    <option key={f} value={f} style={{ fontFamily: f }}>
                      {f}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select value={fonts[role].size} data-testid={`font-${role}-size`} onChange={(e) => change({ ...fonts, [role]: { ...fonts[role], size: Number(e.target.value) } })}>
                  {FONT_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n} pt
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{fr.print.fonts.help}</p>
    </Modal>
  );
}
