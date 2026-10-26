import { describe, expect, it } from "vitest";
import {
  grades,
  hexToOklab,
  hexToRgb,
  hslToRgb,
  hsvToRgb,
  insertInRamp,
  isGrey,
  parseHex,
  rgbDistance,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  shadesAndTints,
  sortColors,
  tones,
} from "../../src/core/color/color";
import { addColors } from "../../src/core/project/images";
import { sortColorsAuto } from "../../src/core/project/commands";
import { projectWith } from "./project-helpers";
import { emptyNotecard } from "../../src/core/project/model";
import { rng } from "./project-helpers";

const randomHex = (r: () => number) => rgbToHex({ r: Math.floor(r() * 256), g: Math.floor(r() * 256), b: Math.floor(r() * 256) });

describe("conversions", () => {
  it("hexadécimal : saisies courtes, majuscules, sans dièse ; refus du reste", () => {
    expect(parseHex("#ABC")).toBe("#aabbcc");
    expect(parseHex("c62828")).toBe("#c62828");
    expect(parseHex(" #C62828 ")).toBe("#c62828");
    expect(parseHex("#12345")).toBeNull();
    expect(parseHex("rouge")).toBeNull();
  });

  it("RVB ↔ TSV et RVB ↔ TSL : aller-retour exact sur 500 couleurs", () => {
    const r = rng(7);
    for (let i = 0; i < 500; i++) {
      const hex = randomHex(r);
      expect(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(hex))))).toBe(hex);
      expect(rgbToHex(hslToRgb(rgbToHsl(hexToRgb(hex))))).toBe(hex);
    }
  });

  it("valeurs connues", () => {
    expect(rgbToHsv(hexToRgb("#ff0000"))).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHsl(hexToRgb("#00ff00")).h).toBe(120);
    expect(hexToOklab("#ffffff").L).toBeCloseTo(1, 4);
    expect(hexToOklab("#000000").L).toBeCloseTo(0, 6);
    expect(rgbDistance("#000000", "#ffffff")).toBeCloseTo(441.67, 2);
  });
});

describe("gammes (OKLab)", () => {
  it("8 pas de dégradé : les deux couleurs exactes aux extrémités, luminosité OKLab monotone", () => {
    const ramp = grades("#14284b", "#f6b26b", 8);
    expect(ramp).toHaveLength(8);
    expect(ramp[0]).toBe("#14284b");
    expect(ramp[7]).toBe("#f6b26b");
    const L = ramp.map((c) => hexToOklab(c).L);
    for (let i = 1; i < L.length; i++) expect(L[i] as number).toBeGreaterThan(L[i - 1] as number);
  });

  it("dégradés de 4 à 16 couleurs, refus en dehors", () => {
    expect(grades("#000000", "#ffffff", 4)).toHaveLength(4);
    expect(grades("#000000", "#ffffff", 16)).toHaveLength(16);
    expect(() => grades("#000000", "#ffffff", 3)).toThrow();
    expect(() => grades("#000000", "#ffffff", 17)).toThrow();
  });

  it("nuances & teintes : du plus foncé au plus clair, de la même teinte", () => {
    const ramp = shadesAndTints("#1e66c8");
    const L = ramp.map((c) => hexToOklab(c).L);
    for (let i = 1; i < L.length; i++) expect(L[i] as number).toBeGreaterThan(L[i - 1] as number);
    const hue = (c: string) => rgbToHsl(hexToRgb(c)).h;
    for (const c of ramp.slice(1, -1)) expect(Math.abs(hue(c) - hue("#1e66c8"))).toBeLessThan(25);
  });

  it("tons : la couleur de plus en plus grise, à luminosité presque égale", () => {
    const ramp = tones("#c62828");
    expect(ramp[0]).toBe("#c62828");
    const sat = ramp.map((c) => rgbToHsl(hexToRgb(c)).s);
    for (let i = 1; i < sat.length; i++) expect(sat[i] as number).toBeLessThanOrEqual((sat[i - 1] as number) + 1e-9);
    expect(isGrey(ramp.at(-1) as string)).toBe(true);
    for (const c of ramp) expect(Math.abs(hexToOklab(c).L - hexToOklab("#c62828").L)).toBeLessThan(0.02);
  });

  it("Insérer ajoute une couleur intermédiaire avant la sélection, sans dépasser 16", () => {
    const ramp = grades("#000000", "#ffffff", 4);
    const more = insertInRamp(ramp, 1);
    expect(more).toHaveLength(5);
    expect(hexToOklab(more[1] as string).L).toBeGreaterThan(hexToOklab(more[0] as string).L);
    expect(hexToOklab(more[1] as string).L).toBeLessThan(hexToOklab(more[2] as string).L);
    expect(insertInRamp(grades("#000000", "#ffffff", 16), 3)).toHaveLength(16);
  });
});

describe("tri automatique des couleurs", () => {
  const colors = ["#808080", "#0000ff", "#ff0000", "#ffffff", "#00ff00", "#000000", "#ffff00"];

  it("par teinte croissante, les gris à part en fin (du plus clair au plus foncé)", () => {
    expect(sortColors(colors, (c) => c, "hue", "asc")).toEqual(["#ff0000", "#ffff00", "#00ff00", "#0000ff", "#ffffff", "#808080", "#000000"]);
  });

  it("par luminosité décroissante ; le tri est stable", () => {
    const sorted = sortColors(colors, (c) => c, "lightness", "desc");
    expect(sorted.slice(0, 4)).toEqual(["#ffff00", "#00ff00", "#ff0000", "#0000ff"]);
    expect(sortColors(["#ff0000", "#ff0000"], (c) => c, "hue", "asc")).toEqual(["#ff0000", "#ff0000"]);
  });

  it("dans le projet : la palette est réordonnée, rien n'est perdu", () => {
    const project = projectWith({ colors: colors.map((rgb, i) => ({ id: `c${i}`, card: emptyNotecard(""), rgb })) });
    const sorted = sortColorsAuto(project, "saturation", "asc");
    expect(sorted.sketchbook.colors.map((c) => c.id).sort()).toEqual(project.sketchbook.colors.map((c) => c.id).sort());
    expect(sorted.sketchbook.colors.at(-1)?.rgb).toBe("#000000");
  });

  it("ajouter une gamme au carnet la met à la fin et ignore les doublons exacts", () => {
    const project = projectWith({ colors: [{ id: "x", card: emptyNotecard(""), rgb: "#000000" }] });
    const r = addColors(project, grades("#000000", "#ffffff", 4));
    expect(r.added).toHaveLength(3);
    expect(r.duplicates).toBe(1);
    expect(r.project.sketchbook.colors.map((c) => c.rgb)).toEqual(["#000000", ...grades("#000000", "#ffffff", 4).slice(1)]);
  });
});
