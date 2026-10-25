// Noms de fichiers de projet : une saisie libre ne doit jamais pouvoir sortir du dossier des projets
// ni produire un nom que Windows refuse.

export type ProjectNameProblem = "empty" | "too-long" | "forbidden-char" | "bad-ending" | "reserved";

export type ProjectNameCheck = { ok: true; name: string } | { ok: false; problem: ProjectNameProblem };

export const PROJECT_EXTENSION = ".qsp";
export const MAX_PROJECT_NAME_LENGTH = 100;

const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function checkProjectName(input: string): ProjectNameCheck {
  const name = input.trim();
  if (name.length === 0) return { ok: false, problem: "empty" };
  if (name.length > MAX_PROJECT_NAME_LENGTH) return { ok: false, problem: "too-long" };
  if (FORBIDDEN.test(name)) return { ok: false, problem: "forbidden-char" };
  if (name.endsWith(".")) return { ok: false, problem: "bad-ending" };
  if (RESERVED.test(name)) return { ok: false, problem: "reserved" };
  return { ok: true, name };
}

/** Nom d'affichage d'un projet à partir de son chemin (sans dossier ni extension). */
export function projectNameFromPath(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  return base.toLowerCase().endsWith(PROJECT_EXTENSION) ? base.slice(0, -PROJECT_EXTENSION.length) : base;
}
