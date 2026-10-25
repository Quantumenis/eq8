import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { fr } from "../i18n/fr";
import { Modal } from "./Modal";

interface Pending {
  kind: "confirm" | "alert";
  message: string;
  detail?: string | undefined;
  okLabel: string;
  resolve: (ok: boolean) => void;
}

export interface Dialogs {
  /** Demande une confirmation ; résout à `true` si l'utilisateur confirme. */
  confirm(message: string, options?: { detail?: string; okLabel?: string }): Promise<boolean>;
  /** Affiche un message ; résout à la fermeture. */
  alert(message: string, detail?: string): Promise<void>;
}

const DialogsContext = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const value = useContext(DialogsContext);
  if (!value) throw new Error("DialogsProvider manquant");
  return value;
}

export function DialogsProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback<Dialogs["confirm"]>(
    (message, options) =>
      new Promise<boolean>((resolve) =>
        setPending({ kind: "confirm", message, detail: options?.detail, okLabel: options?.okLabel ?? fr.dialogs.confirm, resolve }),
      ),
    [],
  );
  const alert = useCallback<Dialogs["alert"]>(
    (message, detail) =>
      new Promise<void>((resolve) =>
        setPending({ kind: "alert", message, detail, okLabel: fr.dialogs.ok, resolve: () => resolve() }),
      ),
    [],
  );
  const value = useMemo(() => ({ confirm, alert }), [confirm, alert]);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <DialogsContext.Provider value={value}>
      {children}
      {pending && (
        <Modal
          title={fr.messages.errorTitle}
          size="narrow"
          testId="dialog"
          onClose={() => close(false)}
          footer={
            <>
              {pending.kind === "confirm" && (
                <button type="button" className="btn" onClick={() => close(false)}>
                  {fr.dialogs.cancel}
                </button>
              )}
              <button type="button" className="btn btn--primary" data-autofocus data-testid="dialog-ok" onClick={() => close(true)}>
                {pending.okLabel}
              </button>
            </>
          }
        >
          <p className="dialog-message">{pending.message}</p>
          {pending.detail && <p className="dialog-detail">{pending.detail}</p>}
        </Modal>
      )}
    </DialogsContext.Provider>
  );
}
