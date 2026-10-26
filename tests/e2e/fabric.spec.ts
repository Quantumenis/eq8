import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { encodePng } from "../../src/core/image/png";
import { createRaster } from "../../src/core/image/raster";
import { createProject, drag, killAllApps, launch, makeSandbox, menuCommand, openBlockEditor, openSketchbook, pagePoint, type Sandbox } from "./helpers";

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

/** Un damier noir et blanc de cases de 1 po à 96 ppp (2 × 2 cases, 192 × 192 px), enregistré en PNG. */
function checkerPng(file: string): string {
  const r = createRaster(192, 192);
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 192; x++) {
      const v = (x < 96) === (y < 96) ? 0 : 255;
      const o = (y * 192 + x) * 4;
      r.data[o] = v;
      r.data[o + 1] = v;
      r.data[o + 2] = v;
      r.data[o + 3] = 255;
    }
  }
  writeFileSync(file, encodePng(r, 96));
  return file;
}

/** Remplace la boîte « Ouvrir » native : elle « choisit » ces fichiers. */
async function stubOpenDialog(app: ElectronApplication, files: string[]): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    (dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({ canceled: false, filePaths: chosen });
  }, files);
}

async function clickBlock(page: Page, x: number, y: number): Promise<void> {
  const p = await pagePoint(page, x, y);
  await page.mouse.click(p.x, p.y);
}

/** Échantillonne le canvas du bloc le long d'une horizontale (pouces) et compte les plages claires et foncées. */
async function runsAcross(page: Page, y: number, x0: number, x1: number): Promise<string> {
  return page.getByTestId("block-canvas").evaluate(
    (el, args) => {
      const canvas = el as HTMLCanvasElement;
      const ctx = canvas.getContext("2d");
      if (!ctx) return "";
      const dpr = canvas.width / canvas.clientWidth;
      const scale = Number(canvas.dataset.scale);
      const ox = Number(canvas.dataset.originX);
      const oy = Number(canvas.dataset.originY);
      const py = Math.round((oy + args.y * scale) * dpr);
      const from = Math.round((ox + args.x0 * scale) * dpr);
      const to = Math.round((ox + args.x1 * scale) * dpr);
      const row = ctx.getImageData(from, py, to - from, 1).data;
      let runs = "";
      for (let i = 0; i < row.length; i += 4) {
        const c = (row[i] as number) + (row[i + 1] as number) + (row[i + 2] as number) > 384 ? "C" : "F";
        if (runs.at(-1) !== c) runs += c;
      }
      return runs;
    },
    { y, x0, x1 },
  );
}

function readProject(file: string): { sketchbook: Record<string, unknown[]>; assets: Record<string, unknown> } {
  return JSON.parse(strFromU8(unzipSync(readFileSync(file))["project.json"] as Uint8Array));
}

