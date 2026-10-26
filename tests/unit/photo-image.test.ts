import { describe, expect, it } from "vitest";
import { hexToRgb, rgbToHsl } from "../../src/core/color/color";
import {
  applyColorway,
  applyHueMap,
  applyPreset,
  brightnessContrast,
  channelMixer,
  colorAccent,
  colorBalance,
  colorize,
  cumulative,
  dominantColors,
  emptyHueMap,
  equalize,
  histogram,
  randomPalette,
  readyPalette,
  shiftAssignment,
  shiftHsl,
  shiftRgb,
} from "../../src/core/image/adjust";
import { createRaster, pixelAt, type Raster } from "../../src/core/image/raster";
import { fitPlacement, photoPatchColors, photoPatchFills } from "../../src/core/quilt/photopatch";
import { buildLayout, defaultLayout } from "../../src/core/quilt/layout";

const solid = (w: number, h: number, c: { r: number; g: number; b: number }): Raster => createRaster(w, h, c);
function gradient(w = 256, h = 4): Raster {
  const r = createRaster(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255);
      r.data.set([v, v, v, 255], (y * w + x) * 4);
    }
  return r;
}
const rect = (x: number, y: number, s: number) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];

describe("Photo Patchwork (SPEC §2.11)", () => {
  it("une image unie rouge donne des pièces toutes (255, 0, 0)", () => {
    const img = solid(40, 40, { r: 255, g: 0, b: 0 });
    const params = { ...defaultLayout("onepatch"), nh: 4, nv: 4 } as never;
    const layout = buildLayout(params);
    const pieces = layout.slots.filter((s) => s.role === "piece").map((s) => ({ key: s.key, poly: s.poly }));
    expect(pieces).toHaveLength(16);
    const colors = photoPatchColors(img, fitPlacement("distort", 40, 40, layout.width, layout.height), pieces);
    expect(Object.values(colors).every((c) => c === "#ff0000")).toBe(true);
    expect(Object.keys(photoPatchFills(colors))).toHaveLength(16);
  });

  it("moitié rouge, moitié bleue sur 2 × 1 pièces : une pièce de chaque couleur", () => {
    const img = solid(20, 10, { r: 255, g: 0, b: 0 });
    for (let y = 0; y < 10; y++) for (let x = 10; x < 20; x++) img.data.set([0, 0, 255, 255], (y * 20 + x) * 4);
    const pieces = [
      { key: "a", poly: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }] },
      { key: "b", poly: [{ x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }] },
    ];
    const c = photoPatchColors(img, fitPlacement("distort", 20, 10, 4, 2), pieces);
    expect(c).toEqual({ a: "#ff0000", b: "#0000ff" });
  });

  it("Inside, Outside et Distort Fit donnent les rectangles attendus", () => {
    expect(fitPlacement("inside", 4, 3, 10, 10)).toEqual({ x0: 0, y0: 1.25, x1: 10, y1: 8.75 });
    const out = fitPlacement("outside", 4, 3, 10, 10);
    expect(out.y0).toBe(0);
    expect(out.y1).toBe(10);
    expect(out.x1 - out.x0).toBeCloseTo(13.3333, 3);
    expect(out.x0).toBeCloseTo(-1.6667, 3);
    expect(fitPlacement("distort", 4, 3, 10, 10)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 10 });
  });

  it("Inside Fit laisse des pièces sans couleur ; le masque cache ce qui dépasse", () => {
    const img = solid(40, 30, { r: 10, g: 200, b: 10 });
    const placement = fitPlacement("inside", 40, 30, 8, 8); // y de 1 à 7
    const pieces = [{ key: "haut", poly: rect(0, 0, 0.5) }, { key: "milieu", poly: rect(3, 3, 1) }];
    const c = photoPatchColors(img, placement, pieces);
    expect(c["haut"]).toBeNull();
    expect(c["milieu"]).toBe("#0ac80a");
    const masked = photoPatchColors(img, placement, pieces, { x0: 4, y0: 0, x1: 8, y1: 8 });
    expect(masked["milieu"]).toBeNull();
  });
});

