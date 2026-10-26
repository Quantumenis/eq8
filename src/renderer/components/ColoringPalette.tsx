import { useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { displayColor, paletteEntries, samePaint, type PaletteEntry, type PaletteTab } from "../../core/draw/coloring";
import { threadDash, threadWidth } from "../../core/draw/threads";
import { MAX_THREAD_WEIGHT, MIN_THREAD_WEIGHT, THREAD_STYLES, type Paint, type Project, type ThreadStroke } from "../../core/project/model";
import { useFabricTiles } from "../fabricTiles";
import { fr } from "../i18n/fr";
import { paintStore, usePaintState } from "../paintStore";
import { swatchStyle } from "../paintView";
import { session } from "../projectSession";

export type ColorTool = "brush" | "spray" | "selectSpray" | "eyedropper" | "fussy" | "threadBrush" | "threadSpray";
const COLOR_TOOLS: ColorTool[] = ["brush", "spray", "selectSpray", "eyedropper", "fussy"];
const THREAD_TOOLS: ColorTool[] = ["threadBrush", "threadSpray"];
const SWATCH_SIZES = [22, 30, 40, 56];

export const isThreadTool = (tool: ColorTool): boolean => tool === "threadBrush" || tool === "threadSpray";

interface Props {
  project: Project;
  tool: ColorTool;
  onTool: (tool: ColorTool) => void;
  /** Nombre de pièces choisies par « Sélectionner & vaporiser ». */
  selectionCount: number;
  /** Un tissu ou une couleur vient d'être choisi dans la palette (ou dans « Récemment utilisés »). */
  onPick: (paint: Paint) => void;
  /** Clic droit sur une couleur de la palette : le menu des couleurs (ajouter, gammes, trier). */
  onColorMenu?: (rgb: string, event: MouseEvent) => void;
}

function paintName(project: Project, paint: Paint): string {
  if (paint.kind === "fabric") return project.sketchbook.fabrics.find((f) => f.id === paint.fabricId)?.card.name || fr.coloring.unnamedFabric;
  return project.sketchbook.colors.find((c) => c.rgb.toLowerCase() === paint.rgb.toLowerCase())?.card.name ?? "";
}

function swatchTitle(name: string, rgb: string): string {
  return fr.coloring.swatchTitle(name, rgb, fr.coloring.rgb(rgb));
}

/** Palette de l'onglet COLORATION : outils de tissu, « Tissus & Couleurs du carnet » et aperçu de la sélection. */
export function ColoringPalette({ project, tool, onTool, selectionCount, onPick, onColorMenu }: Props) {
  const state = usePaintState();
  useFabricTiles();
  const [sizeIndex, setSizeIndex] = useState(1);
  const entries = paletteEntries(project, state.tab);
  const swatch = SWATCH_SIZES[sizeIndex] as number;
  const assets = session.assets;

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
        <span className="palette-subtitle">{fr.coloring.tools.threadTitle}</span>
        <div className="tool-grid">
          {THREAD_TOOLS.map((id) => (
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
                style={swatchStyle(project, assets, paint, 26)}
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
                style={{ ...swatchStyle(project, assets, entry.paint, swatch), height: swatch }}
                title={title}
                aria-label={title}
                data-testid="swatch"
                data-rgb={entry.rgb}
                data-fabric={entry.tab === "fabrics" ? entry.id : undefined}
                onClick={() => pick(entry.paint, entry.tab)}
                onContextMenu={(e) => {
                  if (entry.tab !== "colors" || !onColorMenu) return;
                  e.preventDefault();
                  onColorMenu(entry.rgb, e);
                }}
              />
            );
          })}
        </div>
      </div>

      {isThreadTool(tool) && <ThreadPanel project={project} thread={state.thread} props={state.threadProps} />}

      <SelectionPreview project={project} paint={state.paint} />
    </>
  );
}

/** Aperçu d'un trait de fil (style et épaisseur). */
function ThreadSample({ thread, width = 64 }: { thread: ThreadStroke; width?: number }) {
  const w = threadWidth(thread.weight);
  const dash = threadDash(thread.style, w);
  return (
    <svg width={width} height={14} viewBox={`0 0 ${width} 14`} aria-hidden="true">
      <line x1={4} y1={7} x2={width - 4} y2={7} stroke={thread.rgb} strokeWidth={w} strokeLinecap="round" {...(dash.length > 0 ? { strokeDasharray: dash.join(" ") } : {})} />
    </svg>
  );
}

/** Propriétés du fil (SPEC §5.8, Q-5.2) : couleur (un fil du carnet), style, épaisseur, et ce que le clic change. */
function ThreadPanel({ project, thread, props }: { project: Project; thread: ThreadStroke; props: { color: boolean; style: boolean; weight: boolean } }) {
  const t = fr.coloring.thread;
  return (
    <div className="palette-group" data-testid="thread-panel">
      <h3>{t.title}</h3>
      <div className="thread-props" role="group" aria-label={t.changes}>
        <span className="palette-subtitle">{t.changes}</span>
        {(["color", "style", "weight"] as const).map((key) => (
          <label key={key} className="check">
            <input type="checkbox" checked={props[key]} data-testid={`thread-prop-${key}`} onChange={(e) => paintStore.setThreadProp(key, e.target.checked)} />
            <span>{t.props[key]}</span>
          </label>
        ))}
      </div>
      <span className="palette-subtitle">{t.colors}</span>
      <div className="swatch-grid swatch-grid--threads" role="listbox" aria-label={t.colors} data-testid="thread-swatches">
        {project.sketchbook.threads.length === 0 && <p className="palette-hint">{t.none}</p>}
        {project.sketchbook.threads.map((item) => {
          const current = item.rgb === thread.rgb;
          const title = swatchTitle(item.card.name, item.rgb);
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={current}
              className={`swatch swatch--thread${current ? " swatch--current" : ""}`}
              style={{ background: item.rgb }}
              title={title}
              aria-label={title}
              data-testid="thread-swatch"
              data-rgb={item.rgb}
              onClick={() => paintStore.setThread({ rgb: item.rgb })}
            />
          );
        })}
      </div>
      <span className="palette-subtitle">{t.style}</span>
      <div className="button-grid">
        {THREAD_STYLES.map((style) => (
          <button
            key={style}
            type="button"
            className="tool-button"
            aria-pressed={thread.style === style}
            title={t.styles[style]}
            aria-label={t.styles[style]}
            data-testid={`thread-style-${style}`}
            onClick={() => paintStore.setThread({ style })}
          >
            <ThreadSample thread={{ ...thread, style, rgb: "currentColor" }} width={52} />
          </button>
        ))}
      </div>
      <span className="palette-subtitle">{t.weight}</span>
      <div className="button-grid button-grid--5">
        {Array.from({ length: MAX_THREAD_WEIGHT - MIN_THREAD_WEIGHT + 1 }, (_, i) => i + MIN_THREAD_WEIGHT).map((weight) => (
          <button
            key={weight}
            type="button"
            className="tool-button"
            aria-pressed={thread.weight === weight}
            title={t.weightTitle(weight)}
            data-testid={`thread-weight-${weight}`}
            onClick={() => paintStore.setThread({ weight })}
          >
            {weight}
          </button>
        ))}
      </div>
      <div className="thread-preview" data-testid="thread-preview">
        <ThreadSample thread={thread} width={140} />
      </div>
    </div>
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
    <div className="preview-swatch" style={rgb ? swatchStyle(project, session.assets, paint, 120) : undefined} data-testid="preview-swatch" data-rgb={rgb ?? ""} title={label}>
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
