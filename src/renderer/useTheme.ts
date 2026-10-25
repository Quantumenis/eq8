import { useCallback, useEffect, useState } from "react";
import type { ThemeMode } from "../shared/api.js";

const STORAGE_KEY = "quilt-studio.theme";

function readStoredTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Stockage indisponible : on garde le thème système.
  }
  return "system";
}

/** Thème clair, sombre ou système : appliqué au document et transmis au processus principal. */
export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(readStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    void window.quiltStudio?.setTheme(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Préférence non mémorisée : sans conséquence.
    }
  }, [mode]);

  useEffect(() => window.quiltStudio?.onThemeRequested(setMode), []);

  const change = useCallback((next: ThemeMode) => setMode(next), []);
  return [mode, change];
}
