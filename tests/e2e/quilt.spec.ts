import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { createProject, killAllApps, launch, makeSandbox, openSketchbook, waitForFile, type Sandbox } from "./helpers";

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

/** Position, à l'écran de la page, d'un point du quilt (en pouces, repère du centre). */
async function quiltPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId("quilt-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas introuvable");
  const scale = Number(await canvas.getAttribute("data-scale"));
  const ox = Number(await canvas.getAttribute("data-origin-x"));
  const oy = Number(await canvas.getAttribute("data-origin-y"));
  return { x: box.x + ox + x * scale, y: box.y + oy + y * scale };
}

async function clickQuilt(page: Page, x: number, y: number, modifiers: ("Control" | "Alt" | "Shift")[] = []): Promise<void> {
  const p = await quiltPoint(page, x, y);
  await page.mouse.move(p.x, p.y);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.down();
  await page.mouse.up();
  for (const m of modifiers) await page.keyboard.up(m);
}

async function barNumber(page: Page, attribute: string): Promise<number> {
  return Number(await page.getByTestId("quilt-bar").getAttribute(attribute));
}

async function addLibraryBlocks(page: Page, names: string[]): Promise<void> {
  await page.getByTestId("tool-library").click();
  const library = page.getByTestId("block-library");
  await library.waitFor();
  await page.getByTestId("library-style").filter({ hasText: "Carrés et bandes" }).click();
  for (const name of names) {
    await page.getByTestId("library-item").filter({ hasText: name }).first().click();
    await page.getByTestId("library-add").click();
  }
  await library.getByRole("button", { name: "Fermer" }).last().click();
}

async function waitForQuiltCanvas(page: Page): Promise<void> {
  await expect(page.getByTestId("quilt-canvas")).toBeVisible();
  await expect.poll(async () => Number(await page.getByTestId("quilt-canvas").getAttribute("data-scale"))).toBeGreaterThan(5);
}

test("Horizontal 4 × 5 : Ctrl+clic remplit tout, Alt+clic un sur deux, pinceau avec Ctrl", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Quilts");
  await addLibraryBlocks(page, ["Nine Patch", "Four Patch"]);

  await page.getByTestId("worktable-quilt").click();
  await waitForQuiltCanvas(page);
  // NOUVEAU QUILT : Horizontal est le style de départ ; on choisit la disposition puis on passe à DESIGN.
  await page.getByTestId("layout-kind-horizontal").click();
  await expect(page.getByTestId("center-size")).toHaveAttribute("data-width", "32");
  await expect(page.getByTestId("center-size")).toHaveAttribute("data-height", "40");
  await expect(page.getByTestId("quilt-size")).toContainText("32 po × 40 po");
  await page.getByTestId("tab-3").click();
  await expect(page.getByTestId("block-thumb")).toHaveCount(2);

  // Le premier bloc du carnet est déjà choisi ; le bloc se pose en Ctrl+clic partout.
  const [nine, four] = await page.getByTestId("block-thumb").evaluateAll((els) => els.map((e) => e.getAttribute("data-block") ?? ""));
  await page.getByTestId("block-thumb").first().click();
  await clickQuilt(page, 4, 5);
  expect(await barNumber(page, "data-set")).toBe(1);
  await clickQuilt(page, 4, 5, ["Control"]);
  expect(await barNumber(page, "data-set")).toBe(20);

  // Alt+clic avec un autre bloc : un emplacement sur deux (10 des 20), l'ancien est remplacé.
  await page.getByTestId("block-thumb").nth(1).click();
  await clickQuilt(page, 4, 5, ["Alt"]);
  expect(await barNumber(page, "data-set")).toBe(20);
  const counts = JSON.parse((await page.getByTestId("quilt-bar").getAttribute("data-counts")) ?? "{}") as Record<string, number>;
  expect(counts[nine!]).toBe(10);
  expect(counts[four!]).toBe(10);

  // Annuler retire la dernière pose (l'Alt+clic) ; rétablir la rend.
  await page.getByTestId("tool-undo").click();
  expect(JSON.parse((await page.getByTestId("quilt-bar").getAttribute("data-counts")) ?? "{}")[nine!]).toBe(20);
  await page.getByTestId("tool-redo").click();
  expect(JSON.parse((await page.getByTestId("quilt-bar").getAttribute("data-counts")) ?? "{}")[four!]).toBe(10);

  // Pinceau + Ctrl : la pièce touchée est colorée dans tous les blocs identiques (ici les 10 Four Patch).
  await page.getByTestId("qtool-brush").click();
  await page.getByTestId("ptab-colors").click();
  await page.locator('[data-testid="swatch"][data-rgb="#c62828"]').click();
  await clickQuilt(page, 2, 2, ["Control"]);
  expect(await barNumber(page, "data-fills")).toBe(10);
  await clickQuilt(page, 2, 2);
  expect(await barNumber(page, "data-fills")).toBe(10);

  // Une capture du quilt posé.
  await page.mouse.move(0, 0);
  await expect(page.getByTestId("quilt-stage")).toHaveScreenshot("m5-quilt-horizontal.png");
  await app.close();
});

