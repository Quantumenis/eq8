// Broderies (SPEC §4.6, Q-4.2) : notre propre format, des tracés de points vectoriels (en pouces), et une petite
// bibliothèque dessinée par code. Une broderie se pose au calque 3 à sa taille enregistrée et se colore avec un fil.

import { createId, emptyNotecard, type EmbroideryItem, type JsonValue } from "../project/model";

export interface StitchPath {
  /** Les points de piqûre, dans l'ordre (pouces, y vers le bas). */
  points: [number, number][];
  /** Un tracé fermé revient à son point de départ. */
  closed?: boolean;
}

export interface Embroidery {
  kind: "stitches";
  width: number;
  height: number;
  paths: StitchPath[];
  /** Couleur de fil par défaut (#rrggbb). */
  thread: string;
}

export type EmbroideryRender = "draft" | "3d";

const MAX_PATHS = 2000;
const MAX_POINTS = 100_000;

/** Relit une broderie enregistrée (défensif) ; `null` si le contenu n'en est pas une. */
export function parseEmbroidery(content: JsonValue): Embroidery | null {
  const c = content as { kind?: unknown; width?: unknown; height?: unknown; paths?: unknown; thread?: unknown } | null;
  if (!c || typeof c !== "object" || c.kind !== "stitches" || !Array.isArray(c.paths)) return null;
  const width = typeof c.width === "number" && c.width > 0 && c.width < 200 ? c.width : 0;
  const height = typeof c.height === "number" && c.height > 0 && c.height < 200 ? c.height : 0;
  if (!width || !height) return null;
  const paths: StitchPath[] = [];
  let total = 0;
  for (const p of c.paths.slice(0, MAX_PATHS)) {
    const raw = (p as { points?: unknown; closed?: unknown } | null)?.points;
    if (!Array.isArray(raw)) continue;
    const points: [number, number][] = [];
    for (const q of raw) {
      if (Array.isArray(q) && typeof q[0] === "number" && typeof q[1] === "number" && Number.isFinite(q[0]) && Number.isFinite(q[1])) points.push([q[0], q[1]]);
      if (++total > MAX_POINTS) break;
    }
    if (points.length >= 2) paths.push({ points, ...((p as { closed?: unknown }).closed === true ? { closed: true } : {}) });
  }
  return { kind: "stitches", width, height, paths, thread: typeof c.thread === "string" && /^#[0-9a-f]{6}$/i.test(c.thread) ? c.thread : "#24262b" };
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

function make(width: number, height: number, thread: string, paths: StitchPath[]): Embroidery {
  return { kind: "stitches", width, height, thread, paths: paths.map((p) => ({ ...p, points: p.points.map(([x, y]) => [round(x), round(y)] as [number, number]) })) };
}

const circle = (cx: number, cy: number, r: number, n = 48): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]);

function heartPoints(cx: number, cy: number, s: number): [number, number][] {
  return Array.from({ length: 65 }, (_, i) => {
    const t = (2 * Math.PI * i) / 64;
    return [cx + (s * 16 * Math.sin(t) ** 3) / 17, cy - (s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))) / 17];
  });
}

export interface EmbroideryDef {
  id: string;
  name: string;
  category: string;
  notes: string;
  build: () => Embroidery;
}

export const EMBROIDERY_CATEGORY = "Broderies maison";

