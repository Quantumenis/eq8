import { useEffect, useState, type FormEvent } from "react";
import { checkProjectName } from "../../core/project/names";
import type { ProjectEntry, ProjectListing } from "../../shared/api";
import { fr } from "../i18n/fr";
import { getApi, type ProjectActions } from "../projectActions";
import { Modal } from "./Modal";

type Tab = "create" | "open";

interface Props {
  actions: ProjectActions;
  initialTab?: Tab;
  onClose: () => void;
}

const formatDate = (ms: number) => new Date(ms).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/** Assistant projet : créer, ouvrir un projet existant (le onglet « quilt rapide » arrive plus tard). */
export function ProjectHelper({ actions, initialTab = "create", onClose }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [listing, setListing] = useState<ProjectListing | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getApi().listProjects().then(setListing);
  }, []);

  const check = checkProjectName(name);
  const exists = check.ok && (listing?.existing ?? []).some((p) => p.name.toLowerCase() === check.name.toLowerCase());
  const problem = name.length === 0 ? null : !check.ok ? fr.helper.nameProblem[check.problem] : exists ? fr.helper.nameExists : null;
  const canCreate = check.ok && !exists && !busy;

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!check.ok || !canCreate) return;
    setBusy(true);
    setServerError(null);
    const result = await actions.createProject(check.name);
    setBusy(false);
    if (result.ok) onClose();
    else if (!result.cancelled) setServerError(fr.messages.fileError[result.error]);
  }

  async function openEntry(path: string) {
    setBusy(true);
    const opened = await actions.openPath(path);
    setBusy(false);
    if (opened) onClose();
  }

  async function browse() {
    setBusy(true);
    const opened = await actions.openDialog();
    setBusy(false);
    if (opened) onClose();
  }

  const entryList = (title: string, entries: ProjectEntry[], testId: string) => (
    <section className="helper-list" aria-label={title}>
      <h3>{title}</h3>
      {entries.length === 0 ? (
        <p className="muted">{fr.helper.none}</p>
      ) : (
        <ul role="listbox" aria-label={title} data-testid={testId}>
          {entries.map((entry) => (
            <li key={entry.path} role="option" aria-selected={selected === entry.path}>
              <button
                type="button"
                className="helper-entry"
                data-testid="project-entry"
                aria-pressed={selected === entry.path}
                onClick={() => setSelected(entry.path)}
                onDoubleClick={() => void openEntry(entry.path)}
              >
                <span className="helper-entry-name">{entry.name}</span>
                <span className="helper-entry-meta">
                  {fr.helper.noQuilt} · {fr.helper.modified(formatDate(entry.modifiedAt))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <Modal
      title={fr.helper.title}
      size="medium"
      testId="project-helper"
      onClose={onClose}
      footer={
        tab === "create" ? (
          <>
            <button type="button" className="btn" onClick={onClose}>
              {fr.helper.cancel}
            </button>
            <button type="submit" form="helper-create-form" className="btn btn--primary" data-testid="helper-create" disabled={!canCreate}>
              {fr.helper.create}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn" data-testid="helper-browse" disabled={busy} onClick={() => void browse()}>
              {fr.helper.browse}
            </button>
            <span className="modal-footer-spacer" />
            <button type="button" className="btn" onClick={onClose}>
              {fr.helper.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              data-testid="helper-open"
              disabled={!selected || busy}
              onClick={() => selected && void openEntry(selected)}
            >
              {fr.helper.open}
            </button>
          </>
        )
      }
    >
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "create"} data-testid="helper-tab-create" onClick={() => setTab("create")}>
          {fr.helper.tabs.create}
        </button>
        <button type="button" role="tab" aria-selected={tab === "open"} data-testid="helper-tab-open" onClick={() => setTab("open")}>
          {fr.helper.tabs.open}
        </button>
        <button type="button" role="tab" aria-selected={false} disabled title={fr.helper.quickSoon}>
          {fr.helper.tabs.quick}
        </button>
      </div>

      {tab === "create" ? (
        <form id="helper-create-form" className="helper-create" onSubmit={(e) => void onCreate(e)}>
          <label className="field">
            <span>{fr.helper.nameLabel}</span>
            <input
              type="text"
              value={name}
              maxLength={120}
              data-autofocus
              data-testid="helper-name"
              aria-invalid={problem !== null}
              aria-describedby="helper-name-problem"
              onChange={(e) => {
                setName(e.target.value);
                setServerError(null);
              }}
            />
          </label>
          <p id="helper-name-problem" className="field-problem" role="alert" data-testid="helper-problem">
            {problem ?? serverError ?? ""}
          </p>
          {listing && <p className="muted">{fr.helper.folder(listing.folder)}</p>}
        </form>
      ) : (
        <div className="helper-open">
          {listing ? (
            <>
              {entryList(fr.helper.recents, listing.recents, "helper-recents")}
              {entryList(fr.helper.existing, listing.existing, "helper-existing")}
            </>
          ) : (
            <p className="muted">…</p>
          )}
        </div>
      )}
    </Modal>
  );
}
