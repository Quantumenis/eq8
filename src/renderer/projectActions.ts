// Commandes de projet de l'interface : nouveau, ouvrir, enregistrer, restaurer… Elles coordonnent la session
// d'édition (core), les fichiers (processus principal) et les boîtes de dialogue.

import { extractPalette, newProject } from "../core/project/defaults";
import { projectNameFromPath } from "../core/project/names";
import { readQsp, writeQsp, type LoadedProject } from "../core/project/qsp";
import { ProjectFormatError } from "../core/project/validate";
import type { FileError, OpenResult, Preferences, QuiltStudioApi, RecoveryInfo } from "../shared/api";
import type { Dialogs } from "./components/Dialogs";
import { fr } from "./i18n/fr";
import { session } from "./projectSession";

export function getApi(): QuiltStudioApi {
  if (!window.quiltStudio) throw new Error("L'interface doit tourner dans Quilt Studio (Electron).");
  return window.quiltStudio;
}

export function currentProjectName(): string {
  return session.filePath ? projectNameFromPath(session.filePath) : fr.app.untitled;
}

export type CreateResult = { ok: true } | { ok: false; cancelled: true } | { ok: false; cancelled: false; error: FileError };

export interface ProjectActions {
  ensureSaved(): Promise<boolean>;
  save(): Promise<boolean>;
  saveAs(): Promise<boolean>;
  saveCopy(): Promise<void>;
  /** Suite d'un « Ajouter au carnet » : le projet est enregistré (et nommé s'il ne l'était pas encore). */
  afterAddToSketchbook(): Promise<void>;
  createProject(name: string): Promise<CreateResult>;
  openDialog(): Promise<boolean>;
  openPath(path: string): Promise<boolean>;
  restoreRecovery(info: RecoveryInfo): Promise<void>;
  ignoreRecovery(): Promise<void>;
  saveDefaultPalette(): Promise<void>;
}

async function readPalette(api: QuiltStudioApi): Promise<LoadedProject | null> {
  const bytes = await api.getDefaultPalette();
  if (!bytes) return null;
  try {
    return readQsp(bytes);
  } catch {
    return null; // palette illisible : on retombe sur le contenu d'origine
  }
}

export function createProjectActions(prefs: Preferences, dialogs: Dialogs, notify: (message: string) => void): ProjectActions {
  const api = getApi();

  const fileProblem = (error: FileError) => fr.messages.fileError[error];

  const actions: ProjectActions = {
    async save() {
      if (!session.filePath) return actions.saveAs();
      const snapshot = session.project;
      const result = await api.saveProject(session.filePath, session.toQsp());
      if (result.ok) {
        session.markSaved(undefined, snapshot);
        await api.clearRecovery();
        return true;
      }
      // Le fichier a disparu ou n'est plus accessible : on propose un autre emplacement.
      if (result.error === "denied" || result.error === "not-found") return actions.saveAs();
      await dialogs.alert(fr.messages.saveFailed(fileProblem(result.error)));
      return false;
    },

    async saveAs() {
      const snapshot = session.project;
      const result = await api.saveProjectAs(currentProjectName(), session.toQsp());
      if (result === null) return false;
      if (!result.ok) {
        await dialogs.alert(fr.messages.saveFailed(fileProblem(result.error)));
        return false;
      }
      session.markSaved(result.path, snapshot);
      await api.clearRecovery();
      notify(fr.messages.savedAs(projectNameFromPath(result.path)));
      return true;
    },

    async saveCopy() {
      const result = await api.saveProjectCopy(currentProjectName(), session.toQsp());
      if (result === null) return;
      if (!result.ok) await dialogs.alert(fr.messages.saveFailed(fileProblem(result.error)));
      else notify(fr.messages.savedCopy(projectNameFromPath(result.path)));
    },

    async afterAddToSketchbook() {
      if (!session.filePath) {
        await dialogs.alert(fr.messages.unnamedWarning);
        await actions.saveAs();
        return;
      }
      await actions.save();
    },

    async ensureSaved() {
      if (!session.modified) return true;
      const answer = await api.askSaveChanges(currentProjectName());
      if (answer === "cancel") return false;
      if (answer === "discard") return true;
      return actions.save();
    },

    async createProject(name) {
      const fresh = newProject(await readPalette(api), prefs.maxColorings);
      const bytes = writeQsp(fresh.project, fresh.assets);
      if (!(await actions.ensureSaved())) return { ok: false, cancelled: true };
      const result = await api.createProject(name, bytes);
      if (!result.ok) return { ok: false, cancelled: false, error: result.error };
      session.load(fresh, result.path);
      await api.clearRecovery();
      notify(fr.messages.created(projectNameFromPath(result.path)));
      return { ok: true };
    },

    async openDialog() {
      const result = await api.openProjectDialog();
      return result ? openResult(result) : false;
    },

    async openPath(path) {
      return openResult(await api.openProjectPath(path));
    },

    async restoreRecovery(info) {
      const bytes = await api.readRecovery();
      if (!bytes) return;
      try {
        session.load(readQsp(bytes), info.path, { modified: true });
      } catch (error) {
        await dialogs.alert(fr.messages.openFailed(error instanceof ProjectFormatError ? error.message : ""));
        await api.discardRecovery();
        return;
      }
      // Remise en sûreté immédiate dans la session courante avant d'abandonner la copie précédente.
      await api.writeRecovery(session.toQsp(), { name: info.name, path: info.path });
      await api.discardRecovery();
      notify(fr.messages.restored);
    },

    async ignoreRecovery() {
      await api.discardRecovery();
    },

    async saveDefaultPalette() {
      const palette = extractPalette(session.project, session.assets);
      await api.saveDefaultPalette(writeQsp(palette.project, palette.assets));
      notify(fr.prefs.paletteSaved);
    },
  };

  async function openResult(result: OpenResult): Promise<boolean> {
    if (!result.ok) {
      await dialogs.alert(fr.messages.openFailed(fileProblem(result.error)));
      return false;
    }
    let loaded: LoadedProject;
    try {
      loaded = readQsp(result.bytes);
    } catch (error) {
      await dialogs.alert(fr.messages.openFailed(error instanceof ProjectFormatError ? error.message : "Fichier illisible."));
      return false;
    }
    if (!(await actions.ensureSaved())) return false;
    session.load(loaded, result.path);
    await api.clearRecovery();
    notify(fr.messages.opened(projectNameFromPath(result.path)));
    return true;
  }

  return actions;
}