export const EMBROIDERY_LIBRARY: EmbroideryDef[] = [
  {
    id: "spiral",
    name: "Spirale",
    category: EMBROIDERY_CATEGORY,
    notes: "Une spirale à points avant.",
    build: () => make(4, 4, "#5b3a8c", [{ points: Array.from({ length: 120 }, (_, i) => [2 + (i / 120) * 1.8 * Math.cos(i / 9), 2 + (i / 120) * 1.8 * Math.sin(i / 9)] as [number, number]) }]),
  },
  {
    id: "wave",
    name: "Vague",
    category: EMBROIDERY_CATEGORY,
    notes: "Une ligne ondulée, pour une bordure.",
    build: () => make(8, 1, "#1e66c8", [{ points: Array.from({ length: 97 }, (_, i) => [(i / 96) * 8, 0.5 + 0.35 * Math.sin((i / 96) * 8 * 2.4)] as [number, number]) }]),
  },
  { id: "heart", name: "Cœur", category: EMBROIDERY_CATEGORY, notes: "Un cœur au point de tige.", build: () => make(3, 3, "#c62828", [{ points: heartPoints(1.5, 1.5, 1.3), closed: true }]) },
  {
    id: "star",
    name: "Étoile",
    category: EMBROIDERY_CATEGORY,
    notes: "Une étoile à cinq branches, tracée d'un seul fil.",
    build: () => make(3, 3, "#c9a227", [{ points: Array.from({ length: 6 }, (_, i) => [1.5 + 1.4 * Math.cos(-Math.PI / 2 + (4 * Math.PI * i) / 5), 1.5 + 1.4 * Math.sin(-Math.PI / 2 + (4 * Math.PI * i) / 5)] as [number, number]), closed: true }]),
  },
  {
    id: "daisy",
    name: "Pâquerette",
    category: EMBROIDERY_CATEGORY,
    notes: "Huit pétales en boucle autour d'un cœur.",
    build: () =>
      make(
        3,
        3,
        "#7a7a2a",
        [
          { points: circle(1.5, 1.5, 0.22, 24), closed: true },
          ...Array.from({ length: 8 }, (_, k) => {
            const a = (2 * Math.PI * k) / 8;
            const pts: [number, number][] = [];
            for (let i = 0; i <= 24; i++) {
              const t = (i / 24) * Math.PI;
              const along = 0.3 + (i / 24) * 1.1;
              const side = 0.32 * Math.sin(t) * (i <= 12 ? 1 : -1);
              pts.push([1.5 + along * Math.cos(a) - side * Math.sin(a), 1.5 + along * Math.sin(a) + side * Math.cos(a)]);
            }
            return { points: pts } as StitchPath;
          }),
        ],
      ),
  },
  {
    id: "vine",
    name: "Vigne",
    category: EMBROIDERY_CATEGORY,
    notes: "Une tige sinueuse avec des feuilles.",
    build: () => {
      const stem: [number, number][] = Array.from({ length: 81 }, (_, i) => [(i / 80) * 8, 1 + 0.45 * Math.sin((i / 80) * 9)] as [number, number]);
      const leaves: StitchPath[] = [1, 2, 3, 4, 5, 6, 7].map((k) => {
        const x = k;
        const y = 1 + 0.45 * Math.sin((x / 8) * 9);
        const dir = k % 2 === 0 ? -1 : 1;
        return { points: [[x, y], [x + 0.25, y + dir * 0.3], [x + 0.55, y + dir * 0.35], [x + 0.3, y + dir * 0.05], [x, y]] as [number, number][], closed: true };
      });
      return make(8, 2, "#2e7d32", [{ points: stem }, ...leaves]);
    },
  },
  {
    id: "zigzag",
    name: "Zigzag",
    category: EMBROIDERY_CATEGORY,
    notes: "Un zigzag régulier.",
    build: () => make(8, 0.8, "#ef6c00", [{ points: Array.from({ length: 33 }, (_, i) => [(i / 32) * 8, i % 2 === 0 ? 0.1 : 0.7] as [number, number]) }]),
  },
  {
    id: "dotted-frame",
    name: "Cadre à points",
    category: EMBROIDERY_CATEGORY,
    notes: "Un cadre en points, pour entourer un motif.",
    build: () => {
      const paths: StitchPath[] = [];
      const n = 16;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const a: [number, number][] = [
          [t * 4, 0],
          [t * 4 + 0.12, 0],
        ];
        paths.push({ points: a });
        paths.push({ points: [[4, t * 4], [4, t * 4 + 0.12]] });
        paths.push({ points: [[4 - t * 4, 4], [4 - t * 4 - 0.12, 4]] });
        paths.push({ points: [[0, 4 - t * 4], [0, 4 - t * 4 - 0.12]] });
      }
      return make(4, 4, "#14284b", paths);
    },
  },
  {
    id: "cross-stitches",
    name: "Points de croix",
    category: EMBROIDERY_CATEGORY,
    notes: "Une rangée de croix.",
    build: () => make(4, 0.5, "#c2185b", Array.from({ length: 8 }, (_, i) => [{ points: [[i * 0.5 + 0.05, 0.05], [i * 0.5 + 0.45, 0.45]] as [number, number][] }, { points: [[i * 0.5 + 0.45, 0.05], [i * 0.5 + 0.05, 0.45]] as [number, number][] }]).flat()),
  },
  {
    id: "rosette",
    name: "Rosace",
    category: EMBROIDERY_CATEGORY,
    notes: "Trois cercles et six rayons.",
    build: () => make(4, 4, "#6a3fa0", [{ points: circle(2, 2, 1.9), closed: true }, { points: circle(2, 2, 1.2), closed: true }, { points: circle(2, 2, 0.5, 24), closed: true }, ...Array.from({ length: 6 }, (_, k) => ({ points: [[2 + 0.5 * Math.cos((Math.PI * k) / 3), 2 + 0.5 * Math.sin((Math.PI * k) / 3)], [2 + 1.9 * Math.cos((Math.PI * k) / 3), 2 + 1.9 * Math.sin((Math.PI * k) / 3)]] as [number, number][] }))]),
  },
];

/** Une broderie de la bibliothèque prête à entrer dans le carnet (identifiant neuf). */
export function instantiateEmbroidery(def: EmbroideryDef): EmbroideryItem {
  const card = emptyNotecard(def.name);
  return { id: createId(), card: { ...card, reference: `Bibliothèque Quilt Studio — ${def.category}`, notes: def.notes, back: { classification: "Broderie", categories: [def.category] } }, content: def.build() as unknown as JsonValue };
}

/** Le SVG (attribut `d`) d'un tracé, pour les vignettes et le quilt. */
export function stitchPathD(p: StitchPath): string {
  return p.points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join("") + (p.closed ? "Z" : "");
}

/** Épaisseur du trait (pouces) selon le rendu : le brouillon est fin ; le rendu 3D est un fil épais. */
export function threadThickness(render: EmbroideryRender): number {
  return render === "3d" ? 0.045 : 0.018;
}
