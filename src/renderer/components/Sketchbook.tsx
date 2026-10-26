import { useEffect, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from "react";
import {
  addToSketchbook,
  clearUnused,
  deleteItem,
  makeColor,
  moveBefore,
  setFrameColor,
  sortByClickOrder,
  splitColorings,
  updateCard,
} from "../../core/project/commands";
import { displayColor } from "../../core/draw/coloring";
import {
  SECTION_IDS,
  isBlockList,
  sectionOf,
  type AnyItem,
  type BlockItem,
  type BlockListKey,
  type Id,
  type ListKey,
  type Notecard,
  type SectionId,
} from "../../core/project/model";
import { fabricUseCount, quiltsUsingBlock, unusedBlockIds, unusedFabricIds } from "../../core/project/usage";
import { formatLength, type DisplayUnit } from "../../core/units";
import { fr } from "../i18n/fr";
import { useSession } from "../projectSession";
import { ColoringNav } from "./ColoringNav";
import { useDialogs } from "./Dialogs";
import { Modal } from "./Modal";
import { SortDialog } from "./SortDialog";
import { Thumb } from "./Thumb";

type ThumbSize = "tiny" | "small" | "medium" | "large";
const THUMB_PX: Record<ThumbSize, number> = { tiny: 40, small: 64, medium: 96, large: 144 };
const THUMB_STORAGE_KEY = "quilt-studio.sketchbook.thumbnails";
const BLOCK_TABS: BlockListKey[] = ["blocks", "motifs", "stencils"];

function readThumbSize(): ThumbSize {
  try {
    const stored = localStorage.getItem(THUMB_STORAGE_KEY);
    if (stored === "tiny" || stored === "small" || stored === "medium" || stored === "large") return stored;
  } catch {
    // Stockage indisponible : taille moyenne.
  }
  return "medium";
}

interface Props {
  unit: DisplayUnit;
  notify: (message: string) => void;
  /** Appelée après chaque ajout au carnet : « Ajouter au carnet » enregistre le projet. */
  onAdded: () => Promise<void>;
  /** « Modifier » un bloc du carnet : ouvre son dessin (et la coloration affichée) dans le plan Bloc. */
  onEditBlock: (id: Id, coloringIndex: number) => void;
  onClose: () => void;
}

export function Sketchbook({ unit, notify, onAdded, onEditBlock, onClose }: Props) {
  const session = useSession();
  const dialogs = useDialogs();
  const project = session.project;

  const [section, setSection] = useState<SectionId>("colors");
  const [blockTab, setBlockTab] = useState<BlockListKey>("blocks");
  const [selection, setSelection] = useState<Partial<Record<ListKey, Id>>>({});
  const [thumbSize, setThumbSize] = useState<ThumbSize>(readThumbSize);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [dragId, setDragId] = useState<Id | null>(null);
  const [overId, setOverId] = useState<Id | "end" | null>(null);
  const [newColor, setNewColor] = useState("#cc3333");
  const [newColorName, setNewColorName] = useState("");
  /** Coloration affichée de chaque bloc (1 à n ; 0 = le dessin au trait). */
  const [coloringOf, setColoringOf] = useState<Record<Id, number>>({});

  const list: ListKey = section === "blocks" ? blockTab : section;
  const items = project.sketchbook[list] as AnyItem[];
  const selectedId = selection[list];
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const px = THUMB_PX[thumbSize];
  const frame = project.frameColors[sectionOf(list)];
  const kind = fr.itemSingular[list];

  useEffect(() => {
    try {
      localStorage.setItem(THUMB_STORAGE_KEY, thumbSize);
    } catch {
      // Préférence non mémorisée : sans conséquence.
    }
  }, [thumbSize]);

  const select = (id: Id | undefined) => setSelection((s) => ({ ...s, [list]: id }));
  const colorOf = (paint: Parameters<typeof displayColor>[1]) => displayColor(project, paint) ?? "#9e9e9e";
  const coloringIndex = (block: BlockItem) => Math.min(coloringOf[block.id] ?? (block.colorings.length > 0 ? 1 : 0), block.colorings.length);
  const selectedBlock = selected && isBlockList(list) && "colorings" in selected ? selected : null;

  /** « Scinder les colorations » : la pile est coupée en deux blocs à partir de la coloration affichée. */
  function split() {
    if (!selectedBlock || !isBlockList(list)) return;
    const index = coloringIndex(selectedBlock);
    const coloring = selectedBlock.colorings[index - 1];
    if (index < 2 || !coloring) return notify(fr.coloring.nav.splitNeed);
    let newId: Id | null = null;
    session.execute(fr.coloring.nav.split, (p) => {
      const r = splitColorings(p, list, selectedBlock.id, coloring.id);
      newId = r?.newBlockId ?? null;
      return r?.project ?? p;
    });
    if (newId) {
      setColoringOf((c) => ({ ...c, [selectedBlock.id]: index - 1, [newId as Id]: 1 }));
      select(newId);
      notify(fr.coloring.nav.splitDone);
    }
  }
  const nameOf = (item: AnyItem) => item.card.name || fr.sketchbook.unnamed;

  async function remove() {
    if (!selected) return;
    if (isBlockList(list)) {
      const used = quiltsUsingBlock(project, selected.id);
      if (used.length > 0) {
        const names = project.sketchbook.quilts.filter((q) => used.includes(q.id)).map((q) => q.card.name || fr.sketchbook.unnamed);
        await dialogs.alert(fr.sketchbook.cannotRemoveUsed(`ce ${kind}`, names));
        return;
      }
    }
    const useCount = list === "fabrics" ? fabricUseCount(project, selected.id) : 0;
    const ok = await dialogs.confirm(fr.sketchbook.removeConfirm(kind, nameOf(selected)), {
      detail: useCount > 0 ? fr.sketchbook.fabricInUse(useCount) : fr.sketchbook.removeConfirmDetail,
      okLabel: fr.sketchbook.remove,
    });
    if (!ok) return;
    const index = items.findIndex((item) => item.id === selected.id);
    const neighbour = items[index + 1] ?? items[index - 1];
    session.execute(`Supprimer ${kind}`, (p) => {
      const result = deleteItem(p, list, selected.id);
      return result.ok ? result.project : p;
    });
    select(neighbour?.id);
    notify(fr.sketchbook.removed(nameOf(selected)));
  }

  function addColor() {
    const color = makeColor(newColor, newColorName.trim());
    const outcome = addToSketchbook(session.project, "colors", color);
    if (outcome.status === "duplicate") {
      select(outcome.existingId);
      notify(fr.sketchbook.alreadyThere(fr.itemSingular.colors));
      return;
    }
    session.execute("Ajouter une couleur", (p) => addToSketchbook(p, "colors", color).project);
    select(color.id);
    setNewColorName("");
    notify(fr.sketchbook.added(fr.itemSingular.colors));
    void onAdded();
  }

  async function clearUnusedItems() {
    setMenuOpen(false);
    const count = isBlockList(list) ? unusedBlockIds(project, list).length : list === "fabrics" ? unusedFabricIds(project).length : 0;
    if (count === 0) {
      notify(fr.sketchbook.nothingUnused);
      return;
    }
    if (!(await dialogs.confirm(fr.sketchbook.clearUnusedConfirm(count, fr.lists[list].toLowerCase())))) return;
    session.execute(fr.sketchbook.clearUnused, (p) => clearUnused(p, list).project);
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (items.length === 0) return;
    const index = items.findIndex((item) => item.id === selectedId);
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(items.length - 1, index + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Delete") {
      event.preventDefault();
      void remove();
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    const target = items[next];
    select(target?.id);
    (event.currentTarget.querySelectorAll<HTMLElement>("[role=option]")[next])?.focus();
  }

  const onDragStart = (event: DragEvent, id: Id) => {
    setDragId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  };
  const onDragOver = (event: DragEvent, target: Id | "end") => {
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOverId(target);
  };
  const onDrop = (event: DragEvent, target: Id | "end") => {
    event.preventDefault();
    if (dragId) session.execute(fr.sketchbook.sort, (p) => moveBefore(p, list, dragId, target === "end" ? null : target));
    setDragId(null);
    setOverId(null);
  };

  const updateSelectedCard = (field: string, change: (card: Notecard) => Notecard) => {
    if (!selected) return;
    session.execute("Modifier la fiche", (p) => updateCard(p, list, selected.id, change), `card:${selected.id}:${field}`);
  };

  return (
    <Modal title={fr.sketchbook.title} size="wide" resizable testId="sketchbook" onClose={onClose}>
      <div className="sk">
        <div className="tabs" role="tablist" aria-label={fr.sketchbook.title}>
          {SECTION_IDS.map((id) => {
            const count = id === "blocks" ? BLOCK_TABS.reduce((n, k) => n + project.sketchbook[k].length, 0) : project.sketchbook[id].length;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={section === id}
                data-testid={`section-${id}`}
                onClick={() => setSection(id)}
              >
                {fr.sections[id]} <span className="count">{count}</span>
              </button>
            );
          })}
        </div>

        {section === "blocks" && (
          <div className="tabs tabs--sub" role="tablist" aria-label={fr.sections.blocks}>
            {BLOCK_TABS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={blockTab === key}
                data-testid={`blocktab-${key}`}
                onClick={() => setBlockTab(key)}
              >
                {fr.lists[key]} <span className="count">{project.sketchbook[key].length}</span>
              </button>
            ))}
          </div>
        )}

        <div className="sk-toolbar">
          {list === "colors" && (
            <div className="sk-add-color">
              <input
                type="color"
                value={newColor}
                aria-label={fr.sketchbook.colorValue}
                data-testid="new-color-value"
                onChange={(e) => setNewColor(e.target.value)}
              />
              <input
                type="text"
                value={newColorName}
                placeholder={fr.sketchbook.colorName}
                aria-label={fr.sketchbook.colorName}
                data-testid="new-color-name"
                onChange={(e) => setNewColorName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addColor()}
              />
              <button type="button" className="btn" data-testid="add-color" onClick={addColor}>
                {fr.sketchbook.addColor}
              </button>
            </div>
          )}
          <span className="modal-footer-spacer" />
          <button
            type="button"
            className="btn"
            data-testid="edit-item"
            disabled={!(list === "blocks" && selected)}
            title={list === "blocks" ? undefined : fr.sketchbook.editUnavailable}
            onClick={() => selectedBlock && onEditBlock(selectedBlock.id, coloringIndex(selectedBlock))}
          >
            {fr.sketchbook.edit}
          </button>
          <button type="button" className="btn" data-testid="remove-item" disabled={!selected} onClick={() => void remove()}>
            {fr.sketchbook.remove}
          </button>
          <button type="button" className="btn" data-testid="sort-open" disabled={items.length < 2} onClick={() => setSorting(true)}>
            {fr.sketchbook.sort}
          </button>
          <div className="menu-anchor">
            <button
              type="button"
              className="btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={fr.sketchbook.options}
              title={fr.sketchbook.options}
              data-testid="section-options"
              onClick={() => setMenuOpen((open) => !open)}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="menu" role="menu" data-testid="section-menu">
                <div className="menu-group" role="group" aria-label={fr.sketchbook.thumbnails}>
                  <span className="menu-title">{fr.sketchbook.thumbnails}</span>
                  {(Object.keys(THUMB_PX) as ThumbSize[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      role="menuitemradio"
                      aria-checked={thumbSize === size}
                      onClick={() => setThumbSize(size)}
                    >
                      {fr.sketchbook.sizes[size]}
                    </button>
                  ))}
                </div>
                <div className="menu-group" role="group" aria-label={fr.sketchbook.frameColor}>
                  <span className="menu-title">{fr.sketchbook.frameColor}</span>
                  <input
                    type="color"
                    value={frame ?? "#2f6fb3"}
                    aria-label={fr.sketchbook.frameColor}
                    onChange={(e) => session.execute(fr.sketchbook.frameColor, (p) => setFrameColor(p, sectionOf(list), e.target.value), `frame:${sectionOf(list)}`)}
                  />
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!frame}
                    onClick={() => session.execute(fr.sketchbook.frameColor, (p) => setFrameColor(p, sectionOf(list), null))}
                  >
                    {fr.sketchbook.frameNone}
                  </button>
                </div>
                {(isBlockList(list) || list === "fabrics") && (
                  <button type="button" role="menuitem" onClick={() => void clearUnusedItems()}>
                    {fr.sketchbook.clearUnused}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {selectedBlock && (
          <div className="sk-coloring-bar" data-testid="sketchbook-coloring">
            <ColoringNav block={selectedBlock} index={coloringIndex(selectedBlock)} onChoose={(i) => setColoringOf((c) => ({ ...c, [selectedBlock.id]: i }))} colorOf={colorOf} />
            <button type="button" className="btn btn--small" data-testid="split-colorings" title={fr.coloring.nav.splitTitle} disabled={coloringIndex(selectedBlock) < 2} onClick={split}>
              {fr.coloring.nav.split}
            </button>
          </div>
        )}

        <div className="sk-main">
          <div
            className="sk-grid"
            role="listbox"
            aria-label={fr.lists[list]}
            data-testid="sketchbook-grid"
            data-count={items.length}
            style={frame ? ({ "--frame": frame } as CSSProperties) : undefined}
            onKeyDown={onGridKeyDown}
          >
            {items.length === 0 && <p className="muted sk-empty">{fr.sketchbook.empty}</p>}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === selectedId}
                className={`sk-item${item.id === selectedId ? " sk-item--selected" : ""}${overId === item.id ? " sk-item--over" : ""}${dragId === item.id ? " sk-item--dragging" : ""}`}
                data-testid="sketchbook-item"
                title={nameOf(item)}
                draggable
                tabIndex={item.id === selectedId || (!selectedId && item === items[0]) ? 0 : -1}
                onClick={() => select(item.id)}
                onDragStart={(e) => onDragStart(e, item.id)}
                onDragOver={(e) => onDragOver(e, item.id)}
                onDragLeave={() => setOverId(null)}
                onDrop={(e) => onDrop(e, item.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
              >
                <Thumb list={list} item={item} size={px} colorOf={colorOf} {...("colorings" in item ? { coloringIndex: coloringIndex(item) } : {})} />
                {thumbSize !== "tiny" && <span className="sk-item-name">{nameOf(item)}</span>}
              </button>
            ))}
            {dragId && (
              <div
                className={`sk-drop-end${overId === "end" ? " sk-drop-end--over" : ""}`}
                onDragOver={(e) => onDragOver(e, "end")}
                onDragLeave={() => setOverId(null)}
                onDrop={(e) => onDrop(e, "end")}
              >
                {fr.sketchbook.dropAtEnd}
              </div>
            )}
          </div>

          <NotecardPanel
            key={selected?.id ?? "none"}
            list={list}
            item={selected}
            unit={unit}
            onChange={updateSelectedCard}
          />
        </div>
      </div>

      {sorting && (
        <SortDialog
          list={list}
          items={items}
          onApply={(clicked) => {
            setSorting(false);
            if (clicked.length > 0) session.execute(fr.sketchbook.sort, (p) => sortByClickOrder(p, list, clicked));
          }}
        />
      )}
    </Modal>
  );
}

