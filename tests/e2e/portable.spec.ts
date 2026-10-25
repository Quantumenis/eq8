import { _electron as electron, expect, test } from "@playwright/test";
import { makeSandbox } from "./helpers";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..");
const { version } = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string };
const DIST = path.join(ROOT, "dist");
// L'exe portable s'auto-extrait ; on pilote l'application décompressée produite à côté (win-unpacked),
// et on vérifie séparément que les deux artefacts .exe existent.
const PORTABLE = path.join(DIST, `Quilt Studio ${version}.exe`);
const INSTALLER = path.join(DIST, `Quilt Studio Setup ${version}.exe`);
const UNPACKED = path.join(DIST, "win-unpacked", "Quilt Studio.exe");

/** Les tests n'écrivent ni dans les vrais Documents ni dans les données de l'utilisateur. */
function sandboxEnv(sandbox: ReturnType<typeof makeSandbox>): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    QUILT_STUDIO_DATA_DIR: sandbox.dataDir,
    QUILT_STUDIO_DOCUMENTS_DIR: sandbox.docsDir,
  };
}

test("les deux exécutables sont produits", () => {
  expect(existsSync(PORTABLE), PORTABLE).toBe(true);
  expect(existsSync(INSTALLER), INSTALLER).toBe(true);
});

test("l'application empaquetée démarre en moins de 10 s", async () => {
  const sandbox = makeSandbox();
  const start = Date.now();
  const app = await electron.launch({ executablePath: UNPACKED, env: sandboxEnv(sandbox) });
  const page = await app.firstWindow();
  await page.waitForSelector('[data-testid="worktable"]');
  expect(Date.now() - start).toBeLessThan(10_000);
  expect(await page.title()).toContain("Quilt Studio");
  await expect(page.getByTestId("app-version")).toHaveText(`Version ${version}`);
  await app.close();
  sandbox.dispose();
});

function powershell(command: string): string {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8" }).trim();
}

/** Chemin de l'exe qui affiche une fenêtre « Quilt Studio… » (tasklist filtre mal le tiret cadratin du titre). */
function quiltStudioWindowPath(): string {
  return powershell(
    "Get-Process | Where-Object { $_.MainWindowTitle -like 'Quilt Studio*' } | Select-Object -First 1 -ExpandProperty Path",
  );
}

test("l'exe portable ouvre une fenêtre Quilt Studio", async () => {
  test.setTimeout(90_000);
  const sandbox = makeSandbox();
  const child = spawn(PORTABLE, [], { detached: false, stdio: "ignore", env: sandboxEnv(sandbox) });
  let appPath = "";
  try {
    // Le portable s'auto-extrait dans %TEMP% puis lance l'application : on attend la fenêtre (extraction comprise).
    await expect
      .poll(() => (appPath = quiltStudioWindowPath()), { timeout: 60_000, intervals: [1000] })
      .toMatch(/Quilt Studio\.exe$/i);
  } finally {
    if (appPath) {
      // Tous les processus de l'application extraite (principal, rendu, GPU…).
      powershell(`Get-Process | Where-Object { $_.Path -eq '${appPath.replace(/'/g, "''")}' } | Stop-Process -Force`);
    }
    if (child.pid) {
      try {
        execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      } catch {
        // Le lanceur portable s'est déjà terminé avec l'application.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    sandbox.dispose();
  }
});
