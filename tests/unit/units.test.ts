import { describe, expect, it } from "vitest";
import { cmToInches, fromInches, inchesToCm, inchesToPoints, toInches } from "../../src/core/units";

describe("unités", () => {
  it("un carré de 6 po mesure 432 points PDF", () => {
    expect(inchesToPoints(6)).toBe(432);
  });

  it("10 cm mesurent 283,46 points PDF", () => {
    expect(inchesToPoints(cmToInches(10))).toBeCloseTo(283.4646, 4);
  });

  it("6 po = 15,24 cm", () => {
    expect(inchesToCm(6)).toBeCloseTo(15.24, 12);
  });

  it("l'aller-retour cm → po → cm ne dérive pas", () => {
    for (const cm of [0.1, 0.75, 2.54, 15, 110, 280]) {
      expect(Math.abs(fromInches(toInches(cm, "cm"), "cm") - cm)).toBeLessThan(1e-9);
    }
  });

  it("les pouces restent inchangés en affichage pouces", () => {
    expect(toInches(8.5, "in")).toBe(8.5);
    expect(fromInches(8.5, "in")).toBe(8.5);
  });
});
