// Session d'édition : le projet courant, son historique, ses images et son état « modifié ».
// Sans dépendance au DOM : l'interface s'y abonne, et les tests la pilotent directement.

import { addAsset, type AssetStore } from "./assets";
import { History } from "./history";
import type { Project } from "./model";
import { readQsp, writeQsp, type LoadedProject } from "./qsp";

export class ProjectSession {
  private readonly history: History<Project>;
  private assetStore: AssetStore;
  private path: string | null;
  /** Dernier état enregistré ; `null` quand le projet n'a jamais été enregistré tel quel (toujours modifié). */
  private saved: Project | null;
  private revision = 0;
  private readonly listeners = new Set<() => void>();

  constructor(loaded: LoadedProject, filePath: string | null, options: { modified?: boolean } = {}) {
    this.history = new History(loaded.project);
    this.assetStore = loaded.assets;
    this.path = filePath;
    this.saved = options.modified ? null : loaded.project;
  }

  get project(): Project {
    return this.history.state;
  }

  get assets(): AssetStore {
    return this.assetStore;
  }

  get filePath(): string | null {
    return this.path;
  }

  /** Vrai si le projet diffère de ce qui est enregistré (annuler jusqu'à l'état enregistré le remet à faux). */
  get modified(): boolean {
    return this.saved === null || this.history.state !== this.saved;
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

  /** Change à chaque modification : sert de « photographie » pour l'abonnement React. */
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

  execute(label: string, command: (project: Project) => Project, coalesceKey?: string): boolean {
    const did = this.history.execute(label, command, coalesceKey);
    if (did) this.changed();
    return did;
  }

  /** Importe une image (dédupliquée par empreinte) et applique, en une seule étape annulable, la commande qui la cite. */
  executeWithAsset(
    label: string,
    bytes: Uint8Array,
    mime: string,
    build: (hash: string) => (project: Project) => Project,
  ): boolean {
    return this.execute(label, (project) => {
      const { project: withAsset, hash } = addAsset(project, this.assetStore, bytes, mime);
      return build(hash)(withAsset);
    });
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

  toQsp(): Uint8Array {
    return writeQsp(this.project, this.assetStore);
  }

  /**
   * À appeler une fois les octets écrits sur le disque : le projet est « enregistré » (à `filePath` s'il est donné).
   * `savedProject` est l'état qui a été sérialisé : si l'utilisateur a modifié le projet pendant l'écriture,
   * celui-ci reste « modifié ».
   */
  markSaved(filePath?: string, savedProject?: Project): void {
    if (filePath !== undefined) this.path = filePath;
    this.saved = savedProject ?? this.history.state;
    this.changed();
  }

  /** Remplace tout le contenu (nouveau projet, ouverture, restauration) et vide l'historique. */
  load(loaded: LoadedProject, filePath: string | null, options: { modified?: boolean } = {}): void {
    this.history.reset(loaded.project);
    this.assetStore = loaded.assets;
    this.path = filePath;
    this.saved = options.modified ? null : loaded.project;
    this.changed();
  }

  /** Reconstruit une session depuis des octets .qsp (lève `ProjectFormatError` si le fichier est invalide). */
  static fromQsp(bytes: Uint8Array, filePath: string | null, options: { modified?: boolean } = {}): ProjectSession {
    return new ProjectSession(readQsp(bytes), filePath, options);
  }
}
