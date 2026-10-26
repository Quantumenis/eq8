// Réglages d'affichage (SPEC §12.6) : ruban sur le côté, petites icônes, astuces des palettes masquées, accueil au
// démarrage. Ils sont gardés dans le stockage local de l'interface (par poste, pas dans le projet).

import { useSyncExternalStore } from "react";

export interface UiPrefs {
  sideRibbon: boolean;
  smallIcons: boolean;
  hideTips: boolean;
  showHome: boolean;
  tipIndex: number;
}

const KEY = "quilt.ui";
const DEFAULTS: UiPrefs = { sideRibbon: false, smallIcons: false, hideTips: false, showHome: false, tipIndex: 0 };

function read(): UiPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<UiPrefs>;
    return {
      sideRibbon: raw.sideRibbon === true,
      smallIcons: raw.smallIcons === true,
      hideTips: raw.hideTips === true,
      showHome: raw.showHome === true,
      tipIndex: typeof raw.tipIndex === "number" && Number.isInteger(raw.tipIndex) && raw.tipIndex >= 0 ? raw.tipIndex : 0,
    };
  } catch {
    return DEFAULTS;
  }
}

let state: UiPrefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

export function getUiPrefs(): UiPrefs {
  if (!loaded) {
    state = read();
    loaded = true;
  }
  return state;
}

export function setUiPrefs(patch: Partial<UiPrefs>): void {
  state = { ...getUiPrefs(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Pas de stockage local : le réglage dure le temps de la session.
  }
  for (const l of listeners) l();
}

export function useUiPrefs(): UiPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getUiPrefs,
  );
}
