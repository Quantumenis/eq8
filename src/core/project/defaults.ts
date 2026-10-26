// Contenu initial d'un nouveau projet et palette par défaut personnalisée.

import { LIBRARY_FABRICS, fabricLibraryTree, instantiateLibraryFabric, type LibraryFabricDef } from "../library/fabrics";
import type { AssetStore } from "./assets";
import { createId, emptyNotecard, emptyProject, type ColorItem, type FabricItem, type Project, type ThreadItem } from "./model";
import type { LoadedProject } from "./qsp";

/** Couleurs de base proposées dans un projet neuf. */
const BASE_COLORS: [string, string][] = [
  ["Blanc", "#ffffff"],
  ["Crème", "#f6efdc"],
  ["Gris clair", "#c8c8c8"],
  ["Gris", "#808080"],
  ["Anthracite", "#3a3d42"],
  ["Noir", "#000000"],
  ["Rouge", "#c62828"],
  ["Rouge brique", "#9c3b2e"],
  ["Rose", "#f4a6c0"],
  ["Fuchsia", "#c2185b"],
  ["Orange", "#ef6c00"],
  ["Abricot", "#f6b26b"],
  ["Jaune", "#f9d71c"],
  ["Moutarde", "#c9a227"],
  ["Vert clair", "#9ccc65"],
  ["Vert", "#2e7d32"],
  ["Vert sapin", "#1b4d3e"],
  ["Turquoise", "#26a69a"],
  ["Bleu ciel", "#81c7f0"],
  ["Bleu", "#1e66c8"],
  ["Marine", "#14284b"],
  ["Violet", "#6a3fa0"],
  ["Lilas", "#c3a6e0"],
  ["Marron", "#6d4c2f"],
];

/** Fils de base (un jeu de couleurs courantes). */
const BASE_THREADS: [string, string][] = [
  ["Fil blanc", "#ffffff"],
  ["Fil écru", "#efe6cf"],
  ["Fil gris", "#9a9a9a"],
  ["Fil noir", "#111111"],
  ["Fil rouge", "#b71c1c"],
  ["Fil rose", "#ec7fa5"],
  ["Fil orange", "#e65100"],
  ["Fil jaune", "#f2c200"],
  ["Fil vert", "#388e3c"],
  ["Fil bleu ciel", "#64b5f6"],
  ["Fil bleu marine", "#1a237e"],
  ["Fil marron", "#5d4037"],
];

/** Tissus d'un projet neuf : le premier de chaque style de la bibliothèque, plus quatre marbrés. */
function defaultFabrics(): FabricItem[] {
  const firsts = fabricLibraryTree().flatMap((c) => c.styles.map((s) => s.fabrics[0]));
  const mottled = ["marbre-orange", "marbre-vert", "marbre-bleu", "marbre-violet"].map((id) => LIBRARY_FABRICS.find((f) => f.id === id));
  return [...firsts, ...mottled].filter((d): d is LibraryFabricDef => d !== undefined).map(instantiateLibraryFabric);
}

/** Projet neuf avec le contenu par défaut d'origine : couleurs, tissus et fils (pas de blocs : voir la bibliothèque). */
export function builtInDefaultProject(maxColorings?: number): Project {
  const project = emptyProject(maxColorings);
  const colors: ColorItem[] = BASE_COLORS.map(([name, rgb]) => ({ id: createId(), card: emptyNotecard(name), rgb }));
  const threads: ThreadItem[] = BASE_THREADS.map(([name, rgb]) => ({ id: createId(), card: emptyNotecard(name), rgb }));
  return { ...project, sketchbook: { ...project.sketchbook, colors, fabrics: defaultFabrics(), threads } };
}

/**
 * Nouveau projet : à partir de la palette par défaut de l'utilisateur si elle existe (blocs, motifs, pochoirs,
 * tissus, couleurs et fils, dans leur ordre de tri), sinon du contenu d'origine.
 */
export function newProject(palette: LoadedProject | null, maxColorings?: number): LoadedProject {
  if (!palette) return { project: builtInDefaultProject(maxColorings), assets: new Map() };
  const project = maxColorings === undefined ? palette.project : { ...palette.project, settings: { maxColorings } };
  return { project, assets: new Map(palette.assets) };
}

/** Garde de ce projet seulement ce qui constitue une palette par défaut. Les quilts, photos et broderies sont retirés. */
export function extractPalette(project: Project, assets: AssetStore): LoadedProject {
  const stripped: Project = {
    ...project,
    sketchbook: { ...project.sketchbook, quilts: [], photos: [], embroideries: [] },
  };
  return { project: stripped, assets: new Map(assets) };
}
