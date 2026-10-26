// Sortie SVG de la liste d'affichage : export SVG (SPEC §10.3) et impression par le dialogue Windows (chaque page est
// un SVG en pouces dans une page HTML, imprimée sans mise à l'échelle). Les tissus deviennent des motifs <pattern>.

import { multiply, type Mat } from "../quilt/geom";
import { matScale, type Fill, type FontRole, type Item, type Page, type PathCmd, type PrintFonts } from "./display";

export interface SvgFabric {
  /** Adresse de la tuile (data: URL). */
  href: string;
  width: number;
  height: number;
}

export interface SvgOptions {
  fonts: PrintFonts;
  fabrics?: (fabricId: string) => SvgFabric | null | undefined;
  /** Préfixe des identifiants (plusieurs SVG dans une même page HTML). */
  idPrefix?: string;
}

const f = (v: number) => String(Math.round(v * 1e6) / 1e6);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function svgPathData(d: readonly PathCmd[]): string {
  let out = "";
  for (const c of d) {
    if (c.op === "M" || c.op === "L") out += `${c.op}${f(c.x)} ${f(c.y)}`;
    else if (c.op === "C") out += `C${f(c.x1)} ${f(c.y1)} ${f(c.x2)} ${f(c.y2)} ${f(c.x)} ${f(c.y)}`;
    else if (c.op === "A") {
      // Un arc d'un tour complet ne s'écrit pas en une commande SVG : on le coupe en deux.
      if (Math.abs(c.sweep) >= 2 * Math.PI - 1e-9) {
        const mid = c.start + c.sweep / 2;
        const mx = c.cx + c.r * Math.cos(mid);
        const my = c.cy + c.r * Math.sin(mid);
        const flag = c.sweep > 0 ? 1 : 0;
        out += `A${f(c.r)} ${f(c.r)} 0 0 ${flag} ${f(mx)} ${f(my)}A${f(c.r)} ${f(c.r)} 0 0 ${flag} ${f(c.x)} ${f(c.y)}`;
      } else out += `A${f(c.r)} ${f(c.r)} 0 ${Math.abs(c.sweep) > Math.PI ? 1 : 0} ${c.sweep > 0 ? 1 : 0} ${f(c.x)} ${f(c.y)}`;
    } else out += "Z";
  }
  return out;
}

const fontFamily = (family: string) => `${esc(family)}, Arial, Helvetica, sans-serif`;
const matText = (m: Mat) => `matrix(${m.map(f).join(" ")})`;

class SvgWriter {
  readonly defs: string[] = [];
  private n = 0;
  constructor(private readonly o: SvgOptions) {}

  private id(kind: string): string {
    this.n += 1;
    return `${this.o.idPrefix ?? "qs"}-${kind}${this.n}`;
  }

  private fill(fl: Fill | undefined): string {
    if (!fl) return ' fill="none"';
    if (fl.kind === "rgb") return ` fill="${fl.rgb}"`;
    const tile = this.o.fabrics?.(fl.fabricId);
    if (!tile) return ` fill="${fl.rgb}"`;
    const id = this.id("p");
    this.defs.push(
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(tile.width)}" height="${f(tile.height)}" patternTransform="${matText(fl.mat)}"><rect width="${f(tile.width)}" height="${f(tile.height)}" fill="${fl.rgb}"/><image href="${tile.href}" width="${f(tile.width)}" height="${f(tile.height)}" preserveAspectRatio="none"/></pattern>`,
    );
    return ` fill="url(#${id})"`;
  }

  items(list: readonly Item[], scale: number, fonts: PrintFonts): string {
    let out = "";
    for (const it of list) {
      if (it.kind === "group") {
        let clip = "";
        if (it.clip) {
          const id = this.id("c");
          this.defs.push(`<clipPath id="${id}"><path d="${svgPathData(it.clip)}"/></clipPath>`);
          clip = ` clip-path="url(#${id})"`;
        }
        // La découpe s'exprime dans le repère du groupe (transformation comprise), comme en PDF et sur le Canvas.
        out += `<g transform="${matText(it.mat)}"${clip}>${this.items(it.items, scale * matScale(it.mat), fonts)}</g>`;
      } else if (it.kind === "path") {
        let attrs = this.fill(it.fill);
        if (it.stroke) {
          const k = 1 / 72 / scale;
          attrs += ` stroke="${it.stroke.rgb}" stroke-width="${f(it.stroke.width * k)}" stroke-linejoin="${it.stroke.join === "miter" ? "miter" : "round"}" stroke-linecap="${it.stroke.join === "miter" ? "butt" : "round"}"`;
          if (it.stroke.dash && it.stroke.dash.length > 0) attrs += ` stroke-dasharray="${it.stroke.dash.map((v) => f(v * k)).join(" ")}"`;
        }
        out += `<path d="${svgPathData(it.d)}"${attrs}/>`;
      } else {
        const spec = fonts[it.role as FontRole];
        const size = (it.size ?? spec.size) / 72;
        const anchor = it.align === "center" ? "middle" : it.align === "right" ? "end" : "start";
        out += `<text x="${f(it.x)}" y="${f(it.y)}" font-family="${fontFamily(spec.family)}" font-size="${f(size)}" text-anchor="${anchor}" fill="${it.rgb ?? "#000000"}"${it.bold ? ' font-weight="bold"' : ""}>${esc(it.text)}</text>`;
      }
    }
    return out;
  }
}

/** Une page en SVG autonome, à sa taille réelle (en pouces). */
export function pageToSvg(page: Page, o: SvgOptions, base: Mat = [1, 0, 0, 1, 0, 0]): string {
  const w = new SvgWriter(o);
  const body = w.items([{ kind: "group", mat: multiply(base, [1, 0, 0, 1, 0, 0]), items: page.items }], 1, o.fonts);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(page.width)}in" height="${f(page.height)}in" viewBox="0 0 ${f(page.width)} ${f(page.height)}"><defs>${w.defs.join("")}</defs><rect width="${f(page.width)}" height="${f(page.height)}" fill="#ffffff"/>${body}</svg>`;
}

/** Une image (bloc ou quilt) en SVG, sans fond de page : `width` × `height` pouces. */
export function pictureToSvg(items: readonly Item[], width: number, height: number, o: SvgOptions, background: string | null = null): string {
  const w = new SvgWriter(o);
  const body = w.items(items, 1, o.fonts);
  const bg = background ? `<rect width="${f(width)}" height="${f(height)}" fill="${background}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f(width)}in" height="${f(height)}in" viewBox="0 0 ${f(width)} ${f(height)}"><defs>${w.defs.join("")}</defs>${bg}${body}</svg>\n`;
}

/** Document HTML d'impression : une page par SVG, format et marges nuls, sans mise à l'échelle. */
export function printHtml(pages: readonly Page[], o: SvgOptions, title: string): string {
  const first = pages[0];
  const size = first ? `${f(first.width)}in ${f(first.height)}in` : "auto";
  const body = pages.map((p, i) => `<div class="page">${pageToSvg(p, { ...o, idPrefix: `p${i}` })}</div>`).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:${size};margin:0}html,body{margin:0;padding:0;background:#fff}.page{page-break-after:always;break-after:page;width:${first ? f(first.width) : 0}in;height:${first ? f(first.height) : 0}in;overflow:hidden}.page:last-child{page-break-after:auto;break-after:auto}svg{display:block}</style></head><body>${body}</body></html>`;
}
