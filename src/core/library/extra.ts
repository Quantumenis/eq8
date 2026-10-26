// Le reste de la bibliothèque intégrée (M8, SPEC §8.1, Q-8.1) : blocs PolyDraw, blocs d'applique, motifs et pochoirs
// dessinés par code. Les blocs en pièces EasyDraw sont dans `blocks.ts` ; ce module les réunit dans une seule liste.

import { rotateAbout, transformShape, wreath, type AppShape, makeShape, polyShape } from "../draw/applique";
import {
  DEFAULT_STAR,
  DEFAULT_STENCIL,
  POSIE_PRESETS,
  ellipseShape,
  formShape,
  posieParams,
  posieShapes,
  rectShape,
  starShape,
  stencilShapes,
} from "../draw/appliqueShapes";
import { contentOfParts, drawingOfParts, type BlockStyle, type DrawingParts } from "../draw/content";
import type { Pt, Segment } from "../draw/geometry";
import { gridEdge, DEFAULT_GRIDS, emptyPoly, type PolyPiece } from "../draw/polydraw";
import { createId, emptyNotecard, type BlockItem, type BlockListKey, type Coloring, type Paint } from "../project/model";
import { toGrey } from "./builder";
import { LIBRARY_BLOCKS, LIBRARY_NAME, builtLibraryBlock, instantiateLibraryBlock, type LibraryBlockDef } from "./blocks";

export const EXTRA_CATEGORIES = {
  applique: "04 Applique classique",
  poly: "05 Pièces sur grille (PolyDraw)",
  motifs: "06 Motifs",
  stencils: "07 Pochoirs de matelassage",
} as const;

export interface LibraryEntry {
  id: string;
  name: string;
  category: string;
  style: string;
  notes: string;
  /** Liste du carnet où l'élément arrive : blocs, motifs ou pochoirs. */
  list: BlockListKey;
  width: number;
  height: number;
  build: () => { drawing: BlockItem["drawing"]; colorings: Coloring[] };
}

const CREAM = "#f6efdc";
const RED = "#c62828";
const NAVY = "#14284b";
const BLUE = "#1e66c8";
const SKY = "#81c7f0";
const GREEN = "#2e7d32";
const LIGHT_GREEN = "#9ccc65";
const GOLD = "#f9d71c";
const ROSE = "#f4a6c0";
const FUCHSIA = "#c2185b";
const ORANGE = "#ef6c00";
const VIOLET = "#6a3fa0";
const LILAC = "#c3a6e0";
const BROWN = "#6d4c2f";

const solid = (rgb: string): Paint => ({ kind: "solid", rgb });

/** Deux colorations (gris, puis couleur) à partir d'une couleur par pièce, dans l'ordre des pièces du dessin. */
function colorings(parts: DrawingParts, width: number, height: number, colorOf: (index: number) => string): Coloring[] {
  const content = contentOfParts(parts, width, height);
  const color: Record<string, Paint> = {};
  const grey: Record<string, Paint> = {};
  content.pieces.forEach((piece, i) => {
    const rgb = colorOf(i);
    color[piece.key] = solid(rgb);
    grey[piece.key] = solid(toGrey(rgb));
  });
  return [
    { id: createId(), fills: grey },
    { id: createId(), fills: color },
  ];
}

const appliqueParts = (style: BlockStyle, shapes: AppShape[]): DrawingParts => ({ style, segments: [], poly: emptyPoly(), shapes });

// ---------------------------------------------------------------------------------------------------------------
// Formes d'applique

const rotate = (s: AppShape, deg: number, c: Pt): AppShape => transformShape(s, rotateAbout(deg, c));
const leaf = (x0: number, y0: number, x1: number, y1: number): AppShape => formShape("leaf", x0, y0, x1, y1) as AppShape;

function heartShapes(): AppShape[] {
  return [formShape("heart", 0.9, 1, 5.1, 5.2) as AppShape];
}

