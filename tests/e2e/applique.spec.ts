import { expect, test } from "@playwright/test";
import { createProject, drag, killAllApps, launch, makeSandbox, openSketchbook, pagePoint, type Sandbox } from "./helpers";

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

async function newBlock(page: import("@playwright/test").Page, testId: string): Promise<void> {
  await page.getByTestId("worktable-block").click();
  await page.getByTestId(testId).click();
  await expect(page.getByTestId("block-canvas")).toBeVisible();
  await expect.poll(async () => Number(await page.getByTestId("block-canvas").getAttribute("data-scale"))).toBeGreaterThan(10);
}

async function click(page: import("@playwright/test").Page, x: number, y: number, detail = 1): Promise<void> {
  const p = await pagePoint(page, x, y);
  await page.mouse.click(p.x, p.y, { clickCount: detail });
}

test("Applique : un cœur dessiné avec Formes est une pièce sur un fond ; Annuler le retire ; ajout au carnet", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Applique");
  await newBlock(page, "new-applique");
  await expect(page.getByTestId("block-stage")).toHaveAttribute("data-style", "applique");
  await page.getByTestId("tool-form").click();
  await page.getByTestId("form-heart").click();
  await drag(page, [1, 1], [5, 5]);
  await expect(page.getByTestId("block-stage")).toHaveAttribute("data-shapes", "1");
  await expect(page.getByTestId("block-stage")).toHaveScreenshot("m8-applique-coeur.png");
  await page.getByTestId("tool-undo").click();
  await expect(page.getByTestId("block-stage")).toHaveAttribute("data-shapes", "0");
  await page.getByTestId("tool-redo").click();
  await expect(page.getByTestId("block-stage")).toHaveAttribute("data-shapes", "1");

  // COLORATION : le fond et le cœur sont deux pièces.
  await page.getByTestId("tab-2").click();
  await expect(page.getByTestId("piece-count")).toContainText("2");
  await page.getByTestId("tool-add").click();
  await expect(page.getByTestId("notice")).toContainText("Ajouté au carnet");
  await openSketchbook(page);
  await page.getByTestId("section-blocks").click();
  await expect(page.getByTestId("sketchbook-item")).toHaveCount(1);
  await app.close();
});

test("PolyDraw : quatre clics et la fermeture donnent une pièce ; le bloc n'est pas rempli", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Poly");
  await newBlock(page, "new-polydraw");
  await expect(page.getByTestId("grid-kind")).toHaveValue("rect");
  await page.getByTestId("tool-polyline").click();
  for (const [x, y] of [[1, 1], [4, 1], [4, 4], [1, 4], [1, 1]] as const) await click(page, x, y);
  await expect(page.getByTestId("block-stage")).toHaveAttribute("data-poly", "1");
  await expect(page.getByTestId("poly-coverage")).toContainText("25 %");
  await page.getByTestId("grid-kind").selectOption("circle");
  await expect(page.getByTestId("grid-a")).toHaveValue("4");
  await app.close();
});

test("Motif : une ellipse découpée en 4 sections donne 4 formes ; un pochoir se range dans les pochoirs", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Motif");
  await newBlock(page, "new-motif");
  await page.getByTestId("tool-ellipse").click();
  await page.getByTestId("ellipse-sections").fill("4");
  await page.getByTestId("ellipse-sections").press("Enter");
  await drag(page, [1, 1], [5, 5]);
  await expect(page.getByTestId("block-stage")).toHaveAttribute("data-shapes", "4");
  await page.getByTestId("maker-stencil").click();
  await page.getByTestId("maker-add").click();
  await expect(page.getByTestId("block-stage")).toHaveAttribute("data-shapes", "12");
  await expect(page.getByTestId("motif-as-stencil")).toBeChecked();
  await app.close();
});

test("Texte en applique : Maj+glisser au calque 2 trace une boîte ; le texte tapé devient des pièces", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Texte");
  await page.getByTestId("worktable-quilt").click();
  await expect(page.getByTestId("quilt-canvas")).toBeVisible();
  await expect.poll(async () => Number(await page.getByTestId("quilt-canvas").getAttribute("data-scale"))).toBeGreaterThan(5);
  await page.getByTestId("layout-kind-custom").click();
  await page.getByTestId("tab-3").click();
  await expect(page.getByTestId("qtool-text")).toBeDisabled(); // calque 1
  await page.getByTestId("layer-2").click();
  await page.getByTestId("qtool-text").click();
  const canvas = page.getByTestId("quilt-canvas");
  const box = (await canvas.boundingBox())!;
  const scale = Number(await canvas.getAttribute("data-scale"));
  const ox = Number(await canvas.getAttribute("data-origin-x"));
  const oy = Number(await canvas.getAttribute("data-origin-y"));
  const at = (x: number, y: number) => ({ x: box.x + ox + x * scale, y: box.y + oy + y * scale });
  const a = at(4, 4);
  const b = at(16, 9);
  await page.keyboard.down("Shift");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("text-content")).toBeVisible();
  await page.getByTestId("text-content").fill("Quilt");
  await expect(page.getByTestId("text-font")).toBeVisible();
  await page.waitForTimeout(1200); // la police se charge
  await expect(canvas).toHaveScreenshot("m8-texte.png");
  await app.close();
});
