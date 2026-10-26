// Session d'édition d'un bloc : le brouillon courant et son historique (annuler/rétablir), abonnable par l'interface.

import { History } from "../project/history";
import type { Id } from "../project/model";
import type { BlockStyle } from "./content";
import { newDraft, type BlockDraft } from "./draft";

export class BlockEditor {
  private readonly history: History<BlockDraft>;
  private revision = 0;
  private readonly listeners = new Set<() => void>();
  /** Bloc du carnet dont on est parti (« Modifier »), s'il y en a un. */
  sourceBlockId: Id | null = null;
  /** Position, dans la pile de ce bloc, de la coloration chargée (0 = le dessin au trait). */
  sourceColoring = 0;

  constructor(initial: BlockDraft = newDraft()) {
    this.history = new History(initial);
  }

  get draft(): BlockDraft {
    return this.history.state;
  }
  get canUndo(): boolean {
    return this.history.canUndo;
  }
  get canRedo(): boolean {
    return this.history.canRedo;
  }
  get undoLabel(): string | undefined {
    return this.history.undoLabel;
  }
  get redoLabel(): string | undefined {
    return this.history.redoLabel;
  }
  get version(): number {
    return this.revision;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.revision;

  private changed(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }

  execute(label: string, command: (draft: BlockDraft) => BlockDraft, coalesceKey?: string): boolean {
    const did = this.history.execute(label, command, coalesceKey);
    if (did) this.changed();
    return did;
  }

  undo(): boolean {
    const did = this.history.undo();
    if (did) this.changed();
    return did;
  }

  redo(): boolean {
    const did = this.history.redo();
    if (did) this.changed();
    return did;
  }

  /** Nouveau bloc vide dans le style donné : les repères sont conservés. */
  startNew(style: BlockStyle = "easy"): void {
    this.history.reset(newDraft(this.draft.guides, style));
    this.sourceBlockId = null;
    this.sourceColoring = 0;
    this.changed();
  }

  /** Remplace le brouillon (édition d'un bloc du carnet) et vide l'historique. */
  load(draft: BlockDraft, sourceBlockId: Id | null, sourceColoring = 0): void {
    this.history.reset(draft);
    this.sourceBlockId = sourceBlockId;
    this.sourceColoring = sourceColoring;
    this.changed();
  }

  /** Rattache le brouillon à un bloc du carnet (après « Ajouter au carnet » ou le choix d'une coloration). */
  setSource(blockId: Id | null, coloring: number): void {
    if (blockId === this.sourceBlockId && coloring === this.sourceColoring) return;
    this.sourceBlockId = blockId;
    this.sourceColoring = coloring;
    this.changed();
  }
}
