// Lettres des pièces (SPEC §9.3, Q-9.4) : deux pièces partagent une lettre quand elles ont la même forme à une
// rotation près ; la forme miroir d'une pièce prend une autre lettre, marquée « inversée ». Les comptes sont ensuite
// détaillés par tissu ou couleur.

import { arcGeometry, type Pt, type Segment } from "../draw/geometry";
import type { Paint } from "../project/model";
import { transformSegments } from "./display";
import { orient, type PrintPiece } from "./source";

const LEN_STEP = 1e-4;
const ANGLE_STEP = 1e-4;
const q = (v: number, step: number) => {
  const r = Math.round(v / step);
  return Object.is(r, -0) ? 0 : r;
};

function startTangent(s: Segment): number {
  if (s.kind === "line") return Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
  const g = arcGeometry(s.a, s.b, s.sagitta);
  return Math.atan2(s.a.y - g.center.y, s.a.x - g.center.x) + (g.sweep > 0 ? Math.PI / 2 : -Math.PI / 2);
}

function endTangent(s: Segment): number {
  if (s.kind === "line") return Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
  const g = arcGeometry(s.a, s.b, s.sagitta);
  return Math.atan2(s.b.y - g.center.y, s.b.x - g.center.x) + (g.sweep > 0 ? Math.PI / 2 : -Math.PI / 2);
}

const wrap = (a: number) => {
  let v = a;
  while (v <= -Math.PI) v += 2 * Math.PI;
  while (v > Math.PI) v -= 2 * Math.PI;
  return v;
};

/** Fusionne les droites consécutives alignées (un contour coupé par des nœuds reste la même forme). */
export function mergeCollinear(segs: readonly Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.kind === "line" && s.kind === "line" && Math.abs(wrap(endTangent(last) - startTangent(s))) < 1e-7) {
      out[out.length - 1] = { ...last, b: s.b };
    } else out.push(s);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 2 && first && last && first.kind === "line" && last.kind === "line" && Math.abs(wrap(endTangent(last) - startTangent(first))) < 1e-7) {
    out[0] = { ...first, a: last.a };
    out.pop();
  }
  return out;
}

/** Écriture d'un contour (sens positif) invariante par translation et rotation : longueurs, flèches et angles. */
function tokens(segs: readonly Segment[]): string[] {
  const m = mergeCollinear(segs);
  return m.map((s, i) => {
    const next = m[(i + 1) % m.length] as Segment;
    const turn = q(wrap(startTangent(next) - endTangent(s)), ANGLE_STEP);
    const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    return s.kind === "line" ? `L${q(len, LEN_STEP)}:${turn}` : `A${q(len, LEN_STEP)},${q(s.sagitta, LEN_STEP)}:${turn}`;
  });
}

function canonical(t: readonly string[]): string {
  let best: string | null = null;
  for (let i = 0; i < t.length; i++) {
    const s = [...t.slice(i), ...t.slice(0, i)].join(";");
    if (best === null || s < best) best = s;
  }
  return best ?? "";
}

/** Signature d'une forme et celle de son image miroir. */
export function shapeSignature(boundary: readonly Segment[]): { direct: string; mirror: string } {
  const direct = canonical(tokens(orient([...boundary])));
  const mirrored = orient(transformSegments(boundary, [-1, 0, 0, 1, 0, 0]));
  return { direct, mirror: canonical(tokens(mirrored)) };
}

/** Nom de la n-ième lettre : A … Z, puis AA, AB… */
export function letterName(n: number): string {
  let s = "";
  let k = n;
  do {
    s = String.fromCharCode(65 + (k % 26)) + s;
    k = Math.floor(k / 26) - 1;
  } while (k >= 0);
  return s;
}

/** Identité d'un habillage pour les comptes (tissu, ou couleur unie). */
export function paintId(p: Paint | undefined): string {
  if (!p) return "none";
  return p.kind === "fabric" ? `f:${p.fabricId}` : `c:${p.rgb.toLowerCase()}`;
}

