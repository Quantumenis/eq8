import { contextBridge, ipcRenderer } from "electron";
// Imports de types uniquement : un préchargement en bac à sable ne peut charger aucun module local à l'exécution.
import type { IPC, QuiltStudioApi, ThemeMode } from "../shared/api.js";

const CHANNELS = {
  getAppInfo: "app:get-info",
  setTheme: "theme:set",
  themeRequested: "theme:requested",
} as const satisfies typeof IPC;

const api: QuiltStudioApi = {
  getAppInfo: () => ipcRenderer.invoke(CHANNELS.getAppInfo),
  setTheme: (mode) => ipcRenderer.invoke(CHANNELS.setTheme, mode),
  onThemeRequested: (listener) => {
    const handler = (_event: unknown, mode: ThemeMode) => listener(mode);
    ipcRenderer.on(CHANNELS.themeRequested, handler);
    return () => ipcRenderer.removeListener(CHANNELS.themeRequested, handler);
  },
};

contextBridge.exposeInMainWorld("quiltStudio", api);
