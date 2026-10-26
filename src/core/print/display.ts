// Liste d'affichage de l'impression (SPEC §9, PLAN « une seule liste d'affichage, trois sorties »).
// Une page est une feuille en pouces (origine en haut à gauche, y vers le bas) qui porte des tracés, des textes et des
// groupes transformés. Le même document alimente le PDF (pdf.ts), le SVG (svg.ts) et l'aperçu Canvas de l'interface :
// l'écran, l'export et l'impression dessinent donc exactement la même géométrie, à l'échelle 1:1 pour les patrons.

import { arcGeometry, type Pt, type Segment } from "../draw/geometry";
import { applyMat, IDENTITY, multiply, type Mat } from "../quilt/geom";

export type { Mat, Pt };

/** Commandes d'un tracé. L'arc « A » part du point courant et tourne de `sweep` radians autour de (cx, cy). */
export type PathCmd =
  | { op: "M"; x: number; y: number }
  | { op: "L"; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "A"; cx: number; cy: number; r: number; start: number; sweep: number; x: number; y: number }
  | { op: "Z" };

/** Trait : couleur, épaisseur et tirets en points (1/72 po), indépendants de l'échelle des groupes. */
export interface Stroke {
  rgb: string;
  width: number;
  dash?: number[];
  join?: "round" | "miter";
}

/**
 * Remplissage : une couleur, ou un tissu répété. Pour un tissu, `mat` envoie le repère de la tuile (en pouces de
 * tissu, la tuile occupant [0, largeur] × [0, hauteur]) dans le repère local ; `rgb` est sa couleur moyenne.
 */
export type Fill = { kind: "rgb"; rgb: string } | { kind: "fabric"; fabricId: string; rgb: string; mat: Mat };

/** Les cinq rôles de police (SPEC §9.12). */
export const FONT_ROLES = ["symbol", "number", "header", "footer", "data"] as const;
export type FontRole = (typeof FONT_ROLES)[number];

export type Item =
  | { kind: "path"; d: PathCmd[]; fill?: Fill; stroke?: Stroke; tag?: string }
  /** Texte : (x, y) est la ligne de base ; `size` (points) remplace la taille du rôle. */
  | { kind: "text"; x: number; y: number; text: string; role: FontRole; size?: number; align?: "left" | "center" | "right"; rgb?: string; bold?: boolean }
  /** Groupe : `mat` doit être une similitude (rotation, symétrie, échelle uniforme, translation). */
  | { kind: "group"; mat: Mat; items: Item[]; clip?: PathCmd[]; tag?: string };

export interface Page {
  width: number;
  height: number;
  items: Item[];
}

export interface PrintDoc {
  title: string;
  pages: Page[];
}

/** Police et taille (points) d'un rôle. */
export interface FontSpec {
  family: string;
  size: number;
}
export type PrintFonts = Record<FontRole, FontSpec>;

/** Polices par défaut (SPEC §9.12, Q-9.10) : Arial, présente sous Windows. */
export const DEFAULT_FONTS: PrintFonts = {
  symbol: { family: "Arial", size: 8 },
  number: { family: "Arial", size: 8 },
  header: { family: "Arial", size: 12 },
  footer: { family: "Arial", size: 7 },
  data: { family: "Arial", size: 8 },
};

/** Familles proposées (des polices livrées avec Windows ; Arial a les métriques d'Helvetica). */
export const FONT_FAMILIES = ["Arial", "Segoe UI", "Calibri", "Verdana", "Tahoma", "Georgia", "Times New Roman", "Courier New"] as const;

// ---------------------------------------------------------------------------------------------------------------
// Construction des tracés

/** Tracé d'un polygone fermé. */
export function polyPath(poly: readonly Pt[], close = true): PathCmd[] {
  const d: PathCmd[] = poly.map((p, i) => (i === 0 ? { op: "M", x: p.x, y: p.y } : { op: "L", x: p.x, y: p.y }));
  if (close && d.length > 0) d.push({ op: "Z" });
  return d;
}

