import { useSyncExternalStore } from "react";
import { BlockEditor } from "../core/draw/editor";

/** L'éditeur de bloc unique de l'application (le brouillon du plan Bloc, avec son propre historique). */
export const blockEditor = new BlockEditor();

export function useBlockEditor(): BlockEditor {
  useSyncExternalStore(blockEditor.subscribe, blockEditor.getVersion);
  return blockEditor;
}
