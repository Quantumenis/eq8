// Bibliothèque de blocs intégrée, version 1 : des blocs traditionnels du domaine public, dessinés par code
// (Q-8.1). Les catégories et les styles forment l'arbre de la bibliothèque (SPEC §8.1).

import { createId, emptyNotecard, type BlockItem } from "../project/model";
import { buildBlock, type BlockRecipe, type BuiltBlock, type Unit } from "./builder";

export interface LibraryBlockDef extends BlockRecipe {
  /** Identifiant stable dans la bibliothèque. */
  id: string;
  name: string;
  category: string;
  style: string;
  notes: string;
}

export const LIBRARY_NAME = "Bibliothèque Quilt Studio";

export const CATEGORIES = {
  classic: "01 Classiques en pièces",
  stars: "02 Étoiles",
  curves: "03 Courbes",
} as const;

export const STYLES = {
  squares: "Carrés et bandes",
  logCabin: "Log Cabin",
  triangles: "Triangles",
  simpleStars: "Étoiles simples",
  quarterCircles: "Quarts de cercle",
} as const;

// Couleurs des rôles (0 = fond).
const CREAM = "#f6efdc";
const WHITE = "#ffffff";
const RED = "#c62828";
const NAVY = "#14284b";
const BLUE = "#1e66c8";
const SKY = "#81c7f0";
const GREEN = "#2e7d32";
const LIGHT_GREEN = "#9ccc65";
const GOLD = "#f9d71c";
const MUSTARD = "#c9a227";
const ROSE = "#f4a6c0";
const FUCHSIA = "#c2185b";
const BROWN = "#6d4c2f";
const ORANGE = "#ef6c00";
const APRICOT = "#f6b26b";
const VIOLET = "#6a3fa0";
const LILAC = "#c3a6e0";
const TEAL = "#26a69a";

const sq = (x: number, y: number, role: number, w = 1, h = 1): Unit => ({ kind: "square", x, y, w, h, role });
const hst = (x: number, y: number, diagonal: "\\" | "/", roles: [number, number], w = 1, h = 1): Unit => ({ kind: "hst", x, y, w, h, diagonal, roles });
const qst = (x: number, y: number, roles: [number, number, number, number], w = 1, h = 1): Unit => ({ kind: "qst", x, y, w, h, roles });

/** Log Cabin et Courthouse Steps : des bûches autour d'un centre, ajoutées dans l'ordre donné. */
function logs(order: ("top" | "right" | "bottom" | "left")[], rounds: number, roleOf: (side: string) => number, centerRole: number): Unit[] {
  let x0 = rounds;
  let y0 = rounds;
  let x1 = rounds + 1;
  let y1 = rounds + 1;
  const units: Unit[] = [sq(x0, y0, centerRole)];
  for (let r = 0; r < rounds; r++) {
    for (const side of order) {
      if (side === "top") units.push(sq(x0, --y0, roleOf(side), x1 - x0, 1));
      else if (side === "bottom") units.push(sq(x0, y1++, roleOf(side), x1 - x0, 1));
      else if (side === "left") units.push(sq(--x0, y0, roleOf(side), 1, y1 - y0));
      else units.push(sq(x1++, y0, roleOf(side), 1, y1 - y0));
    }
  }
  return units;
}

/** Les quatre cases d'un Four Patch dans une case 2 × 2 de la grille. */
function fourPatch(x: number, y: number, a: number, b: number): Unit[] {
  return [sq(x, y, a), sq(x + 1, y, b), sq(x, y + 1, b), sq(x + 1, y + 1, a)];
}