export function rectPath(x: number, y: number, w: number, h: number): PathCmd[] {
  return polyPath([
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]);
}

export function linePath(a: Pt, b: Pt): PathCmd[] {
  return [
    { op: "M", x: a.x, y: a.y },
    { op: "L", x: b.x, y: b.y },
  ];
}

/** Vrai si la matrice est une similitude (les cercles restent des cercles). */
export function isSimilarity(m: Mat, eps = 1e-9): boolean {
  const rot = Math.abs(m[0] - m[3]) < eps && Math.abs(m[1] + m[2]) < eps;
  const refl = Math.abs(m[0] + m[3]) < eps && Math.abs(m[1] - m[2]) < eps;
  return rot || refl;
}

export const matScale = (m: Mat): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
export const matDet = (m: Mat): number => m[0] * m[3] - m[1] * m[2];

/** Nombre de cordes pour approcher un arc à `tol` près. */
function arcSteps(radius: number, sweep: number, tol: number): number {
  const half = Math.acos(Math.max(-1, Math.min(1, 1 - tol / Math.max(radius, tol))));
  return Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(2 * half, 1e-3)));
}

/**
 * Transforme un contour (droites et arcs) par une matrice affine. Sous une similitude les arcs restent des arcs
 * (flèche mise à l'échelle, signe inversé par une symétrie) ; sinon ils deviennent des polylignes (tolérance `tol`).
 */
export function transformSegments(segs: readonly Segment[], m: Mat, tol = 1e-4): Segment[] {
  const similar = isSimilarity(m);
  const s = matScale(m);
  const flip = matDet(m) < 0 ? -1 : 1;
  const out: Segment[] = [];
  for (const seg of segs) {
    if (seg.kind === "line") {
      out.push({ id: seg.id, kind: "line", a: applyMat(m, seg.a), b: applyMat(m, seg.b) });
    } else if (similar) {
      out.push({ id: seg.id, kind: "arc", a: applyMat(m, seg.a), b: applyMat(m, seg.b), sagitta: seg.sagitta * s * flip });
    } else {
      const pts = flattenSegment(seg, tol);
      for (let i = 0; i + 1 < pts.length; i++) {
        out.push({ id: `${seg.id}.${i}`, kind: "line", a: applyMat(m, pts[i] as Pt), b: applyMat(m, pts[i + 1] as Pt) });
      }
    }
  }
  return out;
}

/** Points d'un segment, extrémités comprises (un arc est approché à `tol` près). */
export function flattenSegment(seg: Segment, tol = 1e-4): Pt[] {
  if (seg.kind === "line") return [seg.a, seg.b];
  const g = arcGeometry(seg.a, seg.b, seg.sagitta);
  const n = arcSteps(g.radius, g.sweep, tol);
  const pts: Pt[] = [seg.a];
  for (let i = 1; i < n; i++) {
    const ang = g.startAngle + (g.sweep * i) / n;
    pts.push({ x: g.center.x + g.radius * Math.cos(ang), y: g.center.y + g.radius * Math.sin(ang) });
  }
  pts.push(seg.b);
  return pts;
}

/** Polygone (sans répétition du premier point) d'un contour fermé. */
export function flattenBoundary(segs: readonly Segment[], tol = 1e-4): Pt[] {
  const pts: Pt[] = [];
  for (const seg of segs) pts.push(...flattenSegment(seg, tol).slice(0, -1));
  return pts;
}

/** Tracé exact d'un contour fermé (arcs compris). */
export function boundaryPath(segs: readonly Segment[], close = true): PathCmd[] {
  const first = segs[0];
  if (!first) return [];
  const d: PathCmd[] = [{ op: "M", x: first.a.x, y: first.a.y }];
  for (const seg of segs) {
    if (seg.kind === "line") d.push({ op: "L", x: seg.b.x, y: seg.b.y });
    else {
      const g = arcGeometry(seg.a, seg.b, seg.sagitta);
      d.push({ op: "A", cx: g.center.x, cy: g.center.y, r: g.radius, start: g.startAngle, sweep: g.sweep, x: seg.b.x, y: seg.b.y });
    }
  }
  if (close) d.push({ op: "Z" });
  return d;
}

