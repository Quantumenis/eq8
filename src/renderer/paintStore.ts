import { useSyncExternalStore } from "react";
import { pushRecent, type PaletteTab } from "../core/draw/coloring";
import type { Paint } from "../core/project/model";

interface PaintState {
  /** Tissu ou couleur choisi dans la palette « Tissus & Couleurs du carnet ». */
  paint: Paint | null;
  tab: PaletteTab;
  /** « Récemment utilisés » : rempli à chaque pose sur une pièce. */
  recent: Paint[];
}

/** L'état de la palette des tissus et couleurs, partagé par les plans de travail (il survit au changement de plan). */
class PaintStore {
  private state: PaintState = { paint: null, tab: "colors", recent: [] };
  private readonly listeners = new Set<() => void>();

  get = (): PaintState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<PaintState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  choose(paint: Paint | null, tab?: PaletteTab): void {
    this.set(tab ? { paint, tab } : { paint });
  }

  setTab(tab: PaletteTab): void {
    if (tab !== this.state.tab) this.set({ tab });
  }

  used(paint: Paint): void {
    this.set({ recent: pushRecent(this.state.recent, paint) });
  }
}

export const paintStore = new PaintStore();

export function usePaintState(): PaintState {
  return useSyncExternalStore(paintStore.subscribe, paintStore.get);
}
