// Sorties de l'impression dans l'interface : PDF (pdf-lib), impression par le dialogue de Windows (pages SVG) et
// dessin des pages sur un Canvas (aperçu). Toutes partent de la même liste d'affichage du cœur.

import { renderGenerated } from "../core/fabric/generator";
import { readImageInfo } from "../core/image/info";
import { encodePng } from "../core/image/png";
import { arcToBeziers, matScale, type FontRole, type Item, type Page, type PathCmd, type PrintDoc, type PrintFonts } from "../core/print/display";
import type { FabricTile } from "../core/print/pdf";
import { isPhotoFabricId } from "../core/print/photo";
import { printHtml, type SvgFabric } from "../core/print/svg";
import type { AssetStore } from "../core/project/assets";
import type { Project } from "../core/project/model";
import type { ExportKind, PrintOutcome, SaveResult } from "../shared/api";
import { fabricTiles } from "./fabricTiles";
import { getApi } from "./projectActions";

// ---------------------------------------------------------------------------------------------------------------
// Polices système (intégrées au PDF par sous-ensemble, Q-9.10)

const fontCache = new Map<string, Uint8Array | null>();

/** Charge les polices des cinq rôles (normale et grasse) ; renvoie un accès synchrone pour l'écriture du PDF. */
export async function loadFonts(fonts: PrintFonts): Promise<(family: string, bold: boolean) => Uint8Array | null> {
  const families = new Set(Object.values(fonts).map((f) => f.family));
  await Promise.all(
    [...families].flatMap((family) =>
      [false, true].map(async (bold) => {
        const key = `${family}|${bold}`;
        if (fontCache.has(key)) return;
        try {
          fontCache.set(key, await getApi().readSystemFont(family, bold));
        } catch {
          fontCache.set(key, null);
        }
      }),
    ),
  );
  return (family, bold) => fontCache.get(`${family}|${bold}`) ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Tuiles de tissu pour le PDF et le SVG

const tileCache = new Map<string, FabricTile>();

/** La tuile d'un tissu du carnet : PNG rendu par le générateur, ou les octets de l'image importée. */
export function fabricTileData(project: Project, assets: AssetStore, fabricId: string): FabricTile | null {
  if (isPhotoFabricId(fabricId)) {
    // Une photo du carnet : une seule tuile, à sa taille réelle.
    const photo = project.sketchbook.photos.find((p) => p.id === fabricId.slice(6));
    const bytes = photo ? assets.get(photo.asset) : undefined;
    if (!photo || !bytes) return null;
    try {
      const info = readImageInfo(bytes);
      return { bytes, mime: info.mime, width: info.width / photo.ppi, height: info.height / photo.ppi };
    } catch {
      return null;
    }
  }
  const fabric = project.sketchbook.fabrics.find((f) => f.id === fabricId);
  if (!fabric) return null;
  const key = JSON.stringify(fabric.source);
  const hit = tileCache.get(key);
  if (hit) return hit;
  let tile: FabricTile | null = null;
  if (fabric.source.kind === "generated") {
    const r = renderGenerated(fabric.source);
    tile = { bytes: encodePng(r.raster, r.ppi), mime: "image/png", width: r.width, height: r.height };
  } else {
    const bytes = assets.get(fabric.source.asset);
    if (bytes) {
      try {
        const info = readImageInfo(bytes);
        tile = { bytes, mime: info.mime, width: info.width / fabric.source.ppi, height: info.height / fabric.source.ppi };
      } catch {
        tile = null;
      }
    }
  }
  if (tile) tileCache.set(key, tile);
  return tile;
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const svgFabricCache = new WeakMap<FabricTile, SvgFabric>();
export function svgFabrics(project: Project, assets: AssetStore): (fabricId: string) => SvgFabric | null {
  return (id) => {
    const t = fabricTileData(project, assets, id);
    if (!t) return null;
    let s = svgFabricCache.get(t);
    if (!s) {
      s = { href: `data:${t.mime};base64,${base64(t.bytes)}`, width: t.width, height: t.height };
      svgFabricCache.set(t, s);
    }
    return s;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// PDF, impression, export

export async function buildPdf(doc: PrintDoc, project: Project, assets: AssetStore, fonts: PrintFonts): Promise<Uint8Array> {
  const [{ writePdf }, fontBytes] = await Promise.all([import("../core/print/pdf"), loadFonts(fonts)]);
  return writePdf(doc, { fonts, fontBytes, fabrics: (id) => fabricTileData(project, assets, id), author: "Quilt Studio" });
}

/** Exporter en PDF (boîte « Enregistrer ») ; `null` si l'utilisateur annule. */
export async function exportPdf(doc: PrintDoc, project: Project, assets: AssetStore, fonts: PrintFonts): Promise<SaveResult | null> {
  const bytes = await buildPdf(doc, project, assets, fonts);
  return getApi().exportFile("pdf", doc.title, bytes);
}

/** Imprimer : les pages partent au dialogue de Windows, en taille réelle, `copies` fois. */
export async function printDoc(doc: PrintDoc, project: Project, assets: AssetStore, fonts: PrintFonts, copies: number): Promise<PrintOutcome> {
  const first = doc.pages[0];
  if (!first) return { ok: false, error: "failed" };
  const html = printHtml(doc.pages, { fonts, fabrics: svgFabrics(project, assets) }, doc.title);
  return getApi().printDocument({ html, width: first.width, height: first.height, copies, title: doc.title });
}

export async function exportBytes(kind: ExportKind, name: string, bytes: Uint8Array): Promise<SaveResult | null> {
  return getApi().exportFile(kind, name, bytes);
}

// ---------------------------------------------------------------------------------------------------------------
// Canvas (aperçu, export d'image)

export interface CanvasOptions {
  fonts: PrintFonts;
  project: Project;
  assets: AssetStore;
}

const cssFont = (family: string) => `"${family}", Arial, Helvetica, sans-serif`;

function tracePath(ctx: CanvasRenderingContext2D, d: readonly PathCmd[]): void {
  ctx.beginPath();
  for (const c of d) {
    if (c.op === "M") ctx.moveTo(c.x, c.y);
    else if (c.op === "L") ctx.lineTo(c.x, c.y);
    else if (c.op === "C") ctx.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
    else if (c.op === "A") {
      if (c.r > 0) ctx.arc(c.cx, c.cy, c.r, c.start, c.start + c.sweep, c.sweep < 0);
      else for (const b of arcToBeziers(c)) ctx.bezierCurveTo(b.x1, b.y1, b.x2, b.y2, b.x, b.y);
    } else ctx.closePath();
  }
}

/** Dessine des éléments ; le contexte est déjà en pouces (`pxPerInch` sert aux épaisseurs en points). */
export function drawItems(ctx: CanvasRenderingContext2D, items: readonly Item[], o: CanvasOptions, pxPerInch: number, scale = 1): void {
  for (const it of items) {
    if (it.kind === "group") {
      ctx.save();
      ctx.transform(it.mat[0], it.mat[1], it.mat[2], it.mat[3], it.mat[4], it.mat[5]);
      if (it.clip) {
        tracePath(ctx, it.clip);
        ctx.clip();
      }
      drawItems(ctx, it.items, o, pxPerInch, scale * matScale(it.mat));
      ctx.restore();
    } else if (it.kind === "path") {
      tracePath(ctx, it.d);
      if (it.fill) {
        ctx.fillStyle = it.fill.rgb;
        ctx.fill();
        if (it.fill.kind === "fabric") {
          const fabricId = (it.fill as { fabricId: string }).fabricId;
          const photo = isPhotoFabricId(fabricId) ? o.project.sketchbook.photos.find((p) => p.id === fabricId.slice(6)) : undefined;
          const fabric = o.project.sketchbook.fabrics.find((f) => f.id === fabricId);
          const decoded = photo ? fabricTiles.photoOf(photo, o.project, o.assets) : null;
          const tile = photo ? (decoded?.image ? { image: decoded.image, ppi: photo.ppi } : null) : fabric ? fabricTiles.tileOf(fabric, o.project, o.assets) : null;
          if (tile?.image) {
            const pattern = ctx.createPattern(tile.image, "repeat");
            if (pattern) {
              const m = it.fill.mat;
              const k = 1 / tile.ppi;
              pattern.setTransform(new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]).scale(k, k));
              ctx.fillStyle = pattern;
              ctx.fill();
            }
          }
        }
      }
      if (it.stroke) {
        const k = 1 / 72 / scale;
        // Un trait ne descend jamais sous un demi-pixel d'écran (lisibilité de l'aperçu réduit).
        ctx.lineWidth = Math.max(it.stroke.width * k, 0.5 / pxPerInch / scale);
        ctx.strokeStyle = it.stroke.rgb;
        ctx.lineJoin = it.stroke.join === "miter" ? "miter" : "round";
        ctx.lineCap = it.stroke.join === "miter" ? "butt" : "round";
        ctx.setLineDash((it.stroke.dash ?? []).map((v) => v * k));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      const spec = o.fonts[it.role as FontRole];
      const size = (it.size ?? spec.size) / 72;
      ctx.font = `${it.bold ? "bold " : ""}${size}px ${cssFont(spec.family)}`;
      ctx.textAlign = it.align === "center" ? "center" : it.align === "right" ? "right" : "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = it.rgb ?? "#000000";
      ctx.fillText(it.text, it.x, it.y);
    }
  }
}

/** Dessine une page entière : fond blanc, contenu, à `pxPerInch` pixels par pouce (densité de l'écran comprise). */
export function drawPage(ctx: CanvasRenderingContext2D, page: Page, o: CanvasOptions, pxPerInch: number): void {
  ctx.save();
  ctx.setTransform(pxPerInch, 0, 0, pxPerInch, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, page.width, page.height);
  drawItems(ctx, page.items, o, pxPerInch);
  ctx.restore();
}