/** Tracé d'une pièce : son contour, puis ses trous (de sens inverse, pour que le remplissage les laisse vides). */
export function holedPath(boundary: readonly Segment[], holes?: readonly (readonly Segment[])[]): PathCmd[] {
  return [...boundaryPath(boundary), ...(holes ?? []).flatMap((h) => boundaryPath(h))];
}

/** Tracé d'un segment isolé (droite ou arc). */
export function segmentPath(seg: Segment): PathCmd[] {
  return boundaryPath([seg], false);
}

/** Découpe un arc en Béziers cubiques d'au plus 90° (erreur relative < 3·10⁻⁴ du rayon). */
export function arcToBeziers(cmd: Extract<PathCmd, { op: "A" }>): Extract<PathCmd, { op: "C" }>[] {
  const n = Math.max(1, Math.ceil(Math.abs(cmd.sweep) / (Math.PI / 2) - 1e-9));
  const step = cmd.sweep / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const out: Extract<PathCmd, { op: "C" }>[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = cmd.start + step * i;
    const a1 = a0 + step;
    const p0 = { x: cmd.cx + cmd.r * Math.cos(a0), y: cmd.cy + cmd.r * Math.sin(a0) };
    const p3 = i === n - 1 ? { x: cmd.x, y: cmd.y } : { x: cmd.cx + cmd.r * Math.cos(a1), y: cmd.cy + cmd.r * Math.sin(a1) };
    out.push({
      op: "C",
      x1: p0.x - k * cmd.r * Math.sin(a0),
      y1: p0.y + k * cmd.r * Math.cos(a0),
      x2: p3.x + k * cmd.r * Math.sin(a1),
      y2: p3.y - k * cmd.r * Math.cos(a1),
      x: p3.x,
      y: p3.y,
    });
  }
  return out;
}

