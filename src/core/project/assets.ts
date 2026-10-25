// Images du projet : stockées une seule fois, nommées par leur empreinte SHA-256.

import { sha256Hex } from "../hash";
import type { Project } from "./model";

/** Octets des images, par empreinte. Le JSON du projet ne contient que leurs métadonnées. */
export type AssetStore = Map<string, Uint8Array>;

export const ASSET_MIMES = ["image/png", "image/jpeg"] as const;

export function assetExtension(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  return "bin";
}

/** Ajoute une image au magasin (sans doublon) et déclare-la dans le projet. */
export function addAsset(
  project: Project,
  store: AssetStore,
  bytes: Uint8Array,
  mime: string,
): { project: Project; hash: string } {
  if (!(ASSET_MIMES as readonly string[]).includes(mime)) throw new Error(`Type d'image non pris en charge : ${mime}`);
  const hash = sha256Hex(bytes);
  if (!store.has(hash)) store.set(hash, bytes);
  if (project.assets[hash]) return { project, hash };
  return { project: { ...project, assets: { ...project.assets, [hash]: { mime, size: bytes.length } } }, hash };
}

/** Empreintes réellement citées par le carnet. */
export function referencedAssets(project: Project): Set<string> {
  const used = new Set<string>();
  for (const fabric of project.sketchbook.fabrics) if (fabric.source.kind === "image") used.add(fabric.source.asset);
  for (const photo of project.sketchbook.photos) used.add(photo.asset);
  return used;
}
