/**
 * Contrat commun des actions serveur.
 *
 * Une action ne lève jamais d'exception vers le client pour un problème
 * métier : elle renvoie un résultat typé que l'interface sait afficher. Les
 * exceptions restent réservées aux erreurs de programmation et aux violations
 * d'isolation, qui doivent remonter et être tracées.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(
  error: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Convertit les erreurs Zod en messages par champ. */
export function zodFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !result[key]) result[key] = issue.message;
  }
  return result;
}
