// Accès aux fichiers de projet pour l'interface : listes, création, ouverture, enregistrement, boîtes de dialogue.
// L'interface ne fournit jamais de chemin arbitraire : seuls les projets du dossier par défaut, les récents et les
// fichiers choisis dans une boîte de dialogue pendant cette session sont acceptés.

import fs from "node:fs/promises";
import path from "node:path";
import { dialog, type BrowserWindow } from "electron";
import { checkProjectName, projectNameFromPath, PROJECT_EXTENSION } from "../core/project/names.js";
import {
  IPC,
  type CloseAnswer,
  type DocumentState,
  type FileError,
  type OpenResult,
  type ProjectEntry,
  type ProjectListing,
  type SaveResult,
} from "../shared/api.js";
import { handle } from "./ipc.js";
import { forgetRecent, loadPreferences, projectsDir, rememberRecent, writeFileAtomic } from "./store.js";

const MAX_PROJECT_FILE_BYTES = 1024 * 1024 * 1024;

export interface ProjectIpcDeps {
  getWindow(): BrowserWindow | null;
  onRecentsChanged(): void;
  onDocumentState(state: DocumentState): void;
}

const norm = (p: string) => path.resolve(p).toLowerCase();

/** Fichiers que l'utilisateur a désignés hors de l'interface (double-clic dans l'Explorateur) : ils s'ouvrent. */
const opened = new Set<string>();
export const allowProjectFile = (file: string): void => void opened.add(norm(file));