test("un damier PNG de 1 po à 96 ppp, ajouté comme tissu, montre 2 cases à travers une pièce de 2 po", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Tissus");
  const png = checkerPng(path.join(sandbox.root, "damier.png"));

  // Plan Image : importer, vérifier la taille réelle, ajouter comme tissu.
  await stubOpenDialog(app, [png]);
  await page.getByTestId("worktable-image").click();
  await page.getByTestId("image-import").click();
  await expect(page.getByTestId("image-info")).toContainText("192 × 192 px à 96 ppp");
  await expect(page.getByTestId("image-info")).toContainText("2 po × 2 po");
  await expect(page.getByTestId("image-stage")).toHaveScreenshot("m4-image.png");
  await page.getByTestId("image-add-fabric").click();
  await expect(page.getByTestId("notice")).toContainText("Tissu « damier » ajouté");

  // Plan Bloc : grille 3 × 3 sur 6 po (pièces de 2 po), le tissu sur la pièce du coin.
  await openBlockEditor(page);
  await page.getByTestId("tool-grid").click();
  await drag(page, [0, 0], [6, 6]);
  await page.getByTestId("tab-2").click();
  await page.getByTestId("ptab-fabrics").click();
  await page.locator('[data-testid="swatch"][title^="damier"]').click();
  await clickBlock(page, 1, 1);
  await expect(page.getByTestId("block-stage")).toHaveAttribute("data-filled", "1");
  // Deux cases (foncée puis claire) à travers la pièce : le tissu est à l'échelle réelle.
  await expect.poll(() => runsAcross(page, 0.5, 0.1, 1.9)).toBe("FC");
  expect(await runsAcross(page, 1.5, 0.1, 1.9)).toBe("CF");

  // Coupe ciblée : tirer le tissu d'environ 1/2 po vers la droite (la souris tombe au pixel près), puis les flèches.
  await page.getByTestId("ctool-fussy").click();
  await drag(page, [1, 1], [1.5, 1]);
  const offset = page.getByTestId("fussy-offset");
  const ox = async () => Number(await offset.getAttribute("data-x"));
  await expect.poll(ox).toBeCloseTo(0.5, 1);
  expect(Number(await offset.getAttribute("data-y"))).toBeCloseTo(0, 6);
  const dragged = await ox();
  expect(await runsAcross(page, 0.5, 0.1, 1.9)).toBe("CFC");
  await page.keyboard.press("ArrowRight");
  await expect.poll(ox).toBeCloseTo(dragged + 1 / 16, 9);
  await page.keyboard.press("Control+ArrowLeft");
  await expect.poll(ox).toBeCloseTo(dragged + 1 / 16 - 1 / 2, 9);
  // Annuler défait les flèches (une étape), puis le glissement (une étape).
  await menuCommand(app, "undo");
  await expect.poll(ox).toBeCloseTo(dragged, 9);
  await menuCommand(app, "undo");
  await expect(offset).toHaveText("Décalage du tissu : 0 po ; 0 po");
  await menuCommand(app, "redo");
  await expect.poll(ox).toBeCloseTo(dragged, 9);

  // Outils Fil : une couture, puis tout le bloc.
  await page.getByTestId("ctool-threadBrush").click();
  await expect(page.getByTestId("thread-panel")).toBeVisible();
  await page.locator('[data-testid="thread-swatch"][data-rgb="#b71c1c"]').click();
  await page.getByTestId("thread-prop-style").check();
  await page.getByTestId("thread-style-dash").click();
  await clickBlock(page, 2, 3);
  await expect(page.getByTestId("coloring-bar")).toHaveAttribute("data-threads", "1");
  await page.getByTestId("ctool-threadSpray").click();
  await page.getByTestId("thread-prop-color").uncheck();
  await page.getByTestId("thread-style-dot").click();
  await clickBlock(page, 5, 5);
  await expect(page.getByTestId("coloring-bar")).toHaveAttribute("data-threads", "24");
  await expect(page.getByTestId("block-stage")).toHaveScreenshot("m4-coloration-tissu.png");

  // Ajouter au carnet : l'image, le décalage et les fils sont enregistrés dans le projet.
  await page.getByTestId("tool-add").click();
  await expect(page.getByTestId("save-state")).toHaveText("Enregistré");
  const saved = readProject(sandbox.projectFile("Tissus"));
  const fabrics = saved.sketchbook.fabrics as { card: { name: string }; source: { kind: string; ppi: number; asset: string } }[];
  const damier = fabrics.find((f) => f.card.name === "damier");
  expect(damier?.source).toMatchObject({ kind: "image", ppi: 96 });
  expect(Object.keys(saved.assets)).toContain(damier?.source.asset);
  const block = (saved.sketchbook.blocks as { colorings: { fills: Record<string, { offset?: { x: number } }>; threads: Record<string, { rgb: string; style: string }> }[] }[])[0];
  const coloring = block?.colorings[0];
  expect(Object.values(coloring?.fills ?? {})[0]?.offset?.x).toBeCloseTo(dragged, 9);
  expect(Object.keys(coloring?.threads ?? {})).toHaveLength(24);
  expect(Object.values(coloring?.threads ?? {}).filter((t) => t.rgb === "#b71c1c")).toHaveLength(1);
  expect(Object.values(coloring?.threads ?? {}).every((t) => t.style === "dot")).toBe(true);
  void app;
});

