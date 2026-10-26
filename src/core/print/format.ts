// Mise en forme des mesures imprimées : fractions de pouce (« 2 7/8 po »), centimètres au millimètre, et remplissages.

import type { Paint, Project } from "../project/model";
import { IDENTITY, type Mat } from "../quilt/geom";
import type { DisplayUnit } from "../units";
import type { Fill } from "./display";

/** Arrondi de la découpe rotative (SPEC §9.6) : au 1/8, au 1/16 ou aucun (en métrique, toujours au millimètre). */
export type Rounding = "1/8" | "1/16" | "none";

/** Arrondit une longueur (pouces) au plus proche, selon l'unité. Sans arrondi : au millième. */
export function roundCut(inches: number, rounding: Rounding, unit: DisplayUnit): number {
  if (unit === "cm") return Math.round(inches * 25.4) / 25.4;
  if (rounding === "none") return Math.round(inches * 1000) / 1000;
  const step = rounding === "1/8" ? 8 : 16;
  return Math.round(inches * step) / step;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** « 2 7/8 », « 1/2 », « 3 » ; une valeur qui n'est pas un multiple de 1/64 s'écrit en décimales (« 1,929 »). */
export function inchFraction(inches: number): string {
  const sixtyFourths = Math.round(inches * 64);
  if (Math.abs(sixtyFourths / 64 - inches) > 1e-9) return String(Math.round(inches * 1000) / 1000).replace(".", ",");
  const whole = Math.floor(sixtyFourths / 64);
  const rest = sixtyFourths - whole * 64;
  if (rest === 0) return String(whole);
  const g = gcd(rest, 64);
  const frac = `${rest / g}/${64 / g}`;
  return whole === 0 ? frac : `${whole} ${frac}`;
}

/** Une longueur de coupe lisible : « 2 7/8 po », « 1,929 po » sans arrondi, ou « 7,3 cm ». */
export function cutLength(inches: number, unit: DisplayUnit, rounding: Rounding = "1/8"): string {
  if (unit === "cm") {
    const cm = Math.round(inches * 25.4) / 10;
    return `${String(cm).replace(".", ",")} cm`;
  }
  if (rounding === "none") return `${String(Math.round(inches * 1000) / 1000).replace(".", ",")} po`;
  return `${inchFraction(inches)} po`;
}

/** Remplissage d'impression d'un habillage. `mat` place la tuile du tissu (repère du tissu → repère local). */
export function fillOf(project: Project, paint: Paint | undefined, mat: Mat = IDENTITY): Fill | undefined {
  if (!paint) return undefined;
  if (paint.kind === "solid") return { kind: "rgb", rgb: paint.rgb };
  const fabric = project.sketchbook.fabrics.find((f) => f.id === paint.fabricId);
  return { kind: "fabric", fabricId: paint.fabricId, rgb: fabric?.averageColor ?? "#9e9e9e", mat };
}

/** Couleur unie d'un habillage (couleur moyenne d'un tissu), ou `null`. */
export function solidOf(project: Project, paint: Paint | undefined): string | null {
  if (!paint) return null;
  if (paint.kind === "solid") return paint.rgb;
  return project.sketchbook.fabrics.find((f) => f.id === paint.fabricId)?.averageColor ?? "#9e9e9e";
}

/** Nom d'un habillage pour les comptes et le métrage : nom du tissu ou de la couleur (avec sa référence). */
export function paintName(project: Project, paint: Paint | undefined): { name: string; reference: string } {
  if (!paint) return { name: "Non coloré", reference: "" };
  if (paint.kind === "fabric") {
    const f = project.sketchbook.fabrics.find((x) => x.id === paint.fabricId);
    return { name: f?.card.name || "Tissu", reference: f?.card.reference ?? "" };
  }
  const c = project.sketchbook.colors.find((x) => x.rgb.toLowerCase() === paint.rgb.toLowerCase());
  return { name: c?.card.name || paint.rgb.toUpperCase(), reference: c?.card.reference ?? "" };
}
