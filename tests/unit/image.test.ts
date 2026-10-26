import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { DEFAULT_PPI, readImageInfo, realSize } from "../../src/core/image/info";
import {
  CROP_PRESETS,
  crop,
  flip,
  ppiForMeasure,
  ppiForWidth,
  presetRect,
  resize,
  rotate,
  rotateQuarter,
  shear,
  straightenAngle,
} from "../../src/core/image/ops";
import { decodePng, encodePng, readPngHeader } from "../../src/core/image/png";
import { averageColor, createRaster, pixelAt, type Raster } from "../../src/core/image/raster";
import { ImageEditor } from "../../src/core/image/editor";

function gradientRaster(w: number, h: number): Raster {
  const r = createRaster(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      r.data[o] = (x * 37) % 256;
      r.data[o + 1] = (y * 53) % 256;
      r.data[o + 2] = (x * y) % 256;
      r.data[o + 3] = 255;
    }
  }
  return r;
}

/** Un JPEG minimal (en-têtes seulement) : JFIF avec une densité, puis SOF0 avec la taille. */
function fakeJpeg(width: number, height: number, density: number, units: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, units, density >> 8, density & 255, density >> 8, density & 255, 0, 0];
  const sof = [0xff, 0xc0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9]);
}

describe("échelle réelle (SPEC §7.1, §7.4)", () => {
  it("une image de 300 × 150 px à 75 ppp mesure 4 × 2 po ; réglée à 6 po de large, elle est à 50 ppp", () => {
    expect(realSize(300, 150, 75)).toEqual({ width: 4, height: 2 });
    const ppi = ppiForWidth(300, 6);
    expect(ppi).toBe(50);
    expect(realSize(300, 150, ppi)).toEqual({ width: 6, height: 3 });
  });

  it("mesurer une zone : un segment de 120 px qui mesure 2 po donne 60 ppp", () => {
    expect(ppiForMeasure(120, 2)).toBe(60);
    expect(() => ppiForMeasure(120, 0)).toThrow();
  });

  it("lit la résolution d'un PNG (pHYs) et d'un JPEG (JFIF) ; 75 ppp à défaut", () => {
    const png = encodePng(createRaster(300, 150, { r: 0, g: 0, b: 0 }), 96);
    expect(readImageInfo(png)).toMatchObject({ mime: "image/png", width: 300, height: 150, ppi: 96 });
    const bare = encodePng(createRaster(10, 10, { r: 0, g: 0, b: 0 }));
    expect(readImageInfo(bare)).toMatchObject({ declaredPpi: null, ppi: DEFAULT_PPI });
    expect(readImageInfo(fakeJpeg(640, 480, 150, 1))).toMatchObject({ mime: "image/jpeg", width: 640, height: 480, ppi: 150 });
    expect(readImageInfo(fakeJpeg(640, 480, 59, 2)).ppi).toBeCloseTo(149.86, 2); // 59 points par cm
    expect(readImageInfo(fakeJpeg(64, 48, 1, 0)).ppi).toBe(DEFAULT_PPI); // simple rapport d'aspect
  });

  it("refuse un fichier qui n'est ni un JPG ni un PNG", () => {
    expect(() => readImageInfo(zipSync({ "a.txt": strToU8("x") }))).toThrow();
  });
});

describe("PNG", () => {
  it("aller-retour exact (avec transparence) et résolution conservée", () => {
    const r = gradientRaster(37, 23);
    r.data[3] = 0;
    const bytes = encodePng(r, 120);
    expect(readPngHeader(bytes)).toEqual({ width: 37, height: 23, ppi: 120 });
    expect(decodePng(bytes).data).toEqual(r.data);
  });

  it("l'encodage est déterministe", () => {
    const r = gradientRaster(16, 16);
    expect(encodePng(r, 75)).toEqual(encodePng(r, 75));
  });
});