export const LIBRARY_BLOCKS: LibraryBlockDef[] = [
  // ---- 01 Classiques en pièces : carrés et bandes
  {
    id: "four-patch",
    name: "Four Patch",
    category: CATEGORIES.classic,
    style: STYLES.squares,
    notes: "Quatre carrés, deux clairs et deux foncés en diagonale.",
    nx: 2,
    ny: 2,
    cell: 3,
    units: fourPatch(0, 0, 1, 0),
    colors: [CREAM, RED],
  },
  {
    id: "nine-patch",
    name: "Nine Patch",
    category: CATEGORIES.classic,
    style: STYLES.squares,
    notes: "Neuf carrés en damier.",
    nx: 3,
    ny: 3,
    cell: 2,
    units: Array.from({ length: 9 }, (_, i) => sq(i % 3, Math.floor(i / 3), ((i % 3) + Math.floor(i / 3)) % 2 === 0 ? 1 : 0)),
    colors: [CREAM, NAVY],
  },
  {
    id: "rail-fence",
    name: "Rail Fence",
    category: CATEGORIES.classic,
    style: STYLES.squares,
    notes: "Quatre carrés de trois bandes, tournés d'un quart de tour l'un par rapport à l'autre.",
    nx: 2,
    ny: 2,
    cell: 3,
    units: [
      { kind: "stripes", x: 0, y: 0, w: 1, h: 1, direction: "h", roles: [0, 1, 2] },
      { kind: "stripes", x: 1, y: 0, w: 1, h: 1, direction: "v", roles: [0, 1, 2] },
      { kind: "stripes", x: 0, y: 1, w: 1, h: 1, direction: "v", roles: [0, 1, 2] },
      { kind: "stripes", x: 1, y: 1, w: 1, h: 1, direction: "h", roles: [0, 1, 2] },
    ],
    colors: [SKY, BLUE, NAVY],
  },
  {
    id: "jacobs-ladder",
    name: "Jacob's Ladder",
    category: CATEGORIES.classic,
    style: STYLES.squares,
    notes: "Cinq Four Patch et quatre demi-carrés qui dessinent une échelle en diagonale.",
    nx: 6,
    ny: 6,
    cell: 1,
    units: [
      ...fourPatch(0, 0, 1, 0),
      ...fourPatch(4, 0, 1, 0),
      ...fourPatch(2, 2, 1, 0),
      ...fourPatch(0, 4, 1, 0),
      ...fourPatch(4, 4, 1, 0),
      hst(2, 0, "/", [2, 0], 2, 2),
      hst(4, 2, "\\", [0, 2], 2, 2),
      hst(0, 2, "\\", [0, 2], 2, 2),
      hst(2, 4, "/", [2, 0], 2, 2),
    ],
    colors: [CREAM, BROWN, GREEN],
  },

  // ---- 01 Classiques en pièces : Log Cabin
  {
    id: "log-cabin",
    name: "Log Cabin",
    category: CATEGORIES.classic,
    style: STYLES.logCabin,
    notes: "Trois tours de bûches autour d'un carré central : un côté clair, un côté foncé.",
    nx: 7,
    ny: 7,
    cell: 1,
    units: logs(["top", "right", "bottom", "left"], 3, (side) => (side === "top" || side === "right" ? 0 : 1), 2),
    colors: [APRICOT, BROWN, RED],
  },
  {
    id: "courthouse-steps",
    name: "Courthouse Steps",
    category: CATEGORIES.classic,
    style: STYLES.logCabin,
    notes: "Variante du Log Cabin : les bûches s'ajoutent sur deux côtés opposés à la fois.",
    nx: 7,
    ny: 7,
    cell: 1,
    units: logs(["top", "bottom", "left", "right"], 3, (side) => (side === "top" || side === "bottom" ? 0 : 1), 2),
    colors: [LILAC, VIOLET, GOLD],
  },

  // ---- 01 Classiques en pièces : triangles
  {
    id: "half-square-triangle",
    name: "Half-Square Triangle",
    category: CATEGORIES.classic,
    style: STYLES.triangles,
    notes: "Un carré coupé en deux triangles par la diagonale.",
    nx: 1,
    ny: 1,
    cell: 6,
    units: [hst(0, 0, "\\", [0, 1])],
    colors: [CREAM, TEAL],
  },
  {
    id: "flying-geese",
    name: "Flying Geese",
    category: CATEGORIES.classic,
    style: STYLES.triangles,
    notes: "Une unité « oie volante » : un grand triangle et deux petits, dans un rectangle de deux sur un.",
    nx: 2,
    ny: 1,
    cell: 3,
    units: [{ kind: "geese", x: 0, y: 0, w: 2, h: 1, point: "up", roles: [1, 0] }],
    colors: [SKY, ORANGE],
  },
  {
    id: "pinwheel",
    name: "Pinwheel",
    category: CATEGORIES.classic,
    style: STYLES.triangles,
    notes: "Quatre demi-carrés qui tournent comme un moulinet.",
    nx: 2,
    ny: 2,
    cell: 3,
    units: [hst(0, 0, "\\", [1, 0]), hst(1, 0, "/", [0, 1]), hst(1, 1, "\\", [0, 1]), hst(0, 1, "/", [1, 0])],
    colors: [CREAM, BLUE],
  },
  {
    id: "broken-dishes",
    name: "Broken Dishes",
    category: CATEGORIES.classic,
    style: STYLES.triangles,
    notes: "Quatre demi-carrés, les triangles foncés vers les coins hauts et bas.",
    nx: 2,
    ny: 2,
    cell: 3,
    units: [hst(0, 0, "/", [1, 0]), hst(1, 0, "\\", [1, 0]), hst(0, 1, "\\", [0, 1]), hst(1, 1, "/", [0, 1])],
    colors: [CREAM, GREEN],
  },
  {
    id: "hourglass",
    name: "Hourglass",
    category: CATEGORIES.classic,
    style: STYLES.triangles,
    notes: "Un quart de carré : quatre triangles, en sablier.",
    nx: 1,
    ny: 1,
    cell: 6,
    units: [qst(0, 0, [1, 0, 1, 0])],
    colors: [CREAM, FUCHSIA],
  },
  {
    id: "bow-tie",
    name: "Bow Tie",
    category: CATEGORIES.classic,
    style: STYLES.triangles,
    notes: "Deux carrés foncés et deux carrés clairs à un coin coupé : un nœud papillon.",
    nx: 2,
    ny: 2,
    cell: 3,
    units: [
      sq(0, 0, 1),
      sq(1, 1, 1),
      { kind: "corner", x: 1, y: 0, w: 1, h: 1, corner: "bl", roles: [0, 1] },
      { kind: "corner", x: 0, y: 1, w: 1, h: 1, corner: "tr", roles: [0, 1] },
    ],
    colors: [CREAM, NAVY],
  },
  {
    id: "snowball",
    name: "Snowball",
    category: CATEGORIES.classic,
    style: STYLES.triangles,
    notes: "Un carré aux quatre coins coupés.",
    nx: 1,
    ny: 1,
    cell: 6,
    units: [{ kind: "snowball", x: 0, y: 0, w: 1, h: 1, cut: 1 / 3, roles: [0, 1] }],
    colors: [WHITE, BLUE],
  },
  {
    id: "square-in-a-square",
    name: "Square in a Square",
    category: CATEGORIES.classic,
    style: STYLES.triangles,
    notes: "Un carré sur la pointe dans un carré.",
    nx: 1,
    ny: 1,
    cell: 6,
    units: [{ kind: "diamond", x: 0, y: 0, w: 1, h: 1, roles: [1, 0] }],
    colors: [CREAM, RED],
  },
  {
    id: "economy-block",
    name: "Economy Block",
    category: CATEGORIES.classic,
    style: STYLES.triangles,
    notes: "Carré dans un carré dans un carré.",
    nx: 1,
    ny: 1,
    cell: 6,
    units: [{ kind: "economy", x: 0, y: 0, w: 1, h: 1, roles: [0, 1, 2] }],
    colors: [NAVY, CREAM, RED],
  },
  {
    id: "churn-dash",
    name: "Churn Dash",
    category: CATEGORIES.classic,
    style: STYLES.triangles,
    notes: "Demi-carrés aux coins, bandes doubles sur les côtés, un carré au centre.",
    nx: 3,
    ny: 3,
    cell: 2,
    units: [
      hst(0, 0, "/", [1, 0]),
      hst(2, 0, "\\", [1, 0]),
      hst(0, 2, "\\", [0, 1]),
      hst(2, 2, "/", [0, 1]),
      { kind: "stripes", x: 1, y: 0, w: 1, h: 1, direction: "h", roles: [1, 0] },
      { kind: "stripes", x: 1, y: 2, w: 1, h: 1, direction: "h", roles: [0, 1] },
      { kind: "stripes", x: 0, y: 1, w: 1, h: 1, direction: "v", roles: [1, 0] },
      { kind: "stripes", x: 2, y: 1, w: 1, h: 1, direction: "v", roles: [0, 1] },
      sq(1, 1, 0),
    ],
    colors: [CREAM, RED],
  },
  {
    id: "shoo-fly",
    name: "Shoo Fly",
    category: CATEGORIES.classic,
    style: STYLES.triangles,
    notes: "Un Nine Patch dont les coins sont des demi-carrés tournés vers le centre.",
    nx: 3,
    ny: 3,
    cell: 2,
    units: [
      hst(0, 0, "/", [0, 1]),
      hst(2, 0, "\\", [0, 1]),
      hst(0, 2, "\\", [1, 0]),
      hst(2, 2, "/", [1, 0]),
      sq(1, 0, 0),
      sq(0, 1, 0),
      sq(2, 1, 0),
      sq(1, 2, 0),
      sq(1, 1, 1),
    ],
    colors: [CREAM, GREEN],
  },
  {
    id: "dutchmans-puzzle",
    name: "Dutchman's Puzzle",
    category: CATEGORIES.classic,
    style: STYLES.triangles,
    notes: "Huit oies volantes, deux par quart, qui tournent autour du centre.",
    nx: 4,
    ny: 4,
    cell: 2,
    units: [
      { kind: "geese", x: 0, y: 0, w: 2, h: 1, point: "up", roles: [1, 0] },
      { kind: "geese", x: 0, y: 1, w: 2, h: 1, point: "up", roles: [1, 0] },
      { kind: "geese", x: 2, y: 0, w: 1, h: 2, point: "right", roles: [1, 0] },
      { kind: "geese", x: 3, y: 0, w: 1, h: 2, point: "right", roles: [1, 0] },
      { kind: "geese", x: 2, y: 2, w: 2, h: 1, point: "down", roles: [1, 0] },
      { kind: "geese", x: 2, y: 3, w: 2, h: 1, point: "down", roles: [1, 0] },
      { kind: "geese", x: 0, y: 2, w: 1, h: 2, point: "left", roles: [1, 0] },
      { kind: "geese", x: 1, y: 2, w: 1, h: 2, point: "left", roles: [1, 0] },
    ],
    colors: [CREAM, MUSTARD],
  },

  // ---- 02 Étoiles
  {
    id: "friendship-star",
    name: "Friendship Star",
    category: CATEGORIES.stars,
    style: STYLES.simpleStars,
    notes: "Quatre demi-carrés en moulinet autour d'un carré central.",
    nx: 3,
    ny: 3,
    cell: 2,
    units: [
      sq(0, 0, 0),
      sq(2, 0, 0),
      sq(0, 2, 0),
      sq(2, 2, 0),
      sq(1, 1, 1),
      hst(1, 0, "/", [0, 1]),
      hst(2, 1, "\\", [0, 1]),
      hst(1, 2, "/", [1, 0]),
      hst(0, 1, "\\", [1, 0]),
    ],
    colors: [CREAM, BLUE],
  },
  {
    id: "ohio-star",
    name: "Ohio Star",
    category: CATEGORIES.stars,
    style: STYLES.simpleStars,
    notes: "Un Nine Patch dont les côtés sont des quarts de carré : une étoile à huit pointes.",
    nx: 3,
    ny: 3,
    cell: 2,
    units: [
      sq(0, 0, 0),
      sq(2, 0, 0),
      sq(0, 2, 0),
      sq(2, 2, 0),
      sq(1, 1, 2),
      qst(1, 0, [0, 1, 3, 1]),
      qst(2, 1, [1, 0, 1, 3]),
      qst(1, 2, [3, 1, 0, 1]),
      qst(0, 1, [1, 3, 1, 0]),
    ],
    colors: [CREAM, NAVY, RED, SKY],
  },
  {
    id: "sawtooth-star",
    name: "Sawtooth Star",
    category: CATEGORIES.stars,
    style: STYLES.simpleStars,
    notes: "Un grand carré central et quatre oies volantes dont les petits triangles forment les pointes.",
    nx: 4,
    ny: 4,
    cell: 2,
    units: [
      sq(0, 0, 0),
      sq(3, 0, 0),
      sq(0, 3, 0),
      sq(3, 3, 0),
      sq(1, 1, 2, 2, 2),
      { kind: "geese", x: 1, y: 0, w: 2, h: 1, point: "down", roles: [0, 1] },
      { kind: "geese", x: 3, y: 1, w: 1, h: 2, point: "left", roles: [0, 1] },
      { kind: "geese", x: 1, y: 3, w: 2, h: 1, point: "up", roles: [0, 1] },
      { kind: "geese", x: 0, y: 1, w: 1, h: 2, point: "right", roles: [0, 1] },
    ],
    colors: [CREAM, GOLD, GREEN],
  },
  {
    id: "variable-star",
    name: "Variable Star",
    category: CATEGORIES.stars,
    style: STYLES.simpleStars,
    notes: "Une étoile sur une grille de quatre : un Four Patch au centre, deux demi-carrés par pointe.",
    nx: 4,
    ny: 4,
    cell: 2,
    units: [
      sq(0, 0, 0),
      sq(3, 0, 0),
      sq(0, 3, 0),
      sq(3, 3, 0),
      ...fourPatch(1, 1, 2, 3),
      hst(1, 0, "\\", [0, 1]),
      hst(2, 0, "/", [0, 1]),
      hst(3, 1, "/", [1, 0]),
      hst(3, 2, "\\", [0, 1]),
      hst(1, 3, "/", [1, 0]),
      hst(2, 3, "\\", [1, 0]),
      hst(0, 1, "\\", [1, 0]),
      hst(0, 2, "/", [0, 1]),
    ],
    colors: [CREAM, RED, ROSE, FUCHSIA],
  },

  // ---- 03 Courbes
  {
    id: "drunkards-path",
    name: "Drunkard's Path",
    category: CATEGORIES.curves,
    style: STYLES.quarterCircles,
    notes: "Un quart de cercle dans un carré : l'unité de base du « chemin de l'ivrogne ».",
    nx: 1,
    ny: 1,
    cell: 6,
    units: [{ kind: "quarter", x: 0, y: 0, w: 1, h: 1, corner: "tl", radius: 2 / 3, roles: [1, 0] }],
    colors: [CREAM, BLUE],
  },
  {
    id: "drunkards-path-four",
    name: "Drunkard's Path (quatre unités)",
    category: CATEGORIES.curves,
    style: STYLES.quarterCircles,
    notes: "Quatre unités tournées pour former un cercle.",
    nx: 2,
    ny: 2,
    cell: 3,
    units: [
      { kind: "quarter", x: 0, y: 0, w: 1, h: 1, corner: "br", radius: 2 / 3, roles: [1, 0] },
      { kind: "quarter", x: 1, y: 0, w: 1, h: 1, corner: "bl", radius: 2 / 3, roles: [1, 0] },
      { kind: "quarter", x: 0, y: 1, w: 1, h: 1, corner: "tr", radius: 2 / 3, roles: [1, 0] },
      { kind: "quarter", x: 1, y: 1, w: 1, h: 1, corner: "tl", radius: 2 / 3, roles: [1, 0] },
    ],
    colors: [CREAM, RED],
  },
  {
    id: "orange-peel",
    name: "Orange Peel",
    category: CATEGORIES.curves,
    style: STYLES.quarterCircles,
    notes: "Une lentille entre deux quarts de cercle, le long de la diagonale.",
    nx: 1,
    ny: 1,
    cell: 6,
    units: [{ kind: "peel", x: 0, y: 0, w: 1, h: 1, roles: [1, 0] }],
    colors: [LIGHT_GREEN, ORANGE],
  },
];

