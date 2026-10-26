// Impression et export (SPEC §9, §10) côté processus principal : polices système à intégrer au PDF, boîte
// « Enregistrer » des exports, impression par le dialogue Windows (en taille réelle) et presse-papiers.

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, clipboard, ClipboardItem, dialog } from "electron";
import { groupFonts, readFontNames, type InstalledFont } from "../core/text/sfnt.js";
import { IPC, type ExportKind, type FontVariant, type InstalledFontInfo, type PrintJob, type PrintOutcome, type SaveResult } from "../shared/api.js";
import { handle } from "./ipc.js";
import { writeFileAtomic } from "./store.js";

/** Polices proposées (Q-9.10) et leurs fichiers sous Windows : seules celles-ci peuvent être lues. */
const FONT_FILES: Record<string, [string, string]> = {
  Arial: ["arial.ttf", "arialbd.ttf"],
  "Segoe UI": ["segoeui.ttf", "segoeuib.ttf"],
  Calibri: ["calibri.ttf", "calibrib.ttf"],
  Verdana: ["verdana.ttf", "verdanab.ttf"],
  Tahoma: ["tahoma.ttf", "tahomabd.ttf"],
  Georgia: ["georgia.ttf", "georgiab.ttf"],
  "Times New Roman": ["times.ttf", "timesbd.ttf"],
  "Courier New": ["cour.ttf", "courbd.ttf"],
};

const MAX_FONT_BYTES = 30 * 1024 * 1024;
const MAX_EXPORT_BYTES = 512 * 1024 * 1024;
const MAX_PRINT_HTML = 256 * 1024 * 1024;

const EXPORT_FILTERS: Record<ExportKind, { name: string; extensions: string[] }> = {
  pdf: { name: "Document PDF", extensions: ["pdf"] },
  png: { name: "Image PNG", extensions: ["png"] },
  jpg: { name: "Image JPEG", extensions: ["jpg", "jpeg"] },
  svg: { name: "Image SVG", extensions: ["svg"] },
};

function fontsDir(): string {
  return path.join(process.env.WINDIR || "C:\\Windows", "Fonts");
}

export function exportsDir(): string {
  const root = process.env.QUILT_STUDIO_DOCUMENTS_DIR || app.getPath("documents");
  return path.join(root, "Quilt Studio", "Exports");
}

/** Un nom de fichier proposé sans caractère interdit sous Windows. */
function safeFileName(name: string, fallback: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return cleaned.replace(/[. ]+$/, "") || fallback;
}

/** Les polices installées (liste lue une fois : le dossier Fonts de Windows). */
let installedFonts: Promise<InstalledFont[]> | null = null;
const MAX_FONT_FILES = 3000;

