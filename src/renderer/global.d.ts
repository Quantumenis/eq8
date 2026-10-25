/// <reference types="vite/client" />
import type { QuiltStudioApi } from "../shared/api.js";

declare global {
  interface Window {
    /** Absent quand l'interface tourne hors d'Electron (tests de composants). */
    quiltStudio?: QuiltStudioApi;
  }
}

export {};
