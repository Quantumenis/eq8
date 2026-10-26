// Session d'édition d'un quilt : le brouillon courant et son historique (annuler/rétablir), abonnable par l'interface.
// Comme pour les blocs, le brouillon n'est dans le projet qu'après « Ajouter au carnet ».

import { History } from "../project/history";
import type { Id } from "../project/model";
import { newDraft, type QuiltDraft } from "./doc";

export class QuiltEditor {
  private readonly history: History<QuiltDraft>;
  private revision = 0;
  private readonly listeners = new Set<() => void>();
  /** Quilt du carnet dont on est parti (« Modifier »), s'il y en a un. */
  sourceQuiltId: Id | null = null;

  constructor(initial: QuiltDraft = newDraft()) {
    this.history = new History(initial);
  }

  get draft(): QuiltDraft {
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

  execute(label: string, command: (draft: QuiltDraft) => QuiltDraft, coalesceKey?: string): boolean {
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

  /** Remplace le brouillon (nouveau quilt, ou quilt du carnet) et vide l'historique. */
  load(draft: QuiltDraft, sourceQuiltId: Id | null = null): void {
    this.history.reset(draft);
    this.sourceQuiltId = sourceQuiltId;
    this.changed();
  }

  setSource(id: Id | null): void {
    if (id === this.sourceQuiltId) return;
    this.sourceQuiltId = id;
    this.changed();
  }
}
