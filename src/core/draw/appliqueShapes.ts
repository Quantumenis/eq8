// Générateurs de formes d'applique (SPEC §6.4) : ellipse, pie, arc et sections, rectangles, Formes (notre jeu),
// StarMaker, PosieMaker, StencilMaker, trait de pinceau, bande, et lissage de la main levée.
// Chaque générateur renvoie des `AppShape` dans le repère du bloc (pouces).

import { createId } from "../project/model";
import { KAPPA, makeShape, polyShape, type AppNode, type AppShape, type NodeType } from "./applique";
import { dist, type Pt } from "./geometry";
import type { Cubic } from "./bezier";

const rad = (deg: number): number => (deg * Math.PI) / 180;

const C = (x: number, y: number): AppNode => ({ x, y, type: "corner" });
const S = (x: number, y: number, hin?: Pt, hout?: Pt, type: NodeType = "smooth"): AppNode => {
  const n: AppNode = { x, y, type };
  if (hin) n.hin = hin;
  if (hout) n.hout = hout;
  return n;
};
const v = (x: number, y: number): Pt => ({ x, y });

// ---------------------------------------------------------------------------------------------------------------
// Ellipses, pies, arcs

/**
 * Nœuds d'un arc d'ellipse. `from` et `to` en degrés, sens trigonométrique à l'écran (0° = à droite, 90° = en haut).
 * Chaque morceau fait au plus 90°.
 */
export function ellipseArcNodes(cx: number, cy: number, rx: number, ry: number, from: number, to: number): AppNode[] {
  const total = rad(to - from);
  const pieces = Math.max(1, Math.ceil(Math.abs(total) / (Math.PI / 2) - 1e-9));
  const step = total / pieces;
  const point = (t: number): Pt => ({ x: cx + rx * Math.cos(-t), y: cy + ry * Math.sin(-t) });
  // Dérivée par rapport à l'angle de paramètre (y vers le bas : θ = −φ).
  const deriv = (t: number): Pt => ({ x: rx * Math.sin(-t), y: -ry * Math.cos(-t) });
  const alpha = (4 / 3) * Math.tan(step / 4);
  const nodes: AppNode[] = [];
  for (let i = 0; i <= pieces; i++) {
    const t = rad(from) + step * i;
    const p = point(t);
    const d = deriv(t);
    const node: AppNode = { x: p.x, y: p.y, type: i === 0 || i === pieces ? "corner" : "smooth" };
    if (i < pieces) node.hout = { x: alpha * d.x, y: alpha * d.y };
    if (i > 0) node.hin = { x: -alpha * d.x, y: -alpha * d.y };
    nodes.push(node);
  }
  return nodes;
}

export function ellipseShape(cx: number, cy: number, rx: number, ry: number): AppShape {
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  return makeShape(
    [
      S(cx + rx, cy, v(0, -ky), v(0, ky)),
      S(cx, cy + ry, v(kx, 0), v(-kx, 0)),
      S(cx - rx, cy, v(0, ky), v(0, -ky)),
      S(cx, cy - ry, v(-kx, 0), v(kx, 0)),
    ],
    true,
  );
}

export type EllipseKind = "ellipse" | "pie" | "arc";
export type SectionMode = "partition" | "stagger";

export interface EllipseParams {
  kind: EllipseKind;
  /** Angles de début et de fin (degrés, sens trigonométrique) pour une part de tarte ou un arc. */
  start: number;
  end: number;
  /** Nombre de sections (1 = pas de découpe). */
  sections: number;
  mode: SectionMode;
}

export const DEFAULT_ELLIPSE: EllipseParams = { kind: "ellipse", start: 0, end: 360, sections: 1, mode: "partition" };

function sweepAngles(p: EllipseParams): [number, number] {
  if (p.kind === "ellipse") return [0, 360];
  let end = p.end;
  while (end <= p.start) end += 360;
  if (end - p.start > 360) end = p.start + 360;
  return [p.start, end];
}