/** Applique une matrice (similitude) à un tracé. */
export function transformPath(d: readonly PathCmd[], m: Mat): PathCmd[] {
  const s = matScale(m);
  const flip = matDet(m) < 0;
  const rot = Math.atan2(m[1], m[0]);
  return d.map((c): PathCmd => {
    switch (c.op) {
      case "M":
      case "L": {
        const p = applyMat(m, c);
        return { op: c.op, x: p.x, y: p.y };
      }
      case "C": {
        const p1 = applyMat(m, { x: c.x1, y: c.y1 });
        const p2 = applyMat(m, { x: c.x2, y: c.y2 });
        const p = applyMat(m, c);
        return { op: "C", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
      }
      case "A": {
        const center = applyMat(m, { x: c.cx, y: c.cy });
        const p = applyMat(m, c);
        const start = flip ? rot - c.start : rot + c.start;
        return { op: "A", cx: center.x, cy: center.y, r: c.r * s, start, sweep: flip ? -c.sweep : c.sweep, x: p.x, y: p.y };
      }
      case "Z":
        return c;
    }
  });
}

/** Polylignes (une par sous-tracé) d'un tracé, dans le repère `m`. */
export function flattenPath(d: readonly PathCmd[], m: Mat = IDENTITY, tol = 1e-3): { pts: Pt[]; closed: boolean }[] {
  const out: { pts: Pt[]; closed: boolean }[] = [];
  let cur: { pts: Pt[]; closed: boolean } | null = null;
  let last: Pt = { x: 0, y: 0 };
  let start: Pt = last;
  for (const c of d) {
    if (c.op === "M") {
      cur = { pts: [applyMat(m, c)], closed: false };
      out.push(cur);
      last = c;
      start = c;
      continue;
    }
    if (!cur) {
      cur = { pts: [applyMat(m, last)], closed: false };
      out.push(cur);
    }
    if (c.op === "L") {
      cur.pts.push(applyMat(m, c));
      last = c;
    } else if (c.op === "C") {
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        const x = u * u * u * last.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x;
        const y = u * u * u * last.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y;
        cur.pts.push(applyMat(m, { x, y }));
      }
      last = c;
    } else if (c.op === "A") {
      const n = arcSteps(c.r, c.sweep, tol);
      for (let i = 1; i <= n; i++) {
        const ang = c.start + (c.sweep * i) / n;
        cur.pts.push(applyMat(m, i === n ? { x: c.x, y: c.y } : { x: c.cx + c.r * Math.cos(ang), y: c.cy + c.r * Math.sin(ang) }));
      }
      last = c;
    } else {
      cur.closed = true;
      last = start;
      cur = null;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Boîtes et contenu d'une fenêtre (mosaïque)

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const emptyBox = (): Box => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
const growBox = (b: Box, p: Pt): void => {
  b.x0 = Math.min(b.x0, p.x);
  b.y0 = Math.min(b.y0, p.y);
  b.x1 = Math.max(b.x1, p.x);
  b.y1 = Math.max(b.y1, p.y);
};

/** Hauteur de capitale et largeur moyenne approchées (fraction de la taille) pour borner un texte. */
const CAP = 0.72;

/** Boîte englobante d'une liste d'éléments dans le repère `m` (textes approchés). */
export function itemsBounds(items: readonly Item[], m: Mat = IDENTITY, measure?: (text: string, size: number) => number): Box | null {
  const b = emptyBox();
  const visit = (list: readonly Item[], mat: Mat) => {
    for (const it of list) {
      if (it.kind === "group") visit(it.items, multiply(mat, it.mat));
      else if (it.kind === "path") for (const poly of flattenPath(it.d, mat)) for (const p of poly.pts) growBox(b, p);
      else {
        const size = (it.size ?? 8) / 72;
        const w = measure ? measure(it.text, it.size ?? 8) / 72 : it.text.length * size * 0.55;
        const x0 = it.align === "center" ? it.x - w / 2 : it.align === "right" ? it.x - w : it.x;
        growBox(b, applyMat(mat, { x: x0, y: it.y - size * CAP }));
        growBox(b, applyMat(mat, { x: x0 + w, y: it.y + size * 0.2 }));
      }
    }
  };
  visit(items, m);
  return Number.isFinite(b.x0) ? b : null;
}

function segmentHitsBox(a: Pt, b: Pt, r: Box): boolean {
  // Liang-Barsky.
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const tests: [number, number][] = [
    [-dx, a.x - r.x0],
    [dx, r.x1 - a.x],
    [-dy, a.y - r.y0],
    [dy, r.y1 - a.y],
  ];
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

function pointInPoly(poly: readonly Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Pt;
    const b = poly[j] as Pt;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Vrai si un élément dessine quelque chose dans la fenêtre `r` (trait qui la traverse, surface qui la couvre, texte). */
export function itemsTouch(items: readonly Item[], r: Box, m: Mat = IDENTITY): boolean {
  for (const it of items) {
    if (it.kind === "group") {
      if (itemsTouch(it.items, r, multiply(m, it.mat))) return true;
    } else if (it.kind === "text") {
      const b = itemsBounds([it], m);
      if (b && b.x1 > r.x0 && b.x0 < r.x1 && b.y1 > r.y0 && b.y0 < r.y1) return true;
    } else {
      for (const poly of flattenPath(it.d, m)) {
        const pts = poly.pts;
        for (let i = 0; i + 1 < pts.length; i++) if (segmentHitsBox(pts[i] as Pt, pts[i + 1] as Pt, r)) return true;
        if (poly.closed && pts.length > 2) {
          if (segmentHitsBox(pts[pts.length - 1] as Pt, pts[0] as Pt, r)) return true;
          if (it.fill && pointInPoly(pts, { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 })) return true;
        }
      }
    }
  }
  return false;
}

/** Groupe translaté. */
export const at = (x: number, y: number, items: Item[], tag?: string): Item => ({ kind: "group", mat: [1, 0, 0, 1, x, y], items, ...(tag ? { tag } : {}) });

/** Groupe transformé. */
export const transformed = (mat: Mat, items: Item[], tag?: string): Item => ({ kind: "group", mat, items, ...(tag ? { tag } : {}) });
