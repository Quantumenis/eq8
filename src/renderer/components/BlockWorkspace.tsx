import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FUSSY_BIG_STEP, FUSSY_STEP, findPaletteEntry, fussyCut, paintPieces, paletteEntries, samePaint, similarPieces } from "../../core/draw/coloring";
import {
  cleanDrawing,
  contentOfDraft,
  clearGuides,
  convertToGuides,
  isEmpty,
  toDrawing,
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
import { DEFAULT_THREAD, applyThread, sectionAt, sectionsWithStrands } from "../../core/draw/threads";
import { BLOCK_STYLES, styleHasApplique, styleHasPieced, styleIsEasy, styleIsPoly, type BlockStyle } from "../../core/draw/content";
import type { NodeRef } from "../../core/draw/applique";
import { DEFAULT_BRUSH, DEFAULT_ELLIPSE, DEFAULT_SWATH } from "../../core/draw/appliqueShapes";
import { isShapeTool, type AppliqueTool, type PolyTool, type ShapeOptions, type ShapeTool } from "../shapeGestures";
import { AppliquePanel, PolyPanel, initialMaker, makerShapes, type MakerState } from "./ShapePanels";
import { TracePanel } from "./TracePanel";
import { addNodesAt, addNodesAtIntersections, MAX_PARTS, partitionParams, staggerParams } from "../../core/draw/nodes";
import type { Piece } from "../../core/draw/pieces";
import { transformSelection, type MirrorAxis, type TransformSpec } from "../../core/draw/transform";
import { emptyNotecard, type BlockItem, type Id, type Paint } from "../../core/project/model";
import { blockPicture } from "../../core/print/kit";
import { rotaryChart } from "../../core/print/rotary";
import { blockSource } from "../../core/print/source";
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
import { PrintPalette } from "./PrintPalette";
import { PrintDialog, type PrintKind, type PrintSubject } from "./PrintDialog";
import { ExportImageDialog, SelectionDialog, type Picture } from "./ExportDialogs";

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
  // PolyDraw et applique : outils, réglages, nœuds choisis, créateur en aperçu, calque actif des blocs à deux calques.
  const [polyTool, setPolyTool] = useState<PolyTool>("polyline");
  const [appTool, setAppTool] = useState<AppliqueTool>("dline");
  const [layer, setLayer] = useState<"pieces" | "applique">("pieces");
  const [shapeOptions, setShapeOptions] = useState<ShapeOptions>({ ellipse: DEFAULT_ELLIPSE, radius: 0, form: "heart", brush: DEFAULT_BRUSH, swath: DEFAULT_SWATH, looseness: 0.3 });
  const [pickedNodes, setPickedNodes] = useState<readonly NodeRef[]>([]);
  const [maker, setMaker] = useState<MakerState>(initialMaker);
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
  // Onglet IMPRIMER & EXPORTER.
  const [printing, setPrinting] = useState<PrintKind | null>(null);
  const [exportOpen, setExportOpen] = useState<false | "png" | "svg">(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const marqueeStart = useRef<Pt | null>(null);
  const [selectionPic, setSelectionPic] = useState<Picture | null>(null);

  // ---- Onglet COLORATION -------------------------------------------------------------------------------------

  // Le passage à COLORATION nettoie le dessin (segments pendants, îlots) et prévient de ce qui a été retiré.
  useEffect(() => {
    if (tab !== 2) return;
    const { cleanup } = cleanCurrentDrawing();
    const report = cleanupReport(cleanup, unit);
    if (report) void dialogs.alert(report.message, report.detail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const content = useMemo(() => (tab === 2 || tab === 3 ? contentOfDraft(draft) : null), [tab, draft.style, draft.width, draft.height, draft.segments, draft.poly, draft.shapes]);
  const pieces = useMemo<readonly Piece[]>(() => content?.pieces ?? [], [content]);
  const pieceKeys = useMemo(() => new Set(pieces.map((p) => p.key)), [pieces]);
  const sections = useMemo(() => sectionsWithStrands(pieces, content?.strands ?? []), [pieces, content]);
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

  // Le bloc du plan, tel qu'il s'imprime : le dessin nettoyé et la coloration en cours (SPEC §9.1).
  const planBlock = useMemo<BlockItem | null>(() => {
    if (tab !== 3) return null;
    const cleaned = cleanDrawing(draft).draft;
    const src = sourceBlock();
    const colored = Object.keys(draft.fills).length > 0;
    return {
      id: "plan",
      card: emptyNotecard(src?.card.name || fr.print.planBlock),
      width: draft.width,
      height: draft.height,
      drawing: toDrawing(cleaned),
      colorings: colored ? [{ id: "plan", fills: { ...draft.fills }, ...(Object.keys(draft.threads).length > 0 ? { threads: { ...draft.threads } } : {}) }] : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, draft, project]);
  const printSubject = useMemo<PrintSubject | null>(
    () => (planBlock ? { from: "plan", block: planBlock, coloring: planBlock.colorings.length > 0 ? 1 : 0, sourceId: editor.sourceBlockId } : null),
    [planBlock, editor.sourceBlockId],
  );
  const printEnabled = useMemo(() => {
    const kinds = new Set<PrintKind>();
    if (!planBlock || pieces.length === 0) return kinds;
    kinds.add("block").add("templates").add("foundation");
    const pb = blockSource(planBlock, null, { width: planBlock.width, height: planBlock.height }, false, "");
    if (rotaryChart(pb, 0.25, "1/16", unit).cuts.length > 0) kinds.add("rotary");
    return kinds;
  }, [planBlock, pieces, unit]);
  const planPicture = (): Picture | null => {
    if (!planBlock) return null;
    const pb = blockSource(planBlock, planBlock.colorings[0] ?? null, { width: planBlock.width, height: planBlock.height }, false, planBlock.card.name);
    const style = planBlock.colorings.length > 0 ? "fabric" : "line";
    return { name: pb.name, x0: 0, y0: 0, width: pb.width, height: pb.height, items: (o) => blockPicture(pb, project, { style, width: 0.75, blockOutline: o.blockOutlines, pieceOutlines: o.pieceOutlines }) };
  };
  const printLayer: ColoringLayer | undefined =
    tab === 3
      ? {
          pieces,
          fillOf: (key) => pieceFill(project, current.assets, draft.fills[key]),
          sections,
          threadOf: (key) => draft.threads[key] ?? DEFAULT_THREAD,
          highlight: new Set<string>(),
          focus: null,
          marquee: selectionMode ? marquee : null,
          onPress: ({ point }) => {
            if (!selectionMode) return false;
            marqueeStart.current = point;
            setMarquee({ a: point, b: point });
            return true;
          },
          onDrag: (point) => {
            if (marqueeStart.current) setMarquee({ a: marqueeStart.current, b: point });
          },
          onRelease: () => {
            const a = marqueeStart.current;
            marqueeStart.current = null;
            const m = marquee;
            if (!a || !m) return;
            const x0 = Math.min(m.a.x, m.b.x);
            const y0 = Math.min(m.a.y, m.b.y);
            const w = Math.abs(m.b.x - m.a.x);
            const h = Math.abs(m.b.y - m.a.y);
            const pic = planPicture();
            if (!pic || w < 0.05 || h < 0.05) {
              setMarquee(null);
              notify(fr.print.selection.empty);
              return;
            }
            setSelectionPic({ ...pic, x0, y0, width: w, height: h });
          },
          targetsSections: false,
          cursor: selectionMode ? "crosshair" : "default",
        }
      : undefined;

  // Les identifiants disparus (annulation, suppression) sortent de la sélection.
  const selection = useMemo(() => {
    const alive = new Set([...draft.segments.map((s) => s.id), ...draft.shapes.map((s) => s.id), ...draft.poly.pieces.map((p) => p.id)]);
    return picked.filter((id) => alive.has(id));
  }, [picked, draft.segments, draft.shapes, draft.poly.pieces]);

  // Calque actif et outil du canvas : EasyDraw garde son propre jeu d'outils, PolyDraw et l'applique ont les leurs.
  const hasPieced = styleHasPieced(draft.style);
  const hasApplique = styleHasApplique(draft.style);
  const activeLayer: "pieces" | "applique" = !hasApplique ? "pieces" : !hasPieced ? "applique" : layer;
  const easyActive = activeLayer === "pieces" && styleIsEasy(draft.style);
  const polyActive = activeLayer === "pieces" && styleIsPoly(draft.style);
  const canvasShapeTool: ShapeTool | null = tab !== 1 || easyActive ? null : polyActive ? polyTool : appTool;
  const nodeSelection = useMemo(() => pickedNodes.filter((n) => draft.shapes.some((s) => s.id === n.shape && n.node < s.nodes.length)), [pickedNodes, draft.shapes]);
  const makerPreview = useMemo(() => (tab === 1 && activeLayer === "applique" ? makerShapes(maker, draft.width, draft.height) : []), [tab, activeLayer, maker, draft.width, draft.height]);

  const run = (label: string, change: (d: BlockDraft) => BlockDraft) => editor.execute(label, change);

  const startNew = (style: BlockStyle) => {
    editor.startNew(style);
    setPicked([]);
    setLastAdded([]);
    setPickedNodes([]);
    setMaker(initialMaker());
    setLayer(style === "applique" || style === "motif" ? "applique" : "pieces");
    onTab(1);
  };

  const switchLayer = (next: "pieces" | "applique") => {
    setPicked([]);
    setPickedNodes([]);
    setLayer(next);
  };

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
        <div className="palette-group" data-testid="style-picker">
          <p className="palette-text" data-testid="draw-style">
            {fr.shape.new.styleLabel[draft.style]}
          </p>
          <p className="palette-hint">{fr.shape.new.help[draft.style]}</p>
          {(
            [
              [fr.shape.new.typePieced, [["easy", "new-easydraw", fr.shape.new.easy], ["poly", "new-polydraw", fr.shape.new.poly]]],
              [fr.shape.new.typeApplique, [["applique", "new-applique", fr.shape.new.applique], ["motif", "new-motif", fr.shape.new.motif]]],
              [fr.shape.new.typeBoth, [["easyApplique", "new-easy-applique", fr.shape.new.easyApplique], ["polyApplique", "new-poly-applique", fr.shape.new.polyApplique]]],
            ] as [string, [BlockStyle, string, string][]][]
          ).map(([title, styles]) => (
            <div key={title}>
              <h3>{title}</h3>
              <div className="tool-grid">
                {styles.map(([style, testId, label]) => (
                  <button key={style} type="button" className="btn" data-testid={testId} aria-pressed={draft.style === style} title={fr.shape.new.startNew} onClick={() => startNew(style)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <h3>{fr.shape.new.typeSerendipity}</h3>
          <button type="button" className="btn" data-testid="new-serendipity" disabled title={fr.shape.new.serendipityLater}>
            {fr.shape.new.serendipity}
          </button>
          <p className="palette-hint">{fr.shape.new.serendipityLater}</p>
        </div>
      )}

      {tab === 1 && (
        <>
          {hasPieced && hasApplique && (
            <div className="palette-group" role="tablist" aria-label={fr.shape.layers.title} data-testid="layer-tabs">
              {(["pieces", "applique"] as const).map((l) => (
                <button key={l} type="button" role="tab" className="tool-button" aria-selected={activeLayer === l} aria-pressed={activeLayer === l} data-testid={`layer-${l}`} onClick={() => switchLayer(l)}>
                  {fr.shape.layers[l]}
                </button>
              ))}
            </div>
          )}
          {easyActive && (
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
          {polyActive && (
            <PolyPanel draft={draft} run={run} selection={selection} setPicked={setPicked} unit={unit} notify={notify} tool={polyTool} onTool={(t) => { setPolyTool(t); setPicked([]); }} />
          )}
          {activeLayer === "applique" && (
            <AppliquePanel
              draft={draft}
              run={run}
              selection={selection}
              setPicked={setPicked}
              unit={unit}
              notify={notify}
              tool={appTool}
              onTool={(t) => {
                setAppTool(t);
                setPicked([]);
              }}
              options={shapeOptions}
              onOptions={setShapeOptions}
              pickedNodes={nodeSelection}
              onPickNodes={setPickedNodes}
              maker={maker}
              onMaker={setMaker}
              isMotif={draft.style === "motif"}
            />
          )}
          {draft.style === "motif" && (
            <div className="palette-group">
              <h3>{fr.shape.list.title}</h3>
              <Check label={fr.shape.list.asStencil} checked={draft.list === "stencils"} testId="motif-as-stencil" onChange={(on) => run(fr.shape.history.list, (d) => ({ ...d, list: on ? "stencils" : "motifs" }))} />
            </div>
          )}
          <TracePanel draft={draft} run={run} notify={notify} />
        </>
      )}

      {tab === 2 && (
        <ColoringPalette project={project} tool={colorTool} onTool={setColorTool} selectionCount={liveSpray.length} onPick={tryPaint} onColorMenu={colorTools.openMenu} />
      )}
      {colorTools.element}

      {tab === 3 && (
        <PrintPalette
          plan="block"
          enabled={printEnabled}
          selection={null}
          selectionMode={selectionMode}
          onPrint={(kind) => setPrinting(kind)}
          onExportImage={(format) => setExportOpen(format ?? "png")}
          onToggleSelection={() => {
            setSelectionMode((m) => !m);
            setMarquee(null);
          }}
        />
      )}
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
            {content && content.issues.length > 0 && (
              <span className="precision-title precision-title--warn" data-testid="issue-count" role="status">
                {fr.shape.issues.selfIntersect(content.issues.length)}
              </span>
            )}
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
          {!polyActive && (
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
          )}
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
          {easyActive && (
          <div className="precision-group">
            <span className="precision-title">{fr.draw.precision.snapTo}</span>
            <Check label={fr.draw.precision.toGrid} checked={draft.snap.grid} testId="snap-grid" onChange={(v) => run(fr.draw.history.precision, (d) => setSnapOption(d, "grid", v))} />
            <Check label={fr.draw.precision.toNodes} checked={draft.snap.nodes} testId="snap-nodes" onChange={(v) => run(fr.draw.history.precision, (d) => setSnapOption(d, "nodes", v))} />
            <Check label={fr.draw.precision.toLines} checked={draft.snap.lines} testId="snap-lines" onChange={(v) => run(fr.draw.history.precision, (d) => setSnapOption(d, "lines", v))} />
          </div>
          )}
          {activeLayer === "applique" && (
          <div className="precision-group" data-testid="applique-snap">
            <span className="precision-title">{fr.shape.snap.title}</span>
            <Check label={fr.shape.snap.toGrid} checked={draft.snap.grid} testId="snap-grid" onChange={(v) => run(fr.shape.history.snap, (d) => setSnapOption(d, "grid", v))} />
            <Check label={fr.shape.snap.toNodes} checked={draft.snap.nodes} testId="snap-nodes" onChange={(v) => run(fr.shape.history.snap, (d) => setSnapOption(d, "nodes", v))} />
            <Check label={fr.shape.snap.wholePiece} checked={draft.appSnap.wholePiece} testId="snap-whole" onChange={(v) => run(fr.shape.history.snap, (d) => ({ ...d, appSnap: { ...d.appSnap, wholePiece: v } }))} />
            <Check label={fr.shape.snap.align} checked={draft.appSnap.align} testId="snap-align" onChange={(v) => run(fr.shape.history.snap, (d) => ({ ...d, appSnap: { ...d.appSnap, align: v } }))} />
            <Check label={fr.shape.snap.autoJoin} checked={draft.appSnap.autoJoin} testId="snap-autojoin" onChange={(v) => run(fr.shape.history.snap, (d) => ({ ...d, appSnap: { ...d.appSnap, autoJoin: v } }))} />
          </div>
          )}
          {(polyActive || hasApplique) && (
          <div className="precision-group">
            <Check label={fr.shape.snap.autoFill} checked={draft.autoFill} testId="auto-fill" onChange={(v) => run(fr.shape.history.fill, (d) => ({ ...d, autoFill: v }))} />
          </div>
          )}
          <div className="precision-group">
            <span className="precision-title">{fr.draw.precision.guides}</span>
            <button
              type="button"
              className="btn btn--small"
              data-testid="guides-convert"
              disabled={isEmpty(draft)}
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
          coloring={tab === 3 ? printLayer : coloringLayer}
          shapeTool={canvasShapeTool}
          shapeOptions={shapeOptions}
          pickedNodes={nodeSelection}
          onPickNodes={setPickedNodes}
          preview={makerPreview}
          activeLayer={hasPieced && hasApplique && tab === 1 ? activeLayer : undefined}
          onNotify={notify}
        />
      </main>
      {printing && printSubject && <PrintDialog kind={printing} subject={printSubject} unit={unit} notify={notify} onClose={() => setPrinting(null)} />}
      {exportOpen && planBlock && (() => {
        const pic = planPicture();
        return pic ? <ExportImageDialog pictures={{ whole: pic, selected: null }} unit={unit} notify={notify} initialFormat={exportOpen} onClose={() => setExportOpen(false)} /> : null;
      })()}
      {selectionPic && (
        <SelectionDialog
          picture={selectionPic}
          notify={notify}
          onClose={() => {
            setSelectionPic(null);
            setMarquee(null);
          }}
        />
      )}
    </>
  );
}
