import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { newProject } from "../core/project/defaults";
import { readQsp } from "../core/project/qsp";
import type { MenuCommand, Preferences as Prefs, RecoveryInfo, ThemeMode } from "../shared/api";
import { DialogsProvider, useDialogs } from "./components/Dialogs";
import { Modal } from "./components/Modal";
import { Preferences } from "./components/Preferences";
import { ProjectHelper } from "./components/ProjectHelper";
import { BlockWorkspace } from "./components/BlockWorkspace";
import { QuiltWorkspace } from "./components/QuiltWorkspace";
import { Sketchbook } from "./components/Sketchbook";
import { fr } from "./i18n/fr";
import { BlockIcon, ImageIcon, LogoIcon, QuiltIcon } from "./icons";
import { Library } from "./components/Library";
import { ImageWorkspace, type ImageRequests } from "./components/ImageWorkspace";
import { HelpDialog, HomeScreen, type HomeAction } from "./components/HomeHelp";
import { ItemLibraryDialog, type ItemLibraryKind } from "./components/ItemLibraryDialog";
import { getUiPrefs, useUiPrefs } from "./uiPrefs";
import { addCurrentBlock, cleanupReport, editBlockFromSketchbook } from "./blockActions";
import { blockEditor, useBlockEditor } from "./blockEditor";
import { addCurrentQuilt, editQuiltFromSketchbook } from "./quiltActions";
import { quiltEditor, useQuiltEditor } from "./quiltEditor";
import { imageEditor, useImageEditor } from "./imageEditor";
import type { LibraryKind } from "./libraryData";
import { createProjectActions, currentProjectName, getApi, type ProjectActions } from "./projectActions";
import { session, useSession } from "./projectSession";
import { useTheme } from "./useTheme";
import { printSettings, usePrintSettings } from "./printSettings";
import { FontsDialog, PageSetupDialog } from "./components/PrintSettingsDialogs";

type Worktable = "quilt" | "block" | "image";
type ModalState =
  | { kind: "helper"; tab: "create" | "open" }
  | { kind: "sketchbook" }
  | { kind: "library"; library: LibraryKind }
  | { kind: "items"; items: ItemLibraryKind }
  | { kind: "home" }
  | { kind: "help" }
  | { kind: "prefs" }
  | null;

const WORKTABLES: { id: Worktable; icon: ReactNode }[] = [
  { id: "quilt", icon: <QuiltIcon /> },
  { id: "block", icon: <BlockIcon /> },
  { id: "image", icon: <ImageIcon /> },
];

const THEMES: ThemeMode[] = ["light", "dark", "system"];
const DEFAULT_PREFS: Prefs = { unit: "in", maxColorings: 2, recents: [], print: null };
const NOTICE_MS = 6000;

export function App() {
  return (
    <DialogsProvider>
      <Workspace />
    </DialogsProvider>
  );
}

