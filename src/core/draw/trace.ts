// L'image de décalque (SPEC §6.5) : une image posée sous le dessin pour la décalquer. Elle fait partie de la session
// de dessin, pas du bloc enregistré (on enregistre l'image et le dessin séparément pour décalquer en plusieurs séances).

import type { Rect } from "./geometry";

/** Position et taille par rapport au bloc : les trois ajustements du manuel, et deux positions en taille réelle. */
export const TRACE_FITS = ["inside", "outside", "distort", "center", "topLeft"] as const;
export type TraceFit = (typeof TRACE_FITS)[number];

export interface TraceImage {
  /** Image en URL de données (PNG, JPEG…), déjà recadrée si besoin. */
  src: string;
  /** Taille en pixels. */
  pxW: number;
  pxH: number;
  /** Pixels par pouce pour la taille réelle. */
  ppi: number;
  fit: TraceFit;
  /** Clarté de 0 (sombre) à 100 (très pâle) ; plus haut = plus clair. */
  clarity: number;
  visible: boolean;
}

export const DEFAULT_TRACE_PPI = 96;

/** Le rectangle (pouces, repère du bloc) qu'occupe l'image. */
export function tracePlacement(t: Pick<TraceImage, "pxW" | "pxH" | "ppi" | "fit">, width: number, height: number): Rect {
  const iw = t.pxW / t.ppi;
  const ih = t.pxH / t.ppi;
  switch (t.fit) {
    case "distort":
      return { x0: 0, y0: 0, x1: width, y1: height };
    case "inside":
    case "outside": {
      const k = t.fit === "inside" ? Math.min(width / iw, height / ih) : Math.max(width / iw, height / ih);
      const w = iw * k;
      const h = ih * k;
      return { x0: (width - w) / 2, y0: (height - h) / 2, x1: (width + w) / 2, y1: (height + h) / 2 };
    }
    case "center":
      return { x0: (width - iw) / 2, y0: (height - ih) / 2, x1: (width + iw) / 2, y1: (height + ih) / 2 };
    case "topLeft":
      return { x0: 0, y0: 0, x1: iw, y1: ih };
  }
}

/** Opacité de l'image : la clarté 0 est opaque, 100 presque transparente. */
export const traceOpacity = (clarity: number): number => Math.max(0.05, 1 - Math.max(0, Math.min(100, clarity)) / 100 * 0.95);
