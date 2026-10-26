// Textes imprimés sur les pages (en français, comme l'interface).

import type { RotaryShape } from "./shapes";

export const PRINT_TEXT = {
  cutCount: (n: number) => `Couper ${n}`,
  mirrored: (letter: string) => `(${letter} inversée)`,
  tiles: {
    tile: (row: number, col: number) => `L${row}-C${col}`,
    plan: "Plan d'assemblage",
    planHint: "Assemblez les pages en superposant les bandes de 0,5 po le long des traits pointillés.",
  },
  untitled: "Sans nom",
  blockOfPlan: "Bloc du plan",
  rotary: {
    title: (name: string) => `Découpe rotative — ${name}`,
    settings: (seam: string, rounding: string) => `Marge ${seam} · arrondi ${rounding}`,
    rounding: { "1/8": "au 1/8 po", "1/16": "au 1/16 po", none: "aucun (au millième)", mm: "au millimètre" },
    instruction: {
      square: (strip: string) => `Couper une bande de ${strip}, puis des carrés de ${strip}.`,
      rectangle: (strip: string, cut: string) => `Couper une bande de ${strip}, puis des rectangles de ${strip} × ${cut}.`,
      hst: (strip: string) => `Couper une bande de ${strip}, puis des carrés de ${strip}. Couper chaque carré sur une diagonale (2 triangles).`,
      qst: (strip: string) => `Couper une bande de ${strip}, puis des carrés de ${strip}. Couper chaque carré sur les deux diagonales (4 triangles).`,
      parallelogram45: (strip: string, cut: string) => `Couper une bande de ${strip}, puis recouper à 45° tous les ${cut}.`,
      diamond45: (strip: string, cut: string) => `Couper une bande de ${strip}, puis recouper à 45° tous les ${cut}.`,
      diamond60: (strip: string, cut: string) => `Couper une bande de ${strip}, puis recouper à 60° tous les ${cut}.`,
      equilateral: (strip: string, cut: string) => `Couper une bande de ${strip}, puis des triangles à 60° de base ${cut} (en alternant).`,
      trapezoid45: (strip: string, cut: string) => `Couper une bande de ${strip}, puis des trapèzes à 45° de grande base ${cut} (en alternant).`,
    } satisfies Record<RotaryShape, (strip: string, cut: string) => string>,
    pieces: (n: number) => (n > 1 ? `${n} pièces` : `${n} pièce`),
    cuts: (n: number, what: string) => `(${n} ${what})`,
    squares: (n: number) => (n > 1 ? "carrés" : "carré"),
    missing: (letters: string) => `Pièces non découpables au cutter (imprimez leurs gabarits) : ${letters}.`,
    none: "Aucune pièce de ce bloc ne se découpe au cutter : imprimez les gabarits.",
    hint: "Vérifiez vos mesures sur les gabarits avant de couper. Arrondi conseillé : 1/16 po.",
  },
  yardage: {
    title: (name: string) => `Métrage — ${name}`,
    settings: (laize: string, seam: string) => `Laize ${laize} · marge ${seam}`,
    fatQuarters: (size: string) => `Coupons uniquement (${size})`,
    header: ["", "Tissu ou couleur", "Pièces", "Métrage"],
    fq: (n: number) => (n > 1 ? `${n} coupons` : `${n} coupon`),
    notes: "Estimation par rangées (surestimée) ; les bordures longues sont raboutées. Le dos et le biais ne sont pas compris.",
    empty: "Aucune pièce colorée : colorez le quilt pour obtenir un métrage.",
  },
  quilt: {
    size: (s: string) => `Taille finie : ${s}`,
  },
};
