import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { encodePng } from "../../src/core/image/png";
import { createRaster } from "../../src/core/image/raster";
import { createProject, killAllApps, launch, makeSandbox, menuCommand, openSketchbook, stubSaveChangesAnswer, waitForFile, type Sandbox } from "./helpers";

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

/** Un dégradé rouge → bleu de 240 × 160 px à 80 ppp (3 × 2 po). */
function gradientPng(file: string): string {
  const r = createRaster(240, 160);
  for (let y = 0; y < 160; y++)
    for (let x = 0; x < 240; x++) {
      const o = (y * 240 + x) * 4;
      r.data[o] = Math.round(255 * (1 - x / 239));
      r.data[o + 1] = 40;
      r.data[o + 2] = Math.round(255 * (x / 239));
      r.data[o + 3] = 255;
    }
  writeFileSync(file, encodePng(r, 80));
  return file;
}

async function stubOpenDialog(app: ElectronApplication, files: string[]): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    (dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({ canceled: false, filePaths: chosen });
  }, files);
}

async function stubSaveDialog(app: ElectronApplication, file: string): Promise<void> {
  await app.evaluate(({ dialog }, target) => {
    (dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, file);
}

function readProject(file: string): { sketchbook: Record<string, { layout?: { items?: { embroidery?: unknown; photoId?: string; layer?: number }[] } }[]> } {
  return JSON.parse(strFromU8(unzipSync(readFileSync(file))["project.json"] as Uint8Array));
}

/** Importe l'image, puis l'enregistre dans Photos. */
async function importPhoto(app: ElectronApplication, page: Page): Promise<void> {
  const png = gradientPng(path.join(sandbox.root, "degrade.png"));
  await stubOpenDialog(app, [png]);
  await menuCommand(app, "import-image");
  await expect(page.getByTestId("image-canvas")).toHaveAttribute("data-width", "240");
  await page.getByTestId("image-add-photo").click();
}

test("plan Image : couleurs (teinte), histogramme (égaliser), annuler ; mise en page de photos exportée en PDF", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Retouche");
  await importPhoto(app, page);

  // Ajuster la couleur : l'onglet Teinte / Sat. / Lum., puis Appliquer ; l'étape est annulable.
  await page.getByTestId("image-color").click();
  await expect(page.getByTestId("color-dialog")).toBeVisible();
  await expect(page.getByTestId("color-before")).toBeVisible();
  await page.getByTestId("color-tab-hsl").click();
  await page.getByTestId("color-h").fill("90");
  await page.getByTestId("color-apply").click();
  await page.getByTestId("color-close").click();
  await expect(page.getByTestId("tool-undo")).toHaveAttribute("title", /Ajuster la couleur/);

  // Histogramme : égaliser en YUV puis appliquer.
  await page.getByTestId("image-histogram").click();
  await expect(page.getByTestId("histogram-canvas")).toBeVisible();
  await page.getByTestId("equalize-preview").click();
  await page.getByTestId("histogram-apply").click();
  await page.getByRole("button", { name: "Fermer" }).last().click();
  await expect(page.getByTestId("tool-undo")).toHaveAttribute("title", /Histogramme/);
  await page.getByTestId("tool-undo").click();
  await expect(page.getByTestId("tool-undo")).toHaveAttribute("title", /Ajuster la couleur/);

  // Mise en page : une photo du carnet posée à sa taille enregistrée (3 × 2 po), pivotée, exportée en PDF.
  await page.getByTestId("image-layout").click();
  await expect(page.getByTestId("layout-page")).toBeVisible();
  await page.getByTestId("layout-photo").first().click();
  await expect(page.getByTestId("layout-page")).toHaveAttribute("data-items", "1");
  await page.getByTestId("layout-rot-right").click();
  await page.getByTestId("layout-place-centerPage").click();
  const pdf = path.join(sandbox.root, "page.pdf");
  await stubSaveDialog(app, pdf);
  await page.getByTestId("layout-export").click();
  await waitForFile(pdf);
  expect(readFileSync(pdf).subarray(0, 4).toString()).toBe("%PDF");
  await page.getByTestId("layout-close").click();
  await app.close();
});

test("Photo Patchwork : un One Patch coloré d'après une photo du carnet", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Patchwork");
  await importPhoto(app, page);
  await page.getByTestId("worktable-quilt").click();
  await expect(page.getByTestId("quilt-canvas")).toBeVisible();
  await page.getByTestId("layout-kind-onepatch").click();
  await page.getByTestId("tab-3").click();
  await expect(page.getByTestId("patchwork-panel")).toBeVisible();
  const photo = page.getByTestId("patch-photo");
  await photo.selectOption({ index: 1 });
  await page.getByTestId("patch-fit-distort").click();
  await page.getByTestId("patch-show-quilt").click();
  await expect(page.getByTestId("quilt-canvas")).toBeVisible();
  await page.getByTestId("patch-apply").click();
  await expect(page.getByTestId("notice")).toContainText("pièces colorées");
  await app.close();
});

