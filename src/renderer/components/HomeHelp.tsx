// Écran d'accueil (SPEC §0.2) et aide intégrée (SPEC §0.9) : l'accueil propose les trois groupes d'actions (quilts,
// blocs, tissus) et l'astuce du jour ; l'aide résume les plans, le dessin, le quilt, les photos, l'impression et les
// raccourcis.

import { fr } from "../i18n/fr";
import { setUiPrefs, useUiPrefs } from "../uiPrefs";
import { Modal } from "./Modal";

export type HomeAction = "new-quilt" | "quick-quilt" | "open-project" | "new-block" | "search-blocks" | "edit-fabric" | "search-fabrics" | "help";

export function HomeScreen({ onAction, onClose }: { onAction: (a: HomeAction) => void; onClose: () => void }) {
  const t = fr.m9.home;
  const ui = useUiPrefs();
  const tips = fr.m9.tips;
  const index = ui.tipIndex % tips.length;
  const button = (action: HomeAction, label: string, primary = false) => (
    <button type="button" className={`btn${primary ? " btn--primary" : ""}`} data-testid={`home-${action}`} onClick={() => onAction(action)}>
      {label}
    </button>
  );
  return (
    <Modal
      title={t.title}
      size="wide"
      testId="home"
      onClose={onClose}
      footer={
        <>
          <label className="check">
            <input type="checkbox" checked={!ui.showHome} data-testid="home-hide" onChange={(e) => setUiPrefs({ showHome: !e.target.checked })} />
            <span>{t.hide}</span>
          </label>
          {button("help", t.help)}
          <button type="button" className="btn btn--primary" data-testid="home-close" onClick={onClose}>
            {t.close}
          </button>
        </>
      }
    >
      <div className="home">
        <section className="home-group">
          <h3>{t.quilts}</h3>
          {button("new-quilt", t.newQuilt, true)}
          {button("quick-quilt", t.quickQuilt)}
          {button("open-project", t.openProject)}
        </section>
        <section className="home-group">
          <h3>{t.blocks}</h3>
          {button("new-block", t.newBlock, true)}
          {button("search-blocks", t.searchBlocks)}
        </section>
        <section className="home-group">
          <h3>{t.fabrics}</h3>
          {button("edit-fabric", t.editFabric, true)}
          {button("search-fabrics", t.searchFabrics)}
        </section>
      </div>
      <div className="home-tip" data-testid="home-tip">
        <strong>{t.tip}</strong> ({t.tipCount(index + 1, tips.length)})
        <p>{tips[index]}</p>
        <button type="button" className="btn btn--small" data-testid="home-next-tip" onClick={() => setUiPrefs({ tipIndex: (index + 1) % tips.length })}>
          {t.nextTip}
        </button>
      </div>
    </Modal>
  );
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const t = fr.m9.help;
  return (
    <Modal
      title={t.title}
      size="wide"
      testId="help"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn--primary" data-autofocus onClick={onClose}>
          {t.close}
        </button>
      }
    >
      {t.sections.map((s) => (
        <section key={s.title}>
          <h3>{s.title}</h3>
          <p>{s.body}</p>
        </section>
      ))}
    </Modal>
  );
}
