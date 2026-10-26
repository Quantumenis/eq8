import { useId } from "react";
import type { AnyItem, BlockItem, ListKey, Paint, QuiltItem } from "../../core/project/model";
import { displayColor } from "../../core/draw/coloring";
import { parseDoc } from "../../core/quilt/doc";
import { buildScene } from "../../core/quilt/scene";
import { easyDrawSegments } from "../../core/draw/draft";
import { svgPathOf } from "../../core/draw/geometry";
import { piecePath } from "../../core/draw/pieces";
import { sectionsOf, threadDash, threadWidth } from "../../core/draw/threads";
import type { PieceFill } from "../blockDraw";
import { fabricBackground, fabricTiles, useFabricTiles } from "../fabricTiles";
import { BlockIcon, ImageIcon, QuiltIcon } from "../icons";
import { session } from "../projectSession";
import { piecesOfDrawing } from "../pieces";

/** Remplissage d'un habillage dans une vignette (couleur, ou tuile de tissu). */
export type FillOf = (paint: Paint) => PieceFill;

interface ThumbProps {
  list: ListKey;
  item: AnyItem;
  size: number;
  /** Bloc : la coloration montrée (1 = la première ; 0 = le dessin au trait). Par défaut, la première. */
  coloringIndex?: number;
  /** Remplissage d'un habillage (un tissu s'affiche avec sa tuile, à l'échelle du bloc). */
  fillOf?: FillOf;
}

const defaultFillOf: FillOf = (paint) => ({ color: paint.kind === "solid" ? paint.rgb : "#9e9e9e" });

