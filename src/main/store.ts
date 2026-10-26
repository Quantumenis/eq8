// Fichiers de l'application : dossiers, préférences, sauvegarde automatique et palette par défaut.

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { Preferences, RecoveryInfo } from "../shared/api.js";

export const DEFAULT_PREFERENCES: Preferences = { unit: "in", maxColorings: 2, recents: [], print: null };
/** Les réglages d'impression sont gardés tels quels (l'interface les valide), dans une taille raisonnable. */
const MAX_PRINT_PREFS = 16 * 1024;
const MAX_RECENTS = 10;

/** Les variables d'environnement servent aux tests : elles isolent les données de l'utilisateur. */
export function projectsDir(): string {
  const root = process.env.QUILT_STUDIO_DOCUMENTS_DIR || app.getPath("documents");
  return path.join(root, "Quilt Studio", "Projets");
}

/** Bibliothèques personnelles (« Mes favoris »), séparées des projets (SPEC §8.7). */
export function favoritesDir(): string {
  const root = process.env.QUILT_STUDIO_DOCUMENTS_DIR || app.getPath("documents");
  return path.join(root, "Quilt Studio", "Favoris");
}

export function applyDataDirOverride(): void {
  const dir = process.env.QUILT_STUDIO_DATA_DIR;
  if (dir) app.setPath("userData", dir);
}

export function autosaveIntervalMs(): number {
  const forced = Number(process.env.QUILT_STUDIO_AUTOSAVE_MS);
  return Number.isFinite(forced) && forced >= 100 ? forced : 2 * 60 * 1000;
}

const dataPath = (...parts: string[]) => path.join(app.getPath("userData"), ...parts);

/** Écriture atomique : fichier temporaire voisin, puis renommage. Un plantage ne laisse jamais un fichier tronqué. */
export async function writeFileAtomic(target: string, data: Uint8Array | string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temp, data);
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Préférences

function sanitizePreferences(raw: unknown): Preferences {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const max = r.maxColorings;
  return {
    unit: r.unit === "cm" ? "cm" : "in",
    maxColorings: typeof max === "number" && Number.isInteger(max) && max >= 1 && max <= 10 ? max : DEFAULT_PREFERENCES.maxColorings,
    recents: Array.isArray(r.recents)
      ? r.recents.filter((p): p is string => typeof p === "string" && p.toLowerCase().endsWith(".qsp")).slice(0, MAX_RECENTS)
      : [],
    print: typeof r.print === "object" && r.print !== null && JSON.stringify(r.print).length <= MAX_PRINT_PREFS ? r.print : null,
  };
}

let cached: Preferences | undefined;

export async function loadPreferences(): Promise<Preferences> {
  cached ??= sanitizePreferences(await readJson(dataPath("preferences.json")));
  return cached;
}

export async function savePreferences(next: Preferences): Promise<Preferences> {
  cached = sanitizePreferences(next);
  await writeFileAtomic(dataPath("preferences.json"), JSON.stringify(cached, null, 2));
  return cached;
}

export async function rememberRecent(filePath: string): Promise<Preferences> {
  const prefs = await loadPreferences();
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const recents = [filePath, ...prefs.recents.filter((p) => !same(p, filePath))].slice(0, MAX_RECENTS);
  return savePreferences({ ...prefs, recents });
}

export async function forgetRecent(filePath: string): Promise<Preferences> {
  const prefs = await loadPreferences();
  return savePreferences({ ...prefs, recents: prefs.recents.filter((p) => p.toLowerCase() !== filePath.toLowerCase()) });
}

// ---------------------------------------------------------------------------------------------------------------
// Sauvegarde automatique. La session en cours écrit `session.*` ; au démarrage, celle d'une session interrompue
// est mise de côté dans `previous.*` jusqu'à ce que l'utilisateur la restaure ou l'ignore.

const recoveryFile = (name: string, ext: "qsp" | "json") => dataPath("recovery", `${name}.${ext}`);

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(() => true, () => false);
}

export async function shelveInterruptedSession(): Promise<void> {
  if (!(await exists(recoveryFile("session", "json"))) || !(await exists(recoveryFile("session", "qsp")))) return;
  await fs.rename(recoveryFile("session", "qsp"), recoveryFile("previous", "qsp")).catch(() => undefined);
  await fs.rename(recoveryFile("session", "json"), recoveryFile("previous", "json")).catch(() => undefined);
}

export async function writeSessionRecovery(bytes: Uint8Array, info: Omit<RecoveryInfo, "savedAt">): Promise<void> {
  // Les octets d'abord : un fichier .json sans .qsp ne serait jamais proposé.
  await writeFileAtomic(recoveryFile("session", "qsp"), bytes);
  await writeFileAtomic(recoveryFile("session", "json"), JSON.stringify({ ...info, savedAt: Date.now() }));
}

export async function clearSessionRecovery(): Promise<void> {
  await fs.rm(recoveryFile("session", "json"), { force: true });
  await fs.rm(recoveryFile("session", "qsp"), { force: true });
}

export async function checkPreviousRecovery(): Promise<RecoveryInfo | null> {
  const raw = (await readJson(recoveryFile("previous", "json"))) as Record<string, unknown> | undefined;
  if (!raw || typeof raw.name !== "string" || typeof raw.savedAt !== "number") return null;
  if (!(await exists(recoveryFile("previous", "qsp")))) return null;
  return { name: raw.name, path: typeof raw.path === "string" ? raw.path : null, savedAt: raw.savedAt };
}

export async function readPreviousRecovery(): Promise<Uint8Array | null> {
  return fs.readFile(recoveryFile("previous", "qsp")).catch(() => null);
}

export async function discardPreviousRecovery(): Promise<void> {
  await fs.rm(recoveryFile("previous", "json"), { force: true });
  await fs.rm(recoveryFile("previous", "qsp"), { force: true });
}

// ---------------------------------------------------------------------------------------------------------------
// Palette par défaut personnalisée

export async function readDefaultPalette(): Promise<Uint8Array | null> {
  return fs.readFile(dataPath("default-palette.qsp")).catch(() => null);
}

export async function writeDefaultPalette(bytes: Uint8Array): Promise<void> {
  await writeFileAtomic(dataPath("default-palette.qsp"), bytes);
}

export async function removeDefaultPalette(): Promise<void> {
  await fs.rm(dataPath("default-palette.qsp"), { force: true });
}
