import { describe, expect, it } from "vitest";
import { EndType, getBoundsPathsD, inflatePathsD, JoinType, type PathD } from "clipper2-ts";

// Test de fumée du choix de bibliothèque géométrique (M0) : la marge de couture est un décalage extérieur.
describe("clipper2-ts : décalage des marges de couture", () => {
  const square6: PathD = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 6 },
    { x: 0, y: 6 },
  ];

  it("un carré fini de 6 po + marge de ¼ po donne une ligne de coupe de 6½ po", () => {
    const cut = inflatePathsD([square6], 0.25, JoinType.Miter, EndType.Polygon, 2, 5);
    const b = getBoundsPathsD(cut);
    expect(b.right - b.left).toBeCloseTo(6.5, 5);
    expect(b.bottom - b.top).toBeCloseTo(6.5, 5);
  });

  it("un triangle demi-carré de 2 po + ¼ po se coupe dans un carré de 2,85355 po (p. 225)", () => {
    const hst: PathD = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
    ];
    // Onglets non écrêtés (limite haute) : la boîte englobante mesure le carré de coupe.
    const cut = inflatePathsD([hst], 0.25, JoinType.Miter, EndType.Polygon, 10, 6);
    const b = getBoundsPathsD(cut);
    expect(b.right - b.left).toBeCloseTo(2 + 0.25 * (2 + Math.SQRT2), 4);
  });
});