function Workspace() {
  const dialogs = useDialogs();
  const current = useSession();
  const blockDoc = useBlockEditor();
  const imageDoc = useImageEditor();
  const quiltDoc = useQuiltEditor();
  const [imageRequests, setImageRequests] = useState<ImageRequests>({ importImage: 0, editPhoto: null });
  const [worktable, setWorktable] = useState<Worktable>("quilt");
  const [ribbonTab, setRibbonTab] = useState<Record<Worktable, number>>({ quilt: 0, block: 0, image: 0 });
  const [theme, setTheme] = useTheme();
  const [version, setVersion] = useState("");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [autosaveMs, setAutosaveMs] = useState(0);
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState("");
  const [recovery, setRecovery] = useState<RecoveryInfo | null>(null);
  const printState = usePrintSettings();
  const ui = useUiPrefs();
  const countryRef = useRef("");
  const noticeTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), NOTICE_MS);
  }, []);

  const actions: ProjectActions = createProjectActions(prefs, dialogs, notify);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const worktableRef = useRef(worktable);
  worktableRef.current = worktable;
  const modalRef = useRef(modal);
  modalRef.current = modal;

  // Démarrage : préférences, palette par défaut, puis proposition de restauration d'une session interrompue.
  useEffect(() => {
    const api = getApi();
    let cancelled = false;
    void (async () => {
      const [info, loadedPrefs, paletteBytes] = await Promise.all([api.getAppInfo(), api.getPreferences(), api.getDefaultPalette()]);
      if (cancelled) return;
      setVersion(info.version);
      setAutosaveMs(info.autosaveMs);
      setPrefs(loadedPrefs);
      countryRef.current = info.country;
      printSettings.load(loadedPrefs.print, info.country);
      let palette = null;
      try {
        palette = paletteBytes ? readQsp(paletteBytes) : null;
      } catch {
        // Palette illisible : contenu d'origine.
      }
      session.load(newProject(palette, loadedPrefs.maxColorings), null);
      const pending = await api.checkRecovery();
      setRecovery(pending);
      if (!pending && getUiPrefs().showHome) setModal({ kind: "home" });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Titre de la fenêtre et confirmation à la fermeture : le processus principal doit connaître l'état du projet.
  useEffect(() => {
    void getApi().setDocumentState({ name: currentProjectName(), modified: current.modified });
  }, [current.version, current.modified, current.filePath]);

  // Sauvegarde automatique (uniquement si le projet a changé depuis la précédente).
  useEffect(() => {
    if (autosaveMs <= 0) return;
    const api = getApi();
    let lastVersion = -1;
    let written = false;
    const id = window.setInterval(() => {
      if (session.modified) {
        if (session.version === lastVersion) return;
        lastVersion = session.version;
        written = true;
        void api.writeRecovery(session.toQsp(), { name: currentProjectName(), path: session.filePath });
      } else if (written) {
        written = false;
        void api.clearRecovery();
      }
    }, autosaveMs);
    return () => window.clearInterval(id);
  }, [autosaveMs]);

  const runCommand = useCallback(
    (command: MenuCommand, argument?: string) => {
      const a = actionsRef.current;
      switch (command) {
        case "new":
          return setModal({ kind: "helper", tab: "create" });
        case "open":
          return setModal({ kind: "helper", tab: "open" });
        case "open-recent":
          return void (argument && a.openPath(argument));
        case "save":
          return void a.save();
        case "save-as":
          return void a.saveAs();
        case "save-copy":
          return void a.saveCopy();
        case "add-to-sketchbook": {
          if (worktableRef.current === "image") return notify(fr.messages.imageAdd);
          if (worktableRef.current === "quilt") {
            const added = addCurrentQuilt();
            if (added.outcome === "empty") return notify(fr.quilt.messages.emptyQuilt);
            if (added.outcome === "duplicate") return notify(fr.quilt.messages.stacked);
            notify(fr.quilt.messages.added);
            return void a.afterAddToSketchbook();
          }
          if (worktableRef.current !== "block") return notify(fr.messages.nothingToAdd);
          const result = addCurrentBlock();
          const report = cleanupReport(result.cleanup, prefsRef.current.unit);
          if (report) void dialogs.alert(report.message, report.detail);
          if (result.outcome === "empty") return notify(fr.draw.emptyBlock);
          if (result.outcome === "duplicate") return notify(fr.sketchbook.alreadyThere(fr.itemSingular.blocks));
          notify(result.outcome === "stacked" ? fr.coloring.stacked(result.position) : fr.sketchbook.added(fr.itemSingular.blocks));
          return void a.afterAddToSketchbook();
        }
        case "show-sketchbook":
          return setModal({ kind: "sketchbook" });
        case "show-block-library":
          return setModal({ kind: "library", library: "blocks" });
        case "show-fabric-library":
          return setModal({ kind: "library", library: "fabrics" });
        case "show-thread-library":
          return setModal({ kind: "library", library: "threads" });
        case "import-image":
          setModal(null);
          setWorktable("image");
          setRibbonTab((prev) => ({ ...prev, image: 0 }));
          return setImageRequests((r) => ({ ...r, importImage: r.importImage + 1 }));
        case "show-embroidery-library":
          return setModal({ kind: "items", items: "embroideries" });
        case "show-layout-library":
          return setModal({ kind: "items", items: "layouts" });
        case "open-quick-quilt":
          return setModal({ kind: "items", items: "quick" });
        case "show-home":
          return setModal({ kind: "home" });
        case "show-help":
          return setModal({ kind: "help" });
        case "preferences":
          return setModal({ kind: "prefs" });
        case "save-default-palette":
          return void a.saveDefaultPalette();
        case "page-setup":
          return printSettings.openDialog("setup");
        case "print-fonts":
          return printSettings.openDialog("fonts");
        case "undo":
        case "redo": {
          // Dans un champ de saisie ordinaire, Ctrl+Z défait la saisie ; ailleurs (et dans la fiche, dont chaque
          // modification est déjà une étape de l'historique), il défait le projet.
          const el = document.activeElement;
          const plainField = (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !el.closest("[data-project-history]");
          if (plainField) {
            document.execCommand(command);
          } else {
            // Dans les plans Bloc et Image, l'historique est celui du dessin ou de l'image en cours (sauf si une
            // fenêtre comme le carnet est ouverte).
            const target = modalRef.current ? session : worktableRef.current === "block" ? blockEditor : worktableRef.current === "image" ? imageEditor : worktableRef.current === "quilt" ? (command === "undo" ? (quiltEditor.canUndo ? quiltEditor : session) : quiltEditor.canRedo ? quiltEditor : session) : session;
            if (command === "undo") target.undo();
            else target.redo();
          }
        }
      }
    },
    [notify, dialogs],
  );

  useEffect(() => getApi().onMenuCommand(runCommand), [runCommand]);

  useEffect(
    () =>
      getApi().onBeforeClose(() => {
        void actionsRef.current.ensureSaved().then(async (ok) => {
          if (ok) await getApi().confirmClose();
        });
      }),
    [],
  );

  const updatePrefs = useCallback(async (patch: Partial<Pick<Prefs, "unit" | "maxColorings">>) => {
    setPrefs((current) => ({ ...current, ...patch })); // affichage immédiat, confirmé par le processus principal ensuite
    setPrefs(await getApi().setPreferences(patch));
  }, []);

  const resetPrefs = useCallback(
    async (alsoPalette: boolean) => {
      const next = await getApi().resetPreferences(alsoPalette);
      setPrefs(next);
      printSettings.load(next.print, countryRef.current);
      notify(fr.prefs.restored);
    },
    [notify],
  );

  const history = modal ? current : worktable === "block" ? blockDoc : worktable === "image" ? imageDoc : worktable === "quilt" ? (quiltDoc.canUndo || quiltDoc.canRedo ? quiltDoc : current) : current;
  const tabs = fr.ribbon[worktable];
  const activeTab = ribbonTab[worktable];
  const name = currentProjectName();

  return (
    <div className="app" data-worktable={worktable} data-ribbon={ui.sideRibbon ? "side" : "top"} data-icons={ui.smallIcons ? "small" : "normal"} data-tips={ui.hideTips ? "off" : "on"}>
      <a className="skip-link" href="#main-content" onClick={(e) => { e.preventDefault(); document.querySelector<HTMLElement>("[data-testid=worktable]")?.focus(); }}>
        {fr.m9.skip}
      </a>
      <header className="topbar">
        <div className="brand">
          <LogoIcon />
          <span className="brand-name">{fr.app.name}</span>
          <button
            type="button"
            className="project-name"
            data-testid="project-name"
            title={fr.project.nameButtonTitle}
            onClick={() => setModal({ kind: "helper", tab: "create" })}
          >
            {name}
            {current.modified ? " *" : ""}
          </button>
        </div>

        <div className="project-tools" role="toolbar" aria-label={fr.project.toolbar}>
          <button type="button" className="btn btn--small" data-testid="tool-save" disabled={!current.modified} onClick={() => void actions.save()}>
            {fr.project.save}
          </button>
          <button
            type="button"
            className="btn btn--small"
            data-testid="tool-undo"
            disabled={!history.canUndo}
            title={fr.project.undoTitle(history.undoLabel)}
            onClick={() => history.undo()}
          >
            {fr.project.undo}
          </button>
          <button
            type="button"
            className="btn btn--small"
            data-testid="tool-redo"
            disabled={!history.canRedo}
            title={fr.project.redoTitle(history.redoLabel)}
            onClick={() => history.redo()}
          >
            {fr.project.redo}
          </button>
          <button type="button" className="btn btn--small" data-testid="tool-sketchbook" onClick={() => setModal({ kind: "sketchbook" })}>
            {fr.project.sketchbook}
          </button>
          <button type="button" className="btn btn--small" data-testid="tool-add" onClick={() => runCommand("add-to-sketchbook")}>
            {fr.project.addToSketchbook}
          </button>
          <button type="button" className="btn btn--small" data-testid="tool-library" title={fr.library.openTitle} onClick={() => setModal({ kind: "library", library: "blocks" })}>
            {fr.library.open}
          </button>
          <button type="button" className="btn btn--small" data-testid="tool-fabric-library" title={fr.library.openFabricsTitle} onClick={() => setModal({ kind: "library", library: "fabrics" })}>
            {fr.library.openFabrics}
          </button>
          <button type="button" className="btn btn--small" data-testid="tool-home" onClick={() => setModal({ kind: "home" })}>
            {fr.m9.home.show}
          </button>
          <button type="button" className="btn btn--small" data-testid="tool-help" onClick={() => setModal({ kind: "help" })}>
            {fr.m9.help.open}
          </button>
          <button type="button" className="btn btn--small" data-testid="tool-thread-library" title={fr.library.openThreadsTitle} onClick={() => setModal({ kind: "library", library: "threads" })}>
            {fr.library.openThreads}
          </button>
        </div>

        <div className="worktable-switch" role="group" aria-label="Plans de travail">
          {WORKTABLES.map(({ id, icon }) => (
            <button
              key={id}
              type="button"
              className={`worktable-button worktable-button--${id}`}
              data-testid={`worktable-${id}`}
              aria-pressed={worktable === id}
              title={fr.worktables.switchTo(fr.worktables[id])}
              onClick={() => setWorktable(id)}
            >
              {icon}
              <span>{fr.worktables[id]}</span>
            </button>
          ))}
        </div>
      </header>

      <nav className="ribbon" role="tablist" aria-label="Ruban">
        {tabs.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            data-testid={`tab-${index}`}
            className="ribbon-tab"
            aria-selected={index === activeTab}
            onClick={() => setRibbonTab((prev) => ({ ...prev, [worktable]: index }))}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="body">
        {worktable === "quilt" ? (
          <QuiltWorkspace tab={activeTab} onTab={(index) => setRibbonTab((prev) => ({ ...prev, quilt: index }))} unit={prefs.unit} notify={notify} />
        ) : worktable === "block" ? (
          <BlockWorkspace
            tab={activeTab}
            onTab={(index) => setRibbonTab((prev) => ({ ...prev, block: index }))}
            unit={prefs.unit}
            notify={notify}
          />
        ) : worktable === "image" && activeTab === 0 ? (
          <ImageWorkspace unit={prefs.unit} notify={notify} onAdded={actions.afterAddToSketchbook} requests={imageRequests} />
        ) : (
          <>
            <aside className="palette" aria-label={fr.palette.title}>
              <h2 className="palette-title">{tabs[activeTab]}</h2>
              <p className="palette-empty">{fr.palette.empty}</p>
            </aside>

            <main className={`worktable worktable--${worktable}`} data-testid="worktable">
              <div className="worktable-sheet">
                <div className="worktable-icon">{WORKTABLES.find((w) => w.id === worktable)?.icon}</div>
                <p>{fr.placeholder[worktable]}</p>
              </div>
            </main>
          </>
        )}
      </div>

      <footer className="statusbar">
        <span data-testid="save-state">{current.modified ? fr.status.modified : fr.status.saved}</span>
        <span data-testid="units">{fr.status.units(prefs.unit)}</span>
        <span className="statusbar-notice" role="status" aria-live="polite" data-testid="notice">
          {notice || fr.status.ready}
        </span>
        <span className="statusbar-spacer" />
        <span className="theme-switch" role="group" aria-label={fr.status.theme}>
          {fr.status.theme} :
          {THEMES.map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={`theme-${mode}`}
              aria-pressed={theme === mode}
              onClick={() => setTheme(mode)}
            >
              {fr.status.themes[mode]}
            </button>
          ))}
        </span>
        {version && <span data-testid="app-version">{fr.status.version(version)}</span>}
      </footer>

      {modal?.kind === "helper" && <ProjectHelper actions={actions} initialTab={modal.tab} onClose={() => setModal(null)} />}
      {modal?.kind === "sketchbook" && (
        <Sketchbook
          unit={prefs.unit}
          notify={notify}
          onAdded={actions.afterAddToSketchbook}
          onEditBlock={(id, coloringIndex) => {
            if (!editBlockFromSketchbook(id, coloringIndex)) return notify(fr.sketchbook.editUnavailable);
            setModal(null);
            setWorktable("block");
            setRibbonTab((prev) => ({ ...prev, block: coloringIndex > 0 ? 2 : 1 }));
          }}
          onEditQuilt={(id) => {
            if (!editQuiltFromSketchbook(id)) return notify(fr.sketchbook.editUnavailable);
            setModal(null);
            setWorktable("quilt");
            setRibbonTab((prev) => ({ ...prev, quilt: 3 }));
          }}
          onEditPhoto={(id) => {
            setModal(null);
            setWorktable("image");
            setRibbonTab((prev) => ({ ...prev, image: 0 }));
            setImageRequests((r) => ({ ...r, editPhoto: { id, at: Date.now() } }));
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "library" && (
        <Library key={modal.library} kind={modal.library} unit={prefs.unit} notify={notify} onAdded={actions.afterAddToSketchbook} onClose={() => setModal(null)} />
      )}
      {modal?.kind === "items" && <ItemLibraryDialog kind={modal.items} notify={notify} onAdded={actions.afterAddToSketchbook} ensureSaved={() => actions.ensureSaved()} onClose={() => setModal(null)} />}
      {modal?.kind === "help" && <HelpDialog onClose={() => setModal(null)} />}
      {modal?.kind === "home" && (
        <HomeScreen
          onClose={() => setModal(null)}
          onAction={(a: HomeAction) => {
            setModal(null);
            if (a === "new-quilt") {
              setWorktable("quilt");
              setRibbonTab((prev) => ({ ...prev, quilt: 0 }));
            } else if (a === "quick-quilt") setModal({ kind: "items", items: "quick" });
            else if (a === "open-project") setModal({ kind: "helper", tab: "open" });
            else if (a === "new-block") {
              setWorktable("block");
              setRibbonTab((prev) => ({ ...prev, block: 0 }));
            } else if (a === "search-blocks") setModal({ kind: "library", library: "blocks" });
            else if (a === "edit-fabric") runCommand("import-image");
            else if (a === "search-fabrics") setModal({ kind: "library", library: "fabrics" });
            else if (a === "help") setModal({ kind: "help" });
          }}
        />
      )}
      {modal?.kind === "prefs" && (
        <Preferences
          prefs={prefs}
          onChange={updatePrefs}
          onReset={resetPrefs}
          onSavePalette={() => actions.saveDefaultPalette()}
          onClose={() => setModal(null)}
        />
      )}
      {printState.dialog === "setup" && <PageSetupDialog unit={prefs.unit} notify={notify} />}
      {printState.dialog === "fonts" && <FontsDialog />}
      {recovery && (
        <Modal
          title={fr.dialogs.recoveryTitle}
          size="narrow"
          testId="recovery-dialog"
          // Échap repousse la décision sans rien supprimer : la sauvegarde sera reproposée au prochain démarrage.
          onClose={() => setRecovery(null)}
          footer={
            <>
              <button
                type="button"
                className="btn"
                data-testid="recovery-ignore"
                onClick={() => {
                  void actions.ignoreRecovery();
                  setRecovery(null);
                }}
              >
                {fr.dialogs.recoveryIgnore}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                data-autofocus
                data-testid="recovery-restore"
                onClick={() => {
                  void actions.restoreRecovery(recovery);
                  setRecovery(null);
                }}
              >
                {fr.dialogs.recoveryRestore}
              </button>
            </>
          }
        >
          <p className="dialog-message">
            {fr.dialogs.recoveryText(
              recovery.name,
              new Date(recovery.savedAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }),
            )}
          </p>
        </Modal>
      )}
    </div>
  );
}
