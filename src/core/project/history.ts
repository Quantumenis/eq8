// Pile d'annulation illimitée. Les états sont immuables et partagent leur structure : conserver un instantané
// par commande coûte donc très peu, et annuler/rétablir ne peut pas diverger d'une commande mal inversée.

interface Entry<T> {
  label: string;
  /** Pour fusionner des modifications successives de même nature (saisie dans un champ). */
  key: string | undefined;
  state: T;
}

export class History<T> {
  private present: T;
  private undoStack: Entry<T>[] = [];
  private redoStack: Entry<T>[] = [];

  constructor(initial: T) {
    this.present = initial;
  }

  get state(): T {
    return this.present;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoLabel(): string | undefined {
    return this.undoStack.at(-1)?.label;
  }

  get redoLabel(): string | undefined {
    return this.redoStack.at(-1)?.label;
  }

  /**
   * Applique une commande. Si elle renvoie le même état (rien n'a changé), elle n'est pas enregistrée.
   * Avec `coalesceKey`, une commande qui suit immédiatement une autre de même clé s'y fond.
   */
  execute(label: string, command: (state: T) => T, coalesceKey?: string): boolean {
    const next = command(this.present);
    if (next === this.present) return false;
    const top = this.undoStack.at(-1);
    const merge = coalesceKey !== undefined && top !== undefined && top.key === coalesceKey && this.redoStack.length === 0;
    if (!merge) this.undoStack.push({ label, key: coalesceKey, state: this.present });
    this.redoStack = [];
    this.present = next;
    return true;
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push({ label: entry.label, key: entry.key, state: this.present });
    this.present = entry.state;
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push({ label: entry.label, key: undefined, state: this.present });
    this.present = entry.state;
    return true;
  }

  /** Remplace l'état et vide les deux piles (ouverture d'un autre projet). */
  reset(state: T): void {
    this.present = state;
    this.undoStack = [];
    this.redoStack = [];
  }
}
