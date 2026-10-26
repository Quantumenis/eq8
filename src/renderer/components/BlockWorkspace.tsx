import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FUSSY_BIG_STEP, FUSSY_STEP, findPaletteEntry, fussyCut, paintPieces, paletteEntries, samePaint, similarPieces } from "../../core/draw/coloring";
import {
  clearGuides,
  convertToGuides,
  isValidSnapCount,
  resizeBlock,
  setFills,
  setGraphPaper,
  setSnapCounts,
  setSnapOption,
  setThreads,
  type BlockDraft,
} from "../../core/draw/draft";
import type { Pt } from "../../core/draw/geometry";
import { DEFAULT_THREAD, applyThread, sectionAt, sectionsOf } from "../../core/draw/threads";
import { addNodesAt, addNodesAtIntersections, MAX_PARTS, partitionParams, staggerParams } from "../../core/draw/nodes";
import { analyzeBlock, type Piece } from "../../core/draw/pieces";
import { transformSelection, type MirrorAxis, type TransformSpec } from "../../core/draw/transform";
import type { Id, Paint } from "../../core/project/model";
import { fromInches, toInches, type DisplayUnit } from "../../core/units";
import { chooseColoring, cleanCurrentDrawing, cleanupReport, sourceBlock } from "../blockActions";
import { blockEditor, useBlockEditor } from "../blockEditor";
import { fr } from "../i18n/fr";
import { paintStore } from "../paintStore";
import { useSession } from "../projectSession";
import { useFabricTiles } from "../fabricTiles";
import { pieceFill } from "../paintView";
import { BlockCanvas, type ColoringLayer, type NodeMode, type Tool } from "./BlockCanvas";
import { ColoringNav } from "./ColoringNav";
import { ColoringPalette, isThreadTool, type ColorTool } from "./ColoringPalette";
import { useColorTools } from "./ColorTools";
import { useDialogs } from "./Dialogs";
import { Check, NumberField } from "./fields";

interface Props {
  /** Onglet du ruban : 0 NOUVEAU BLOC, 1 DESSIN, 2 COLORATION, 3 IMPRIMER & EXPORTER. */
  tab: number;
  onTab: (tab: number) => void;
  unit: DisplayUnit;
  notify: (message: string) => void;
}

const TOOLS: Tool[] = ["pick", "edit", "line", "arc", "grid"];

