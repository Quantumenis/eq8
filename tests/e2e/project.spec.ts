import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import {
  addColor,
  closeSketchbook,
  createProject,
  killAllApps,
  killHard,
  launch,
  makeSandbox,
  menuCommand,
  openSketchbook,
  renameColor,
  itemTitles,
  stubSaveChangesAnswer,
  waitForFile,
  type Sandbox,
} from "./helpers";

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

test("créer « Test », ajouter un élément, quitter, relancer, rouvrir : l'élément est là", async () => {
  let { app, page } = await launch(sandbox);
  await expect(page.getByTestId("project-name")).toHaveText("Sans titre");
  await createProject(page, "Test");
  await expect(page.getByTestId("project-name")).toHaveText("Test");
  expect(existsSync(sandbox.projectFile("Test"))).toBe(true);
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle()))
    .toBe("Quilt Studio — Test");

  await openSketchbook(page);
  const items = page.getByTestId("sketchbook-item");
  const before = await items.count();
  expect(before).toBeGreaterThanOrEqual(20); // les couleurs d'origine
  const fileBefore = readFileSync(sandbox.projectFile("Test"));

  await addColor(page, "#12ab34", "Vert test");
  await expect(items).toHaveCount(before + 1);
  await expect(page.getByTestId("notice")).toContainText("Ajouté au carnet");
  // « Ajouter au carnet » enregistre le projet : pas de bouton Enregistrer à presser.
  await expect(page.getByTestId("save-state")).toHaveText("Enregistré");
  await expect.poll(() => readFileSync(sandbox.projectFile("Test")).equals(fileBefore)).toBe(false);
  await closeSketchbook(page);
  await expect(page.getByTestId("project-name")).toHaveText("Test");
  await app.close();

  ({ app, page } = await launch(sandbox));
  await expect(page.getByTestId("project-name")).toHaveText("Sans titre");
  await page.getByTestId("project-name").click();
  await page.getByTestId("helper-tab-open").click();
  await expect(page.getByTestId("helper-recents").getByTestId("project-entry")).toContainText("Test");
  await page.getByTestId("helper-recents").getByTestId("project-entry").first().click();
  await page.getByTestId("helper-open").click();
  await expect(page.getByTestId("project-name")).toHaveText("Test");

  await openSketchbook(page);
  await expect(page.getByTestId("sketchbook-item")).toHaveCount(before + 1);
  await expect(page.getByTitle("Vert test")).toBeVisible();
  await app.close();
});

test("arrêt forcé : la relance propose la restauration, et elle fonctionne", async () => {
  let { app, page } = await launch(sandbox, { autosaveMs: 300 });
  await createProject(page, "Plantage");
  await openSketchbook(page);
  await renameColor(page, 0, "Avant le plantage");
  await closeSketchbook(page);
  await expect(page.getByTestId("project-name")).toHaveText("Plantage *");

  await waitForFile(sandbox.recoveryFile("session.json"));
  await waitForFile(sandbox.recoveryFile("session.qsp"));
  await killHard(app);

  ({ app, page } = await launch(sandbox, { autosaveMs: 300 }));
  const dialog = page.getByTestId("recovery-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Plantage");
  await page.getByTestId("recovery-restore").click();
  await expect(page.getByTestId("project-name")).toHaveText("Plantage *");
  await expect(page.getByTestId("notice")).toContainText("restauré");

  await openSketchbook(page);
  await expect(page.getByTitle("Avant le plantage")).toBeVisible();
  await closeSketchbook(page);

  // Le travail restauré est enregistrable, et la copie de secours précédente a été abandonnée.
  await page.getByTestId("tool-save").click();
  await expect(page.getByTestId("save-state")).toHaveText("Enregistré");
  expect(existsSync(sandbox.recoveryFile("previous.json"))).toBe(false);
  await app.close();
});

test("arrêt forcé puis « Ignorer » : la sauvegarde est supprimée et plus reproposée", async () => {
  let { app, page } = await launch(sandbox, { autosaveMs: 300 });
  await createProject(page, "Ignoré");
  await openSketchbook(page);
  await renameColor(page, 0, "Perdue");
  await closeSketchbook(page);
  await waitForFile(sandbox.recoveryFile("session.json"));
  await killHard(app);

  ({ app, page } = await launch(sandbox));
  await page.getByTestId("recovery-ignore").click();
  await expect(page.getByTestId("recovery-dialog")).toHaveCount(0);
  expect(existsSync(sandbox.recoveryFile("previous.json"))).toBe(false);
  await app.close();

  ({ app, page } = await launch(sandbox));
  await expect(page.getByTestId("recovery-dialog")).toHaveCount(0);
  await app.close();
});

