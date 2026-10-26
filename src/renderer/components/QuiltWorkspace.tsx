import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findPaletteEntry, paletteEntries, samePaint, type PaletteTab } from "../../core/draw/coloring";
import { addToSketchbook } from "../../core/project/commands";
import { emptyNotecard, createId, type BlockItem, type BlockListKey, type Id, type Paint } from "../../core/project/model";
import { addBorder, insertBorder, matchCounts, removeBorder, setBorderCount, setBorderSize, setBorderStyle, type SizeLock } from "../../core/quilt/borderops";
import { applyAutoBorder, type AutoBorder } from "../../core/quilt/borderpresets";
import { finishedSize, type BorderSide, type BorderStyle } from "../../core/quilt/borders";
import { CORNER_HANDLES, SIDE_HANDLES, hitHandle, isCorner, resizeByHandle, rotateByPointer, skewByPointer, handlePoint, type Handle } from "../../core/quilt/adjust";
import { newDraft, type FreeItem, type Layer, type QuiltDraft } from "../../core/quilt/doc";
import type { Pt } from "../../core/quilt/geom";
import { boxOf } from "../../core/quilt/geom";
import { buildLayout, defaultLayout, isStandardLayout, type LayoutKind, type LayoutParams } from "../../core/quilt/layout";
import {
  addItem,
  alignItems,
  applySymmetry,
  centerItems,
  clearQuilt,
  clipItems,
  deleteItems,
  eraseSlots,
  itemExtent,
  newLayout,
  orientationOf,
  pasteItems,
  placeBlock,
  resizeCustom,
  setLayout,
  slotsForClick,
  snapTo,
  sameSize,
  stackItems,
  turnSlots,
  updateItem,
  updateItems,
  DEFAULT_DROP_SIZE,
  type BlockRef,
} from "../../core/quilt/ops";
import {
  alignedRotation,
  advancedRotation,
  brushTargets,
  clickMode,
  edgesByLength,
  fussyCutPiece,
  paintPieces,
  pipetteColor,
  pipetteFabric,
  piecesTouchedBy,
  randomize,
  rotateFabric,
  sampleStroke,
  simpleRotation,
  sprayTargets,
  swapTargets,
  type BrushStyle,
  type RandomizeOptions,
  type RotateMethod,
} from "../../core/quilt/paintops";
import { buildScene, itemAtPoint, pieceAtPoint, slotAtPoint, type Scene, type ScenePiece } from "../../core/quilt/scene";
import { FUSSY_BIG_STEP, FUSSY_STEP } from "../../core/draw/coloring";
import { formatLength, type DisplayUnit } from "../../core/units";
import { fr } from "../i18n/fr";
import { paintStore, usePaintState } from "../paintStore";
import { useSession } from "../projectSession";
import { useQuiltEditor, quiltEditor } from "../quiltEditor";
import { readPalette } from "../blockDraw";
import { useFabricTiles } from "../fabricTiles";
import { useDialogs } from "./Dialogs";
import { Check, NumberField } from "./fields";
import { PaintSwatches, SelectionPreview } from "./ColoringPalette";
import { useColorTools } from "./ColorTools";
import { QuiltCanvas, DROP_MIME, type PointerInfo } from "./QuiltCanvas";
import { KindChooser, LayoutPanel } from "./QuiltLayoutPanel";
import { AutoBorders, BorderPanel } from "./QuiltBorderPanel";
import { BlockSvg } from "./Thumb";
import { pieceFill } from "../paintView";
import { blockPicture } from "../../core/print/kit";
import { quiltPicture } from "../../core/print/pages";
import { rotaryChart } from "../../core/print/rotary";
import { quiltElement, quiltSource } from "../../core/print/source";
import { printContext } from "../printSettings";
import { currentProjectName } from "../projectActions";
import { PrintPalette } from "./PrintPalette";
import { PrintDialog, type PrintKind, type PrintSubject } from "./PrintDialog";
import { ExportImageDialog, SelectionDialog, type Picture } from "./ExportDialogs";

type BlockTool = "set" | "eyedropperBlock" | "rotate" | "mirror" | "erase" | "adjust" | "symmetry" | "tape";
type PaintTool = "brush" | "spray" | "selectSpray" | "swap" | "selectSwap" | "fussy" | "rotateFabric" | "eyedropperFabric" | "eyedropperColor" | "randomize";
type Tool = BlockTool | PaintTool;

const BLOCK_TOOLS: BlockTool[] = ["set", "eyedropperBlock", "rotate", "mirror", "erase", "adjust", "symmetry", "tape"];
const PAINT_TOOLS: PaintTool[] = ["brush", "spray", "selectSpray", "swap", "selectSwap", "fussy", "rotateFabric", "eyedropperFabric", "eyedropperColor", "randomize"];
const BRUSH_STYLES: BrushStyle[] = ["dot", "freehand", "line", "rect", "oval"];
const SNAP_STEPS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2];
const SNAP_LABELS = ["1/16 po", "1/8 po", "1/4 po", "1/2 po", "1 po", "2 po"];

interface Props {
  /** Onglet du ruban : 0 NOUVEAU QUILT, 1 DISPOSITION, 2 BORDURES, 3 DESIGN, 4 IMPRIMER & EXPORTER. */
  tab: number;
  onTab: (tab: number) => void;
  unit: DisplayUnit;
  notify: (message: string) => void;
}

type Gesture =
  | { kind: "stroke"; style: BrushStyle; points: Pt[]; mode: "one" | "all" | "alternate"; paint: Paint }
  | { kind: "move"; ids: Id[]; start: Pt; base: QuiltDraft; delta: Pt }
  | { kind: "resize"; id: Id; handle: Handle; base: QuiltDraft; keep: boolean }
  | { kind: "rotate"; id: Id; start: Pt; base: QuiltDraft }
  | { kind: "skew"; id: Id; handle: Handle; base: QuiltDraft }
  | { kind: "fussy"; piece: ScenePiece; last: Pt; id: number }
  | { kind: "tape"; a: Pt; b: Pt };