export interface PieceClass {
  letter: string;
  /** Lettre de la forme dont celle-ci est le miroir. */
  mirrorOf?: string;
  /** La première pièce de la classe (son orientation sert au gabarit). */
  first: PrintPiece;
  pieces: PrintPiece[];
  /** Comptes par habillage, dans l'ordre d'apparition. */
  counts: { paint: Paint | undefined; id: string; count: number }[];
}

/** Classe les pièces par forme ; les lettres suivent l'ordre de lecture des coins haut-gauche (haut en bas, puis gauche à droite). */
export function classifyPieces(pieces: readonly PrintPiece[]): PieceClass[] {
  const corner = (p: PrintPiece) => p.polygon.reduce((c, q) => ({ x: Math.min(c.x, q.x), y: Math.min(c.y, q.y) }), { x: Infinity, y: Infinity });
  const ordered = [...pieces]
    .map((p) => ({ p, c: corner(p) }))
    .sort((a, b) => {
      const dy = Math.round((a.c.y - b.c.y) * 1e4);
      return dy !== 0 ? dy : a.c.x - b.c.x;
    })
    .map((x) => x.p);
  const classes: (PieceClass & { sig: { direct: string; mirror: string } })[] = [];
  for (const p of ordered) {
    const sig = shapeSignature(p.boundary);
    let cls = classes.find((c) => c.sig.direct === sig.direct);
    if (!cls) {
      const mirrorOf = classes.find((c) => c.sig.direct === sig.mirror && sig.mirror !== sig.direct);
      cls = { letter: letterName(classes.length), first: p, pieces: [], counts: [], sig, ...(mirrorOf ? { mirrorOf: mirrorOf.letter } : {}) };
      classes.push(cls);
    }
    cls.pieces.push(p);
    const id = paintId(p.paint);
    const c = cls.counts.find((x) => x.id === id);
    if (c) c.count += 1;
    else cls.counts.push({ paint: p.paint, id, count: 1 });
  }
  return classes.map(({ sig: _sig, ...c }) => c);
}

