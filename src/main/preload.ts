import { contextBridge, ipcRenderer } from "electron";
// Imports de types uniquement : un préchargement en bac à sable ne peut charger aucun module local à l'exécution.
import type { IPC, MenuCommand, QuiltStudioApi, ThemeMode } from "../shared/api.js";

const CHANNELS = {
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
  importImages: "library:import-images",
  listFavorites: "favorites:list",
  readFavorite: "favorites:read",
  writeFavorite: "favorites:write",
  deleteFavorite: "favorites:delete",
  getDefaultPalette: "palette:get",
  saveDefaultPalette: "palette:save",
  menuCommand: "menu:command",
  beforeClose: "window:before-close",
  confirmClose: "window:confirm-close",
} as const satisfies typeof IPC;

const api: QuiltStudioApi = {
  getAppInfo: () => ipcRenderer.invoke(CHANNELS.getAppInfo),
  setTheme: (mode) => ipcRenderer.invoke(CHANNELS.setTheme, mode),
  onThemeRequested: (listener) => {
    const handler = (_event: unknown, mode: ThemeMode) => listener(mode);
    ipcRenderer.on(CHANNELS.themeRequested, handler);
    return () => ipcRenderer.removeListener(CHANNELS.themeRequested, handler);
  },

  getPreferences: () => ipcRenderer.invoke(CHANNELS.getPreferences),
  setPreferences: (patch) => ipcRenderer.invoke(CHANNELS.setPreferences, patch),
  resetPreferences: (alsoPalette) => ipcRenderer.invoke(CHANNELS.resetPreferences, alsoPalette),

  listProjects: () => ipcRenderer.invoke(CHANNELS.listProjects),
  createProject: (name, bytes) => ipcRenderer.invoke(CHANNELS.createProject, name, bytes),
  openProjectDialog: () => ipcRenderer.invoke(CHANNELS.openProjectDialog),
  openProjectPath: (path) => ipcRenderer.invoke(CHANNELS.openProjectPath, path),
  saveProject: (path, bytes) => ipcRenderer.invoke(CHANNELS.saveProject, path, bytes),
  saveProjectAs: (suggestedName, bytes) => ipcRenderer.invoke(CHANNELS.saveProjectAs, suggestedName, bytes),
  saveProjectCopy: (suggestedName, bytes) => ipcRenderer.invoke(CHANNELS.saveProjectCopy, suggestedName, bytes),
  askSaveChanges: (projectName) => ipcRenderer.invoke(CHANNELS.askSaveChanges, projectName),
  setDocumentState: (state) => ipcRenderer.invoke(CHANNELS.setDocumentState, state),

  writeRecovery: (bytes, info) => ipcRenderer.invoke(CHANNELS.writeRecovery, bytes, info),
  clearRecovery: () => ipcRenderer.invoke(CHANNELS.clearRecovery),
  checkRecovery: () => ipcRenderer.invoke(CHANNELS.checkRecovery),
  readRecovery: () => ipcRenderer.invoke(CHANNELS.readRecovery),
  discardRecovery: () => ipcRenderer.invoke(CHANNELS.discardRecovery),

  importImages: (multiple) => ipcRenderer.invoke(CHANNELS.importImages, multiple),
  listFavorites: (kind) => ipcRenderer.invoke(CHANNELS.listFavorites, kind),
  readFavorite: (kind, name) => ipcRenderer.invoke(CHANNELS.readFavorite, kind, name),
  writeFavorite: (kind, name, bytes, create) => ipcRenderer.invoke(CHANNELS.writeFavorite, kind, name, bytes, create),
  deleteFavorite: (kind, name) => ipcRenderer.invoke(CHANNELS.deleteFavorite, kind, name),

  getDefaultPalette: () => ipcRenderer.invoke(CHANNELS.getDefaultPalette),
  saveDefaultPalette: (bytes) => ipcRenderer.invoke(CHANNELS.saveDefaultPalette, bytes),

  onMenuCommand: (listener) => {
    const handler = (_event: unknown, command: MenuCommand, argument?: string) => listener(command, argument);
    ipcRenderer.on(CHANNELS.menuCommand, handler);
    return () => ipcRenderer.removeListener(CHANNELS.menuCommand, handler);
  },
  onBeforeClose: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(CHANNELS.beforeClose, handler);
    return () => ipcRenderer.removeListener(CHANNELS.beforeClose, handler);
  },
  confirmClose: () => ipcRenderer.invoke(CHANNELS.confirmClose),
};

contextBridge.exposeInMainWorld("quiltStudio", api);
