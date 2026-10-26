import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { decodePng } from "../../src/core/image/png";
import { readPdf } from "../unit/pdf-reader";
import { createProject, drag, killAllApps, launch, makeSandbox, openBlockEditor, waitForFile, type Sandbox } from "./helpers";

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

async function addFromLibrary(page: Page, style: string, name: string): Promise<void> {
  await page.getByTestId("tool-library").click();
  const library = page.getByTestId("block-library");
  await library.waitFor();
  await page.getByTestId("library-style").filter({ hasText: style }).click();
  await page.getByTestId("library-item").filter({ hasText: name }).first().click();
  await page.getByTestId("library-add").click();
  await library.getByRole("button", { name: "Fermer" }).last().click();
}

/** Remplace la boîte « Exporter » native : elle « choisit » ce fichier. */
async function stubSaveDialog(app: ElectronApplication, file: string): Promise<void> {
  await app.evaluate(({ dialog }, target) => {
    (dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, file);
}

/** Un quilt Horizontal 4 × 5 de blocs de 8 po, Ohio Star posé partout, puis l'onglet IMPRIMER & EXPORTER. */
async function ohioQuilt(page: Page): Promise<void> {
  await createProject(page, "Patrons");
  await addFromLibrary(page, "Étoiles simples", "Ohio Star");
  await page.getByTestId("worktable-quilt").click();
  await expect(page.getByTestId("quilt-canvas")).toBeVisible();
  await expect.poll(async () => Number(await page.getByTestId("quilt-canvas").getAttribute("data-scale"))).toBeGreaterThan(5);
  await page.getByTestId("layout-kind-horizontal").click();
  await page.getByTestId("tab-3").click();
  await page.getByTestId("block-thumb").first().click();
  await clickQuilt(page, 4, 4, ["Control"]);
  await expect(page.getByTestId("quilt-bar")).toHaveAttribute("data-set", "20");
  await page.getByTestId("tab-4").click();
}

test("Imprimer > Gabarits > Exporter en PDF : pages, lettres et échelle ; aperçu et tableau de découpe", async () => {
  const { app, page } = await launch(sandbox);
  await ohioQuilt(page);

  // Sans élément choisi, seuls Quilt et Métrage sont actifs ; un clic entoure le bloc en vert et donne sa taille.
  await expect(page.getByTestId("print-kind-templates")).toBeDisabled();
  await expect(page.getByTestId("print-kind-quilt")).toBeEnabled();
  await clickQuilt(page, 4, 4);
  await expect(page.getByTestId("print-selection")).toContainText("Ohio Star — 8 po × 8 po");
  await expect(page.getByTestId("print-kind-rotary")).toBeEnabled();

  await page.getByTestId("print-kind-templates").click();
  const dialog = page.getByTestId("print-dialog");
  await dialog.waitFor();
  await expect(page.getByTestId("print-page-count")).toContainText("1 page");

  // Aperçu des gabarits : une capture, puis la retouche (supprimer un gabarit) et « Réinitialiser ».
  await page.getByTestId("print-preview-open").click();
  const preview = page.getByTestId("print-preview");
  await preview.waitFor();
  await expect(preview).toHaveAttribute("data-pages", "1");
  await expect(page.getByTestId("preview-page").first()).toHaveScreenshot("m7-apercu-gabarits.png");
  await page.getByTestId("preview-close").click();

  // Exporter en PDF : fichier écrit, une page, lettres A et B, et l'échelle des gabarits.
  const pdfFile = path.join(sandbox.root, "gabarits.pdf");
  await stubSaveDialog(app, pdfFile);
  await page.getByTestId("print-export-pdf").click();
  await waitForFile(pdfFile);
  await expect(page.getByTestId("notice")).toContainText("Exporté");
  const bytes = new Uint8Array(readFileSync(pdfFile));
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
  const text = execFileSync("pdftotext", ["-enc", "UTF-8", "-layout", pdfFile, "-"], { encoding: "utf8" });
  expect(text).toMatch(/\bA\b/);
  expect(text).toMatch(/\bB\b/);
  expect(text).toContain("Couper 5");
  expect(text).toContain("Couper 16");
  expect(text).toContain("Ohio Star — 8 × 8 po — Patrons");
  // Carré de 8/3 po (bloc de 8 po sur une grille de 3) : couture 192 pt, coupe 228 pt avec la marge de 1/4 po.
  const [page1] = await readPdf(bytes);
  const widths = page1?.paths.map((p) => Math.round(p.box.width * 100) / 100) ?? [];
  expect(widths).toContain(192);
  expect(widths).toContain(228);
  await dialog.getByRole("button", { name: "Fermer" }).last().click();

  // Tableau de découpe rotative : 3 3/16 (carrés) et 3 7/8 (quarts de carré) à l'arrondi 1/16 par défaut.
  await page.getByTestId("print-kind-rotary").click();
  await page.getByTestId("print-dialog").waitFor();
  await page.getByTestId("print-preview-open").click();
  await page.getByTestId("print-preview").waitFor();
  await expect(page.getByTestId("preview-page").first()).toHaveScreenshot("m7-decoupe-rotative.png");
  await page.getByTestId("preview-close").click();
  const rotaryFile = path.join(sandbox.root, "decoupe.pdf");
  await stubSaveDialog(app, rotaryFile);
  await page.getByTestId("print-export-pdf").click();
  await waitForFile(rotaryFile);
  const rotaryText = execFileSync("pdftotext", ["-enc", "UTF-8", "-layout", rotaryFile, "-"], { encoding: "utf8" });
  expect(rotaryText).toContain("3 3/16 po");
  expect(rotaryText).toContain("3 7/8 po");
  expect(rotaryText).toContain("deux diagonales");
  await app.close();
});

test("Quilt, Métrage, Fondation, export PNG et impression (dialogue Windows remplacé par un PDF)", async () => {
  const printDir = path.join(sandbox.root, "impressions");
  const { app, page } = await launch(sandbox, { env: { QUILT_STUDIO_PRINT_TO_PDF: printDir } });
  await ohioQuilt(page);

  // Métrage : une ligne par tissu ou couleur de la coloration du bloc.
  await page.getByTestId("print-kind-yardage").click();
  await page.getByTestId("print-dialog").waitFor();
  await expect(page.getByTestId("print-page-count")).toContainText("1 page");
  const yardFile = path.join(sandbox.root, "metrage.pdf");
  await stubSaveDialog(app, yardFile);
  await page.getByTestId("print-export-pdf").click();
  await waitForFile(yardFile);
  const yardText = execFileSync("pdftotext", ["-enc", "UTF-8", "-layout", yardFile, "-"], { encoding: "utf8" });
  expect(yardText).toContain("Métrage");
  expect(yardText).toMatch(/yd \(\d+,\d m\)/);
  await page.getByTestId("print-dialog").getByRole("button", { name: "Fermer" }).last().click();

  // Imprimer le quilt : le dialogue de Windows est remplacé par une impression en PDF (même chemin, même échelle).
  await page.getByTestId("print-kind-quilt").click();
  await page.getByTestId("print-dialog").waitFor();
  await page.getByTestId("print-go").click();
  await expect(page.getByTestId("notice")).toContainText("Envoyé à l'imprimante");
  const printed = readdirSync(printDir).filter((f) => f.endsWith(".pdf"));
  expect(printed).toHaveLength(1);
  const printedDoc = await PDFDocument.load(readFileSync(path.join(printDir, printed[0] as string)));
  expect(printedDoc.getPageCount()).toBe(1);
  await page.getByTestId("print-dialog").getByRole("button", { name: "Fermer" }).last().click();

  // Fondation d'un bloc : découpage automatique en sections.
  await clickQuilt(page, 4, 4);
  await page.getByTestId("print-kind-foundation").click();
  await page.getByTestId("print-dialog").waitFor();
  await expect(page.getByTestId("print-message")).toContainText("Découpage automatique");
  await page.getByTestId("print-dialog").getByRole("button", { name: "Fermer" }).last().click();

  // Export d'une image PNG du quilt : 8 po de large à 150 ppp = 1200 pixels.
  await page.getByTestId("export-image-open").click();
  await page.getByTestId("export-image").waitFor();
  await page.getByTestId("export-whole").click();
  await expect(page.getByTestId("export-pixels")).toContainText("1200 ×");
  const pngFile = path.join(sandbox.root, "quilt.png");
  await stubSaveDialog(app, pngFile);
  await page.getByTestId("export-image-go").click();
  await waitForFile(pngFile);
  const png = decodePng(new Uint8Array(readFileSync(pngFile)));
  expect(png.width).toBe(1200);
  await app.close();
});

test("Plan Bloc : gabarits d'un Nine Patch de 6 po à l'échelle, export SVG et sélection copiée", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Bloc");
  await openBlockEditor(page);
  await page.getByTestId("tool-grid").click();
  await drag(page, [0, 0], [6, 6]);
  await page.getByTestId("tab-3").click();
  await expect(page.getByTestId("print-palette")).toBeVisible();
  // Sans pièce de cutter impossible : le Nine Patch se découpe au cutter.
  await expect(page.getByTestId("print-kind-rotary")).toBeEnabled();

  // Gabarits sans marge : un seul gabarit (lettre A, 9 pièces), carré de 2 po = 144 pt.
  await page.getByTestId("print-kind-templates").click();
  await page.getByTestId("print-dialog").waitFor();
  await page.getByTestId("print-opt-seam").uncheck();
  const file = path.join(sandbox.root, "nine.pdf");
  await stubSaveDialog(app, file);
  await page.getByTestId("print-export-pdf").click();
  await waitForFile(file);
  const text = execFileSync("pdftotext", ["-enc", "UTF-8", "-layout", file, "-"], { encoding: "utf8" });
  expect(text).toContain("Couper 9");
  expect(text).toContain("Bloc du plan");
  const [p] = await readPdf(new Uint8Array(readFileSync(file)));
  expect(p?.paths.some((x) => Math.abs(x.box.width - 144) < 1e-6 && Math.abs(x.box.height - 144) < 1e-6)).toBe(true);
  // Taille personnalisée de 9 po : le carré passe à 3 po (216 pt).
  await page.getByTestId("print-size-custom").check();
  await page.getByTestId("print-width").fill("9");
  await page.getByTestId("print-width").blur();
  await page.getByTestId("print-height").fill("9");
  await page.getByTestId("print-height").blur();
  const file9 = path.join(sandbox.root, "nine9.pdf");
  await stubSaveDialog(app, file9);
  await page.getByTestId("print-export-pdf").click();
  await waitForFile(file9);
  const [p9] = await readPdf(new Uint8Array(readFileSync(file9)));
  expect(p9?.paths.some((x) => Math.abs(x.box.width - 216) < 1e-6)).toBe(true);
  await page.getByTestId("print-dialog").getByRole("button", { name: "Fermer" }).last().click();

  // Métafichier : un SVG de 6 po.
  await page.getByTestId("export-svg-open").click();
  await page.getByTestId("export-image").waitFor();
  await page.getByTestId("export-width").fill("6");
  await page.getByTestId("export-width").blur();
  const svgFile = path.join(sandbox.root, "nine.svg");
  await stubSaveDialog(app, svgFile);
  await page.getByTestId("export-image-go").click();
  await waitForFile(svgFile);
  expect(readFileSync(svgFile, "utf8")).toContain('width="6in"');

  // Export d'une sélection : rectangle tracé, copié dans le presse-papiers.
  await page.getByTestId("export-selection-tool").click();
  await drag(page, [0.5, 0.5], [3.5, 3.5]);
  await page.getByTestId("export-selection").waitFor();
  await page.getByTestId("selection-copy").click();
  await expect(page.getByTestId("notice")).toContainText("presse-papiers");
  // Le presse-papiers contient un PNG de 3 po à 150 ppp : 450 pixels de large.
  const width = await app.evaluate(async ({ clipboard }) => {
    for (const item of await clipboard.read()) {
      try {
        const b = new Uint8Array(await (await item.getType("image/png")).arrayBuffer());
        return ((b[16] ?? 0) << 24) | ((b[17] ?? 0) << 16) | ((b[18] ?? 0) << 8) | (b[19] ?? 0);
      } catch {
        // Pas d'image dans cet élément.
      }
    }
    return 0;
  });
  expect(width).toBe(450);
  await app.close();
});
