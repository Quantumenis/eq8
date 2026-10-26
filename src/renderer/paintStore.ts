import { useSyncExternalStore } from "react";
import { pushRecent, type PaletteTab } from "../core/draw/coloring";
import { DEFAULT_THREAD, type ThreadProperties } from "../core/draw/threads";
import type { Paint, ThreadStroke } from "../core/project/model";

interface PaintState {
  /** Tissu ou couleur choisi dans la palette « Tissus & Couleurs du carnet ». */
  paint: Paint | null;
  tab: PaletteTab;
  /** « Récemment utilisés » : rempli à chaque pose sur une pièce. */
  recent: Paint[];
  /** Fil des outils Fil : couleur (d'un fil du carnet), style et épaisseur. */
  thread: ThreadStroke;
  /** Ce que change un clic des outils Fil (au moins une case cochée). */
  threadProps: ThreadProperties;
}

/** L'état de la palette des tissus et couleurs, partagé par les plans de travail (il survit au changement de plan). */
class PaintStore {
  private state: PaintState = {
    paint: null,
    tab: "colors",
    recent: [],
    thread: { ...DEFAULT_THREAD },
    threadProps: { color: true, style: false, weight: false },
  };
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
    // Le décalage d'une coupe ciblée appartient à la pièce, pas au tissu repris dans « Récemment utilisés ».
    const plain: Paint = paint.kind === "fabric" ? { kind: "fabric", fabricId: paint.fabricId } : paint;
    this.set({ recent: pushRecent(this.state.recent, plain) });
  }

  setThread(patch: Partial<ThreadStroke>): void {
    this.set({ thread: { ...this.state.thread, ...patch } });
  }

  /** Coche ou décoche une propriété du fil ; la dernière case cochée ne peut pas être décochée. */
  setThreadProp(key: keyof ThreadProperties, value: boolean): void {
    const next = { ...this.state.threadProps, [key]: value };
    if (!next.color && !next.style && !next.weight) return;
    this.set({ threadProps: next });
  }
}

export const paintStore = new PaintStore();

export function usePaintState(): PaintState {
  return useSyncExternalStore(paintStore.subscribe, paintStore.get);
}