test("tailles des dispositions, bandes, One Patch et Custom Set ; ajout au carnet et relecture du fichier", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Dispositions");
  await page.getByTestId("worktable-quilt").click();
  await waitForQuiltCanvas(page);

  // Sur la pointe : 3 × 3 blocs de 10 po, lattis de 1,5 po : 48,790 po.
  await page.getByTestId("layout-kind-onpoint").click();
  await expect(page.getByTestId("center-size")).toHaveAttribute("data-width", /^48\.79/);
  await page.getByTestId("block-b").fill("10");
  await page.getByTestId("block-b").blur();
  await page.getByTestId("sash-s").fill("1,5");
  await page.getByTestId("sash-s").blur();
  await expect(page.getByTestId("center-size")).toContainText("48,79");
  await expect(page.getByTestId("quilt-canvas")).toHaveAttribute("data-slots", /^\d+$/);

  // Pointe variable : 33 × 51,333 po.
  await page.getByTestId("tab-0").click();
  await page.getByTestId("layout-kind-varpoint").click();
  await expect(page.getByTestId("center-size")).toHaveAttribute("data-width", "33");
  await expect(page.getByTestId("center-size")).toContainText("33 po × 51,333 po");

  // Horizontal avec lattis et bordure de lattis : 37 × 46 po.
  await page.getByTestId("tab-0").click();
  await page.getByTestId("layout-kind-horizontal").click();
  await page.getByTestId("equal-block").uncheck();
  await page.getByTestId("block-w").fill("8");
  await page.getByTestId("block-w").blur();
  await page.getByTestId("block-h").fill("8");
  await page.getByTestId("block-h").blur();
  await page.getByTestId("sash-w").fill("1");
  await page.getByTestId("sash-w").blur();
  await page.getByTestId("sash-border").check();
  await expect(page.getByTestId("center-size")).toHaveAttribute("data-width", "37");
  await expect(page.getByTestId("center-size")).toHaveAttribute("data-height", "46");

  // Bandes : une bande ajoutée, damier, formule.
  await page.getByTestId("tab-0").click();
  await page.getByTestId("layout-kind-stripsH").click();
  await page.getByTestId("strip-add").click();
  await expect(page.getByTestId("strip-position")).toHaveText("Bande 2 sur 2");
  await page.getByTestId("strip-style").selectOption("checkerboard");
  await expect(page.getByTestId("strip-across")).toBeVisible();
  await expect(page.getByTestId("center-size")).toHaveAttribute("data-height", "4");

  // One Patch : un carré de 3 po, 8 × 10 unités.
  await page.getByTestId("tab-0").click();
  await page.getByTestId("layout-kind-onepatch").click();
  await expect(page.getByTestId("center-size")).toHaveAttribute("data-width", "24");
  await expect(page.getByTestId("center-size")).toHaveAttribute("data-height", "30");
  await expect(page.getByTestId("quilt-canvas")).toHaveAttribute("data-slots", "80");

  // Custom Set : 48 × 60 po, vide.
  await page.getByTestId("tab-0").click();
  await page.getByTestId("layout-kind-custom").click();
  await expect(page.getByTestId("center-size")).toHaveAttribute("data-width", "48");
  await expect(page.getByTestId("quilt-canvas")).toHaveAttribute("data-slots", "0");

  // Un quilt vide ne va pas au carnet.
  await page.getByTestId("tool-add").click();
  await expect(page.getByTestId("notice")).toContainText("Posez au moins un bloc");

  // Horizontal 4 × 5, une pièce colorée : le quilt entre au carnet et le fichier le contient.
  await page.getByTestId("tab-0").click();
  await page.getByTestId("layout-kind-horizontal").click();
  await page.getByTestId("tab-3").click();
  await page.getByTestId("ptab-colors").click();
  await page.getByTestId("qtool-brush").click();
  await page.locator('[data-testid="swatch"][data-rgb="#c62828"]').click();
  await clickQuilt(page, 4, 4);
  expect(await barNumber(page, "data-fills")).toBe(1);
  await page.getByTestId("tool-add").click();
  await expect(page.getByTestId("notice")).toContainText("Quilt ajouté au carnet");
  await page.getByTestId("tool-add").click();
  await expect(page.getByTestId("notice")).toContainText("déjà dans le carnet");
  await waitForFile(sandbox.projectFile("Dispositions"));

  await openSketchbook(page);
  await page.getByTestId("section-quilts").click();
  await expect(page.getByTestId("sketchbook-item")).toHaveCount(1);
  await expect(page.getByTestId("quilt-thumb-svg")).toHaveCount(1);
  await page.getByTestId("sketchbook").getByRole("button", { name: "Fermer" }).first().click();
  await page.waitForTimeout(300);
  await app.close();

  const entries = unzipSync(new Uint8Array(readFileSync(sandbox.projectFile("Dispositions"))));
  const project = JSON.parse(strFromU8(entries["project.json"] as Uint8Array)) as { sketchbook: { quilts: { layout: { layout: { kind: string; nh: number; nv: number }; set: object }; fills: Record<string, { kind: string; rgb: string }> }[] } };
  expect(project.sketchbook.quilts).toHaveLength(1);
  const q = project.sketchbook.quilts[0]!;
  expect(q.layout.layout.kind).toBe("horizontal");
  expect(q.layout.layout.nh).toBe(4);
  expect(Object.values(q.fills)).toEqual([{ kind: "solid", rgb: "#c62828" }]);
});

