// Bibliothèque intégrée de tissus (SPEC §8.1) : environ 150 tissus générés par code, rangés en catégories et styles.
// Tous les noms, couleurs et motifs sont les nôtres.

import { hexToOklab, oklabToHex } from "../color/color";
import { generatedAverage } from "../fabric/generator";
import { createId, emptyNotecard, type FabricItem, type FabricSource, type JsonValue } from "../project/model";
import { LIBRARY_NAME } from "./blocks";
import { FABRIC_AVERAGES } from "./fabricAverages";

export interface LibraryFabricDef {
  /** Identifiant stable dans la bibliothèque (pas dans le projet). */
  id: string;
  name: string;
  category: string;
  style: string;
  source: Extract<FabricSource, { kind: "generated" }>;
}

export const FABRIC_CATEGORIES = {
  plain: "01 Unis et faux-unis",
  geometric: "02 Géométriques",
  plaids: "03 Carreaux",
  ombre: "04 Dégradés",
} as const;

export const FABRIC_STYLES = {
  solids: "Unis",
  mottled: "Marbrés",
  stripes: "Rayures",
  dots: "Pois",
  checks: "Damiers",
  gingham: "Vichy",
  tartan: "Écossais",
  ombre: "Ombrés",
} as const;

/** Les 24 teintes de base de la bibliothèque (nom au masculin, invariable : « fond marine », « rayure rouge et blanc »). */
const HUES: [string, string][] = [
  ["rouge", "#c62828"],
  ["corail", "#e8645a"],
  ["orange", "#ef6c00"],
  ["ocre", "#c98a1b"],
  ["jaune", "#f2c200"],
  ["olive", "#7d7f2a"],
  ["vert pomme", "#8cc63f"],
  ["vert", "#2e7d32"],
  ["émeraude", "#0f8a5f"],
  ["sapin", "#1b4d3e"],
  ["turquoise", "#26a69a"],
  ["canard", "#11607a"],
  ["bleu ciel", "#81c7f0"],
  ["bleu", "#1e66c8"],
  ["marine", "#14284b"],
  ["indigo", "#3b3f8f"],
  ["violet", "#6a3fa0"],
  ["prune", "#6b2d5c"],
  ["fuchsia", "#c2185b"],
  ["rose", "#f4a6c0"],
  ["framboise", "#a3184a"],
  ["brique", "#9c3b2e"],
  ["chocolat", "#5a3a22"],
  ["taupe", "#8a7d70"],
];

const WHITE = "#ffffff";
const CREAM = "#f6efdc";

