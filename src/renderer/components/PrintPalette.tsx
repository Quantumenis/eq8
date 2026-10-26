// Onglet IMPRIMER & EXPORTER (SPEC §12.3, §12.4) : les styles d'impression applicables et les exports.

import { fr } from "../i18n/fr";
import { printSettings } from "../printSettings";
import type { PrintKind } from "./PrintDialog";

export interface PrintPaletteProps {
  plan: "quilt" | "block";
  /** Les styles disponibles (les autres sont grisés). */
  enabled: ReadonlySet<PrintKind>;
  /** Texte de l'élément sélectionné (plan Quilt). */
  selection: string | null;
  selectionMode: boolean;
  onPrint: (kind: PrintKind) => void;
  onExportImage: (format?: "svg") => void;
  onToggleSelection: () => void;
}

const QUILT_KINDS: PrintKind[] = ["quilt", "yardage"];
const BLOCK_KINDS: PrintKind[] = ["block", "templates", "foundation", "rotary"];

export function PrintPalette({ plan, enabled, selection, selectionMode, onPrint, onExportImage, onToggleSelection }: PrintPaletteProps) {
  const button = (kind: PrintKind) => (
    <button key={kind} type="button" className="tool-button" data-testid={`print-kind-${kind}`} disabled={!enabled.has(kind)} title={enabled.has(kind) ? undefined : plan === "quilt" ? fr.print.needSelection : fr.print.unavailable} onClick={() => onPrint(kind)}>
      {fr.print.kinds[kind]}
    </button>
  );
  return (
    <>
      <div className="palette-group" role="group" aria-label={fr.print.printTitle} data-testid="print-palette">
        <h3>{fr.print.printTitle}</h3>
        {plan === "quilt" && <div className="tool-grid">{QUILT_KINDS.map(button)}</div>}
        {plan === "quilt" && (
          <>
            <p className="palette-hint">{fr.print.layerHint}</p>
            <p className="palette-hint palette-hint--strong" data-testid="print-selection">
              {selection ?? fr.print.noSelection}
            </p>
          </>
        )}
        <div className="tool-grid">
          {BLOCK_KINDS.map(button)}
          {plan === "quilt" && (["photo", "embroidery"] as PrintKind[]).map(button)}
        </div>
        <div className="button-row">
          <button type="button" className="btn btn--small" data-testid="palette-page-setup" onClick={() => printSettings.openDialog("setup")}>
            {fr.print.setupButton}
          </button>
          <button type="button" className="btn btn--small" data-testid="palette-fonts" onClick={() => printSettings.openDialog("fonts")}>
            {fr.print.fontsButton}
          </button>
        </div>
      </div>
      <div className="palette-group" role="group" aria-label={fr.print.exportTitle}>
        <h3>{fr.print.exportTitle}</h3>
        <div className="tool-grid">
          <button type="button" className="tool-button" data-testid="export-image-open" onClick={() => onExportImage()}>
            {fr.print.exportKinds.image}
          </button>
          <button type="button" className="tool-button" data-testid="export-selection-tool" aria-pressed={selectionMode} onClick={onToggleSelection}>
            {fr.print.exportKinds.selection}
          </button>
          {plan === "block" && (
            <button type="button" className="tool-button" data-testid="export-svg-open" onClick={() => onExportImage("svg")}>
              {fr.print.exportKinds.svg}
            </button>
          )}
        </div>
        {selectionMode && <p className="palette-hint">{fr.print.selection.help}</p>}
      </div>
    </>
  );
}
