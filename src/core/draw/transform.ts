// Symétries et transformations d'une sélection. Les miroirs se font par rapport aux axes du bloc ; la rotation et le
// redimensionnement se font autour du centre de la sélection.

import { createId, type Id } from "../project/model";
import { addSegments, cleanSegment, insideRectOfDraft, type BlockDraft } from "./draft";
import { boundsOf, dist, unionBounds, type Pt, type Segment } from "./geometry";

export type MirrorAxis = "lr" | "tb" | "diagLeft" | "diagRight";

export type TransformSpec =
  | { kind: "mirror"; axis: MirrorAxis }
  | { kind: "rotate"; degrees: number }
  | { kind: "scale"; sx: number; sy: number };

export type TransformResult =
  | { ok: true; draft: BlockDraft; ids: Id[] }
  | { ok: false; reason: "empty" | "outside" | "not-square" | "invalid" };

/** Applique une transformation de points à un segment ; `flip` inverse la courbure d'un arc, `ratio` met sa flèche à l'échelle. */
export function mapSegment(seg: Segment, map: (p: Pt) => Pt, flip: boolean, uniform: boolean, id: Id = seg.id): Segment {
  const a = map(seg.a);
  const b = map(seg.b);
  if (seg.kind === "line") return { id, kind: "line", a, b };
  let sagitta = flip ? -seg.sagitta : seg.sagitta;
  if (!uniform) {
    const before = dist(seg.a, seg.b);
    sagitta = before === 0 ? sagitta : (sagitta * dist(a, b)) / before;
  }
  return { id, kind: "arc", a, b, sagitta };
}

function pointMap(draft: BlockDraft, spec: TransformSpec, selection: readonly Segment[]): { map: (p: Pt) => Pt; flip: boolean; uniform: boolean } | "not-square" | "invalid" {
  const { width: W, height: H } = draft;
  if (spec.kind === "mirror") {
    switch (spec.axis) {
      case "lr":
        return { map: (p) => ({ x: W - p.x, y: p.y }), flip: true, uniform: true };
      case "tb":
        return { map: (p) => ({ x: p.x, y: H - p.y }), flip: true, uniform: true };
      case "diagLeft":
        if (Math.abs(W - H) > 1e-9) return "not-square";
        return { map: (p) => ({ x: p.y, y: p.x }), flip: true, uniform: true };
      case "diagRight":
        if (Math.abs(W - H) > 1e-9) return "not-square";
        return { map: (p) => ({ x: W - p.y, y: H - p.x }), flip: true, uniform: true };
    }
  }
  const box = unionBounds(selection.map(boundsOf));
  if (!box) return "invalid";
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  if (spec.kind === "rotate") {
    const turns = ((Math.round(spec.degrees) % 360) + 360) % 360;
    if (Number.isInteger(spec.degrees) && turns === 90) return { map: (p) => ({ x: cx - (p.y - cy), y: cy + (p.x - cx) }), flip: false, uniform: true };
    if (Number.isInteger(spec.degrees) && turns === 180) return { map: (p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y }), flip: false, uniform: true };
    if (Number.isInteger(spec.degrees) && turns === 270) return { map: (p) => ({ x: cx + (p.y - cy), y: cy - (p.x - cx) }), flip: false, uniform: true };
    if (!Number.isFinite(spec.degrees)) return "invalid";
    const r = (spec.degrees * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return { map: (p) => ({ x: cx + (p.x - cx) * cos - (p.y - cy) * sin, y: cy + (p.x - cx) * sin + (p.y - cy) * cos }), flip: false, uniform: true };
  }
  if (!(spec.sx > 0 && spec.sy > 0) || !Number.isFinite(spec.sx) || !Number.isFinite(spec.sy)) return "invalid";
  return {
    map: (p) => ({ x: cx + (p.x - cx) * spec.sx, y: cy + (p.y - cy) * spec.sy }),
    flip: false,
    uniform: spec.sx === spec.sy,
  };
}

/**
 * Transforme la sélection. Sans `clone`, les segments sont remplacés (mêmes identifiants) ; avec `clone`, des copies
 * transformées sont ajoutées (les superpositions sont retirées) et deviennent la sélection.
 */
export function transformSelection(draft: BlockDraft, ids: readonly Id[], spec: TransformSpec, clone: boolean): TransformResult {
  const wanted = new Set(ids);
  const selection = draft.segments.filter((s) => wanted.has(s.id));
  if (selection.length === 0) return { ok: false, reason: "empty" };
  const m = pointMap(draft, spec, selection);
  if (m === "not-square" || m === "invalid") return { ok: false, reason: m };

  if (clone) {
    const copies = selection.map((s) => cleanSegment(mapSegment(s, m.map, m.flip, m.uniform, createId())));
    if (copies.some((s) => !insideRectOfDraft(draft, s))) return { ok: false, reason: "outside" };
    const added = addSegments(draft, copies);
    return { ok: true, draft: added.draft, ids: added.added.length > 0 ? added.added : [...ids] };
  }
  const moved = new Map(selection.map((s) => [s.id, cleanSegment(mapSegment(s, m.map, m.flip, m.uniform))] as const));
  if ([...moved.values()].some((s) => !insideRectOfDraft(draft, s))) return { ok: false, reason: "outside" };
  return { ok: true, draft: { ...draft, segments: draft.segments.map((s) => moved.get(s.id) ?? s) }, ids: [...ids] };
}
