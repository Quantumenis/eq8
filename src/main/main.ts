import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { IPC, type AppInfo, type ThemeMode } from "../shared/api.js";

const APP_NAME = "Quilt Studio";
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: `${APP_NAME} — Sans titre`,
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

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "&Fichier",
      submenu: [
        { label: "Nouveau projet…", accelerator: "CmdOrCtrl+N", enabled: false },
        { label: "Ouvrir un projet…", accelerator: "CmdOrCtrl+O", enabled: false },
        { label: "Ajouter au carnet", accelerator: "CmdOrCtrl+S", enabled: false },
        { type: "separator" },
        { label: "Quitter", accelerator: "Alt+F4", role: "quit" },
      ],
    },
    {
      label: "&Édition",
      submenu: [
        { label: "Annuler", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "Rétablir", accelerator: "CmdOrCtrl+Y", role: "redo" },
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
  ipcMain.handle(IPC.getAppInfo, (): AppInfo => ({ name: APP_NAME, version: app.getVersion() }));
  ipcMain.handle(IPC.setTheme, (_event, mode: unknown) => {
    if (mode === "light" || mode === "dark" || mode === "system") {
      nativeTheme.themeSource = mode;
    }
  });
}

app.setName(APP_NAME);
app.setAppUserModelId("app.quiltstudio.desktop");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });

  void app.whenReady().then(() => {
    registerIpc();
    buildMenu();
    createWindow();
  });

  app.on("window-all-closed", () => app.quit());
}