describe("couleurs de l'image (SPEC §7.8)", () => {
  it("la carte des teintes qui décale le secteur 0-30° vers 210° change (255, 0, 0) en une teinte de 210 ± 2°", () => {
    const map = emptyHueMap();
    map.targets[0] = 210;
    const out = applyHueMap(solid(2, 2, { r: 255, g: 0, b: 0 }), map);
    const [r, g, b] = pixelAt(out, 0, 0);
    expect(Math.abs(rgbToHsl({ r, g, b }).h - 210)).toBeLessThanOrEqual(2);
    expect(pixelAt(applyHueMap(solid(1, 1, { r: 0, g: 255, b: 0 }), map), 0, 0).slice(0, 3)).toEqual([0, 255, 0]);
  });

  it("décalages RVB, TSL, mélangeur, coloriser, accent", () => {
    const grey = solid(2, 2, { r: 100, g: 100, b: 100 });
    expect(pixelAt(shiftRgb(grey, 20, 0, -20), 0, 0).slice(0, 3)).toEqual([120, 100, 80]);
    expect(pixelAt(shiftHsl(grey, 0, 0, 0), 0, 0).slice(0, 3)).toEqual([100, 100, 100]);
    expect(pixelAt(shiftHsl(grey, 0, 0, 20), 0, 0)[0]).toBeGreaterThan(140);
    const swap = pixelAt(channelMixer(solid(1, 1, { r: 255, g: 10, b: 0 }), [[0, 1, 0], [1, 0, 0], [0, 0, 1]]), 0, 0);
    expect(swap.slice(0, 3)).toEqual([10, 255, 0]);
    const sepia = pixelAt(colorize(solid(1, 1, { r: 120, g: 120, b: 120 }), "#a0522d", 1), 0, 0);
    expect(sepia[0]).toBeGreaterThan(sepia[2]);
    const accent = colorAccent(solid(2, 1, { r: 255, g: 0, b: 0 }), 100, 140);
    expect(pixelAt(accent, 0, 0)[0]).toBe(pixelAt(accent, 0, 0)[1]); // le rouge est hors de la plage : il devient gris
  });

  it("équilibre automatique : les sombres s'assombrissent, les clairs s'éclaircissent", () => {
    const big = createRaster(100, 1);
    for (let x = 0; x < 100; x++) big.data.set([60 + x, 60 + x, 60 + x, 255], x * 4);
    const out = colorBalance(big);
    expect(pixelAt(out, 0, 0)[0]).toBeLessThan(60);
    expect(pixelAt(out, 99, 0)[0]).toBeGreaterThan(159);
  });

  it("gamme de couleurs : 2 couleurs dominantes retrouvées puis remplacées", () => {
    const img = solid(20, 10, { r: 220, g: 30, b: 30 });
    for (let y = 0; y < 10; y++) for (let x = 10; x < 20; x++) img.data.set([30, 30, 220, 255], (y * 20 + x) * 4);
    const found = dominantColors(img, 2);
    expect(found).toHaveLength(2);
    const out = applyColorway(img, found, ["#00aa00", "#ffaa00"]);
    const colors = new Set([pixelAt(out, 0, 0).slice(0, 3).join(), pixelAt(out, 19, 0).slice(0, 3).join()]);
    expect(colors.size).toBe(2);
    expect(readyPalette(0, 0.6, 0.5)).toHaveLength(12);
    expect(randomPalette(7)).toEqual(randomPalette(7));
    expect(shiftAssignment([1, 2, 3], 1)).toEqual([2, 3, 1]);
    expect(hexToRgb(randomPalette(3)[0] as string)).toBeDefined();
  });
});

describe("histogramme, égalisation, luminosité (SPEC §7.9)", () => {
  it("l'égalisation en niveaux de gris donne un histogramme cumulé quasi linéaire (écart < 2 %)", () => {
    const full = equalize(gradient(), "gray");
    const cdf = cumulative(histogram(full).l);
    for (let i = 0; i < 256; i++) expect(Math.abs((cdf[i] as number) - i / 255)).toBeLessThan(0.02);
    expect(histogram(equalize(gradient(), "yuv")).count).toBe(1024);
    expect(equalize(gradient(), "rgb").width).toBe(256);
  });

  it("luminosité et contraste de −100 à 100 : 0 = inchangé", () => {
    const g = solid(2, 2, { r: 100, g: 150, b: 200 });
    expect(pixelAt(brightnessContrast(g, 0, 0), 0, 0).slice(0, 3)).toEqual([100, 150, 200]);
    expect(pixelAt(brightnessContrast(g, 50, 0), 0, 0)[0]).toBeGreaterThan(200);
    expect(pixelAt(brightnessContrast(g, 0, 60), 0, 0)[0]).toBeLessThan(100);
    expect(pixelAt(brightnessContrast(g, 0, 60), 0, 0)[2]).toBeGreaterThan(200);
    for (const p of ["glow", "lighten", "warm", "pastel"] as const) expect(applyPreset(g, p).width).toBe(2);
    expect(pixelAt(applyPreset(g, "lighten"), 0, 0)[0]).toBeGreaterThan(100);
  });
});
