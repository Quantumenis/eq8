import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRaster } from "../../src/core/image/raster";
import { encodePng } from "../../src/core/image/png";
import { LIBRARY_BLOCKS, instantiateLibraryBlock } from "../../src/core/library/blocks";
import { contentOfDrawing } from "../../src/core/draw/content";
import { addAsset } from "../../src/core/project/assets";
import { addLibraryBlock, addToSketchbook } from "../../src/core/project/commands";
import { newProject } from "../../src/core/project/defaults";
import { makeImageFabric, makePhoto } from "../../src/core/project/images";
import type { Coloring, Paint } from "../../src/core/project/model";
import { writeQsp } from "../../src/core/project/qsp";
import { buildLayout, defaultLayout } from "../../src/core/quilt/layout";
import { newDraft, quiltItemOf } from "../../src/core/quilt/doc";
import { placeBlock } from "../../src/core/quilt/ops";
import { killAllApps, launch, makeSandbox, menuCommand, type Sandbox } from "./helpers";

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

function noisePng(seed: number): Uint8Array {
  const r = createRaster(96, 96);
  let s = seed;
  for (let i = 0; i < r.data.length; i += 4) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    r.data[i] = (s >>> 24) & 255;
    r.data[i + 1] = (s >>> 16) & 255;
    r.data[i + 2] = (s >>> 8) & 255;
    r.data[i + 3] = 255;
  }
  return encodePng(r, 96);
}

/** Un quilt Horizontal de 20 × 20 Ohio Star dont chaque pièce porte un tissu image. */
function bigQuilt(): { file: string } {
  const loaded = newProject(null, 2);
  const assets = loaded.assets;
  let project = loaded.project;
  const fabricIds: string[] = [];
  for (const [i, seed] of [11, 22, 33].entries()) {
    const added = addAsset(project, assets, noisePng(seed), "image/png");
    project = added.project;
    const fabric = makeImageFabric(added.hash, 96, `Tissu ${i + 1}`, "#808080");
    project = addToSketchbook(project, "fabrics", fabric).project;
    fabricIds.push(fabric.id);
  }
  const block = instantiateLibraryBlock(LIBRARY_BLOCKS.find((d) => d.id === "ohio-star")!);
  const content = contentOfDrawing(block.drawing, block.width, block.height);
  const fills: Record<string, Paint> = {};
  content.pieces.forEach((p, i) => (fills[p.key] = { kind: "fabric", fabricId: fabricIds[i % 3] as string }));
  const coloring: Coloring = { id: "tissus", fills };
  project = addLibraryBlock(project, "blocks", { ...block, colorings: [coloring] }).project;
  const stored = project.sketchbook.blocks.find((b) => b.card.name === block.card.name)!;
  let draft = newDraft("horizontal");
  draft = { doc: { ...draft.doc, layout: { ...defaultLayout("horizontal"), nh: 20, nv: 20, bw: 6, bh: 6 } as never }, fills: {} };
  const keys = buildLayout(draft.doc.layout).slots.filter((s) => s.role === "block").map((s) => s.key);
  expect(keys).toHaveLength(400);
  draft = placeBlock(draft, project, keys, { blockId: stored.id, coloringId: stored.colorings[0]!.id });
  const item = quiltItemOf(project, draft, "Grand quilt");
  project = addToSketchbook(project, "quilts", item).project;
  const file = path.join(sandbox.docsDir, "Quilt Studio", "Projets", "Grand.qsp");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, writeQsp(project, assets));
  return { file };
}

test("un quilt de 20 × 20 Ohio Star avec des tissus image se redessine en moins de 100 ms après un zoom", async () => {
  const { file } = bigQuilt();
  const { app, page } = await launch(sandbox);
  await menuCommand(app, "open-recent", file);
  await expect(page.getByTestId("project-name")).toContainText("Grand");
  await page.getByTestId("tool-sketchbook").click();
  await page.getByTestId("section-quilts").click();
  await page.getByTestId("sketchbook-item").first().click();
  await page.getByTestId("edit-item").click();
  const canvas = page.getByTestId("quilt-canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(async () => Number(await canvas.getAttribute("data-scale"))).toBeGreaterThan(1);
  await page.waitForTimeout(800); // les images des tissus sont décodées
  // Quelques zooms pour chauffer, puis la mesure : clic sur le zoom, deux images plus tard le dessin est à l'écran.
  const measure = async (): Promise<number> =>
    page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const t = performance.now();
          (document.querySelector('[data-testid="quilt-zoom-in"]') as HTMLButtonElement).click();
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t)));
        }),
    );
  await measure();
  await measure();
  const times: number[] = [];
  for (let i = 0; i < 5; i++) times.push(await measure());
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)] as number;
  console.log(`zoom : ${times.map((t) => t.toFixed(0)).join(" / ")} ms`);
  expect(median).toBeLessThan(100);
  await app.close();
});

test("un projet de 50 Mo s'ouvre en moins de 3 s", async () => {
  const loaded = newProject(null, 2);
  const assets = loaded.assets;
  let project = loaded.project;
  // Cinq photos de 10 Mo : seuls leurs octets comptent à l'ouverture (rien n'est décodé tant qu'on ne les affiche pas).
  for (let i = 0; i < 5; i++) {
    const bytes = new Uint8Array(10 * 1024 * 1024);
    let s = i + 1;
    for (let k = 0; k < bytes.length; k++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      bytes[k] = s >>> 24;
    }
    // Une signature PNG pour que le type soit plausible.
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const added = addAsset(project, assets, bytes, "image/png");
    project = addToSketchbook(added.project, "photos", makePhoto(added.hash, 75, `Photo ${i + 1}`)).project;
  }
  const file = path.join(sandbox.docsDir, "Quilt Studio", "Projets", "Gros.qsp");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, writeQsp(project, assets));
  const { app, page } = await launch(sandbox);
  const t0 = Date.now();
  await menuCommand(app, "open-recent", file);
  await expect(page.getByTestId("project-name")).toContainText("Gros", { timeout: 10_000 });
  const elapsed = Date.now() - t0;
  console.log(`ouverture : ${elapsed} ms`);
  expect(elapsed).toBeLessThan(3000);
  await app.close();
});
