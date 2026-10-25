// Contrat entre le processus principal et l'interface (exposé par le préchargement sous window.quiltStudio).

export type ThemeMode = "light" | "dark" | "system";
export type UnitPref = "in" | "cm";

export interface AppInfo {
  name: string;
  version: string;
  /** Intervalle de la sauvegarde automatique, en millisecondes (2 min, ou la valeur imposée par les tests). */
  autosaveMs: number;
}

export interface Preferences {
  unit: UnitPref;
  /** Nombre maximal de colorations par bloc pour les nouveaux projets (1 à 10). */
  maxColorings: number;
  /** Projets récents, du plus récent au plus ancien. */
  recents: string[];
}

export interface ProjectEntry {
  name: string;
  path: string;
  /** Date de dernière modification, en millisecondes depuis 1970. */
  modifiedAt: number;
}

export interface ProjectListing {
  folder: string;
  recents: ProjectEntry[];
  existing: ProjectEntry[];
}

export type FileError = "exists" | "invalid-name" | "not-found" | "denied" | "too-large" | "io";

export type OpenResult = { ok: true; path: string; bytes: Uint8Array } | { ok: false; error: FileError };
export type SaveResult = { ok: true; path: string } | { ok: false; error: FileError };

export interface RecoveryInfo {
  name: string;
  /** Chemin du projet au moment de la sauvegarde automatique ; `null` s'il n'avait jamais été enregistré. */
  path: string | null;
  savedAt: number;
}

export type CloseAnswer = "save" | "discard" | "cancel";

export interface DocumentState {
  name: string;
  modified: boolean;
}

export type MenuCommand =
  | "new"
  | "open"
  | "open-recent"
  | "save"
  | "save-as"
  | "save-copy"
  | "add-to-sketchbook"
  | "show-sketchbook"
  | "undo"
  | "redo"
  | "preferences"
  | "save-default-palette";

export interface QuiltStudioApi {
  getAppInfo(): Promise<AppInfo>;
  setTheme(mode: ThemeMode): Promise<void>;
  /** Le menu natif demande un changement de thème ; renvoie une fonction de désabonnement. */
  onThemeRequested(listener: (mode: ThemeMode) => void): () => void;

  getPreferences(): Promise<Preferences>;
  setPreferences(patch: Partial<Pick<Preferences, "unit" | "maxColorings">>): Promise<Preferences>;
  /** Remet les réglages par défaut ; avec `alsoPalette`, efface aussi la palette par défaut personnalisée. */
  resetPreferences(alsoPalette: boolean): Promise<Preferences>;

  listProjects(): Promise<ProjectListing>;
  /** Crée `Documents\Quilt Studio\Projets\<name>.qsp` (refuse un nom invalide ou un fichier existant). */
  createProject(name: string, bytes: Uint8Array): Promise<SaveResult>;
  /** Boîte « Ouvrir » du système ; `null` si l'utilisateur annule. */
  openProjectDialog(): Promise<OpenResult | null>;
  openProjectPath(path: string): Promise<OpenResult>;
  saveProject(path: string, bytes: Uint8Array): Promise<SaveResult>;
  /** Boîte « Enregistrer sous » ; `null` si l'utilisateur annule. */
  saveProjectAs(suggestedName: string, bytes: Uint8Array): Promise<SaveResult | null>;
  /** Enregistre une copie sans quitter le projet courant. */
  saveProjectCopy(suggestedName: string, bytes: Uint8Array): Promise<SaveResult | null>;
  askSaveChanges(projectName: string): Promise<CloseAnswer>;
  /** Informe le processus principal (titre de la fenêtre, confirmation à la fermeture). */
  setDocumentState(state: DocumentState): Promise<void>;

  /** Sauvegarde automatique de la session en cours. */
  writeRecovery(bytes: Uint8Array, info: Omit<RecoveryInfo, "savedAt">): Promise<void>;
  /** Efface la sauvegarde automatique de la session courante (projet enregistré ou remplacé). */
  clearRecovery(): Promise<void>;
  /** Session précédente interrompée (plantage, arrêt forcé), s'il en reste une. */
  checkRecovery(): Promise<RecoveryInfo | null>;
  readRecovery(): Promise<Uint8Array | null>;
  discardRecovery(): Promise<void>;

  getDefaultPalette(): Promise<Uint8Array | null>;
  saveDefaultPalette(bytes: Uint8Array): Promise<void>;

  onMenuCommand(listener: (command: MenuCommand, argument?: string) => void): () => void;
  /** La fenêtre veut se fermer alors que le projet est modifié : l'interface décide. */
  onBeforeClose(listener: () => void): () => void;
  confirmClose(): Promise<void>;
}

export const IPC = {
  getAppInfo: "app:get-info",
  setTheme: "theme:set",
  themeRequested: "theme:requested",
  getPreferences: "prefs:get",
  setPreferences: "prefs:set",
  resetPreferences: "prefs:reset",
  listProjects: "project:list",
  createProject: "project:create",
  openProjectDialog: "project:open-dialog",
  openProjectPath: "project:open-path",
  saveProject: "project:save",
  saveProjectAs: "project:save-as",
  saveProjectCopy: "project:save-copy",
  askSaveChanges: "project:ask-save",
  setDocumentState: "project:document-state",
  writeRecovery: "recovery:write",
  clearRecovery: "recovery:clear",
  checkRecovery: "recovery:check",
  readRecovery: "recovery:read",
  discardRecovery: "recovery:discard",
  getDefaultPalette: "palette:get",
  saveDefaultPalette: "palette:save",
  menuCommand: "menu:command",
  beforeClose: "window:before-close",
  confirmClose: "window:confirm-close",
} as const;
