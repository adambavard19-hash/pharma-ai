/**
 * Le passeport de compétences et les parcours : clés d'unicité des badges, avancement d'un parcours.
 *
 * Un badge se gagne UNE fois : sa clé (`dedupeKey`) est unique par personne en base. Réussir deux fois le même quiz,
 * ou rejouer la fin d'un parcours, ne crée pas de second badge. Le passeport appartient à la personne : il la suit d'une
 * officine à l'autre (aucune officine dans la clé).
 */

export function quizBadgeKey(contentId: string): string {
  return `QUIZ:${contentId}`;
}

export function moduleBadgeKey(moduleId: string): string {
  return `MODULE:${moduleId}`;
}

export type ModuleItemState = { contentId: string; position: number; isRequired: boolean; visible: boolean; done: boolean };

export type ModuleProgress = {
  /** Contenus obligatoires et visibles. */
  required: number;
  doneRequired: number;
  percent: number;
  complete: boolean;
  /** Le premier contenu visible pas encore terminé, dans l'ordre du parcours. */
  nextContentId: string | null;
};

/**
 * L'avancement d'un parcours. Seuls comptent les contenus obligatoires que la personne peut voir (un contenu retiré ou
 * échu ne bloque pas la fin du parcours). Un parcours sans contenu visible n'est jamais « terminé ».
 */
export function moduleProgress(items: ModuleItemState[]): ModuleProgress {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const required = ordered.filter((item) => item.visible && item.isRequired);
  const doneRequired = required.filter((item) => item.done).length;
  const next = ordered.find((item) => item.visible && !item.done) ?? null;
  const complete = required.length > 0 && doneRequired === required.length;
  return {
    required: required.length,
    doneRequired,
    percent: required.length === 0 ? 0 : Math.round((doneRequired / required.length) * 100),
    complete,
    nextContentId: next?.contentId ?? null,
  };
}

/**
 * Quand un contenu est-il « terminé » ? Avec un quiz : quand le quiz est réussi. Sans quiz : quand la vidéo est vue
 * (90 % au moins) ou la fiche lue jusqu'au bout.
 */
export const WATCHED_PERCENT = 90;

export function completesOnWatch(hasQuiz: boolean, percent: number): boolean {
  return !hasQuiz && percent >= WATCHED_PERCENT;
}

/** Le texte du résumé partageable : sans lien, sans donnée d'officine, seulement ce que la personne a acquis. */
export function passportShareText(input: { firstName: string; badges: { title: string }[]; completedCount: number }): string {
  const lines = [`${input.firstName} — Passeport de compétences PharmaBoost`, `${input.completedCount} formation${input.completedCount > 1 ? "s" : ""} suivie${input.completedCount > 1 ? "s" : ""} · ${input.badges.length} badge${input.badges.length > 1 ? "s" : ""}`];
  for (const badge of input.badges.slice(0, 8)) lines.push(`✓ ${badge.title}`);
  if (input.badges.length > 8) lines.push(`… et ${input.badges.length - 8} autre${input.badges.length - 8 > 1 ? "s" : ""}`);
  lines.push("Formations courtes de l'Académie PharmaBoost (hors DPC).");
  return lines.join("\n");
}
