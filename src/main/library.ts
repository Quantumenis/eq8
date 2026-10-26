// Fichiers des bibliothèques pour l'interface : import d'images (boîte de dialogue) et « Mes favoris »
// (Documents\Quilt Studio\Favoris\<Blocs|Tissus|Fils>\<nom>.qsl). L'interface ne donne jamais de chemin : seulement
// un type de bibliothèque et un nom, vérifié comme un nom de projet.

import fs from "node:fs/promises";
import path from "node:path";
import { dialog, type BrowserWindow } from "electron";
import { checkProjectName } from "../core/project/names.js";
import { IPC, type FavoriteKindId, type FavoriteListing, type ImportedImage, type SaveResult } from "../shared/api.js";
import { handle } from "./ipc.js";
import { favoritesDir, writeFileAtomic } from "./store.js";

const FAVORITES_EXTENSION = ".qsl";
const MAX_IMAGE_BYTES = 256 * 1024 * 1024;
const MAX_LIBRARY_BYTES = 1024 * 1024 * 1024;
const FOLDERS: Record<FavoriteKindId, string> = { blocks: "Blocs", fabrics: "Tissus", threads: "Fils" };

function isKind(kind: unknown): kind is FavoriteKindId {
  return kind === "blocks" || kind === "fabrics" || kind === "threads";
}

/** Chemin d'une bibliothèque de favoris, ou `null` si le nom est refusé. */
function libraryPath(kind: unknown, name: unknown): string | null {
  if (!isKind(kind) || typeof name !== "string") return null;
  const check = checkProjectName(name);
  if (!check.ok) return null;
  const folder = path.join(favoritesDir(), FOLDERS[kind]);
  const file = path.join(folder, `${check.name}${FAVORITES_EXTENSION}`);
  return path.dirname(path.resolve(file)).toLowerCase() === path.resolve(folder).toLowerCase() ? file : null;
}

export function registerLibraryIpc(getWindow: () => BrowserWindow | null): void {
  handle(IPC.importImages, async (_event, multiple: unknown): Promise<ImportedImage[] | null> => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: multiple === true ? "Importer des images" : "Importer une image",
      filters: [{ name: "Images (JPG, PNG)", extensions: ["jpg", "jpeg", "png"] }],
      properties: multiple === true ? ["openFile", "multiSelections"] : ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const images: ImportedImage[] = [];
    for (const file of result.filePaths) {
      try {
        const stat = await fs.stat(file);
        if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) {
          images.push({ name: path.basename(file), bytes: null, error: "too-large" });
          continue;
        }
        images.push({ name: path.basename(file), bytes: await fs.readFile(file), error: null });
      } catch {
        images.push({ name: path.basename(file), bytes: null, error: "io" });
      }
    }
    return images;
  });

  handle(IPC.listFavorites, async (_event, kind: unknown): Promise<FavoriteListing[]> => {
    if (!isKind(kind)) return [];
    const folder = path.join(favoritesDir(), FOLDERS[kind]);
    try {
      const out: FavoriteListing[] = [];
      for (const dirent of await fs.readdir(folder, { withFileTypes: true })) {
        if (!dirent.isFile() || !dirent.name.toLowerCase().endsWith(FAVORITES_EXTENSION)) continue;
        out.push({ name: dirent.name.slice(0, -FAVORITES_EXTENSION.length) });
      }
      return out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    } catch {
      return [];
    }
  });

  handle(IPC.readFavorite, async (_event, kind: unknown, name: unknown): Promise<Uint8Array | null> => {
    const file = libraryPath(kind, name);
    if (!file) return null;
    try {
      const stat = await fs.stat(file);
      if (stat.size > MAX_LIBRARY_BYTES) return null;
      return await fs.readFile(file);
    } catch {
      return null;
    }
  });

  handle(IPC.writeFavorite, async (_event, kind: unknown, name: unknown, bytes: unknown, create: unknown): Promise<SaveResult> => {
    const file = libraryPath(kind, name);
    if (!file || !(bytes instanceof Uint8Array)) return { ok: false, error: "invalid-name" };
    try {
      if (create === true) {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, bytes, { flag: "wx" }); // une nouvelle bibliothèque n'écrase jamais une autre
      } else {
        await writeFileAtomic(file, bytes);
      }
      return { ok: true, path: file };
    } catch (error) {
      return { ok: false, error: (error as NodeJS.ErrnoException).code === "EEXIST" ? "exists" : "io" };
    }
  });

  handle(IPC.deleteFavorite, async (_event, kind: unknown, name: unknown): Promise<boolean> => {
    const file = libraryPath(kind, name);
    if (!file) return false;
    try {
      await fs.rm(file);
      return true;
    } catch {
      return false;
    }
  });
}
