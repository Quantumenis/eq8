import { useMemo, useState, type MouseEvent } from "react";
import { LIBRARY_BLOCKS, builtLibraryBlock, instantiateLibraryBlock, libraryTree, type LibraryBlockDef } from "../../core/library/blocks";
import { addLibraryBlock } from "../../core/project/commands";
import { emptyNotecard, type BlockItem } from "../../core/project/model";
import { displayColor } from "../../core/draw/coloring";
import { formatLength, type DisplayUnit } from "../../core/units";
import { fr } from "../i18n/fr";
import { useSession } from "../projectSession";
import { ColoringNav } from "./ColoringNav";
import { Modal } from "./Modal";
import { BlockSvg } from "./Thumb";

type Node = { kind: "category"; category: string } | { kind: "style"; category: string; style: string } | { kind: "current" };

interface Props {
  unit: DisplayUnit;
  notify: (message: string) => void;
  /** Appelée après un ajout : « Ajouter au carnet » enregistre le projet. */
  onAdded: () => Promise<void>;
  onClose: () => void;
}

const THUMB = 96;
const FLASH_MS = 700;

/** L'aperçu d'un bloc de la bibliothèque intégrée (identifiants stables, pour l'affichage seulement). */
const previews = new Map<string, BlockItem>();
function preview(def: LibraryBlockDef): BlockItem {
  let item = previews.get(def.id);
  if (!item) {
    const b = builtLibraryBlock(def);
    item = { id: def.id, card: { ...emptyNotecard(def.name), notes: def.notes }, width: b.width, height: b.height, drawing: b.drawing, colorings: b.colorings };
    previews.set(def.id, item);
  }
  return item;
}

