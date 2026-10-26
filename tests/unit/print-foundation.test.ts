import { describe, expect, it } from "vitest";
import { LIBRARY_BLOCKS, instantiateLibraryBlock } from "../../src/core/library/blocks";
import { DEFAULT_FONTS } from "../../src/core/print/display";
import { autoSections, checkSections, foundationPages, pieceNumbers, sewingOrder } from "../../src/core/print/foundation";
import { blockSource } from "../../src/core/print/source";
import { emptyProject } from "../../src/core/project/model";

function lib(id: string) {
  const def = LIBRARY_BLOCKS.find((d) => d.id === id);
  if (!def) throw new Error(id);
  const block = instantiateLibraryBlock(def);
  return blockSource(block, block.colorings[1] ?? null, { width: block.width, height: block.height }, false, def.name);
}

const ctx = {
  project: emptyProject(),
  projectName: "Essai",
  fonts: DEFAULT_FONTS,
  setup: { paper: "letter" as const, orientation: "portrait" as const, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5 } },
  unit: "in" as const,
  minLine: 0.75,
};

describe("Fondation : sections et numérotation (Q-9.5)", () => {
  it("Flying Geese : une seule section, l'oie d'abord puis les deux ciels", () => {
    const block = lib("flying-geese");
    const r = autoSections(block);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sections).toHaveLength(1);
    const first = block.pieces.find((p) => p.key === r.sections[0]?.order[0]);
    // La pièce 1 est la plus grande (l'oie).
    expect(first?.area).toBeCloseTo(Math.max(...block.pieces.map((p) => p.area)), 9);
    expect([...pieceNumbers(r.sections).values()].sort()).toEqual(["A1", "A2", "A3"]);
  });

  it("Ohio Star : découpé en sections qui se cousent toutes, chaque pièce numérotée une fois", () => {
    const block = lib("ohio-star");
    const r = autoSections(block);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sections.length).toBeGreaterThan(1);
    expect(checkSections(block, r.sections)).toEqual([]);
    const all = r.sections.flatMap((s) => s.order);
    expect(new Set(all).size).toBe(block.pieces.length);
    expect(all).toHaveLength(block.pieces.length);
  });

  it("Nine Patch se coud en bandes ; un quart de carré seul ne se coud pas d'un tenant", () => {
    const nine = lib("nine-patch");
    const r = autoSections(nine);
    expect(r.ok && r.sections.length).toBe(3);
    const hourglass = lib("hourglass");
    expect(sewingOrder(hourglass.pieces.slice(0, 4))).toBeNull();
  });

  it("un bloc courbe passe en mode manuel", () => {
    expect(autoSections(lib("drunkards-path"))).toEqual({ ok: false, reason: "curved" });
  });

  it("les pages : une section par gabarit, marge autour de chaque section", () => {
    const block = lib("ohio-star");
    const r = autoSections(block);
    if (!r.ok) throw new Error("sections");
    const doc = foundationPages(block, r.sections, ctx, { style: "color", seam: 0.25, numbering: true, separate: true, printName: true, fillPage: false, lineWidth: 1 });
    expect(doc.placed).toHaveLength(r.sections.length);
    expect(doc.pages.length).toBeGreaterThanOrEqual(1);
  });
});
