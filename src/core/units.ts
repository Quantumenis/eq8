// Unités : le modèle travaille toujours en pouces (float64). Le centimètre n'est qu'affichage et saisie,
// le point PDF (1/72 po) n'est que sortie.

export type DisplayUnit = "in" | "cm";

export const CM_PER_INCH = 2.54;
export const POINTS_PER_INCH = 72;

export function inchesToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

export function cmToInches(cm: number): number {
  return cm / CM_PER_INCH;
}

export function inchesToPoints(inches: number): number {
  return inches * POINTS_PER_INCH;
}

/** Convertit une valeur saisie dans l'unité d'affichage vers les pouces internes. */
export function toInches(value: number, unit: DisplayUnit): number {
  return unit === "in" ? value : cmToInches(value);
}

/** Convertit une valeur interne (pouces) vers l'unité d'affichage. */
export function fromInches(inches: number, unit: DisplayUnit): number {
  return unit === "in" ? inches : inchesToCm(inches);
}

/** Longueur lisible en français : « 6 po », « 15,24 cm » (virgule décimale, zéros inutiles supprimés). */
export function formatLength(inches: number, unit: DisplayUnit, maxDecimals = 2): string {
  const value = fromInches(inches, unit);
  let text = value.toFixed(maxDecimals);
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  if (text === "-0") text = "0";
  return `${text.replace(".", ",")} ${unit === "in" ? "po" : "cm"}`;
}
