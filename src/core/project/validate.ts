// Validation stricte d'un projet lu depuis un fichier : le résultat est reconstruit champ par champ,
// donc rien d'inattendu (champ inconnu, type erroné, référence cassée) ne traverse jusqu'au reste de l'application.

import {
  FORMAT_VERSION,
  LIST_KEYS,
  MAX_MAX_COLORINGS,
  MAX_THREAD_WEIGHT,
  MIN_MAX_COLORINGS,
  MIN_THREAD_WEIGHT,
  SECTION_IDS,
  THREAD_STYLES,
  emptySketchbook,
  findBlock,
  type AssetMeta,
  type BlockItem,
  type BlockPlacement,
  type Coloring,
  type ColorItem,
  type EmbroideryItem,
  type FabricItem,
  type FabricSource,
  type JsonValue,
  type ListKey,
  type Notecard,
  type Paint,
  type PhotoItem,
  type Project,
  type QuiltItem,
  type SectionId,
  type Sketchbook,
  type ThreadItem,
  type ThreadStroke,
  type ThreadStyle,
} from "./model";

export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFormatError";
  }
}

type Rec = Record<string, unknown>;

const RGB = /^#[0-9a-f]{6}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function fail(path: string, message: string): never {
  throw new ProjectFormatError(`${path} : ${message}`);
}

function record(value: unknown, path: string): Rec {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "objet attendu");
  return value as Rec;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "liste attendue");
  return value as unknown[];
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, "texte attendu");
  return value as string;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "nombre fini attendu");
  return value as number;
}

function positive(value: unknown, path: string): number {
  const n = finite(value, path);
  if (n <= 0) fail(path, "nombre strictement positif attendu");
  return n;
}

function rgb(value: unknown, path: string): string {
  const s = text(value, path);
  if (!RGB.test(s)) fail(path, "couleur #rrggbb (minuscules) attendue");
  return s;
}

function hash(value: unknown, path: string): string {
  const s = text(value, path);
  if (!SHA256.test(s)) fail(path, "empreinte SHA-256 attendue");
  return s;
}

function json(value: unknown, path: string, depth = 0): JsonValue {
  if (depth > 64) fail(path, "imbrication trop profonde");
  if (value === null || typeof value === "boolean" || typeof value === "string") return value as JsonValue;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(path, "nombre fini attendu");
    return value;
  }
  if (Array.isArray(value)) return value.map((v, i) => json(v, `${path}[${i}]`, depth + 1));
  if (typeof value === "object") {
    const out: { [key: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(value as Rec)) out[k] = json(v, `${path}.${k}`, depth + 1);
    return out;
  }
  return fail(path, "valeur JSON attendue");
}

function notecard(value: unknown, path: string): Notecard {
  const r = record(value, path);
  const back = record(r.back, `${path}.back`);
  return {
    name: text(r.name, `${path}.name`),
    reference: text(r.reference, `${path}.reference`),
    notes: text(r.notes, `${path}.notes`),
    back: {
      classification: text(back.classification, `${path}.back.classification`),
      categories: list(back.categories, `${path}.back.categories`).map((c, i) => text(c, `${path}.back.categories[${i}]`)),
    },
  };
}

function paint(value: unknown, path: string): Paint {
  const r = record(value, path);
  if (r.kind === "fabric") {
    const fabricId = text(r.fabricId, `${path}.fabricId`);
    const out: Extract<Paint, { kind: "fabric" }> = { kind: "fabric", fabricId };
    if (r.offset !== undefined) {
      const o = record(r.offset, `${path}.offset`);
      out.offset = { x: finite(o.x, `${path}.offset.x`), y: finite(o.y, `${path}.offset.y`) };
    }
    if (r.rotation !== undefined) out.rotation = finite(r.rotation, `${path}.rotation`);
    return out;
  }
  if (r.kind === "solid") return { kind: "solid", rgb: rgb(r.rgb, `${path}.rgb`) };
  return fail(path, "type d'habillage inconnu");
}

function fills(value: unknown, path: string): Record<string, Paint> {
  const out: Record<string, Paint> = {};
  for (const [key, p] of Object.entries(record(value, path))) out[key] = paint(p, `${path}.${key}`);
  return out;
}