/** Le dessin d'un bloc, avec une coloration, en SVG (arcs exacts, tissus à l'échelle réelle, fils des coutures). */
export function BlockSvg({ block, coloringIndex, fillOf = defaultFillOf }: { block: BlockItem; coloringIndex?: number; fillOf?: FillOf }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const segments = easyDrawSegments(block.drawing) ?? [];
  const index = coloringIndex ?? (block.colorings.length > 0 ? 1 : 0);
  const coloring = index > 0 ? block.colorings[index - 1] : undefined;
  const pieces = coloring ? (piecesOfDrawing(block.drawing, block.width, block.height) ?? []) : [];
  const unit = Math.max(block.width, block.height);
  const seam = coloring ? "#24262b" : "currentColor"; // coutures foncées sur un bloc coloré, quel que soit le thème
  const threads = coloring?.threads && Object.keys(coloring.threads).length > 0 ? coloring.threads : null;
  const patterns: { id: string; url: string; width: number; height: number; x: number; y: number }[] = [];
  const shapes = pieces.map((piece) => {
    const paint = coloring?.fills[piece.key];
    if (!paint) return null;
    const fill = fillOf(paint);
    let value = fill.color;
    if (fill.tile) {
      const id = `${uid}-p${patterns.length}`;
      patterns.push({ id, url: fill.tile.url, width: fill.tile.width, height: fill.tile.height, x: fill.offset?.x ?? 0, y: fill.offset?.y ?? 0 });
      value = `url(#${id})`;
    }
    return <path key={piece.key} d={piecePath(piece)} fill={value} />;
  });
  const lineUnit = unit / 90;
  return (
    <svg viewBox={`${-unit / 60} ${-unit / 60} ${block.width + unit / 30} ${block.height + unit / 30}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      {patterns.length > 0 && (
        <defs>
          {patterns.map((p) => (
            <pattern key={p.id} id={p.id} patternUnits="userSpaceOnUse" width={p.width} height={p.height} patternTransform={`translate(${p.x} ${p.y})`}>
              <image href={p.url} width={p.width} height={p.height} preserveAspectRatio="none" />
            </pattern>
          ))}
        </defs>
      )}
      <rect x="0" y="0" width={block.width} height={block.height} fill="var(--sheet)" />
      {shapes}
      {threads ? (
        sectionsOf(pieces).map((s) => {
          const t = threads[s.key];
          const w = threadWidth(t?.weight ?? 2, lineUnit / 2);
          const dash = t ? threadDash(t.style, w) : [];
          return (
            <path
              key={s.key}
              d={svgPathOf(s.seg)}
              fill="none"
              stroke={t?.rgb ?? seam}
              strokeWidth={w}
              strokeLinecap="round"
              {...(dash.length > 0 ? { strokeDasharray: dash.join(" ") } : {})}
            />
          );
        })
      ) : (
        <>
          {segments.map((seg) => (
            <path key={seg.id} d={svgPathOf(seg)} fill="none" stroke={seam} strokeWidth={unit / (coloring ? 90 : 50)} strokeLinecap="round" />
          ))}
          <rect x="0" y="0" width={block.width} height={block.height} fill="none" stroke={seam} strokeWidth={unit / (coloring ? 60 : 40)} />
        </>
      )}
    </svg>
  );
}

/** Un quilt du carnet en vignette : ses pièces aplaties, chacune de sa couleur (la couleur moyenne pour un tissu). */
export function QuiltSvg({ quilt }: { quilt: QuiltItem }) {
  const doc = parseDoc(quilt.layout);
  if (!doc) return null;
  const scene = buildScene(session.project, { doc, fills: quilt.fills });
  const b = scene.bounds;
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;
  const unit = Math.max(bw, bh);
  return (
    <svg viewBox={`${b.x0 - unit / 60} ${b.y0 - unit / 60} ${bw + unit / 30} ${bh + unit / 30}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" data-testid="quilt-thumb-svg" data-pieces={scene.pieces.length}>
      <rect x={b.x0} y={b.y0} width={bw} height={bh} fill="var(--sheet)" />
      {scene.pieces
        .filter((p) => !p.lineOnly)
        .map((p, i) => (
          <polygon key={i} points={p.poly.map((q) => `${q.x},${q.y}`).join(" ")} fill={displayColor(session.project, p.paint) ?? "var(--sheet)"} stroke="#24262b" strokeWidth={unit / 400} strokeLinejoin="round" />
        ))}
    </svg>
  );
}

/** Pouces de tissu montrés dans une vignette de tissu. */
const FABRIC_THUMB_INCHES = 4;

/** Vignette d'un élément du carnet. */
export function Thumb({ list, item, size, coloringIndex, fillOf }: ThumbProps) {
  useFabricTiles();
  const style = { width: size, height: size };

  if (list === "colors" && "rgb" in item) {
    return <span className="thumb thumb--swatch" style={{ ...style, background: item.rgb }} aria-hidden="true" />;
  }
  if (list === "threads" && "rgb" in item) {
    return (
      <span className="thumb thumb--thread" style={style} aria-hidden="true">
        <svg viewBox="0 0 40 40" width="100%" height="100%">
          <path d="M3 28 C10 6, 16 34, 22 14 S34 22, 37 8" fill="none" stroke={item.rgb} strokeWidth="4" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (list === "fabrics" && "averageColor" in item) {
    const tile = fabricTiles.tileOf(item, session.project, session.assets);
    return <span className="thumb thumb--fabric" style={{ ...style, ...fabricBackground(tile, size / FABRIC_THUMB_INCHES, item.averageColor) }} aria-hidden="true" />;
  }
  if (list === "photos" && "asset" in item) {
    const photo = fabricTiles.photoOf(item, session.project, session.assets);
    if (photo) {
      return (
        <span className="thumb thumb--photo" style={style} aria-hidden="true">
          <img src={photo.url} alt="" draggable={false} />
        </span>
      );
    }
  }
  if ((list === "blocks" || list === "motifs" || list === "stencils") && "colorings" in item) {
    const segments = easyDrawSegments(item.drawing);
    if (segments) {
      return (
        <span className="thumb thumb--block" style={style} aria-hidden="true">
          <BlockSvg block={item} {...(coloringIndex === undefined ? {} : { coloringIndex })} {...(fillOf ? { fillOf } : {})} />
          {item.colorings.length > 0 && <span className="thumb-badge">{item.colorings.length}</span>}
        </span>
      );
    }
    return (
      <span className="thumb thumb--block" style={style} aria-hidden="true">
        <BlockIcon size={Math.max(16, size - 12)} />
        {item.colorings.length > 0 && <span className="thumb-badge">{item.colorings.length}</span>}
      </span>
    );
  }
  if (list === "quilts" && "placements" in item && parseDoc(item.layout)) {
    return (
      <span className="thumb thumb--block thumb--quilt" style={style} aria-hidden="true">
        <QuiltSvg quilt={item} />
      </span>
    );
  }
  const Icon = list === "quilts" ? QuiltIcon : ImageIcon;
  return (
    <span className="thumb thumb--icon" style={style} aria-hidden="true">
      <Icon size={Math.max(16, size - 12)} />
    </span>
  );
}
