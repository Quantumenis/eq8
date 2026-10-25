import type { AnyItem, ListKey } from "../../core/project/model";
import { easyDrawSegments } from "../../core/draw/draft";
import { svgPathOf } from "../../core/draw/geometry";
import { BlockIcon, ImageIcon, QuiltIcon } from "../icons";

interface ThumbProps {
  list: ListKey;
  item: AnyItem;
  size: number;
}

/** Vignette d'un élément du carnet. Les aperçus réels (dessin, tissu, quilt) arrivent avec les éditeurs. */
export function Thumb({ list, item, size }: ThumbProps) {
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
          <svg viewBox={`-0.1 -0.1 ${item.width + 0.2} ${item.height + 0.2}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
            <rect x="0" y="0" width={item.width} height={item.height} fill="var(--sheet)" stroke="currentColor" strokeWidth={Math.max(item.width, item.height) / 40} />
            {segments.map((seg) => (
              <path key={seg.id} d={svgPathOf(seg)} fill="none" stroke="currentColor" strokeWidth={Math.max(item.width, item.height) / 50} strokeLinecap="round" />
            ))}
          </svg>
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