function tulipShapes(): AppShape[] {
  const c = { x: 3, y: 2.2 };
  return [
    rectShape(2.88, 3, 3.12, 5.7, [0.1, 0.1, 0.1, 0.1]) as AppShape,
    rotate(leaf(1.2, 3.6, 2.9, 5.2), 0, c),
    transformShape(leaf(1.2, 3.6, 2.9, 5.2), [-1, 0, 0, 1, 6, 0]),
    rotate(formShape("petal", 2.25, 0.55, 3.75, 3.35) as AppShape, -28, { x: 3, y: 3.3 }),
    rotate(formShape("petal", 2.25, 0.55, 3.75, 3.35) as AppShape, 28, { x: 3, y: 3.3 }),
    formShape("petal", 2.25, 0.4, 3.75, 3.4) as AppShape,
  ];
}

function flowerShapes(): AppShape[] {
  const preset = POSIE_PRESETS[3] ?? (POSIE_PRESETS[0] as (typeof POSIE_PRESETS)[number]);
  return posieShapes(6, 6, { ...posieParams(preset, 100), length: 46, center: 14 });
}

function wreathShapes(): AppShape[] {
  const seed = formShape("leaf", 2.5, 0.4, 3.5, 2.3) as AppShape;
  const result = wreath([seed], new Set([seed.id]), 6, 6, { count: 8, spacing: 55, size: 100 });
  return result?.shapes ?? [];
}

function starShapes(): AppShape[] {
  return [starShape(6, 6, { ...DEFAULT_STAR, center: 42, size: 94 })];
}

