import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { launch, makeSandbox, stubSaveChangesAnswer, type Sandbox } from "./helpers";

let sandbox: Sandbox;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  sandbox = makeSandbox();
  ({ app, page } = await launch(sandbox));
});

test.afterAll(async () => {
  await stubSaveChangesAnswer(app, 1);
  await app?.close();
  sandbox?.dispose();
});

test("la fenêtre s'appelle Quilt Studio", async () => {
  expect(await page.title()).toContain("Quilt Studio");
  const title = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle() ?? "");
  expect(title).toContain("Quilt Studio");
});

test("les trois plans de travail changent la zone de travail", async () => {
  const worktable = page.getByTestId("worktable");
  for (const id of ["block", "image", "quilt"] as const) {
    await page.getByTestId(`worktable-${id}`).click();
    await expect(worktable).toHaveClass(new RegExp(`worktable--${id}`));
    await expect(page.getByTestId(`worktable-${id}`)).toHaveAttribute("aria-pressed", "true");
  }
});

test("le ruban suit le plan de travail", async () => {
  await page.getByTestId("worktable-block").click();
  await expect(page.getByRole("tab", { name: "DESSIN" })).toBeVisible();
  await page.getByTestId("worktable-quilt").click();
  await expect(page.getByRole("tab", { name: "BORDURES" })).toBeVisible();
});

test("la version de l'application est affichée", async () => {
  await expect(page.getByTestId("app-version")).toHaveText(/Version \d+\.\d+\.\d+/);
});

test("thèmes clair et sombre (captures de référence)", async () => {
  await page.getByTestId("worktable-quilt").click();

  await page.getByTestId("theme-light").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page).toHaveScreenshot("m0-clair.png");

  await page.getByTestId("theme-dark").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(29, 32, 38)");
  await expect(page).toHaveScreenshot("m0-sombre.png");

  await page.getByTestId("theme-system").click();
});
