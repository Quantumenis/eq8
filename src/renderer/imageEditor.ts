import { useSyncExternalStore } from "react";
import { ImageEditor } from "../core/image/editor";
import { readImageInfo, type ImageMime } from "../core/image/info";
import { MAX_PIXELS, type Raster } from "../core/image/raster";

/** L'éditeur unique du plan Image (une image à la fois, avec son propre historique). */
export const imageEditor = new ImageEditor();

export function useImageEditor(): ImageEditor {
  useSyncExternalStore(imageEditor.subscribe, imageEditor.getVersion);
  return imageEditor;
}

/** Octets d'origine de l'image posée sur le plan, tant qu'elle n'a pas été retouchée (on les garde tels quels). */
export let originalImage: { bytes: Uint8Array; mime: ImageMime } | null = null;

export function setOriginalImage(value: { bytes: Uint8Array; mime: ImageMime } | null): void {
  originalImage = value;
}

/** Décode un JPG ou un PNG avec le navigateur, sans gestion de couleur ni prémultiplication (pixels bruts). */
export async function decodeImage(bytes: Uint8Array): Promise<{ raster: Raster; ppi: number; mime: ImageMime; declaredPpi: number | null }> {
  const info = readImageInfo(bytes);
  if (info.width * info.height > MAX_PIXELS) throw new Error("too-large");
  const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: info.mime }), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  bitmap.close();
  return { raster: { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(data) }, ppi: info.ppi, mime: info.mime, declaredPpi: info.declaredPpi };
}

const canvasCache = new WeakMap<Raster, HTMLCanvasElement>();

/** Un canvas qui contient l'image (créé une fois par image : les retouches produisent de nouvelles images). */
export function rasterCanvas(raster: Raster): HTMLCanvasElement {
  let canvas = canvasCache.get(raster);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = raster.width;
    canvas.height = raster.height;
    canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
    canvasCache.set(raster, canvas);
  }
  return canvas;
}