test("broderie au calque 3 et photo au calque 2 : posées, enregistrées avec le quilt", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Broderies");
  await importPhoto(app, page);

  await menuCommand(app, "show-embroidery-library");
  await expect(page.getByTestId("item-library-embroideries")).toBeVisible();
  expect(await page.getByTestId("item-card").count()).toBeGreaterThanOrEqual(10);
  await page.getByTestId("item-card").nth(2).click(); // Cœur
  await page.getByTestId("item-library-add").click();
  await expect(page.getByTestId("notice")).toContainText("ajouté au carnet");
  await page.getByTestId("item-library-close").click();

  await page.getByTestId("worktable-quilt").click();
  await page.getByTestId("layout-kind-custom").click();
  await page.getByTestId("tab-3").click();
  const canvas = page.getByTestId("quilt-canvas");
  await expect.poll(async () => Number(await canvas.getAttribute("data-scale"))).toBeGreaterThan(5);
  const box = (await canvas.boundingBox())!;
  const scale = Number(await canvas.getAttribute("data-scale"));
  const ox = Number(await canvas.getAttribute("data-origin-x"));
  const oy = Number(await canvas.getAttribute("data-origin-y"));
  const at = (x: number, y: number) => ({ x: box.x + ox + x * scale, y: box.y + oy + y * scale });

  // Photo au calque 2.
  await page.getByTestId("layer-2").click();
  await page.getByTestId("photo-choice").selectOption({ index: 1 });
  await page.getByTestId("qtool-photo").click();
  let p = at(12, 12);
  await page.mouse.click(p.x, p.y);
  // Broderie au calque 3, rendu 3D.
  await page.getByTestId("layer-3").click();
  await page.getByTestId("embroidery-choice").selectOption({ index: 1 });
  await page.getByTestId("embroidery-render").selectOption("3d");
  await page.getByTestId("qtool-embroidery").click();
  p = at(30, 20);
  await page.mouse.click(p.x, p.y);
  await expect(canvas).toHaveScreenshot("m9-photo-broderie.png");

  await page.getByTestId("tool-add").click();
  await expect(page.getByTestId("notice")).toContainText("ajouté au carnet");
  await app.close();
  const project = readProject(sandbox.projectFile("Broderies"));
  const quilt = project.sketchbook.quilts?.[0];
  const items = quilt?.layout?.items ?? [];
  expect(items.some((i) => i.photoId && i.layer === 2)).toBe(true);
  expect(items.some((i) => i.embroidery && i.layer === 3)).toBe(true);
  expect(project.sketchbook.embroideries).toHaveLength(1);
});

test("bibliothèque de blocs : recherche par catégories (ET) et par texte sans accent ; quilt rapide ; accueil", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Recherche");
  await page.getByTestId("tool-library").click();
  const library = page.getByTestId("block-library");
  await library.waitFor();
  await page.getByTestId("library-search").click();
  await page.getByTestId("search-by-categories").check();
  await page.getByTestId("category-Étoile").click();
  await page.getByTestId("category-Triangles").click();
  await page.getByTestId("search-run").click();
  const both = await page.getByTestId("library-item").count();
  expect(both).toBeGreaterThanOrEqual(4);
  await page.getByTestId("library-search").click();
  await page.getByTestId("search-by-categories").check();
  await page.getByTestId("category-Étoile").click();
  await page.getByTestId("category-Pochoir").click();
  await page.getByTestId("search-run").click();
  await expect(page.getByTestId("library-item")).toHaveCount(0);
  await page.getByTestId("library-search").click();
  await page.getByTestId("search-text").fill("MOULINET");
  await page.getByTestId("search-field-name").uncheck();
  await page.getByTestId("search-field-reference").uncheck();
  await page.getByTestId("search-run").click();
  expect(await page.getByTestId("library-item").count()).toBeGreaterThanOrEqual(1);
  await library.getByRole("button", { name: "Fermer" }).last().click();

  await menuCommand(app, "open-quick-quilt");
  await expect(page.getByTestId("item-library-quick")).toBeVisible();
  expect(await page.getByTestId("item-card").count()).toBeGreaterThanOrEqual(10);
  await page.getByTestId("item-card").first().click();
  await page.getByTestId("item-library-add").click();
  await expect(page.getByTestId("project-name")).toContainText("Sans titre");
  await openSketchbook(page);
  await page.getByTestId("section-quilts").click();
  await expect(page.getByTestId("sketchbook-item")).toHaveCount(1);
  await page.getByTestId("sketchbook").getByRole("button", { name: "Fermer" }).first().click();

  await menuCommand(app, "show-home");
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(page.getByTestId("home-tip")).toBeVisible();
  const tip = await page.getByTestId("home-tip").innerText();
  await page.getByTestId("home-next-tip").click();
  expect(await page.getByTestId("home-tip").innerText()).not.toBe(tip);
  await page.getByTestId("home-close").click();
  await menuCommand(app, "show-help");
  await expect(page.getByTestId("help")).toBeVisible();
  await stubSaveChangesAnswer(app, 1); // le quilt rapide ouvert est un projet modifié et jamais enregistré
  await app.close();
});

test("préférences d'affichage : ruban sur le côté, petites icônes, astuces masquées", async () => {
  const { app, page } = await launch(sandbox);
  await menuCommand(app, "preferences");
  await page.getByTestId("prefs-side-ribbon").check();
  await page.getByTestId("prefs-small-icons").check();
  await page.getByTestId("prefs-hide-tips").check();
  const root = page.locator(".app");
  await expect(root).toHaveAttribute("data-ribbon", "side");
  await expect(root).toHaveAttribute("data-icons", "small");
  await expect(root).toHaveAttribute("data-tips", "off");
  expect(existsSync(sandbox.root)).toBe(true);
  await app.close();
});
