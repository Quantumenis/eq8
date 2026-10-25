// Contrat entre le processus principal et l'interface (exposé par le préchargement sous window.quiltStudio).

export type ThemeMode = "light" | "dark" | "system";

export interface AppInfo {
  name: string;
  version: string;
}

export interface QuiltStudioApi {
  getAppInfo(): Promise<AppInfo>;
  setTheme(mode: ThemeMode): Promise<void>;
  /** Le menu natif demande un changement de thème ; renvoie une fonction de désabonnement. */
  onThemeRequested(listener: (mode: ThemeMode) => void): () => void;
}

export const IPC = {
  getAppInfo: "app:get-info",
  setTheme: "theme:set",
  themeRequested: "theme:requested",
} as const;
