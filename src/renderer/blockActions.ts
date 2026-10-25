import { isEmpty, fromDrawing, toDrawing } from "../core/draw/draft";
import { addColoredBlock } from "../core/project/commands";
import { emptyNotecard, findBlock, type Id } from "../core/project/model";
import { blockEditor } from "./blockEditor";
import { fr } from "./i18n/fr";
import { session } from "./projectSession";

export type AddBlockOutcome = "added" | "stacked" | "duplicate" | "empty";

/** « Ajouter au carnet » depuis le plan Bloc : le dessin devient un bloc du carnet (un doublon n'est pas ajouté). */
export function addCurrentBlock(): AddBlockOutcome {
  const draft = blockEditor.draft;
  if (isEmpty(draft)) return "empty";
  const count = session.project.sketchbook.blocks.length;
  let outcome: AddBlockOutcome = "duplicate";
  let blockId: Id | null = null;
  session.execute(fr.draw.addToSketchbookLabel, (project) => {
    const result = addColoredBlock(project, {
      list: "blocks",
      sourceBlockId: blockEditor.sourceBlockId ?? undefined,
      card: emptyNotecard(`${fr.draw.blockName} ${count + 1}`),
      width: draft.width,
      height: draft.height,
      drawing: toDrawing(draft),
      coloring: null,
    });
    outcome = result.status === "new-block" ? "added" : result.status === "stacked" ? "stacked" : "duplicate";
    blockId = result.blockId;
    return result.project;
  });
  if (blockId) blockEditor.sourceBlockId = blockId;
  return outcome;
}

/** « Modifier » un bloc du carnet : son dessin est repris dans l'éditeur. Renvoie faux si ce bloc n'a pas de dessin EasyDraw. */
export function editBlockFromSketchbook(id: Id): boolean {
  const found = findBlock(session.project, id);
  if (!found) return false;
  const draft = fromDrawing(found.block.drawing, found.block.width, found.block.height, blockEditor.draft.guides);
  blockEditor.load(draft, id);
  return true;
}
