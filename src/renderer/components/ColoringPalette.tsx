import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { displayColor, paletteEntries, samePaint, type PaletteEntry, type PaletteTab } from "../../core/draw/coloring";
import type { Paint, Project } from "../../core/project/model";
import { fr } from "../i18n/fr";
import { paintStore, usePaintState } from "../paintStore";

export type ColorTool = "brush" | "spray" | "selectSpray" | "eyedropper";
const COLOR_TOOLS: ColorTool[] = ["brush", "spray", "selectSpray", "eyedropper"];
const SWATCH_SIZES = [22, 30, 40, 56];

interface Props {
  project: Project;
  tool: ColorTool;
  onTool: (tool: ColorTool) => void;
  /** Nombre de pièces choisies par « Sélectionner & vaporiser ». */
  selectionCount: number;
  /** Un tissu ou une couleur vient d'être choisi dans la palette (ou dans « Récemment utilisés »). */
  onPick: (paint: Paint) => void;
}

function paintName(project: Project, paint: Paint): string {
  if (paint.kind === "fabric") return project.sketchbook.fabrics.find((f) => f.id === paint.fabricId)?.card.name || fr.coloring.unnamedFabric;
  return project.sketchbook.colors.find((c) => c.rgb.toLowerCase() === paint.rgb.toLowerCase())?.card.name ?? "";
}

function swatchTitle(name: string, rgb: string): string {
  return fr.coloring.swatchTitle(name, rgb, fr.coloring.rgb(rgb));
}

/** Palette de l'onglet COLORATION : outils de tissu, « Tissus & Couleurs du carnet » et aperçu de la sélection. */
export function ColoringPalette({ project, tool, onTool, selectionCount, onPick }: Props) {
  const state = usePaintState();
  const [sizeIndex, setSizeIndex] = useState(1);
  const entries = paletteEntries(project, state.tab);
  const swatch = SWATCH_SIZES[sizeIndex] as number;

  const pick = (paint: Paint, tab?: PaletteTab) => {
    paintStore.choose(paint, tab);
    onPick(paint);
  };

  return (
    <>
      <div className="palette-group" role="group" aria-label={fr.coloring.tools.title}>
        <div className="tool-grid">
          {COLOR_TOOLS.map((id) => (
            <button key={id} type="button" className="tool-button" data-testid={`ctool-${id}`} aria-pressed={tool === id} onClick={() => onTool(id)}>
              {fr.coloring.tools[id]}
            </button>
          ))}
        </div>
        <p className="palette-hint">{fr.coloring.toolHelp[tool]}</p>
        {tool === "selectSpray" && selectionCount > 0 && (
          <p className="palette-hint palette-hint--strong" data-testid="spray-selection">
            {fr.coloring.selected(selectionCount)}
          </p>
        )}
      </div>

      <div className="palette-group">
        <h3>{fr.coloring.palette}</h3>
        <span className="palette-subtitle">{fr.coloring.recent}</span>
        <div className={`recent-strip${state.recent.length === 0 ? " recent-strip--empty" : ""}`} data-testid="recent-strip">
          {state.recent.length === 0 && <span>{fr.coloring.recentEmpty}</span>}
          {state.recent.map((paint, i) => {
            const rgb = displayColor(project, paint) ?? "#9e9e9e";
            return (
              <button
                key={i}
                type="button"
                className="swatch swatch--recent"
                style={{ background: rgb }}
                title={swatchTitle(paintName(project, paint), rgb)}
                aria-label={swatchTitle(paintName(project, paint), rgb)}
                data-testid="recent-swatch"
                onClick={() => pick(paint, paint.kind === "fabric" ? "fabrics" : "colors")}
              />
            );
          })}
        </div>

        <div className="palette-tabs" role="tablist" aria-label={fr.coloring.palette}>
          {(["fabrics", "colors"] as PaletteTab[]).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={state.tab === tab} data-testid={`ptab-${tab}`} onClick={() => paintStore.setTab(tab)}>
              {fr.coloring.tabs[tab]}
            </button>
          ))}
          <span className="palette-tabs-spacer" />
          <button type="button" className="btn btn--tiny" title={fr.coloring.smaller} aria-label={fr.coloring.smaller} disabled={sizeIndex === 0} onClick={() => setSizeIndex((i) => i - 1)}>
            −
          </button>
          <button
            type="button"
            className="btn btn--tiny"
            title={fr.coloring.larger}
            aria-label={fr.coloring.larger}
            disabled={sizeIndex === SWATCH_SIZES.length - 1}
            onClick={() => setSizeIndex((i) => i + 1)}
          >
            +
          </button>
        </div>
        <div className="swatch-grid" role="listbox" aria-label={fr.coloring.tabs[state.tab]} data-testid="swatch-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${swatch}px, 1fr))` }}>
          {entries.length === 0 && <p className="palette-hint">{state.tab === "fabrics" ? fr.coloring.noFabrics : fr.coloring.noColors}</p>}
          {entries.map((entry: PaletteEntry) => {
            const title = swatchTitle(entry.name, entry.rgb);
            const current = samePaint(state.paint ?? undefined, entry.paint);
            return (
              <button
                key={entry.id}
                type="button"
                role="option"
                aria-selected={current}
                className={`swatch${current ? " swatch--current" : ""}`}
                style={{ background: entry.rgb, height: swatch }}
                title={title}
                aria-label={title}
                data-testid="swatch"
                data-rgb={entry.rgb}
                onClick={() => pick(entry.paint, entry.tab)}
              />
            );
          })}
        </div>
      </div>

      <SelectionPreview project={project} paint={state.paint} />
    </>
  );
}

/** Aperçu du tissu ou de la couleur courant ; détachable en fenêtre flottante, déplaçable et redimensionnable. */
function SelectionPreview({ project, paint }: { project: Project; paint: Paint | null }) {
  const [detached, setDetached] = useState(false);
  const [pos, setPos] = useState({ x: 320, y: 140 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const rgb = paint ? displayColor(project, paint) : null;
  const name = paint ? paintName(project, paint) : "";
  const label = rgb ? swatchTitle(name, rgb) : fr.coloring.none;

  const swatchView = (
    <div className="preview-swatch" style={rgb ? { background: rgb } : undefined} data-testid="preview-swatch" data-rgb={rgb ?? ""} title={label}>
      {!rgb && <span>{fr.coloring.none}</span>}
    </div>
  );

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setPos({ x: Math.max(0, Math.min(window.innerWidth - 80, e.clientX - d.dx)), y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - d.dy)) });
  };

  if (detached) {
    return (
      <div className="preview-float" style={{ left: pos.x, top: pos.y }} role="dialog" aria-label={fr.coloring.preview} data-testid="preview-float">
        <div className="preview-float-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
          <span>{fr.coloring.preview}</span>
          <button type="button" className="btn btn--tiny" title={fr.coloring.attach} aria-label={fr.coloring.attach} data-testid="preview-attach" onClick={() => setDetached(false)}>
            ×
          </button>
        </div>
        {swatchView}
        <p className="preview-caption">{label}</p>
      </div>
    );
  }
  return (
    <div className="palette-group">
      <div className="preview-head">
        <h3>{fr.coloring.preview}</h3>
        <button type="button" className="btn btn--tiny" title={fr.coloring.detach} aria-label={fr.coloring.detach} data-testid="preview-detach" onClick={() => setDetached(true)}>
          ↗
        </button>
      </div>
      {swatchView}
      <p className="preview-caption">{label}</p>
    </div>
  );
}
