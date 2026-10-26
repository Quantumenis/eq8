// Palettes de dessin de PolyDraw et de l'applique (onglet DESSIN du plan Bloc) : outils, options, sélection, édition des
// nœuds, créateurs de pièces et couronne. La logique est dans le cœur ; ici on ne fait que brancher les boutons.

import { useMemo, useState, type ReactNode } from "react";
import {
  centerInBlock,
  cloneShapes,
  convertSegment,
  cutAt,
  deleteNode,
  deleteShapes,
  insideBlock,
  joinNodes,
  makeShape,
  mirrorMat,
  reorderShapes,
  rotateAbout,
  scaleAbout,
  selectionBox,
  setNodeType,
  addNodeAt,
  transformShapes,
  translateShapes,
  wreath,
  MAX_WREATH_COUNT,
  MIN_WREATH_COUNT,
  type AppShape,
  type NodeRef,
  type NodeType,
  type ShapeMirror,
  NODE_TYPES,
} from "../../core/draw/applique";
import {
  BRUSH_CAPS,
  BRUSH_CONTOURS,
  FORM_IDS,
  OVAL_FORMS,
  POLYGON_FORMS,
  POSIE_PRESETS,
  SWATH_STYLES,
  DEFAULT_STAR,
  DEFAULT_STENCIL,
  posieParams,
  posieShapes,
  starShape,
  stencilShapes,
  type PosieParams,
  type StarParams,
  type StencilParams,
} from "../../core/draw/appliqueShapes";
import type { BlockDraft } from "../../core/draw/draft";
import type { Rect } from "../../core/draw/geometry";
import { GRID_KINDS, GRID_LIMITS, clonePolyPieces, deletePolyPieces, gridRotation, mirrorPolyPieces, polyContent, setGrid, type GridKind } from "../../core/draw/polydraw";
import type { Id } from "../../core/project/model";
import { fromInches, toInches, type DisplayUnit } from "../../core/units";
import { fr } from "../i18n/fr";
import type { AppliqueTool, PolyTool, ShapeOptions } from "../shapeGestures";
import { Check, NumberField } from "./fields";

interface Common {
  draft: BlockDraft;
  run: (label: string, change: (d: BlockDraft) => BlockDraft) => boolean;
  selection: readonly Id[];
  setPicked: (ids: readonly Id[]) => void;
  unit: DisplayUnit;
  notify: (message: string) => void;
}

const POLY_TOOLS: PolyTool[] = ["ppick", "pedit", "polyline", "polyarc"];
const toolLabel: Record<PolyTool, string> = { ppick: fr.shape.tools.pick, pedit: fr.shape.tools.edit, polyline: fr.shape.tools.polyline, polyarc: fr.shape.tools.polyarc };

