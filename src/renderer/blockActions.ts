import { pruneFills } from "../core/draw/coloring";
import { cleanDrawing, contentOfDraft, fromDrawing, isEmpty, setFills, setThreads, toDrawing } from "../core/draw/draft";
import { pruneThreads, sectionsWithStrands } from "../core/draw/threads";
import type { Segment } from "../core/draw/geometry";
import type { PieceAnalysis } from "../core/draw/pieces";
import { addColoredBlock } from "../core/project/commands";
import { createId, emptyNotecard, findBlock, type BlockItem, type Coloring, type Id } from "../core/project/model";
import { formatLength, type DisplayUnit } from "../core/units";
import { blockEditor } from "./blockEditor";
import { fr } from "./i18n/fr";
import { session } from "./projectSession";

export interface Cleanup {
  removed: Segment[];
  trimmed: Segment[];
}

/** Texte de l'avertissement de nettoyage (Q-6.1) : la liste des segments retirés, ou `null` s'il n'y en a pas. */
export function cleanupReport(cleanup: Cleanup, unit: DisplayUnit): { message: string; detail: string } | null {
  const all: [Segment, boolean][] = [...cleanup.removed.map((s): [Segment, boolean] => [s, false]), ...cleanup.trimmed.map((s): [Segment, boolean] => [s, true])];
  if (all.length === 0) return null;
  const pt = (p: { x: number; y: number }) => `(${formatLength(p.x, unit)} ; ${formatLength(p.y, unit)})`;
  const shown = all
    .slice(0, 12)
    .map(([s, trimmed]) => `• ${(s.kind === "line" ? fr.coloring.cleaned.line : fr.coloring.cleaned.arc)(pt(s.a), pt(s.b))}${trimmed ? fr.coloring.cleaned.trimmed : ""}`);
  if (all.length > 12) shown.push(fr.coloring.cleaned.more(all.length - 12));
  return { message: fr.coloring.cleaned.title(all.length), detail: [fr.coloring.cleaned.intro, ...shown, fr.coloring.cleaned.undo].join("\n") };
}

/**
 * Nettoie le dessin en cours (SPEC §6.2) : coupe aux intersections, retire les segments pendants et les îlots.
 * Le nettoyage est une étape de l'historique du dessin (Ctrl+Z rend les segments retirés).
 */
export function cleanCurrentDrawing(): { analysis: PieceAnalysis; cleanup: Cleanup } {
  const { draft, analysis } = cleanDrawing(blockEditor.draft);
  if (draft !== blockEditor.draft) blockEditor.execute(fr.coloring.history.clean, () => draft);
  return { analysis, cleanup: { removed: analysis.removed, trimmed: analysis.trimmed } };
}

export type AddBlockResult =
  | { outcome: "empty"; cleanup: Cleanup }
  | { outcome: "added" | "duplicate"; cleanup: Cleanup }
  | { outcome: "stacked"; cleanup: Cleanup; position: number };

/** « Ajouter au carnet » depuis le plan Bloc : le dessin nettoyé et sa coloration rejoignent le carnet. */
export function addCurrentBlock(): AddBlockResult {
  const { analysis, cleanup } = cleanCurrentDrawing();
  const draft = blockEditor.draft;
  if (isEmpty(draft)) return { outcome: "empty", cleanup };
  const fills = pruneFills(draft.fills, analysis.pieces);
  const content = contentOfDraft(draft);
  const threads = pruneThreads(draft.threads, sectionsWithStrands(analysis.pieces, content.strands));
  const hasThreads = Object.keys(threads).length > 0;
  const coloring: Coloring | null = Object.keys(fills).length > 0 || hasThreads ? { id: createId(), fills, ...(hasThreads ? { threads } : {}) } : null;
  const list = draft.list;
  const count = session.project.sketchbook[list].length;
  let result: AddBlockResult = { outcome: "duplicate", cleanup };
  let blockId: Id | null = null;
  session.execute(fr.draw.addToSketchbookLabel, (project) => {
    const r = addColoredBlock(project, {
      list,
      sourceBlockId: blockEditor.sourceBlockId ?? undefined,
      card: emptyNotecard(`${list === "motifs" ? fr.shape.names.motifs : list === "stencils" ? fr.shape.names.stencils : fr.draw.blockName} ${count + 1}`),
      width: draft.width,
      height: draft.height,
      drawing: toDrawing(draft),
      coloring,
    });
    result = r.status === "stacked" ? { outcome: "stacked", cleanup, position: r.position } : { outcome: r.status === "new-block" ? "added" : "duplicate", cleanup };
    blockId = r.blockId;
    return r.project;
  });
  if (blockId) {
    const block = findBlock(session.project, blockId)?.block;
    const position = block && coloring ? block.colorings.findIndex((c) => c.id === coloring.id) + 1 : 0;
    blockEditor.setSource(blockId, position > 0 ? position : blockEditor.sourceColoring);
  }
  return result;
}

/** « Modifier » un bloc du carnet : son dessin (et la coloration choisie) sont repris dans l'éditeur. */
export function editBlockFromSketchbook(id: Id, coloringIndex?: number): boolean {
  const found = findBlock(session.project, id);
  if (!found) return false;
  const index = coloringIndex ?? (found.block.colorings.length > 0 ? 1 : 0);
  const coloring = index > 0 ? found.block.colorings[index - 1] : undefined;
  const fills = coloring?.fills;
  const draft = { ...fromDrawing(found.block.drawing, found.block.width, found.block.height, blockEditor.draft.guides, fills, coloring?.threads), list: found.list };
  blockEditor.load(draft, id, fills ? index : 0);
  return true;
}

/** Le bloc du carnet dont vient le dessin en cours, s'il existe encore. */
export function sourceBlock(): BlockItem | null {
  const id = blockEditor.sourceBlockId;
  return id ? (findBlock(session.project, id)?.block ?? null) : null;
}

/** Flèches de coloration du plan Bloc : charge la coloration n° `index` du bloc d'origine (0 = dessin au trait). */
export function chooseColoring(index: number): boolean {
  const block = sourceBlock();
  if (!block || index < 0 || index > block.colorings.length) return false;
  const coloring = index > 0 ? block.colorings[index - 1] : undefined;
  blockEditor.execute(fr.coloring.history.choose, (d) => setThreads(setFills(d, coloring?.fills ?? {}), coloring?.threads ?? {}));
  blockEditor.setSource(block.id, index);
  return true;
}
