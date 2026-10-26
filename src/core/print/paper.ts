// Mise en page (SPEC §9.13, Q-9.11) et mosaïque sur plusieurs pages (SPEC §9.1, Q-9.1).

import { at, itemsTouch, linePath, rectPath, type Item, type Page } from "./display";

export const PAPERS = {
  letter: { width: 8.5, height: 11 },
  a4: { width: 210 / 25.4, height: 297 / 25.4 },
  legal: { width: 8.5, height: 14 },
  a3: { width: 297 / 25.4, height: 420 / 25.4 },
  tabloid: { width: 11, height: 17 },
} as const;
export type PaperId = keyof typeof PAPERS;
export const PAPER_IDS = Object.keys(PAPERS) as PaperId[];

export interface Margins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PageSetup {
  paper: PaperId;
  orientation: "portrait" | "landscape";
  /** Marges en pouces. */
  margins: Margins;
}

/** Pays qui utilisent le format Lettre US (les autres utilisent l'A4). */
const LETTER_COUNTRIES = new Set(["US", "CA", "MX", "PH", "CL", "CO", "VE", "GT", "CR", "PA", "DO", "PR", "SV", "NI", "HN", "BO"]);

/** Format par défaut selon le pays des paramètres régionaux (Q-9.11 : A4 en France). */
export function defaultPaper(country: string | null | undefined): PaperId {
  return country && LETTER_COUNTRIES.has(country.toUpperCase()) ? "letter" : "a4";
}

export const MIN_MARGIN = 0.25;
export const MAX_MARGIN = 2;

export function defaultPageSetup(country?: string | null): PageSetup {
  return { paper: defaultPaper(country), orientation: "portrait", margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5 } };
}

/** Lecture prudente d'une mise en page enregistrée. */
export function sanitizePageSetup(raw: unknown, fallback: PageSetup): PageSetup {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<PageSetup>;
  const margin = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, v)) : d);
  const m = (typeof r.margins === "object" && r.margins !== null ? r.margins : {}) as Partial<Margins>;
  return {
    paper: typeof r.paper === "string" && r.paper in PAPERS ? r.paper : fallback.paper,
    orientation: r.orientation === "landscape" || r.orientation === "portrait" ? r.orientation : fallback.orientation,
    margins: {
      left: margin(m.left, fallback.margins.left),
      right: margin(m.right, fallback.margins.right),
      top: margin(m.top, fallback.margins.top),
      bottom: margin(m.bottom, fallback.margins.bottom),
    },
  };
}

export function pageSize(setup: PageSetup): { width: number; height: number } {
  const p = PAPERS[setup.paper];
  return setup.orientation === "portrait" ? { width: p.width, height: p.height } : { width: p.height, height: p.width };
}

/** La zone imprimable (pouces, dans le repère de la page). */
export function printableArea(setup: PageSetup): { x: number; y: number; width: number; height: number } {
  const size = pageSize(setup);
  const m = setup.margins;
  return { x: m.left, y: m.top, width: size.width - m.left - m.right, height: size.height - m.top - m.bottom };
}

// ---------------------------------------------------------------------------------------------------------------
// Mosaïque

/** Recouvrement entre deux pages voisines (Q-9.1). */
export const TILE_OVERLAP = 0.5;

export interface TileGrid {
  cols: number;
  rows: number;
  /** Pas d'une page à l'autre (pouces de contenu). */
  stepX: number;
  stepY: number;
}

/** Nombre de pages nécessaires pour un contenu de `w` × `h` dans une zone utile `pw` × `ph`. */
export function tileGrid(w: number, h: number, pw: number, ph: number, overlap = TILE_OVERLAP): TileGrid {
  const fits = (size: number, page: number) => size <= page + 1e-9;
  const stepX = pw - overlap;
  const stepY = ph - overlap;
  const cols = fits(w, pw) ? 1 : Math.ceil((w - pw) / stepX - 1e-9) + 1;
  const rows = fits(h, ph) ? 1 : Math.ceil((h - ph) / stepY - 1e-9) + 1;
  return { cols, rows, stepX: cols === 1 ? pw : stepX, stepY: rows === 1 ? ph : stepY };
}

export interface TileLabels {
  /** « L1-C2 » : étiquette d'une page de la mosaïque. */
  tile: (row: number, col: number) => string;
  /** Titre de la page de plan d'assemblage. */
  plan: string;
  /** Explication sous le plan. */
  planHint: string;
}

const MARK = "#7a7f87";

