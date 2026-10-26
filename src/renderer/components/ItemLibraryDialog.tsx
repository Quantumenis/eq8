// Bibliothèques des broderies, des dispositions et des quilts rapides (SPEC §4.6, §2.14, §1.8) : une grille
// d'éléments intégrés ; « Ajouter au carnet » les copie dans le projet (ou, pour un quilt rapide, ouvre un projet).

import { useMemo, useState } from "react";
import { EMBROIDERY_LIBRARY, instantiateEmbroidery, parseEmbroidery, stitchPathD, type EmbroideryDef } from "../../core/embroidery/embroidery";
import { LAYOUT_CATEGORIES, LAYOUT_LIBRARY, QUICK_QUILTS, buildLayoutItem, buildQuickQuilt, type LayoutDef, type QuickQuiltDef } from "../../core/library/quick";
import { addToSketchbook } from "../../core/project/commands";
import type { Project, QuiltItem } from "../../core/project/model";
import { fr } from "../i18n/fr";
import { session, useSession } from "../projectSession";
import { Modal } from "./Modal";
import { QuiltSvg } from "./Thumb";

export type ItemLibraryKind = "embroideries" | "layouts" | "quick";

interface Props {
  kind: ItemLibraryKind;
  notify: (message: string) => void;
  onClose: () => void;
  onAdded: () => Promise<void>;
  /** Propose d'enregistrer le projet en cours avant de le remplacer (quilt rapide). */
  ensureSaved: () => Promise<boolean>;
}

const layoutCache = new Map<string, QuiltItem>();
const layoutOf = (def: LayoutDef): QuiltItem => {
  let q = layoutCache.get(def.id);
  if (!q) {
    q = buildLayoutItem(def);
    layoutCache.set(def.id, q);
  }
  return q;
};

const quickCache = new Map<string, { project: Project; quilt: QuiltItem; quiltId: string }>();
function quickOf(def: QuickQuiltDef) {
  let hit = quickCache.get(def.id);
  if (!hit) {
    const built = buildQuickQuilt(def);
    hit = { project: built.project, quiltId: built.quiltId, quilt: built.project.sketchbook.quilts.find((q) => q.id === built.quiltId) as QuiltItem };
    quickCache.set(def.id, hit);
  }
  return hit;
}

function EmbroideryThumb({ def }: { def: EmbroideryDef }) {
  const emb = useMemo(() => parseEmbroidery(def.build() as never), [def]);
  if (!emb) return null;
  return (
    <svg viewBox={`${-0.1} ${-0.1} ${emb.width + 0.2} ${emb.height + 0.2}`} preserveAspectRatio="xMidYMid meet">
      {emb.paths.map((p, i) => (
        <path key={i} d={stitchPathD(p)} fill="none" stroke={emb.thread} strokeWidth={Math.max(emb.width, emb.height) / 70} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

export function ItemLibraryDialog({ kind, notify, onClose, onAdded, ensureSaved }: Props) {
  const t = fr.m9.itemLibrary;
  const current = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const info = t[kind];

  const entries = useMemo(() => {
    if (kind === "embroideries") return EMBROIDERY_LIBRARY.map((d) => ({ id: d.id, name: d.name, group: d.category, notes: d.notes, def: d as EmbroideryDef | LayoutDef | QuickQuiltDef }));
    if (kind === "layouts") return LAYOUT_LIBRARY.map((d) => ({ id: d.id, name: d.name, group: d.category, notes: "", def: d as EmbroideryDef | LayoutDef | QuickQuiltDef }));
    return QUICK_QUILTS.map((d) => ({ id: d.id, name: d.name, group: "", notes: d.notes, def: d as EmbroideryDef | LayoutDef | QuickQuiltDef }));
  }, [kind]);
  const groups = kind === "layouts" ? [...LAYOUT_CATEGORIES] : [""];

  const add = async () => {
    const entry = entries.find((e) => e.id === selected);
    if (!entry) return notify(t.none);
    if (kind === "quick") {
      if (!(await ensureSaved())) return;
      const q = quickOf(entry.def as QuickQuiltDef);
      session.load({ project: q.project, assets: new Map() }, null, { modified: true });
      notify(t.quickOpened(entry.name));
      onClose();
      return;
    }
    let duplicate = false;
    session.execute(info.add, (project) => {
      if (kind === "embroideries") {
        const r = addToSketchbook(project, "embroideries", instantiateEmbroidery(entry.def as EmbroideryDef));
        duplicate = r.status === "duplicate";
        return r.project;
      }
      const r = addToSketchbook(project, "quilts", buildLayoutItem(entry.def as LayoutDef));
      duplicate = r.status === "duplicate";
      return r.project;
    });
    notify(duplicate ? t.duplicate(entry.name) : t.added(entry.name));
    if (!duplicate) await onAdded();
  };

  void current;
  return (
    <Modal
      title={info.title}
      size="wide"
      testId={`item-library-${kind}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--primary" data-testid="item-library-add" disabled={!selected} onClick={() => void add()}>
            {info.add}
          </button>
          <button type="button" className="btn" data-testid="item-library-close" onClick={onClose}>
            {t.close}
          </button>
        </>
      }
    >
      {groups.map((group) => {
        const list = entries.filter((e) => e.group === group || group === "");
        if (list.length === 0) return null;
        return (
          <section key={group || "all"}>
            {group && <h3>{group}</h3>}
            <div className="item-library" role="listbox" aria-label={info.title}>
              {list.map((e) => (
                <button key={e.id} type="button" role="option" className="item-card" aria-selected={selected === e.id} data-testid="item-card" title={e.notes || e.name} onClick={() => setSelected(e.id)} onDoubleClick={() => (setSelected(e.id), void add())}>
                  {kind === "embroideries" && <EmbroideryThumb def={e.def as EmbroideryDef} />}
                  {kind === "layouts" && <QuiltSvg quilt={layoutOf(e.def as LayoutDef)} project={current.project} />}
                  {kind === "quick" && <QuiltSvg quilt={quickOf(e.def as QuickQuiltDef).quilt} project={quickOf(e.def as QuickQuiltDef).project} />}
                  <span>{e.name}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <p className="palette-hint">{t.count(entries.length)}</p>
    </Modal>
  );
}
