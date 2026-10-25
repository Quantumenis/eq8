// Fabriques et générateur pseudo-aléatoire communs aux tests du projet.

import {
  emptyNotecard,
  emptyProject,
  type BlockItem,
  type Coloring,
  type FabricItem,
  type Project,
  type QuiltItem,
} from "../../src/core/project/model";

/** mulberry32 : générateur déterministe, pour des tests de propriété reproductibles. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function coloring(id: string, fills: Coloring["fills"] = {}): Coloring {
  return { id, fills };
}

export function block(id: string, colorings: Coloring[] = [], drawing: BlockItem["drawing"] = { lines: [] }): BlockItem {
  return { id, card: emptyNotecard(`Bloc ${id}`), width: 6, height: 6, drawing, colorings };
}

export function fabric(id: string, averageColor = "#336699"): FabricItem {
  return {
    id,
    card: emptyNotecard(`Tissu ${id}`),
    source: { kind: "generated", generator: "solid", seed: 1, params: { color: averageColor } },
    averageColor,
  };
}

export function quilt(id: string, placements: QuiltItem["placements"] = [], fills: QuiltItem["fills"] = {}): QuiltItem {
  return { id, card: emptyNotecard(`Quilt ${id}`), layout: null, placements, fills };
}

export function projectWith(parts: Partial<Project["sketchbook"]>, maxColorings = 2): Project {
  const base = emptyProject(maxColorings);
  return { ...base, sketchbook: { ...base.sketchbook, ...parts } };
}