/** Bibliothèque de blocs (SPEC §8.1-8.2) : arbre des catégories et des styles, sélection multiple, ajout au carnet. */
export function BlockLibrary({ unit, notify, onAdded, onClose }: Props) {
  const session = useSession();
  const project = session.project;
  const tree = useMemo(() => libraryTree(), []);
  const first = tree[0];
  const [node, setNode] = useState<Node>(first ? { kind: "category", category: first.category } : { kind: "current" });
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [coloringOf, setColoringOf] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());

  const items: BlockItem[] = useMemo(() => {
    if (node.kind === "current") return project.sketchbook.blocks;
    const defs = LIBRARY_BLOCKS.filter((d) => d.category === node.category && (node.kind === "category" || d.style === node.style));
    return defs.map(preview);
  }, [node, project.sketchbook.blocks]);
  const builtIn = node.kind !== "current";
  const focused = items.find((i) => i.id === selected.at(-1)) ?? null;
  const focusedDef = builtIn && focused ? LIBRARY_BLOCKS.find((d) => d.id === focused.id) : undefined;
  const colorOf = (paint: Parameters<typeof displayColor>[1]) => displayColor(project, paint) ?? "#9e9e9e";
  const indexOf = (item: BlockItem) => coloringOf[item.id] ?? (item.colorings.length > 0 ? 1 : 0);

  const choose = (next: Node) => {
    setNode(next);
    setSelected([]);
    setAnchor(null);
  };

  const onItemClick = (event: MouseEvent, id: string) => {
    if (event.shiftKey && anchor) {
      const ids = items.map((i) => i.id);
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        setSelected(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
        return;
      }
    }
    if (event.ctrlKey || event.metaKey) {
      setSelected((sel) => (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]));
      setAnchor(id);
      return;
    }
    setSelected([id]);
    setAnchor(id);
  };

  const add = () => {
    if (!builtIn) return;
    const defs = LIBRARY_BLOCKS.filter((d) => selected.includes(d.id));
    if (defs.length === 0) return notify(fr.library.noneSelected);
    let added = 0;
    let duplicates = 0;
    session.execute(fr.library.add, (p) => {
      let next = p;
      added = 0;
      duplicates = 0;
      for (const def of defs) {
        const r = addLibraryBlock(next, "blocks", instantiateLibraryBlock(def));
        next = r.project;
        if (r.blockIds.length > 0) added += 1;
        duplicates += r.duplicates > 0 && r.blockIds.length === 0 ? 1 : 0;
      }
      return next;
    });
    // L'élément « disparaît » un instant pour signaler l'ajout.
    setFlash(new Set(defs.map((d) => d.id)));
    window.setTimeout(() => setFlash(new Set()), FLASH_MS);
    notify([added > 0 ? fr.library.added(added) : "", duplicates > 0 ? fr.library.duplicates(duplicates) : ""].filter(Boolean).join(" "));
    if (added > 0) void onAdded();
  };

  const footer = (
    <>
      <span className="muted" data-testid="library-count">
        {fr.library.count(items.length)}
      </span>
      <span className="modal-footer-spacer" />
      <button type="button" className="btn" data-testid="library-select-all" disabled={items.length === 0} onClick={() => setSelected(items.map((i) => i.id))}>
        {fr.library.selectAll}
      </button>
      <button type="button" className="btn btn--primary" data-testid="library-add" disabled={!builtIn || selected.length === 0} onClick={add}>
        {fr.library.add}
      </button>
      <button type="button" className="btn" onClick={onClose}>
        {fr.library.close}
      </button>
    </>
  );

  return (
    <Modal title={fr.library.title} size="wide" resizable testId="block-library" onClose={onClose} footer={footer}>
      <div className="lib">
        <nav className="lib-tree" aria-label={fr.library.sections}>
          <div className="lib-tree-section">{fr.library.builtIn}</div>
          <ul role="tree">
            {tree.map((cat) => {
              const open = !collapsed.has(cat.category);
              return (
                <li key={cat.category} role="treeitem" aria-expanded={open} aria-selected={node.kind === "category" && node.category === cat.category}>
                  <div className="lib-tree-row">
                    <button
                      type="button"
                      className="lib-tree-toggle"
                      aria-label={open ? "−" : "+"}
                      onClick={() =>
                        setCollapsed((c) => {
                          const next = new Set(c);
                          if (open) next.add(cat.category);
                          else next.delete(cat.category);
                          return next;
                        })
                      }
                    >
                      {open ? "−" : "+"}
                    </button>
                    <button
                      type="button"
                      className="lib-tree-label"
                      data-testid="library-category"
                      aria-pressed={node.kind === "category" && node.category === cat.category}
                      onClick={() => choose({ kind: "category", category: cat.category })}
                    >
                      {cat.category}
                    </button>
                  </div>
                  {open && (
                    <ul role="group">
                      {cat.styles.map((st) => (
                        <li key={st.style} role="treeitem" aria-selected={node.kind === "style" && node.style === st.style && node.category === cat.category}>
                          <button
                            type="button"
                            className="lib-tree-label lib-tree-label--style"
                            data-testid="library-style"
                            aria-pressed={node.kind === "style" && node.style === st.style && node.category === cat.category}
                            onClick={() => choose({ kind: "style", category: cat.category, style: st.style })}
                          >
                            {st.style} <span className="count">{st.blocks.length}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="lib-tree-section lib-tree-section--disabled" title={fr.library.favoritesSoon}>
            {fr.library.favorites}
          </div>
          <button type="button" className="lib-tree-section lib-tree-label" data-testid="library-current" aria-pressed={node.kind === "current"} onClick={() => choose({ kind: "current" })}>
            {fr.library.current} <span className="count">{project.sketchbook.blocks.length}</span>
          </button>
        </nav>

        <div className="lib-grid" role="listbox" aria-multiselectable="true" aria-label={fr.library.title} data-testid="library-grid">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={selected.includes(item.id)}
              className={`sk-item${selected.includes(item.id) ? " sk-item--selected" : ""}${flash.has(item.id) ? " lib-item--added" : ""}`}
              data-testid="library-item"
              title={item.card.name}
              onClick={(e) => onItemClick(e, item.id)}
            >
              <span className="thumb thumb--block" style={{ width: THUMB, height: THUMB }} aria-hidden="true">
                <BlockSvg block={item} coloringIndex={indexOf(item)} colorOf={colorOf} />
              </span>
              <span className="sk-item-name">{item.card.name || fr.sketchbook.unnamed}</span>
            </button>
          ))}
        </div>

        <aside className="sk-card lib-card" aria-label={fr.sketchbook.card.title}>
          <div className="sk-card-head">
            <h3>{fr.sketchbook.card.title}</h3>
          </div>
          {focused ? (
            <>
              <p className="lib-card-name" data-testid="library-card-name">
                {focused.card.name}
              </p>
              <ColoringNav block={focused} index={indexOf(focused)} onChoose={(i) => setColoringOf((c) => ({ ...c, [focused.id]: i }))} colorOf={colorOf} />
              {focusedDef && (
                <dl className="lib-facts">
                  <dt>{fr.library.categoryLabel}</dt>
                  <dd>{focusedDef.category}</dd>
                  <dt>{fr.library.styleLabel}</dt>
                  <dd>{focusedDef.style}</dd>
                </dl>
              )}
              <p className="muted sk-facts">{fr.sketchbook.sizeLabel(`${formatLength(focused.width, unit)} × ${formatLength(focused.height, unit)}`)}</p>
              {focused.card.notes && <p className="lib-notes">{focused.card.notes}</p>}
              {builtIn && <p className="muted sk-facts">{fr.library.readOnly}</p>}
            </>
          ) : (
            <p className="muted">{fr.library.pick}</p>
          )}
        </aside>
      </div>
    </Modal>
  );
}
