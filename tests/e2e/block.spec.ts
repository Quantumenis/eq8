import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { createProject, killAllApps, launch, makeSandbox, menuCommand, openSketchbook, type Sandbox } from "./helpers";

test.describe.configure({ mode: "serial" });

let sandbox: Sandbox;

test.beforeEach(() => {
  sandbox = makeSandbox();
});

test.afterEach(async () => {
  await killAllApps();
  await new Promise((resolve) => setTimeout(resolve, 300));
  sandbox.dispose();
});

interface Seg {
  id: string;
  kind: "line" | "arc";
  a: { x: number; y: number };
  b: { x: number; y: number };
  sagitta?: number;
}

/** Position, à l'écran de la page, d'un point du bloc (en pouces). */
async function pagePoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId("block-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas introuvable");
  const scale = Number(await canvas.getAttribute("data-scale"));
  const ox = Number(await canvas.getAttribute("data-origin-x"));
  const oy = Number(await canvas.getAttribute("data-origin-y"));
  return { x: box.x + ox + x * scale, y: box.y + oy + y * scale };
}

async function drag(page: Page, from: [number, number], to: [number, number], during?: () => Promise<void>): Promise<void> {
  const a = await pagePoint(page, ...from);
  const b = await pagePoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  if (during) await during();
  await page.mouse.up();
}

async function segments(page: Page): Promise<Seg[]> {
  return JSON.parse((await page.getByTestId("block-stage").getAttribute("data-segments")) ?? "[]") as Seg[];
}

async function openBlockEditor(page: Page): Promise<void> {
  await page.getByTestId("worktable-block").click();
  await page.getByTestId("new-easydraw").click();
  await expect(page.getByTestId("block-canvas")).toBeVisible();
  // La zone de dessin doit avoir pris sa taille avant qu'on y vise des points.
  await expect.poll(async () => Number(await page.getByTestId("block-canvas").getAttribute("data-scale"))).toBeGreaterThan(10);
}

test("un bloc de 6 × 6 po : la diagonale glissée est un segment (0,0)-(6,6) ; annuler le retire", async () => {
  const { app, page } = await launch(sandbox);
  await openBlockEditor(page);
  await expect(page.getByTestId("block-width")).toHaveValue("6");
  await expect(page.getByTestId("block-height")).toHaveValue("6");
  await expect(page.getByTestId("snap-x")).toHaveValue("24");

  await drag(page, [0, 0], [6, 6]);
  let list = await segments(page);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ kind: "line", a: { x: 0, y: 0 }, b: { x: 6, y: 6 } });

  await page.getByTestId("tool-undo").click();
  expect(await segments(page)).toHaveLength(0);
  await page.getByTestId("tool-redo").click();
  list = await segments(page);
  expect(list).toHaveLength(1);

  // Les captures de référence : 100 % puis 400 %.
  await page.getByTestId("zoom-level").click();
  await expect(page.getByTestId("zoom-level")).toHaveText("100 %");
  await page.mouse.move(0, 0);
  await expect(page.getByTestId("block-stage")).toHaveScreenshot("m2-bloc-100.png");
  for (let i = 0; i < 4; i++) await page.getByTestId("zoom-in").click();
  await expect(page.getByTestId("zoom-level")).toHaveText("400 %");
  await page.mouse.move(0, 0);
  await expect(page.getByTestId("block-stage")).toHaveScreenshot("m2-bloc-400.png");
  await app.close();
});

test("accrochage à la grille : un tracé approximatif tombe sur les points de 0,25 po", async () => {
  const { app, page } = await launch(sandbox);
  await openBlockEditor(page);
  await drag(page, [1.06, 1.94], [4.88, 3.07]);
  const [seg] = await segments(page);
  expect(seg).toMatchObject({ a: { x: 1, y: 2 }, b: { x: 5, y: 3 } });
  await app.close();
});

test("outil Grille : 3 × 3 sur tout le bloc donne 4 segments intérieurs ; l'arc se retourne avec la barre d'espace", async () => {
  const { app, page } = await launch(sandbox);
  await openBlockEditor(page);
  await page.getByTestId("tool-grid").click();
  await drag(page, [0, 0], [6, 6]);
  const grid = await segments(page);
  expect(grid).toHaveLength(4);
  expect(
    grid
      .filter((s) => s.a.x === s.b.x)
      .map((s) => s.a.x)
      .sort(),
  ).toEqual([2, 4]);

  await page.getByTestId("tool-arc").click();
  await drag(page, [0, 1], [2, 1]);
  await drag(page, [0, 5], [2, 5], async () => {
    await page.keyboard.press("Space");
  });
  const all = await segments(page);
  const arcs = all.filter((s) => s.kind === "arc");
  expect(arcs).toHaveLength(2);
  expect(Math.abs(arcs[0]?.sagitta ?? 0)).toBeCloseTo(1, 9);
  expect(Math.sign(arcs[0]?.sagitta ?? 0)).toBe(-Math.sign(arcs[1]?.sagitta ?? 0));
  await app.close();
});