/** Ellipse inscrite dans le rectangle, ou pie, ou arc, éventuellement découpé en sections. */
export function ellipseShapes(x0: number, y0: number, x1: number, y1: number, p: EllipseParams): AppShape[] {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;
  if (rx < 1e-6 || ry < 1e-6) return [];
  const [a0, a1] = sweepAngles(p);
  const n = Math.max(1, Math.min(60, Math.round(p.sections)));
  if (n === 1 && p.kind === "ellipse") return [ellipseShape(cx, cy, rx, ry)];
  const full = a1 - a0 >= 360 - 1e-9;
  // Frontières des sections : égales, ou « décalées » (demi-sections au début et à la fin ; un cercle entier tourne d'une demi-part).
  const step = (a1 - a0) / n;
  let cuts: number[];
  if (p.mode === "stagger") {
    cuts = full ? Array.from({ length: n + 1 }, (_, i) => a0 + (i + 0.5) * step) : [a0, ...Array.from({ length: n }, (_, i) => a0 + (i + 0.5) * step), a1];
  } else cuts = Array.from({ length: n + 1 }, (_, i) => a0 + i * step);
  const shapes: AppShape[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const from = cuts[i] as number;
    const to = cuts[i + 1] as number;
    if (to - from < 1e-6) continue;
    const arc = ellipseArcNodes(cx, cy, rx, ry, from, to);
    if (p.kind === "arc") shapes.push(makeShape(arc, false));
    else if (n === 1 && full) shapes.push(ellipseShape(cx, cy, rx, ry));
    else shapes.push(makeShape([C(cx, cy), ...arc], true));
  }
  return shapes;
}

// ---------------------------------------------------------------------------------------------------------------
// Rectangles

/** Rectangle, avec une rondeur par coin (haut-gauche, haut-droit, bas-droit, bas-gauche), en pouces. */
export function rectShape(x0: number, y0: number, x1: number, y1: number, radii: readonly [number, number, number, number] = [0, 0, 0, 0]): AppShape | null {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  const w = xb - xa;
  const h = yb - ya;
  if (w < 1e-6 || h < 1e-6) return null;
  const limit = Math.min(w, h) / 2;
  const r = radii.map((x) => Math.max(0, Math.min(limit, x)));
  const corners: Pt[] = [
    { x: xa, y: ya },
    { x: xb, y: ya },
    { x: xb, y: yb },
    { x: xa, y: yb },
  ];
  const nodes: AppNode[] = [];
  corners.forEach((c, i) => {
    const rr = r[i] as number;
    if (rr < 1e-9) {
      nodes.push(C(c.x, c.y));
      return;
    }
    const prev = corners[(i + 3) % 4] as Pt;
    const next = corners[(i + 1) % 4] as Pt;
    const toward = (to: Pt): Pt => {
      const len = dist(c, to) || 1;
      return { x: ((to.x - c.x) / len) * rr, y: ((to.y - c.y) / len) * rr };
    };
    const a = toward(prev);
    const b = toward(next);
    const pre = { x: c.x + a.x, y: c.y + a.y };
    const post = { x: c.x + b.x, y: c.y + b.y };
    nodes.push({ ...C(pre.x, pre.y), hout: v((c.x - pre.x) * KAPPA, (c.y - pre.y) * KAPPA) });
    nodes.push({ ...C(post.x, post.y), hin: v((c.x - post.x) * KAPPA, (c.y - post.y) * KAPPA) });
  });
  return makeShape(nodes, true);
}

// ---------------------------------------------------------------------------------------------------------------
// Formes (notre jeu : ovales et polygones)

export const OVAL_FORMS = ["oval", "egg", "leaf", "petal", "drop", "crescent", "heart", "cloud"] as const;
export const POLYGON_FORMS = ["triangle", "rightTriangle", "diamond", "pentagon", "hexagon", "octagon", "trapezoid", "parallelogram", "arrow", "cross"] as const;
export const FORM_IDS = [...OVAL_FORMS, ...POLYGON_FORMS] as const;
export type FormId = (typeof FORM_IDS)[number];