function butterflyShapes(): AppShape[] {
  const left = (x0: number, y0: number, x1: number, y1: number, deg: number) => rotate(ellipseShape((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2), deg, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
  const mirror = (s: AppShape) => transformShape(s, [-1, 0, 0, 1, 6, 0]);
  const upper = left(0.5, 0.8, 2.8, 3.1, -20);
  const lower = left(0.9, 3.0, 2.8, 5.0, 25);
  return [
    upper,
    mirror(upper),
    lower,
    mirror(lower),
    ellipseShape(3, 3, 0.22, 1.7),
    polyShape([{ x: 2.95, y: 1.4 }, { x: 2.3, y: 0.55 }], false),
    polyShape([{ x: 3.05, y: 1.4 }, { x: 3.7, y: 0.55 }], false),
  ];
}

function featherShapes(): AppShape[] {
  const spine = makeShape(
    [
      { x: 1, y: 7, type: "smooth", hout: { x: 1.3, y: -1.6 } },
      { x: 7, y: 1, type: "smooth", hin: { x: -1.6, y: 1.3 } },
    ],
    false,
  );
  const barbs: AppShape[] = [];
  for (let i = 1; i <= 8; i++) {
    const t = i / 9;
    const x = 1 + 6 * t;
    const y = 7 - 6 * t;
    barbs.push(polyShape([{ x, y }, { x: x + 0.9 - 0.4 * t, y: y - 0.1 - 0.9 * t * 0 }], false));
    barbs.push(polyShape([{ x, y }, { x: x - 0.3 - 0.3 * t, y: y - 0.9 + 0.3 * t }], false));
  }
  return [spine, ...barbs];
}

function heartOutlineShapes(): AppShape[] {
  return [formShape("heart", 0.6, 0.7, 5.4, 5.5) as AppShape, formShape("heart", 1.5, 1.7, 4.5, 4.6) as AppShape];
}

// ---------------------------------------------------------------------------------------------------------------
// PolyDraw

function poly(id: string, edges: Segment[]): PolyPiece {
  return { id, edges };
}

const line = (id: string, a: Pt, b: Pt): Segment => ({ id, kind: "line", a, b });

function loop(id: string, pts: readonly Pt[]): PolyPiece {
  return poly(id, pts.map((p, i) => line(`${id}.${i}`, p, pts[(i + 1) % pts.length] as Pt)));
}

/** LeMoyne Star sur la grille Étoile 8 branches : 4 carrés de coin, 4 triangles de côté, 8 losanges. */
function leMoynePieces(w: number, h: number): PolyPiece[] {
  const k = 2 + Math.SQRT2;
  const cx = w / k;
  const cy = h / k;
  const dTop = ((w - 2 * cx) * h) / (2 * w);
  const dSide = ((h - 2 * cy) * w) / (2 * h);
  const O = { x: w / 2, y: h / 2 };
  const ring: Pt[] = [
    { x: w / 2, y: dTop },
    { x: cx, y: cy },
    { x: dSide, y: h / 2 },
    { x: cx, y: h - cy },
    { x: w / 2, y: h - dTop },
    { x: w - cx, y: h - cy },
    { x: w - dSide, y: h / 2 },
    { x: w - cx, y: cy },
  ];
  const tips: Pt[] = [
    { x: cx, y: 0 },
    { x: 0, y: cy },
    { x: 0, y: h - cy },
    { x: cx, y: h },
    { x: w - cx, y: h },
    { x: w, y: h - cy },
    { x: w, y: cy },
    { x: w - cx, y: 0 },
  ];
  const pieces: PolyPiece[] = [];
  for (let i = 0; i < 8; i++) pieces.push(loop(`d${i}`, [O, ring[i] as Pt, tips[i] as Pt, ring[(i + 1) % 8] as Pt]));
  pieces.push(loop("c0", [{ x: 0, y: 0 }, { x: cx, y: 0 }, { x: cx, y: cy }, { x: 0, y: cy }]));
  pieces.push(loop("c1", [{ x: w - cx, y: 0 }, { x: w, y: 0 }, { x: w, y: cy }, { x: w - cx, y: cy }]));
  pieces.push(loop("c2", [{ x: w - cx, y: h - cy }, { x: w, y: h - cy }, { x: w, y: h }, { x: w - cx, y: h }]));
  pieces.push(loop("c3", [{ x: 0, y: h - cy }, { x: cx, y: h - cy }, { x: cx, y: h }, { x: 0, y: h }]));
  pieces.push(loop("t0", [{ x: cx, y: 0 }, { x: w - cx, y: 0 }, ring[0] as Pt]));
  pieces.push(loop("t1", [{ x: w, y: cy }, { x: w, y: h - cy }, ring[6] as Pt]));
  pieces.push(loop("t2", [{ x: w - cx, y: h }, { x: cx, y: h }, ring[4] as Pt]));
  pieces.push(loop("t3", [{ x: 0, y: h - cy }, { x: 0, y: cy }, ring[2] as Pt]));
  return pieces;
}

/** Dresden Plate sur la grille Cercle (16 rayons, 4 anneaux) : 16 pétales, le cœur et les quatre coins. */
function dresdenPieces(w: number, h: number): PolyPiece[] {
  const grid = { ...DEFAULT_GRIDS.circle, a: 4, b: 16 };
  const c = { x: w / 2, y: h / 2 };
  const r1 = Math.min(w, h) / 2 / 3;
  const r3 = Math.min(w, h) / 2;
  const at = (r: number, j: number): Pt => ({ x: c.x + r * Math.cos((2 * Math.PI * j) / 16), y: c.y + r * Math.sin((2 * Math.PI * j) / 16) });
  const pieces: PolyPiece[] = [];
  for (let j = 0; j < 16; j++) {
    const a1 = at(r1, j);
    const a3 = at(r3, j);
    const b3 = at(r3, j + 1);
    const b1 = at(r1, j + 1);
    pieces.push(poly(`b${j}`, [gridEdge(grid, w, h, a1, a3, false, `b${j}.0`), gridEdge(grid, w, h, a3, b3, true, `b${j}.1`), gridEdge(grid, w, h, b3, b1, false, `b${j}.2`), gridEdge(grid, w, h, b1, a1, true, `b${j}.3`)]));
  }
  pieces.push(poly("hub", Array.from({ length: 16 }, (_, j) => gridEdge(grid, w, h, at(r1, j), at(r1, j + 1), true, `hub.${j}`))));
  // Les quatre coins : deux droites sur le bord du bloc et l'arc de l'anneau extérieur.
  const corner = (id: string, k: Pt, a: Pt, b: Pt) => poly(id, [line(`${id}.0`, k, a), gridEdge(grid, w, h, a, b, true, `${id}.1`), line(`${id}.2`, b, k)]);
  pieces.push(corner("k0", { x: 0, y: 0 }, { x: w / 2, y: 0 }, { x: 0, y: h / 2 }));
  pieces.push(corner("k1", { x: w, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: 0 }));
  pieces.push(corner("k2", { x: w, y: h }, { x: w / 2, y: h }, { x: w, y: h / 2 }));
  pieces.push(corner("k3", { x: 0, y: h }, { x: 0, y: h / 2 }, { x: w / 2, y: h }));
  return pieces;
}

function polyParts(kind: "star8" | "circle", w: number, h: number): DrawingParts {
  const pieces = kind === "star8" ? leMoynePieces(w, h) : dresdenPieces(w, h);
  return { style: "poly", segments: [], poly: { grid: kind === "star8" ? { ...DEFAULT_GRIDS.star8, a: 2, b: 2 } : { ...DEFAULT_GRIDS.circle, a: 4, b: 16 }, pieces }, shapes: [] };
}

// ---------------------------------------------------------------------------------------------------------------
// Les entrées

interface Spec {
  id: string;
  name: string;
  category: string;
  style: string;
  notes: string;
  list: BlockListKey;
  width: number;
  height: number;
  parts: () => DrawingParts;
  colors?: (index: number, count: number) => string;
  /** Sans coloration (pochoirs). */
  noColoring?: boolean;
}

const cycle = (list: readonly string[]) => (i: number) => list[i % list.length] as string;

const SPECS: Spec[] = [
  { id: "lemoyne-star", name: "LeMoyne Star", category: EXTRA_CATEGORIES.poly, style: "Étoiles sur grille", notes: "Huit losanges, quatre carrés de coin et quatre triangles de côté, sur la grille Étoile 8 branches.", list: "blocks", width: 8, height: 8, parts: () => polyParts("star8", 8, 8), colors: (i) => (i < 8 ? [RED, ORANGE][i % 2] as string : i < 12 ? CREAM : NAVY) },
  { id: "dresden-plate", name: "Dresden Plate", category: EXTRA_CATEGORIES.poly, style: "Cercles et pétales", notes: "Seize pétales autour d'un cœur, sur la grille Cercle ; les coins sont des pièces de fond.", list: "blocks", width: 8, height: 8, parts: () => polyParts("circle", 8, 8), colors: (i) => (i < 16 ? [ROSE, FUCHSIA, LILAC, SKY][i % 4] as string : i === 16 ? GOLD : CREAM) },
  { id: "applique-heart", name: "Cœur", category: EXTRA_CATEGORIES.applique, style: "Cœurs et étoiles", notes: "Un cœur appliqué sur un fond.", list: "blocks", width: 6, height: 6, parts: () => appliqueParts("applique", heartShapes()), colors: cycle([CREAM, RED]) },
  { id: "applique-tulip", name: "Tulipe", category: EXTRA_CATEGORIES.applique, style: "Fleurs", notes: "Une tulipe : tige, deux feuilles et trois pétales.", list: "blocks", width: 6, height: 6, parts: () => appliqueParts("applique", tulipShapes()), colors: cycle([CREAM, GREEN, LIGHT_GREEN, LIGHT_GREEN, FUCHSIA, FUCHSIA, ROSE]) },
  { id: "applique-flower", name: "Fleur à pétales", category: EXTRA_CATEGORIES.applique, style: "Fleurs", notes: "Une fleur de huit pétales (PosieMaker) avec son cœur.", list: "blocks", width: 6, height: 6, parts: () => appliqueParts("applique", flowerShapes()), colors: (i, n) => (i === 0 ? CREAM : i === n - 1 ? GOLD : ROSE) },
  { id: "applique-wreath", name: "Couronne de feuilles", category: EXTRA_CATEGORIES.applique, style: "Couronnes", notes: "Huit feuilles en couronne (WreathMaker).", list: "blocks", width: 6, height: 6, parts: () => appliqueParts("applique", wreathShapes()), colors: (i) => (i === 0 ? CREAM : [GREEN, LIGHT_GREEN][i % 2] as string) },
  { id: "applique-star", name: "Étoile appliquée", category: EXTRA_CATEGORIES.applique, style: "Cœurs et étoiles", notes: "Une étoile à cinq branches (StarMaker) sur un fond marine.", list: "blocks", width: 6, height: 6, parts: () => appliqueParts("applique", starShapes()), colors: cycle([NAVY, GOLD]) },
  { id: "applique-butterfly", name: "Papillon", category: EXTRA_CATEGORIES.applique, style: "Insectes", notes: "Quatre ailes, un corps et deux antennes (des fils).", list: "blocks", width: 6, height: 6, parts: () => appliqueParts("applique", butterflyShapes()), colors: cycle([CREAM, VIOLET, VIOLET, LILAC, LILAC, BROWN]) },
  { id: "motif-heart", name: "Cœur (motif)", category: EXTRA_CATEGORIES.motifs, style: "Motifs simples", notes: "Un cœur sans fond.", list: "motifs", width: 6, height: 6, parts: () => appliqueParts("motif", heartShapes()), colors: cycle([RED]) },
  { id: "motif-tulip", name: "Tulipe (motif)", category: EXTRA_CATEGORIES.motifs, style: "Motifs simples", notes: "Une tulipe sans fond.", list: "motifs", width: 6, height: 6, parts: () => appliqueParts("motif", tulipShapes()), colors: cycle([GREEN, LIGHT_GREEN, LIGHT_GREEN, FUCHSIA, FUCHSIA, ROSE]) },
  { id: "motif-flower", name: "Fleur (motif)", category: EXTRA_CATEGORIES.motifs, style: "Motifs simples", notes: "Une fleur de huit pétales sans fond.", list: "motifs", width: 6, height: 6, parts: () => appliqueParts("motif", flowerShapes()), colors: (i, n) => (i === n - 1 ? GOLD : ROSE) },
  { id: "motif-wreath", name: "Couronne (motif)", category: EXTRA_CATEGORIES.motifs, style: "Couronnes", notes: "Huit feuilles en couronne, sans fond.", list: "motifs", width: 6, height: 6, parts: () => appliqueParts("motif", wreathShapes()), colors: cycle([GREEN, LIGHT_GREEN]) },
  { id: "motif-star", name: "Étoile (motif)", category: EXTRA_CATEGORIES.motifs, style: "Motifs simples", notes: "Une étoile à cinq branches sans fond.", list: "motifs", width: 6, height: 6, parts: () => appliqueParts("motif", starShapes()), colors: cycle([GOLD]) },
  { id: "stencil-rosette", name: "Rosace à 8 pétales", category: EXTRA_CATEGORIES.stencils, style: "Rosaces", notes: "Un pochoir de matelassage : huit pétales.", list: "stencils", width: 8, height: 8, parts: () => appliqueParts("motif", stencilShapes(8, 8, DEFAULT_STENCIL)), noColoring: true },
  { id: "stencil-loops", name: "Rosace à boucles", category: EXTRA_CATEGORIES.stencils, style: "Rosaces", notes: "Six pétales terminés par une boucle.", list: "stencils", width: 8, height: 8, parts: () => appliqueParts("motif", stencilShapes(8, 8, { petals: 6, loop: true, size: 92 })), noColoring: true },
  { id: "stencil-feather", name: "Plume", category: EXTRA_CATEGORIES.stencils, style: "Plumes", notes: "Une plume au trait : un fil par barbe.", list: "stencils", width: 8, height: 8, parts: () => appliqueParts("motif", featherShapes()), noColoring: true },
  { id: "stencil-heart", name: "Cœur double", category: EXTRA_CATEGORIES.stencils, style: "Cœurs", notes: "Deux cœurs emboîtés.", list: "stencils", width: 6, height: 6, parts: () => appliqueParts("motif", heartOutlineShapes()), noColoring: true },
];

function entryOf(spec: Spec): LibraryEntry {
  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    style: spec.style,
    notes: spec.notes,
    list: spec.list,
    width: spec.width,
    height: spec.height,
    build: () => {
      const parts = spec.parts();
      const count = contentOfParts(parts, spec.width, spec.height).pieces.length;
      const colorOf = spec.colors;
      return {
        drawing: drawingOfParts(parts),
        colorings: spec.noColoring || !colorOf ? [] : colorings(parts, spec.width, spec.height, (i) => colorOf(i, count)),
      };
    },
  };
}

const extraEntries = SPECS.map(entryOf);
const memo = new Map<string, ReturnType<LibraryEntry["build"]>>();

function recipeEntry(def: LibraryBlockDef): LibraryEntry {
  return {
    id: def.id,
    name: def.name,
    category: def.category,
    style: def.style,
    notes: def.notes,
    list: "blocks",
    width: def.nx * def.cell,
    height: def.ny * def.cell,
    build: () => {
      const b = builtLibraryBlock(def);
      return { drawing: b.drawing, colorings: b.colorings };
    },
  };
}

/** Toute la bibliothèque intégrée de blocs : pièces EasyDraw, PolyDraw, applique, motifs et pochoirs. */
export const LIBRARY_ENTRIES: LibraryEntry[] = [...LIBRARY_BLOCKS.map(recipeEntry), ...extraEntries];

export function libraryEntryById(id: string): LibraryEntry | undefined {
  return LIBRARY_ENTRIES.find((e) => e.id === id);
}

/** Le dessin et les colorations d'une entrée, construits une fois. */
export function builtEntry(entry: LibraryEntry): ReturnType<LibraryEntry["build"]> {
  let hit = memo.get(entry.id);
  if (!hit) {
    hit = entry.build();
    memo.set(entry.id, hit);
  }
  return hit;
}

/** Un élément de bibliothèque prêt à entrer dans le carnet (identifiants neufs), avec la liste où il va. */
export function instantiateEntry(entry: LibraryEntry): { list: BlockListKey; item: BlockItem } {
  const recipe = LIBRARY_BLOCKS.find((d) => d.id === entry.id);
  if (recipe) return { list: "blocks", item: instantiateLibraryBlock(recipe) };
  const b = builtEntry(entry);
  const card = emptyNotecard(entry.name);
  return {
    list: entry.list,
    item: {
      id: createId(),
      card: { ...card, reference: `${LIBRARY_NAME} — ${entry.category}`, notes: entry.notes, back: { classification: entry.style, categories: [entry.category, entry.style] } },
      width: entry.width,
      height: entry.height,
      drawing: b.drawing,
      colorings: b.colorings.map((c) => ({ id: createId(), fills: { ...c.fills } })),
    },
  };
}

/** L'arbre de la bibliothèque : catégories, puis styles, dans l'ordre. */
export function libraryEntryTree(): { category: string; styles: { style: string; entries: LibraryEntry[] }[] }[] {
  const tree: { category: string; styles: { style: string; entries: LibraryEntry[] }[] }[] = [];
  for (const entry of LIBRARY_ENTRIES) {
    let cat = tree.find((c) => c.category === entry.category);
    if (!cat) {
      cat = { category: entry.category, styles: [] };
      tree.push(cat);
    }
    let style = cat.styles.find((s) => s.style === entry.style);
    if (!style) {
      style = { style: entry.style, entries: [] };
      cat.styles.push(style);
    }
    style.entries.push(entry);
  }
  return tree.sort((a, b) => a.category.localeCompare(b.category));
}
