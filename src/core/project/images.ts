// Tissus et photos tirés d'images (SPEC §7.1-7.2) : Ajouter comme tissu, Enregistrer dans Photos, Copier vers Tissus,
// Copier vers Photos. Les octets de l'image sont dans le magasin du projet (assets.ts), nommés par leur empreinte.

import { renderGenerated } from "../fabric/generator";
import { encodePng } from "../image/png";
import { addAsset, type AssetStore } from "./assets";
import { addToSketchbook, makeColor } from "./commands";
import { createId, emptyNotecard, type FabricItem, type Id, type PhotoItem, type Project } from "./model";

export function makeImageFabric(hash: string, ppi: number, name: string, averageColor: string): FabricItem {
  return { id: createId(), card: emptyNotecard(name), source: { kind: "image", asset: hash, ppi }, averageColor };
}

export function makePhoto(hash: string, ppi: number, name: string): PhotoItem {
  return { id: createId(), card: emptyNotecard(name), asset: hash, ppi };
}

/** « Copier vers Tissus » : la photo devient aussi un tissu (même image, même résolution). */
export function photoToFabric(project: Project, photoId: Id, averageColor: string): { project: Project; id: Id | null; duplicate: boolean } {
  const photo = project.sketchbook.photos.find((p) => p.id === photoId);
  if (!photo) return { project, id: null, duplicate: false };
  const fabric: FabricItem = { id: createId(), card: { ...photo.card }, source: { kind: "image", asset: photo.asset, ppi: photo.ppi }, averageColor };
  const r = addToSketchbook(project, "fabrics", fabric);
  return r.status === "added" ? { project: r.project, id: fabric.id, duplicate: false } : { project, id: r.existingId, duplicate: true };
}

/**
 * « Copier vers Photos » : un tissu devient une photo, pour être retouché au plan Image. Un tissu généré est d'abord
 * rendu en PNG (sa tuile à 96 ppp).
 */
export function fabricToPhoto(project: Project, assets: AssetStore, fabricId: Id): { project: Project; id: Id | null; duplicate: boolean } {
  const fabric = project.sketchbook.fabrics.find((f) => f.id === fabricId);
  if (!fabric) return { project, id: null, duplicate: false };
  let next = project;
  let hash: string;
  let ppi: number;
  if (fabric.source.kind === "image") {
    hash = fabric.source.asset;
    ppi = fabric.source.ppi;
  } else {
    const tile = renderGenerated(fabric.source);
    const r = addAsset(next, assets, encodePng(tile.raster, tile.ppi), "image/png");
    next = r.project;
    hash = r.hash;
    ppi = tile.ppi;
  }
  const photo: PhotoItem = { id: createId(), card: { ...fabric.card }, asset: hash, ppi };
  const r = addToSketchbook(next, "photos", photo);
  return r.status === "added" ? { project: r.project, id: photo.id, duplicate: false } : { project, id: r.existingId, duplicate: true };
}

/** Ajoute des couleurs à la fin de la palette (gammes, sélecteur) ; une couleur déjà présente (même RVB) est ignorée. */
export function addColors(project: Project, colors: readonly string[]): { project: Project; added: Id[]; duplicates: number } {
  let next = project;
  const added: Id[] = [];
  let duplicates = 0;
  for (const rgb of colors) {
    const color = makeColor(rgb);
    if (next.sketchbook.colors.some((c) => c.rgb === color.rgb)) {
      duplicates += 1;
      continue;
    }
    next = addToSketchbook(next, "colors", color).project;
    added.push(color.id);
  }
  return { project: next, added, duplicates };
}