async function scanInstalledFonts(): Promise<InstalledFont[]> {
  const dir = fontsDir();
  let names: string[] = [];
  try {
    names = (await fs.readdir(dir)).filter((n) => /\.(ttf|otf)$/i.test(n)).slice(0, MAX_FONT_FILES);
  } catch {
    return [];
  }
  const found: { file: string; names: NonNullable<Awaited<ReturnType<typeof readFontNames>>> }[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      const file = names[i];
      if (file === undefined) return;
      let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
      try {
        handle = await fs.open(path.join(dir, file), "r");
        const size = (await handle.stat()).size;
        const open = handle;
        const read = async (offset: number, length: number): Promise<Uint8Array> => {
          const buf = Buffer.alloc(length);
          const r = await open.read(buf, 0, length, offset);
          return new Uint8Array(buf.buffer, buf.byteOffset, r.bytesRead);
        };
        const n = await readFontNames(read, size);
        if (n) found.push({ file, names: n });
      } catch {
        // Police illisible : ignorée.
      } finally {
        await handle?.close().catch(() => undefined);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return groupFonts(found);
}

let printing = false;
let pdfCounter = 0;

async function printJob(job: PrintJob): Promise<PrintOutcome> {
  if (printing) return { ok: false, error: "busy" };
  printing = true;
  const file = path.join(app.getPath("temp"), `quilt-studio-print-${randomBytes(6).toString("hex")}.html`);
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
  try {
    await fs.writeFile(file, job.html, "utf8");
    await win.loadFile(file);
    const landscape = job.width > job.height;
    const portrait = { width: Math.min(job.width, job.height), height: Math.max(job.width, job.height) };
    const toPdf = process.env.QUILT_STUDIO_PRINT_TO_PDF;
    if (toPdf) {
      // Tests : la même page est « imprimée » dans un PDF au lieu d'ouvrir le dialogue de Windows.
      const data = await win.webContents.printToPDF({ pageSize: portrait, landscape, margins: { top: 0, bottom: 0, left: 0, right: 0 }, printBackground: true, preferCSSPageSize: true });
      pdfCounter += 1;
      await fs.mkdir(toPdf, { recursive: true });
      await fs.writeFile(path.join(toPdf, `impression-${pdfCounter}.pdf`), data);
      return { ok: true };
    }
    // Dialogue d'impression de Windows : marges nulles et format exact, donc aucune mise à l'échelle (taille réelle).
    const result = await new Promise<{ success: boolean; reason: string }>((resolve) => {
      win.webContents.print(
        {
          silent: false,
          printBackground: true,
          copies: Math.max(1, Math.min(99, Math.round(job.copies))),
          landscape,
          margins: { marginType: "none" },
          pageSize: { width: Math.round(portrait.width * 25400), height: Math.round(portrait.height * 25400) },
        },
        (success, reason) => resolve({ success, reason }),
      );
    });
    if (result.success) return { ok: true };
    return { ok: false, error: result.reason === "cancelled" ? "cancelled" : "failed" };
  } catch {
    return { ok: false, error: "failed" };
  } finally {
    printing = false;
    win.destroy();
    await fs.rm(file, { force: true }).catch(() => undefined);
  }
}

export function registerPrintIpc(getWindow: () => BrowserWindow | null): void {
  handle(IPC.readSystemFont, async (_event, family: unknown, bold: unknown): Promise<Uint8Array | null> => {
    if (typeof family !== "string" || !(family in FONT_FILES)) return null;
    const files = FONT_FILES[family] as [string, string];
    const name = bold === true ? files[1] : files[0];
    try {
      const file = path.join(fontsDir(), name);
      const stat = await fs.stat(file);
      if (stat.size > MAX_FONT_BYTES) return null;
      return new Uint8Array(await fs.readFile(file));
    } catch {
      return null;
    }
  });

  handle(IPC.listInstalledFonts, async (): Promise<InstalledFontInfo[]> => {
    installedFonts ??= scanInstalledFonts();
    return installedFonts;
  });

  handle(IPC.readInstalledFont, async (_event, family: unknown, variant: unknown): Promise<Uint8Array | null> => {
    if (typeof family !== "string" || typeof variant !== "string") return null;
    installedFonts ??= scanInstalledFonts();
    const entry = (await installedFonts).find((f) => f.family === family);
    const file = entry?.files[variant as FontVariant];
    if (!file) return null;
    try {
      const full = path.join(fontsDir(), file);
      const stat = await fs.stat(full);
      if (stat.size > MAX_FONT_BYTES) return null;
      return new Uint8Array(await fs.readFile(full));
    } catch {
      return null;
    }
  });

  handle(IPC.exportFile, async (_event, kind: unknown, suggested: unknown, bytes: unknown): Promise<SaveResult | null> => {
    const win = getWindow();
    if (!win || typeof kind !== "string" || !(kind in EXPORT_FILTERS) || !(bytes instanceof Uint8Array)) return { ok: false, error: "io" };
    if (bytes.byteLength > MAX_EXPORT_BYTES) return { ok: false, error: "too-large" };
    const filter = EXPORT_FILTERS[kind as ExportKind];
    const dir = exportsDir();
    await fs.mkdir(dir, { recursive: true }).catch(() => undefined);
    const base = safeFileName(typeof suggested === "string" ? suggested : "", "Quilt Studio");
    const result = await dialog.showSaveDialog(win, {
      title: "Exporter",
      defaultPath: path.join(dir, `${base}.${filter.extensions[0]}`),
      filters: [filter],
    });
    if (result.canceled || !result.filePath) return null;
    let target = result.filePath;
    if (!filter.extensions.includes(path.extname(target).slice(1).toLowerCase())) target += `.${filter.extensions[0]}`;
    try {
      await writeFileAtomic(target, bytes);
      return { ok: true, path: target };
    } catch {
      return { ok: false, error: "io" };
    }
  });

  handle(IPC.printDocument, async (_event, job: unknown): Promise<PrintOutcome> => {
    const j = job as Partial<PrintJob> | null;
    if (!j || typeof j.html !== "string" || j.html.length > MAX_PRINT_HTML || typeof j.width !== "number" || typeof j.height !== "number") return { ok: false, error: "failed" };
    if (!(j.width > 0 && j.width < 100 && j.height > 0 && j.height < 100)) return { ok: false, error: "failed" };
    return printJob({ html: j.html, width: j.width, height: j.height, copies: typeof j.copies === "number" ? j.copies : 1, title: typeof j.title === "string" ? j.title : "" });
  });

  handle(IPC.copyImage, async (_event, bytes: unknown): Promise<boolean> => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_EXPORT_BYTES) return false;
    try {
      await clipboard.write([new ClipboardItem({ "image/png": new Blob([new Uint8Array(bytes)], { type: "image/png" }) })]);
      return true;
    } catch {
      return false;
    }
  });
}
