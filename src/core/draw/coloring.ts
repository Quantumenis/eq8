// Coloration d'un bloc (SPEC §5.1-5.3, §5.7, §5.11) : pinceau, bombe, pipette et entrées de la palette
// « Tissus & Couleurs du carnet ». Une coloration associe la clé d'une pièce (voir pieces.ts) à son habillage.

import type { Id, Paint, Project } from "../project/model";
import type { Piece } from "./pieces";

export type Fills = Readonly<Record<string, Paint>>;

/** Deux habillages identiques (même tissu, ou même couleur unie). `undefined` = pièce non colorée. */
export function samePaint(a: Paint | undefined, b: Paint | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.kind === "fabric") return b.kind === "fabric" && a.fabricId === b.fabricId;
  return b.kind === "solid" && a.rgb.toLowerCase() === b.rgb.toLowerCase();
}

/** Pose un habillage sur des pièces ; renvoie l'objet reçu si rien ne change. */
export function paintPieces(fills: Fills, keys: readonly string[], paint: Paint): Fills {
  if (keys.every((k) => samePaint(fills[k], paint))) return fills;
  const next: Record<string, Paint> = { ...fills };
  for (const k of keys) next[k] = paint;
  return next;
}

/** Bombe : les pièces du bloc qui ont le même habillage que la pièce `key` (elle comprise). */
export function similarPieces(pieces: readonly Piece[], fills: Fills, key: string): string[] {
  if (!pieces.some((p) => p.key === key)) return [];
  const target = fills[key];
  return pieces.filter((p) => samePaint(fills[p.key], target)).map((p) => p.key);
}

/** Ne garde que les clés des pièces existantes (les autres viennent d'un dessin modifié depuis). */
export function pruneFills(fills: Fills, pieces: readonly Piece[]): Record<string, Paint> {
  const keys = new Set(pieces.map((p) => p.key));
  return Object.fromEntries(Object.entries(fills).filter(([k]) => keys.has(k)));
}

export type PaletteTab = "fabrics" | "colors";

export interface PaletteEntry {
  tab: PaletteTab;
  id: Id;
  name: string;
  paint: Paint;
  /** Couleur d'affichage : la couleur unie, ou la couleur moyenne du tissu (les motifs arrivent au jalon M4). */
  rgb: string;
}

/** Les entrées d'un onglet de la palette, dans l'ordre du carnet. */
export function paletteEntries(project: Project, tab: PaletteTab): PaletteEntry[] {
  if (tab === "colors") {
    return project.sketchbook.colors.map((c) => ({ tab, id: c.id, name: c.card.name, paint: { kind: "solid", rgb: c.rgb }, rgb: c.rgb }));
  }
  return project.sketchbook.fabrics.map((f) => ({
    tab,
    id: f.id,
    name: f.card.name,
    paint: { kind: "fabric", fabricId: f.id },
    rgb: f.averageColor,
  }));
}

/** Pipette : l'entrée de la palette qui correspond à un habillage (le premier uni de même couleur), ou `null`. */
export function findPaletteEntry(project: Project, paint: Paint | undefined): PaletteEntry | null {
  if (!paint) return null;
  const tab: PaletteTab = paint.kind === "fabric" ? "fabrics" : "colors";
  return paletteEntries(project, tab).find((e) => samePaint(e.paint, paint)) ?? null;
}

/** Couleur d'affichage d'un habillage (un tissu supprimé ou inconnu s'affiche en gris). */
export function displayColor(project: Project, paint: Paint | undefined): string | null {
  if (!paint) return null;
  if (paint.kind === "solid") return paint.rgb;
  return project.sketchbook.fabrics.find((f) => f.id === paint.fabricId)?.averageColor ?? "#9e9e9e";
}

/** « Récemment utilisés » : l'habillage passe en tête, sans doublon, 12 au plus. */
export function pushRecent(recent: readonly Paint[], paint: Paint, max = 12): Paint[] {
  return [paint, ...recent.filter((p) => !samePaint(p, paint))].slice(0, max);
}