function threadStroke(value: unknown, path: string): ThreadStroke {
  const r = record(value, path);
  const style = text(r.style, `${path}.style`);
  if (!(THREAD_STYLES as readonly string[]).includes(style)) fail(`${path}.style`, "style de fil inconnu");
  const weight = finite(r.weight, `${path}.weight`);
  if (!Number.isInteger(weight) || weight < MIN_THREAD_WEIGHT || weight > MAX_THREAD_WEIGHT) {
    fail(`${path}.weight`, `entier de ${MIN_THREAD_WEIGHT} à ${MAX_THREAD_WEIGHT} attendu`);
  }
  return { rgb: rgb(r.rgb, `${path}.rgb`), style: style as ThreadStyle, weight };
}

function coloring(value: unknown, path: string): Coloring {
  const r = record(value, path);
  const out: Coloring = { id: text(r.id, `${path}.id`), fills: fills(r.fills, `${path}.fills`) };
  if (r.threads !== undefined) {
    const threads: Record<string, ThreadStroke> = {};
    for (const [key, t] of Object.entries(record(r.threads, `${path}.threads`))) threads[key] = threadStroke(t, `${path}.threads.${key}`);
    out.threads = threads;
  }
  return out;
}

function block(value: unknown, path: string): BlockItem {
  const r = record(value, path);
  return {
    id: text(r.id, `${path}.id`),
    card: notecard(r.card, `${path}.card`),
    width: positive(r.width, `${path}.width`),
    height: positive(r.height, `${path}.height`),
    drawing: json(r.drawing, `${path}.drawing`),
    colorings: list(r.colorings, `${path}.colorings`).map((c, i) => coloring(c, `${path}.colorings[${i}]`)),
  };
}

function placement(value: unknown, path: string): BlockPlacement {
  const r = record(value, path);
  return { blockId: text(r.blockId, `${path}.blockId`), coloringId: text(r.coloringId, `${path}.coloringId`) };
}

function quilt(value: unknown, path: string): QuiltItem {
  const r = record(value, path);
  return {
    id: text(r.id, `${path}.id`),
    card: notecard(r.card, `${path}.card`),
    layout: json(r.layout, `${path}.layout`),
    placements: list(r.placements, `${path}.placements`).map((p, i) => placement(p, `${path}.placements[${i}]`)),
    fills: fills(r.fills, `${path}.fills`),
  };
}

function fabricSource(value: unknown, path: string): FabricSource {
  const r = record(value, path);
  if (r.kind === "generated") {
    const params = json(r.params, `${path}.params`);
    if (typeof params !== "object" || params === null || Array.isArray(params)) fail(`${path}.params`, "objet attendu");
    return {
      kind: "generated",
      generator: text(r.generator, `${path}.generator`),
      seed: finite(r.seed, `${path}.seed`),
      params: params as { [key: string]: JsonValue },
    };
  }
  if (r.kind === "image") {
    return { kind: "image", asset: hash(r.asset, `${path}.asset`), ppi: positive(r.ppi, `${path}.ppi`) };
  }
  return fail(path, "type de source de tissu inconnu");
}

function fabric(value: unknown, path: string): FabricItem {
  const r = record(value, path);
  return {
    id: text(r.id, `${path}.id`),
    card: notecard(r.card, `${path}.card`),
    source: fabricSource(r.source, `${path}.source`),
    averageColor: rgb(r.averageColor, `${path}.averageColor`),
  };
}

function color(value: unknown, path: string): ColorItem {
  const r = record(value, path);
  return { id: text(r.id, `${path}.id`), card: notecard(r.card, `${path}.card`), rgb: rgb(r.rgb, `${path}.rgb`) };
}

function photo(value: unknown, path: string): PhotoItem {
  const r = record(value, path);
  return {
    id: text(r.id, `${path}.id`),
    card: notecard(r.card, `${path}.card`),
    asset: hash(r.asset, `${path}.asset`),
    ppi: positive(r.ppi, `${path}.ppi`),
  };
}

function thread(value: unknown, path: string): ThreadItem {
  const r = record(value, path);
  return { id: text(r.id, `${path}.id`), card: notecard(r.card, `${path}.card`), rgb: rgb(r.rgb, `${path}.rgb`) };
}

function embroidery(value: unknown, path: string): EmbroideryItem {
  const r = record(value, path);
  return { id: text(r.id, `${path}.id`), card: notecard(r.card, `${path}.card`), content: json(r.content, `${path}.content`) };
}

const PARSERS: { [K in ListKey]: (value: unknown, path: string) => Sketchbook[K][number] } = {
  quilts: quilt,
  blocks: block,
  motifs: block,
  stencils: block,
  fabrics: fabric,
  colors: color,
  photos: photo,
  threads: thread,
  embroideries: embroidery,
};