function loadOption<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`quilt.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function saveOption(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(`quilt.${key}`, JSON.stringify(value));
  } catch {
    // Pas de stockage local : les options ne sont pas mémorisées.
  }
}

export function QuiltWorkspace({ tab, onTab, unit, notify }: Props) {
  const editor = useQuiltEditor();
  const current = useSession();
  const dialogs = useDialogs();
  const paintState = usePaintState();
  const colorTools = useColorTools(notify);
  useFabricTiles();
  const project = current.project;
  const draft = editor.draft;
  const layoutKind = draft.doc.layout.kind;

  const [tool, setToolState] = useState<Tool>("set");
  const lastPaintTool = useRef<Tool>("brush");
  const [layer, setLayer] = useState<Layer>(1);
  const [hidden, setHidden] = useState<ReadonlySet<Layer>>(new Set());
  const [seams, setSeams] = useState(true);
  const [brushStyle, setBrushStyle] = useState<BrushStyle>("dot");
  const [rotateMethod, setRotateMethod] = useState<RotateMethod>("simple");
  const [advanced, setAdvanced] = useState({ start: 0, count: 8 });
  const [random, setRandom] = useState<{ mode: RandomizeOptions["kind"]; hue: number; saturation: number; lightness: number; tolerance: number }>({ mode: "shift", hue: 0, saturation: 0, lightness: 0, tolerance: 150 });
  const [blockTab, setBlockTab] = useState<BlockListKey>("blocks");
  const [chosen, setChosen] = useState<{ blockId: Id; index: number } | null>(null);
  const [selected, setSelected] = useState<readonly Id[]>([]);
  const [rotateMode, setRotateMode] = useState(false);
  const [keepProportions, setKeepProportions] = useState(false);
  const [sprayKeys, setSprayKeys] = useState<readonly string[]>([]);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [edge, setEdge] = useState<{ key: string; index: number; quarters: number } | null>(null);
  const [gestureTick, setGestureTick] = useState(0);
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  const [tapeText, setTapeText] = useState("");
  const [options, setOptions] = useState(() => ({
    rulers: loadOption("rulers", false),
    keepRotation: loadOption("keepRotation", false),
    autoToggle: loadOption("autoToggle", true),
    maxBlocks: loadOption("maxBlocks", 24),
    dropSizeDesign: loadOption("dropSizeDesign", true),
    showGrid: loadOption("showGrid", true),
    snapPosition: loadOption("snapPosition", true),
    snapSize: loadOption("snapSize", true),
    snapStep: loadOption("snapStep", 1 / 4),
    keepBorders: loadOption("keepBorders", false),
    borderStyle: loadOption<BorderStyle>("borderStyle", "longH"),
  }));
  const [selectedBorder, setSelectedBorder] = useState<string | null>(null);
  // Onglet IMPRIMER & EXPORTER : l'élément choisi, la boîte ouverte, l'export d'une sélection.
  const [printOwner, setPrintOwner] = useState<string | null>(null);
  const [printing, setPrinting] = useState<PrintKind | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const marqueeStart = useRef<Pt | null>(null);
  const [selectionPic, setSelectionPic] = useState<Picture | null>(null);
  const [autoPreset, setAutoPreset] = useState<AutoBorder | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const clipboard = useRef<FreeItem[]>([]);
  const symmetry = useRef<{ base: ReturnType<typeof orientationOf>; clicks: number; set: QuiltDraft["doc"]["set"] | null }>({ base: {}, clicks: 0, set: null });
  const fussyCount = useRef(0);
  const setOption = <K extends keyof typeof options>(key: K, value: (typeof options)[K]) => {
    setOptions((o) => ({ ...o, [key]: value }));
    saveOption(key, value);
  };
  const refresh = () => setGestureTick((n) => n + 1);

  const setTool = (next: Tool) => {
    if ((PAINT_TOOLS as string[]).includes(next) && next !== "eyedropperFabric" && next !== "eyedropperColor") lastPaintTool.current = next;
    setSprayKeys([]);
    setFocusKey(null);
    setEdge(null);
    setAutoPreset(null);
    symmetry.current = { base: {}, clicks: 0, set: null };
    if (next !== "adjust") setSelected([]);
    setToolState(next);
  };

  // L'état de la pose ou de la coloration qui dépend du dessin disparaît quand le dessin change sous nos pieds.
  const gestureTarget = useRef<Pt | null>(null);
  /** Le brouillon que produirait le geste (déplacement, redimensionnement, rotation, inclinaison) relâché en `world`. */
  const gestureDraft = (gs: Gesture, world: Pt): QuiltDraft | null => {
    if (gs.kind === "move") {
      const first = gs.base.doc.items.find((i) => i.id === gs.ids[0]);
      if (!first) return null;
      let dx = world.x - gs.start.x;
      let dy = world.y - gs.start.y;
      if (options.snapPosition) {
        dx = snapTo(first.x + dx, options.snapStep) - first.x;
        dy = snapTo(first.y + dy, options.snapStep) - first.y;
      }
      return updateItems(gs.base, gs.ids, (i) => ({ x: i.x + dx, y: i.y + dy }));
    }
    if (gs.kind === "resize") {
      const item = gs.base.doc.items.find((i) => i.id === gs.id);
      if (!item) return null;
      const r = resizeByHandle(item, gs.handle, world, gs.keep);
      if (options.snapSize && item.angle === 0) {
        r.w = Math.max(options.snapStep, snapTo(r.w, options.snapStep));
        r.h = Math.max(options.snapStep, snapTo(r.h, options.snapStep));
      }
      return updateItem(gs.base, gs.id, r);
    }
    if (gs.kind === "rotate") {
      const item = gs.base.doc.items.find((i) => i.id === gs.id);
      return item ? updateItem(gs.base, gs.id, { angle: rotateByPointer(item, gs.start, world) }) : null;
    }
    if (gs.kind === "skew") {
      const item = gs.base.doc.items.find((i) => i.id === gs.id);
      return item ? updateItem(gs.base, gs.id, { skew: skewByPointer(item, gs.handle, world) }) : null;
    }
    return null;
  };
  const previewDraft = useMemo<QuiltDraft | null>(() => {
    void gestureTick;
    const gs = gesture.current;
    const at = gestureTarget.current;
    return gs && at ? gestureDraft(gs, at) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestureTick, draft, options.snapPosition, options.snapSize, options.snapStep]);

  const shownDraft = previewDraft ?? draft;
  const scene: Scene = useMemo(() => buildScene(project, shownDraft), [project, shownDraft]);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const liveSelected = useMemo(() => selected.filter((id) => scene.items.some((i) => i.item.id === id)), [selected, scene]);

  // ---- Bloc choisi dans la palette --------------------------------------------------------------------------

  const listItems = project.sketchbook[blockTab];
  const chosenBlock: BlockItem | null = useMemo(() => {
    if (!chosen) return null;
    for (const list of ["blocks", "motifs", "stencils"] as const) {
      const b = project.sketchbook[list].find((x) => x.id === chosen.blockId);
      if (b) return b;
    }
    return null;
  }, [chosen, project]);
  const chosenRef = (): BlockRef | null => {
    if (!chosen || !chosenBlock) return null;
    const idx = Math.min(chosen.index, chosenBlock.colorings.length);
    return { blockId: chosenBlock.id, coloringId: idx > 0 ? (chosenBlock.colorings[idx - 1]?.id ?? "") : "" };
  };
  // Un bloc du carnet est choisi par défaut dès qu'il y en a un.
  useEffect(() => {
    if (!chosenBlock && project.sketchbook.blocks.length > 0) {
      const first = project.sketchbook.blocks[0] as BlockItem;
      setChosen({ blockId: first.id, index: first.colorings.length > 0 ? first.colorings.length : 0 });
    }
  }, [chosenBlock, project.sketchbook.blocks]);

  // Une bordure automatique choisie ne reste pas armée quand on quitte l'onglet DESIGN.
  useEffect(() => {
    if (tab !== 3) setAutoPreset(null);
  }, [tab]);

  const execute = useCallback((label: string, change: (d: QuiltDraft) => QuiltDraft, key?: string) => editor.execute(label, change, key), [editor]);

  // ---- Disposition -------------------------------------------------------------------------------------------

  const changeLayout = (next: LayoutParams, key?: string) => execute(fr.quilt.history.layout, (d) => setLayout(d, project, next, options.maxBlocks), key ? `layout:${key}` : undefined);
  const changeKind = (kind: LayoutKind) => {
    execute(fr.quilt.history.newLayout, (d) => newLayout(d, kind, options.keepBorders));
    setSelected([]);
    setLayer(1);
    if (tab === 0) onTab(1);
  };

  // ---- Pose et coloration ------------------------------------------------------------------------------------

  const standard = isStandardLayout(layoutKind);
  const usePaint = (): Paint | null => paintStore.get().paint;

  const applyPaint = (label: string, pieces: readonly ScenePiece[], paint: Paint, coalesce?: string) => {
    if (pieces.length === 0) return;
    execute(label, (d) => paintPieces(d, pieces, paint), coalesce);
    paintStore.used(paint);
  };

  const placeAt = (world: Pt, mode: "one" | "all" | "alternate", ref: BlockRef, dropCenter = false) => {
    const sc = sceneRef.current;
    if (layer === 1) {
      // Les bordures reçoivent des blocs dans toutes les dispositions ; le centre, dans les dispositions standard.
      const slot = slotAtPoint(sc, world);
      if (slot && (standard || slot.slot.border)) {
        if (slot.slot.role === "piece") return notify(fr.quilt.messages.onePatchNoBlock);
        const keys = slotsForClick(sc, slot, mode);
        execute(fr.quilt.history.place, (d) => placeBlock(d, project, keys, ref, options.keepRotation));
        return;
      }
      if (!slot && pieceAtPoint(sc, world, 1)?.border) return notify(fr.quilt.borders.noBlocksHere);
      if (standard) return notify(fr.quilt.messages.noPiece);
    }
    if (layer === 1 && layoutKind === "onepatch") return notify(fr.quilt.messages.onePatchNoBlock);
    const found = [...project.sketchbook.blocks, ...project.sketchbook.motifs, ...project.sketchbook.stencils].find((b) => b.id === ref.blockId);
    if (!found) return;
    if (layer === 1 && found.id && project.sketchbook.motifs.some((m) => m.id === found.id)) return notify(fr.quilt.messages.motifLayer1);
    const w = options.dropSizeDesign ? found.width : DEFAULT_DROP_SIZE;
    const h = options.dropSizeDesign ? found.height : (DEFAULT_DROP_SIZE * found.height) / found.width;
    let x = dropCenter ? world.x - w / 2 : world.x;
    let y = dropCenter ? world.y - h / 2 : world.y;
    if (options.snapPosition) {
      x = snapTo(x, options.snapStep);
      y = snapTo(y, options.snapStep);
    }
    let id: Id | null = null;
    execute(fr.quilt.history.addItem, (d) => {
      const r = addItem(d, project, { layer, ref, x, y, w, h });
      id = r.id;
      return r.draft;
    });
    if (id) {
      setSelected([id]);
    }
  };

  const onDropBlock = (world: Pt, payload: string) => {
    try {
      const ref = JSON.parse(payload) as BlockRef;
      if (tab !== 3) return;
      placeAt(world, "one", ref, true);
    } catch {
      // Contenu inattendu : ignoré.
    }
  };

  const piecePick = (world: Pt, layerOnly = true): ScenePiece | null => {
    const sc = sceneRef.current;
    const hit = pieceAtPoint(sc, world, layerOnly ? layer : undefined);
    return hit && !hidden.has(hit.layer) ? hit : null;
  };

  const backToPaintTool = () => {
    if (options.autoToggle) setToolState(lastPaintTool.current);
  };

  const onPaintClick = (info: PointerInfo) => {
    const sc = sceneRef.current;
    const mode = clickMode(info.ctrl, info.alt);
    if (hidden.has(layer)) return notify(fr.quilt.messages.layerHidden);
    if (tool === "randomize") {
      let count = 0;
      const optionsOf: RandomizeOptions =
        random.mode === "shift"
          ? { kind: "shift", hue: random.hue, saturation: random.saturation, lightness: random.lightness }
          : random.mode === "random"
            ? { kind: "random", seed: Math.floor(Math.random() * 2 ** 31) }
            : random.mode === "matchColors"
              ? { kind: "matchColors", tolerance: random.tolerance }
              : { kind: "matchFabrics", tolerance: random.tolerance };
      execute(fr.quilt.history.randomize, (d) => {
        const next = randomize(d, buildScene(project, d), project, optionsOf);
        count = Object.keys(next.fills).filter((k) => next.fills[k] !== d.fills[k]).length;
        return next;
      });
      notify(fr.quilt.randomizeOptions.applied(count));
      return;
    }
    const piece = piecePick(info.world);
    if (tool === "selectSpray" || tool === "selectSwap") {
      if (!piece) return setSprayKeys([]);
      const pieces = tool === "selectSpray" ? sprayTargets(sc, piece, mode) : swapTargets(sc, piece, layer);
      return setSprayKeys(pieces.map((p) => p.key));
    }
    if (!piece) return notify(fr.quilt.messages.noPiece);
    if (tool === "eyedropperFabric" || tool === "eyedropperColor") {
      if (!piece.paint) return notify(fr.coloring.eyedropperNone);
      const found = tool === "eyedropperFabric" ? pipetteFabric(project, piece.paint) : pipetteColor(project, piece.paint);
      if (!found) return notify(fr.coloring.eyedropperNone);
      const entry = findPaletteEntry(project, found);
      paintStore.choose(found, entry?.tab ?? (found.kind === "fabric" ? "fabrics" : "colors"));
      if (!entry) notify(fr.coloring.eyedropperOutside);
      backToPaintTool();
      return;
    }
    if (tool === "rotateFabric") {
      if (layoutKind === "onepatch") return notify(fr.quilt.messages.noRotateOnePatch);
      if (piece.paint?.kind !== "fabric") return notify(fr.quilt.messages.fabricOnly);
      if (rotateMethod === "edge") {
        const same = edge && edge.key === piece.key;
        const edges = edgesByLength(piece.poly).length;
        const next = same ? { key: piece.key, index: info.shift ? (edge.index + 1) % Math.max(1, edges) : edge.index, quarters: info.shift ? 0 : edge.quarters + 1 } : { key: piece.key, index: 0, quarters: 0 };
        setEdge(next);
        const angle = alignedRotation(piece, next.index, next.quarters);
        if (angle === null) return notify(fr.quilt.messages.noPiece);
        execute(fr.quilt.history.rotateFabric, (d) => rotateFabric(d, [piece], () => angle));
        return;
      }
      const targets = brushTargets(sc, piece, mode).filter((p) => p.paint?.kind === "fabric");
      execute(fr.quilt.history.rotateFabric, (d) => rotateFabric(d, targets, (_, cur) => (rotateMethod === "simple" ? simpleRotation(cur) : advancedRotation(cur, advanced.start, advanced.count))));
      return;
    }
    if (tool === "fussy") return;
    const paint = usePaint();
    if (!paint) return notify(fr.quilt.messages.pickPaint);
    if (tool === "brush") applyPaint(fr.quilt.history.paint, brushTargets(sc, piece, mode), paint);
    else if (tool === "spray") applyPaint(fr.quilt.history.spray, sprayTargets(sc, piece, mode), paint);
    else if (tool === "swap") applyPaint(fr.quilt.history.swap, swapTargets(sc, piece), paint);
  };

  // « Sélectionner & vaporiser / échanger » : chaque choix dans la palette est essayé sur la sélection.
  const liveSpray = useMemo(() => {
    const keys = new Set(scene.pieces.map((p) => p.key));
    return sprayKeys.filter((k) => keys.has(k));
  }, [sprayKeys, scene]);
  const tryPaint = useCallback(
    (paint: Paint) => {
      if ((tool !== "selectSpray" && tool !== "selectSwap") || liveSpray.length === 0) return;
      const pieces = sceneRef.current.pieces.filter((p) => liveSpray.includes(p.key));
      execute(fr.quilt.history.paint, (d) => paintPieces(d, pieces, paint), `try:${liveSpray.join(",")}`);
      paintStore.used(paint);
    },
    [tool, liveSpray, execute],
  );

  useEffect(() => {
    if (tab !== 3 || (tool !== "selectSpray" && tool !== "selectSwap") || liveSpray.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
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
  }, [tab, tool, liveSpray, project, tryPaint]);

  // Coupe ciblée au clavier.
  useEffect(() => {
    if (tab !== 3 || tool !== "fussy" || !focusKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const step = e.ctrlKey || e.metaKey ? FUSSY_BIG_STEP : FUSSY_STEP;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      const piece = sceneRef.current.pieces.find((p) => p.key === focusKey);
      if (piece) execute(fr.quilt.history.fussy, (dr) => fussyCutPiece(dr, piece, d[0] as number, d[1] as number), `fussy-keys:${focusKey}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, tool, focusKey, execute]);

  // ---- Souris -----------------------------------------------------------------------------------------------

  const tolerance = (scale: number) => 9 / scale;

  const selectedItem = (): FreeItem | null => {
    if (liveSelected.length !== 1) return null;
    return draft.doc.items.find((i) => i.id === liveSelected[0]) ?? null;
  };

  const onPointer = (info: PointerInfo) => {
    if (info.kind === "leave") return setHoverSlot(null);
    if (tab === 4) return onPrintPointer(info);
    if (tab !== 3) {
      // Onglet BORDURES : un clic sur le quilt choisit la bordure.
      if (info.kind === "down" && tab === 2) {
        const piece = pieceAtPoint(sceneRef.current, info.world, 1);
        if (piece?.border) setSelectedBorder(piece.border);
        return;
      }
      // Onglet DISPOSITION : un clic choisit la bande ; sinon rien.
      if (info.kind === "down" && tab === 1 && (layoutKind === "stripsH" || layoutKind === "stripsV")) {
        const piece = pieceAtPoint(sceneRef.current, info.world);
        const index = piece ? Number(piece.owner.slice(1).split(".")[0]) : NaN;
        const l = draft.doc.layout;
        if ((l.kind === "stripsH" || l.kind === "stripsV") && Number.isInteger(index) && index !== l.selected) changeLayout({ ...l, selected: index });
      }
      return;
    }
    const sc = sceneRef.current;
    const gs = gesture.current;

    if (info.kind === "move") {
      if (gs) {
        gestureTarget.current = info.world;
        if (gs.kind === "stroke") {
          gs.points.push(info.world);
        } else if (gs.kind === "move") {
          gs.delta = { x: info.world.x - gs.start.x, y: info.world.y - gs.start.y };
        } else if (gs.kind === "fussy") {
          const dx = info.world.x - gs.last.x;
          const dy = info.world.y - gs.last.y;
          gs.last = info.world;
          const piece = gs.piece;
          execute(fr.quilt.history.fussy, (d) => fussyCutPiece(d, piece, dx, dy), `fussy:${gs.id}`);
        } else if (gs.kind === "tape") {
          gs.b = info.world;
          setTapeText(fr.quilt.tape(formatLength(Math.hypot(gs.b.x - gs.a.x, gs.b.y - gs.a.y), unit)));
        }
        refresh();
        return;
      }
      if (tool === "set" && layer === 1 && !autoPreset) {
        const slot = slotAtPoint(sc, info.world);
        setHoverSlot(slot && slot.slot.role !== "piece" && (standard || slot.slot.border) ? slot.slot.key : null);
      } else if (hoverSlot) setHoverSlot(null);
      return;
    }

    if (info.kind === "up") {
      if (!gs) return;
      gesture.current = null;
      gestureTarget.current = null;
      if (gs.kind === "stroke") {
        const samples = sampleStroke(gs.style, gs.points);
        const pieces = piecesTouchedBy(sc, samples, layer);
        applyPaint(fr.quilt.history.stroke, pieces, gs.paint);
      } else if (gs.kind === "move" || gs.kind === "resize" || gs.kind === "rotate" || gs.kind === "skew") {
        const final = gestureDraft(gs, info.world);
        if (final) execute(gs.kind === "move" ? fr.quilt.history.moveItem : fr.quilt.history.resizeItem, () => final);
      }
      refresh();
      return;
    }

    // down
    if (autoPreset) {
      // Une bordure automatique choisie : un clic sur une bordure du quilt la remplit.
      const piece = pieceAtPoint(sc, info.world, 1);
      if (!piece?.border) return notify(fr.quilt.borders.auto.pickBorder);
      const id = piece.border;
      const preset = autoPreset;
      execute(fr.quilt.borders.history.auto, (d) => applyAutoBorder(d, project, id, preset));
      setSelectedBorder(id);
      notify(fr.quilt.borders.auto.applied(preset.name));
      return;
    }
    if (hidden.has(layer) && tool !== "tape") return notify(fr.quilt.messages.layerHidden);
    if (tool === "tape") {
      gesture.current = { kind: "tape", a: info.world, b: info.world };
      setTapeText("");
      refresh();
      return;
    }
    if ((PAINT_TOOLS as string[]).includes(tool)) {
      if (tool === "brush" && brushStyle !== "dot") {
        const paint = usePaint();
        if (!paint) return notify(fr.quilt.messages.pickPaint);
        gesture.current = { kind: "stroke", style: brushStyle, points: [info.world], mode: "one", paint };
        refresh();
        return;
      }
      if (tool === "fussy") {
        const piece = piecePick(info.world);
        if (!piece) return setFocusKey(null);
        if (piece.paint?.kind !== "fabric") {
          setFocusKey(null);
          return notify(fr.quilt.messages.fabricNeeded);
        }
        setFocusKey(piece.key);
        fussyCount.current += 1;
        gesture.current = { kind: "fussy", piece, last: info.world, id: fussyCount.current };
        return;
      }
      return onPaintClick(info);
    }
    switch (tool) {
      case "set": {
        const ref = chosenRef();
        if (!ref) return notify(fr.quilt.messages.pickBlock);
        return placeAt(info.world, clickMode(info.ctrl, info.alt), ref);
      }
      case "eyedropperBlock": {
        const piece = piecePick(info.world);
        if (!piece?.ref) return notify(fr.quilt.messages.noPiece);
        const block = [...project.sketchbook.blocks, ...project.sketchbook.motifs, ...project.sketchbook.stencils].find((b) => b.id === piece.ref?.blockId);
        if (!block) return;
        const index = piece.ref.coloringId ? block.colorings.findIndex((c) => c.id === piece.ref?.coloringId) + 1 : 0;
        const list: BlockListKey = project.sketchbook.motifs.includes(block) ? "motifs" : project.sketchbook.stencils.includes(block) ? "stencils" : "blocks";
        setBlockTab(list);
        setChosen({ blockId: block.id, index: Math.max(0, index) });
        if (options.autoToggle) setToolState("set");
        return;
      }
      case "rotate":
      case "mirror": {
        const item = itemAtPoint(sc, info.world, layer);
        if (item) {
          const ids = info.ctrl ? draft.doc.items.filter((i) => i.layer === layer).map((i) => i.id) : [item.item.id];
          return execute(fr.quilt.history.turn, (d) =>
            updateItems(d, ids, (i) => (tool === "rotate" ? { rot: (((i.rot + 1) % 4) as 0 | 1 | 2 | 3) } : { flip: !i.flip })),
          );
        }
        if (layer !== 1) return;
        const slot = slotAtPoint(sc, info.world);
        if (!slot || !(standard || slot.slot.border)) return;
        const keys = slotsForClick(sc, slot, clickMode(info.ctrl, info.alt)).filter((k) => draft.doc.set[k]);
        return execute(fr.quilt.history.turn, (d) => turnSlots(d, keys, tool === "rotate" ? "rotate" : "mirror"));
      }
      case "erase": {
        if (info.ctrl) return execute(fr.quilt.history.clear, clearQuilt);
        const item = itemAtPoint(sc, info.world, layer);
        if (item) return execute(fr.quilt.history.erase, (d) => deleteItems(d, [item.item.id]));
        if (layer !== 1) return;
        const slot = slotAtPoint(sc, info.world);
        if (!slot || !(standard || slot.slot.border)) return;
        return execute(fr.quilt.history.erase, (d) => eraseSlots(d, slotsForClick(sc, slot, clickMode(false, info.alt))));
      }
      case "symmetry": {
        if (layer !== 1) return;
        const sym = symmetry.current;
        if (sym.set !== draft.doc.set) symmetry.current = { base: orientationOf(draft), clicks: 0, set: draft.doc.set };
        const state = symmetry.current;
        state.clicks += 1;
        execute(fr.quilt.history.symmetry, (d) => {
          const next = applySymmetry(d, state.base, buildScene(project, d), state.clicks);
          state.set = next.doc.set;
          return next;
        });
        return;
      }
      case "adjust":
        return adjustDown(info);
    }
  };

  // Onglet IMPRIMER & EXPORTER : un clic choisit l'élément du calque ; en mode Sélection, on tire un rectangle.
  const onPrintPointer = (info: PointerInfo) => {
    if (selectionMode) {
      if (info.kind === "down") {
        marqueeStart.current = info.world;
        setMarquee({ a: info.world, b: info.world });
      } else if (info.kind === "move" && marqueeStart.current) {
        setMarquee({ a: marqueeStart.current, b: info.world });
      } else if (info.kind === "up" && marqueeStart.current) {
        const a = marqueeStart.current;
        marqueeStart.current = null;
        const x0 = Math.min(a.x, info.world.x);
        const y0 = Math.min(a.y, info.world.y);
        const w = Math.abs(info.world.x - a.x);
        const h = Math.abs(info.world.y - a.y);
        if (w < 0.05 || h < 0.05) {
          setMarquee(null);
          return notify(fr.print.selection.empty);
        }
        const sc = sceneRef.current;
        setSelectionPic({ name: quiltTitle, x0, y0, width: w, height: h, items: (o) => quiltPicture(sc, printContext(project, currentProjectName(), unit), { style: "fabric", blockOutlines: o.blockOutlines, pieceOutlines: o.pieceOutlines, lineWidth: 0.75 }) });
      }
      return;
    }
    if (info.kind !== "down") return;
    const piece = pieceAtPoint(sceneRef.current, info.world, layer);
    setPrintOwner(piece && !hidden.has(piece.layer) ? piece.owner : null);
  };

  const adjustDown = (info: PointerInfo) => {
    const sc = sceneRef.current;
    const only = selectedItem();
    if (only) {
      const handle = hitHandle(only, info.world, tolerance(info.scale));
      if (handle) {
        if (rotateMode && isCorner(handle)) {
          gesture.current = { kind: "rotate", id: only.id, start: info.world, base: draft };
        } else if (rotateMode) {
          gesture.current = { kind: "skew", id: only.id, handle, base: draft };
        } else {
          gesture.current = { kind: "resize", id: only.id, handle, base: draft, keep: keepProportions || (isCorner(handle) && info.shift) };
        }
        gestureTarget.current = info.world;
        refresh();
        return;
      }
    }
    const hit = itemAtPoint(sc, info.world, layer);
    if (!hit) {
      setSelected([]);
      setRotateMode(false);
      return;
    }
    const id = hit.item.id;
    if (info.ctrl) {
      // Ctrl+clic : le mode rotation (poignées de coin = rotation, de côté = inclinaison).
      setSelected([id]);
      setRotateMode((m) => (liveSelected.length === 1 && liveSelected[0] === id ? !m : true));
      return;
    }
    let ids: Id[];
    if (info.shift) ids = liveSelected.includes(id) ? liveSelected.filter((x) => x !== id) : [...liveSelected, id];
    else ids = liveSelected.includes(id) ? [...liveSelected] : [id];
    setSelected(ids);
    if (!info.shift) setRotateMode(false);
    if (ids.includes(id)) {
      gesture.current = { kind: "move", ids, start: info.world, base: draft, delta: { x: 0, y: 0 } };
      gestureTarget.current = info.world;
      refresh();
    }
  };

  // ---- Clavier : Suppr, copier, coller ----------------------------------------------------------------------

  useEffect(() => {
    if (tab !== 3 || tool !== "adjust") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (liveSelected.length === 0) return;
        e.preventDefault();
        execute(fr.quilt.history.deleteItem, (d) => deleteItems(d, liveSelected));
        setSelected([]);
      } else if (mod && e.key.toLowerCase() === "c") {
        copy();
      } else if (mod && e.key.toLowerCase() === "v") {
        paste();
      } else if (e.key === "Escape") {
        setSelected([]);
        setRotateMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, tool, liveSelected, draft]);

  const copy = () => {
    const items = draft.doc.items.filter((i) => liveSelected.includes(i.id));
    clipboard.current = items;
    if (items.length > 0) notify(fr.quilt.messages.copied(items.length));
  };
  const paste = () => {
    if (clipboard.current.length === 0) return notify(fr.quilt.messages.nothingToPaste);
    let ids: Id[] = [];
    execute(fr.quilt.history.pasteItem, (d) => {
      const r = pasteItems(d, clipboard.current, 1);
      ids = r.ids;
      return r.draft;
    });
    setSelected(ids);
    clipboard.current = clipboard.current.map((c) => ({ ...c, x: c.x + 1, y: c.y + 1 }));
  };

  // ---- Affichage ---------------------------------------------------------------------------------------------

  const layoutResult = scene.layout;
  const total = finishedSize(layoutResult.width, layoutResult.height, shownDraft.doc.borders);
  const finished = fr.quilt.finished(formatLength(total.width, unit, 3), formatLength(total.height, unit, 3));
  const borders = draft.doc.borders;
  const activeBorder = borders.some((b) => b.id === selectedBorder) ? selectedBorder : (borders[borders.length - 1]?.id ?? null);
  const only = selectedItem();
  const shownOnly = only ? (shownDraft.doc.items.find((i) => i.id === only.id) ?? only) : null;
  const handles =
    tab === 3 && tool === "adjust" && shownOnly
      ? { corners: CORNER_HANDLES.map((h) => handlePoint(shownOnly, h)), sides: SIDE_HANDLES.map((h) => handlePoint(shownOnly, h)), rotateMode }
      : null;

  const stripLayout = draft.doc.layout.kind === "stripsH" || draft.doc.layout.kind === "stripsV" ? draft.doc.layout : null;
  const hoverPoly = useMemo(() => {
    if (tab === 1 && stripLayout) {
      const mine = scene.layout.slots.filter((s) => s.key.startsWith(`s${stripLayout.selected}.`));
      if (mine.length === 0) return null;
      const box = boxOf(mine.flatMap((s) => s.poly));
      return [
        { x: box.x0, y: box.y0 },
        { x: box.x1, y: box.y0 },
        { x: box.x1, y: box.y1 },
        { x: box.x0, y: box.y1 },
      ];
    }
    if (hoverSlot) return scene.slots.find((s) => s.slot.key === hoverSlot)?.slot.poly ?? null;
    return null;
  }, [tab, stripLayout, scene, hoverSlot]);

  const gs = gesture.current;
  const edgeMark = useMemo(() => {
    if (!edge) return null;
    const piece = scene.pieces.find((p) => p.key === edge.key);
    const e = piece ? edgesByLength(piece.poly)[edge.index] : undefined;
    return e ? { a: e.a, b: e.b } : null;
  }, [edge, scene]);

  const quiltTitle = (quiltEditor.sourceQuiltId ? project.sketchbook.quilts.find((q) => q.id === quiltEditor.sourceQuiltId)?.card.name : undefined) || fr.quilt.quiltName;
  const printElement = useMemo(() => (tab === 4 && printOwner ? quiltElement(scene, project, printOwner, fr.print.roles) : null), [tab, printOwner, scene, project]);
  const printEnabled = useMemo(() => {
    const kinds = new Set<PrintKind>(["quilt", "yardage"]);
    if (printElement) {
      kinds.add("block").add("templates").add("foundation");
      const pb = quiltSource(scene, printElement.owner, printElement.name, null, false);
      if (pb && rotaryChart(pb, 0.25, "1/16", unit).cuts.length > 0) kinds.add("rotary");
    }
    return kinds;
  }, [printElement, scene, unit]);
  const printBlockId = printElement ? (scene.pieces.find((p) => p.owner === printElement.owner && p.ref)?.ref?.blockId ?? null) : null;
  const sourceQuiltId = quiltEditor.sourceQuiltId;
  const printSubject = useMemo<PrintSubject>(
    () =>
      printing !== "quilt" && printing !== "yardage" && printElement
        ? { from: "quilt", scene, element: printElement, blockId: printBlockId }
        : { from: "quiltWhole", scene, name: quiltTitle, quiltId: sourceQuiltId },
    [printing, printElement, scene, printBlockId, quiltTitle, sourceQuiltId],
  );
  const pictures = (): { whole: Picture; selected: Picture | null } => {
    const ctx = printContext(project, currentProjectName(), unit);
    const b = scene.bounds;
    const sc = scene;
    const whole: Picture = { name: quiltTitle, x0: b.x0, y0: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0, items: (o) => quiltPicture(sc, ctx, { style: "fabric", blockOutlines: o.blockOutlines, pieceOutlines: o.pieceOutlines, lineWidth: 0.75 }) };
    const pb = printElement ? quiltSource(sc, printElement.owner, printElement.name, null, false) : null;
    const selected: Picture | null = pb ? { name: pb.name, x0: 0, y0: 0, width: pb.width, height: pb.height, items: (o) => blockPicture(pb, project, { style: "fabric", width: 0.75, blockOutline: o.blockOutlines, pieceOutlines: o.pieceOutlines }) } : null;
    return { whole, selected };
  };

  const paintProps = {
    scene,
    printMark: tab === 4 && printElement && !selectionMode ? printElement.outline : null,
    marquee: tab === 4 && selectionMode ? marquee : null,
    project,
    assets: current.assets,
    hidden: tab === 3 ? hidden : (new Set<Layer>() as ReadonlySet<Layer>),
    selectedBorder: tab === 2 ? activeBorder : null,
    seams,
    selected: new Set(liveSelected) as ReadonlySet<Id>,
    handles,
    highlight: new Set(liveSpray) as ReadonlySet<string>,
    focusKey: tool === "fussy" ? focusKey : null,
    ghost: null,
    hoverPoly,
    stroke: gs?.kind === "stroke" ? sampleStroke(gs.style === "freehand" ? "freehand" : gs.style, gs.points, 0.2) : null,
    tape: gs?.kind === "tape" ? { a: gs.a, b: gs.b } : null,
    edgeMark: tool === "rotateFabric" ? edgeMark : null,
    grid: tab === 3 && layoutKind === "custom" && options.showGrid && tool === "adjust" ? { step: options.snapStep } : null,
    rulers: options.rulers,
    rulerUnit: unit === "in" ? { perInch: 1, label: "po" } : { perInch: 1 / 2.54, label: "cm" },
    palette: readPalette(),
  };
  const { palette: _unused, ...canvasPaint } = paintProps;
  void _unused;

  const cursor = tab !== 3 ? "default" : tool === "adjust" ? "default" : tool === "tape" ? "crosshair" : (PAINT_TOOLS as string[]).includes(tool) ? (tool === "fussy" ? "move" : tool.startsWith("eyedropper") ? "copy" : "pointer") : "pointer";

  // ---- Palettes ---------------------------------------------------------------------------------------------

  const unitSize = (v: number) => Math.round((unit === "in" ? v : v * 2.54) * 1e4) / 1e4;
  const toIn = (v: number) => (unit === "in" ? v : v / 2.54);

  const blockPalette = (
    <div className="palette-group" data-testid="block-palette">
      <h3>{fr.quilt.palette.blocks}</h3>
      <div className="palette-tabs" role="tablist">
        {(["blocks", "motifs", "stencils"] as BlockListKey[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={blockTab === k} data-testid={`btab-${k}`} onClick={() => setBlockTab(k)}>
            {fr.quilt.palette[k]}
          </button>
        ))}
        <span className="palette-tabs-spacer" />
        {blockTab === "blocks" && (
          <button
            type="button"
            className="btn btn--tiny"
            data-testid="add-plain-block"
            title={fr.quilt.palette.addPlain}
            onClick={() => {
              const plain: BlockItem = {
                id: createId(),
                card: emptyNotecard(fr.quilt.palette.plainName),
                width: 6,
                height: 6,
                drawing: { kind: "easydraw", segments: [] } as never,
                colorings: [],
              };
              current.execute(fr.quilt.history.addPlain, (p) => addToSketchbook(p, "blocks", plain).project);
              setChosen({ blockId: plain.id, index: 0 });
            }}
          >
            +
          </button>
        )}
      </div>
      <div className="block-thumbs" role="listbox" aria-label={fr.quilt.palette[blockTab]} data-testid="block-thumbs">
        {listItems.length === 0 && <p className="palette-hint">{blockTab === "blocks" ? fr.quilt.palette.none : blockTab === "motifs" ? fr.quilt.palette.noneMotifs : fr.quilt.palette.noneStencils}</p>}
        {listItems.map((b) => {
          const isChosen = chosen?.blockId === b.id;
          const index = isChosen ? Math.min(chosen.index, b.colorings.length) : b.colorings.length;
          return (
            <button
              key={b.id}
              type="button"
              role="option"
              aria-selected={isChosen}
              className={`block-thumb${isChosen ? " block-thumb--chosen" : ""}`}
              data-testid="block-thumb"
              data-block={b.id}
              title={b.card.name}
              draggable
              onDragStart={(e) => {
                const ref: BlockRef = { blockId: b.id, coloringId: index > 0 ? (b.colorings[index - 1]?.id ?? "") : "" };
                e.dataTransfer.setData(DROP_MIME, JSON.stringify(ref));
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => setChosen({ blockId: b.id, index: isChosen ? chosen.index : b.colorings.length })}
            >
              <BlockSvg block={b} coloringIndex={index} fillOf={(paint) => pieceFill(project, current.assets, paint) ?? { color: "#9e9e9e" }} />
            </button>
          );
        })}
      </div>
      {chosenBlock && (
        <div className="coloring-nav" data-testid="block-coloring-nav">
          <button
            type="button"
            className="btn btn--small"
            data-testid="block-coloring-prev"
            title={fr.quilt.palette.previousColoring}
            aria-label={fr.quilt.palette.previousColoring}
            disabled={!chosen || chosen.index <= 0}
            onClick={() => chosen && setChosen({ ...chosen, index: chosen.index - 1 })}
          >
            ◀
          </button>
          <span data-testid="block-coloring-label">{fr.quilt.palette.coloring(Math.min(chosen?.index ?? 0, chosenBlock.colorings.length), chosenBlock.colorings.length)}</span>
          <button
            type="button"
            className="btn btn--small"
            data-testid="block-coloring-next"
            title={fr.quilt.palette.nextColoring}
            aria-label={fr.quilt.palette.nextColoring}
            disabled={!chosen || chosen.index >= chosenBlock.colorings.length}
            onClick={() => chosen && setChosen({ ...chosen, index: chosen.index + 1 })}
          >
            ▶
          </button>
        </div>
      )}
      <p className="palette-hint" data-testid="block-chosen">
        {chosenBlock ? fr.quilt.palette.chosen(chosenBlock.card.name) : fr.quilt.palette.noneChosen}
      </p>
    </div>
  );

  const adjustPanel = tool === "adjust" && (
    <div className="palette-group" data-testid="adjust-panel">
      <h3>{fr.quilt.adjust.title}</h3>
      <p className="palette-hint" data-testid="adjust-count">
        {liveSelected.length === 0 ? fr.quilt.adjust.none : fr.quilt.adjust.selected(liveSelected.length)}
      </p>
      {shownOnly && (
        <>
          {(() => {
            const ext = itemExtent(shownOnly);
            const patch = (p: Partial<FreeItem>, label = fr.quilt.history.editItem) => execute(label, (d) => updateItem(d, shownOnly.id, p), `edit:${shownOnly.id}`);
            return (
              <>
                <div className="field-row">
                  <NumberField label={fr.quilt.adjust.x} value={unitSize(ext.x)} decimals={3} testId="adjust-x" onCommit={(n) => (patch({ x: shownOnly.x + (toIn(n) - ext.x) }), true)} />
                  <NumberField label={fr.quilt.adjust.y} value={unitSize(ext.y)} decimals={3} testId="adjust-y" onCommit={(n) => (patch({ y: shownOnly.y + (toIn(n) - ext.y) }), true)} />
                </div>
                <div className="field-row">
                  <NumberField
                    label={fr.quilt.adjust.width}
                    value={unitSize(shownOnly.w)}
                    decimals={3}
                    testId="adjust-w"
                    onCommit={(n) => {
                      const w = toIn(n);
                      if (w <= 0) return false;
                      const ratio = shownOnly.h / shownOnly.w;
                      patch({ w, ...(keepProportions ? { h: w * ratio } : {}), x: shownOnly.x + (shownOnly.w - w) / 2 * 0 });
                      return true;
                    }}
                  />
                  <NumberField
                    label={fr.quilt.adjust.height}
                    value={unitSize(shownOnly.h)}
                    decimals={3}
                    testId="adjust-h"
                    onCommit={(n) => {
                      const h = toIn(n);
                      if (h <= 0) return false;
                      const ratio = shownOnly.w / shownOnly.h;
                      patch({ h, ...(keepProportions ? { w: h * ratio } : {}) });
                      return true;
                    }}
                  />
                </div>
                <div className="field-row">
                  <NumberField label={fr.quilt.adjust.rotation} value={shownOnly.angle} decimals={2} testId="adjust-angle" onCommit={(n) => (patch({ angle: n }), true)} />
                  <NumberField label={fr.quilt.adjust.skew} value={shownOnly.skew} decimals={2} testId="adjust-skew" onCommit={(n) => (patch({ skew: n }), true)} />
                </div>
              </>
            );
          })()}
        </>
      )}
      <Check label={fr.quilt.adjust.keepProportions} checked={keepProportions} testId="adjust-keep" onChange={setKeepProportions} />
      <Check label={fr.quilt.adjust.rotateMode} checked={rotateMode} testId="adjust-rotate-mode" onChange={setRotateMode} />
      <div className="button-grid">
        <button type="button" className="btn btn--small" data-testid="adjust-copy" disabled={liveSelected.length === 0} onClick={copy}>
          {fr.quilt.adjust.copy}
        </button>
        <button type="button" className="btn btn--small" data-testid="adjust-paste" onClick={paste}>
          {fr.quilt.adjust.paste}
        </button>
        <button
          type="button"
          className="btn btn--small"
          data-testid="adjust-delete"
          disabled={liveSelected.length === 0}
          onClick={() => {
            execute(fr.quilt.history.deleteItem, (d) => deleteItems(d, liveSelected));
            setSelected([]);
          }}
        >
          {fr.quilt.adjust.delete}
        </button>
      </div>
      <span className="palette-subtitle">{fr.quilt.adjust.order}</span>
      <div className="button-grid">
        {(["front", "back", "forward", "backward"] as const).map((m) => (
          <button key={m} type="button" className="btn btn--small" data-testid={`stack-${m}`} disabled={liveSelected.length === 0} onClick={() => execute(fr.quilt.history.stack, (d) => stackItems(d, liveSelected, m))}>
            {fr.quilt.adjust[m]}
          </button>
        ))}
      </div>
      <span className="palette-subtitle">{fr.quilt.adjust.center}</span>
      <div className="button-grid">
        {([
          ["h", fr.quilt.adjust.centerH],
          ["v", fr.quilt.adjust.centerV],
          ["both", fr.quilt.adjust.centerBoth],
        ] as const).map(([axis, label]) => (
          <button key={axis} type="button" className="btn btn--small" data-testid={`center-${axis}`} disabled={liveSelected.length === 0} onClick={() => execute(fr.quilt.history.center, (d) => centerItems(d, liveSelected, axis))}>
            {label}
          </button>
        ))}
      </div>
      <span className="palette-subtitle">{fr.quilt.adjust.clip}</span>
      <div className="button-grid">
        {([
          ["edge", fr.quilt.adjust.clipEdge],
          ["border", fr.quilt.adjust.clipBorder],
          ["none", fr.quilt.adjust.clipNone],
        ] as const).map(([c, label]) => (
          <button key={c} type="button" className="btn btn--small" data-testid={`clip-${c}`} disabled={liveSelected.length === 0} onClick={() => execute(fr.quilt.history.clip, (d) => clipItems(d, liveSelected, c))}>
            {label}
          </button>
        ))}
      </div>
      {liveSelected.length > 1 && (
        <>
          <span className="palette-subtitle">{fr.quilt.adjust.align}</span>
          <div className="button-grid">
            {([
              ["left", fr.quilt.adjust.alignLeft],
              ["right", fr.quilt.adjust.alignRight],
              ["top", fr.quilt.adjust.alignTop],
              ["bottom", fr.quilt.adjust.alignBottom],
            ] as const).map(([side, label]) => (
              <button key={side} type="button" className="btn btn--small" data-testid={`align-${side}`} onClick={() => execute(fr.quilt.history.align, (d) => alignItems(d, liveSelected, side))}>
                {label}
              </button>
            ))}
          </div>
          <span className="palette-subtitle">{fr.quilt.adjust.sameSize}</span>
          <div className="button-grid">
            {([
              ["width", fr.quilt.adjust.sameWidth],
              ["height", fr.quilt.adjust.sameHeight],
              ["both", fr.quilt.adjust.sameBoth],
            ] as const).map(([dim, label]) => (
              <button key={dim} type="button" className="btn btn--small" data-testid={`same-${dim}`} onClick={() => execute(fr.quilt.history.sameSize, (d) => sameSize(d, liveSelected, dim))}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      <h3>{fr.quilt.snap.title}</h3>
      <Check label={fr.quilt.snap.show} checked={options.showGrid} testId="snap-show" onChange={(v) => setOption("showGrid", v)} />
      <Check label={fr.quilt.snap.position} checked={options.snapPosition} testId="snap-position" onChange={(v) => setOption("snapPosition", v)} />
      <Check label={fr.quilt.snap.size} checked={options.snapSize} testId="snap-size" onChange={(v) => setOption("snapSize", v)} />
      <label className="field">
        <span className="field-label">{fr.quilt.snap.step}</span>
        <select className="field-input" value={String(options.snapStep)} data-testid="snap-step" onChange={(e) => setOption("snapStep", Number(e.target.value))}>
          {SNAP_STEPS.map((s, i) => (
            <option key={s} value={String(s)}>
              {SNAP_LABELS[i]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const paintOptions = (
    <>
      {tool === "brush" && (
        <div className="button-grid button-grid--5" role="group" aria-label={fr.quilt.paintTools.brush}>
          {BRUSH_STYLES.map((s) => (
            <button key={s} type="button" className="tool-button" data-testid={`brush-${s}`} aria-pressed={brushStyle === s} onClick={() => setBrushStyle(s)}>
              {fr.quilt.brushStyles[s]}
            </button>
          ))}
        </div>
      )}
      {tool === "rotateFabric" && (
        <div className="palette-group" data-testid="rotate-options">
          <div className="radio-row">
            {(["simple", "advanced", "edge"] as RotateMethod[]).map((m) => (
              <label key={m} className="check">
                <input type="radio" name="rotate-method" checked={rotateMethod === m} data-testid={`rotate-${m}`} onChange={() => setRotateMethod(m)} />
                <span>{fr.quilt.rotateMethods[m]}</span>
              </label>
            ))}
          </div>
          {rotateMethod === "advanced" && (
            <div className="field-row">
              <NumberField label={fr.quilt.rotateAdvanced.start} value={advanced.start} decimals={0} testId="rotate-start" onCommit={(n) => (n >= 0 && n <= 359 ? (setAdvanced((a) => ({ ...a, start: n })), true) : false)} />
              <NumberField label={fr.quilt.rotateAdvanced.count} value={advanced.count} decimals={0} testId="rotate-count" onCommit={(n) => (n >= 1 && n <= 16 ? (setAdvanced((a) => ({ ...a, count: n })), true) : false)} />
            </div>
          )}
          {rotateMethod === "edge" && <p className="palette-hint">{fr.quilt.rotateEdgeHelp}</p>}
        </div>
      )}
      {tool === "randomize" && (
        <div className="palette-group" data-testid="randomize-options">
          <h3>{fr.quilt.randomizeOptions.title}</h3>
          <div className="radio-row">
            {(["shift", "random", "matchColors", "matchFabrics"] as const).map((m) => (
              <label key={m} className="check">
                <input type="radio" name="random-mode" checked={random.mode === m} data-testid={`random-${m}`} onChange={() => setRandom((r) => ({ ...r, mode: m }))} />
                <span>{fr.quilt.randomizeOptions.mode[m]}</span>
              </label>
            ))}
          </div>
          {random.mode === "shift" && (
            <>
              <NumberField label={fr.quilt.randomizeOptions.hue} value={random.hue} decimals={0} testId="random-hue" onCommit={(n) => (n >= -40 && n <= 40 ? (setRandom((r) => ({ ...r, hue: n })), true) : false)} />
              <NumberField label={fr.quilt.randomizeOptions.saturation} value={random.saturation} decimals={0} testId="random-sat" onCommit={(n) => (n >= -20 && n <= 20 ? (setRandom((r) => ({ ...r, saturation: n })), true) : false)} />
              <NumberField label={fr.quilt.randomizeOptions.lightness} value={random.lightness} decimals={0} testId="random-light" onCommit={(n) => (n >= -20 && n <= 20 ? (setRandom((r) => ({ ...r, lightness: n })), true) : false)} />
            </>
          )}
          {(random.mode === "matchColors" || random.mode === "matchFabrics") && (
            <NumberField label={fr.quilt.randomizeOptions.tolerance} value={random.tolerance} decimals={0} testId="random-tolerance" onCommit={(n) => (n >= 0 && n <= 500 ? (setRandom((r) => ({ ...r, tolerance: n })), true) : false)} />
          )}
        </div>
      )}
    </>
  );

  const designPalette = (
    <>
      <div className="palette-group" role="group" aria-label={fr.quilt.blockTools}>
        <h3>{fr.quilt.blockTools}</h3>
        <div className="tool-grid">
          {BLOCK_TOOLS.map((id) => (
            <button key={id} type="button" className="tool-button" data-testid={`qtool-${id}`} aria-pressed={tool === id} onClick={() => setTool(id)}>
              {fr.quilt.tools[id]}
            </button>
          ))}
        </div>
        {(BLOCK_TOOLS as string[]).includes(tool) && <p className="palette-hint">{fr.quilt.toolHelp[tool as BlockTool]}</p>}
        {tool === "tape" && (
          <p className="palette-hint palette-hint--strong" data-testid="tape-length">
            {tapeText}
          </p>
        )}
      </div>
      {blockPalette}
      <AutoBorders active={autoPreset?.id ?? null} onPick={(p) => setAutoPreset(p)} />
      {adjustPanel}
      <div className="palette-group" role="group" aria-label={fr.quilt.fabricTools}>
        <h3>{fr.quilt.fabricTools}</h3>
        <div className="tool-grid">
          {PAINT_TOOLS.map((id) => (
            <button key={id} type="button" className="tool-button" data-testid={`qtool-${id}`} aria-pressed={tool === id} onClick={() => setTool(id)}>
              {fr.quilt.paintTools[id]}
            </button>
          ))}
        </div>
        {(PAINT_TOOLS as string[]).includes(tool) && <p className="palette-hint">{fr.quilt.paintHelp[tool as PaintTool]}</p>}
        {(tool === "selectSpray" || tool === "selectSwap") && liveSpray.length > 0 && (
          <p className="palette-hint palette-hint--strong" data-testid="spray-selection">
            {fr.coloring.selected(liveSpray.length)}
          </p>
        )}
      </div>
      {paintOptions}
      <PaintSwatches project={project} onPick={tryPaint} onColorMenu={colorTools.openMenu} />
      <SelectionPreview project={project} paint={paintState.paint} />
      <div className="palette-group">
        <h3>{fr.quilt.options.title}</h3>
        <Check label={fr.quilt.options.rulers} checked={options.rulers} testId="opt-rulers" onChange={(v) => setOption("rulers", v)} />
        <Check label={fr.quilt.options.keepRotation} checked={options.keepRotation} testId="opt-keep-rotation" onChange={(v) => setOption("keepRotation", v)} />
        <Check label={fr.quilt.options.autoToggle} checked={options.autoToggle} testId="opt-auto-toggle" onChange={(v) => setOption("autoToggle", v)} />
        <Check label={fr.quilt.options.dropSize} checked={options.dropSizeDesign} testId="opt-drop-size" onChange={(v) => setOption("dropSizeDesign", v)} />
        <NumberField label={fr.quilt.options.maxBlocks} value={options.maxBlocks} decimals={0} testId="opt-max-blocks" onCommit={(n) => (Number.isInteger(n) && n >= 24 && n <= 100 ? (setOption("maxBlocks", n), true) : false)} />
      </div>
    </>
  );

  const palette = (
    <aside className="palette palette--block palette--quilt" aria-label={fr.palette.title} data-testid="quilt-palette">
      <h2 className="palette-title">{fr.ribbon.quilt[tab]}</h2>
      {tab === 0 && <KindChooser current={layoutKind} onKind={changeKind} />}
      {tab === 1 && (
        <LayoutPanel
          layout={draft.doc.layout}
          unit={unit}
          maxBlocks={options.maxBlocks}
          onChange={changeLayout}
          onKind={changeKind}
          onResizeCustom={(w, h, keep) => execute(fr.quilt.history.resizeCustom, (d) => resizeCustom(d, w, h, keep), "resize-custom")}
        />
      )}
      {tab === 2 && (
        <BorderPanel
          borders={borders}
          selectedId={activeBorder}
          unit={unit}
          keepBorders={options.keepBorders}
          defaultStyle={options.borderStyle}
          onSelect={setSelectedBorder}
          onAdd={(clone) => {
            let id: string | null = null;
            execute(fr.quilt.borders.history.add, (d) => {
              const r = addBorder(d, { style: options.borderStyle, selected: activeBorder, clone });
              id = r.id;
              return r.draft;
            });
            if (id) setSelectedBorder(id);
          }}
          onInsert={(clone) => {
            let id: string | null = null;
            execute(fr.quilt.borders.history.insert, (d) => {
              const r = insertBorder(d, { style: options.borderStyle, selected: activeBorder, clone });
              id = r.id;
              return r.draft;
            });
            if (id) setSelectedBorder(id);
          }}
          onRemove={() => {
            if (!activeBorder) return;
            const at = borders.findIndex((b) => b.id === activeBorder);
            execute(fr.quilt.borders.history.remove, (d) => removeBorder(d, project, activeBorder));
            setSelectedBorder(borders[Math.max(0, at - 1) === at ? 1 : Math.max(0, at - 1)]?.id ?? null);
          }}
          onStyle={(style) => activeBorder && execute(fr.quilt.borders.history.style, (d) => setBorderStyle(d, project, activeBorder, style))}
          onSize={(side: BorderSide, inches: number, lock: SizeLock) => activeBorder && execute(fr.quilt.borders.history.size, (d) => setBorderSize(d, project, activeBorder, side, inches, lock), `border-size:${activeBorder}:${side}`)}
          onCount={(which, n) => activeBorder && execute(fr.quilt.borders.history.counts, (d) => setBorderCount(d, project, activeBorder, which, n), `border-count:${activeBorder}:${which}`)}
          onMatchInner={() => {
            const at = borders.findIndex((b) => b.id === activeBorder);
            const inner = borders[at - 1];
            if (activeBorder && inner) execute(fr.quilt.borders.history.counts, (d) => matchCounts(d, project, activeBorder, inner.id));
          }}
          onKeep={(v) => setOption("keepBorders", v)}
          onDefaultStyle={(v) => setOption("borderStyle", v)}
        />
      )}
      {tab === 3 && designPalette}
      {tab === 4 && (
        <PrintPalette
          plan="quilt"
          enabled={printEnabled}
          selection={printElement ? fr.print.selected(printElement.name, `${formatLength(printElement.width, unit, 3)} × ${formatLength(printElement.height, unit, 3)}`) : null}
          selectionMode={selectionMode}
          onPrint={(kind) => setPrinting(kind)}
          onExportImage={() => setExportOpen(true)}
          onToggleSelection={() => {
            setSelectionMode((m) => !m);
            setMarquee(null);
          }}
        />
      )}
      {colorTools.element}
    </aside>
  );

  return (
    <>
      {palette}
      <main className="worktable worktable--block-edit worktable--quilt" data-testid="worktable">
        <div className="precision-bar quilt-bar" data-testid="quilt-bar" data-layout={layoutKind} data-set={Object.keys(draft.doc.set).length} data-counts={JSON.stringify(Object.values(draft.doc.set).reduce<Record<string, number>>((acc, b) => ({ ...acc, [b.blockId]: (acc[b.blockId] ?? 0) + 1 }), {}))} data-fills={Object.keys(draft.fills).length} data-selected={liveSelected.length}>
          <span className="precision-title">{fr.quilt.status.layout(fr.quilt.kinds[layoutKind])}</span>
          <span className="precision-title" data-testid="quilt-blocks">
            {fr.quilt.status.blocks(Object.keys(draft.doc.set).length + draft.doc.items.length)}
          </span>
          <Check label={fr.quilt.seams} checked={seams} testId="quilt-seams" onChange={setSeams} />
          <button type="button" className="btn btn--small" data-testid="quilt-clear" onClick={() => execute(fr.quilt.history.clear, clearQuilt)}>
            {fr.quilt.clearQuilt}
          </button>
        </div>
        <QuiltCanvas paint={canvasPaint} onPointer={onPointer} onDrop={onDropBlock} cursor={tab === 4 ? (selectionMode ? "crosshair" : "pointer") : cursor} fitKey={`${total.width}x${total.height}`} footer={finished} />
        <div className="layer-tabs" role="tablist" aria-label={fr.quilt.layers[1]} data-testid="layer-tabs">
          {([1, 2, 3] as Layer[]).map((l) => (
            <div key={l} className="layer-tab">
              <button type="button" role="tab" aria-selected={layer === l} data-testid={`layer-${l}`} title={fr.quilt.layerHint[l]} onClick={() => setLayer(l)}>
                {fr.quilt.layers[l]}
              </button>
              <button
                type="button"
                className="btn btn--tiny layer-eye"
                data-testid={`layer-eye-${l}`}
                aria-pressed={!hidden.has(l)}
                title={fr.quilt.showLayer(fr.quilt.layers[l])}
                aria-label={fr.quilt.showLayer(fr.quilt.layers[l])}
                onClick={() =>
                  setHidden((h) => {
                    const next = new Set(h);
                    if (next.has(l)) next.delete(l);
                    else next.add(l);
                    return next;
                  })
                }
              >
                {hidden.has(l) ? "🚫" : "👁"}
              </button>
            </div>
          ))}
        </div>
      </main>
      {printing && (
        <PrintDialog
          kind={printing}
          subject={printSubject}
          unit={unit}
          notify={notify}
          onClose={() => setPrinting(null)}
        />
      )}
      {exportOpen && <ExportImageDialog pictures={pictures()} unit={unit} notify={notify} onClose={() => setExportOpen(false)} />}
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

export { newDraft, defaultLayout, buildLayout, quiltEditor };
export type { PaletteTab };