test("fermeture d'un projet modifié : « Annuler » garde la fenêtre, « Ne pas enregistrer » ferme", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Fermeture");
  await openSketchbook(page);
  await renameColor(page, 0, "Non enregistrée");
  await closeSketchbook(page);
  await expect(page.getByTestId("project-name")).toHaveText("Fermeture *");
  await page.waitForTimeout(300); // laisse le temps à l'état du document d'atteindre le processus principal

  await stubSaveChangesAnswer(app, 2); // Annuler
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await page.waitForTimeout(600);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  await expect(page.getByTestId("project-name")).toHaveText("Fermeture *");

  await stubSaveChangesAnswer(app, 1); // Ne pas enregistrer
  const closed = app.waitForEvent("close");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await closed;
  expect(existsSync(sandbox.recoveryFile("session.json"))).toBe(false);
});

test("fermeture avec « Enregistrer » : le projet est écrit puis la fenêtre se ferme", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "EnregistreAvantFermer");
  await openSketchbook(page);
  await renameColor(page, 0, "Gardée");
  await closeSketchbook(page);
  const before = readFileSync(sandbox.projectFile("EnregistreAvantFermer"));
  await expect(page.getByTestId("project-name")).toHaveText("EnregistreAvantFermer *");
  await page.waitForTimeout(300);

  await stubSaveChangesAnswer(app, 0); // Enregistrer
  const closed = app.waitForEvent("close");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await closed;
  expect(readFileSync(sandbox.projectFile("EnregistreAvantFermer")).equals(before)).toBe(false);
});

test("annuler / rétablir depuis l'interface, et l'état « modifié » suit l'historique", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Historique");
  await expect(page.getByTestId("tool-undo")).toBeDisabled();
  await openSketchbook(page);
  const items = page.getByTestId("sketchbook-item");
  const originals = await itemTitles(page);

  await renameColor(page, 0, "Une");
  await renameColor(page, 1, "Deux");
  expect((await itemTitles(page)).slice(0, 2)).toEqual(["Une", "Deux"]);
  await expect(page.getByTestId("save-state")).toHaveText("Modifié");

  // La fenêtre modale masque la barre d'outils : on passe par les commandes du menu (Ctrl+Z, Ctrl+Y).
  await menuCommand(app, "undo");
  await expect(items.nth(1)).toHaveAttribute("title", originals[1] as string);
  await expect(page.getByTestId("save-state")).toHaveText("Modifié");
  await menuCommand(app, "undo");
  await expect(items.nth(0)).toHaveAttribute("title", originals[0] as string);
  await expect(page.getByTestId("tool-undo")).toBeDisabled();
  await expect(page.getByTestId("save-state")).toHaveText("Enregistré"); // retour à l'état enregistré

  await menuCommand(app, "redo");
  await menuCommand(app, "redo");
  await expect(items.nth(1)).toHaveAttribute("title", "Deux");
  await expect(page.getByTestId("save-state")).toHaveText("Modifié");

  // Les boutons de la barre du haut font de même une fois le carnet fermé.
  await closeSketchbook(page);
  await page.getByTestId("tool-undo").click();
  await page.getByTestId("tool-undo").click();
  await expect(page.getByTestId("tool-undo")).toBeDisabled();
  await page.getByTestId("tool-redo").click();
  await openSketchbook(page);
  expect((await itemTitles(page)).slice(0, 2)).toEqual(["Une", originals[1]]);
  await stubSaveChangesAnswer(app, 1);
  await app.close();
});

test("ajouter deux fois la même couleur : « déjà présent », sans doublon", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Doublons");
  await openSketchbook(page);
  const items = page.getByTestId("sketchbook-item");
  await addColor(page, "#abcdef", "Pastel");
  const afterFirst = await items.count();
  await addColor(page, "#abcdef", "Pastel");
  await expect(page.getByTestId("notice")).toContainText("Déjà présent");
  await expect(items).toHaveCount(afterFirst);
  await stubSaveChangesAnswer(app, 1);
  await app.close();
});

test("l'assistant refuse un nom invalide ou déjà pris", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Premier");

  await page.getByTestId("project-name").click();
  const name = page.getByTestId("helper-name");
  const create = page.getByTestId("helper-create");
  await expect(create).toBeDisabled();

  await name.fill("a/b");
  await expect(page.getByTestId("helper-problem")).toContainText("caractère interdit");
  await expect(create).toBeDisabled();

  await name.fill("..\\evasion");
  await expect(create).toBeDisabled();

  await name.fill("premier");
  await expect(page.getByTestId("helper-problem")).toContainText("existe déjà");
  await expect(create).toBeDisabled();

  await name.fill("Second");
  await expect(page.getByTestId("helper-problem")).toHaveText("");
  await expect(create).toBeEnabled();
  await page.keyboard.press("Escape");
  await app.close();
});