test("Custom Set : poser un bloc, le déplacer, le redimensionner, le supprimer ; Symétrie et rotation du tissu", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Custom");
  await addLibraryBlocks(page, ["Nine Patch"]);
  await page.getByTestId("worktable-quilt").click();
  await waitForQuiltCanvas(page);
  await page.getByTestId("layout-kind-custom").click();
  await page.getByTestId("tab-3").click();
  await page.getByTestId("block-thumb").first().click();

  // Poser librement : le bloc arrive à sa taille de conception (6 po), accroché à la grille de 1/4 po.
  await clickQuilt(page, 10, 10);
  await expect(page.getByTestId("quilt-canvas")).toHaveAttribute("data-items", "1");
  await page.getByTestId("qtool-adjust").click();
  await clickQuilt(page, 13, 13);
  await expect(page.getByTestId("adjust-count")).toContainText("1 élément sélectionné");
  await expect(page.getByTestId("adjust-x")).toHaveValue("10");
  await expect(page.getByTestId("adjust-w")).toHaveValue("6");

  // Saisir X, Y et la largeur.
  await page.getByTestId("adjust-x").fill("2");
  await page.getByTestId("adjust-x").blur();
  await page.getByTestId("adjust-w").fill("12");
  await page.getByTestId("adjust-w").blur();
  await expect(page.getByTestId("adjust-x")).toHaveValue("2");
  await expect(page.getByTestId("adjust-w")).toHaveValue("12");

  // Glisser pour déplacer (avec accrochage).
  const from = await quiltPoint(page, 6, 13);
  const to = await quiltPoint(page, 9.1, 13);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, from.y, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId("adjust-x")).toHaveValue("5");
  await page.getByTestId("tool-undo").click();
  await expect(page.getByTestId("adjust-x")).toHaveValue("2");

  // Supprimer avec la touche Suppr.
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("quilt-canvas")).toHaveAttribute("data-items", "0");
  await page.getByTestId("tool-undo").click();
  await expect(page.getByTestId("quilt-canvas")).toHaveAttribute("data-items", "1");
  await app.close();
});

test("Symétrie : 16 états puis retour à l'état d'origine", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Symetrie");
  await page.getByTestId("tool-library").click();
  const library = page.getByTestId("block-library");
  await library.waitFor();
  await page.getByTestId("library-style").filter({ hasText: "Log Cabin" }).click();
  await page.getByTestId("library-item").filter({ hasText: "Log Cabin" }).first().click();
  await page.getByTestId("library-add").click();
  await library.getByRole("button", { name: "Fermer" }).last().click();

  await page.getByTestId("worktable-quilt").click();
  await waitForQuiltCanvas(page);
  await page.getByTestId("layout-kind-horizontal").click();
  await page.getByTestId("tab-3").click();
  await page.getByTestId("block-thumb").first().click();
  await clickQuilt(page, 4, 5, ["Control"]);
  expect(await barNumber(page, "data-set")).toBe(20);
  const snapshot = async () => page.getByTestId("quilt-stage").screenshot();
  await page.mouse.move(0, 0);
  const original = await snapshot();
  await page.getByTestId("qtool-symmetry").click();
  const seen: Buffer[] = [];
  for (let i = 0; i < 16; i++) {
    await clickQuilt(page, 4, 5);
    await page.mouse.move(0, 0);
    seen.push(await snapshot());
  }
  const distinct = new Set(seen.map((b) => b.toString("base64")));
  expect(distinct.size).toBe(16);
  expect(seen.some((b) => b.equals(original))).toBe(false);
  await clickQuilt(page, 4, 5);
  await page.mouse.move(0, 0);
  const last = await snapshot();
  if (!last.equals(original)) {
    const dir = process.env.QS_DEBUG_DIR;
    if (dir) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(dir + "/original.png", original);
      writeFileSync(dir + "/last.png", last);
    }
  }
  expect(last.equals(original)).toBe(true);
  await app.close();
});
