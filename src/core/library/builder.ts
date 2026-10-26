// Construction des blocs de la bibliothèque intégrée à partir d'« unités » posées sur une grille (carré, demi-carré,
// quart de carré, oie volante, bandes, quart de cercle…). Chaque unité fournit ses coutures et dit, pour un point
// intérieur, quel « rôle » de couleur a la pièce qui le contient. Les blocs sont ensuite des dessins EasyDraw ordinaires.

import { addSegments, cleanSegment, newDraft } from "../draw/draft";
import { sagittaThrough, type Pt, type Segment } from "../draw/geometry";
import { analyzeBlock, interiorPoint } from "../draw/pieces";
import { createId, type Coloring, type JsonValue, type Paint } from "../project/model";

export type Corner = "tl" | "tr" | "br" | "bl";

/** Une unité occupe le rectangle (x, y, w, h) de la grille du bloc. Les rôles indexent `colors` du bloc. */
export type Unit = { x: number; y: number; w: number; h: number } & (
  | { kind: "square"; role: number }
  /** Demi-carré : « \ » va du coin haut-gauche au coin bas-droit, « / » du haut-droit au bas-gauche. Rôles [au-dessus, au-dessous]. */
  | { kind: "hst"; diagonal: "\\" | "/"; roles: [number, number] }
  /** Quart de carré (les deux diagonales). Rôles [haut, droite, bas, gauche]. */
  | { kind: "qst"; roles: [number, number, number, number] }
  /** Oie volante : le grand triangle pointe vers `point`. Rôles [oie, ciel]. */
  | { kind: "geese"; point: "up" | "down" | "left" | "right"; roles: [number, number] }
  /** Bandes parallèles, horizontales (« h ») ou verticales (« v »), de haut en bas ou de gauche à droite. */
  | { kind: "stripes"; direction: "h" | "v"; roles: number[] }
  /** Carré aux coins coupés (Snowball) : `cut` est la fraction du côté. Rôles [centre, coins]. */
  | { kind: "snowball"; cut: number; roles: [number, number] }
  /** Un seul coin coupé en triangle de demi-côté. Rôles [carré, coin]. */
  | { kind: "corner"; corner: Corner; roles: [number, number] }
  /** Carré sur la pointe dans un carré. Rôles [centre, coins]. */
  | { kind: "diamond"; roles: [number, number] }
  /** Economy Block : carré, losange, carré. Rôles [coins, losange, centre]. */
  | { kind: "economy"; roles: [number, number, number] }
  /** Quart de cercle centré sur un coin (Drunkard's Path), de rayon `radius` (fraction du côté). Rôles [quart, reste]. */
  | { kind: "quarter"; corner: Corner; radius: number; roles: [number, number] }
  /** Pelure d'orange : une lentille le long de la diagonale « \ ». Rôles [lentille, fond]. */
  | { kind: "peel"; roles: [number, number] }
);

export interface BlockRecipe {
  /** Nombre de cases de la grille, et taille d'une case en pouces. */
  nx: number;
  ny: number;
  cell: number;
  units: Unit[];
  /** Couleur de chaque rôle (#rrggbb), pour la coloration « couleur ». */
  colors: string[];
}

const line = (a: Pt, b: Pt): Segment => ({ id: createId(), kind: "line", a, b });
const arcThrough = (a: Pt, b: Pt, through: Pt): Segment => ({ id: createId(), kind: "arc", a, b, sagitta: sagittaThrough(a, b, through) });

/** Coordonnées locales (u, v) ∈ [0, 1]² d'une unité → pouces. */
function mapper(unit: Unit, cell: number): (u: number, v: number) => Pt {
  return (u, v) => ({ x: (unit.x + u * unit.w) * cell, y: (unit.y + v * unit.h) * cell });
}

/** Retourne (u, v) pour que le coin demandé devienne le coin haut-gauche. */
function fromCorner(corner: Corner, u: number, v: number): [number, number] {
  if (corner === "tl") return [u, v];
  if (corner === "tr") return [1 - u, v];
  if (corner === "br") return [1 - u, 1 - v];
  return [u, 1 - v];
}

function unitSegments(unit: Unit, cell: number): Segment[] {
  const P = mapper(unit, cell);
  const out: Segment[] = [line(P(0, 0), P(1, 0)), line(P(1, 0), P(1, 1)), line(P(1, 1), P(0, 1)), line(P(0, 1), P(0, 0))];
  const C = (corner: Corner, u: number, v: number) => P(...fromCorner(corner, u, v));
  switch (unit.kind) {
    case "square":
      break;
    case "hst":
      out.push(unit.diagonal === "\\" ? line(P(0, 0), P(1, 1)) : line(P(1, 0), P(0, 1)));
      break;
    case "qst":
      out.push(line(P(0, 0), P(1, 1)), line(P(1, 0), P(0, 1)));
      break;
    case "geese": {
      const [apex, l, r] =
        unit.point === "up"
          ? [P(0.5, 0), P(0, 1), P(1, 1)]
          : unit.point === "down"
            ? [P(0.5, 1), P(0, 0), P(1, 0)]
            : unit.point === "left"
              ? [P(0, 0.5), P(1, 0), P(1, 1)]
              : [P(1, 0.5), P(0, 0), P(0, 1)];
      out.push(line(l, apex), line(apex, r));
      break;
    }
    case "stripes":
      for (let i = 1; i < unit.roles.length; i++) {
        const t = i / unit.roles.length;
        out.push(unit.direction === "h" ? line(P(0, t), P(1, t)) : line(P(t, 0), P(t, 1)));
      }
      break;
    case "snowball":
      for (const corner of ["tl", "tr", "br", "bl"] as Corner[]) out.push(line(C(corner, unit.cut, 0), C(corner, 0, unit.cut)));
      break;
    case "corner":
      out.push(line(C(unit.corner, 0.5, 0), C(unit.corner, 0, 0.5)));
      break;
    case "diamond":
    case "economy":
      out.push(line(P(0.5, 0), P(1, 0.5)), line(P(1, 0.5), P(0.5, 1)), line(P(0.5, 1), P(0, 0.5)), line(P(0, 0.5), P(0.5, 0)));
      if (unit.kind === "economy") {
        out.push(line(P(0.25, 0.25), P(0.75, 0.25)), line(P(0.75, 0.25), P(0.75, 0.75)), line(P(0.75, 0.75), P(0.25, 0.75)), line(P(0.25, 0.75), P(0.25, 0.25)));
      }
      break;
    case "quarter": {
      const r = unit.radius;
      out.push(arcThrough(C(unit.corner, r, 0), C(unit.corner, 0, r), C(unit.corner, r * Math.SQRT1_2, r * Math.SQRT1_2)));
      break;
    }
    case "peel": {
      const k = 1 - Math.SQRT1_2;
      out.push(arcThrough(P(0, 0), P(1, 1), P(1 - k, k)), arcThrough(P(0, 0), P(1, 1), P(k, 1 - k)));
      break;
    }
  }
  return out;
}

