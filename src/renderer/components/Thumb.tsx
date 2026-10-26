import type { AnyItem, BlockItem, ListKey, Paint } from "../../core/project/model";
import { easyDrawSegments } from "../../core/draw/draft";
import { svgPathOf } from "../../core/draw/geometry";
import { piecePath } from "../../core/draw/pieces";
import { BlockIcon, ImageIcon, QuiltIcon } from "../icons";
import { piecesOfDrawing } from "../pieces";

interface ThumbProps {
  list: ListKey;
  item: AnyItem;
  size: number;
  /** Bloc : la coloration montrée (1 = la première ; 0 = le dessin au trait). Par défaut, la première. */
  coloringIndex?: number;
  /** Couleur d'affichage d'un habillage (un tissu s'affiche avec sa couleur moyenne). */
  colorOf?: (paint: Paint) => string;
}

const defaultColorOf = (paint: Paint) => (paint.kind === "solid" ? paint.rgb : "#9e9e9e");

/** Le dessin d'un bloc, avec une coloration, en SVG (arcs exacts). */
export function BlockSvg({ block, coloringIndex, colorOf = defaultColorOf }: { block: BlockItem; coloringIndex?: number; colorOf?: (paint: Paint) => string }) {
  const segments = easyDrawSegments(block.drawing) ?? [];
  const index = coloringIndex ?? (block.colorings.length > 0 ? 1 : 0);
  const coloring = index > 0 ? block.colorings[index - 1] : undefined;
  const pieces = coloring ? piecesOfDrawing(block.drawing, block.width, block.height) ?? [] : [];
  const unit = Math.max(block.width, block.height);
  const seam = coloring ? "#24262b" : "currentColor"; // coutures foncées sur un bloc coloré, quel que soit le thème
  return (
    <svg viewBox={`${-unit / 60} ${-unit / 60} ${block.width + unit / 30} ${block.height + unit / 30}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width={block.width} height={block.height} fill="var(--sheet)" />
      {pieces.map((piece) => {
        const paint = coloring?.fills[piece.key];
        return paint ? <path key={piece.key} d={piecePath(piece)} fill={colorOf(paint)} /> : null;
      })}
      {segments.map((seg) => (
        <path key={seg.id} d={svgPathOf(seg)} fill="none" stroke={seam} strokeWidth={unit / (coloring ? 90 : 50)} strokeLinecap="round" />
      ))}
      <rect x="0" y="0" width={block.width} height={block.height} fill="none" stroke={seam} strokeWidth={unit / (coloring ? 60 : 40)} />
    </svg>
  );
}

/** Vignette d'un élément du carnet. Les aperçus réels des tissus et des quilts arrivent avec leurs éditeurs. */
export function Thumb({ list, item, size, coloringIndex, colorOf }: ThumbProps) {
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
    return (
      <span className="thumb thumb--fabric" style={{ ...style, background: item.averageColor }} aria-hidden="true" />
    );
  }
  if ((list === "blocks" || list === "motifs" || list === "stencils") && "colorings" in item) {
    const segments = easyDrawSegments(item.drawing);
    if (segments) {
      return (
        <span className="thumb thumb--block" style={style} aria-hidden="true">
          <BlockSvg block={item} {...(coloringIndex === undefined ? {} : { coloringIndex })} {...(colorOf ? { colorOf } : {})} />
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
  const Icon = list === "quilts" ? QuiltIcon : ImageIcon;
  return (
    <span className="thumb thumb--icon" style={style} aria-hidden="true">
      <Icon size={Math.max(16, size - 12)} />
    </span>
  );
}
