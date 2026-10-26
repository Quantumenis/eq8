// Boîtes « Imprimer » (SPEC §9.1 à §9.8, §9.11) : options du style, nom, taille finie, copies, aperçu de la première
// page, puis Mise en page, Polices, Aperçu, Exporter en PDF, Imprimer et Fermer.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PrintDoc } from "../../core/print/display";
import { autoSections, checkSections, foundationPages, type FoundationStyle, type Section } from "../../core/print/foundation";
import type { Rounding } from "../../core/print/format";
import type { BlockStyle, Placed } from "../../core/print/kit";
import { blockPages, laizeText, quiltPages, rotaryPages, yardagePages } from "../../core/print/pages";
import { rotaryChart } from "../../core/print/rotary";
import { letterName } from "../../core/print/shapes";
import { blockSource, quiltSource, type PrintBlock, type QuiltElement } from "../../core/print/source";
import { NO_EDITS, templatePages, type KeyBlockSize, type TemplateEdits } from "../../core/print/templates";
import { DEFAULT_LAIZE_CM, DEFAULT_LAIZE_IN, FAT_QUARTER_CM, FAT_QUARTER_IN, LAIZES_CM, LAIZES_IN, quiltCutRects } from "../../core/print/yardage";
import { updateCard } from "../../core/project/commands";
import { findBlock, type BlockItem, type Id } from "../../core/project/model";
import type { Scene } from "../../core/quilt/scene";
import { formatLength, fromInches, toInches, type DisplayUnit } from "../../core/units";
import { fr } from "../i18n/fr";
import { drawPage, exportPdf, printDoc } from "../printOutput";
import { printContext, printSettings, usePrintSettings } from "../printSettings";
import { currentProjectName } from "../projectActions";
import { useSession } from "../projectSession";
import { useFabricTiles } from "../fabricTiles";
import { Modal } from "./Modal";
import { Check, NumberField } from "./fields";
import { PrintPreview } from "./PrintPreview";

export type PrintKind = "quilt" | "yardage" | "block" | "templates" | "foundation" | "rotary";

export type PrintSubject =
  | { from: "plan"; block: BlockItem; coloring: number; sourceId: Id | null }
  | { from: "quilt"; scene: Scene; element: QuiltElement; blockId: Id | null }
  | { from: "quiltWhole"; scene: Scene; name: string; quiltId: Id | null };

interface Options {
  copies: number;
  mirror: boolean;
  lineWidth: number;
  printName: boolean;
  blockStyle: BlockStyle;
  fillPage: boolean;
  blockOutline: boolean;
  pieceOutlines: boolean;
  seam: number;
  printSeam: boolean;
  keyBlock: KeyBlockSize;
  foundationStyle: FoundationStyle;
  numbering: boolean;
  separate: boolean;
  manual: boolean;
  rounding: Rounding;
  rotaryKey: "small" | "large";
  quiltStyle: "line" | "fabric";
  printSize: boolean;
  blockOutlines: boolean;
  laize: number;
  fatQuarters: boolean;
}

/** Les options de la dernière impression de chaque style (le temps de la session). */
const remembered = new Map<PrintKind, Partial<Options>>();

function defaults(kind: PrintKind, unit: DisplayUnit): Options {
  const seam = unit === "cm" ? 0.75 / 2.54 : 0.25;
  return {
    copies: 1,
    mirror: kind === "foundation",
    lineWidth: 1,
    printName: true,
    blockStyle: "fabric",
    fillPage: false,
    blockOutline: true,
    pieceOutlines: true,
    seam,
    printSeam: true,
    keyBlock: "small",
    foundationStyle: "color",
    numbering: true,
    separate: true,
    manual: false,
    rounding: "1/16",
    rotaryKey: "small",
    quiltStyle: "fabric",
    printSize: true,
    blockOutlines: true,
    laize: unit === "cm" ? DEFAULT_LAIZE_CM / 2.54 : DEFAULT_LAIZE_IN,
    fatQuarters: false,
  };
}