/** Rôle de la pièce qui contient le point local (u, v) de l'unité. */
function unitRole(unit: Unit, u: number, v: number): number {
  switch (unit.kind) {
    case "square":
      return unit.role;
    case "hst":
      return unit.diagonal === "\\" ? (v < u ? unit.roles[0] : unit.roles[1]) : u + v < 1 ? unit.roles[0] : unit.roles[1];
    case "qst":
      if (v < u && v < 1 - u) return unit.roles[0];
      if (u > v && u > 1 - v) return unit.roles[1];
      if (v > u && v > 1 - u) return unit.roles[2];
      return unit.roles[3];
    case "geese": {
      const [a, b] =
        unit.point === "up" ? [u, v] : unit.point === "down" ? [u, 1 - v] : unit.point === "left" ? [v, u] : [v, 1 - u];
      return b >= Math.abs(2 * a - 1) ? unit.roles[0] : unit.roles[1];
    }
    case "stripes": {
      const t = unit.direction === "h" ? v : u;
      return unit.roles[Math.min(unit.roles.length - 1, Math.floor(t * unit.roles.length))] as number;
    }
    case "snowball": {
      const c = unit.cut;
      const corner = u + v < c || 1 - u + v < c || u + 1 - v < c || 2 - u - v < c;
      return corner ? unit.roles[1] : unit.roles[0];
    }
    case "corner": {
      const [a, b] = fromCorner(unit.corner, u, v);
      return a + b < 0.5 ? unit.roles[1] : unit.roles[0];
    }
    case "diamond":
      return Math.abs(u - 0.5) + Math.abs(v - 0.5) > 0.5 ? unit.roles[1] : unit.roles[0];
    case "economy":
      if (Math.abs(u - 0.5) + Math.abs(v - 0.5) > 0.5) return unit.roles[0];
      return Math.abs(u - 0.5) < 0.25 && Math.abs(v - 0.5) < 0.25 ? unit.roles[2] : unit.roles[1];
    case "quarter": {
      const [a, b] = fromCorner(unit.corner, u, v);
      return Math.hypot(a, b) < unit.radius ? unit.roles[0] : unit.roles[1];
    }
    case "peel":
      return Math.hypot(u, v - 1) < 1 && Math.hypot(u - 1, v) < 1 ? unit.roles[0] : unit.roles[1];
  }
}

/** Gris de même luminance qu'une couleur (coloration « niveaux de gris » des blocs de bibliothèque). */
export function toGrey(rgb: string): string {
  const n = Number.parseInt(rgb.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const hex = y.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

export interface BuiltBlock {
  width: number;
  height: number;
  drawing: JsonValue;
  /** Coloration 1 en niveaux de gris, coloration 2 en couleur (SPEC §5.11). */
  colorings: Coloring[];
  pieceCount: number;
}

export function buildBlock(recipe: BlockRecipe): BuiltBlock {
  const width = recipe.nx * recipe.cell;
  const height = recipe.ny * recipe.cell;
  const draft = { ...newDraft(), width, height };
  const raw = addSegments(draft, recipe.units.flatMap((unit) => unitSegments(unit, recipe.cell))).draft.segments;
  // Le dessin enregistré est le dessin nettoyé (planaire) ; les pièces sont celles de ce dessin-là.
  const segments = analyzeBlock(width, height, raw).segments.map(cleanSegment);
  const analysis = analyzeBlock(width, height, segments);
  const color: Record<string, Paint> = {};
  const grey: Record<string, Paint> = {};
  for (const piece of analysis.pieces) {
    const p = interiorPoint(piece);
    const gx = p.x / recipe.cell;
    const gy = p.y / recipe.cell;
    const unit = recipe.units.find((un) => gx >= un.x && gx <= un.x + un.w && gy >= un.y && gy <= un.y + un.h);
    const role = unit ? unitRole(unit, (gx - unit.x) / unit.w, (gy - unit.y) / unit.h) : 0;
    const rgb = recipe.colors[role] ?? recipe.colors[0] ?? "#ffffff";
    color[piece.key] = { kind: "solid", rgb };
    grey[piece.key] = { kind: "solid", rgb: toGrey(rgb) };
  }
  return {
    width,
    height,
    drawing: { kind: "easydraw", segments } as unknown as JsonValue,
    colorings: [
      { id: createId(), fills: grey },
      { id: createId(), fills: color },
    ],
    pieceCount: analysis.pieces.length,
  };
}