function Group({ title, children, testId }: { title?: string; children: ReactNode; testId?: string }) {
  return (
    <div className="palette-group" data-testid={testId}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// PolyDraw

export function PolyPanel({ draft, run, selection, setPicked, tool, onTool, notify }: Common & { tool: PolyTool; onTool: (t: PolyTool) => void }) {
  const grid = draft.poly.grid;
  const [ca, cb] = fr.shape.grid.counters[grid.kind];
  const content = useMemo(() => polyContent(draft.poly.pieces, draft.width, draft.height), [draft.poly.pieces, draft.width, draft.height]);
  const ids = new Set(selection);
  const rotation = gridRotation(grid);
  const needSelection = () => notify(fr.shape.selection.needSelection);
  return (
    <>
      <Group title={fr.shape.grid.title}>
        <select
          className="select"
          value={grid.kind}
          data-testid="grid-kind"
          aria-label={fr.shape.grid.title}
          onChange={(e) => {
            const kind = e.target.value as GridKind;
            run(fr.shape.history.grid, (d) => ({ ...d, poly: setGrid(d.poly, { kind, a: DEFAULT_GRID_COUNTS[kind][0], b: DEFAULT_GRID_COUNTS[kind][1] }) }));
          }}
        >
          {GRID_KINDS.map((k) => (
            <option key={k} value={k}>
              {fr.shape.grid.kinds[k]}
            </option>
          ))}
        </select>
        <div className="field-row">
          <NumberField label={ca} value={grid.a} decimals={0} testId="grid-a" onCommit={(n) => counter(run, grid.kind, n, grid.b)} />
          <NumberField label={cb} value={grid.b} decimals={0} testId="grid-b" onCommit={(n) => counter(run, grid.kind, grid.a, n, true)} />
        </div>
        <p className="palette-hint">{fr.shape.grid.help}</p>
        <p className="palette-hint" data-testid="poly-coverage" data-coverage={content.coverage.toFixed(4)}>
          {draft.poly.pieces.length === 0 ? "" : content.overlap ? fr.shape.grid.overlap : content.coverage < 0.9999 ? `${fr.shape.grid.coverage(Math.round(content.coverage * 100))}. ${fr.shape.grid.incomplete}` : fr.shape.grid.coverage(100)}
        </p>
      </Group>
      <Group title={fr.shape.tools.title}>
        <div className="tool-grid" role="group" aria-label={fr.shape.tools.title}>
          {POLY_TOOLS.map((t) => (
            <button key={t} type="button" className="tool-button" data-testid={`tool-${t}`} aria-pressed={tool === t} onClick={() => onTool(t)}>
              {toolLabel[t]}
            </button>
          ))}
        </div>
        <p className="palette-hint">{fr.shape.toolHelp[tool]}</p>
      </Group>
      {(tool === "ppick" || tool === "pedit") && (
        <Group title={fr.shape.selection.title}>
          <p className="palette-hint" data-testid="selection-count">
            {fr.shape.selection.countPieces(selection.length)}
          </p>
          <div className="button-grid">
            <button type="button" className="btn btn--small" data-testid="poly-mirror-lr" onClick={() => (selection.length ? run(fr.shape.history.polyMirror, (d) => ({ ...d, poly: mirrorPolyPieces(d.poly, ids, "lr", d.width, d.height) })) : needSelection())}>
              {fr.shape.selection.lr}
            </button>
            <button type="button" className="btn btn--small" data-testid="poly-mirror-tb" onClick={() => (selection.length ? run(fr.shape.history.polyMirror, (d) => ({ ...d, poly: mirrorPolyPieces(d.poly, ids, "tb", d.width, d.height) })) : needSelection())}>
              {fr.shape.selection.tb}
            </button>
          </div>
          <div className="button-grid">
            <button
              type="button"
              className="btn btn--small"
              data-testid="poly-clone"
              onClick={() => {
                if (!selection.length) return needSelection();
                let created: Id[] = [];
                run(fr.shape.history.clone, (d) => {
                  const r = clonePolyPieces(d.poly, ids, d.width, d.height, false);
                  created = r.ids;
                  return { ...d, poly: r.state };
                });
                setPicked(created);
              }}
            >
              {fr.shape.selection.clone}
            </button>
            <button
              type="button"
              className="btn btn--small"
              data-testid="poly-clone-rotate"
              onClick={() => {
                if (!selection.length) return needSelection();
                let created: Id[] = [];
                run(fr.shape.history.clone, (d) => {
                  const r = clonePolyPieces(d.poly, ids, d.width, d.height, true);
                  created = r.ids;
                  return { ...d, poly: r.state };
                });
                setPicked(created);
              }}
            >
              {fr.shape.selection.cloneRotate(rotation)}
            </button>
          </div>
          <button
            type="button"
            className="btn btn--small"
            data-testid="poly-delete"
            disabled={selection.length === 0}
            onClick={() => {
              run(fr.shape.history.remove, (d) => ({ ...d, poly: deletePolyPieces(d.poly, ids) }));
              setPicked([]);
            }}
          >
            {fr.shape.selection.remove}
          </button>
        </Group>
      )}
    </>
  );
}

const DEFAULT_GRID_COUNTS: Record<GridKind, [number, number]> = {
  rect: [24, 24],
  circle: [4, 8],
  arc: [4, 6],
  star8: [2, 2],
  kaleido: [4, 2],
  octagon: [3, 2],
};

function counter(run: Common["run"], kind: GridKind, a: number, b: number, second = false): boolean {
  const lo = kind === "circle" && second ? 2 : GRID_LIMITS.min;
  const ok = (n: number) => Number.isInteger(n) && n >= lo && n <= GRID_LIMITS.max;
  if (!ok(second ? b : a)) return false;
  run(fr.shape.history.grid, (d) => ({ ...d, poly: setGrid(d.poly, { kind, a, b }) }));
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Applique

const DRAW_TOOLS: AppliqueTool[] = ["dline", "dbezier", "dfree", "dbrush", "dswath"];
const isDraw = (t: AppliqueTool): boolean => DRAW_TOOLS.includes(t);
const drawLabel: Record<string, string> = { dline: fr.shape.draw.line, dbezier: fr.shape.draw.bezier, dfree: fr.shape.draw.free, dbrush: fr.shape.draw.brush, dswath: fr.shape.draw.swath };

export type MakerKind = "star" | "posie" | "stencil";
export interface MakerState {
  active: MakerKind | null;
  star: StarParams;
  posie: PosieParams & { preset: string };
  stencil: StencilParams;
}

export const initialMaker = (): MakerState => ({
  active: null,
  star: { ...DEFAULT_STAR },
  posie: { ...posieParams(POSIE_PRESETS[0] as (typeof POSIE_PRESETS)[number]), preset: (POSIE_PRESETS[0] as (typeof POSIE_PRESETS)[number]).id },
  stencil: { ...DEFAULT_STENCIL },
});

/** Les formes d'un créateur, selon ses paramètres (aperçu en direct et ajout). */
export function makerShapes(m: MakerState, width: number, height: number): AppShape[] {
  if (m.active === "star") return [starShape(width, height, m.star)];
  if (m.active === "posie") return posieShapes(width, height, m.posie);
  if (m.active === "stencil") return stencilShapes(width, height, m.stencil);
  return [];
}

interface AppliqueProps extends Common {
  tool: AppliqueTool;
  onTool: (t: AppliqueTool) => void;
  options: ShapeOptions;
  onOptions: (o: ShapeOptions) => void;
  pickedNodes: readonly NodeRef[];
  onPickNodes: (n: readonly NodeRef[]) => void;
  maker: MakerState;
  onMaker: (m: MakerState) => void;
  isMotif: boolean;
}

export function AppliquePanel(p: AppliqueProps) {
  const { draft, run, selection, setPicked, unit, notify, tool, onTool, options, onOptions } = p;
  const ids = useMemo(() => new Set(selection), [selection]);
  const chosen = draft.shapes.filter((s) => ids.has(s.id));
  const box = selectionBox(draft.shapes, ids);
  const [angle, setAngle] = useState(45);
  const [percent, setPercent] = useState(100);
  const [wreathParams, setWreathParams] = useState({ count: 8, spacing: 50, size: 100 });
  const inUnit = (v: number) => Math.round(fromInches(v, unit) * 1e4) / 1e4;

  const transform = (label: string, make: (b: Rect) => readonly [number, number, number, number, number, number]): boolean => {
    if (!box || selection.length === 0) {
      notify(fr.shape.selection.needSelection);
      return false;
    }
    const m = make(box);
    const next = transformShapes(draft.shapes, ids, m);
    if (!insideBlock(next.filter((s) => ids.has(s.id)), draft.width, draft.height)) {
      notify(fr.shape.selection.outside);
      return false;
    }
    return run(label, (d) => ({ ...d, shapes: transformShapes(d.shapes, ids, m) }));
  };
  const center = (b: Rect) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });

  const setTool = (t: AppliqueTool) => {
    p.onPickNodes([]);
    onTool(t);
  };
  const lastDraw = isDraw(tool) ? tool : "dline";

  // ---- Nœuds -------------------------------------------------------------------------------------------------------
  const picked = p.pickedNodes;
  const editShape = picked.length > 0 ? draft.shapes.find((s) => s.id === picked[0]?.shape) : undefined;
  const nodeOp = (label: string, fn: (shape: AppShape, nodes: number[]) => AppShape | AppShape[] | null): void => {
    if (!editShape) return notify(fr.shape.nodes.needNode);
    const nodes = picked.filter((n) => n.shape === editShape.id).map((n) => n.node).sort((a, b) => b - a);
    run(label, (d) => {
      const out: AppShape[] = [];
      for (const s of d.shapes) {
        if (s.id !== editShape.id) out.push(s);
        else {
          const r = fn(s, nodes);
          if (r === null) continue;
          out.push(...(Array.isArray(r) ? r : [r]));
        }
      }
      return { ...d, shapes: out };
    });
  };

  return (
    <>
      <Group title={fr.shape.tools.title}>
        <div className="tool-grid" role="group" aria-label={fr.shape.tools.title}>
          <button type="button" className="tool-button" data-testid="tool-apick" aria-pressed={tool === "apick"} onClick={() => setTool("apick")}>
            {fr.shape.tools.pick}
          </button>
          <button type="button" className="tool-button" data-testid="tool-aedit" aria-pressed={tool === "aedit"} onClick={() => setTool("aedit")}>
            {fr.shape.tools.edit}
          </button>
          <button type="button" className="tool-button" data-testid="tool-draw" aria-pressed={isDraw(tool)} onClick={() => setTool(lastDraw)}>
            {fr.shape.tools.draw}
          </button>
          <button type="button" className="tool-button" data-testid="tool-ellipse" aria-pressed={tool === "ellipse"} onClick={() => setTool("ellipse")}>
            {fr.shape.tools.ellipse}
          </button>
          <button type="button" className="tool-button" data-testid="tool-rect" aria-pressed={tool === "rect"} onClick={() => setTool("rect")}>
            {fr.shape.tools.rect}
          </button>
          <button type="button" className="tool-button" data-testid="tool-form" aria-pressed={tool === "form"} onClick={() => setTool("form")}>
            {fr.shape.tools.forms}
          </button>
        </div>
        {isDraw(tool) && (
          <div className="tool-grid tool-grid--sub" role="group" aria-label={fr.shape.tools.draw}>
            {DRAW_TOOLS.map((t) => (
              <button key={t} type="button" className="tool-button" data-testid={`tool-${t}`} aria-pressed={tool === t} onClick={() => setTool(t)}>
                {drawLabel[t]}
              </button>
            ))}
          </div>
        )}
        <p className="palette-hint">{fr.shape.toolHelp[tool]}</p>
      </Group>

      {tool === "dfree" && (
        <Group title={fr.shape.looseness.title}>
          <label className="field">
            <span className="field-label">
              {fr.shape.looseness.better} ↔ {fr.shape.looseness.looser}
            </span>
            <input type="range" min={0} max={100} value={Math.round(options.looseness * 100)} data-testid="looseness" onChange={(e) => onOptions({ ...options, looseness: Number(e.target.value) / 100 })} />
          </label>
        </Group>
      )}

      {(tool === "dbrush" || tool === "dswath") && (
        <Group title={tool === "dbrush" ? fr.shape.brush.title : fr.shape.swath.title}>
          {tool === "dswath" && (
            <label className="field">
              <span className="field-label">{fr.shape.swath.style}</span>
              <select value={options.swath.style} data-testid="swath-style" onChange={(e) => onOptions({ ...options, swath: { ...options.swath, style: e.target.value as ShapeOptions["swath"]["style"] } })}>
                {SWATH_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {fr.shape.swath.styles[s]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span className="field-label">{fr.shape.brush.contour}</span>
            <select
              value={tool === "dbrush" ? options.brush.contour : options.swath.contour}
              data-testid="brush-contour"
              onChange={(e) => {
                const contour = e.target.value as ShapeOptions["brush"]["contour"];
                onOptions(tool === "dbrush" ? { ...options, brush: { ...options.brush, contour } } : { ...options, swath: { ...options.swath, contour } });
              }}
            >
              {BRUSH_CONTOURS.map((c) => (
                <option key={c} value={c}>
                  {fr.shape.brush.contours[c]}
                </option>
              ))}
            </select>
          </label>
          {tool === "dbrush" && (
            <label className="field">
              <span className="field-label">{fr.shape.brush.caps}</span>
              <select value={options.brush.caps} data-testid="brush-caps" onChange={(e) => onOptions({ ...options, brush: { ...options.brush, caps: e.target.value as ShapeOptions["brush"]["caps"] } })}>
                {BRUSH_CAPS.map((c) => (
                  <option key={c} value={c}>
                    {fr.shape.brush.capNames[c]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <NumberField
            label={fr.shape.brush.minWidth}
            value={inUnit(tool === "dbrush" ? options.brush.minWidth : options.swath.minWidth)}
            testId="brush-min"
            onCommit={(n) => {
              const v = toInches(n, unit);
              if (!(v >= 0 && v < 2)) return false;
              onOptions(tool === "dbrush" ? { ...options, brush: { ...options.brush, minWidth: v } } : { ...options, swath: { ...options.swath, minWidth: v } });
              return true;
            }}
          />
          <NumberField
            label={fr.shape.brush.boldness}
            value={tool === "dbrush" ? options.brush.boldness : options.swath.boldness}
            decimals={1}
            testId="brush-bold"
            onCommit={(n) => {
              if (!(n >= 1 && n <= 20)) return false;
              onOptions(tool === "dbrush" ? { ...options, brush: { ...options.brush, boldness: n } } : { ...options, swath: { ...options.swath, boldness: n } });
              return true;
            }}
          />
        </Group>
      )}

      {tool === "ellipse" && (
        <Group title={fr.shape.ellipseOptions.title} testId="ellipse-options">
          <label className="field">
            <span className="field-label">{fr.shape.ellipseOptions.kind}</span>
            <select value={options.ellipse.kind} data-testid="ellipse-kind" onChange={(e) => onOptions({ ...options, ellipse: { ...options.ellipse, kind: e.target.value as ShapeOptions["ellipse"]["kind"] } })}>
              {(["ellipse", "pie", "arc"] as const).map((k) => (
                <option key={k} value={k}>
                  {fr.shape.ellipseOptions.kinds[k]}
                </option>
              ))}
            </select>
          </label>
          {options.ellipse.kind !== "ellipse" && (
            <div className="field-row">
              <NumberField label={fr.shape.ellipseOptions.start} value={options.ellipse.start} decimals={0} testId="ellipse-start" onCommit={(n) => (onOptions({ ...options, ellipse: { ...options.ellipse, start: n } }), true)} />
              <NumberField label={fr.shape.ellipseOptions.end} value={options.ellipse.end} decimals={0} testId="ellipse-end" onCommit={(n) => (onOptions({ ...options, ellipse: { ...options.ellipse, end: n } }), true)} />
            </div>
          )}
          <div className="field-row">
            <NumberField label={fr.shape.ellipseOptions.sections} value={options.ellipse.sections} decimals={0} testId="ellipse-sections" onCommit={(n) => (Number.isInteger(n) && n >= 1 && n <= 60 ? (onOptions({ ...options, ellipse: { ...options.ellipse, sections: n } }), true) : false)} />
            <label className="field">
              <span className="field-label">{fr.shape.ellipseOptions.mode}</span>
              <select value={options.ellipse.mode} data-testid="ellipse-mode" onChange={(e) => onOptions({ ...options, ellipse: { ...options.ellipse, mode: e.target.value as ShapeOptions["ellipse"]["mode"] } })}>
                {(["partition", "stagger"] as const).map((m) => (
                  <option key={m} value={m}>
                    {fr.shape.ellipseOptions.modes[m]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Group>
      )}

      {tool === "rect" && (
        <Group title={fr.shape.rectOptions.title}>
          <Check label={fr.shape.rectOptions.rounded} checked={options.radius > 0} testId="rect-rounded" onChange={(on) => onOptions({ ...options, radius: on ? Math.max(0.25, options.radius) : 0 })} />
          {options.radius > 0 && (
            <NumberField
              label={fr.shape.rectOptions.radius}
              value={inUnit(options.radius)}
              testId="rect-radius"
              onCommit={(n) => {
                const v = toInches(n, unit);
                if (!(v > 0 && v < 20)) return false;
                onOptions({ ...options, radius: v });
                return true;
              }}
            />
          )}
        </Group>
      )}

      {tool === "form" && (
        <Group title={fr.shape.forms.title} testId="forms-palette">
          {([["ovals", OVAL_FORMS], ["polygons", POLYGON_FORMS]] as const).map(([kind, list]) => (
            <div key={kind}>
              <span className="palette-subtitle">{fr.shape.forms[kind]}</span>
              <div className="tool-grid tool-grid--forms">
                {list.map((f) => (
                  <button key={f} type="button" className="tool-button tool-button--small" data-testid={`form-${f}`} aria-pressed={options.form === f} title={fr.shape.forms.names[f]} onClick={() => onOptions({ ...options, form: f })}>
                    {fr.shape.forms.names[f]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="palette-hint">{FORM_IDS.length} formes</p>
        </Group>
      )}

      {tool === "apick" && (
        <Group title={fr.shape.selection.title} testId="shape-selection">
          <p className="palette-hint" data-testid="selection-count">
            {fr.shape.selection.count(selection.length)}
          </p>
          <div className="field-row">
            <NumberField label={fr.shape.selection.x} value={box ? inUnit(box.x0) : 0} testId="sel-x" onCommit={(n) => moveTo(n, undefined)} />
            <NumberField label={fr.shape.selection.y} value={box ? inUnit(box.y0) : 0} testId="sel-y" onCommit={(n) => moveTo(undefined, n)} />
          </div>
          <div className="field-row">
            <NumberField label={fr.shape.selection.width} value={box ? inUnit(box.x1 - box.x0) : 0} testId="sel-w" onCommit={(n) => resizeTo(n, undefined)} />
            <NumberField label={fr.shape.selection.height} value={box ? inUnit(box.y1 - box.y0) : 0} testId="sel-h" onCommit={(n) => resizeTo(undefined, n)} />
          </div>
          <div className="field-row">
            <NumberField label={fr.shape.selection.resize} value={percent} decimals={1} testId="sel-percent" onCommit={(n) => (n > 0 ? (setPercent(n), true) : false)} />
            <button type="button" className="btn btn--small" data-testid="sel-resize" onClick={() => transform(fr.shape.history.transform, (b) => scaleAbout(percent / 100, percent / 100, center(b)))}>
              {fr.shape.selection.apply}
            </button>
          </div>
          <div className="field-row">
            <NumberField label={fr.shape.selection.rotate} value={angle} decimals={1} testId="sel-angle" onCommit={(n) => (Number.isFinite(n) ? (setAngle(n), true) : false)} />
            <button type="button" className="btn btn--small" data-testid="sel-rotate" onClick={() => transform(fr.shape.history.transform, (b) => rotateAbout(angle, center(b)))}>
              {fr.shape.selection.apply}
            </button>
          </div>
          <div className="button-grid">
            {[90, 180, 270].map((deg) => (
              <button key={deg} type="button" className="btn btn--small" data-testid={`sel-rotate-${deg}`} onClick={() => transform(fr.shape.history.transform, (b) => rotateAbout(deg, center(b)))}>
                {deg}°
              </button>
            ))}
          </div>
          <span className="palette-subtitle">{fr.shape.selection.mirrors}</span>
          <div className="button-grid">
            {(["lr", "tb", "diagLeft", "diagRight"] as ShapeMirror[]).map((axis) => (
              <button key={axis} type="button" className="btn btn--small" data-testid={`sel-mirror-${axis}`} onClick={() => transform(fr.shape.history.transform, (b) => mirrorMat(b, axis))}>
                {fr.shape.selection[axis]}
              </button>
            ))}
          </div>
          <div className="button-grid">
            <button
              type="button"
              className="btn btn--small"
              data-testid="sel-center"
              onClick={() => {
                if (!selection.length) return notify(fr.shape.selection.needSelection);
                run(fr.shape.history.center, (d) => ({ ...d, shapes: centerInBlock(d.shapes, ids, d.width, d.height) }));
              }}
            >
              {fr.shape.selection.center}
            </button>
            <button
              type="button"
              className="btn btn--small"
              data-testid="sel-clone"
              onClick={() => {
                if (!selection.length) return notify(fr.shape.selection.needSelection);
                let created: Id[] = [];
                run(fr.shape.history.clone, (d) => {
                  const r = cloneShapes(d.shapes, ids);
                  created = r.ids;
                  return { ...d, shapes: r.shapes };
                });
                setPicked(created);
              }}
            >
              {fr.shape.selection.clone}
            </button>
          </div>
          <div className="button-grid">
            <button type="button" className="btn btn--small" data-testid="sel-front" disabled={selection.length === 0} onClick={() => run(fr.shape.history.order, (d) => ({ ...d, shapes: reorderShapes(d.shapes, ids, "front") }))}>
              {fr.shape.selection.front}
            </button>
            <button type="button" className="btn btn--small" data-testid="sel-back" disabled={selection.length === 0} onClick={() => run(fr.shape.history.order, (d) => ({ ...d, shapes: reorderShapes(d.shapes, ids, "back") }))}>
              {fr.shape.selection.back}
            </button>
          </div>
          <button
            type="button"
            className="btn btn--small"
            data-testid="sel-delete"
            disabled={selection.length === 0}
            onClick={() => {
              run(fr.shape.history.remove, (d) => ({ ...d, shapes: deleteShapes(d.shapes, ids) }));
              setPicked([]);
            }}
          >
            {fr.shape.selection.remove}
          </button>
        </Group>
      )}

      {tool === "apick" && (
        <Group title={fr.shape.wreath.title} testId="wreath-panel">
          <div className="field-row">
            <NumberField label={fr.shape.wreath.count} value={wreathParams.count} decimals={0} testId="wreath-count" onCommit={(n) => (Number.isInteger(n) && n >= MIN_WREATH_COUNT && n <= MAX_WREATH_COUNT ? (setWreathParams((w) => ({ ...w, count: n })), true) : (notify(fr.shape.wreath.bad), false))} />
            <NumberField label={fr.shape.wreath.spacing} value={wreathParams.spacing} decimals={0} testId="wreath-spacing" onCommit={(n) => (n >= 0 && n <= 100 ? (setWreathParams((w) => ({ ...w, spacing: n })), true) : false)} />
            <NumberField label={fr.shape.wreath.size} value={wreathParams.size} decimals={0} testId="wreath-size" onCommit={(n) => (n >= 10 && n <= 300 ? (setWreathParams((w) => ({ ...w, size: n })), true) : false)} />
          </div>
          <button
            type="button"
            className="btn btn--small"
            data-testid="wreath-apply"
            onClick={() => {
              if (!selection.length) return notify(fr.shape.selection.needSelection);
              let made: Id[] = [];
              const ok = run(fr.shape.history.wreath, (d) => {
                const r = wreath(d.shapes, ids, d.width, d.height, wreathParams);
                if (!r) return d;
                made = r.ids;
                return { ...d, shapes: r.shapes };
              });
              if (!ok) notify(fr.shape.wreath.bad);
              else setPicked(made);
            }}
          >
            {fr.shape.wreath.apply}
          </button>
          <p className="palette-hint">{fr.shape.wreath.help}</p>
        </Group>
      )}

      {tool === "aedit" && (
        <Group title={fr.shape.nodes.title} testId="node-panel">
          <p className="palette-hint">{fr.shape.nodes.help}</p>
          <div className="button-grid">
            {NODE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className="btn btn--small"
                data-testid={`node-type-${type}`}
                disabled={!editShape}
                onClick={() => nodeOp(fr.shape.history.nodeType, (s, nodes) => nodes.reduce((acc, i) => setNodeType(acc, i, type as NodeType), s))}
              >
                {fr.shape.nodes.types[type]}
              </button>
            ))}
          </div>
          <div className="button-grid">
            <button type="button" className="btn btn--small" data-testid="node-to-line" disabled={!editShape} onClick={() => nodeOp(fr.shape.history.convert, (s, nodes) => nodes.reduce((acc, i) => convertSegment(acc, i, "line"), s))}>
              {fr.shape.nodes.toLine}
            </button>
            <button type="button" className="btn btn--small" data-testid="node-to-curve" disabled={!editShape} onClick={() => nodeOp(fr.shape.history.convert, (s, nodes) => nodes.reduce((acc, i) => convertSegment(acc, i, "curve"), s))}>
              {fr.shape.nodes.toCurve}
            </button>
          </div>
          <div className="button-grid">
            <button type="button" className="btn btn--small" data-testid="node-add" disabled={!editShape} onClick={() => nodeOp(fr.shape.history.addNode, (s, nodes) => nodes.reduce((acc, i) => addNodeAt(acc, i, 0.5), s))}>
              {fr.shape.nodes.add}
            </button>
            <button type="button" className="btn btn--small" data-testid="node-delete" disabled={!editShape} onClick={() => nodeOp(fr.shape.history.deleteNode, (s, nodes) => nodes.reduce<AppShape | null>((acc, i) => (acc ? deleteNode(acc, i) : null), s))}>
              {fr.shape.nodes.remove}
            </button>
          </div>
          <div className="button-grid">
            <button
              type="button"
              className="btn btn--small"
              data-testid="node-cut"
              disabled={!editShape}
              onClick={() => nodeOp(fr.shape.history.cut, (s, nodes) => cutAt(s, nodes[nodes.length - 1] as number))}
            >
              {fr.shape.nodes.cut}
            </button>
            <button
              type="button"
              className="btn btn--small"
              data-testid="node-join"
              onClick={() => {
                if (picked.length !== 2) return notify(fr.shape.nodes.needTwo);
                const [a, b] = picked as [NodeRef, NodeRef];
                const joined = joinNodes(draft.shapes, a, b);
                if (!joined) return notify(fr.shape.nodes.needTwo);
                run(fr.shape.history.join, () => ({ ...draft, shapes: joined }));
                p.onPickNodes([]);
              }}
            >
              {fr.shape.nodes.join}
            </button>
          </div>
        </Group>
      )}

      <MakerPanel {...p} />
    </>
  );

  function moveTo(x: number | undefined, y: number | undefined): boolean {
    if (!box || selection.length === 0) return (notify(fr.shape.selection.needSelection), false);
    const dx = x === undefined ? 0 : toInches(x, unit) - box.x0;
    const dy = y === undefined ? 0 : toInches(y, unit) - box.y0;
    const next = translateShapes(draft.shapes, ids, dx, dy);
    if (!insideBlock(next.filter((s) => ids.has(s.id)), draft.width, draft.height)) return (notify(fr.shape.selection.outside), false);
    return run(fr.shape.history.move, (d) => ({ ...d, shapes: translateShapes(d.shapes, ids, dx, dy) })) || (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9);
  }

  function resizeTo(w: number | undefined, h: number | undefined): boolean {
    if (!box || selection.length === 0) return (notify(fr.shape.selection.needSelection), false);
    const bw = box.x1 - box.x0;
    const bh = box.y1 - box.y0;
    const sx = w === undefined || bw < 1e-9 ? 1 : toInches(w, unit) / bw;
    const sy = h === undefined || bh < 1e-9 ? 1 : toInches(h, unit) / bh;
    if (!(sx > 0 && sy > 0)) return false;
    const m = scaleAbout(sx, sy, { x: box.x0, y: box.y0 });
    const next = transformShapes(draft.shapes, ids, m);
    if (!insideBlock(next.filter((s) => ids.has(s.id)), draft.width, draft.height)) return (notify(fr.shape.selection.outside), false);
    return run(fr.shape.history.transform, (d) => ({ ...d, shapes: transformShapes(d.shapes, ids, m) })) || (Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Créateurs de pièces

function MakerPanel({ draft, run, setPicked, maker, onMaker, isMotif, notify }: AppliqueProps) {
  const set = (patch: Partial<MakerState>) => onMaker({ ...maker, ...patch });
  const add = () => {
    const made = makerShapes(maker, draft.width, draft.height);
    if (made.length === 0) return;
    run(fr.shape.history.maker, (d) => ({
      ...d,
      shapes: [...d.shapes, ...made],
      // StencilMaker range le motif dans l'onglet Pochoirs.
      list: maker.active === "stencil" ? "stencils" : d.list,
    }));
    setPicked(made.map((s) => s.id));
    set({ active: null });
  };
  const toggle = (kind: MakerKind) => {
    if (kind === "stencil" && !isMotif) return notify(fr.shape.makers.stencil.only);
    set({ active: maker.active === kind ? null : kind });
  };
  return (
    <Group title={fr.shape.tools.makers} testId="makers">
      <div className="tool-grid">
        {(["star", "posie", "stencil"] as MakerKind[]).map((k) => (
          <button key={k} type="button" className="tool-button" data-testid={`maker-${k}`} aria-pressed={maker.active === k} onClick={() => toggle(k)}>
            {fr.shape.makers[k].title}
          </button>
        ))}
      </div>
      {maker.active && <p className="palette-hint">{fr.shape.makers[maker.active].help}</p>}
      {maker.active === "star" && (
        <>
          <div className="field-row">
            <NumberField label={fr.shape.makers.star.branches} value={maker.star.branches} decimals={0} testId="star-branches" onCommit={(n) => (Number.isInteger(n) && n >= 3 && n <= 24 ? (set({ star: { ...maker.star, branches: n } }), true) : false)} />
            <NumberField label={fr.shape.makers.star.center} value={maker.star.center} decimals={0} testId="star-center" onCommit={(n) => (n >= 5 && n <= 95 ? (set({ star: { ...maker.star, center: n } }), true) : false)} />
          </div>
          <div className="field-row">
            <NumberField label={fr.shape.makers.star.size} value={maker.star.size} decimals={0} testId="star-size" onCommit={(n) => (n >= 5 && n <= 100 ? (set({ star: { ...maker.star, size: n } }), true) : false)} />
            <NumberField label={fr.shape.makers.star.rotation} value={maker.star.rotation} decimals={0} testId="star-rotation" onCommit={(n) => (set({ star: { ...maker.star, rotation: n } }), true)} />
          </div>
        </>
      )}
      {maker.active === "posie" && (
        <>
          <label className="field">
            <span className="field-label">{fr.shape.makers.posie.preset}</span>
            <select
              value={maker.posie.preset}
              data-testid="posie-preset"
              onChange={(e) => {
                const preset = POSIE_PRESETS.find((x) => x.id === e.target.value);
                if (preset) set({ posie: { ...posieParams(preset, maker.posie.size), preset: preset.id } });
              }}
            >
              {POSIE_PRESETS.map((x) => (
                <option key={x.id} value={x.id}>
                  {fr.shape.makers.posie.presets[x.id as keyof typeof fr.shape.makers.posie.presets]}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <NumberField label={fr.shape.makers.posie.petals} value={maker.posie.petals} decimals={0} testId="posie-petals" onCommit={(n) => (Number.isInteger(n) && n >= 3 && n <= 32 ? (set({ posie: { ...maker.posie, petals: n } }), true) : false)} />
            <NumberField label={fr.shape.makers.posie.size} value={maker.posie.size} decimals={0} testId="posie-size" onCommit={(n) => (n >= 10 && n <= 100 ? (set({ posie: { ...maker.posie, size: n } }), true) : false)} />
          </div>
          <div className="field-row">
            <NumberField label={fr.shape.makers.posie.length} value={maker.posie.length} decimals={0} testId="posie-length" onCommit={(n) => (n >= 10 && n <= 50 ? (set({ posie: { ...maker.posie, length: n } }), true) : false)} />
            <NumberField label={fr.shape.makers.posie.width} value={maker.posie.width} decimals={0} testId="posie-width" onCommit={(n) => (n >= 10 && n <= 100 ? (set({ posie: { ...maker.posie, width: n } }), true) : false)} />
            <NumberField label={fr.shape.makers.posie.center} value={maker.posie.center} decimals={0} testId="posie-center" onCommit={(n) => (n >= 2 && n <= 40 ? (set({ posie: { ...maker.posie, center: n } }), true) : false)} />
          </div>
        </>
      )}
      {maker.active === "stencil" && (
        <>
          <div className="field-row">
            <NumberField label={fr.shape.makers.stencil.petals} value={maker.stencil.petals} decimals={0} testId="stencil-petals" onCommit={(n) => (Number.isInteger(n) && n >= 3 && n <= 24 ? (set({ stencil: { ...maker.stencil, petals: n } }), true) : false)} />
            <NumberField label={fr.shape.makers.stencil.size} value={maker.stencil.size} decimals={0} testId="stencil-size" onCommit={(n) => (n >= 10 && n <= 100 ? (set({ stencil: { ...maker.stencil, size: n } }), true) : false)} />
          </div>
          <Check label={fr.shape.makers.stencil.loop} checked={maker.stencil.loop} testId="stencil-loop" onChange={(loop) => set({ stencil: { ...maker.stencil, loop } })} />
        </>
      )}
      {maker.active && (
        <button type="button" className="btn btn--small" data-testid="maker-add" onClick={add}>
          {fr.shape.makers.add}
        </button>
      )}
    </Group>
  );
}

export { makeShape };