const built = new Map<string, BuiltBlock>();

/** Le bloc construit (dessin et colorations) d'une définition ; calculé une fois puis gardé en mémoire. */
export function builtLibraryBlock(def: LibraryBlockDef): BuiltBlock {
  let block = built.get(def.id);
  if (!block) {
    block = buildBlock(def);
    built.set(def.id, block);
  }
  return block;
}

/** Un bloc de bibliothèque prêt à entrer dans le carnet (identifiants neufs). */
export function instantiateLibraryBlock(def: LibraryBlockDef): BlockItem {
  const b = builtLibraryBlock(def);
  const card = emptyNotecard(def.name);
  return {
    id: createId(),
    card: {
      ...card,
      reference: `${LIBRARY_NAME} — ${def.category}`,
      notes: def.notes,
      back: { classification: def.style, categories: [def.category, def.style] },
    },
    width: b.width,
    height: b.height,
    drawing: b.drawing,
    colorings: b.colorings.map((c) => ({ id: createId(), fills: { ...c.fills } })),
  };
}

/** L'arbre de la bibliothèque : catégories, puis styles, dans l'ordre. */
export function libraryTree(): { category: string; styles: { style: string; blocks: LibraryBlockDef[] }[] }[] {
  const tree: { category: string; styles: { style: string; blocks: LibraryBlockDef[] }[] }[] = [];
  for (const def of LIBRARY_BLOCKS) {
    let cat = tree.find((c) => c.category === def.category);
    if (!cat) {
      cat = { category: def.category, styles: [] };
      tree.push(cat);
    }
    let style = cat.styles.find((s) => s.style === def.style);
    if (!style) {
      style = { style: def.style, blocks: [] };
      cat.styles.push(style);
    }
    style.blocks.push(def);
  }
  return tree.sort((a, b) => a.category.localeCompare(b.category));
}
