import { useEffect, useState, type ReactNode } from "react";
import type { ThemeMode } from "../shared/api.js";
import { fr } from "./i18n/fr";
import { BlockIcon, ImageIcon, LogoIcon, QuiltIcon } from "./icons";
import { useTheme } from "./useTheme";

type Worktable = "quilt" | "block" | "image";

const WORKTABLES: { id: Worktable; icon: ReactNode }[] = [
  { id: "quilt", icon: <QuiltIcon /> },
  { id: "block", icon: <BlockIcon /> },
  { id: "image", icon: <ImageIcon /> },
];

const THEMES: ThemeMode[] = ["light", "dark", "system"];

export function App() {
  const [worktable, setWorktable] = useState<Worktable>("quilt");
  const [ribbonTab, setRibbonTab] = useState<Record<Worktable, number>>({ quilt: 0, block: 0, image: 0 });
  const [theme, setTheme] = useTheme();
  const [version, setVersion] = useState("");

  useEffect(() => {
    void window.quiltStudio?.getAppInfo().then((info) => setVersion(info.version));
  }, []);

  const tabs = fr.ribbon[worktable];
  const activeTab = ribbonTab[worktable];

  return (
    <div className="app" data-worktable={worktable}>
      <header className="topbar">
        <div className="brand">
          <LogoIcon />
          <span className="brand-name">{fr.app.name}</span>
          <span className="project-name" data-testid="project-name">
            {fr.app.untitled}
          </span>
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
            className="ribbon-tab"
            aria-selected={index === activeTab}
            onClick={() => setRibbonTab((prev) => ({ ...prev, [worktable]: index }))}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="body">
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
      </div>

      <footer className="statusbar">
        <span>{fr.status.ready}</span>
        <span>{fr.status.units}</span>
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
    </div>
  );
}
