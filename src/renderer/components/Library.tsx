// Bibliothèques de blocs, de tissus et de fils (SPEC §8.1-8.2, §8.5, §8.6, §8.7) : la bibliothèque intégrée
// (catégories et styles), Mes favoris (créer, coller, enregistrer, supprimer), le carnet courant, les résultats de
// recherche (par couleur ; par texte pour les fils) et, pour les tissus, les résultats d'import d'images.

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { libraryEntryById, instantiateEntry } from "../../core/library/extra";
import {
  MAX_STYLES,
  MIN_STYLES,
  clampStyles,
  editLibrary,
  newFavoriteLibrary,
  pasteIntoStyle,
  removeFromStyle,
  styleItems,
  type FavoriteLibrary,
} from "../../core/library/favorites";
import { SEARCH_MAX_DEFAULT, clampSearchMax, searchByColor, searchByText } from "../../core/library/search";
import { ALL_FIELDS, CATEGORY_SECTIONS, MAX_CATEGORIES, searchByCategories, searchCards, type CardFields } from "../../core/library/categories";
import { averageColor } from "../../core/image/raster";
import { addAsset } from "../../core/project/assets";
import { addLibraryBlock } from "../../core/project/commands";
import { makeImageFabric } from "../../core/project/images";
import { checkProjectName } from "../../core/project/names";
import { emptyProject, type AnyItem, type BlockItem, type FabricItem, type Id, type ThreadItem } from "../../core/project/model";
import { transferItems, type Source } from "../../core/project/transfer";
import { formatLength, type DisplayUnit } from "../../core/units";
import { fabricBackground, fabricTiles, useFabricTiles } from "../fabricTiles";
import { fr } from "../i18n/fr";
import { decodeImage } from "../imageEditor";
import { blockListOf, builtinLibrary, itemsOf, libraryClipboard, loadFavorites, saveFavorite, setLibraryClipboard, type LibraryKind } from "../libraryData";
import { pieceFill } from "../paintView";
import { getApi } from "../projectActions";
import { useSession } from "../projectSession";
import { ColoringNav } from "./ColoringNav";
import { useDialogs } from "./Dialogs";
import { Modal } from "./Modal";
import { BlockSvg } from "./Thumb";

type Node =
  | { kind: "category"; category: string }
  | { kind: "style"; category: string; style: string }
  | { kind: "favorite"; lib: string; style: number }
  | { kind: "current" }
  | { kind: "search" }
  | { kind: "import" };

interface Entry {
  key: string;
  item: AnyItem;
  source: Source;
  builtin: boolean;
}

interface Props {
  kind: LibraryKind;
  unit: DisplayUnit;
  notify: (message: string) => void;
  /** Appelée après un ajout : « Ajouter au carnet » enregistre le projet. */
  onAdded: () => Promise<void>;
  onClose: () => void;
}

const THUMB = 96;
const FLASH_MS = 700;
const TEST_IDS: Record<LibraryKind, string> = { blocks: "block-library", fabrics: "fabric-library", threads: "thread-library" };

const sameNode = (a: Node, b: Node): boolean => JSON.stringify(a) === JSON.stringify(b);

function averageOf(item: AnyItem): string {
  return "averageColor" in item ? item.averageColor : "rgb" in item ? item.rgb : "#9e9e9e";
}

