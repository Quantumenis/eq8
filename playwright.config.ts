import { defineConfig } from "@playwright/test";

// Deux projets : « app » pilote la version construite (out/), « portable » pilote l'exe produit par electron-builder.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  updateSnapshots: "missing",
  snapshotPathTemplate: "tests/e2e/__screenshots__/{arg}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  projects: [
    { name: "app", testMatch: /(app|project|block|coloring|fabric|quilt|print|applique|m9|perf)\.spec\.ts/ },
    { name: "portable", testMatch: /portable\.spec\.ts/ },
  ],
});
