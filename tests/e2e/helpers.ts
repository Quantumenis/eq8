import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const ROOT = path.join(__dirname, "..", "..");

/** Dossiers isolés : les tests ne touchent jamais aux vrais Documents ni aux données de l'utilisateur. */
export interface Sandbox {
  root: string;
  dataDir: string;
  docsDir: string;
  projectFile: (name: string) => string;
  recoveryFile: (name: string) => string;
  dispose: () => void;
}

export function makeSandbox(): Sandbox {
  const root = mkdtempSync(path.join(tmpdir(), "quilt-studio-e2e-"));
  const dataDir = path.join(root, "data");
  const docsDir = path.join(root, "docs");
  return {
    root,
    dataDir,
    docsDir,
    projectFile: (name) => path.join(docsDir, "Quilt Studio", "Projets", `${name}.qsp`),
    recoveryFile: (name) => path.join(dataDir, "recovery", name),
    dispose: () => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }),
  };
}

export interface Launched {
  app: ElectronApplication;
  page: Page;
}

const openApps = new Set<ElectronApplication>();

/** Filet de sécurité d'un test qui échoue : ferme de force ce qui est resté ouvert pour libérer les fichiers. */
export async function killAllApps(): Promise<void> {
  for (const app of openApps) {
    const pid = app.process().pid;
    if (pid) {
      try {
        execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        // Déjà terminé.
      }
    }
  }
  openApps.clear();
}

export async function launch(sandbox: Sandbox, options: { autosaveMs?: number } = {}): Promise<Launched> {
  const app = await electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: {
      ...process.env,
      QUILT_STUDIO_DATA_DIR: sandbox.dataDir,
      QUILT_STUDIO_DOCUMENTS_DIR: sandbox.docsDir,
      ...(options.autosaveMs ? { QUILT_STUDIO_AUTOSAVE_MS: String(options.autosaveMs) } : {}),
    },
  });
  openApps.add(app);
  app.on("close", () => openApps.delete(app));
  const page = await app.firstWindow();
  await page.waitForSelector('[data-testid="worktable"]');
  // Le démarrage charge les préférences et la palette : on attend que la version s'affiche.
  await page.waitForSelector('[data-testid="app-version"]');
  return { app, page };
}

/** Arrêt brutal de l'application et de tous ses processus (plantage simulé) : aucune fermeture propre. */
export async function killHard(app: ElectronApplication): Promise<void> {
  const pid = app.process().pid;
  if (pid) execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  // Laisse Windows libérer les verrous du dossier de données avant la relance.
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

/** Remplace la boîte « Enregistrer les modifications ? » native par une réponse imposée. */
export async function stubSaveChangesAnswer(app: ElectronApplication, response: 0 | 1 | 2): Promise<void> {
  await app.evaluate(({ dialog }, answer) => {
    (dialog as unknown as { showMessageBox: unknown }).showMessageBox = async () => ({ response: answer, checkboxChecked: false });
  }, response);
}

/** Simule une commande du menu natif (les menus natifs ne se pilotent pas par la souris). */
export async function menuCommand(app: ElectronApplication, command: string, argument?: string): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, args) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send("menu:command", args.command, args.argument);
    },
    { command, argument },
  );
}

export async function createProject(page: Page, name: string): Promise<void> {
  await page.getByTestId("project-name").click();
  await page.getByTestId("helper-name").fill(name);
  await page.getByTestId("helper-create").click();
  await page.getByTestId("project-helper").waitFor({ state: "detached" });
}

export async function openSketchbook(page: Page): Promise<void> {
  await page.getByTestId("tool-sketchbook").click();
  await page.getByTestId("sketchbook").waitFor();
}

export async function closeSketchbook(page: Page): Promise<void> {
  await page.getByTestId("sketchbook").getByRole("button", { name: "Fermer" }).first().click();
  await page.getByTestId("sketchbook").waitFor({ state: "detached" });
}

export async function addColor(page: Page, rgb: string, name: string): Promise<void> {
  await page.getByTestId("new-color-value").fill(rgb);
  await page.getByTestId("new-color-name").fill(name);
  await page.getByTestId("add-color").click();
}

export async function waitForFile(file: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (!existsSync(file)) {
    if (Date.now() - start > timeoutMs) throw new Error(`Fichier non apparu : ${file}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Titres (noms) des éléments affichés dans le carnet, dans l'ordre. */
export async function itemTitles(page: Page): Promise<string[]> {
  return page.getByTestId("sketchbook-item").evaluateAll((els) => els.map((e) => e.getAttribute("title") ?? ""));
}

/** Renomme l'élément n° « index » du carnet par sa fiche : une modification qui n'enregistre pas le projet. */
export async function renameColor(page: Page, index: number, name: string): Promise<void> {
  await page.getByTestId("sketchbook-item").nth(index).click();
  await page.getByTestId("card-name").fill(name);
}
