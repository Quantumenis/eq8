import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { createProject, drag, killAllApps, launch, makeSandbox, openBlockEditor, openSketchbook, pagePoint, segments, stubSaveChangesAnswer, type Sandbox } from "./helpers";

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

async function clickBlock(page: Page, x: number, y: number): Promise<void> {
  const p = await pagePoint(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function filled(page: Page): Promise<number> {
  return Number(await page.getByTestId("block-stage").getAttribute("data-filled"));
}

const swatch = (page: Page, rgb: string) => page.locator(`[data-testid="swatch"][data-rgb="${rgb}"]`);

test("Nine Patch à l'outil Grille, 5 pièces au pinceau, ajout au carnet : « 1 sur 1 »", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Couleurs");
  await openBlockEditor(page);
  await page.getByTestId("tool-grid").click();
  await drag(page, [0, 0], [6, 6]);
  expect(await segments(page)).toHaveLength(4);

  await page.getByTestId("tab-2").click();
  await expect(page.getByTestId("coloring-bar")).toBeVisible();
  await expect(page.getByTestId("piece-count")).toHaveText("9 pièces");
  // Les 4 lignes de la grille se croisent : le nettoyage les coupe à chaque intersection, sans rien retirer.
  await expect(page.getByTestId("dialog")).toHaveCount(0);
  expect(await segments(page)).toHaveLength(12);

  // Sans tissu choisi, le pinceau prévient.
  await clickBlock(page, 1, 1);
  await expect(page.getByTestId("notice")).toContainText("Choisissez d'abord");

  await page.getByTestId("ptab-colors").click();
  await swatch(page, "#c62828").click();
  await expect(page.getByTestId("preview-swatch")).toHaveAttribute("data-rgb", "#c62828");
  for (const [x, y] of [
    [1, 1],
    [5, 1],
    [3, 3],
    [1, 5],
    [5, 5],
  ] as const) {
    await clickBlock(page, x, y);
  }
  await expect.poll(() => filled(page)).toBe(5);
  await expect(page.getByTestId("recent-swatch")).toHaveCount(1);
  await page.mouse.move(0, 0);
  await expect(page.getByTestId("block-stage")).toHaveScreenshot("m3-coloration.png");

  // Annuler retire la dernière pièce colorée, rétablir la rend.
  await page.getByTestId("tool-undo").click();
  await expect.poll(() => filled(page)).toBe(4);
  await page.getByTestId("tool-redo").click();
  await expect.poll(() => filled(page)).toBe(5);

  await page.getByTestId("tool-add").click();
  await expect(page.getByTestId("notice")).toContainText("Ajouté au carnet");
  await expect(page.getByTestId("coloring-indicator")).toHaveText("1 sur 1");

  await openSketchbook(page);
  await page.getByTestId("section-blocks").click();
  await page.getByTestId("sketchbook-item").first().click();
  await expect(page.getByTestId("sketchbook").getByTestId("coloring-indicator")).toHaveText("1 sur 1");
  await expect(page.getByTestId("sketchbook").getByTestId("sketchbook-coloring")).toHaveScreenshot("m3-carnet-coloration.png");

  // Le fichier du projet garde la coloration (5 pièces sur 9) et le dessin nettoyé.
  const files = unzipSync(new Uint8Array(readFileSync(sandbox.projectFile("Couleurs"))));
  const project = JSON.parse(strFromU8(files["project.json"] as Uint8Array)) as {
    sketchbook: { blocks: { drawing: { segments: unknown[] }; colorings: { fills: Record<string, { kind: string; rgb: string }> }[] }[] };
  };
  const block = project.sketchbook.blocks[0];
  expect(block?.drawing.segments).toHaveLength(12);
  expect(block?.colorings).toHaveLength(1);
  expect(Object.values(block?.colorings[0]?.fills ?? {})).toHaveLength(5);
  expect(Object.values(block?.colorings[0]?.fills ?? {}).every((f) => f.rgb === "#c62828")).toBe(true);
  await app.close();
});

test("le passage à COLORATION retire les segments pendants et prévient ; Ctrl+Z les rend", async () => {
  const { app, page } = await launch(sandbox);
  await openBlockEditor(page);
  await drag(page, [3, 0], [3, 6]);
  await drag(page, [1, 1], [2, 2]); // ligne flottante
  await page.getByTestId("tab-2").click();
  await expect(page.getByTestId("dialog")).toContainText("retiré 1 segment");
  await expect(page.getByTestId("dialog")).toContainText("Ligne de");
  await page.getByTestId("dialog-ok").click();
  await expect(page.getByTestId("piece-count")).toHaveText("2 pièces");
  expect(await segments(page)).toHaveLength(1);
  await page.getByTestId("tool-undo").click();
  expect(await segments(page)).toHaveLength(2);
  await app.close();
});

test("bombe, Sélectionner & vaporiser (avec les flèches) et pipette sur un bloc de bibliothèque", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Bombe");

  // Bibliothèque : le Nine Patch rejoint le carnet avec ses deux colorations.
  await page.getByTestId("tool-library").click();
  await page.getByTestId("block-library").waitFor();
  await page.getByTestId("library-style").filter({ hasText: "Carrés et bandes" }).click();
  await page.getByTestId("library-item").filter({ hasText: "Nine Patch" }).click();
  await page.getByTestId("library-add").click();
  await expect(page.getByTestId("notice")).toContainText("1 bloc ajouté");
  await page.getByTestId("block-library").getByRole("button", { name: "Fermer" }).last().click();

  // « Modifier » la coloration 2 (en couleur) : le plan Bloc s'ouvre sur COLORATION.
  await openSketchbook(page);
  await page.getByTestId("section-blocks").click();
  await page.getByTestId("sketchbook-item").first().click();
  await expect(page.getByTestId("sketchbook").getByTestId("coloring-indicator")).toHaveText("1 sur 2");
  await page.getByTestId("sketchbook").getByTestId("coloring-next").click();
  await expect(page.getByTestId("sketchbook").getByTestId("coloring-indicator")).toHaveText("2 sur 2");
  await page.getByTestId("edit-item").click();
  await expect(page.getByTestId("coloring-bar")).toBeVisible();
  await expect(page.getByTestId("coloring-indicator")).toHaveText("2 sur 2");
  await expect.poll(() => filled(page)).toBe(9);

  // Bombe jaune sur une case foncée (le coin) : les 5 cases foncées deviennent jaunes.
  await page.getByTestId("ctool-spray").click();
  await page.getByTestId("ptab-colors").click();
  await swatch(page, "#f9d71c").click();
  await clickBlock(page, 1, 1);
  // Pipette sur la case du centre (elle était foncée) : la palette saute au jaune.
  await page.getByTestId("ctool-eyedropper").click();
  await swatch(page, "#ffffff").click();
  await clickBlock(page, 3, 3);
  await expect(page.getByTestId("preview-swatch")).toHaveAttribute("data-rgb", "#f9d71c");
  await expect(swatch(page, "#f9d71c")).toHaveAttribute("aria-selected", "true");
  // La pipette rend la main à la bombe.
  await expect(page.getByTestId("ctool-spray")).toHaveAttribute("aria-pressed", "true");

  // Sélectionner & vaporiser : les 4 cases claires, puis les flèches font défiler les couleurs.
  await page.getByTestId("ctool-selectSpray").click();
  await clickBlock(page, 3, 1);
  await expect(page.getByTestId("spray-selection")).toHaveText("4 pièces sélectionnées");
  await swatch(page, "#2e7d32").click();
  await page.keyboard.press("ArrowRight");
  const next = await page.getByTestId("preview-swatch").getAttribute("data-rgb");
  expect(next).not.toBe("#2e7d32");
  // Un seul pas d'annulation pour tous les essais : on revient aux cases claires d'origine.
  await page.getByTestId("tool-undo").click();
  await page.getByTestId("ctool-eyedropper").click();
  await clickBlock(page, 3, 1);
  await expect(page.getByTestId("preview-swatch")).toHaveAttribute("data-rgb", "#f6efdc");

  // Flèche « début » : le dessin au trait, sans couleur.
  await page.getByTestId("coloring-first").click();
  await expect(page.getByTestId("coloring-indicator")).toContainText("Dessin au trait");
  await expect.poll(() => filled(page)).toBe(0);

  // Ajouter la coloration courante (jaune) à la pile : un nouveau bloc, la pile du Nine Patch étant pleine (2).
  await page.getByTestId("coloring-last").click();
  await expect.poll(() => filled(page)).toBe(9);
  await app.close();
});

