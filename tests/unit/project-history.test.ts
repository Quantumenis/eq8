import { describe, expect, it } from "vitest";
import {
  addColoredBlock,
  addLibraryBlock,
  addToSketchbook,
  clearUnused,
  deleteColoring,
  deleteItem,
  makeColor,
  moveBefore,
  setFrameColor,
  setMaxColorings,
  sortByClickOrder,
  splitColorings,
  updateCard,
} from "../../src/core/project/commands";
import { History } from "../../src/core/project/history";
import { ProjectSession } from "../../src/core/project/session";
import { builtInDefaultProject } from "../../src/core/project/defaults";
import {
  LIST_KEYS,
  SECTION_IDS,
  emptyNotecard,
  type BlockListKey,
  type ListKey,
  type Project,
} from "../../src/core/project/model";
import { validateProject } from "../../src/core/project/validate";
import { block, coloring, fabric, quilt, rng } from "./project-helpers";

const BLOCK_KEYS: BlockListKey[] = ["blocks", "motifs", "stencils"];

type Op = (p: Project, rand: () => number, n: number) => Project;

const pick = <T>(rand: () => number, items: readonly T[]): T | undefined => items[Math.floor(rand() * items.length)];
const hex = (rand: () => number) =>
  "#" + Math.floor(rand() * 0xffffff).toString(16).padStart(6, "0");

const OPS: Op[] = [
  // Ajouter une couleur
  (p, r) => {
    const res = addToSketchbook(p, "colors", makeColor(hex(r), "c"));
    return res.project;
  },
  // Ajouter un tissu
  (p, r, n) => addToSketchbook(p, "fabrics", fabric(`f${n}`, hex(r))).project,
  // Ajouter un bloc coloré (empile ou crée)
  (p, r, n) => {
    const list = pick(r, BLOCK_KEYS) as BlockListKey;
    const source = pick(r, p.sketchbook[list]);
    const fabricItem = pick(r, p.sketchbook.fabrics);
    const fills = fabricItem && r() < 0.5 ? { "0": { kind: "fabric" as const, fabricId: fabricItem.id } } : { "0": { kind: "solid" as const, rgb: hex(r) } };
    return addColoredBlock(p, {
      list,
      sourceBlockId: source?.id,
      card: emptyNotecard(`n${n}`),
      width: source?.width ?? 6,
      height: source?.height ?? 6,
      drawing: source?.drawing ?? { n: Math.floor(r() * 3) },
      coloring: coloring(`col${n}`, fills),
    }).project;
  },
  // Ajouter un bloc de bibliothèque à plusieurs colorations
  (p, r, n) =>
    addLibraryBlock(p, pick(r, BLOCK_KEYS) as BlockListKey, block(`lib${n}`, [coloring(`la${n}`, { 0: { kind: "solid", rgb: hex(r) } }), coloring(`lb${n}`, { 0: { kind: "solid", rgb: hex(r) } }), coloring(`lc${n}`)], { lib: n })).project,
  // Poser un bloc dans un nouveau quilt
  (p, r, n) => {
    const blocks = BLOCK_KEYS.flatMap((k) => p.sketchbook[k]).filter((b) => b.colorings.length > 0);
    const b = pick(r, blocks);
    if (!b) return p;
    const c = pick(r, b.colorings)!;
    return addToSketchbook(p, "quilts", quilt(`q${n}`, [{ blockId: b.id, coloringId: c.id }])).project;
  },
  // Supprimer un élément au hasard (les refus laissent le projet intact)
  (p, r) => {
    const list = pick(r, LIST_KEYS) as ListKey;
    const item = pick(r, p.sketchbook[list] as { id: string }[]);
    if (!item) return p;
    const res = deleteItem(p, list, item.id);
    return res.ok ? res.project : p;
  },
  // Supprimer une coloration
  (p, r) => {
    const list = pick(r, BLOCK_KEYS) as BlockListKey;
    const b = pick(r, p.sketchbook[list]);
    const c = b && pick(r, b.colorings);
    if (!b || !c) return p;
    const res = deleteColoring(p, list, b.id, c.id);
    return res.ok ? res.project : p;
  },
  // Scinder une pile
  (p, r) => {
    const list = pick(r, BLOCK_KEYS) as BlockListKey;
    const b = pick(r, p.sketchbook[list]);
    const c = b && pick(r, b.colorings);
    if (!b || !c) return p;
    return splitColorings(p, list, b.id, c.id)?.project ?? p;
  },
  // Trier / déplacer
  (p, r) => {
    const list = pick(r, LIST_KEYS) as ListKey;
    const ids = (p.sketchbook[list] as { id: string }[]).map((i) => i.id);
    if (ids.length < 2) return p;
    if (r() < 0.5) return sortByClickOrder(p, list, ids.filter(() => r() < 0.4).sort(() => r() - 0.5));
    return moveBefore(p, list, pick(r, ids)!, r() < 0.2 ? null : pick(r, ids)!);
  },
  // Renommer
  (p, r, n) => {
    const list = pick(r, LIST_KEYS) as ListKey;
    const item = pick(r, p.sketchbook[list] as { id: string }[]);
    return item ? updateCard(p, list, item.id, (c) => ({ ...c, name: `nom ${n}` })) : p;
  },
  (p, r) => setFrameColor(p, pick(r, SECTION_IDS)!, r() < 0.3 ? null : hex(r)),
  (p, r) => setMaxColorings(p, 1 + Math.floor(r() * 4)),
  (p, r) => clearUnused(p, pick(r, ["blocks", "motifs", "stencils", "fabrics"] as const)!).project,
];