test("tri par clics, glisser-déposer et suppression avec confirmation", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Tri");
  await openSketchbook(page);
  const names = async () => (await page.getByTestId("sketchbook-item").evaluateAll((els) => els.map((e) => e.getAttribute("title"))));
  const initial = await names();

  // Tri par clics : les deux derniers passent en tête, dans l'ordre cliqué.
  await page.getByTestId("sort-open").click();
  const remaining = page.getByTestId("sort-remaining").getByRole("button");
  const lastName = initial.at(-1) as string;
  const prevName = initial.at(-2) as string;
  await remaining.filter({ hasText: lastName }).first().click();
  await remaining.filter({ hasText: prevName }).first().click();
  await page.getByTestId("sort-close").click();
  await page.getByTestId("sort-dialog").waitFor({ state: "detached" });
  const sorted = await names();
  expect(sorted.slice(0, 2)).toEqual([lastName, prevName]);
  expect(sorted).toHaveLength(initial.length);

  // Annuler le tri rétablit l'ordre d'origine.
  await menuCommand(app, "undo");
  expect(await names()).toEqual(initial);

  // Glisser-déposer : le premier est déposé avant le troisième.
  const grid = page.getByTestId("sketchbook-item");
  await grid.nth(0).dragTo(grid.nth(2));
  const dropped = await names();
  expect(dropped.slice(0, 3)).toEqual([initial[1], initial[0], initial[2]]);

  // Suppression : confirmation, puis annulation possible.
  await grid.nth(0).click();
  await page.getByTestId("remove-item").click();
  await page.getByTestId("dialog-ok").click();
  await expect(grid).toHaveCount(initial.length - 1);
  await menuCommand(app, "undo");
  await expect(grid).toHaveCount(initial.length);

  await stubSaveChangesAnswer(app, 1);
  await app.close();
});

test("les fiches se modifient, avec un recto et un verso", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Fiches");
  await openSketchbook(page);
  await page.getByTestId("sketchbook-item").first().click();
  await page.getByTestId("card-name").fill("Mon rouge");
  await expect(page.getByTestId("sketchbook-item").first()).toHaveAttribute("title", "Mon rouge");

  await page.getByTestId("card-flip").click();
  await page.getByRole("textbox", { name: "Catégories (séparées par des virgules)" }).fill("chaud, vif");
  await page.getByTestId("card-flip").click();
  await expect(page.getByTestId("card-name")).toHaveValue("Mon rouge");

  // Toute la saisie du nom est une seule étape d'annulation.
  await closeSketchbook(page);
  await page.getByTestId("tool-undo").click(); // catégories
  await page.getByTestId("tool-undo").click(); // nom
  await expect(page.getByTestId("tool-undo")).toBeDisabled();
  await stubSaveChangesAnswer(app, 1);
  await app.close();
});

test("les préférences (unités, colorations) sont conservées d'un lancement à l'autre", async () => {
  let { app, page } = await launch(sandbox);
  await expect(page.getByTestId("units")).toHaveText("Unités : pouces");
  await menuCommand(app, "preferences");
  await page.getByTestId("unit-cm").check();
  await expect(page.getByTestId("units")).toHaveText("Unités : centimètres");
  await page.getByTestId("max-colorings").fill("4");
  await expect(page.getByTestId("max-colorings")).toHaveValue("4");
  await stubSaveChangesAnswer(app, 1);
  await app.close();

  ({ app, page } = await launch(sandbox));
  await expect(page.getByTestId("units")).toHaveText("Unités : centimètres");
  await menuCommand(app, "preferences");
  await expect(page.getByTestId("max-colorings")).toHaveValue("4"); // nouveau projet = maximum mémorisé

  await page.getByTestId("restore-prefs").click();
  await expect(page.getByTestId("units")).toHaveText("Unités : pouces");
  await app.close();
});

test("la palette par défaut devient le contenu de départ d'un nouveau projet", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Source");
  await openSketchbook(page);
  const base = await page.getByTestId("sketchbook-item").count();
  await addColor(page, "#0a0b0c", "Ma couleur");
  await closeSketchbook(page);
  await menuCommand(app, "save-default-palette");
  await expect(page.getByTestId("notice")).toContainText("Palette par défaut enregistrée");

  await createProject(page, "Cible"); // « Source » est déjà enregistré : l'ajout de la couleur l'a enregistré
  await openSketchbook(page);
  await expect(page.getByTestId("sketchbook-item")).toHaveCount(base + 1);
  await expect(page.getByTitle("Ma couleur")).toBeVisible();
  await app.close();
});

test("captures du carnet (clair et sombre)", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Captures");
  const sketchbook = page.getByTestId("sketchbook");

  // La barre d'état (et ses boutons de thème) est masquée par la fenêtre modale : on change de thème carnet fermé.
  await page.getByTestId("theme-light").click();
  await openSketchbook(page);
  await page.getByTestId("sketchbook-item").first().click();
  await expect(sketchbook).toHaveScreenshot("m1-carnet-clair.png");
  await closeSketchbook(page);

  await page.getByTestId("theme-dark").click();
  await openSketchbook(page);
  await page.getByTestId("sketchbook-item").first().click();
  await expect(sketchbook).toHaveScreenshot("m1-carnet-sombre.png");
  await closeSketchbook(page);

  await page.getByTestId("theme-system").click();
  await app.close();
});