/** Forme dans le carré unité (y vers le bas), sous forme de nœuds. */
function unitForm(id: FormId): { nodes: AppNode[]; closed: boolean } {
  const poly = (pts: [number, number][]) => ({ nodes: pts.map(([x, y]) => C(x, y)), closed: true });
  const regular = (n: number, rot = -90) =>
    poly(Array.from({ length: n }, (_, i): [number, number] => [0.5 + 0.5 * Math.cos(rad(rot + (360 * i) / n)), 0.5 + 0.5 * Math.sin(rad(rot + (360 * i) / n))]));
  switch (id) {
    case "oval": {
      const e = ellipseShape(0.5, 0.5, 0.5, 0.5);
      return { nodes: e.nodes, closed: true };
    }
    case "egg":
      return {
        closed: true,
        nodes: [S(0.5, 0, v(-0.2, 0), v(0.2, 0)), S(0.96, 0.62, v(0, -0.3), v(0, 0.3)), S(0.5, 1, v(0.27, 0), v(-0.27, 0)), S(0.04, 0.62, v(0, 0.3), v(0, -0.3))],
      };
    case "leaf":
      return {
        closed: true,
        nodes: [
          { ...C(0, 1), hout: v(0, -0.65), hin: v(0.35, 0) },
          { ...C(1, 0), hin: v(-0.35, 0), hout: v(0, 0.65) },
        ],
      };
    case "petal":
      return {
        closed: true,
        nodes: [
          { ...C(0.5, 1), hout: v(-0.6667, -0.1), hin: v(0.6667, -0.1) },
          { ...C(0.5, 0), hin: v(-0.6667, 0.1), hout: v(0.6667, 0.1) },
        ],
      };
    case "drop":
      return {
        closed: true,
        nodes: [
          { ...C(0.5, 0), hin: v(-0.18, 0.32), hout: v(0.18, 0.32) },
          S(1, 0.68, v(0, -0.25), v(0, 0.28)),
          S(0.5, 1, v(0.28, 0), v(-0.28, 0)),
          S(0, 0.68, v(0, 0.28), v(0, -0.25)),
        ],
      };
    case "crescent":
      return {
        closed: true,
        nodes: [
          { ...C(0.55, 0), hout: v(-0.75, 0), hin: v(-0.267, 0.15) },
          { ...C(0.55, 1), hin: v(-0.75, 0), hout: v(-0.267, -0.15) },
        ],
      };
    case "heart":
      return {
        closed: true,
        nodes: [
          { ...C(0.5, 1), hout: v(-0.12, -0.12), hin: v(0.12, -0.12) },
          S(0.02, 0.38, v(0, 0.24), v(0, -0.2)),
          S(0.27, 0.02, v(-0.14, 0), v(0.14, 0)),
          { ...C(0.5, 0.22), hin: v(0, -0.14), hout: v(0, -0.14) },
          S(0.73, 0.02, v(-0.14, 0), v(0.14, 0)),
          S(0.98, 0.38, v(0, -0.2), v(0, 0.24)),
        ],
      };
    case "cloud":
      return {
        closed: true,
        nodes: [
          S(0.2, 0.55, v(-0.16, 0), v(0.0, -0.22)),
          S(0.4, 0.2, v(-0.18, 0.02), v(0.16, -0.1)),
          S(0.72, 0.22, v(-0.14, -0.1), v(0.16, 0.06)),
          S(0.9, 0.58, v(0.0, -0.2), v(0.0, 0.18)),
          S(0.78, 0.88, v(0.1, 0.0), v(-0.1, 0.0)),
          S(0.24, 0.88, v(0.1, 0.0), v(-0.1, 0.0)),
        ],
      };
    case "triangle":
      return poly([
        [0.5, 0],
        [1, 1],
        [0, 1],
      ]);
    case "rightTriangle":
      return poly([
        [0, 0],
        [1, 1],
        [0, 1],
      ]);
    case "diamond":
      return poly([
        [0.5, 0],
        [1, 0.5],
        [0.5, 1],
        [0, 0.5],
      ]);
    case "pentagon":
      return regular(5);
    case "hexagon":
      return regular(6, 0);
    case "octagon":
      return regular(8, -67.5);
    case "trapezoid":
      return poly([
        [0.2, 0],
        [0.8, 0],
        [1, 1],
        [0, 1],
      ]);
    case "parallelogram":
      return poly([
        [0.25, 0],
        [1, 0],
        [0.75, 1],
        [0, 1],
      ]);
    case "arrow":
      return poly([
        [0, 0.35],
        [0.55, 0.35],
        [0.55, 0],
        [1, 0.5],
        [0.55, 1],
        [0.55, 0.65],
        [0, 0.65],
      ]);
    case "cross":
      return poly([
        [0.33, 0],
        [0.67, 0],
        [0.67, 0.33],
        [1, 0.33],
        [1, 0.67],
        [0.67, 0.67],
        [0.67, 1],
        [0.33, 1],
        [0.33, 0.67],
        [0, 0.67],
        [0, 0.33],
        [0.33, 0.33],
      ]);
  }
}

