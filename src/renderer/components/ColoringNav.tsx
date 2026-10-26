import { useEffect, useRef, useState } from "react";
import type { BlockItem } from "../../core/project/model";
import { fr } from "../i18n/fr";
import { BlockSvg, type FillOf } from "./Thumb";

interface Props {
  /** Le bloc dont on parcourt la pile ; `null` si le dessin n'est pas encore dans le carnet. */
  block: BlockItem | null;
  /** Coloration affichée : 1 à n, ou 0 pour le dessin au trait. */
  index: number;
  onChoose: (index: number) => void;
  fillOf?: FillOf;
}

/** Les flèches de coloration (début, précédente, suivante, dernière), l'indicateur « 2 sur 5 » et « Choisir une coloration ». */
export function ColoringNav({ block, index, onChoose, fillOf }: Props) {
  const [choosing, setChoosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const n = block?.colorings.length ?? 0;

  useEffect(() => {
    if (!choosing) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setChoosing(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [choosing]);

  const go = (i: number) => {
    if (block && i >= 0 && i <= n && i !== index) onChoose(i);
  };
  const label = !block ? fr.coloring.nav.notInSketchbook : index === 0 ? fr.coloring.nav.lineDrawing(n) : fr.coloring.nav.position(index, n);

  return (
    <div className="coloring-nav" ref={ref} role="group" aria-label={fr.coloring.nav.title}>
      <button type="button" className="btn btn--small" data-testid="coloring-first" title={fr.coloring.nav.first} aria-label={fr.coloring.nav.first} disabled={!block || index === 0} onClick={() => go(0)}>
        ⏮
      </button>
      <button type="button" className="btn btn--small" data-testid="coloring-prev" title={fr.coloring.nav.prev} aria-label={fr.coloring.nav.prev} disabled={!block || index === 0} onClick={() => go(index - 1)}>
        ◀
      </button>
      <button
        type="button"
        className="coloring-indicator"
        data-testid="coloring-indicator"
        title={fr.coloring.nav.chooseHint}
        disabled={!block}
        onClick={() => block && setChoosing((c) => !c)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (block) setChoosing(true);
        }}
      >
        {label}
      </button>
      <button type="button" className="btn btn--small" data-testid="coloring-next" title={fr.coloring.nav.next} aria-label={fr.coloring.nav.next} disabled={!block || index >= n} onClick={() => go(index + 1)}>
        ▶
      </button>
      <button type="button" className="btn btn--small" data-testid="coloring-last" title={fr.coloring.nav.last} aria-label={fr.coloring.nav.last} disabled={!block || index >= n} onClick={() => go(n)}>
        ⏭
      </button>
      {choosing && block && (
        <div className="coloring-chooser" role="menu" aria-label={fr.coloring.nav.choose} data-testid="coloring-chooser">
          <span className="menu-title">{fr.coloring.nav.choose}</span>
          <div className="coloring-strip">
            {Array.from({ length: n + 1 }, (_, i) => (
              <button
                key={i}
                type="button"
                role="menuitemradio"
                aria-checked={i === index}
                className="coloring-strip-item"
                title={i === 0 ? fr.coloring.nav.lineDrawing(0) : fr.coloring.nav.position(i, n)}
                data-testid="coloring-choice"
                onClick={() => {
                  setChoosing(false);
                  go(i);
                }}
              >
                <span className="thumb thumb--block">
                  <BlockSvg block={block} coloringIndex={i} {...(fillOf ? { fillOf } : {})} />
                </span>
                <span>{i === 0 ? "0" : String(i)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