describe("annuler / rétablir", () => {
  it("500 opérations aléatoires : tout annuler redonne l'état initial, tout rétablir l'état final", () => {
    for (const seed of [1, 2, 3, 42]) {
      const rand = rng(seed);
      const initial = builtInDefaultProject();
      const history = new History(initial);
      const snapshots: Project[] = [initial];
      const labels: string[] = [];

      for (let n = 0; n < 500; n++) {
        const op = OPS[Math.floor(rand() * OPS.length)] as Op;
        const before = history.state;
        const did = history.execute(`op ${n}`, (p) => op(p, rand, n));
        // Invariant : quel que soit le chemin, le projet reste valide (références, identifiants, bornes).
        validateProject(JSON.parse(JSON.stringify(history.state)));
        if (did) {
          snapshots.push(history.state);
          labels.push(`op ${n}`);
          expect(history.state).not.toBe(before);
        } else {
          expect(history.state).toBe(before);
        }
      }
      const final = history.state;
      expect(snapshots.length).toBeGreaterThan(100); // le test exerce vraiment l'historique

      // Tout annuler, en vérifiant chaque marche.
      for (let i = snapshots.length - 1; i > 0; i--) {
        expect(history.state).toEqual(snapshots[i]);
        expect(history.undo()).toBe(true);
      }
      expect(history.undo()).toBe(false);
      expect(history.state).toEqual(initial);
      expect(history.canUndo).toBe(false);

      // Tout rétablir.
      for (let i = 1; i < snapshots.length; i++) {
        expect(history.redo()).toBe(true);
        expect(history.state).toEqual(snapshots[i]);
      }
      expect(history.redo()).toBe(false);
      expect(history.state).toEqual(final);
    }
  });

  it("une nouvelle commande vide la pile de rétablissement", () => {
    const h = new History(0);
    h.execute("a", (n) => n + 1);
    h.execute("b", (n) => n + 1);
    h.undo();
    expect(h.canRedo).toBe(true);
    h.execute("c", (n) => n + 10);
    expect(h.canRedo).toBe(false);
    expect(h.state).toBe(11);
  });

  it("une commande sans effet n'est pas enregistrée", () => {
    const h = new History({ a: 1 });
    expect(h.execute("rien", (s) => s)).toBe(false);
    expect(h.canUndo).toBe(false);
  });

  it("la saisie successive dans un même champ se fond en une seule étape", () => {
    const h = new History("");
    for (const text of ["a", "ab", "abc"]) h.execute("saisie", () => text, "champ");
    h.execute("autre", () => "abcd");
    expect(h.undoLabel).toBe("autre");
    h.undo();
    expect(h.state).toBe("abc");
    h.undo();
    expect(h.state).toBe("");
    expect(h.canUndo).toBe(false);
  });

  it("l'historique est illimité", () => {
    const h = new History(0);
    for (let i = 0; i < 20_000; i++) h.execute("+1", (n) => n + 1);
    for (let i = 0; i < 20_000; i++) h.undo();
    expect(h.state).toBe(0);
  });
});

describe("session : état modifié", () => {
  it("annuler jusqu'à l'état enregistré remet le projet à « non modifié »", () => {
    const session = new ProjectSession({ project: builtInDefaultProject(), assets: new Map() }, "C:\\p\\Test.qsp");
    expect(session.modified).toBe(false);
    session.execute("couleur", (p) => addToSketchbook(p, "colors", makeColor("#123456")).project);
    expect(session.modified).toBe(true);
    session.markSaved();
    expect(session.modified).toBe(false);
    session.execute("couleur 2", (p) => addToSketchbook(p, "colors", makeColor("#654321")).project);
    expect(session.modified).toBe(true);
    session.undo();
    expect(session.modified).toBe(false);
    session.undo();
    expect(session.modified).toBe(true);
    session.redo();
    expect(session.modified).toBe(false);
  });

  it("un projet restauré après un plantage est considéré comme modifié", () => {
    const session = new ProjectSession({ project: builtInDefaultProject(), assets: new Map() }, null, { modified: true });
    expect(session.modified).toBe(true);
  });

  it("les abonnés sont prévenus à chaque changement", () => {
    const session = new ProjectSession({ project: builtInDefaultProject(), assets: new Map() }, null);
    let calls = 0;
    const off = session.subscribe(() => (calls += 1));
    session.execute("c", (p) => addToSketchbook(p, "colors", makeColor("#111111")).project);
    session.undo();
    session.redo();
    expect(calls).toBe(3);
    off();
    session.undo();
    expect(calls).toBe(3);
  });
});