/** Une forme prédéfinie étirée dans le rectangle (x0, y0)-(x1, y1) ; `keepRatio` (Ctrl) garde les proportions. */
export function formShape(id: FormId, x0: number, y0: number, x1: number, y1: number, keepRatio = false): AppShape | null {
  let w = Math.abs(x1 - x0);
  let h = Math.abs(y1 - y0);
  if (w < 1e-6 || h < 1e-6) return null;
  if (keepRatio) {
    const side = Math.min(w, h);
    w = side;
    h = side;
  }
  const ox = x1 >= x0 ? x0 : x0 - w;
  const oy = y1 >= y0 ? y0 : y0 - h;
  const { nodes, closed } = unitForm(id);
  return makeShape(
    nodes.map((n) => {
      const out: AppNode = { x: ox + n.x * w, y: oy + n.y * h, type: n.type };
      if (n.hin) out.hin = v(n.hin.x * w, n.hin.y * h);
      if (n.hout) out.hout = v(n.hout.x * w, n.hout.y * h);
      return out;
    }),
    closed,
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Créateurs de pièces

export interface StarParams {
  /** Nombre de branches (3 à 24). */
  branches: number;
  /** Rayon du centre, en % du rayon extérieur (10 à 95). */
  center: number;
  /** Taille de l'étoile, en % de la demi-hauteur du bloc. */
  size: number;
  /** Rotation en degrés. */
  rotation: number;
}

export const DEFAULT_STAR: StarParams = { branches: 5, center: 40, size: 90, rotation: 0 };

/** StarMaker : une étoile posée au centre du bloc. */
export function starShape(width: number, height: number, p: StarParams): AppShape {
  const n = Math.max(3, Math.min(24, Math.round(p.branches)));
  const outer = (Math.min(width, height) / 2) * Math.max(0.05, Math.min(1, p.size / 100));
  const inner = outer * Math.max(0.05, Math.min(0.95, p.center / 100));
  const pts: Pt[] = [];
  for (let i = 0; i < 2 * n; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rad(-90 + p.rotation + (180 * i) / n);
    pts.push({ x: width / 2 + r * Math.cos(a), y: height / 2 + r * Math.sin(a) });
  }
  return polyShape(pts, true);
}

export interface PosiePreset {
  id: string;
  petals: number;
  /** Longueur d'un pétale en % de la taille de la fleur, largeur en % de la longueur, centre en % de la taille. */
  length: number;
  width: number;
  center: number;
}

export const POSIE_PRESETS: readonly PosiePreset[] = [
  { id: "daisy", petals: 12, length: 38, width: 26, center: 14 },
  { id: "tulip", petals: 5, length: 42, width: 62, center: 8 },
  { id: "cherry", petals: 5, length: 40, width: 80, center: 10 },
  { id: "rosette", petals: 8, length: 40, width: 55, center: 16 },
  { id: "cosmos", petals: 16, length: 36, width: 22, center: 12 },
];

export interface PosieParams {
  petals: number;
  length: number;
  width: number;
  center: number;
  /** Taille de la fleur en % du plus petit côté du bloc (la fleur est posée en haut à gauche). */
  size: number;
}

export function posieParams(preset: PosiePreset, size = 50): PosieParams {
  return { petals: preset.petals, length: preset.length, width: preset.width, center: preset.center, size };
}

/** Un pétale (amande) de longueur `len` et de largeur `wid`, base en (0, 0), pointe vers le haut (−y). */
function petalNodes(len: number, wid: number): AppNode[] {
  const bulge = (wid / 2) / 0.75;
  return [
    { ...C(0, 0), hout: v(-bulge, -len * 0.1), hin: v(bulge, -len * 0.1) },
    { ...C(0, -len), hin: v(-bulge, len * 0.1), hout: v(bulge, len * 0.1) },
  ];
}

function rotateNodes(nodes: readonly AppNode[], deg: number, about: Pt, shift: Pt): AppNode[] {
  const t = rad(deg);
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const rot = (p: Pt): Pt => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
  return nodes.map((n) => {
    const p = rot({ x: n.x, y: n.y });
    const out: AppNode = { x: p.x + about.x + shift.x, y: p.y + about.y + shift.y, type: n.type };
    if (n.hin) out.hin = rot(n.hin);
    if (n.hout) out.hout = rot(n.hout);
    return out;
  });
}

/** PosieMaker : une fleur (pétales et cœur), posée en haut à gauche du bloc. */
export function posieShapes(width: number, height: number, p: PosieParams): AppShape[] {
  const n = Math.max(3, Math.min(32, Math.round(p.petals)));
  const side = (Math.min(width, height) * Math.max(10, Math.min(100, p.size))) / 100;
  const cx = side / 2;
  const cy = side / 2;
  const len = (side * p.length) / 100;
  const wid = (len * p.width) / 100;
  const hub = (side * p.center) / 100;
  const out: AppShape[] = [];
  for (let i = 0; i < n; i++) {
    const base = petalNodes(len, wid);
    out.push(makeShape(rotateNodes(base, (360 * i) / n, { x: cx, y: cy }, { x: 0, y: 0 }), true));
  }
  out.push(ellipseShape(cx, cy, hub, hub));
  return out;
}

export interface StencilParams {
  petals: number;
  /** Boucle au bout des pétales. */
  loop: boolean;
  /** Taille en % de la demi-hauteur du bloc. */
  size: number;
}

export const DEFAULT_STENCIL: StencilParams = { petals: 8, loop: false, size: 90 };

/** StencilMaker : un pochoir de matelassage (rosace de pétales), centré dans le bloc. */
export function stencilShapes(width: number, height: number, p: StencilParams): AppShape[] {
  const n = Math.max(3, Math.min(24, Math.round(p.petals)));
  const reach = (Math.min(width, height) / 2) * Math.max(0.1, Math.min(1, p.size / 100));
  const len = reach * (p.loop ? 0.85 : 1);
  const wid = Math.min(len * 0.55, (2 * Math.PI * len * 0.5) / n);
  const out: AppShape[] = [];
  for (let i = 0; i < n; i++) {
    out.push(makeShape(rotateNodes(petalNodes(len, wid), (360 * i) / n, { x: width / 2, y: height / 2 }, { x: 0, y: 0 }), true));
    if (p.loop) {
      const a = rad(-90 + (360 * i) / n);
      const r = reach * 0.075;
      const tip = { x: width / 2 + (len + r) * Math.cos(a), y: height / 2 + (len + r) * Math.sin(a) };
      out.push(ellipseShape(tip.x, tip.y, r, r));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Lissage d'un tracé de points : nœuds lisses (Catmull-Rom)

export function smoothNodes(points: readonly Pt[], closed: boolean, corners: ReadonlySet<number> = new Set()): AppNode[] {
  const n = points.length;
  return points.map((p, i) => {
    if (corners.has(i)) return C(p.x, p.y);
    const prev = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)] as Pt;
    const next = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)] as Pt;
    const tx = (next.x - prev.x) / 6;
    const ty = (next.y - prev.y) / 6;
    const node: AppNode = { x: p.x, y: p.y, type: "smooth" };
    if (closed || i > 0) node.hin = v(-tx, -ty);
    if (closed || i < n - 1) node.hout = v(tx, ty);
    return node;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Trait de pinceau et bande

export const BRUSH_CONTOURS = ["uniform", "spindle", "taperStart", "taperEnd", "wavy"] as const;
export type BrushContour = (typeof BRUSH_CONTOURS)[number];
export const BRUSH_CAPS = ["flat", "round", "point"] as const;
export type BrushCap = (typeof BRUSH_CAPS)[number];

export interface BrushParams {
  contour: BrushContour;
  caps: BrushCap;
  /** Largeur minimale (pouces), à l'endroit le plus fin. */
  minWidth: number;
  /** Graisse (≥ 1) : demi-largeur maximale = graisse × 1/20 po. */
  boldness: number;
}

export const DEFAULT_BRUSH: BrushParams = { contour: "spindle", caps: "round", minWidth: 0.04, boldness: 2 };

const profile = (contour: BrushContour, s: number): number => {
  switch (contour) {
    case "uniform":
      return 1;
    case "spindle":
      return Math.sin(Math.PI * s);
    case "taperStart":
      return s;
    case "taperEnd":
      return 1 - s;
    case "wavy":
      return 0.55 + 0.45 * Math.sin(2 * Math.PI * 3 * s);
  }
};

/** Demi-largeur du trait à l'abscisse réduite s. */
export function brushHalfWidth(p: BrushParams, s: number): number {
  const maxHalf = Math.max(1, p.boldness) / 20;
  const minHalf = Math.max(0.002, p.minWidth / 2);
  return Math.max(minHalf, minHalf + (maxHalf - minHalf) * Math.max(0, profile(p.contour, s)));
}

/** Rééchantillonne une polyligne tous les `step` pouces (au moins `min` points). */
export function resample(points: readonly Pt[], step: number, min = 8): Pt[] {
  if (points.length < 2) return [...points];
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push((lengths[i - 1] as number) + dist(points[i - 1] as Pt, points[i] as Pt));
  const total = lengths[lengths.length - 1] as number;
  if (total < 1e-9) return [points[0] as Pt];
  const n = Math.max(min, Math.ceil(total / step));
  const out: Pt[] = [];
  let seg = 1;
  for (let i = 0; i <= n; i++) {
    const target = (total * i) / n;
    while (seg < lengths.length - 1 && (lengths[seg] as number) < target) seg++;
    const a = points[seg - 1] as Pt;
    const b = points[seg] as Pt;
    const l0 = lengths[seg - 1] as number;
    const l1 = lengths[seg] as number;
    const t = l1 - l0 < 1e-12 ? 0 : (target - l0) / (l1 - l0);
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function normalsOf(pts: readonly Pt[]): Pt[] {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)] as Pt;
    const b = pts[Math.min(pts.length - 1, i + 1)] as Pt;
    const len = dist(a, b) || 1;
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  });
}

/** Trait de pinceau : un corps épais autour d'une épine (polyligne). */
export function brushStroke(spine: readonly Pt[], p: BrushParams): AppShape | null {
  const pts = resample(spine, 0.08, 10);
  if (pts.length < 2) return null;
  const normals = normalsOf(pts);
  const last = pts.length - 1;
  const left: Pt[] = [];
  const right: Pt[] = [];
  pts.forEach((q, i) => {
    const hw = brushHalfWidth(p, i / last);
    const nrm = normals[i] as Pt;
    left.push({ x: q.x + nrm.x * hw, y: q.y + nrm.y * hw });
    right.push({ x: q.x - nrm.x * hw, y: q.y - nrm.y * hw });
  });
  /** Les points du bout autour de `centre`, de `from` vers l'autre côté en passant du côté de `dir` (unitaire). */
  const cap = (centre: Pt, dir: Pt, hw: number, from: Pt): Pt[] => {
    if (p.caps === "flat") return [];
    if (p.caps === "point") return [{ x: centre.x + dir.x * hw * 1.6, y: centre.y + dir.y * hw * 1.6 }];
    const a0 = Math.atan2(from.y - centre.y, from.x - centre.x);
    const sign = (from.x - centre.x) * dir.y - (from.y - centre.y) * dir.x > 0 ? 1 : -1;
    const out: Pt[] = [];
    for (let k = 1; k < 6; k++) {
      const a = a0 + sign * Math.PI * (k / 6);
      out.push({ x: centre.x + hw * Math.cos(a), y: centre.y + hw * Math.sin(a) });
    }
    return out;
  };
  const unit = (a: Pt, b: Pt): Pt => {
    const l = dist(a, b) || 1;
    return { x: (a.x - b.x) / l, y: (a.y - b.y) / l };
  };
  const endCap = cap(pts[last] as Pt, unit(pts[last] as Pt, pts[last - 1] as Pt), brushHalfWidth(p, 1), left[last] as Pt);
  const startCap = cap(pts[0] as Pt, unit(pts[0] as Pt, pts[1] as Pt), brushHalfWidth(p, 0), right[0] as Pt);
  const loop: Pt[] = [...left, ...endCap, ...[...right].reverse(), ...startCap];
  // Les angles vifs restent des coins : les raccords d'un bout plat, la pointe d'un bout pointu.
  const corners = new Set<number>();
  if (p.caps === "flat") [0, last, last + 1, 2 * last + 1].forEach((i) => corners.add(i));
  if (p.caps === "point") {
    corners.add(last + 1);
    corners.add(loop.length - 1);
  }
  return makeShape(smoothNodes(loop, true, corners), true);
}

export const SWATH_STYLES = ["geese", "diamonds"] as const;
export type SwathStyle = (typeof SWATH_STYLES)[number];

export interface SwathParams extends Omit<BrushParams, "caps"> {
  style: SwathStyle;
}

export const DEFAULT_SWATH: SwathParams = { style: "geese", contour: "uniform", minWidth: 0.2, boldness: 3 };

/** Bande : une suite d'oies volantes ou de losanges le long d'une épine ; le nombre d'éléments s'adapte à la longueur. */
export function swathShapes(spine: readonly Pt[], p: SwathParams): AppShape[] {
  const pts = resample(spine, 0.05, 6);
  if (pts.length < 2) return [];
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) lengths.push((lengths[i - 1] as number) + dist(pts[i - 1] as Pt, pts[i] as Pt));
  const total = lengths[lengths.length - 1] as number;
  const maxHalf = Math.max(1, p.boldness) / 20;
  const n = Math.max(1, Math.round(total / (maxHalf * 2)));
  const normals = normalsOf(pts);
  const at = (s: number): { p: Pt; nrm: Pt } => {
    const target = s * total;
    let i = 1;
    while (i < lengths.length - 1 && (lengths[i] as number) < target) i++;
    const l0 = lengths[i - 1] as number;
    const l1 = lengths[i] as number;
    const t = l1 - l0 < 1e-12 ? 0 : (target - l0) / (l1 - l0);
    const a = pts[i - 1] as Pt;
    const b = pts[i] as Pt;
    const na = normals[i - 1] as Pt;
    const nb = normals[i] as Pt;
    return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, nrm: { x: na.x + (nb.x - na.x) * t, y: na.y + (nb.y - na.y) * t } };
  };
  const out: AppShape[] = [];
  const bp: BrushParams = { ...p, caps: "flat" };
  for (let j = 0; j < n; j++) {
    const s0 = j / n;
    const s1 = (j + 1) / n;
    const sm = (s0 + s1) / 2;
    const a = at(s0);
    const b = at(s1);
    const m = at(sm);
    const hw = brushHalfWidth(bp, sm);
    const left = { x: m.p.x + m.nrm.x * hw, y: m.p.y + m.nrm.y * hw };
    const right = { x: m.p.x - m.nrm.x * hw, y: m.p.y - m.nrm.y * hw };
    if (p.style === "geese") {
      const hwa = brushHalfWidth(bp, s0);
      out.push(polyShape([{ x: a.p.x + a.nrm.x * hwa, y: a.p.y + a.nrm.y * hwa }, b.p, { x: a.p.x - a.nrm.x * hwa, y: a.p.y - a.nrm.y * hwa }], true));
    } else out.push(polyShape([a.p, left, b.p, right], true));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Main levée : ajustement de courbes de Bézier (Schneider)

type P = Pt;
const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k });
const dot = (a: P, b: P): number => a.x * b.x + a.y * b.y;
const norm = (a: P): P => {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-12 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};

