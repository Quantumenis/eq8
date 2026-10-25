import { useEffect, useMemo, useState } from "react";
import {
  clearGuides,
  convertToGuides,
  isValidSnapCount,
  resizeBlock,
  setGraphPaper,
  setSnapCounts,
  setSnapOption,
  type BlockDraft,
} from "../../core/draw/draft";
import { addNodesAt, addNodesAtIntersections, MAX_PARTS, partitionParams, staggerParams } from "../../core/draw/nodes";
import { transformSelection, type MirrorAxis, type TransformSpec } from "../../core/draw/transform";
import type { Id } from "../../core/project/model";
import { fromInches, toInches, type DisplayUnit } from "../../core/units";
import { blockEditor, useBlockEditor } from "../blockEditor";
import { fr } from "../i18n/fr";
import { BlockCanvas, type NodeMode, type Tool } from "./BlockCanvas";

interface Props {
  /** Onglet du ruban : 0 NOUVEAU BLOC, 1 DESSIN, 2 COLORATION, 3 IMPRIMER & EXPORTER. */
  tab: number;
  onTab: (tab: number) => void;
  unit: DisplayUnit;
  notify: (message: string) => void;
}

const TOOLS: Tool[] = ["pick", "edit", "line", "arc", "grid"];

/** Champ numérique : valide à Entrée ou en quittant le champ ; une valeur refusée rétablit l'ancienne. */
function NumberField({
  label,
  value,
  onCommit,
  testId,
  decimals = 2,
  invalid = false,
  title,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => boolean | void;
  testId: string;
  decimals?: number;
  invalid?: boolean;
  title?: string;
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
          }
        }}
      />
    </label>
  );
}

function Check({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} data-testid={testId} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function BlockWorkspace({ tab, onTab, unit, notify }: Props) {
  const editor = useBlockEditor();
  const draft = editor.draft;
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

      {tab >= 2 && <p className="palette-empty">{fr.draw.soon}</p>}
    </aside>
  );

  return (
    <>
      {palette}
      <main className="worktable worktable--block-edit" data-testid="worktable">
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
        />
      </main>
    </>
  );
}
