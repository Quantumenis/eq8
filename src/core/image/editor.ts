// Session du plan Image : l'image en cours de retouche (pixels et résolution) et son historique.
// Une seule image à la fois sur le plan (SPEC §7.2). L'historique est borné : une image pèse lourd.

import { History } from "../project/history";
import type { Id } from "../project/model";
import type { Raster } from "./raster";

export interface ImageDoc {
  raster: Raster;
  /** Résolution : pixels par pouce. La taille réelle vaut pixels ÷ ppp. */
  ppi: number;
  /** Nom proposé pour la fiche (nom du fichier importé, ou de la photo du carnet). */
  name: string;
}

/** Nombre d'étapes d'annulation gardées sur le plan Image. */
export const IMAGE_HISTORY_LIMIT = 30;

export class ImageEditor {
  private history: History<ImageDoc | null> = new History<ImageDoc | null>(null, IMAGE_HISTORY_LIMIT);
  private revision = 0;
  private readonly listeners = new Set<() => void>();
  /** Photo du carnet d'où vient l'image (« Modifier »), s'il y en a une. */
  sourcePhotoId: Id | null = null;
  /** L'image a changé depuis le dernier import ou le dernier enregistrement dans le carnet. */
  private dirty = false;

  get doc(): ImageDoc | null {
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
  get modified(): boolean {
    return this.dirty && this.history.state !== null;
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

  /** Applique une retouche (étape d'annulation). Une commande qui renvoie le même document ne compte pas. */
  execute(label: string, command: (doc: ImageDoc) => ImageDoc): boolean {
    if (!this.history.state) return false;
    const did = this.history.execute(label, (d) => (d ? command(d) : d));
    if (did) {
      this.dirty = true;
      this.changed();
    }
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

  /** Pose une nouvelle image sur le plan (import, ou photo du carnet) ; l'historique repart de zéro. */
  load(doc: ImageDoc | null, sourcePhotoId: Id | null = null): void {
    this.history = new History<ImageDoc | null>(doc, IMAGE_HISTORY_LIMIT);
    this.sourcePhotoId = sourcePhotoId;
    this.dirty = false;
    this.changed();
  }

  /** L'image vient d'être enregistrée dans le carnet. */
  markSaved(): void {
    this.dirty = false;
    this.changed();
  }
}
