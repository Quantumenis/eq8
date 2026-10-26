import { addToSketchbook } from "../core/project/commands";
import type { Id } from "../core/project/model";
import { parseDoc, quiltItemOf, sameDraft, type QuiltDraft } from "../core/quilt/doc";
import { fr } from "./i18n/fr";
import { quiltEditor } from "./quiltEditor";
import { session } from "./projectSession";

export type AddQuiltResult = { outcome: "empty" } | { outcome: "added"; id: Id } | { outcome: "duplicate"; id: Id };

/** Le quilt du carnet, relu sous forme de brouillon (disposition, pose et coloration). */
export function draftOfQuilt(id: Id): QuiltDraft | null {
  const quilt = session.project.sketchbook.quilts.find((q) => q.id === id);
  if (!quilt) return null;
  const doc = parseDoc(quilt.layout);
  return doc ? { doc, fills: { ...quilt.fills } } : null;
}

/** Un quilt « vide » n'a ni bloc posé, ni élément, ni couleur : il ne va pas au carnet. */
export function isEmptyQuilt(draft: QuiltDraft): boolean {
  return Object.keys(draft.doc.set).length === 0 && draft.doc.items.length === 0 && Object.keys(draft.fills).length === 0;
}

/** « Ajouter au carnet » depuis le plan Quilt. */
export function addCurrentQuilt(): AddQuiltResult {
  const draft = quiltEditor.draft;
  if (isEmptyQuilt(draft)) return { outcome: "empty" };
  for (const q of session.project.sketchbook.quilts) {
    const existing = draftOfQuilt(q.id);
    if (existing && sameDraft(existing, draft)) {
      quiltEditor.setSource(q.id);
      return { outcome: "duplicate", id: q.id };
    }
  }
  const count = session.project.sketchbook.quilts.length;
  const item = quiltItemOf(session.project, draft, `${fr.quilt.quiltName} ${count + 1}`);
  session.execute(fr.draw.addToSketchbookLabel, (project) => addToSketchbook(project, "quilts", item).project);
  quiltEditor.setSource(item.id);
  return { outcome: "added", id: item.id };
}

/** « Modifier » un quilt du carnet : sa disposition et sa coloration sont reprises dans l'éditeur. */
export function editQuiltFromSketchbook(id: Id): boolean {
  const draft = draftOfQuilt(id);
  if (!draft) return false;
  quiltEditor.load(draft, id);
  return true;
}