function bez(c: Cubic, t: number): P {
  const u = 1 - t;
  return add(add(mul(c.p0, u * u * u), mul(c.p1, 3 * u * u * t)), add(mul(c.p2, 3 * u * t * t), mul(c.p3, t * t * t)));
}
function bezD1(c: Cubic, t: number): P {
  const u = 1 - t;
  return add(add(mul(sub(c.p1, c.p0), 3 * u * u), mul(sub(c.p2, c.p1), 6 * u * t)), mul(sub(c.p3, c.p2), 3 * t * t));
}
function bezD2(c: Cubic, t: number): P {
  const u = 1 - t;
  return add(mul(add(sub(c.p2, mul(c.p1, 2)), c.p0), 6 * u), mul(add(sub(c.p3, mul(c.p2, 2)), c.p1), 6 * t));
}

function chordParam(pts: readonly P[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push((u[i - 1] as number) + dist(pts[i - 1] as P, pts[i] as P));
  const total = u[u.length - 1] as number;
  return u.map((x) => (total === 0 ? 0 : x / total));
}

function generateBezier(pts: readonly P[], u: readonly number[], t1: P, t2: P): Cubic {
  const first = pts[0] as P;
  const last = pts[pts.length - 1] as P;
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i] as number;
    const b0 = (1 - t) ** 3;
    const b1 = 3 * t * (1 - t) ** 2;
    const b2 = 3 * t * t * (1 - t);
    const b3 = t ** 3;
    const a1 = mul(t1, b1);
    const a2 = mul(t2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const tmp = sub(pts[i] as P, add(mul(first, b0 + b1), mul(last, b2 + b3)));
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  const segLen = dist(first, last);
  const eps = 1e-6 * segLen;
  let alpha1 = Math.abs(det) > 1e-12 ? (x0 * c11 - x1 * c01) / det : 0;
  let alpha2 = Math.abs(det) > 1e-12 ? (c00 * x1 - c01 * x0) / det : 0;
  if (alpha1 < eps || alpha2 < eps) {
    alpha1 = segLen / 3;
    alpha2 = segLen / 3;
  }
  return { p0: first, p1: add(first, mul(t1, alpha1)), p2: add(last, mul(t2, alpha2)), p3: last };
}

function reparameterize(c: Cubic, pts: readonly P[], u: readonly number[]): number[] {
  return u.map((t, i) => {
    const d = sub(bez(c, t), pts[i] as P);
    const d1 = bezD1(c, t);
    const d2 = bezD2(c, t);
    const num = dot(d, d1);
    const den = dot(d1, d1) + dot(d, d2);
    return Math.abs(den) < 1e-12 ? t : Math.max(0, Math.min(1, t - num / den));
  });
}

function maxError(c: Cubic, pts: readonly P[], u: readonly number[]): { error: number; split: number } {
  let worst = 0;
  let split = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = dist(bez(c, u[i] as number), pts[i] as P);
    if (d >= worst) {
      worst = d;
      split = i;
    }
  }
  return { error: worst, split };
}

