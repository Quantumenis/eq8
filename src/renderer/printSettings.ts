// Réglages d'impression partagés par les plans : mise en page (SPEC §9.13), polices (§9.12) et épaisseur minimale des
// traits (Préférences > Options d'impression, §9.1). Ils sont enregistrés dans les préférences de l'application.

import { useSyncExternalStore } from "react";
import { DEFAULT_FONTS, FONT_FAMILIES, FONT_ROLES, type PrintFonts } from "../core/print/display";
import type { PrintContext } from "../core/print/kit";
import { defaultPageSetup, sanitizePageSetup, type PageSetup } from "../core/print/paper";
import type { Project } from "../core/project/model";
import type { DisplayUnit } from "../core/units";
import { getApi } from "./projectActions";

export type PrintDialogKind = "setup" | "fonts";

interface PrintSettingsState {
  setup: PageSetup;
  fonts: PrintFonts;
  /** Épaisseur minimale des traits, en pixels d'imprimante à 96 ppp (1 à 4 ; 1 px = 0,75 pt). */
  minLinePx: number;
  country: string;
  /** Boîte de réglage ouverte par-dessus le reste (menu Fichier ou bouton d'une boîte d'impression). */
  dialog: PrintDialogKind | null;
}

export const MIN_LINE_CHOICES = [1, 2, 3, 4] as const;
export const FONT_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24] as const;

export function sanitizeFonts(raw: unknown): PrintFonts {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_FONTS };
  for (const role of FONT_ROLES) {
    const v = (typeof r[role] === "object" && r[role] !== null ? r[role] : {}) as { family?: unknown; size?: unknown };
    out[role] = {
      family: typeof v.family === "string" && (FONT_FAMILIES as readonly string[]).includes(v.family) ? v.family : DEFAULT_FONTS[role].family,
      size: typeof v.size === "number" && v.size >= 5 && v.size <= 36 ? v.size : DEFAULT_FONTS[role].size,
    };
  }
  return out;
}

class PrintSettingsStore {
  private state: PrintSettingsState = { setup: defaultPageSetup(null), fonts: DEFAULT_FONTS, minLinePx: 1, country: "", dialog: null };
  private readonly listeners = new Set<() => void>();

  get = (): PrintSettingsState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<PrintSettingsState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Charge les réglages enregistrés (ou ceux par défaut du pays). */
  load(raw: unknown, country: string): void {
    const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const fallback = defaultPageSetup(country);
    const px = r.minLinePx;
    this.set({
      country,
      setup: r.setup ? sanitizePageSetup(r.setup, fallback) : fallback,
      fonts: sanitizeFonts(r.fonts),
      minLinePx: typeof px === "number" && (MIN_LINE_CHOICES as readonly number[]).includes(px) ? px : 1,
    });
  }

  update(patch: Partial<Pick<PrintSettingsState, "setup" | "fonts" | "minLinePx">>): void {
    this.set(patch);
    const { setup, fonts, minLinePx } = this.state;
    void getApi().setPreferences({ print: { setup, fonts, minLinePx } });
  }

  /** Retour aux réglages d'origine (Préférences > Restaurer). */
  reset(): void {
    this.update({ setup: defaultPageSetup(this.state.country), fonts: DEFAULT_FONTS, minLinePx: 1 });
  }

  openDialog(kind: PrintDialogKind): void {
    this.set({ dialog: kind });
  }

  closeDialog(): void {
    this.set({ dialog: null });
  }
}

export const printSettings = new PrintSettingsStore();

export function usePrintSettings(): PrintSettingsState {
  return useSyncExternalStore(printSettings.subscribe, printSettings.get);
}

/** Le contexte d'une impression : projet, réglages et unité d'affichage. */
export function printContext(project: Project, projectName: string, unit: DisplayUnit, s: PrintSettingsState = printSettings.get()): PrintContext {
  return { project, projectName, fonts: s.fonts, setup: s.setup, unit, minLine: s.minLinePx * 0.75 };
}