/**
 * Répartit un contenu (éléments en pouces, origine en haut à gauche, taille `w` × `h`) sur des pages. Un contenu qui
 * tient dans la zone utile occupe une seule page ; sinon chaque page montre une fenêtre de la zone utile, les pages se
 * recouvrent de 0,5 po, portent des repères d'assemblage et une étiquette « ligne-colonne », et une page de plan
 * d'assemblage s'ajoute. Les pages où rien n'est dessiné ne sont pas émises.
 */
export function tileContent(items: Item[], w: number, h: number, setup: PageSetup, labels: TileLabels, header?: (page: number) => Item[]): Page[] {
  const size = pageSize(setup);
  const area = printableArea(setup);
  const grid = tileGrid(w, h, area.width, area.height);
  if (grid.cols === 1 && grid.rows === 1) {
    return [{ ...size, items: [at(area.x, area.y, items), ...(header?.(0) ?? [])] }];
  }
  const pages: Page[] = [];
  const present: boolean[][] = [];
  for (let r = 0; r < grid.rows; r++) {
    present.push([]);
    for (let c = 0; c < grid.cols; c++) {
      const x0 = c * grid.stepX;
      const y0 = r * grid.stepY;
      const win = { x0, y0, x1: x0 + area.width, y1: y0 + area.height };
      const shows = itemsTouch(items, win);
      (present[r] as boolean[]).push(shows);
      if (!shows) continue;
      const clipped: Item = { kind: "group", mat: [1, 0, 0, 1, area.x - x0, area.y - y0], items, clip: rectPath(x0, y0, area.width, area.height) };
      const marks: Item[] = [];
      const dash = { rgb: MARK, width: 0.5, dash: [3, 2] };
      // Bord du recouvrement : la page suivante commence à ce trait.
      if (c + 1 < grid.cols) {
        const x = area.x + grid.stepX;
        marks.push({ kind: "path", d: linePath({ x, y: area.y }, { x, y: area.y + area.height }), stroke: dash });
      }
      if (r + 1 < grid.rows) {
        const y = area.y + grid.stepY;
        marks.push({ kind: "path", d: linePath({ x: area.x, y }, { x: area.x + area.width, y }), stroke: dash });
      }
      // Repères de coin de la zone utile.
      const tick = 0.18;
      for (const [cx, cy, sx, sy] of [
        [area.x, area.y, -1, -1],
        [area.x + area.width, area.y, 1, -1],
        [area.x, area.y + area.height, -1, 1],
        [area.x + area.width, area.y + area.height, 1, 1],
      ] as const) {
        marks.push({ kind: "path", d: linePath({ x: cx, y: cy }, { x: cx + sx * tick, y: cy }), stroke: { rgb: MARK, width: 0.5 } });
        marks.push({ kind: "path", d: linePath({ x: cx, y: cy }, { x: cx, y: cy + sy * tick }), stroke: { rgb: MARK, width: 0.5 } });
      }
      marks.push({ kind: "text", x: size.width - setup.margins.right, y: Math.max(0.2, area.y - 0.12), text: labels.tile(r + 1, c + 1), role: "number", align: "right", rgb: "#333333" });
      pages.push({ ...size, items: [clipped, ...marks, ...(header?.(pages.length) ?? [])] });
    }
  }
  pages.push(assemblyPlan(grid, present, w, h, setup, labels));
  return pages;
}

function assemblyPlan(grid: TileGrid, present: boolean[][], w: number, h: number, setup: PageSetup, labels: TileLabels): Page {
  const size = pageSize(setup);
  const area = printableArea(setup);
  const top = area.y + 0.5;
  const scale = Math.min(area.width / (grid.cols * grid.stepX + (area.width - grid.stepX)), (area.height - 1.2) / (grid.rows * grid.stepY + (area.height - grid.stepY)));
  const items: Item[] = [{ kind: "text", x: area.x, y: area.y + 0.2, text: labels.plan, role: "header" }];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const x = area.x + c * grid.stepX * scale;
      const y = top + r * grid.stepY * scale;
      const on = present[r]?.[c] ?? false;
      items.push({ kind: "path", d: rectPath(x, y, area.width * scale, area.height * scale), stroke: { rgb: on ? "#333333" : "#b5b9bf", width: 0.75, ...(on ? {} : { dash: [2, 2] }) } });
      if (on) items.push({ kind: "text", x: x + (grid.stepX * scale) / 2, y: y + (grid.stepY * scale) / 2, text: labels.tile(r + 1, c + 1), role: "number", align: "center" });
    }
  }
  items.push({ kind: "path", d: rectPath(area.x, top, w * scale, h * scale), stroke: { rgb: "#2f6fd6", width: 1 } });
  items.push({ kind: "text", x: area.x, y: top + (grid.rows * grid.stepY + area.height - grid.stepY) * scale + 0.35, text: labels.planHint, role: "data" });
  return { ...size, items };
}