function fitCubic(pts: readonly P[], t1: P, t2: P, error: number, out: Cubic[]): void {
  if (pts.length === 2) {
    const d = dist(pts[0] as P, pts[1] as P) / 3;
    out.push({ p0: pts[0] as P, p1: add(pts[0] as P, mul(t1, d)), p2: add(pts[1] as P, mul(t2, d)), p3: pts[1] as P });
    return;
  }
  let u = chordParam(pts);
  let c = generateBezier(pts, u, t1, t2);
  let m = maxError(c, pts, u);
  if (m.error < error) {
    out.push(c);
    return;
  }
  if (m.error < error * error * 16 + error) {
    for (let k = 0; k < 4; k++) {
      u = reparameterize(c, pts, u);
      c = generateBezier(pts, u, t1, t2);
      m = maxError(c, pts, u);
      if (m.error < error) {
        out.push(c);
        return;
      }
    }
  }
  const splitAt = Math.max(1, Math.min(pts.length - 2, m.split));
  const centre = norm(sub(pts[splitAt - 1] as P, pts[splitAt + 1] as P));
  fitCubic(pts.slice(0, splitAt + 1), t1, centre, error, out);
  fitCubic(pts.slice(splitAt), mul(centre, -1), t2, error, out);
}

/** Ajuste une suite de courbes de Bézier à des points (erreur maximale en pouces). */
export function fitCurve(points: readonly Pt[], error: number): Cubic[] {
  const pts: Pt[] = [];
  for (const p of points) if (pts.length === 0 || dist(pts[pts.length - 1] as Pt, p) > 1e-6) pts.push(p);
  if (pts.length < 2) return [];
  const t1 = norm(sub(pts[Math.min(3, pts.length - 1)] as Pt, pts[0] as Pt));
  const t2 = norm(sub(pts[Math.max(0, pts.length - 4)] as Pt, pts[pts.length - 1] as Pt));
  const out: Cubic[] = [];
  fitCubic(pts, t1, t2, error, out);
  return out;
}

