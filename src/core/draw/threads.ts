// Fils des coutures (SPEC §5.8) : chaque section du contour des pièces (une arête du dessin planarisé, contour du
// bloc compris) peut recevoir un fil (couleur, style, épaisseur). Pinceau fil = une section ; bombe fil = tout le bloc.

import { sha256Hex } from "../hash";
import type { ThreadStroke } from "../project/model";
import { clean, project, type Pt, type Segment } from "./geometry";
import { segmentText, type Piece } from "./pieces";

export interface Section {
  /** Clé stable de la section, tirée de sa géométrie (comme la clé d'une pièce). */
  key: string;
  seg: Segment;
}

/** Fil d'une couture qui n'en a pas reçu : la couture foncée du bloc coloré, continue et moyenne. */
export const DEFAULT_THREAD: ThreadStroke = { rgb: "#24262b", style: "solid", weight: 2 };

/** Ce que le clic d'un outil Fil change (au moins une case cochée). */
export interface ThreadProperties {
  color: boolean;
  style: boolean;
  weight: boolean;
}

function reversed(seg: Segment): Segment {
  return seg.kind === "line" ? { ...seg, a: seg.b, b: seg.a } : { ...seg, a: seg.b, b: seg.a, sagitta: -seg.sagitta };
}

/** La section écrite dans un sens canonique (extrémité la plus petite d'abord) : son sens ne change pas sa clé. */
function oriented(seg: Segment): Segment {
  const ax = clean(seg.a.x);
  const ay = clean(seg.a.y);
  const bx = clean(seg.b.x);
  const by = clean(seg.b.y);
  return ax < bx || (ax === bx && ay <= by) ? seg : reversed(seg);
}

export function sectionKey(seg: Segment): string {
  return `s${sha256Hex(new TextEncoder().encode(segmentText(oriented(seg)))).slice(0, 16)}`;
}

const sectionCache = new WeakMap<readonly Piece[], Section[]>();

/** Les sections des contours de toutes les pièces, chacune une seule fois (une couture sépare deux pièces). */
export function sectionsOf(pieces: readonly Piece[]): Section[] {
  const hit = sectionCache.get(pieces);
  if (hit) return hit;
  const byKey = new Map<string, Section>();
  for (const piece of pieces) {
    for (const seg of piece.boundary) {
      const key = sectionKey(seg);
      if (!byKey.has(key)) byKey.set(key, { key, seg: oriented(seg) });
    }
  }
  const out = [...byKey.values()];
  sectionCache.set(pieces, out);
  return out;
}

/** La section la plus proche du point, à moins de `tolerance` pouces ; `null` sinon. */
export function sectionAt(sections: readonly Section[], p: Pt, tolerance: number): Section | null {
  let best: Section | null = null;
  let bestD = tolerance;
  for (const s of sections) {
    const d = project(s.seg, p).distance;
    if (d <= bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** Le fil d'une section après un clic : seules les propriétés cochées viennent du fil choisi. */
export function mergeThread(current: ThreadStroke | undefined, chosen: ThreadStroke, props: ThreadProperties): ThreadStroke {
  const base = current ?? DEFAULT_THREAD;
  return {
    rgb: props.color ? chosen.rgb : base.rgb,
    style: props.style ? chosen.style : base.style,
    weight: props.weight ? chosen.weight : base.weight,
  };
}

const sameThread = (a: ThreadStroke | undefined, b: ThreadStroke): boolean =>
  a !== undefined && a.rgb === b.rgb && a.style === b.style && a.weight === b.weight;

/** Pose un fil sur des sections ; renvoie l'objet reçu si rien ne change. */
export function applyThread(
  threads: Readonly<Record<string, ThreadStroke>>,
  keys: readonly string[],
  chosen: ThreadStroke,
  props: ThreadProperties,
): Readonly<Record<string, ThreadStroke>> {
  if (!props.color && !props.style && !props.weight) return threads;
  let next: Record<string, ThreadStroke> | null = null;
  for (const key of keys) {
    const merged = mergeThread(threads[key], chosen, props);
    if (sameThread(threads[key], merged)) continue;
    next ??= { ...threads };
    next[key] = merged;
  }
  return next ?? threads;
}

/** Ne garde que les fils des sections existantes. */
export function pruneThreads(threads: Readonly<Record<string, ThreadStroke>>, sections: readonly Section[]): Record<string, ThreadStroke> {
  const keys = new Set(sections.map((s) => s.key));
  return Object.fromEntries(Object.entries(threads).filter(([k]) => keys.has(k)));
}

/** Épaisseur d'affichage d'un fil (pixels écran, ou unités d'une vignette multipliées par `unit`). */
export function threadWidth(weight: number, unit = 1): number {
  return (0.5 + weight * 0.6) * unit;
}

/** Motif de tirets d'un style de fil, proportionnel à l'épaisseur du trait. */
export function threadDash(style: ThreadStroke["style"], width: number): number[] {
  const w = Math.max(width, 0.5);
  if (style === "dash") return [w * 4, w * 2.5];
  if (style === "dot") return [w * 0.01, w * 2];
  if (style === "dashdot") return [w * 4, w * 2, w * 0.01, w * 2];
  return [];
}
