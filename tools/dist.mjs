// Lance electron-builder avec un cache d'outils local au projet (.cache/, ignoré par git).
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync("npx", ["electron-builder", "--win", "--x64", "--publish", "never"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ELECTRON_BUILDER_CACHE: join(root, ".cache", "electron-builder") },
});
process.exit(result.status ?? 1);
