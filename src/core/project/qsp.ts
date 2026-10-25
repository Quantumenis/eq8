// Format .qsp : une archive ZIP qui contient `project.json` et `assets/<sha256>.<ext>`.

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { sha256Hex } from "../hash";
import { assetExtension, referencedAssets, type AssetStore } from "./assets";
import { migrateProject } from "./migrate";
import type { Project } from "./model";
import { ProjectFormatError, validateProject } from "./validate";

export const PROJECT_ENTRY = "project.json";
const ASSET_ENTRY = /^assets\/([0-9a-f]{64})\.(png|jpg|bin)$/;

/** Garde-fous contre une archive piégée : tailles décompressées annoncées. */
const MAX_PROJECT_JSON_BYTES = 64 * 1024 * 1024;
const MAX_ASSET_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;

/** Date fixe : deux enregistrements du même projet donnent exactement les mêmes octets. */
const FIXED_MTIME = Date.UTC(2020, 0, 1);

export interface LoadedProject {
  project: Project;
  assets: AssetStore;
}

/** Sérialise un projet. Seules les images citées par le carnet sont écrites. */
export function writeQsp(project: Project, assets: AssetStore): Uint8Array {
  const used = referencedAssets(project);
  const prunedAssets: Project["assets"] = {};
  for (const hash of used) {
    const meta = project.assets[hash];
    if (!meta) throw new Error(`Image citée mais non déclarée : ${hash}`);
    prunedAssets[hash] = meta;
  }
  const out: Project = { ...project, assets: prunedAssets };

  const files: Zippable = {
    [PROJECT_ENTRY]: [strToU8(JSON.stringify(out)), { level: 6, mtime: FIXED_MTIME }],
  };
  for (const hash of used) {
    const bytes = assets.get(hash);
    if (!bytes) throw new Error(`Octets de l'image manquants : ${hash}`);
    // PNG et JPEG sont déjà compressés : on les stocke tels quels.
    files[`assets/${hash}.${assetExtension((prunedAssets[hash] as { mime: string }).mime)}`] = [
      bytes,
      { level: 0, mtime: FIXED_MTIME },
    ];
  }
  return zipSync(files);
}

/** Lit, migre et valide un fichier .qsp. Lève une `ProjectFormatError` en français si le fichier est inutilisable. */
export function readQsp(bytes: Uint8Array): LoadedProject {
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => {
        const isProject = file.name === PROJECT_ENTRY;
        const isAsset = ASSET_ENTRY.test(file.name);
        if (!isProject && !isAsset) return false;
        const limit = isProject ? MAX_PROJECT_JSON_BYTES : MAX_ASSET_BYTES;
        if (file.originalSize > limit) throw new ProjectFormatError(`${file.name} : entrée trop volumineuse`);
        total += file.originalSize;
        if (total > MAX_TOTAL_BYTES) throw new ProjectFormatError("Projet trop volumineux");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ProjectFormatError) throw error;
    throw new ProjectFormatError("Ce fichier n'est pas un projet Quilt Studio (archive illisible).");
  }

  const jsonBytes = entries[PROJECT_ENTRY];
  if (!jsonBytes) throw new ProjectFormatError(`Ce fichier n'est pas un projet Quilt Studio (${PROJECT_ENTRY} absent).`);

  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(jsonBytes));
  } catch {
    throw new ProjectFormatError(`${PROJECT_ENTRY} : JSON invalide.`);
  }

  const project = validateProject(migrateProject(raw));

  const assets: AssetStore = new Map();
  for (const hash of referencedAssets(project)) {
    const name = `assets/${hash}.${assetExtension((project.assets[hash] as { mime: string }).mime)}`;
    const data = entries[name];
    if (!data) throw new ProjectFormatError(`Image manquante dans l'archive : ${hash}`);
    if (sha256Hex(data) !== hash) throw new ProjectFormatError(`Image altérée (empreinte différente) : ${hash}`);
    assets.set(hash, data);
  }
  // Une image déclarée mais jamais citée est abandonnée avec ses métadonnées.
  const kept: Project["assets"] = {};
  for (const hash of assets.keys()) kept[hash] = project.assets[hash] as Project["assets"][string];
  return { project: { ...project, assets: kept }, assets };
}