describe("retouches (SPEC §7.5-7.6)", () => {
  it("redresser : une ligne tracée à 3° donne une rotation de −3° ; vers la verticale aussi", () => {
    const t = (3 * Math.PI) / 180;
    // La ligne monte de 3° vers la droite (y vers le bas à l'écran).
    expect(straightenAngle({ x: 0, y: 100 }, { x: 100 * Math.cos(t), y: 100 - 100 * Math.sin(t) })).toBeCloseTo(-3, 9);
    expect(straightenAngle({ x: 0, y: 0 }, { x: 100 * Math.cos(t), y: 100 * Math.sin(t) })).toBeCloseTo(3, 9);
    const t88 = (88 * Math.PI) / 180;
    expect(straightenAngle({ x: 0, y: 0 }, { x: 100 * Math.cos(t88), y: -100 * Math.sin(t88) })).toBeCloseTo(2, 9);
    expect(straightenAngle({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it("recadrer, retourner et quart de tour sont exacts", () => {
    const r = gradientRaster(5, 3);
    const c = crop(r, { x: 1, y: 1, width: 3, height: 2 });
    expect([c.width, c.height]).toEqual([3, 2]);
    expect(pixelAt(c, 0, 0)).toEqual(pixelAt(r, 1, 1));
    expect(pixelAt(flip(r, "horizontal"), 0, 0)).toEqual(pixelAt(r, 4, 0));
    expect(pixelAt(flip(r, "vertical"), 0, 0)).toEqual(pixelAt(r, 0, 2));
    const ccw = rotateQuarter(r, 90);
    expect([ccw.width, ccw.height]).toEqual([3, 5]);
    expect(pixelAt(ccw, 0, 0)).toEqual(pixelAt(r, 4, 0)); // le coin haut-droit passe en haut à gauche
    expect(rotateQuarter(rotateQuarter(r, 90), -90).data).toEqual(r.data);
    expect(rotate(r, -90).data).toEqual(rotateQuarter(r, -90).data);
  });

  it("rotation libre : la toile grandit pour montrer les coins, ou garde sa taille si l'on recadre", () => {
    const r = createRaster(100, 50, { r: 200, g: 0, b: 0 });
    const turned = rotate(r, 30, { r: 255, g: 255, b: 255 });
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    expect(turned.width).toBe(Math.round(100 * c + 50 * s));
    expect(turned.height).toBe(Math.round(100 * s + 50 * c));
    expect(pixelAt(turned, 0, 0).slice(0, 3)).toEqual([255, 255, 255]); // fond dans les coins
    expect(pixelAt(turned, turned.width >> 1, turned.height >> 1).slice(0, 3)).toEqual([200, 0, 0]);
    const kept = rotate(r, 30, { r: 255, g: 255, b: 255 }, true);
    expect([kept.width, kept.height]).toEqual([100, 50]);
  });

  it("incliner : la toile s'élargit de la hauteur × tan(angle)", () => {
    const r = createRaster(40, 20, { r: 0, g: 0, b: 0 });
    expect(shear(r, 45, 0).width).toBe(60);
    expect(shear(r, 0, 0).width).toBe(40);
    expect(() => shear(r, 50, 0)).toThrow();
  });

  it("redimensionner : la moyenne des pixels est conservée en réduction", () => {
    const r = gradientRaster(64, 32);
    const small = resize(r, 16, 8, "normal");
    expect([small.width, small.height]).toEqual([16, 8]);
    const a = averageColor(r).mean;
    const b = averageColor(small).mean;
    expect(Math.abs(a.r - b.r)).toBeLessThan(1.5);
    expect(resize(r, 128, 64, "bicubic").width).toBe(128);
  });

  it("préréglages de recadrage (Q-7.4) : un cadre trop grand est refusé", () => {
    const fourBySix = CROP_PRESETS.find((p) => p.id === "in-4x6");
    if (!fourBySix) throw new Error("4 × 6");
    expect(presetRect(fourBySix, 50, 300, 400)).toEqual({ x: 50, y: 50, width: 200, height: 300 });
    expect(presetRect(fourBySix, 100, 300, 400)).toBeNull();
    expect(CROP_PRESETS.map((p) => p.label)).toContain("10 × 15 cm");
  });
});

describe("session du plan Image", () => {
  it("annuler et rétablir les retouches ; l'historique est borné", () => {
    const editor = new ImageEditor();
    editor.load({ raster: createRaster(4, 4, { r: 0, g: 0, b: 0 }), ppi: 75, name: "test" });
    expect(editor.modified).toBe(false);
    editor.execute("Échelle", (d) => ({ ...d, ppi: 50 }));
    expect(editor.doc?.ppi).toBe(50);
    expect(editor.modified).toBe(true);
    editor.undo();
    expect(editor.doc?.ppi).toBe(75);
    editor.redo();
    expect(editor.doc?.ppi).toBe(50);
    for (let i = 0; i < 40; i++) editor.execute("Échelle", (d) => ({ ...d, ppi: d.ppi + 1 }));
    let undone = 0;
    while (editor.undo()) undone += 1;
    expect(undone).toBe(30);
  });
});