export function BlockWorkspace({ tab, onTab, unit, notify }: Props) {
  const editor = useBlockEditor();
  const current = useSession();
  const dialogs = useDialogs();
  const draft = editor.draft;
  const project = current.project;
  const [tool, setTool] = useState<Tool>("line");
  const [picked, setPicked] = useState<readonly Id[]>([]);
  const [lastAdded, setLastAdded] = useState<readonly Id[]>([]);
  const [grid, setGrid] = useState({ cols: 3, rows: 3 });
  const [nodeMode, setNodeMode] = useState<NodeMode>("move");
  const [clone, setClone] = useState(false);
  const [angle, setAngle] = useState(45);
  const [scale, setScale] = useState({ sx: 100, sy: 100 });
  const [parts, setParts] = useState({ partition: 5, stagger: 5 });
  const [snapProblem, setSnapProblem] = useState(false);
  const [colorTool, setColorToolState] = useState<ColorTool>("brush");
  const lastPaintTool = useRef<ColorTool>("brush");
  const [sprayKeys, setSprayKeys] = useState<readonly string[]>([]);
  /** Pièce dont on règle la coupe ciblée (glisser, puis flèches). */
  const [fussyKey, setFussyKey] = useState<string | null>(null);
  const fussyDrag = useRef<{ key: string; last: Pt; id: number } | null>(null);
  const fussyCount = useRef(0);
  const colorTools = useColorTools(notify);
  useFabricTiles();

  // ---- Onglet COLORATION -------------------------------------------------------------------------------------

  // Le passage à COLORATION nettoie le dessin (segments pendants, îlots) et prévient de ce qui a été retiré.
  useEffect(() => {
    if (tab !== 2) return;
    const { cleanup } = cleanCurrentDrawing();
    const report = cleanupReport(cleanup, unit);
    if (report) void dialogs.alert(report.message, report.detail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const pieces = useMemo<readonly Piece[]>(
    () => (tab === 2 ? analyzeBlock(draft.width, draft.height, draft.segments).pieces : []),
    [tab, draft.width, draft.height, draft.segments],
  );
  const pieceKeys = useMemo(() => new Set(pieces.map((p) => p.key)), [pieces]);
  const sections = useMemo(() => sectionsOf(pieces), [pieces]);
  const liveSpray = useMemo(() => sprayKeys.filter((k) => pieceKeys.has(k)), [sprayKeys, pieceKeys]);

  const setColorTool = (next: ColorTool) => {
    if (next !== "eyedropper") lastPaintTool.current = next;
    setSprayKeys([]); // changer d'outil désélectionne
    if (next !== "fussy") setFussyKey(null);
    setColorToolState(next);
  };

  const applyPaint = useCallback(
    (label: string, keys: readonly string[], paint: Paint, coalesce?: string) => {
      if (keys.length === 0) return;
      editor.execute(label, (d) => setFills(d, paintPieces(d.fills, keys, paint)), coalesce);
      paintStore.used(paint);
    },
    [editor],
  );

  const onPiece = (piece: Piece | null) => {
    if (!piece) {
      setSprayKeys([]);
      return;
    }
    const fills = editor.draft.fills;
    const paint = paintStore.get().paint;
    if (colorTool === "eyedropper") {
      const found = fills[piece.key];
      if (!found) return notify(fr.coloring.eyedropperNone);
      const entry = findPaletteEntry(project, found);
      paintStore.choose(found, entry?.tab ?? (found.kind === "fabric" ? "fabrics" : "colors"));
      if (!entry) notify(fr.coloring.eyedropperOutside);
      setColorTool(lastPaintTool.current); // la pipette rend la main au dernier outil de tissu
      return;
    }
    if (colorTool === "selectSpray") {
      setSprayKeys(similarPieces(pieces, fills, piece.key));
      return;
    }
    if (!paint) return notify(fr.coloring.chooseFirst);
    if (colorTool === "brush") applyPaint(fr.coloring.history.paint, [piece.key], paint);
    else applyPaint(fr.coloring.history.spray, similarPieces(pieces, fills, piece.key), paint);
  };

  // « Sélectionner & vaporiser » : chaque choix dans la palette est essayé sur la sélection (une seule étape d'annulation).
  const tryPaint = useCallback(
    (paint: Paint) => {
      if (colorTool !== "selectSpray" || liveSpray.length === 0) return;
      applyPaint(fr.coloring.history.tryPaint, liveSpray, paint, `try:${liveSpray.join(",")}`);
    },
    [colorTool, liveSpray, applyPaint],
  );

  // Les flèches du clavier font défiler les tissus et couleurs sur la sélection.
  useEffect(() => {
    if (tab !== 2 || colorTool !== "selectSpray" || liveSpray.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (step === 0) return;
      const state = paintStore.get();
      const entries = paletteEntries(project, state.tab);
      if (entries.length === 0) return;
      e.preventDefault();
      const at = entries.findIndex((en) => samePaint(en.paint, state.paint ?? undefined));
      const next = entries[(at + step + entries.length) % entries.length];
      if (!next) return;
      paintStore.choose(next.paint, next.tab);
      tryPaint(next.paint);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, colorTool, liveSpray, project, tryPaint]);

  // Coupe ciblée : les flèches décalent le tissu de 1/16 po, Ctrl+flèches de 1/2 po (Q-5.1).
  useEffect(() => {
    if (tab !== 2 || colorTool !== "fussy" || !fussyKey) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const step = e.ctrlKey || e.metaKey ? FUSSY_BIG_STEP : FUSSY_STEP;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      editor.execute(fr.coloring.history.fussy, (dr) => setFills(dr, fussyCut(dr.fills, fussyKey, d[0] as number, d[1] as number)), `fussy-keys:${fussyKey}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, colorTool, fussyKey, editor]);

  const onPress: ColoringLayer["onPress"] = ({ piece, point, tolerance }) => {
    if (isThreadTool(colorTool)) {
      const { thread, threadProps } = paintStore.get();
      const keys = colorTool === "threadSpray" ? (piece || sectionAt(sections, point, tolerance) ? sections.map((s) => s.key) : []) : [sectionAt(sections, point, tolerance)?.key].filter((k): k is string => !!k);
      if (keys.length === 0) return false;
      editor.execute(colorTool === "threadSpray" ? fr.coloring.history.threadSpray : fr.coloring.history.thread, (d) => setThreads(d, applyThread(d.threads, keys, thread, threadProps)));
      return false;
    }
    if (colorTool === "fussy") {
      if (!piece) {
        setFussyKey(null);
        return false;
      }
      if (editor.draft.fills[piece.key]?.kind !== "fabric") {
        setFussyKey(null);
        notify(fr.coloring.fussyNeedFabric);
        return false;
      }
      setFussyKey(piece.key);
      fussyCount.current += 1;
      fussyDrag.current = { key: piece.key, last: point, id: fussyCount.current };
      return true;
    }
    onPiece(piece);
    return false;
  };

  const coloringLayer: ColoringLayer | undefined =
    tab === 2
      ? {
          pieces,
          fillOf: (key) => pieceFill(project, current.assets, draft.fills[key]),
          sections,
          threadOf: (key) => draft.threads[key] ?? DEFAULT_THREAD,
          highlight: new Set(liveSpray),
          focus: colorTool === "fussy" ? fussyKey : null,
          onPress,
          onDrag: (point) => {
            const g = fussyDrag.current;
            if (!g) return;
            const dx = point.x - g.last.x;
            const dy = point.y - g.last.y;
            g.last = point;
            // Tout le glissement est une seule étape d'annulation.
            editor.execute(fr.coloring.history.fussy, (d) => setFills(d, fussyCut(d.fills, g.key, dx, dy)), `fussy:${g.id}`);
          },
          onRelease: () => {
            fussyDrag.current = null;
          },
          targetsSections: isThreadTool(colorTool),
          cursor: colorTool === "eyedropper" ? "copy" : colorTool === "fussy" ? "move" : isThreadTool(colorTool) ? "crosshair" : "pointer",
        }
      : undefined;
  const source = tab === 2 ? sourceBlock() : null;

  // Les identifiants disparus (annulation, suppression) sortent de la sélection.
  const selection = useMemo(() => {
    const alive = new Set(draft.segments.map((s) => s.id));
    return picked.filter((id) => alive.has(id));
  }, [picked, draft.segments]);

  const run = (label: string, change: (d: BlockDraft) => BlockDraft) => editor.execute(label, change);

  const symmetry = (spec: TransformSpec) => {
    const result = transformSelection(editor.draft, selection, spec, clone);
    if (!result.ok) return notify(fr.draw.symmetry.reasons[result.reason]);
    const next = result.draft;
    run(fr.draw.history.symmetry, () => next);
    setPicked(result.ids);
  };

  const nodes = (label: string, change: (d: BlockDraft, id: Id) => BlockDraft) => {
    const id = selection.length === 1 ? selection[0] : undefined;
    if (!id) return notify(fr.draw.nodes.needSegment);
    if (!run(label, (d) => change(d, id))) notify(fr.draw.nodes.nothing);
    setPicked([id]);
  };

  const clampParts = (n: number) => Number.isInteger(n) && n >= 2 && n <= MAX_PARTS;

  const sizeIn = (v: number) => Math.round(fromInches(v, unit) * 1e4) / 1e4;
  const snapOk = (axis: "x" | "y") =>
    isValidSnapCount(sizeIn(axis === "x" ? draft.width : draft.height), axis === "x" ? draft.snapX : draft.snapY);

  const setSnap = (axis: "x" | "y", n: number): boolean => {
    const size = sizeIn(axis === "x" ? draft.width : draft.height);
    if (!isValidSnapCount(size, n)) {
      setSnapProblem(true);
      return false;
    }
    setSnapProblem(false);
    run(fr.draw.history.precision, (d) => setSnapCounts(d, axis === "x" ? n : d.snapX, axis === "y" ? n : d.snapY));
    return true;
  };

  const palette = (
    <aside className="palette palette--block" aria-label={fr.palette.title}>
      <h2 className="palette-title">{fr.ribbon.block[tab]}</h2>

      {tab === 0 && (
        <div className="palette-group">
          <p className="palette-text" data-testid="draw-style">
            {fr.draw.style}
          </p>
          <p className="palette-hint">{fr.draw.styleHelp}</p>
          <button
            type="button"
            className="btn"
            data-testid="new-easydraw"
            title={fr.draw.newBlockTitle}
            onClick={() => {
              editor.startNew();
              setPicked([]);
              setLastAdded([]);
              onTab(1);
            }}
          >
            {fr.draw.newBlock}
          </button>
          <p className="palette-hint">{fr.draw.otherStyles}</p>
        </div>
      )}

      {tab === 1 && (
        <>
          <div className="palette-group" role="group" aria-label={fr.draw.tools.title}>
            <div className="tool-grid">
              {TOOLS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="tool-button"
                  data-testid={`tool-${id}`}
                  aria-pressed={tool === id}
                  onClick={() => setTool(id)}
                >
                  {fr.draw.tools[id]}
                </button>
              ))}
            </div>
            <p className="palette-hint">{fr.draw.toolHelp[tool]}</p>
          </div>

          {tool === "grid" && (
            <div className="palette-group">
              <h3>{fr.draw.gridOptions.title}</h3>
              <NumberField
                label={fr.draw.gridOptions.columns}
                value={grid.cols}
                decimals={0}
                testId="grid-cols"
                onCommit={(n) => (Number.isInteger(n) && n >= 1 && n <= 64 ? (setGrid((g) => ({ ...g, cols: n })), true) : false)}
              />
              <NumberField
                label={fr.draw.gridOptions.rows}
                value={grid.rows}
                decimals={0}
                testId="grid-rows"
                onCommit={(n) => (Number.isInteger(n) && n >= 1 && n <= 64 ? (setGrid((g) => ({ ...g, rows: n })), true) : false)}
              />
            </div>
          )}

          {tool === "pick" && (
            <div className="palette-group">
              <h3>{fr.draw.symmetry.title}</h3>
              <p className="palette-hint" data-testid="selection-count">
                {fr.draw.symmetry.selected(selection.length)}
              </p>
              <Check label={fr.draw.symmetry.clone} checked={clone} onChange={setClone} testId="sym-clone" />
              <div className="button-grid">
                {(["lr", "tb", "diagLeft", "diagRight"] as MirrorAxis[]).map((axis) => (
                  <button key={axis} type="button" className="btn btn--small" data-testid={`sym-${axis}`} onClick={() => symmetry({ kind: "mirror", axis })}>
                    {fr.draw.symmetry[axis]}
                  </button>
                ))}
              </div>
              <div className="button-grid">
                {[90, 180, 270].map((degrees) => (
                  <button
                    key={degrees}
                    type="button"
                    className="btn btn--small"
                    data-testid={`sym-rotate-${degrees}`}
                    title={fr.draw.symmetry.rotate}
                    onClick={() => symmetry({ kind: "rotate", degrees })}
                  >
                    {fr.draw.symmetry.rotate} {degrees}°
                  </button>
                ))}
              </div>
              <div className="field-row">
                <NumberField label={fr.draw.symmetry.free} value={angle} testId="sym-angle" onCommit={(n) => (setAngle(n), true)} />
                <button type="button" className="btn btn--small" data-testid="sym-rotate-free" onClick={() => symmetry({ kind: "rotate", degrees: angle })}>
                  {fr.draw.symmetry.apply}
                </button>
              </div>
              <div className="field-row">
                <NumberField label={`${fr.draw.symmetry.resize} — ${fr.draw.symmetry.horizontal}`} value={scale.sx} testId="sym-sx" onCommit={(n) => (n > 0 ? (setScale((s) => ({ ...s, sx: n })), true) : false)} />
                <NumberField label={fr.draw.symmetry.vertical} value={scale.sy} testId="sym-sy" onCommit={(n) => (n > 0 ? (setScale((s) => ({ ...s, sy: n })), true) : false)} />
                <button type="button" className="btn btn--small" data-testid="sym-scale" onClick={() => symmetry({ kind: "scale", sx: scale.sx / 100, sy: scale.sy / 100 })}>
                  {fr.draw.symmetry.apply}
                </button>
              </div>
              <button
                type="button"
                className="btn btn--small"
                data-testid="delete-selection"
                disabled={selection.length === 0}
                onClick={() => {
                  const drop = new Set(selection);
                  run(fr.draw.history.remove, (d) => ({ ...d, segments: d.segments.filter((s) => !drop.has(s.id)) }));
                  setPicked([]);
                }}
              >
                {fr.draw.symmetry.remove}
              </button>
            </div>
          )}

          {tool === "edit" && (
            <div className="palette-group">
              <h3>{fr.draw.nodes.title}</h3>
              <button
                type="button"
                className="tool-button"
                data-testid="node-here"
                aria-pressed={nodeMode === "here"}
                title={fr.draw.nodes.hereHelp}
                onClick={() => setNodeMode(nodeMode === "here" ? "move" : "here")}
              >
                {fr.draw.nodes.here}
              </button>
              <div className="button-grid">
                <button type="button" className="btn btn--small" data-testid="node-intersections" onClick={() => nodes(fr.draw.history.nodes, addNodesAtIntersections)}>
                  {fr.draw.nodes.intersections}
                </button>
                <button type="button" className="btn btn--small" data-testid="node-half" onClick={() => nodes(fr.draw.history.nodes, (d, id) => addNodesAt(d, id, partitionParams(2)))}>
                  {fr.draw.nodes.half}
                </button>
                <button type="button" className="btn btn--small" data-testid="node-third" onClick={() => nodes(fr.draw.history.nodes, (d, id) => addNodesAt(d, id, partitionParams(3)))}>
                  {fr.draw.nodes.third}
                </button>
              </div>
              <div className="field-row">
                <NumberField label={`${fr.draw.nodes.partition} — ${fr.draw.nodes.parts}`} value={parts.partition} decimals={0} testId="node-partition-n" onCommit={(n) => (clampParts(n) ? (setParts((p) => ({ ...p, partition: n })), true) : false)} />
                <button type="button" className="btn btn--small" data-testid="node-partition" onClick={() => nodes(fr.draw.history.nodes, (d, id) => addNodesAt(d, id, partitionParams(parts.partition)))}>
                  {fr.draw.nodes.apply}
                </button>
              </div>
              <div className="field-row">
                <NumberField label={`${fr.draw.nodes.stagger} — ${fr.draw.nodes.parts}`} value={parts.stagger} decimals={0} testId="node-stagger-n" onCommit={(n) => (clampParts(n) ? (setParts((p) => ({ ...p, stagger: n })), true) : false)} />
                <button type="button" className="btn btn--small" data-testid="node-stagger" onClick={() => nodes(fr.draw.history.nodes, (d, id) => addNodesAt(d, id, staggerParams(parts.stagger)))}>
                  {fr.draw.nodes.apply}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 2 && (
        <ColoringPalette project={project} tool={colorTool} onTool={setColorTool} selectionCount={liveSpray.length} onPick={tryPaint} onColorMenu={colorTools.openMenu} />
      )}
      {colorTools.element}

      {tab === 3 && <p className="palette-empty">{fr.draw.soon}</p>}
    </aside>
  );

  return (
    <>
      {palette}
      <main className="worktable worktable--block-edit" data-testid="worktable">
        {tab === 2 ? (
          <div className="precision-bar coloring-bar" data-testid="coloring-bar" data-threads={Object.keys(draft.threads).length} data-fussy={fussyKey ?? ""}>
            <ColoringNav
              block={source}
              index={source ? editor.sourceColoring : 0}
              onChoose={(i) => chooseColoring(i)}
              fillOf={(paint) => pieceFill(project, current.assets, paint) ?? { color: "#9e9e9e" }}
            />
            <span className="precision-title" data-testid="piece-count">
              {fr.coloring.pieces(pieces.length)}
            </span>
            {colorTool === "fussy" && fussyKey && (
              <span
                className="precision-title"
                data-testid="fussy-offset"
                data-x={draft.fills[fussyKey]?.kind === "fabric" ? ((draft.fills[fussyKey] as { offset?: Pt }).offset?.x ?? 0) : 0}
                data-y={draft.fills[fussyKey]?.kind === "fabric" ? ((draft.fills[fussyKey] as { offset?: Pt }).offset?.y ?? 0) : 0}
              >
                {fr.coloring.fussyOffset(draft.fills[fussyKey]?.kind === "fabric" ? (draft.fills[fussyKey] as { offset?: Pt }).offset ?? { x: 0, y: 0 } : { x: 0, y: 0 }, unit)}
              </span>
            )}
          </div>
        ) : (
        <div className="precision-bar" role="group" aria-label={fr.draw.precision.title} data-testid="precision-bar">
          <div className="precision-group">
            <span className="precision-title">{fr.draw.precision.size}</span>
            <NumberField
              label={fr.draw.precision.width}
              value={sizeIn(draft.width)}
              testId="block-width"
              decimals={4}
              onCommit={(n) => {
                const next = toInches(n, unit);
                return run(fr.draw.history.size, (d) => resizeBlock(d, next, d.height)) || Math.abs(next - draft.width) < 1e-12;
              }}
            />
            <NumberField
              label={fr.draw.precision.height}
              value={sizeIn(draft.height)}
              testId="block-height"
              decimals={4}
              onCommit={(n) => {
                const next = toInches(n, unit);
                return run(fr.draw.history.size, (d) => resizeBlock(d, d.width, next)) || Math.abs(next - draft.height) < 1e-12;
              }}
            />
          </div>
          <div className="precision-group">
            <span className="precision-title">{fr.draw.precision.snaps}</span>
            <NumberField
              label={fr.draw.precision.snapH}
              value={draft.snapX}
              decimals={0}
              testId="snap-x"
              invalid={!snapOk("x")}
              title={snapProblem ? fr.draw.precision.snapInvalid : undefined}
              onCommit={(n) => setSnap("x", n)}
            />
            <NumberField
              label={fr.draw.precision.snapV}
              value={draft.snapY}
              decimals={0}
              testId="snap-y"
              invalid={!snapOk("y")}
              title={snapProblem ? fr.draw.precision.snapInvalid : undefined}
              onCommit={(n) => setSnap("y", n)}
            />
          </div>
          <div className="precision-group">
            <Check label={fr.draw.precision.graph} checked={draft.graph.show} testId="graph-show" onChange={(show) => run(fr.draw.history.precision, (d) => setGraphPaper(d, { show }))} />
            <NumberField
              label={fr.draw.precision.divisions}
              value={draft.graph.divX}
              decimals={0}
              testId="graph-div-x"
              onCommit={(n) => run(fr.draw.history.precision, (d) => setGraphPaper(d, { divX: n })) || n === draft.graph.divX}
            />
            <NumberField
              label=""
              value={draft.graph.divY}
              decimals={0}
              testId="graph-div-y"
              onCommit={(n) => run(fr.draw.history.precision, (d) => setGraphPaper(d, { divY: n })) || n === draft.graph.divY}
            />
          </div>
          <div className="precision-group">
            <span className="precision-title">{fr.draw.precision.snapTo}</span>
            <Check label={fr.draw.precision.toGrid} checked={draft.snap.grid} testId="snap-grid" onChange={(v) => run(fr.draw.history.precision, (d) => setSnapOption(d, "grid", v))} />
            <Check label={fr.draw.precision.toNodes} checked={draft.snap.nodes} testId="snap-nodes" onChange={(v) => run(fr.draw.history.precision, (d) => setSnapOption(d, "nodes", v))} />
            <Check label={fr.draw.precision.toLines} checked={draft.snap.lines} testId="snap-lines" onChange={(v) => run(fr.draw.history.precision, (d) => setSnapOption(d, "lines", v))} />
          </div>
          <div className="precision-group">
            <span className="precision-title">{fr.draw.precision.guides}</span>
            <button
              type="button"
              className="btn btn--small"
              data-testid="guides-convert"
              disabled={draft.segments.length === 0}
              onClick={() => {
                const ids = selection.length > 0 ? selection : null;
                run(fr.draw.history.guides, (d) => convertToGuides(d, ids));
                setPicked([]);
              }}
            >
              {fr.draw.precision.toGuides}
            </button>
            <button type="button" className="btn btn--small" data-testid="guides-clear" disabled={draft.guides.length === 0} onClick={() => run(fr.draw.history.clearGuides, clearGuides)}>
              {fr.draw.precision.clearGuides}
            </button>
          </div>
        </div>
        )}
        <BlockCanvas
          editor={blockEditor}
          tool={tool}
          selection={selection}
          onSelect={setPicked}
          grid={grid}
          nodeMode={nodeMode}
          unit={unit}
          lastAdded={lastAdded}
          onAdded={setLastAdded}
          coloring={coloringLayer}
        />
      </main>
    </>
  );
}