interface NotecardPanelProps {
  list: ListKey;
  item: AnyItem | null;
  unit: DisplayUnit;
  onChange: (field: string, change: (card: Notecard) => Notecard) => void;
}

/** Fiche de l'élément sélectionné : recto (nom, référence, notes) et verso (classement, catégories). */
function NotecardPanel({ list, item, unit, onChange }: NotecardPanelProps) {
  const [flipped, setFlipped] = useState(false);
  const [categories, setCategories] = useState(item?.card.back.categories.join(", ") ?? "");

  if (!item) {
    return (
      <aside className="sk-card" aria-label={fr.sketchbook.card.title}>
        <p className="muted">{fr.sketchbook.card.none}</p>
      </aside>
    );
  }

  const facts: string[] = [];
  if ("width" in item) facts.push(fr.sketchbook.sizeLabel(`${formatLength(item.width, unit)} × ${formatLength(item.height, unit)}`));
  if ("colorings" in item) facts.push(fr.sketchbook.colorings(item.colorings.length));
  if (list === "colors" || list === "threads") facts.push("rgb" in item ? item.rgb : "");

  return (
    <aside className="sk-card" aria-label={fr.sketchbook.card.title} data-testid="notecard" data-project-history>
      <div className="sk-card-head">
        <h3>{fr.sketchbook.card.title}</h3>
        <button type="button" className="btn btn--small" data-testid="card-flip" aria-pressed={flipped} onClick={() => setFlipped((f) => !f)}>
          {fr.sketchbook.card.flip}
        </button>
      </div>
      {flipped ? (
        <>
          <label className="field">
            <span>{fr.sketchbook.card.classification}</span>
            <input
              type="text"
              value={item.card.back.classification}
              onChange={(e) => onChange("classification", (c) => ({ ...c, back: { ...c.back, classification: e.target.value } }))}
            />
          </label>
          <label className="field">
            <span>{fr.sketchbook.card.categories}</span>
            <input
              type="text"
              value={categories}
              onChange={(e) => {
                setCategories(e.target.value);
                const parsed = e.target.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
                onChange("categories", (c) => ({ ...c, back: { ...c.back, categories: parsed } }));
              }}
            />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span>{fr.sketchbook.card.name}</span>
            <input
              type="text"
              value={item.card.name}
              data-testid="card-name"
              onChange={(e) => onChange("name", (c) => ({ ...c, name: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>{fr.sketchbook.card.reference}</span>
            <input type="text" value={item.card.reference} onChange={(e) => onChange("reference", (c) => ({ ...c, reference: e.target.value }))} />
          </label>
          <label className="field">
            <span>{fr.sketchbook.card.notes}</span>
            <textarea rows={5} value={item.card.notes} onChange={(e) => onChange("notes", (c) => ({ ...c, notes: e.target.value }))} />
          </label>
        </>
      )}
      {facts.length > 0 && <p className="muted sk-facts">{facts.join(" · ")}</p>}
    </aside>
  );
}
