import { useState } from "react";
import type { AnyItem, Id, ListKey } from "../../core/project/model";
import { fr } from "../i18n/fr";
import { Modal } from "./Modal";
import { Thumb } from "./Thumb";

interface Props {
  list: ListKey;
  items: AnyItem[];
  /** Appelée à la fermeture avec les identifiants cliqués, dans l'ordre des clics. */
  onApply: (clicked: Id[]) => void;
}

/** Tri par clics : on clique les éléments dans l'ordre voulu, chacun passe dans la liste triée. */
export function SortDialog({ list, items, onApply }: Props) {
  const [chosen, setChosen] = useState<Id[]>([]);
  const remaining = items.filter((item) => !chosen.includes(item.id));
  const byId = new Map(items.map((item) => [item.id, item]));
  const label = (item: AnyItem) => item.card.name || fr.sketchbook.unnamed;

  return (
    <Modal
      title={fr.sketchbook.sortTitle}
      size="wide"
      testId="sort-dialog"
      onClose={() => onApply(chosen)}
      footer={
        <>
          <button type="button" className="btn" data-testid="sort-restart" onClick={() => setChosen([])}>
            {fr.sketchbook.sortRestart}
          </button>
          <button type="button" className="btn btn--primary" data-testid="sort-close" onClick={() => onApply(chosen)}>
            {fr.sketchbook.close}
          </button>
        </>
      }
    >
      <p className="muted">{fr.sketchbook.sortHelp}</p>
      <div className="sort-columns">
        <section aria-label={fr.sketchbook.sortRemaining}>
          <h3>{fr.sketchbook.sortRemaining}</h3>
          <ul className="sort-list" data-testid="sort-remaining">
            {remaining.map((item) => (
              <li key={item.id}>
                <button type="button" className="sort-item" onClick={() => setChosen((c) => [...c, item.id])}>
                  <Thumb list={list} item={item} size={32} />
                  <span>{label(item)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label={fr.sketchbook.sortChosen}>
          <h3>{fr.sketchbook.sortChosen}</h3>
          <ol className="sort-list" data-testid="sort-chosen">
            {chosen.map((id) => {
              const item = byId.get(id);
              return item ? (
                <li key={id} className="sort-item sort-item--chosen">
                  <Thumb list={list} item={item} size={32} />
                  <span>{label(item)}</span>
                </li>
              ) : null;
            })}
          </ol>
        </section>
      </div>
    </Modal>
  );
}