interface Props {
  kind: PrintKind;
  subject: PrintSubject;
  unit: DisplayUnit;
  notify: (message: string) => void;
  onClose: () => void;
}

function PageThumb({ doc, width }: { doc: PrintDoc; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const current = useSession();
  const tiles = useFabricTiles();
  const page = doc.pages[0];
  useLayoutEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || !page) return;
    const dpr = window.devicePixelRatio || 1;
    const k = width / page.width;
    el.width = Math.round(page.width * k * dpr);
    el.height = Math.round(page.height * k * dpr);
    drawPage(ctx, page, { fonts: printSettings.get().fonts, project: current.project, assets: current.assets }, k * dpr);
  }, [page, width, current.project, current.assets, tiles]);
  if (!page) return null;
  return <canvas ref={ref} className="print-thumb" data-testid="print-thumb" style={{ width: `${width}px`, height: `${(page.height / page.width) * width}px` }} />;
}

/** Choix des sections d'une fondation à la main : clic = ajouter (dans l'ordre de couture), Maj+clic = retirer. */
function SectionsEditor({ block, sections, onChange }: { block: PrintBlock; sections: Section[]; onChange: (s: Section[]) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const k = 220 / Math.max(block.width, block.height);
  const sectionOf = (key: string) => sections.find((s) => s.order.includes(key));
  return (
    <div className="sections-editor" data-testid="sections-editor">
      <p className="muted">{fr.print.sectionsHelp}</p>
      <svg width={block.width * k} height={block.height * k} viewBox={`0 0 ${block.width} ${block.height}`} className="sections-svg">
        {block.pieces.map((p) => {
          const sec = sectionOf(p.key);
          const at = picked.indexOf(p.key);
          return (
            <g key={p.key}>
              <path
                d={p.polygon.map((q, i) => `${i ? "L" : "M"}${q.x} ${q.y}`).join("") + "Z"}
                fill={at >= 0 ? "#9cc3f5" : sec ? "#c9c9c9" : "#ffffff"}
                stroke="#24262b"
                strokeWidth={1 / k}
                data-testid="section-piece"
                onClick={(e) => {
                  if (e.shiftKey) setPicked((l) => l.filter((x) => x !== p.key));
                  else if (!sec && at < 0) setPicked((l) => [...l, p.key]);
                }}
              />
              <text x={p.inner.x} y={p.inner.y} fontSize={10 / k} textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
                {at >= 0 ? String(at + 1) : sec ? `${sec.letter}${sec.order.indexOf(p.key) + 1}` : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="button-row">
        <button
          type="button"
          className="btn btn--small"
          disabled={picked.length === 0}
          data-testid="sections-group"
          onClick={() => {
            onChange([...sections, { letter: letterName(sections.length), order: picked }]);
            setPicked([]);
          }}
        >
          {fr.print.group}
        </button>
        <button
          type="button"
          className="btn btn--small"
          data-testid="sections-restart"
          onClick={() => {
            onChange([]);
            setPicked([]);
          }}
        >
          {fr.print.restart}
        </button>
      </div>
    </div>
  );
}

export function PrintDialog({ kind, subject, unit, notify, onClose }: Props) {
  const current = useSession();
  const settings = usePrintSettings();
  const project = current.project;
  const [o, setO] = useState<Options>(() => ({ ...defaults(kind, unit), ...(remembered.get(kind) ?? {}) }));
  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setO((prev) => {
      const next = { ...prev, [key]: value };
      remembered.set(kind, next);
      return next;
    });
  const initialName = subject.from === "plan" ? subject.block.card.name || fr.print.kinds.block : subject.from === "quilt" ? subject.element.name : subject.name;
  const [name, setName] = useState(initialName);
  const [shownName, setShownName] = useState(initialName);
  const [coloring, setColoring] = useState(subject.from === "plan" ? subject.coloring : 0);
  const autoW = subject.from === "plan" ? subject.block.width : subject.from === "quilt" ? subject.element.width : 0;
  const autoH = subject.from === "plan" ? subject.block.height : subject.from === "quilt" ? subject.element.height : 0;
  const [custom, setCustom] = useState<{ on: boolean; w: number; h: number }>({ on: false, w: autoW, h: autoH });
  const [manual, setManual] = useState<Section[]>([]);
  const [edits, setEdits] = useState<TemplateEdits>(NO_EDITS);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  const isBlockKind = kind === "block" || kind === "templates" || kind === "foundation" || kind === "rotary";
  const mirror = (kind === "block" || kind === "templates" || kind === "foundation") && o.mirror;
  const size = custom.on ? { width: custom.w, height: custom.h } : null;

  const block = useMemo<PrintBlock | null>(() => {
    if (!isBlockKind) return null;
    if (subject.from === "plan") {
      const col = coloring > 0 ? (subject.block.colorings[coloring - 1] ?? null) : null;
      return blockSource(subject.block, col, size ?? { width: subject.block.width, height: subject.block.height }, mirror, shownName);
    }
    if (subject.from === "quilt") return quiltSource(subject.scene, subject.element.owner, shownName, size, mirror);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBlockKind, subject, coloring, custom.on, custom.w, custom.h, mirror, shownName]);

  const ctx = useMemo(() => printContext(project, currentProjectName(), unit, settings), [project, unit, settings]);

  // Les retouches de l'aperçu sont perdues quand la mise en page change (SPEC §9.5).
  const layoutKey = JSON.stringify([kind, o.seam, o.printSeam, o.keyBlock, o.lineWidth, o.separate, o.numbering, o.foundationStyle, o.printName, mirror, custom, shownName, settings.setup, manual]);
  const lastKey = useRef(layoutKey);
  useEffect(() => {
    if (lastKey.current !== layoutKey) {
      lastKey.current = layoutKey;
      setEdits(NO_EDITS);
    }
  }, [layoutKey]);

  const sectioning = useMemo(() => (kind === "foundation" && block ? autoSections(block) : null), [kind, block]);
  const sections: Section[] | null = kind !== "foundation" || !block ? null : o.manual ? manual : sectioning?.ok ? sectioning.sections : manual;
  const rotaryOk = useMemo(() => (block && kind === "rotary" ? rotaryChart(block, o.seam, o.rounding, unit).cuts.length > 0 : true), [block, kind, o.seam, o.rounding, unit]);

  const built = useMemo<{ doc: PrintDoc; placed: Placed[] | null; message: string | null }>(() => {
    const title = `${shownName} — ${fr.print.kinds[kind]}`;
    const empty = (message: string) => ({ doc: { title, pages: [] }, placed: null, message });
    try {
      if (kind === "quilt" || kind === "yardage") {
        const scene = subject.from === "quiltWhole" ? subject.scene : null;
        if (!scene) return empty(fr.print.unavailable);
        if (kind === "quilt") {
          return { doc: { title, pages: quiltPages(scene, shownName, ctx, { style: o.quiltStyle, printName: o.printName, printSize: o.printSize, blockOutlines: o.blockOutlines, pieceOutlines: o.pieceOutlines, lineWidth: o.lineWidth }) }, placed: null, message: null };
        }
        const fq = unit === "cm" ? FAT_QUARTER_CM : FAT_QUARTER_IN;
        const r = yardagePages(quiltCutRects(scene, o.seam), shownName, ctx, { width: o.laize, seam: o.seam, fatQuarters: o.fatQuarters, fatQuarter: fq, laizeText: laizeText(o.laize, unit) });
        return { doc: { title, pages: r.pages }, placed: null, message: null };
      }
      if (!block) return empty(fr.print.needSelection);
      if ((kind === "templates" || kind === "foundation" || kind === "rotary") && block.invalid && block.invalid.length > 0) return empty(fr.print.selfIntersect(block.invalid.length));
      if (kind === "block") {
        const style = coloring === 0 && subject.from === "plan" && o.blockStyle === "fabric" ? "line" : o.blockStyle;
        return { doc: { title, pages: blockPages(block, ctx, { style, printName: o.printName, fillPage: o.fillPage, lineWidth: o.lineWidth, blockOutline: o.blockOutline, pieceOutlines: o.pieceOutlines }) }, placed: null, message: null };
      }
      if (kind === "templates") {
        const r = templatePages(block, ctx, { seam: o.seam, printSeam: o.printSeam, keyBlock: o.keyBlock, lineWidth: o.lineWidth }, edits);
        return { doc: { title, pages: r.pages }, placed: r.placed, message: null };
      }
      if (kind === "rotary") {
        return { doc: { title, pages: rotaryPages(block, ctx, { seam: o.seam, rounding: o.rounding, keyBlock: o.rotaryKey }) }, placed: null, message: rotaryOk ? null : fr.print.rotaryNone };
      }
      // Fondation.
      const secs = sections ?? [];
      let message: string | null = null;
      if (!o.manual && sectioning && !sectioning.ok) message = sectioning.reason === "curved" ? fr.print.sectionsCurved : fr.print.sectionsImpossible;
      else if (!o.manual && sectioning?.ok) message = fr.print.sectionsAuto(sectioning.sections.length);
      const bad = checkSections(block, secs);
      if (bad.length > 0) message = fr.print.sectionsBad(bad.join(", "));
      const covered = new Set(secs.flatMap((s) => s.order));
      const missing = block.pieces.filter((p) => !covered.has(p.key)).length;
      if (missing > 0 && !o.manual && secs.length > 0) message = fr.print.sectionsMissing(missing);
      if (secs.length === 0) return empty(message ?? fr.print.sectionsHelp);
      const r = foundationPages(block, secs, ctx, { style: o.foundationStyle, seam: o.seam, numbering: o.numbering, separate: o.separate, printName: o.printName, fillPage: o.fillPage, lineWidth: o.lineWidth }, { removed: edits.removed, moves: edits.moves });
      return { doc: { title, pages: r.pages }, placed: o.fillPage ? null : r.placed, message };
    } catch (error) {
      return empty(String(error instanceof Error ? error.message : error));
    }
  }, [kind, subject, block, ctx, o, coloring, edits, sections, sectioning, rotaryOk, shownName, unit]);

  const doc = built.doc;

  const doPrint = async () => {
    if (doc.pages.length === 0) return;
    setBusy(true);
    notify(fr.print.printing);
    try {
      const r = await printDoc(doc, project, current.assets, settings.fonts, o.copies);
      notify(r.ok ? fr.print.printed : r.error === "cancelled" ? fr.print.printCancelled : fr.print.printFailed);
    } finally {
      setBusy(false);
    }
  };
  const doExport = async () => {
    if (doc.pages.length === 0) return;
    setBusy(true);
    try {
      const r = await exportPdf(doc, project, current.assets, settings.fonts);
      if (r) notify(r.ok ? fr.print.exported(r.path) : fr.print.exportFailed);
    } finally {
      setBusy(false);
    }
  };

  const applyName = () => {
    const next = name.trim() || fr.print.kinds.block;
    setShownName(next);
    const rename = (list: Parameters<typeof updateCard>[1], id: Id) => current.execute(fr.print.applyName, (p) => updateCard(p, list, id, (c) => ({ ...c, name: next })));
    if (subject.from === "plan" && subject.sourceId) {
      const found = findBlock(project, subject.sourceId);
      if (found) rename(found.list, subject.sourceId);
    } else if (subject.from === "quilt" && subject.blockId) {
      const found = findBlock(project, subject.blockId);
      if (found) rename(found.list, subject.blockId);
    } else if (subject.from === "quiltWhole" && subject.quiltId) rename("quilts", subject.quiltId);
    notify(fr.print.nameApplied);
  };

  const unitValue = (v: number) => Math.round(fromInches(v, unit) * 1e4) / 1e4;
  const lineWidths = (
    <label className="field">
      <span className="field-label">{fr.print.lineWidth}</span>
      <select value={o.lineWidth} data-testid="print-line-width" onChange={(e) => set("lineWidth", Number(e.target.value))}>
        {fr.print.lineWidths.map((w) => (
          <option key={w.pt} value={w.pt}>
            {w.label}
          </option>
        ))}
      </select>
    </label>
  );
  const seamField = (
    <>
      <NumberField label={fr.print.seam} value={unitValue(o.seam)} decimals={4} testId="print-seam" onCommit={(n) => (n >= 0 && n <= fromInches(2, unit) ? (set("seam", toInches(n, unit)), true) : false)} />
    </>
  );

  const radio = <T extends string>(group: string, value: T, options: Record<T, string>, onChange: (v: T) => void, disabled?: (v: T) => boolean) => (
    <div className="radio-group" role="radiogroup">
      {(Object.keys(options) as T[]).map((k) => (
        <label key={k} className="radio">
          <input type="radio" name={group} checked={value === k} disabled={disabled?.(k) ?? false} data-testid={`${group}-${k}`} onChange={() => onChange(k)} />
          {options[k]}
        </label>
      ))}
    </div>
  );

  const nColorings = subject.from === "plan" ? subject.block.colorings.length : 0;

  return (
    <>
      <Modal
        title={fr.print.dialogTitles[kind]}
        size="wide"
        testId="print-dialog"
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn" data-testid="print-setup" onClick={() => printSettings.openDialog("setup")}>
              {fr.print.setupButton}
            </button>
            <button type="button" className="btn" data-testid="print-fonts" onClick={() => printSettings.openDialog("fonts")}>
              {fr.print.fontsButton}
            </button>
            <span className="toolbar-spacer" />
            <button type="button" className="btn" disabled={doc.pages.length === 0} data-testid="print-preview-open" onClick={() => setPreview(true)}>
              {fr.print.preview}
            </button>
            <button type="button" className="btn" disabled={busy || doc.pages.length === 0} data-testid="print-export-pdf" onClick={() => void doExport()}>
              {fr.print.exportPdf}
            </button>
            <button type="button" className="btn btn--primary" disabled={busy || doc.pages.length === 0} data-testid="print-go" onClick={() => void doPrint()}>
              {fr.print.print}
            </button>
            <button type="button" className="btn" data-autofocus onClick={onClose}>
              {fr.print.close}
            </button>
          </>
        }
      >
        <div className="print-dialog" data-kind={kind} data-pages={doc.pages.length}>
          <div className="print-options">
            <fieldset className="prefs-group">
              <legend>{fr.print.name}</legend>
              <div className="button-row">
                <input className="field-input field-input--wide" value={name} data-testid="print-name" onChange={(e) => setName(e.target.value)} />
                <button type="button" className="btn btn--small" data-testid="print-name-apply" onClick={applyName}>
                  {fr.print.applyName}
                </button>
              </div>
            </fieldset>

            {isBlockKind && (
              <fieldset className="prefs-group">
                <legend>{fr.print.size}</legend>
                <label className="radio">
                  <input type="radio" name="size" checked={!custom.on} data-testid="print-size-auto" onChange={() => setCustom((c) => ({ ...c, on: false }))} />
                  {subject.from === "plan" ? fr.print.usePlanSize : fr.print.useQuiltSize}
                </label>
                <label className="radio">
                  <input type="radio" name="size" checked={custom.on} data-testid="print-size-custom" onChange={() => setCustom((c) => ({ ...c, on: true }))} />
                  {fr.print.customSize}
                </label>
                <div className={`button-row${custom.on ? "" : " is-muted"}`}>
                  <NumberField label={fr.print.width} value={unitValue(custom.on ? custom.w : autoW)} decimals={4} testId="print-width" onCommit={(n) => (custom.on && n > 0 && n <= fromInches(200, unit) ? (setCustom((c) => ({ ...c, w: toInches(n, unit) })), true) : false)} />
                  <NumberField label={fr.print.height} value={unitValue(custom.on ? custom.h : autoH)} decimals={4} testId="print-height" onCommit={(n) => (custom.on && n > 0 && n <= fromInches(200, unit) ? (setCustom((c) => ({ ...c, h: toInches(n, unit) })), true) : false)} />
                </div>
              </fieldset>
            )}

            {kind === "block" && (
              <fieldset className="prefs-group">
                <legend>{fr.print.style}</legend>
                {radio("block-style", o.blockStyle, fr.print.blockStyles, (v) => set("blockStyle", v), (v) => v === "fabric" && subject.from === "plan" && coloring === 0)}
                {subject.from === "plan" && coloring === 0 && <p className="muted">{fr.print.fabricNeedsColoring}</p>}
                <Check label={fr.print.printName} checked={o.printName} testId="print-opt-name" onChange={(v) => set("printName", v)} />
                <Check label={fr.print.fillPage} checked={o.fillPage} testId="print-opt-fill" onChange={(v) => set("fillPage", v)} />
                <Check label={fr.print.mirror} checked={o.mirror} testId="print-opt-mirror" onChange={(v) => set("mirror", v)} />
                {o.blockStyle === "fabric" && (
                  <>
                    <Check label={fr.print.blockOutline} checked={o.blockOutline} testId="print-opt-block-outline" onChange={(v) => set("blockOutline", v)} />
                    <Check label={fr.print.pieceOutlines} checked={o.pieceOutlines} testId="print-opt-piece-outlines" onChange={(v) => set("pieceOutlines", v)} />
                  </>
                )}
                {lineWidths}
              </fieldset>
            )}

            {kind === "templates" && (
              <fieldset className="prefs-group">
                <legend>{fr.print.options}</legend>
                <Check label={fr.print.printSeam} checked={o.printSeam} testId="print-opt-seam" onChange={(v) => set("printSeam", v)} />
                {seamField}
                <span className="field-label">{fr.print.keyBlock}</span>
                {radio("key-block", o.keyBlock, fr.print.keyBlocks, (v) => set("keyBlock", v))}
                <Check label={fr.print.mirrorBlock} checked={o.mirror} testId="print-opt-mirror" onChange={(v) => set("mirror", v)} />
                {lineWidths}
              </fieldset>
            )}

            {kind === "foundation" && block && (
              <fieldset className="prefs-group">
                <legend>{fr.print.options}</legend>
                {radio("foundation-style", o.foundationStyle, fr.print.foundationStyles, (v) => set("foundationStyle", v))}
                {seamField}
                <Check label={fr.print.numbering} checked={o.numbering} testId="print-opt-numbering" onChange={(v) => set("numbering", v)} />
                <Check label={fr.print.separate} checked={o.separate} testId="print-opt-separate" onChange={(v) => set("separate", v)} />
                <Check label={fr.print.mirror} checked={o.mirror} testId="print-opt-mirror" onChange={(v) => set("mirror", v)} />
                <Check label={fr.print.printName} checked={o.printName} testId="print-opt-name" onChange={(v) => set("printName", v)} />
                <Check label={fr.print.fillPageFoundation} checked={o.fillPage} testId="print-opt-fill" onChange={(v) => set("fillPage", v)} />
                <Check label={fr.print.manualSections} checked={o.manual} testId="print-opt-manual" onChange={(v) => set("manual", v)} />
                {lineWidths}
                {(o.manual || (sectioning && !sectioning.ok)) && <SectionsEditor block={block} sections={manual} onChange={setManual} />}
              </fieldset>
            )}

            {kind === "rotary" && (
              <fieldset className="prefs-group">
                <legend>{fr.print.options}</legend>
                {seamField}
                <span className="field-label">{fr.print.keyBlock}</span>
                {radio("rotary-key", o.rotaryKey, { small: fr.print.keyBlocks.small, large: fr.print.keyBlocks.large }, (v) => set("rotaryKey", v))}
                <span className="field-label">{fr.print.rounding}</span>
                {unit === "cm" ? <p className="muted">{fr.print.roundingMetric}</p> : radio("rounding", o.rounding, fr.print.roundings, (v) => set("rounding", v))}
                <p className="muted">{fr.print.rotaryHint}</p>
              </fieldset>
            )}

            {kind === "quilt" && (
              <fieldset className="prefs-group">
                <legend>{fr.print.style}</legend>
                {radio("quilt-style", o.quiltStyle, fr.print.quiltStyles, (v) => set("quiltStyle", v))}
                <Check label={fr.print.printName} checked={o.printName} testId="print-opt-name" onChange={(v) => set("printName", v)} />
                <Check label={fr.print.printSize} checked={o.printSize} testId="print-opt-size" onChange={(v) => set("printSize", v)} />
                <Check label={fr.print.blockOutlines} checked={o.blockOutlines} testId="print-opt-block-outlines" onChange={(v) => set("blockOutlines", v)} />
                <Check label={fr.print.pieceOutlines} checked={o.pieceOutlines} testId="print-opt-piece-outlines" onChange={(v) => set("pieceOutlines", v)} />
                {lineWidths}
              </fieldset>
            )}

            {kind === "yardage" && (
              <fieldset className="prefs-group">
                <legend>{fr.print.options}</legend>
                <label className="field">
                  <span className="field-label">{fr.print.laize}</span>
                  <select value={Math.round(o.laize * 1e4)} data-testid="print-laize" onChange={(e) => set("laize", Number(e.target.value) / 1e4)}>
                    {(unit === "cm" ? LAIZES_CM.map((c) => c / 2.54) : LAIZES_IN.map((v) => v)).map((v) => (
                      <option key={v} value={Math.round(v * 1e4)}>
                        {formatLength(v, unit, 1)}
                      </option>
                    ))}
                  </select>
                </label>
                <Check label={fr.print.fatQuarters} checked={o.fatQuarters} testId="print-opt-fq" onChange={(v) => set("fatQuarters", v)} />
                {seamField}
                <p className="muted">{fr.print.yardageNote}</p>
              </fieldset>
            )}

            {kind !== "yardage" && (
              <NumberField label={fr.print.copies} value={o.copies} decimals={0} testId="print-copies" onCommit={(n) => (Number.isInteger(n) && n >= 1 && n <= 99 ? (set("copies", n), true) : false)} />
            )}
          </div>

          <div className="print-side">
            {subject.from === "plan" && isBlockKind && (
              <div className="button-row coloring-arrows">
                <button type="button" className="btn btn--tiny" disabled={coloring <= 0} data-testid="print-coloring-prev" onClick={() => setColoring((c) => Math.max(0, c - 1))}>
                  ◀
                </button>
                <span data-testid="print-coloring">{coloring === 0 ? fr.print.blockStyles.line : `${coloring} / ${nColorings}`}</span>
                <button type="button" className="btn btn--tiny" disabled={coloring >= nColorings} data-testid="print-coloring-next" onClick={() => setColoring((c) => Math.min(nColorings, c + 1))}>
                  ▶
                </button>
              </div>
            )}
            <PageThumb doc={doc} width={250} />
            <p className="muted" data-testid="print-page-count">
              {fr.print.pages(doc.pages.length)}
            </p>
            {built.message && (
              <p className="palette-hint palette-hint--strong" data-testid="print-message">
                {built.message}
              </p>
            )}
          </div>
        </div>
      </Modal>
      {preview && (
        <PrintPreview
          doc={doc}
          canvas={{ project, assets: current.assets }}
          busy={busy}
          onPrint={() => void doPrint()}
          onExport={() => void doExport()}
          onClose={() => setPreview(false)}
          editing={
            built.placed && (kind === "templates" || kind === "foundation")
              ? {
                  placed: built.placed,
                  canRotate: kind === "templates",
                  onRemove: (id) => {
                    const letter = id.split(":")[1] ?? "";
                    // Supprimer réorganise les autres pièces : les déplacements sont oubliés.
                    setEdits((e) => ({ removed: [...e.removed, letter], rotations: e.rotations, moves: {} }));
                  },
                  onMove: (id, page, x, y) => setEdits((e) => ({ ...e, moves: { ...e.moves, [id]: { page, x, y } } })),
                  onRotate: (id) => {
                    const letter = id.split(":")[1] ?? "";
                    setEdits((e) => ({ ...e, rotations: { ...e.rotations, [letter]: ((e.rotations[letter] ?? 0) + 30) % 360 } }));
                  },
                  onReset: () => setEdits(NO_EDITS),
                }
              : null
          }
        />
      )}
    </>
  );
}