export function registerProjectIpc(deps: ProjectIpcDeps): void {
  const chosen = opened;

  const isProjectFile = (p: unknown): p is string => typeof p === "string" && p.toLowerCase().endsWith(PROJECT_EXTENSION);

  async function isAllowed(p: string): Promise<boolean> {
    if (!isProjectFile(p)) return false;
    if (path.dirname(norm(p)) === norm(projectsDir()) || chosen.has(norm(p))) return true;
    return (await loadPreferences()).recents.some((r) => norm(r) === norm(p));
  }

  function errorOf(error: unknown): FileError {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return "not-found";
    if (code === "EEXIST") return "exists";
    if (code === "EACCES" || code === "EPERM") return "denied";
    return "io";
  }

  async function entryOf(file: string): Promise<ProjectEntry | null> {
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) return null;
      return { name: projectNameFromPath(file), path: file, modifiedAt: stat.mtimeMs };
    } catch {
      return null;
    }
  }

  async function readProject(file: string): Promise<OpenResult> {
    try {
      const stat = await fs.stat(file);
      if (stat.size > MAX_PROJECT_FILE_BYTES) return { ok: false, error: "too-large" };
      const bytes = await fs.readFile(file);
      chosen.add(norm(file));
      await rememberRecent(file);
      deps.onRecentsChanged();
      return { ok: true, path: file, bytes };
    } catch (error) {
      if (errorOf(error) === "not-found") await forgetRecent(file).then(deps.onRecentsChanged);
      return { ok: false, error: errorOf(error) };
    }
  }

  async function writeProject(file: string, bytes: unknown, remember: boolean): Promise<SaveResult> {
    if (!(bytes instanceof Uint8Array)) return { ok: false, error: "io" };
    try {
      await writeFileAtomic(file, bytes);
      chosen.add(norm(file));
      if (remember) {
        await rememberRecent(file);
        deps.onRecentsChanged();
      }
      return { ok: true, path: file };
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  }

  async function askSavePath(title: string, suggestedName: unknown): Promise<string | null> {
    const win = deps.getWindow();
    if (!win) return null;
    const check = checkProjectName(typeof suggestedName === "string" ? suggestedName : "");
    const base = check.ok ? check.name : "Sans titre";
    await fs.mkdir(projectsDir(), { recursive: true }).catch(() => undefined);
    const result = await dialog.showSaveDialog(win, {
      title,
      defaultPath: path.join(projectsDir(), `${base}${PROJECT_EXTENSION}`),
      filters: [{ name: "Projets Quilt Studio", extensions: ["qsp"] }],
    });
    if (result.canceled || !result.filePath) return null;
    return isProjectFile(result.filePath) ? result.filePath : `${result.filePath}${PROJECT_EXTENSION}`;
  }

  handle(IPC.listProjects, async (): Promise<ProjectListing> => {
    const folder = projectsDir();
    const prefs = await loadPreferences();

    const recents: ProjectEntry[] = [];
    let forgot = false;
    for (const file of prefs.recents) {
      const entry = await entryOf(file);
      if (entry) recents.push(entry);
      else {
        await forgetRecent(file); // supprimé ou renommé hors de l'application : on l'oublie
        forgot = true;
      }
    }
    if (forgot) deps.onRecentsChanged();

    const existing: ProjectEntry[] = [];
    try {
      for (const dirent of await fs.readdir(folder, { withFileTypes: true })) {
        if (!dirent.isFile() || !isProjectFile(dirent.name)) continue;
        const entry = await entryOf(path.join(folder, dirent.name));
        if (entry) existing.push(entry);
      }
    } catch {
      // Le dossier n'existe pas encore : il sera créé au premier projet.
    }
    existing.sort((a, b) => b.modifiedAt - a.modifiedAt);
    return { folder, recents, existing };
  });

  handle(IPC.createProject, async (_event, name: unknown, bytes: unknown): Promise<SaveResult> => {
    const check = checkProjectName(typeof name === "string" ? name : "");
    if (!check.ok || !(bytes instanceof Uint8Array)) return { ok: false, error: "invalid-name" };
    const folder = projectsDir();
    const file = path.join(folder, `${check.name}${PROJECT_EXTENSION}`);
    if (path.dirname(norm(file)) !== norm(folder)) return { ok: false, error: "invalid-name" };
    try {
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(file, bytes, { flag: "wx" }); // « wx » : jamais d'écrasement d'un projet existant
      chosen.add(norm(file));
      await rememberRecent(file);
      deps.onRecentsChanged();
      return { ok: true, path: file };
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });

  handle(IPC.openProjectDialog, async (): Promise<OpenResult | null> => {
    const win = deps.getWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: "Ouvrir un projet",
      defaultPath: projectsDir(),
      filters: [{ name: "Projets Quilt Studio", extensions: ["qsp"] }],
      properties: ["openFile"],
    });
    const file = result.filePaths[0];
    if (result.canceled || !file) return null;
    return readProject(file);
  });

  handle(IPC.openProjectPath, async (_event, file: unknown): Promise<OpenResult> => {
    if (typeof file !== "string" || !(await isAllowed(file))) return { ok: false, error: "denied" };
    return readProject(file);
  });

  handle(IPC.saveProject, async (_event, file: unknown, bytes: unknown): Promise<SaveResult> => {
    if (typeof file !== "string" || !(await isAllowed(file))) return { ok: false, error: "denied" };
    return writeProject(file, bytes, true);
  });

  handle(IPC.saveProjectAs, async (_event, suggestedName: unknown, bytes: unknown): Promise<SaveResult | null> => {
    const file = await askSavePath("Enregistrer le projet sous", suggestedName);
    return file ? writeProject(file, bytes, true) : null;
  });

  handle(IPC.saveProjectCopy, async (_event, suggestedName: unknown, bytes: unknown): Promise<SaveResult | null> => {
    const file = await askSavePath("Créer une copie du projet", suggestedName);
    return file ? writeProject(file, bytes, false) : null;
  });

  handle(IPC.askSaveChanges, async (_event, name: unknown): Promise<CloseAnswer> => {
    const win = deps.getWindow();
    if (!win) return "cancel";
    const result = await dialog.showMessageBox(win, {
      type: "question",
      title: "Quilt Studio",
      message: `Enregistrer les modifications de « ${typeof name === "string" ? name : "Sans titre"} » ?`,
      detail: "Sans enregistrement, vos modifications seront perdues.",
      buttons: ["Enregistrer", "Ne pas enregistrer", "Annuler"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    return (["save", "discard", "cancel"] as const)[result.response] ?? "cancel";
  });

  handle(IPC.setDocumentState, (_event, state: unknown) => {
    const s = state as Partial<DocumentState> | null;
    if (s && typeof s.name === "string" && typeof s.modified === "boolean") {
      deps.onDocumentState({ name: s.name, modified: s.modified });
    }
  });
}