test("bibliothèque : sélection multiple, ajout, dépilage avec Scinder", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Biblio");
  await page.getByTestId("tool-library").click();
  const library = page.getByTestId("block-library");
  await library.waitFor();
  await page.getByTestId("library-category").filter({ hasText: "02 Étoiles" }).click();
  await expect(page.getByTestId("library-item")).toHaveCount(4);
  await expect(page.getByTestId("library-count")).toHaveText("4 éléments");
  await page.getByTestId("library-item").filter({ hasText: "Ohio Star" }).click();
  await page.getByTestId("library-item").filter({ hasText: "Friendship Star" }).click({ modifiers: ["Control"] });
  await expect(page.locator('[data-testid="library-item"][aria-selected="true"]')).toHaveCount(2);
  await page.getByTestId("library-add").click();
  await expect(page.getByTestId("notice")).toContainText("2 blocs ajoutés");
  // Un second ajout est reconnu comme doublon.
  await page.getByTestId("library-add").click();
  await expect(page.getByTestId("notice")).toContainText("déjà présents");
  // Tout sélectionner.
  await page.getByTestId("library-select-all").click();
  await expect(page.locator('[data-testid="library-item"][aria-selected="true"]')).toHaveCount(4);
  await page.getByTestId("library-category").filter({ hasText: "01 Classiques" }).click();
  await expect(library).toHaveScreenshot("m3-bibliotheque.png");
  await library.getByRole("button", { name: "Fermer" }).last().click();

  await openSketchbook(page);
  await page.getByTestId("section-blocks").click();
  await expect(page.getByTestId("sketchbook-item")).toHaveCount(2);
  await page.getByTestId("sketchbook-item").first().click();
  await expect(page.getByTestId("split-colorings")).toBeDisabled();
  await page.getByTestId("sketchbook").getByTestId("coloring-indicator").click({ button: "right" });
  await page.getByTestId("coloring-choice").nth(2).click();
  await expect(page.getByTestId("sketchbook").getByTestId("coloring-indicator")).toHaveText("2 sur 2");
  await page.getByTestId("split-colorings").click();
  await expect(page.getByTestId("sketchbook-item")).toHaveCount(3);
  await expect(page.getByTestId("sketchbook").getByTestId("coloring-indicator")).toHaveText("1 sur 1");
  await stubSaveChangesAnswer(app, 1); // la scission laisse le projet modifié : pas de boîte « Enregistrer ? » à attendre
  await app.close();
});
