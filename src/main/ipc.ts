import { ipcMain, type IpcMainInvokeEvent } from "electron";

/** Enregistre un canal IPC en refusant tout appelant qui n'est pas l'interface locale de l'application. */
export function handle<A extends unknown[], R>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: A) => Promise<R> | R,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!event.senderFrame?.url.startsWith("file://")) throw new Error("Appelant non autorisé");
    return fn(event, ...(args as A));
  });
}
