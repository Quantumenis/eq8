// Mesure des textes pour la mise en page des impressions. Les métriques d'Helvetica (fournies par pdf-lib) sont
// celles d'Arial, la police par défaut : la mise en page calculée ici tombe juste dans le PDF comme à l'écran.

import { StandardFontEmbedder, StandardFonts } from "pdf-lib";

type Embedder = ReturnType<typeof StandardFontEmbedder.for>;
let regular: Embedder | null = null;
let bold: Embedder | null = null;

/** Largeur d'un texte, en points, pour une taille en points. */
export function measureText(text: string, size: number, isBold = false): number {
  const font = isBold ? (bold ??= StandardFontEmbedder.for(StandardFonts.HelveticaBold as never)) : (regular ??= StandardFontEmbedder.for(StandardFonts.Helvetica as never));
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    let w = 0;
    for (const ch of text) {
      try {
        w += font.widthOfTextAtSize(ch, size);
      } catch {
        w += size * 0.556;
      }
    }
    return w;
  }
}

/** Largeur en pouces. */
export const textWidth = (text: string, size: number, isBold = false): number => measureText(text, size, isBold) / 72;
