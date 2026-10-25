import { useSyncExternalStore } from "react";
import { newProject } from "../core/project/defaults";
import { ProjectSession } from "../core/project/session";

/** La session d'édition unique de l'application : un projet « Sans titre » tant qu'aucun n'est ouvert. */
export const session = new ProjectSession(newProject(null), null);

/** Se réabonne à la session : le composant se redessine à chaque changement du projet. */
export function useSession(): ProjectSession {
  useSyncExternalStore(session.subscribe, session.getVersion);
  return session;
}