test("plan Image : échelle du tissu, mesure, recadrage, rotation, annuler ; copie vers Photos et Modifier", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Images");
  const png = checkerPng(path.join(sandbox.root, "carreaux.png"));
  await stubOpenDialog(app, [png]);
  // Fichier > Importer une image (Ctrl+I) ouvre le plan Image et la boîte d'import.
  await menuCommand(app, "import-image");
  await expect(page.getByTestId("image-canvas")).toHaveAttribute("data-width", "192");

  // Échelle du tissu : l'image entière mesure 4 po → 48 ppp.
  await page.getByTestId("image-scale-width").fill("4");
  await page.getByTestId("image-scale-width").press("Enter");
  await page.getByTestId("image-scale-apply").click();
  await expect(page.getByTestId("image-canvas")).toHaveAttribute("data-ppi", "48");
  await expect(page.getByTestId("image-info")).toContainText("4 po × 4 po");
  // Les flèches avancent par ¼ po.
  await page.getByTestId("image-scale-width").press("ArrowUp");
  await expect(page.getByTestId("image-scale-width")).toHaveValue("4,25");

  // Mesurer une zone : un segment tracé sur toute la largeur (192 px) mesure 2 po → 96 ppp.
  await page.getByTestId("itool-measure").click();
  const canvas = page.getByTestId("image-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas");
  const zoom = Number(await canvas.getAttribute("data-zoom"));
  const ox = Number(await canvas.getAttribute("data-origin-x"));
  const oy = Number(await canvas.getAttribute("data-origin-y"));
  await page.mouse.move(box.x + ox + 0.2, box.y + oy + 50 * zoom);
  await page.mouse.down();
  await page.mouse.move(box.x + ox + 192 * zoom, box.y + oy + 50 * zoom, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("image-measured")).toContainText("192 px");
  await page.getByTestId("image-measure-length").fill("2");
  await page.getByTestId("image-measure-length").press("Enter");
  await page.getByTestId("image-measure-apply").click();
  await expect(page.getByTestId("image-canvas")).toHaveAttribute("data-ppi", "96");

  // Recadrer avec un préréglage de 1 × 1 po… trop grand : refusé ; 2 × 2 po → image entière ; puis aux nombres.
  await page.getByTestId("itool-crop").click();
  await page.getByTestId("crop-preset").selectOption("in-4x6");
  await expect(page.getByTestId("notice")).toContainText("plus grand que l'image");
  await page.getByTestId("crop-w").fill("1");
  await page.getByTestId("crop-w").press("Enter");
  await page.getByTestId("crop-h").fill("1,5");
  await page.getByTestId("crop-h").press("Enter");
  await expect(page.getByTestId("crop-size")).toHaveText("Cadre : 96 × 144 px");
  await page.getByTestId("crop-apply").click();
  await expect(page.getByTestId("image-canvas")).toHaveAttribute("data-width", "96");
  await expect(page.getByTestId("image-canvas")).toHaveAttribute("data-height", "144");

  // Pivoter de 90° : les dimensions s'échangent ; annuler revient en arrière.
  await page.getByTestId("rotate-ccw").click();
  await expect(page.getByTestId("image-canvas")).toHaveAttribute("data-width", "144");
  await page.getByTestId("tool-undo").click();
  await expect(page.getByTestId("image-canvas")).toHaveAttribute("data-width", "96");
  await page.getByTestId("tool-redo").click();
  await expect(page.getByTestId("image-canvas")).toHaveAttribute("data-width", "144");

  // Enregistrer dans Photos, puis Copier vers Tissus depuis le carnet.
  await page.getByTestId("image-add-photo").click();
  await expect(page.getByTestId("notice")).toContainText("Photo « carreaux » enregistrée");
  await openSketchbook(page);
  await page.getByTestId("section-photos").click();
  await expect(page.getByTestId("sketchbook-item")).toHaveCount(1);
  await page.getByTestId("sketchbook-item").first().click();
  await page.getByTestId("copy-across").click();
  await expect(page.getByTestId("notice")).toContainText("Copié dans la section Tissus");
  await page.getByTestId("section-fabrics").click();
  await expect(page.locator('[data-testid="sketchbook-item"][title="carreaux"]')).toHaveCount(1);

  // « Modifier » une photo : elle revient sur le plan Image.
  await page.getByTestId("section-photos").click();
  await page.getByTestId("sketchbook-item").first().click();
  await page.getByTestId("edit-item").click();
  await expect(page.getByTestId("image-canvas")).toHaveAttribute("data-width", "144");
  await expect(page.getByTestId("notice")).toContainText("posée sur le plan Image");

  // Le projet enregistré contient l'image une seule fois (photo et tissu la partagent).
  await expect(page.getByTestId("save-state")).toHaveText("Enregistré");
  const saved = readProject(sandbox.projectFile("Images"));
  expect(saved.sketchbook.photos).toHaveLength(1);
  expect(Object.keys(saved.assets)).toHaveLength(1);
});

