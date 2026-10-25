// Migrations du format de projet. Chaque entrée transforme la version n en n + 1 ; la validation stricte
// (validateProject) s'applique ensuite au résultat, donc une migration n'a pas à tout contrôler.

import { FORMAT_VERSION, createId, emptyNotecard } from "./model";
import { ProjectFormatError } from "./validate";

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Rec) : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** `#RRGGBB` ou `#rgb` → `#rrggbb` ; toute autre valeur devient du noir. */
function normalizeRgb(value: unknown): string {
  const s = str(value).trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return "#000000";
}

function cardFromV0(item: Rec): unknown {
  const card = emptyNotecard(str(item.name));
  card.notes = str(item.notes);
  return card;
}

function fillsFromV0(value: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [cell, color] of Object.entries(rec(value))) out[cell] = { kind: "solid", rgb: normalizeRgb(color) };
  return out;
}

function blockFromV0(raw: unknown): unknown {
  const item = rec(raw);
  const size = typeof item.size === "number" && item.size > 0 ? item.size : 6;
  return {
    id: str(item.id, createId()),
    card: cardFromV0(item),
    width: size,
    height: size,
    drawing: item.drawing ?? null,
    colorings: arr(item.colorings).map((c) => ({ id: str(rec(c).id, createId()), fills: fillsFromV0(rec(c).fills) })),
  };
}

/**
 * v0 → v1. La version 0 est l'ébauche interne qui précède le format publié : listes à la racine,
 * `name`/`notes` à la place de la fiche, couleurs en texte `#RRGGBB`, blocs carrés (`size`), pas de réglages.
 */
function v0ToV1(raw: Rec): Rec {
  const colorLike = (list: unknown): unknown[] =>
    arr(list).map((c) => ({ id: str(rec(c).id, createId()), card: cardFromV0(rec(c)), rgb: normalizeRgb(rec(c).color) }));
  const plain = (list: unknown, extra: (item: Rec) => Rec): unknown[] =>
    arr(list).map((raw) => {
      const item = rec(raw);
      return { id: str(item.id, createId()), card: cardFromV0(item), ...extra(item) };
    });

  return {
    formatVersion: 1,
    settings: { maxColorings: 2 },
    assets: {},
    frameColors: {},
    sketchbook: {
      quilts: plain(raw.quilts, (q) => ({
        layout: q.layout ?? null,
        placements: arr(q.blocks).map((p) => ({ blockId: str(rec(p).block), coloringId: str(rec(p).coloring) })),
        fills: fillsFromV0(q.fills),
      })),
      blocks: arr(raw.blocks).map(blockFromV0),
      motifs: arr(raw.motifs).map(blockFromV0),
      stencils: arr(raw.stencils).map(blockFromV0),
      fabrics: plain(raw.fabrics, (f) => {
        const color = normalizeRgb(f.color);
        return { source: { kind: "generated", generator: "solid", seed: 0, params: { color } }, averageColor: color };
      }),
      colors: colorLike(raw.colors),
      photos: [],
      threads: colorLike(raw.threads),
      embroideries: plain(raw.embroideries, (e) => ({ content: e.content ?? null })),
    },
  };
}

const MIGRATIONS: Record<number, (raw: Rec) => Rec> = {
  0: v0ToV1,
};

/** Amène un document brut à la version courante du format. */
export function migrateProject(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ProjectFormatError("projet : objet attendu");
  }
  let doc = raw as Rec;
  let version = doc.formatVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    throw new ProjectFormatError("formatVersion : entier positif attendu");
  }
  if (version > FORMAT_VERSION) {
    throw new ProjectFormatError(
      `Ce projet a été créé par une version plus récente de Quilt Studio (format ${version}) ; cette version lit jusqu'au format ${FORMAT_VERSION}.`,
    );
  }
  while (version < FORMAT_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new ProjectFormatError(`Aucune migration depuis le format ${version}.`);
    try {
      doc = step(doc);
    } catch (error) {
      if (error instanceof ProjectFormatError) throw error;
      throw new ProjectFormatError(`Migration du format ${version} impossible : ${String(error)}`);
    }
    version += 1;
  }
  return doc;
}
