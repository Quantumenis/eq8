import { useSyncExternalStore } from "react";
import { QuiltEditor } from "../core/quilt/editor";

/** L'éditeur de quilt unique de l'application (le brouillon du plan Quilt, avec son propre historique). */
export const quiltEditor = new QuiltEditor();

export function useQuiltEditor(): QuiltEditor {
  useSyncExternalStore(quiltEditor.subscribe, quiltEditor.getVersion);
  return quiltEditor;
}