test("bibliothèque de tissus : ajout, recherche par couleur, Mes favoris ; fils par numéro", async () => {
  const { app, page } = await launch(sandbox);
  await createProject(page, "Biblio");

  await page.getByTestId("tool-fabric-library").click();
  const library = page.getByTestId("fabric-library");
  await library.waitFor();
  await page.getByTestId("library-style").filter({ hasText: "Pois" }).click();
  await expect(page.getByTestId("library-count")).toHaveText("24 éléments");
  // Le premier tissu du style est déjà dans un projet neuf (tissus par défaut) : on prend les deux suivants.
  await page.getByTestId("library-item").nth(1).click();
  await page.getByTestId("library-item").nth(2).click({ modifiers: ["Control"] });
  await page.getByTestId("library-add").click();
  await expect(page.getByTestId("notice")).toContainText("2 tissus ajoutés au carnet");

  // Recherche par couleur : la couleur moyenne de l'élément sélectionné ; les plus proches d'abord.
  await page.getByTestId("library-search").click();
  await page.getByTestId("search-max").fill("5");
  await page.getByTestId("search-run").click();
  await expect(page.getByTestId("library-count")).toHaveText("5 éléments");
  await page.getByTestId("library-show-average").check();
  await expect(page.getByTestId("average-corner")).toHaveCount(5);
  await expect(library).toHaveScreenshot("m4-bibliotheque-tissus.png");

  // Mes favoris : créer une bibliothèque de 2 styles, copier, coller dans le style 2, enregistrer.
  await page.getByTestId("library-item").nth(0).click();
  await page.getByTestId("library-item").nth(1).click({ modifiers: ["Shift"] });
  await page.getByTestId("library-copy").click();
  await page.getByTestId("favorite-create").click();
  await page.getByTestId("favorite-name").fill("Mes tissus");
  await page.getByTestId("favorite-styles").fill("2");
  await page.getByTestId("favorite-form-ok").click();
  const favFile = path.join(sandbox.docsDir, "Quilt Studio", "Favoris", "Tissus", "Mes tissus.qsl");
  await expect.poll(() => existsSync(favFile)).toBe(true);
  await page.getByTestId("favorite-style").nth(1).click();
  await page.getByTestId("library-paste").click();
  await expect(page.getByTestId("library-count")).toHaveText("2 éléments");
  await expect(page.getByTestId("favorite-library")).toHaveText("Mes tissus *");
  await page.getByTestId("favorite-save").click();
  await expect(page.getByTestId("favorite-library")).toHaveText("Mes tissus");
  // Supprimer un élément du style (avec confirmation), sans enregistrer : le rappel s'affiche en quittant.
  await page.getByTestId("library-item").first().click();
  await page.getByTestId("library-remove").click();
  await page.getByTestId("dialog-ok").click();
  await expect(page.getByTestId("library-count")).toHaveText("1 élément");
  await page.getByTestId("library-current").click();
  await expect(page.getByTestId("dialog")).toContainText("a été modifiée");
  await page.getByTestId("dialog-ok").click();
  await library.getByRole("button", { name: "Fermer" }).last().click();

  // Rouverte, la bibliothèque relit le fichier : le style 2 garde 1 élément.
  await page.getByTestId("tool-fabric-library").click();
  await page.getByTestId("favorite-style").nth(1).click();
  await expect(page.getByTestId("library-count")).toHaveText("1 élément");
  await page.getByTestId("fabric-library").getByRole("button", { name: "Fermer" }).last().click();

  // Fils : recherche par numéro, ajout au carnet.
  await menuCommand(app, "show-thread-library");
  await page.getByTestId("thread-library").waitFor();
  await page.getByTestId("library-search").click();
  await page.getByTestId("search-by-text").check();
  await page.getByTestId("search-text").fill("qs 1001");
  await page.getByTestId("search-run").click();
  await expect(page.getByTestId("library-count")).toHaveText("1 élément");
  await page.getByTestId("library-item").first().click();
  await expect(page.getByTestId("library-card-name")).toHaveText("Fil blanc clair");
  await page.getByTestId("library-add").click();
  await expect(page.getByTestId("notice")).toContainText("1 fil ajouté au carnet");
});