/** La lettre de chaque pièce (clé → lettre). */
export function lettersByKey(classes: readonly PieceClass[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of classes) for (const p of c.pieces) m.set(p.key, c.letter);
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// Formes de la découpe rotative (Q-9.6)

export type RotaryShape = "square" | "rectangle" | "hst" | "qst" | "parallelogram45" | "diamond45" | "diamond60" | "equilateral" | "trapezoid45";

export interface Recognized {
  shape: RotaryShape;
  /** Angle (radians) à donner à la pièce pour la mettre dans son orientation de coupe (côté de référence horizontal). */
  align: number;
}

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const deg = (r: number) => (r * 180) / Math.PI;

/** Angle intérieur au sommet i d'un polygone convexe en sens positif. */
function interiorAngles(v: readonly Pt[]): number[] {
  return v.map((p, i) => {
    const a = v[(i + v.length - 1) % v.length] as Pt;
    const b = v[(i + 1) % v.length] as Pt;
    const u = Math.atan2(a.y - p.y, a.x - p.x);
    const w = Math.atan2(b.y - p.y, b.x - p.x);
    let d = Math.abs(u - w);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return deg(d);
  });
}

/** Le côté i est-il parallèle au droit-fil (ou perpendiculaire) ? */
function onGrain(a: Pt, b: Pt, grain: number): boolean {
  const ang = Math.atan2(b.y - a.y, b.x - a.x) - grain;
  const k = ang / (Math.PI / 2);
  return Math.abs(k - Math.round(k)) < 1e-6;
}

/**
 * Reconnaît une pièce découpable au cutter : carré, rectangle, triangle demi-carré (côtés droits sur le droit-fil),
 * triangle quart de carré (hypoténuse sur le droit-fil), parallélogramme à 45°, losanges à 45° et 60°, triangle
 * équilatéral, trapèze isocèle à 45°. Les autres (courbes comprises) sont renvoyées aux gabarits.
 */
export function recognize(piece: PrintPiece): Recognized | null {
  if (piece.boundary.some((s) => s.kind === "arc")) return null;
  const segs = mergeCollinear(piece.boundary);
  const v = segs.map((s) => s.a);
  const n = v.length;
  const lens = v.map((p, i) => Math.hypot((v[(i + 1) % n] as Pt).x - p.x, (v[(i + 1) % n] as Pt).y - p.y));
  const ang = interiorAngles(v);
  const dir = (i: number) => Math.atan2((v[(i + 1) % n] as Pt).y - (v[i] as Pt).y, (v[(i + 1) % n] as Pt).x - (v[i] as Pt).x);
  const tolA = 1e-4;
  const isAng = (a: number, target: number) => near(a, target, tolA);
  if (n === 3) {
    const right = ang.findIndex((a) => isAng(a, 90));
    if (right >= 0) {
      const l1 = lens[(right + n - 1) % n] as number;
      const l2 = lens[right] as number;
      if (near(l1, l2, 1e-6 * Math.max(l1, 1))) {
        // Côté opposé à l'angle droit = hypoténuse.
        const hyp = (right + 1) % n;
        const legOnGrain = onGrain(v[right] as Pt, v[(right + 1) % n] as Pt, piece.grain);
        if (onGrain(v[hyp] as Pt, v[(hyp + 1) % n] as Pt, piece.grain) && !legOnGrain) return { shape: "qst", align: -dir(hyp) };
        return { shape: "hst", align: -dir(right) };
      }
    }
    if (ang.every((a) => isAng(a, 60))) return { shape: "equilateral", align: -dir(0) };
    return null;
  }
  if (n === 4) {
    if (ang.every((a) => isAng(a, 90))) {
      const sq = near(lens[0] as number, lens[1] as number, 1e-6 * Math.max(lens[0] as number, 1));
      // Côté de référence : le plus proche du droit-fil.
      const i = onGrain(v[0] as Pt, v[1] as Pt, piece.grain) || !onGrain(v[1] as Pt, v[2] as Pt, piece.grain) ? 0 : 1;
      return { shape: sq ? "square" : "rectangle", align: -dir(i) };
    }
    const parallelogram = isAng(ang[0] as number, ang[2] as number) && isAng(ang[1] as number, ang[3] as number);
    if (parallelogram) {
      const acute = Math.min(ang[0] as number, ang[1] as number);
      const rhombus = near(lens[0] as number, lens[1] as number, 1e-6 * Math.max(lens[0] as number, 1));
      // Référence : un des côtés qui partent de l'angle aigu, le plus long pour le parallélogramme.
      const i = (lens[0] as number) >= (lens[1] as number) ? 0 : 1;
      if (rhombus && isAng(acute, 45)) return { shape: "diamond45", align: -dir(i) };
      if (rhombus && isAng(acute, 60)) return { shape: "diamond60", align: -dir(i) };
      if (!rhombus && isAng(acute, 45)) return { shape: "parallelogram45", align: -dir(i) };
      return null;
    }
    // Trapèze isocèle à 45° : deux côtés parallèles, angles de base 45° et 135°.
    for (let i = 0; i < 4; i++) {
      const j = (i + 2) % 4;
      const d1 = dir(i);
      const d2 = dir(j);
      if (Math.abs(Math.sin(d1 - d2)) > 1e-7) continue;
      const base = (lens[i] as number) > (lens[j] as number) ? i : j;
      const a0 = ang[base] as number;
      const a1 = ang[(base + 1) % 4] as number;
      if (isAng(a0, 45) && isAng(a1, 45)) return { shape: "trapezoid45", align: -dir(base) };
    }
  }
  return null;
}