/** Une couleur plus foncée (ou plus claire) de la même teinte, en OKLab. */
function shade(hex: string, dL: number): string {
  const c = hexToOklab(hex);
  return oklabToHex({ L: Math.min(0.98, Math.max(0.08, c.L + dL)), a: c.a, b: c.b });
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function def(
  id: string,
  name: string,
  category: string,
  style: string,
  generator: string,
  params: { [key: string]: JsonValue },
  seed = 0,
): LibraryFabricDef {
  return { id, name, category, style, source: { kind: "generated", generator, seed, params } };
}

function build(): LibraryFabricDef[] {
  const out: LibraryFabricDef[] = [];
  const { plain, geometric, plaids, ombre } = FABRIC_CATEGORIES;
  const S = FABRIC_STYLES;

  // Unis : 12 couleurs franches.
  HUES.filter((_, i) => i % 2 === 0).forEach(([name, hex]) => out.push(def(`uni-${name}`, `Uni ${name}`, plain, S.solids, "solid", { color: hex })));

  // Marbrés : 24 faux-unis, un par teinte, avec une graine propre.
  HUES.forEach(([name, hex], i) =>
    out.push(def(`marbre-${name}`, `Marbré ${name}`, plain, S.mottled, "noise", { base: shade(hex, 0.06), accent: shade(hex, -0.1), size: 4, cells: 3 + (i % 3), contrast: 0.9 }, 1000 + i * 17)),
  );

  // Rayures : 24 variantes (sens, largeurs, fonds).
  HUES.forEach(([name, hex], i) => {
    const kind = i % 4;
    if (kind === 0) out.push(def(`rayure-fine-${name}`, `Rayure fine ${name} et blanc`, geometric, S.stripes, "stripes", { colors: [hex, WHITE], widths: [0.125, 0.125], direction: "vertical" }));
    else if (kind === 1) out.push(def(`rayure-large-${name}`, `Rayure large ${name} et crème`, geometric, S.stripes, "stripes", { colors: [hex, CREAM], widths: [0.5, 0.5], direction: "horizontal" }));
    else if (kind === 2) out.push(def(`rayure-biais-${name}`, `Rayure en biais ${name}`, geometric, S.stripes, "stripes", { colors: [hex, shade(hex, 0.25)], widths: [0.25, 0.25], direction: "diagonal" }));
    else out.push(def(`rayure-multi-${name}`, `Rayure tricolore ${name}`, geometric, S.stripes, "stripes", { colors: [hex, WHITE, shade(hex, -0.15), WHITE], widths: [0.375, 0.0625, 0.125, 0.0625], direction: "vertical" }));
  });

  // Pois : 24 variantes (petits, moyens, sur fond clair ou foncé).
  HUES.forEach(([name, hex], i) => {
    const kind = i % 3;
    if (kind === 0) out.push(def(`pois-blancs-${name}`, `Pois blancs sur fond ${name}`, geometric, S.dots, "dots", { ground: hex, dot: WHITE, spacing: 0.5, radius: 0.08 }));
    else if (kind === 1) out.push(def(`pois-${name}-creme`, `Pois ${name} sur fond crème`, geometric, S.dots, "dots", { ground: CREAM, dot: hex, spacing: 0.375, radius: 0.07 }));
    else out.push(def(`gros-pois-${name}`, `Gros pois ${name}`, geometric, S.dots, "dots", { ground: shade(hex, 0.3), dot: hex, spacing: 1, radius: 0.22, staggered: false }));
  });

  // Damiers : 18 (deux tailles, sur blanc ou deux tons).
  HUES.slice(0, 18).forEach(([name, hex], i) =>
    out.push(
      i % 2 === 0
        ? def(`damier-${name}`, `Damier ${name} et blanc`, geometric, S.checks, "checks", { a: hex, b: WHITE, size: 0.5 })
        : def(`petit-damier-${name}`, `Petit damier ${name}`, geometric, S.checks, "checks", { a: hex, b: shade(hex, 0.22), size: 0.25 }),
    ),
  );

  // Vichy : 18 (trois tailles de carreaux).
  HUES.slice(0, 18).forEach(([name, hex], i) => {
    const size = [0.125, 0.25, 0.5][i % 3] as number;
    const label = ["Vichy fin", "Vichy", "Grand vichy"][i % 3] as string;
    out.push(def(`vichy-${size}-${name}`, `${label} ${name}`, plaids, S.gingham, "gingham", { color: hex, ground: WHITE, size }));
  });

  // Écossais : 12 armures maison.
  const setts: [string, string[], number[]][] = [
    ["Écossais forêt", ["#1b4d3e", "#14284b", "#c62828", "#1b4d3e"], [0.5, 0.375, 0.0625, 0.125]],
    ["Écossais rouge royal", ["#c62828", "#14284b", "#f2c200", "#1b4d3e"], [0.625, 0.25, 0.0625, 0.25]],
    ["Écossais bleu glacier", ["#81c7f0", "#ffffff", "#1e66c8"], [0.5, 0.125, 0.25]],
    ["Écossais miel", ["#c98a1b", "#5a3a22", "#f6efdc"], [0.5, 0.25, 0.125]],
    ["Écossais bruyère", ["#6b2d5c", "#8a7d70", "#c3a6e0"], [0.5, 0.25, 0.125]],
    ["Écossais berger", ["#1a1a1a", "#ffffff"], [0.25, 0.25]],
    ["Écossais sapin et blanc", ["#1b4d3e", "#ffffff", "#c62828"], [0.5, 0.0625, 0.0625]],
    ["Écossais marine et ciel", ["#14284b", "#81c7f0", "#ffffff"], [0.5, 0.25, 0.0625]],
    ["Écossais terre cuite", ["#9c3b2e", "#c98a1b", "#5a3a22"], [0.5, 0.125, 0.25]],
    ["Écossais pastel", ["#f4a6c0", "#81c7f0", "#f6efdc"], [0.375, 0.25, 0.25]],
    ["Écossais olive", ["#7d7f2a", "#5a3a22", "#f2c200"], [0.5, 0.25, 0.0625]],
    ["Écossais nuit", ["#1a1a1a", "#3b3f8f", "#26a69a"], [0.5, 0.25, 0.0625]],
  ];
  setts.forEach(([name, cs, ws], i) => out.push(def(`ecossais-${i + 1}`, name, plaids, S.tartan, "tartan", { colors: cs, widths: ws })));

  // Dégradés : 18 ombrés (une teinte vers le clair, ou deux teintes voisines).
  HUES.slice(0, 18).forEach(([name, hex], i) => {
    const [otherName, other] = HUES[(i + 3) % HUES.length] as [string, string];
    out.push(
      i % 2 === 0
        ? def(`ombre-${name}`, `Ombré ${name}`, ombre, S.ombre, "gradient", { from: shade(hex, -0.12), to: shade(hex, 0.3), width: 40 })
        : def(`ombre-${name}-${otherName}`, `Ombré ${name} et ${otherName}`, ombre, S.ombre, "gradient", { from: hex, to: other, width: 40 }),
    );
  });

  return out;
}

export const LIBRARY_FABRICS: LibraryFabricDef[] = build();

export function fabricLibraryTree(): { category: string; styles: { style: string; fabrics: LibraryFabricDef[] }[] }[] {
  const tree: { category: string; styles: { style: string; fabrics: LibraryFabricDef[] }[] }[] = [];
  for (const f of LIBRARY_FABRICS) {
    let cat = tree.find((c) => c.category === f.category);
    if (!cat) {
      cat = { category: f.category, styles: [] };
      tree.push(cat);
    }
    let st = cat.styles.find((s) => s.style === f.style);
    if (!st) {
      st = { style: f.style, fabrics: [] };
      cat.styles.push(st);
    }
    st.fabrics.push(f);
  }
  return tree;
}

const averages = new Map<string, string>();

/** Couleur moyenne d'un tissu de la bibliothèque : précalculée (fabricAverages.ts), sinon calculée une fois. */
export function libraryFabricAverage(def: LibraryFabricDef): string {
  let avg = FABRIC_AVERAGES[def.id] ?? averages.get(def.id);
  if (!avg) {
    avg = generatedAverage(def.source);
    averages.set(def.id, avg);
  }
  return avg;
}

/** Un tissu de la bibliothèque, prêt à entrer dans le carnet (nouvel identifiant, fiche remplie, couleur moyenne). */
export function instantiateLibraryFabric(def: LibraryFabricDef): FabricItem {
  const card = emptyNotecard(cap(def.name));
  card.reference = `${LIBRARY_NAME} — ${def.category}`;
  card.back = { classification: def.style, categories: [def.category] };
  return {
    id: createId(),
    card,
    source: { kind: "generated", generator: def.source.generator, seed: def.source.seed, params: def.source.params },
    averageColor: libraryFabricAverage(def),
  };
}