test("couleurs : sélecteur, dégradés (8 → 5), tri automatique et défaire le tri", async () => {
  const { page } = await launch(sandbox);
  await createProject(page, "Couleurs");
  await openSketchbook(page);
  await page.getByTestId("section-colors").click();
  const count = async () => Number(await page.getByTestId("sketchbook-grid").getAttribute("data-count"));
  const before = await count();

  // Notre sélecteur : hexadécimal, puis RVB ; deux couleurs ajoutées d'affilée.
  await page.getByTestId("add-colors").click();
  await page.getByTestId("picker-hex").fill("#3366cc");
  await expect(page.getByTestId("picker-preview")).toHaveAttribute("data-rgb", "#3366cc");
  await expect(page.getByTestId("picker-r")).toHaveValue("51");
  await page.getByTestId("picker-add").click();
  await page.getByTestId("picker-g").fill("200");
  await page.getByTestId("picker-g").press("Enter");
  await expect(page.getByTestId("picker-preview")).toHaveAttribute("data-rgb", "#33c8cc");
  await page.getByTestId("picker-add").click();
  await expect(page.getByTestId("picker-added")).toHaveText("2 couleurs ajoutées au carnet.");
  await page.getByTestId("color-picker").getByRole("button", { name: "Fermer" }).last().click();
  expect(await count()).toBe(before + 2);

  // Clic droit sur une couleur > Dégradés : 8 couleurs au départ, réduites à 5, ajoutées à la fin.
  await page.getByTestId("sketchbook-item").first().click({ button: "right" });
  await page.getByTestId("cmenu-grades").click();
  await expect(page.getByTestId("ramp-strip")).toHaveAttribute("data-count", "8");
  await page.getByTestId("ramp-second").nth(5).click();
  await page.getByTestId("ramp-count").fill("5");
  await expect(page.getByTestId("ramp-strip")).toHaveAttribute("data-count", "5");
  await page.getByTestId("ramp-swatch").nth(2).click();
  await page.getByTestId("ramp-insert").click();
  await expect(page.getByTestId("ramp-strip")).toHaveAttribute("data-count", "6");
  await page.getByTestId("ramp-remove").click();
  await expect(page.getByTestId("ramp-strip")).toHaveAttribute("data-count", "5");
  await expect(page.getByTestId("ramp-dialog")).toHaveScreenshot("m4-degrades.png");
  await page.getByTestId("ramp-add").click();
  // Les extrémités (blanc et la couleur choisie) sont déjà dans la palette : 3 couleurs nouvelles.
  await expect(page.getByTestId("notice")).toContainText("3 couleurs ajoutées");
  expect(await count()).toBe(before + 5);

  // Tri automatique par luminosité décroissante : le blanc passe… en fin, avec les gris. Puis défaire le tri.
  const titles = () => page.getByTestId("sketchbook-item").evaluateAll((els) => els.map((e) => e.getAttribute("title")));
  const original = await titles();
  await page.getByTestId("sketchbook-item").first().click({ button: "right" });
  await page.getByTestId("cmenu-sort-auto").click();
  await page.getByTestId("color-sort-hue").check();
  await page.getByTestId("color-sort-apply").click();
  const sorted = await titles();
  expect(sorted).not.toEqual(original);
  expect([...sorted].sort()).toEqual([...original].sort());
  expect(sorted.at(-1)).toBe("Noir");
  await page.getByTestId("sketchbook-item").first().click({ button: "right" });
  await page.getByTestId("cmenu-sort-undo").click();
  expect(await titles()).toEqual(original);
});