test("sélection, symétrie, suppression et édition des nœuds", async () => {
  const { app, page } = await launch(sandbox);
  await openBlockEditor(page);
  await drag(page, [1, 1], [2, 3]);

  // Sélection au clic, puis miroir gauche-droite avec clone.
  await page.getByTestId("tool-pick").click();
  const mid = await pagePoint(page, 1.5, 2);
  await page.mouse.click(mid.x, mid.y);
  await expect(page.getByTestId("selection-count")).toContainText("1 segment");
  await page.getByTestId("sym-clone").check();
  await page.getByTestId("sym-lr").click();
  let list = await segments(page);
  expect(list).toHaveLength(2);
  expect(list[1]).toMatchObject({ a: { x: 5, y: 1 }, b: { x: 4, y: 3 } });

  // Ctrl+A puis Suppr.
  await page.getByTestId("block-canvas").focus();
  await page.keyboard.press("Control+a");
  await expect(page.getByTestId("selection-count")).toContainText("2 segments");
  await page.keyboard.press("Delete");
  expect(await segments(page)).toHaveLength(0);
  await page.getByTestId("tool-undo").click();
  expect(await segments(page)).toHaveLength(2);

  // Édition : partitionner un segment en 5.
  await page.getByTestId("tool-edit").click();
  const again = await pagePoint(page, 1.5, 2);
  await page.mouse.click(again.x, again.y);
  await page.getByTestId("node-partition-n").fill("5");
  await page.getByTestId("node-partition").click();
  list = await segments(page);
  expect(list).toHaveLength(6);

  // Déplacer un nœud : le nœud (1, 1) va en (1, 0,5), accroché à la grille.
  const start = await pagePoint(page, 1, 1);
  const end = await pagePoint(page, 1, 0.5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  list = await segments(page);
  expect(list.some((s) => (s.a.x === 1 && s.a.y === 0.5) || (s.b.x === 1 && s.b.y === 0.5))).toBe(true);
  await app.close();
});

test("ajouter au carnet : le bloc est enregistré, un doublon est refusé, « Modifier » rouvre le dessin", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Dessin");
  await openBlockEditor(page);

  // Un bloc vide n'est pas ajouté.
  await page.getByTestId("tool-add").click();
  await expect(page.getByTestId("notice")).toContainText("vide");

  await drag(page, [0, 0], [6, 6]);
  await page.getByTestId("tool-add").click();
  await expect(page.getByTestId("notice")).toContainText("Ajouté au carnet");
  await expect(page.getByTestId("save-state")).toHaveText("Enregistré");

  // Le fichier du projet contient le dessin.
  const files = unzipSync(new Uint8Array(readFileSync(sandbox.projectFile("Dessin"))));
  const project = JSON.parse(strFromU8(files["project.json"] as Uint8Array)) as {
    sketchbook: { blocks: { width: number; height: number; drawing: { kind: string; segments: Seg[] } }[] };
  };
  expect(project.sketchbook.blocks).toHaveLength(1);
  const block = project.sketchbook.blocks[0];
  expect(block?.width).toBe(6);
  expect(block?.drawing.kind).toBe("easydraw");
  expect(block?.drawing.segments).toHaveLength(1);
  expect(block?.drawing.segments[0]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 6, y: 6 } });

  // Un second ajout identique est reconnu.
  await page.getByTestId("tool-add").click();
  await expect(page.getByTestId("notice")).toContainText("Déjà présent");

  // Nouveau bloc vide, puis « Modifier » le bloc du carnet : son dessin revient.
  await page.getByTestId("tab-0").click();
  await page.getByTestId("new-easydraw").click();
  expect(await segments(page)).toHaveLength(0);
  await openSketchbook(page);
  await page.getByTestId("section-blocks").click();
  await expect(page.getByTestId("sketchbook-item")).toHaveCount(1);
  await page.getByTestId("sketchbook-item").first().click();
  await page.getByTestId("edit-item").click();
  await expect(page.getByTestId("sketchbook")).toHaveCount(0);
  const back = await segments(page);
  expect(back).toHaveLength(1);
  expect(back[0]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 6, y: 6 } });
  await app.close();
});

test("annuler/rétablir du plan Bloc par le menu", async () => {
  const { app, page } = await launch(sandbox);
  await openBlockEditor(page);
  await drag(page, [0, 0], [3, 3]);
  expect(await segments(page)).toHaveLength(1);
  await menuCommand(app, "undo");
  await expect.poll(async () => (await segments(page)).length).toBe(0);
  await menuCommand(app, "redo");
  await expect.poll(async () => (await segments(page)).length).toBe(1);
  await app.close();
});
