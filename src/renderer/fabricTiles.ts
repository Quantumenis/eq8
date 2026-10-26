// Tuiles des tissus pour l'affichage : un tissu se répète à son échelle réelle (taille de la tuile en pouces).
// Tissu généré : rendu par le cœur, une fois. Tissu image : les octets du projet, décodés par le navigateur (asynchrone :
// les abonnés sont prévenus quand l'image est prête).

import { useSyncExternalStore } from "react";
import { renderGenerated } from "../core/fabric/generator";
import { readImageInfo } from "../core/image/info";
import type { AssetStore } from "../core/project/assets";
import type { FabricItem, FabricSource, PhotoItem, Project } from "../core/project/model";

export interface Tile {
  /** Image à répéter (canvas ou image décodée), ou `null` tant qu'elle se charge. */
  image: CanvasImageSource | null;
  /** Adresse utilisable en CSS et en SVG. */
  url: string;
  /** Résolution de la tuile (pixels par pouce) et sa taille réelle (pouces). */
  ppi: number;
  width: number;
  height: number;
}

interface Decoded {
  url: string;
  image: ImageBitmap | null;
  widthPx: number;
  heightPx: number;
  failed: boolean;
}

class TileStore {
  private readonly generated = new Map<string, { canvas: HTMLCanvasElement; ppi: number; width: number; height: number; url: string | null }>();
  private readonly decoded = new Map<string, Decoded>();
  private revision = 0;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.revision;

  private changed(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }

  private generatedTile(source: Extract<FabricSource, { kind: "generated" }>): Tile {
    const key = JSON.stringify([source.generator, source.seed, source.params]);
    let hit = this.generated.get(key);
    if (!hit) {
      const tile = renderGenerated(source);
      const canvas = document.createElement("canvas");
      canvas.width = tile.raster.width;
      canvas.height = tile.raster.height;
      canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(tile.raster.data), tile.raster.width, tile.raster.height), 0, 0);
      hit = { canvas, ppi: tile.ppi, width: tile.width, height: tile.height, url: null };
      this.generated.set(key, hit);
    }
    hit.url ??= hit.canvas.toDataURL("image/png");
    return { image: hit.canvas, url: hit.url, ppi: hit.ppi, width: hit.width, height: hit.height };
  }

  /** L'image d'un fichier du projet (adresse immédiate, pixels décodés plus tard). */
  decodedAsset(hash: string, assets: AssetStore, mime: string): Decoded | null {
    let hit = this.decoded.get(hash);
    if (hit) return hit;
    const bytes = assets.get(hash);
    if (!bytes) return null;
    let widthPx = 1;
    let heightPx = 1;
    try {
      const info = readImageInfo(bytes);
      widthPx = info.width;
      heightPx = info.height;
    } catch {
      // Dimensions inconnues : on les prendra de l'image décodée.
    }
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
    const entry: Decoded = { url: URL.createObjectURL(blob), image: null, widthPx, heightPx, failed: false };
    this.decoded.set(hash, entry);
    createImageBitmap(blob).then(
      (image) => {
        entry.image = image;
        entry.widthPx = image.width;
        entry.heightPx = image.height;
        this.changed();
      },
      () => {
        entry.failed = true;
        this.changed();
      },
    );
    return entry;
  }

  /** La tuile d'un tissu du carnet ; `null` si son image manque. */
  tileOf(fabric: FabricItem, project: Project, assets: AssetStore): Tile | null {
    if (fabric.source.kind === "generated") return this.generatedTile(fabric.source);
    const { asset, ppi } = fabric.source;
    const d = this.decodedAsset(asset, assets, project.assets[asset]?.mime ?? "image/png");
    if (!d || d.failed) return null;
    return { image: d.image, url: d.url, ppi, width: d.widthPx / ppi, height: d.heightPx / ppi };
  }

  /** Adresse et taille en pixels d'une photo du carnet. */
  photoOf(photo: PhotoItem, project: Project, assets: AssetStore): { url: string; widthPx: number; heightPx: number } | null {
    const d = this.decodedAsset(photo.asset, assets, project.assets[photo.asset]?.mime ?? "image/png");
    return d && !d.failed ? { url: d.url, widthPx: d.widthPx, heightPx: d.heightPx } : null;
  }
}

export const fabricTiles = new TileStore();

/** Se redessine quand une image de tissu finit de se décoder. */
export function useFabricTiles(): number {
  return useSyncExternalStore(fabricTiles.subscribe, fabricTiles.getVersion);
}

/** Style CSS d'une vignette de tissu : la tuile répétée, `pxPerInch` pixels d'écran par pouce de tissu. */
export function fabricBackground(tile: Tile | null, pxPerInch: number, fallback: string): Record<string, string> {
  if (!tile) return { background: fallback };
  return {
    backgroundColor: fallback,
    backgroundImage: `url("${tile.url}")`,
    backgroundSize: `${tile.width * pxPerInch}px ${tile.height * pxPerInch}px`,
    backgroundRepeat: "repeat",
  };
}
