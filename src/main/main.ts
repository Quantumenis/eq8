import path from "node:path";
import { app, BrowserWindow, dialog, Menu, nativeTheme } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { projectNameFromPath } from "../core/project/names.js";
import {
  IPC,
  type AppInfo,
  type DocumentState,
  type MenuCommand,
  type Preferences,
  type RecoveryInfo,
  type ThemeMode,
} from "../shared/api.js";
import { handle } from "./ipc.js";
import { registerLibraryIpc } from "./library.js";
import { registerProjectIpc } from "./projects.js";
import {
  DEFAULT_PREFERENCES,
  applyDataDirOverride,
  autosaveIntervalMs,
  checkPreviousRecovery,
  clearSessionRecovery,
  discardPreviousRecovery,
  loadPreferences,
  readDefaultPalette,
  readPreviousRecovery,
  removeDefaultPalette,
  savePreferences,
  shelveInterruptedSession,
  writeDefaultPalette,
  writeSessionRecovery,
} from "./store.js";

const APP_NAME = "Quilt Studio";
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let documentState: DocumentState = { name: "Sans titre", modified: false };
let closeConfirmed = false;

function windowTitle(): string {
  return `${APP_NAME} — ${documentState.name}${documentState.modified ? " *" : ""}`;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: windowTitle(),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1d2026" : "#f4f2ee",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  // Le titre suit le projet ouvert : celui de la page HTML ne doit pas l'écraser.
  mainWindow.on("page-title-updated", (event) => event.preventDefault());
  mainWindow.on("close", (event) => {
    if (closeConfirmed || !documentState.modified || !mainWindow || mainWindow.webContents.isCrashed()) {
      void clearSessionRecovery();
      return;
    }
    // Projet modifié : l'interface propose d'enregistrer, puis confirme la fermeture.
    event.preventDefault();
    mainWindow.webContents.send(IPC.beforeClose);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Aucune navigation ni ouverture de fenêtre externe depuis l'interface.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());

  void mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

function requestTheme(mode: ThemeMode): void {
  mainWindow?.webContents.send(IPC.themeRequested, mode);
}

function sendCommand(command: MenuCommand, argument?: string): void {
  mainWindow?.webContents.send(IPC.menuCommand, command, argument);
}

async function buildMenu(): Promise<void> {
  const prefs = await loadPreferences();
  const recentItems: MenuItemConstructorOptions[] =
    prefs.recents.length > 0
      ? prefs.recents.map((file) => ({
          label: projectNameFromPath(file).replaceAll("&", "&&"),
          sublabel: file,
          click: () => sendCommand("open-recent", file),
        }))
      : [{ label: "(aucun)", enabled: false }];

  const command = (label: string, id: MenuCommand, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    ...(accelerator ? { accelerator } : {}),
    click: () => sendCommand(id),
  });

  const template: MenuItemConstructorOptions[] = [
    {
      label: "&Fichier",
      submenu: [
        command("Nouveau projet…", "new", "CmdOrCtrl+N"),
        command("Ouvrir un projet…", "open", "CmdOrCtrl+O"),
        { label: "Projets récents", submenu: recentItems },
        { type: "separator" },
        command("Enregistrer", "save", "CmdOrCtrl+S"),
        command("Enregistrer sous…", "save-as", "CmdOrCtrl+Shift+S"),
        command("Créer une copie du projet…", "save-copy"),
        { type: "separator" },
        command("Importer une image…", "import-image", "CmdOrCtrl+I"),
        { type: "separator" },
        command("Ajouter au carnet", "add-to-sketchbook", "CmdOrCtrl+Shift+A"),
        command("Afficher le carnet", "show-sketchbook", "CmdOrCtrl+B"),
        { type: "separator" },
        command("Enregistrer la palette comme défaut", "save-default-palette"),
        command("Préférences…", "preferences", "CmdOrCtrl+,"),
        { type: "separator" },
        { label: "Quitter", accelerator: "Alt+F4", role: "quit" },
      ],
    },
    {
      label: "&Édition",
      submenu: [
        command("Annuler", "undo", "CmdOrCtrl+Z"),
        { ...command("Rétablir", "redo", "CmdOrCtrl+Y") },
        { label: "Rétablir (variante)", accelerator: "CmdOrCtrl+Shift+Z", visible: false, click: () => sendCommand("redo") },
        { type: "separator" },
        { label: "Couper", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "Copier", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "Coller", accelerator: "CmdOrCtrl+V", role: "paste" },
        { label: "Tout sélectionner", accelerator: "CmdOrCtrl+A", role: "selectAll" },
      ],
    },
    {
      label: "&Affichage",
      submenu: [
        {
          label: "Thème",
          submenu: [
            { label: "Clair", click: () => requestTheme("light") },
            { label: "Sombre", click: () => requestTheme("dark") },
            { label: "Système", click: () => requestTheme("system") },
          ],
        },
        { type: "separator" },
        { label: "Plein écran", accelerator: "F11", role: "togglefullscreen" },
        ...(isDev
          ? ([
              { type: "separator" },
              { label: "Outils de développement", accelerator: "CmdOrCtrl+Shift+I", role: "toggleDevTools" },
            ] satisfies MenuItemConstructorOptions[])
          : []),
      ],
    },
    {
      label: "&Bibliothèques",
      submenu: [
        command("Blocs…", "show-block-library", "CmdOrCtrl+L"),
        command("Tissus…", "show-fabric-library", "CmdOrCtrl+Shift+F"),
        command("Fils…", "show-thread-library", "CmdOrCtrl+Shift+T"),
      ],
    },
    {
      label: "&Aide",
      submenu: [
        {
          label: `À propos de ${APP_NAME}`,
          click: () => {
            if (!mainWindow) return;
            void dialog.showMessageBox(mainWindow, {
              type: "info",
              title: `À propos de ${APP_NAME}`,
              message: APP_NAME,
              detail: `Version ${app.getVersion()}\nConception de quilts : blocs, dispositions, tissus et patrons à l'échelle.`,
              buttons: ["OK"],
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc(): void {
  handle(IPC.getAppInfo, (): AppInfo => ({ name: APP_NAME, version: app.getVersion(), autosaveMs: autosaveIntervalMs() }));
  handle(IPC.setTheme, (_event, mode: unknown) => {
    if (mode === "light" || mode === "dark" || mode === "system") {
      nativeTheme.themeSource = mode;
    }
  });

  handle(IPC.getPreferences, (): Promise<Preferences> => loadPreferences());
  handle(IPC.setPreferences, async (_event, patch: unknown): Promise<Preferences> => {
    const p = (typeof patch === "object" && patch !== null ? patch : {}) as Partial<Preferences>;
    const current = await loadPreferences();
    return savePreferences({
      ...current,
      ...(p.unit === "in" || p.unit === "cm" ? { unit: p.unit } : {}),
      ...(typeof p.maxColorings === "number" ? { maxColorings: p.maxColorings } : {}),
    });
  });
  handle(IPC.resetPreferences, async (_event, alsoPalette: unknown): Promise<Preferences> => {
    const current = await loadPreferences();
    if (alsoPalette === true) await removeDefaultPalette();
    return savePreferences({ ...DEFAULT_PREFERENCES, recents: current.recents });
  });

  handle(IPC.writeRecovery, async (_event, bytes: unknown, info: unknown) => {
    const i = info as Partial<RecoveryInfo> | null;
    if (!(bytes instanceof Uint8Array) || !i || typeof i.name !== "string") return;
    await writeSessionRecovery(bytes, { name: i.name, path: typeof i.path === "string" ? i.path : null });
  });
  handle(IPC.clearRecovery, () => clearSessionRecovery());
  handle(IPC.checkRecovery, () => checkPreviousRecovery());
  handle(IPC.readRecovery, () => readPreviousRecovery());
  handle(IPC.discardRecovery, () => discardPreviousRecovery());

  handle(IPC.getDefaultPalette, () => readDefaultPalette());
  handle(IPC.saveDefaultPalette, async (_event, bytes: unknown) => {
    if (bytes instanceof Uint8Array) await writeDefaultPalette(bytes);
  });

  handle(IPC.confirmClose, () => {
    closeConfirmed = true;
    mainWindow?.close();
  });

  registerLibraryIpc(() => mainWindow);
  registerProjectIpc({
    getWindow: () => mainWindow,
    onRecentsChanged: () => void buildMenu(),
    onDocumentState: (state) => {
      documentState = state;
      mainWindow?.setTitle(windowTitle());
    },
  });
}

applyDataDirOverride();
app.setName(APP_NAME);
app.setAppUserModelId("app.quiltstudio.desktop");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });

  void app.whenReady().then(async () => {
    // Une session précédente interrompue est mise de côté avant que la nouvelle ne commence à sauvegarder.
    await shelveInterruptedSession();
    registerIpc();
    await buildMenu();
    createWindow();
  });

  app.on("window-all-closed", () => app.quit());
}