function parseList<K extends ListKey>(key: K, value: unknown, path: string): Sketchbook[K] {
  const parse = PARSERS[key] as (value: unknown, path: string) => Sketchbook[K][number];
  return list(value, path).map((v, i) => parse(v, `${path}[${i}]`)) as Sketchbook[K];
}

/** Valide et reconstruit un projet. Lève une `ProjectFormatError` à la première anomalie. */
export function validateProject(raw: unknown): Project {
  const root = record(raw, "projet");
  if (root.formatVersion !== FORMAT_VERSION) fail("formatVersion", `version ${FORMAT_VERSION} attendue`);

  const settings = record(root.settings, "settings");
  const maxColorings = finite(settings.maxColorings, "settings.maxColorings");
  if (!Number.isInteger(maxColorings) || maxColorings < MIN_MAX_COLORINGS || maxColorings > MAX_MAX_COLORINGS) {
    fail("settings.maxColorings", `entier de ${MIN_MAX_COLORINGS} à ${MAX_MAX_COLORINGS} attendu`);
  }

  const book = record(root.sketchbook, "sketchbook");
  const sketchbook = emptySketchbook();
  for (const key of LIST_KEYS) {
    (sketchbook[key] as unknown[]) = parseList(key, book[key], `sketchbook.${key}`);
  }

  const assets: Record<string, AssetMeta> = {};
  for (const [id, meta] of Object.entries(record(root.assets, "assets"))) {
    hash(id, `assets.${id}`);
    const m = record(meta, `assets.${id}`);
    const size = finite(m.size, `assets.${id}.size`);
    if (size < 0) fail(`assets.${id}.size`, "taille négative");
    assets[id] = { mime: text(m.mime, `assets.${id}.mime`), size };
  }

  const frameColors: Project["frameColors"] = {};
  for (const [section, value] of Object.entries(record(root.frameColors, "frameColors"))) {
    if (!(SECTION_IDS as readonly string[]).includes(section)) fail(`frameColors.${section}`, "section inconnue");
    frameColors[section as SectionId] = rgb(value, `frameColors.${section}`);
  }

  const project: Project = { formatVersion: FORMAT_VERSION, settings: { maxColorings }, sketchbook, assets, frameColors };
  checkIntegrity(project);
  return project;
}

/** Identifiants uniques et références résolues. */
function checkIntegrity(project: Project): void {
  const itemIds = new Set<string>();
  for (const key of LIST_KEYS) {
    for (const item of project.sketchbook[key]) {
      if (itemIds.has(item.id)) fail(`sketchbook.${key}`, `identifiant en double : ${item.id}`);
      itemIds.add(item.id);
    }
  }

  const coloringOwner = new Map<string, string>();
  for (const key of ["blocks", "motifs", "stencils"] as const) {
    for (const b of project.sketchbook[key]) {
      for (const c of b.colorings) {
        if (coloringOwner.has(c.id)) fail(`sketchbook.${key}`, `coloration en double : ${c.id}`);
        coloringOwner.set(c.id, b.id);
      }
    }
  }

  const fabricIds = new Set(project.sketchbook.fabrics.map((f) => f.id));
  const checkFills = (where: string, map: Record<string, Paint>): void => {
    for (const [cell, p] of Object.entries(map)) {
      if (p.kind === "fabric" && !fabricIds.has(p.fabricId)) fail(where, `tissu introuvable (${cell}) : ${p.fabricId}`);
    }
  };
  for (const key of ["blocks", "motifs", "stencils"] as const) {
    for (const b of project.sketchbook[key]) for (const c of b.colorings) checkFills(`bloc ${b.id}`, c.fills);
  }
  for (const q of project.sketchbook.quilts) {
    checkFills(`quilt ${q.id}`, q.fills);
    for (const p of q.placements) {
      // Une coloration vide désigne le dessin au trait (coloration 0).
      const ok = p.coloringId === "" ? findBlock(project, p.blockId) !== undefined : coloringOwner.get(p.coloringId) === p.blockId;
      if (!ok) fail(`quilt ${q.id}`, `bloc posé introuvable : ${p.blockId} / ${p.coloringId}`);
    }
  }

  const needAsset = (where: string, asset: string): void => {
    if (!project.assets[asset]) fail(where, `image absente de la liste des ressources : ${asset}`);
  };
  for (const f of project.sketchbook.fabrics) if (f.source.kind === "image") needAsset(`tissu ${f.id}`, f.source.asset);
  for (const p of project.sketchbook.photos) needAsset(`photo ${p.id}`, p.asset);
}