export function Library({ kind, unit, notify, onAdded, onClose }: Props) {
  const session = useSession();
  const dialogs = useDialogs();
  useFabricTiles();
  const t = fr.library;
  const builtin = useMemo(() => builtinLibrary(kind), [kind]);
  const first = builtin.tree[0];
  const [node, setNode] = useState<Node>(first ? { kind: "category", category: first.category } : { kind: "current" });
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [coloringOf, setColoringOf] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());
  const [favorites, setFavorites] = useState<FavoriteLibrary[]>([]);
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  const [favoriteForm, setFavoriteForm] = useState<{ editing: string | null; name: string; styles: number } | null>(null);
  const [searchResults, setSearchResults] = useState<Entry[] | null>(null);
  const [importResults, setImportResults] = useState<Entry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [showAverage, setShowAverage] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadFavorites(kind).then(({ libraries, broken }) => {
      if (cancelled) return;
      setFavorites(libraries);
      if (broken.length > 0) notify(t.favoritesBroken(broken));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const current: Source = { project: session.project, assets: session.assets };

  const entries: Entry[] = useMemo(() => {
    const fromSource = (source: Source, ids: readonly Id[] | null, isBuiltin: boolean, prefix: string): Entry[] => {
      const items = itemsOf(source, kind);
      const chosen = ids ? ids.map((id) => items.find((i) => i.id === id)).filter((i): i is AnyItem => i !== undefined) : items;
      return chosen.map((item) => ({ key: `${prefix}:${item.id}`, item, source, builtin: isBuiltin }));
    };
    if (node.kind === "category" || node.kind === "style") {
      const cat = builtin.tree.find((c) => c.category === node.category);
      const ids = (cat?.styles ?? []).filter((s) => node.kind === "category" || s.style === node.style).flatMap((s) => s.ids);
      return fromSource(builtin.source, ids, true, "b");
    }
    if (node.kind === "favorite") {
      const lib = favorites.find((l) => l.name === node.lib);
      return lib ? styleItems(lib, node.style).map((item) => ({ key: `f:${lib.name}:${item.id}`, item, source: lib.content, builtin: false })) : [];
    }
    if (node.kind === "current") return fromSource({ project: session.project, assets: session.assets }, null, false, "c");
    if (node.kind === "search") return searchResults ?? [];
    return importResults ?? [];
  }, [node, builtin, favorites, kind, session.project, session.assets, searchResults, importResults]);

  const selectedEntries = entries.filter((e) => selected.includes(e.key));
  const focused = entries.find((e) => e.key === selected.at(-1)) ?? null;
  const activeLib = node.kind === "favorite" ? (favorites.find((l) => l.name === node.lib) ?? null) : null;

  // ---- Navigation ----------------------------------------------------------------------------------------------

  const choose = async (next: Node) => {
    // Rappel : quitter une bibliothèque de favoris modifiée sans l'avoir enregistrée (SPEC §8.7).
    if (activeLib && dirty.has(activeLib.name) && !(next.kind === "favorite" && next.lib === activeLib.name)) {
      if (await dialogs.confirm(t.saveReminder(activeLib.name), { okLabel: t.saveLibrary })) await saveLib(activeLib);
    }
    setNode(next);
    setSelected([]);
    setAnchor(null);
  };

  const toggle = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onItemClick = (event: MouseEvent, key: string) => {
    if (event.shiftKey && anchor) {
      const keys = entries.map((e) => e.key);
      const a = keys.indexOf(anchor);
      const b = keys.indexOf(key);
      if (a >= 0 && b >= 0) {
        setSelected(keys.slice(Math.min(a, b), Math.max(a, b) + 1));
        return;
      }
    }
    if (event.ctrlKey || event.metaKey) {
      setSelected((sel) => (sel.includes(key) ? sel.filter((s) => s !== key) : [...sel, key]));
      setAnchor(key);
      return;
    }
    setSelected([key]);
    setAnchor(key);
  };

  // ---- Ajouter au carnet ---------------------------------------------------------------------------------------

  const flashKeys = (keys: string[]) => {
    setFlash(new Set(keys));
    window.setTimeout(() => setFlash(new Set()), FLASH_MS);
  };

  const add = () => {
    if (selectedEntries.length === 0) return notify(t.noneSelected);
    let added = 0;
    let duplicates = 0;
    session.execute(t.add, (p) => {
      let next = p;
      added = 0;
      duplicates = 0;
      for (const entry of selectedEntries) {
        if (entry.builtin && kind === "blocks") {
          // Bloc de la bibliothèque intégrée : ses deux colorations (dépilées si le maximum vaut 1).
          const def = libraryEntryById(entry.item.id);
          if (!def) continue;
          const made = instantiateEntry(def);
          const r = addLibraryBlock(next, made.list, made.item);
          next = r.project;
          if (r.blockIds.length > 0) added += 1;
          else duplicates += 1;
          continue;
        }
        const r = transferItems(next, session.assets, entry.source, kind === "blocks" ? blockListOf(entry.source, entry.item.id) : kind, [entry.item.id]);
        next = r.project;
        added += r.added.length;
        duplicates += r.duplicates;
      }
      return next;
    });
    flashKeys(selectedEntries.map((e) => e.key));
    notify([added > 0 ? t.addedItems(added, fr.itemSingular[kind]) : "", duplicates > 0 ? t.duplicates(duplicates) : ""].filter(Boolean).join(" "));
    if (added > 0) void onAdded();
  };

  // ---- Mes favoris ---------------------------------------------------------------------------------------------

  async function saveLib(lib: FavoriteLibrary): Promise<boolean> {
    const r = await saveFavorite(lib);
    if (!r.ok) {
      notify(t.saveFailed(lib.name));
      return false;
    }
    setDirty((d) => {
      const next = new Set(d);
      next.delete(lib.name);
      return next;
    });
    notify(t.librarySaved(lib.name));
    return true;
  }

  const replaceLib = (name: string, lib: FavoriteLibrary) => {
    setFavorites((list) => list.map((l) => (l.name === name ? lib : l)));
    setDirty((d) => new Set([...d, lib.name]));
  };

  const submitFavoriteForm = async () => {
    if (!favoriteForm) return;
    const check = checkProjectName(favoriteForm.name);
    if (!check.ok) return notify(t.badName);
    const styles = clampStyles(favoriteForm.styles);
    if (favoriteForm.editing === null) {
      if (favorites.some((l) => l.name.toLowerCase() === check.name.toLowerCase())) return notify(t.nameTaken(check.name));
      const lib = newFavoriteLibrary(kind, check.name, styles);
      const r = await saveFavorite(lib, true);
      if (!r.ok) return notify(r.error === "exists" ? t.nameTaken(check.name) : t.saveFailed(check.name));
      setFavorites((list) => [...list, lib].sort((a, b) => a.name.localeCompare(b.name, "fr")));
      setFavoriteForm(null);
      await choose({ kind: "favorite", lib: lib.name, style: 0 });
      notify(t.libraryCreated(lib.name));
      return;
    }
    const old = favorites.find((l) => l.name === favoriteForm.editing);
    if (!old) return;
    const renamed = check.name !== old.name;
    if (renamed && favorites.some((l) => l !== old && l.name.toLowerCase() === check.name.toLowerCase())) return notify(t.nameTaken(check.name));
    if (styles < old.styles.length && old.styles.slice(styles).some((s) => s.items.length > 0)) {
      if (!(await dialogs.confirm(t.dropStyles(old.styles.length - styles), { okLabel: t.confirmEdit }))) return;
    }
    const lib = editLibrary(old, check.name, styles);
    const r = await saveFavorite(lib, renamed);
    if (!r.ok) return notify(r.error === "exists" ? t.nameTaken(check.name) : t.saveFailed(check.name));
    if (renamed) await getApi().deleteFavorite(kind, old.name);
    setFavorites((list) => list.map((l) => (l === old ? lib : l)));
    setDirty((d) => {
      const next = new Set(d);
      next.delete(old.name);
      return next;
    });
    setFavoriteForm(null);
    setNode({ kind: "favorite", lib: lib.name, style: Math.min(node.kind === "favorite" ? node.style : 0, lib.styles.length - 1) });
  };

  const deleteLib = async (lib: FavoriteLibrary) => {
    if (!(await dialogs.confirm(t.deleteLibraryConfirm(lib.name), { detail: t.deleteLibraryDetail, okLabel: t.deleteLibrary }))) return;
    if (!(await getApi().deleteFavorite(kind, lib.name))) return notify(t.saveFailed(lib.name));
    setFavorites((list) => list.filter((l) => l !== lib));
    if (node.kind === "favorite" && node.lib === lib.name) setNode(first ? { kind: "category", category: first.category } : { kind: "current" });
    notify(t.libraryDeleted(lib.name));
  };

  const copy = () => {
    if (selectedEntries.length === 0) return notify(t.noneSelected);
    setLibraryClipboard({ kind, items: selectedEntries.map((e) => ({ source: e.source, id: e.item.id })) });
    notify(t.copied(selectedEntries.length));
  };

  const paste = () => {
    if (!activeLib || node.kind !== "favorite") return;
    const clip = libraryClipboard;
    if (!clip || clip.kind !== kind || clip.items.length === 0) return notify(t.clipboardEmpty);
    let lib = activeLib;
    let added = 0;
    let refused = 0;
    let duplicates = 0;
    for (const { source, id } of clip.items) {
      const r = pasteIntoStyle(lib, node.style, source, [id]);
      lib = r.lib;
      added += r.added;
      refused += r.refused;
      duplicates += r.duplicates;
    }
    replaceLib(activeLib.name, lib);
    notify([t.pasted(added), refused > 0 ? t.styleFull(refused) : "", duplicates > 0 ? t.duplicates(duplicates) : ""].filter(Boolean).join(" "));
  };

  const removeSelected = async () => {
    if (!activeLib || node.kind !== "favorite" || selectedEntries.length === 0) return;
    if (!(await dialogs.confirm(t.removeConfirm(selectedEntries.length), { detail: t.removeDetail, okLabel: fr.sketchbook.remove }))) return;
    replaceLib(activeLib.name, removeFromStyle(activeLib, node.style, selectedEntries.map((e) => e.item.id)));
    setSelected([]);
  };

  // ---- Importer des images (tissus) ------------------------------------------------------------------------------

  const importImages = async () => {
    const chosen = await getApi().importImages(true);
    if (!chosen || chosen.length === 0) return;
    setBusy(true);
    const project = emptyProject();
    const assets = new Map<string, Uint8Array>();
    let p = project;
    const failed: string[] = [];
    for (const file of chosen) {
      if (!file.bytes) {
        failed.push(file.name);
        continue;
      }
      try {
        const decoded = await decodeImage(file.bytes);
        const r = addAsset(p, assets, file.bytes, decoded.mime);
        p = r.project;
        const fabric: FabricItem = makeImageFabric(r.hash, decoded.ppi, file.name.replace(/\.[^.]+$/, ""), averageColor(decoded.raster).hex);
        p = { ...p, sketchbook: { ...p.sketchbook, fabrics: [...p.sketchbook.fabrics, fabric] } };
      } catch {
        failed.push(file.name);
      }
    }
    setBusy(false);
    const source: Source = { project: p, assets };
    setImportResults(p.sketchbook.fabrics.map((item) => ({ key: `i:${item.id}`, item, source, builtin: false })));
    await choose({ kind: "import" });
    notify([t.imported(p.sketchbook.fabrics.length), failed.length > 0 ? t.importFailed(failed) : ""].filter(Boolean).join(" "));
  };

  // ---- Rechercher ------------------------------------------------------------------------------------------------

  const runSearch = async (query: SearchQuery) => {
    const pools: Entry[] = [];
    if (query.builtin) pools.push(...itemsOf(builtin.source, kind).map((item) => ({ key: `b:${item.id}`, item, source: builtin.source, builtin: true })));
    if (query.favorites) for (const lib of favorites) pools.push(...itemsOf(lib.content, kind).map((item) => ({ key: `f:${lib.name}:${item.id}`, item, source: lib.content, builtin: false })));
    if (query.current) pools.push(...itemsOf(current, kind).map((item) => ({ key: `c:${item.id}`, item, source: current, builtin: false })));
    const max = clampSearchMax(query.max);
    const results =
      query.mode === "categories"
        ? searchByCategories(pools, (e) => e.item.card.back.categories, query.categories, max)
        : query.mode === "text"
          ? kind === "blocks"
            ? searchCards(pools, (e) => e.item.card, query.text, query.fields, max)
            : searchByText(pools, (e) => [e.item.card.name, e.item.card.reference], query.text, max)
          : searchByColor(pools, (e) => averageOf(e.item), query.color, max);
    setSearchResults(results);
    setSearching(false);
    await choose({ kind: "search" });
    notify(t.found(results.length));
  };

  // ---- Affichage -------------------------------------------------------------------------------------------------

  const indexOf = (item: BlockItem) => coloringOf[item.id] ?? (item.colorings.length > 0 ? 1 : 0);

  const thumb = (entry: Entry) => {
    const item = entry.item;
    if (kind === "blocks" && "colorings" in item) {
      const fillOf = (paint: Parameters<typeof pieceFill>[2] & object) => pieceFill(entry.source.project, entry.source.assets, paint) ?? { color: "#9e9e9e" };
      return (
        <span className="thumb thumb--block" style={{ width: THUMB, height: THUMB }} aria-hidden="true">
          <BlockSvg block={item} coloringIndex={indexOf(item)} fillOf={fillOf} />
        </span>
      );
    }
    if (kind === "fabrics" && "averageColor" in item) {
      const tile = fabricTiles.tileOf(item, entry.source.project, entry.source.assets);
      return (
        <span className="thumb thumb--fabric" style={{ width: THUMB, height: THUMB, ...fabricBackground(tile, THUMB / 4, item.averageColor) }} aria-hidden="true">
          {showAverage && <span className="average-corner" style={{ background: item.averageColor }} data-testid="average-corner" />}
        </span>
      );
    }
    const rgb = "rgb" in item ? item.rgb : "#9e9e9e";
    return (
      <span className="thumb thumb--thread" style={{ width: THUMB, height: THUMB }} aria-hidden="true">
        <svg viewBox="0 0 40 40" width="100%" height="100%">
          <path d="M3 28 C10 6, 16 34, 22 14 S34 22, 37 8" fill="none" stroke={rgb} strokeWidth="4" strokeLinecap="round" />
        </svg>
      </span>
    );
  };

  const canPaste = node.kind === "favorite" && libraryClipboard?.kind === kind && (libraryClipboard?.items.length ?? 0) > 0;

  const footer = (
    <>
      <span className="muted" data-testid="library-count">
        {t.count(entries.length)}
      </span>
      <span className="modal-footer-spacer" />
      {kind === "fabrics" && (
        <button type="button" className="btn" data-testid="library-import" disabled={busy} onClick={() => void importImages()}>
          {t.import}
        </button>
      )}
      {kind !== "blocks" && (
        <button type="button" className="btn" data-testid="library-search" onClick={() => setSearching(true)}>
          {t.search}
        </button>
      )}
      <button type="button" className="btn" data-testid="library-select-all" disabled={entries.length === 0} onClick={() => setSelected(entries.map((e) => e.key))}>
        {t.selectAll}
      </button>
      <button type="button" className="btn" data-testid="library-copy" disabled={selected.length === 0} onClick={copy}>
        {t.copy}
      </button>
      {node.kind === "favorite" && (
        <>
          <button type="button" className="btn" data-testid="library-paste" disabled={!canPaste} onClick={paste}>
            {t.paste}
          </button>
          <button type="button" className="btn" data-testid="library-remove" disabled={selected.length === 0} onClick={() => void removeSelected()}>
            {fr.sketchbook.remove}
          </button>
        </>
      )}
      <button type="button" className="btn btn--primary" data-testid="library-add" disabled={selected.length === 0 || node.kind === "current"} onClick={add}>
        {t.add}
      </button>
      <button type="button" className="btn" onClick={onClose}>
        {t.close}
      </button>
    </>
  );

  return (
    <Modal title={t.titles[kind]} size="wide" resizable testId={TEST_IDS[kind]} onClose={onClose} footer={footer}>
      <div className="lib">
        <nav className="lib-tree" aria-label={t.sections}>
          <div className="lib-tree-section">{t.builtIn}</div>
          <ul role="tree">
            {builtin.tree.map((cat) => {
              const open = !collapsed.has(cat.category);
              return (
                <li key={cat.category} role="treeitem" aria-expanded={open} aria-selected={node.kind === "category" && node.category === cat.category}>
                  <div className="lib-tree-row">
                    <button type="button" className="lib-tree-toggle" aria-label={open ? "−" : "+"} onClick={() => toggle(cat.category)}>
                      {open ? "−" : "+"}
                    </button>
                    <button
                      type="button"
                      className="lib-tree-label"
                      data-testid="library-category"
                      aria-pressed={sameNode(node, { kind: "category", category: cat.category })}
                      onClick={() => void choose({ kind: "category", category: cat.category })}
                    >
                      {cat.category}
                    </button>
                  </div>
                  {open && (
                    <ul role="group">
                      {cat.styles.map((st) => (
                        <li key={st.style} role="treeitem" aria-selected={sameNode(node, { kind: "style", category: cat.category, style: st.style })}>
                          <button
                            type="button"
                            className="lib-tree-label lib-tree-label--style"
                            data-testid="library-style"
                            aria-pressed={sameNode(node, { kind: "style", category: cat.category, style: st.style })}
                            onClick={() => void choose({ kind: "style", category: cat.category, style: st.style })}
                          >
                            {st.style} <span className="count">{st.ids.length}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="lib-tree-section lib-tree-section--row">
            <span>{t.favorites}</span>
            <button type="button" className="btn btn--tiny" data-testid="favorite-create" title={t.createLibrary} aria-label={t.createLibrary} onClick={() => setFavoriteForm({ editing: null, name: "", styles: 1 })}>
              +
            </button>
          </div>
          {favorites.length === 0 && <p className="muted lib-tree-note">{t.noFavorites}</p>}
          <ul role="tree" data-testid="favorite-tree">
            {favorites.map((lib) => {
              const key = `fav:${lib.name}`;
              const open = !collapsed.has(key);
              return (
                <li key={lib.name} role="treeitem" aria-expanded={open}>
                  <div className="lib-tree-row">
                    <button type="button" className="lib-tree-toggle" aria-label={open ? "−" : "+"} onClick={() => toggle(key)}>
                      {open ? "−" : "+"}
                    </button>
                    <span className="lib-tree-label lib-tree-label--static" data-testid="favorite-library">
                      {lib.name}
                      {dirty.has(lib.name) ? " *" : ""}
                    </span>
                    <button type="button" className="btn btn--tiny" title={t.saveLibrary} aria-label={t.saveLibrary} data-testid="favorite-save" disabled={!dirty.has(lib.name)} onClick={() => void saveLib(lib)}>
                      💾
                    </button>
                    <button
                      type="button"
                      className="btn btn--tiny"
                      title={t.editLibrary}
                      aria-label={t.editLibrary}
                      data-testid="favorite-edit"
                      onClick={() => setFavoriteForm({ editing: lib.name, name: lib.name, styles: lib.styles.length })}
                    >
                      ✎
                    </button>
                    <button type="button" className="btn btn--tiny" title={t.deleteLibrary} aria-label={t.deleteLibrary} data-testid="favorite-delete" onClick={() => void deleteLib(lib)}>
                      ×
                    </button>
                  </div>
                  {open && (
                    <ul role="group">
                      {lib.styles.map((st, i) => (
                        <li key={i} role="treeitem" aria-selected={sameNode(node, { kind: "favorite", lib: lib.name, style: i })}>
                          <button
                            type="button"
                            className="lib-tree-label lib-tree-label--style"
                            data-testid="favorite-style"
                            aria-pressed={sameNode(node, { kind: "favorite", lib: lib.name, style: i })}
                            onClick={() => void choose({ kind: "favorite", lib: lib.name, style: i })}
                          >
                            {st.name} <span className="count">{st.items.length}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <button type="button" className="lib-tree-section lib-tree-label" data-testid="library-current" aria-pressed={node.kind === "current"} onClick={() => void choose({ kind: "current" })}>
            {t.current} <span className="count">{itemsOf(current, kind).length}</span>
          </button>
          {searchResults && (
            <button type="button" className="lib-tree-section lib-tree-label" data-testid="library-results" aria-pressed={node.kind === "search"} onClick={() => void choose({ kind: "search" })}>
              {t.searchResults} <span className="count">{searchResults.length}</span>
            </button>
          )}
          {importResults && (
            <button type="button" className="lib-tree-section lib-tree-label" data-testid="library-imports" aria-pressed={node.kind === "import"} onClick={() => void choose({ kind: "import" })}>
              {t.importResults} <span className="count">{importResults.length}</span>
            </button>
          )}
        </nav>

        <div className="lib-main">
          {kind === "fabrics" && (
            <label className="check lib-option">
              <input type="checkbox" checked={showAverage} data-testid="library-show-average" onChange={(e) => setShowAverage(e.target.checked)} />
              <span>{t.showAverage}</span>
            </label>
          )}
          <div className="lib-grid" role="listbox" aria-multiselectable="true" aria-label={t.titles[kind]} data-testid="library-grid">
            {entries.length === 0 && <p className="muted sk-empty">{node.kind === "favorite" ? t.emptyStyle : fr.sketchbook.empty}</p>}
            {entries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="option"
                aria-selected={selected.includes(entry.key)}
                className={`sk-item${selected.includes(entry.key) ? " sk-item--selected" : ""}${flash.has(entry.key) ? " lib-item--added" : ""}`}
                data-testid="library-item"
                data-rgb={averageOf(entry.item)}
                title={entry.item.card.name}
                onClick={(e) => onItemClick(e, entry.key)}
              >
                {thumb(entry)}
                <span className="sk-item-name">{entry.item.card.name || fr.sketchbook.unnamed}</span>
              </button>
            ))}
          </div>
        </div>

        <aside className="sk-card lib-card" aria-label={fr.sketchbook.card.title}>
          <div className="sk-card-head">
            <h3>{fr.sketchbook.card.title}</h3>
          </div>
          {focused ? <EntryCard entry={focused} kind={kind} unit={unit} coloringIndex={"colorings" in focused.item ? indexOf(focused.item) : 0} onColoring={(i) => setColoringOf((c) => ({ ...c, [focused.item.id]: i }))} /> : <p className="muted">{t.pick}</p>}
        </aside>
      </div>

      {favoriteForm && (
        <Modal
          title={favoriteForm.editing === null ? t.createLibrary : t.editLibrary}
          size="narrow"
          testId="favorite-form"
          onClose={() => setFavoriteForm(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setFavoriteForm(null)}>
                {fr.dialogs.cancel}
              </button>
              <button type="button" className="btn btn--primary" data-testid="favorite-form-ok" onClick={() => void submitFavoriteForm()}>
                {fr.dialogs.ok}
              </button>
            </>
          }
        >
          <label className="field">
            <span className="field-label">{t.libraryName}</span>
            <input className="field-input" data-autofocus value={favoriteForm.name} data-testid="favorite-name" onChange={(e) => setFavoriteForm({ ...favoriteForm, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void submitFavoriteForm()} />
          </label>
          <label className="field">
            <span className="field-label">{t.styleCount(MIN_STYLES, MAX_STYLES)}</span>
            <input
              className="field-input"
              type="number"
              min={MIN_STYLES}
              max={MAX_STYLES}
              value={favoriteForm.styles}
              data-testid="favorite-styles"
              onChange={(e) => setFavoriteForm({ ...favoriteForm, styles: Number(e.target.value) })}
            />
          </label>
        </Modal>
      )}

      {searching && (
        <SearchDialog
          kind={kind}
          focused={focused?.item ?? null}
          colors={session.project.sketchbook.colors.map((c) => c.rgb)}
          hasFavorites={favorites.length > 0}
          onCancel={() => setSearching(false)}
          onSearch={(q) => void runSearch(q)}
        />
      )}
    </Modal>
  );
}

function EntryCard({ entry, kind, unit, coloringIndex, onColoring }: { entry: Entry; kind: LibraryKind; unit: DisplayUnit; coloringIndex: number; onColoring: (i: number) => void }) {
  const item = entry.item;
  const t = fr.library;
  const fillOf = (paint: Parameters<typeof pieceFill>[2] & object) => pieceFill(entry.source.project, entry.source.assets, paint) ?? { color: "#9e9e9e" };
  return (
    <>
      <p className="lib-card-name" data-testid="library-card-name">
        {item.card.name || fr.sketchbook.unnamed}
      </p>
      {kind === "blocks" && "colorings" in item && <ColoringNav block={item} index={coloringIndex} onChoose={onColoring} fillOf={fillOf} />}
      <dl className="lib-facts">
        {item.card.reference && (
          <>
            <dt>{kind === "threads" ? t.number : fr.sketchbook.card.reference}</dt>
            <dd>{item.card.reference}</dd>
          </>
        )}
        {item.card.back.classification && (
          <>
            <dt>{t.styleLabel}</dt>
            <dd>{item.card.back.classification}</dd>
          </>
        )}
        {"averageColor" in item && (
          <>
            <dt>{t.average}</dt>
            <dd>
              <span className="swatch swatch--inline" style={{ background: item.averageColor }} /> {fr.coloring.rgb(item.averageColor)}
            </dd>
          </>
        )}
        {kind === "threads" && "rgb" in item && (
          <>
            <dt>{t.color}</dt>
            <dd>
              <span className="swatch swatch--inline" style={{ background: (item as ThreadItem).rgb }} /> {fr.coloring.rgb((item as ThreadItem).rgb)}
            </dd>
          </>
        )}
      </dl>
      {"width" in item && <p className="muted sk-facts">{fr.sketchbook.sizeLabel(`${formatLength(item.width, unit)} × ${formatLength(item.height, unit)}`)}</p>}
      {"averageColor" in item && (() => {
        const tile = fabricTiles.tileOf(item, entry.source.project, entry.source.assets);
        return tile ? <p className="muted sk-facts">{t.tileSize(`${formatLength(tile.width, unit)} × ${formatLength(tile.height, unit)}`)}</p> : null;
      })()}
      {item.card.notes && <p className="lib-notes">{item.card.notes}</p>}
      {entry.builtin && <p className="muted sk-facts">{t.readOnly}</p>}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Recherche

interface SearchQuery {
  mode: "color" | "text" | "categories";
  categories: string[];
  fields: CardFields;
  color: string;
  text: string;
  max: number;
  builtin: boolean;
  favorites: boolean;
  current: boolean;
}

function SearchDialog({
  kind,
  focused,
  colors,
  hasFavorites,
  onCancel,
  onSearch,
}: {
  kind: LibraryKind;
  focused: AnyItem | null;
  colors: string[];
  hasFavorites: boolean;
  onCancel: () => void;
  onSearch: (q: SearchQuery) => void;
}) {
  const t = fr.library.searchDialog;
  const base = focused ? averageOf(focused) : null;
  const [q, setQ] = useState<SearchQuery>({ mode: kind === "blocks" ? "text" : "color", categories: [], fields: ALL_FIELDS, color: base ?? colors[0] ?? "#808080", text: "", max: SEARCH_MAX_DEFAULT, builtin: true, favorites: hasFavorites, current: false });
  const ready = q.mode === "text" ? q.text.trim().length > 0 : q.mode === "categories" ? q.categories.length > 0 : true;
  const toggleCategory = (c: string) =>
    setQ((cur) => ({ ...cur, categories: cur.categories.includes(c) ? cur.categories.filter((x) => x !== c) : cur.categories.length >= MAX_CATEGORIES ? cur.categories : [...cur.categories, c] }));
  return (
    <Modal
      title={t.title}
      size="medium"
      testId="search-dialog"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            {fr.dialogs.cancel}
          </button>
          <button type="button" className="btn btn--primary" data-testid="search-run" disabled={!ready} onClick={() => onSearch(q)}>
            {t.run}
          </button>
        </>
      }
    >
      {(kind === "threads" || kind === "blocks") && (
        <fieldset className="radio-group">
          <legend>{t.by}</legend>
          {kind === "threads" && (
            <label className="check">
              <input type="radio" name="search-mode" checked={q.mode === "color"} data-testid="search-by-color" onChange={() => setQ({ ...q, mode: "color" })} />
              <span>{t.byColor}</span>
            </label>
          )}
          {kind === "blocks" && (
            <label className="check">
              <input type="radio" name="search-mode" checked={q.mode === "categories"} data-testid="search-by-categories" onChange={() => setQ({ ...q, mode: "categories" })} />
              <span>{t.byCategories}</span>
            </label>
          )}
          <label className="check">
            <input type="radio" name="search-mode" checked={q.mode === "text"} data-testid="search-by-text" onChange={() => setQ({ ...q, mode: "text" })} />
            <span>{t.byText}</span>
          </label>
        </fieldset>
      )}
      {q.mode === "categories" ? (
        <div data-testid="search-categories">
          {CATEGORY_SECTIONS.map((section) => (
            <fieldset key={section.id} className="radio-group">
              <legend>{section.id}</legend>
              <div className="button-grid">
                {section.categories.map((c) => (
                  <button key={c} type="button" className="tool-button tool-button--small" aria-pressed={q.categories.includes(c)} data-testid={`category-${c}`} onClick={() => toggleCategory(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="muted" data-testid="search-chosen">{t.chosen(q.categories.length, MAX_CATEGORIES)}{q.categories.length > 0 ? ` : ${q.categories.join(", ")}` : ""}</p>
        </div>
      ) : q.mode === "text" ? (
        <label className="field">
          <span className="field-label">{t.text}</span>
          <input className="field-input" data-autofocus value={q.text} data-testid="search-text" onChange={(e) => setQ({ ...q, text: e.target.value })} />
          {kind === "blocks" && (
            <span className="check-row">
              {(["name", "reference", "notes"] as const).map((f) => (
                <label key={f} className="check">
                  <input type="checkbox" checked={q.fields[f]} data-testid={`search-field-${f}`} onChange={(e) => setQ({ ...q, fields: { ...q.fields, [f]: e.target.checked } })} />
                  <span>{t.fields[f]}</span>
                </label>
              ))}
            </span>
          )}
        </label>
      ) : (
        <div className="search-color">
          <p className="muted">{base ? t.fromSelection : t.chooseColor}</p>
          <div className="search-color-row">
            <span className="picker-preview picker-preview--small" style={{ background: q.color }} data-testid="search-color" data-rgb={q.color} />
            <div className="swatch-row" role="listbox" aria-label={t.colors}>
              {base && <button type="button" className={`swatch swatch--small${q.color === base ? " swatch--current" : ""}`} style={{ background: base }} title={t.selection} onClick={() => setQ({ ...q, color: base })} />}
              {colors.map((c, i) => (
                <button key={i} type="button" className={`swatch swatch--small${q.color === c ? " swatch--current" : ""}`} style={{ background: c }} title={c} data-testid="search-color-choice" data-rgb={c} onClick={() => setQ({ ...q, color: c })} />
              ))}
            </div>
          </div>
        </div>
      )}
      <fieldset className="radio-group">
        <legend>{t.where}</legend>
        <label className="check">
          <input type="checkbox" checked={q.builtin} data-testid="search-in-builtin" onChange={(e) => setQ({ ...q, builtin: e.target.checked })} />
          <span>{fr.library.builtIn}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={q.favorites} disabled={!hasFavorites} onChange={(e) => setQ({ ...q, favorites: e.target.checked })} />
          <span>{fr.library.favorites}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={q.current} data-testid="search-in-current" onChange={(e) => setQ({ ...q, current: e.target.checked })} />
          <span>{fr.library.current}</span>
        </label>
      </fieldset>
      <label className="field field--tiny">
        <span className="field-label">{t.max}</span>
        <input className="field-input" type="number" min={1} max={999} value={q.max} data-testid="search-max" onChange={(e) => setQ({ ...q, max: Number(e.target.value) })} />
      </label>
    </Modal>
  );
}