/** « Better Fit » (0) ↔ « Looser Fit » (1) : l'erreur tolérée passe de 0,004 à 0,08 po. */
export function freehandError(looseness: number): number {
  return 0.004 + (0.08 - 0.004) * Math.max(0, Math.min(1, looseness));
}

/** Main levée : un tracé lissé en plusieurs courbes ; fermé si la fin revient au début (à `closeTol` près). */
export function freehandShape(points: readonly Pt[], looseness: number, closeTol = 0.1): AppShape | null {
  const raw = resample(points, 0.02, 4);
  if (raw.length < 3) return null;
  const closed = dist(raw[0] as Pt, raw[raw.length - 1] as Pt) <= closeTol && raw.length > 8;
  const pts = closed ? [...raw.slice(0, -1), raw[0] as Pt] : raw;
  const cubics = fitCurve(pts, freehandError(looseness));
  if (cubics.length === 0) return null;
  const nodes: AppNode[] = [];
  cubics.forEach((c, i) => {
    const node: AppNode = { x: c.p0.x, y: c.p0.y, type: i === 0 ? "corner" : "smooth", hout: v(c.p1.x - c.p0.x, c.p1.y - c.p0.y) };
    const prev = cubics[i - 1];
    if (prev) node.hin = v(prev.p2.x - c.p0.x, prev.p2.y - c.p0.y);
    nodes.push(node);
  });
  const last = cubics[cubics.length - 1] as Cubic;
  const end: AppNode = { x: last.p3.x, y: last.p3.y, type: "corner", hin: v(last.p2.x - last.p3.x, last.p2.y - last.p3.y) };
  nodes.push(end);
  const shape = makeShape(nodes, false);
  if (!closed) return shape;
  // Fermeture : le dernier nœud se confond avec le premier.
  const first = nodes[0] as AppNode;
  const merged: AppNode = { ...first, type: "smooth", hin: end.hin as Pt };
  return makeShape([merged, ...nodes.slice(1, -1)], true);
}

export const newShapeId = createId;
