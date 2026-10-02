/**
 * La progression d'un membre de l'équipe sur ses formations.
 *
 * Trois états, lisibles d'un coup d'œil : à faire, en cours, terminé. Le
 * pourcentage suit l'état — un contenu terminé est à 100 %, un contenu à faire
 * à 0 % — pour qu'aucun écran n'affiche « terminé à 40 % ». Un contenu sans
 * ligne de progression est « à faire ».
 *
 * Ce module est pur : la date du jour est passée par l'appelant.
 */

export const TRAINING_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export type TrainingStatusCode = (typeof TRAINING_STATUSES)[number];

export const TRAINING_STATUS_LABELS: Record<TrainingStatusCode, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  DONE: "Terminé",
};

export function isTrainingStatus(value: string): value is TrainingStatusCode {
  return (TRAINING_STATUSES as readonly string[]).includes(value);
}

export type ProgressState = { status: TrainingStatusCode; percent: number };
export type ProgressChange = { status?: TrainingStatusCode; percent?: number };

export const NOT_STARTED: ProgressState = { status: "TODO", percent: 0 };

/** Un pourcentage entier entre 0 et 100 ; 0 pour une valeur absurde. */
export function clampPercent(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** L'état cohérent d'une ligne lue en base (ou de son absence). */
export function progressOf(entry: { status: string; progressPercent?: number; percent?: number } | null | undefined): ProgressState {
  if (!entry || !isTrainingStatus(entry.status)) return NOT_STARTED;
  if (entry.status === "DONE") return { status: "DONE", percent: 100 };
  if (entry.status === "TODO") return NOT_STARTED;
  return { status: "IN_PROGRESS", percent: Math.min(99, clampPercent(entry.progressPercent ?? entry.percent ?? 0)) };
}

/**
 * Le nouvel état après un geste : « Commencer », « Terminé », une avancée en %.
 *
 * - « Terminé » met à 100 % ; « À faire » remet à 0 %.
 * - « En cours » garde l'avancée connue (jamais 100 % : ce serait terminé) ;
 *   reprendre un contenu terminé repart de 0 %.
 * - Un pourcentage seul décide de l'état : 100 = terminé, plus de 0 = en cours.
 */
export function nextProgress(previous: ProgressState | null | undefined, change: ProgressChange): ProgressState {
  const before = previous ? progressOf({ status: previous.status, percent: previous.percent }) : NOT_STARTED;
  const percent = change.percent === undefined ? undefined : clampPercent(change.percent);

  if (change.status === "DONE") return { status: "DONE", percent: 100 };
  if (change.status === "TODO") return NOT_STARTED;
  if (change.status === "IN_PROGRESS") {
    const kept = percent ?? (before.status === "IN_PROGRESS" ? before.percent : 0);
    return { status: "IN_PROGRESS", percent: Math.min(99, kept) };
  }
  if (percent === undefined) return before;
  if (percent >= 100) return { status: "DONE", percent: 100 };
  if (percent > 0) return { status: "IN_PROGRESS", percent };
  return before.status === "IN_PROGRESS" ? { status: "IN_PROGRESS", percent: 0 } : NOT_STARTED;
}

/** La date d'achèvement à enregistrer : conservée si le contenu était déjà terminé, effacée s'il ne l'est plus. */
export function completionDate(previous: { status: string; completedAt: Date | null } | null | undefined, next: ProgressState, now: Date): Date | null {
  if (next.status !== "DONE") return null;
  if (previous?.status === "DONE" && previous.completedAt) return previous.completedAt;
  return now;
}

export type ProgressSummary = {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  /** Avancée moyenne sur l'ensemble des contenus, de 0 à 100. */
  percent: number;
};

export type ProgressEntry = { contentId: string; status: string; progressPercent?: number; percent?: number };

/**
 * L'avancée d'une personne sur une liste de contenus. Les contenus sans ligne
 * comptent comme « à faire » ; les lignes d'un contenu hors de la liste (retiré,
 * désactivé) ne comptent pas.
 */
export function summarizeProgress(contentIds: string[], entries: ProgressEntry[]): ProgressSummary {
  const ids = [...new Set(contentIds)];
  const byContent = new Map<string, ProgressState>();
  for (const entry of entries) {
    const state = progressOf(entry);
    const current = byContent.get(entry.contentId);
    // Deux lignes pour un même contenu ne devraient pas exister : on garde la plus avancée.
    if (!current || state.percent > current.percent) byContent.set(entry.contentId, state);
  }
  const summary: ProgressSummary = { total: ids.length, todo: 0, inProgress: 0, done: 0, percent: 0 };
  let sum = 0;
  for (const id of ids) {
    const state = byContent.get(id) ?? NOT_STARTED;
    if (state.status === "DONE") summary.done += 1;
    else if (state.status === "IN_PROGRESS") summary.inProgress += 1;
    else summary.todo += 1;
    sum += state.percent;
  }
  summary.percent = ids.length === 0 ? 0 : Math.round(sum / ids.length);
  return summary;
}

export type TeamMember = { userId: string; name: string; role: string };
export type TeamProgressEntry = ProgressEntry & { userId: string; updatedAt: Date };
export type TeamProgressRow = TeamMember & { summary: ProgressSummary; lastActivityAt: Date | null };

/**
 * La progression de chaque membre, pour le titulaire. Un membre qui n'a rien
 * commencé figure quand même (tout « à faire ») : on accompagne aussi ceux-là.
 * Tri : les plus avancés d'abord, puis par nom.
 */
export function teamProgress(members: TeamMember[], contentIds: string[], entries: TeamProgressEntry[]): TeamProgressRow[] {
  const ids = new Set(contentIds);
  const byUser = new Map<string, TeamProgressEntry[]>();
  for (const entry of entries) {
    if (!ids.has(entry.contentId)) continue;
    const list = byUser.get(entry.userId) ?? [];
    list.push(entry);
    byUser.set(entry.userId, list);
  }
  return members
    .map((member) => {
      const own = byUser.get(member.userId) ?? [];
      const lastActivityAt = own.reduce<Date | null>((latest, entry) => (!latest || entry.updatedAt > latest ? entry.updatedAt : latest), null);
      return { ...member, summary: summarizeProgress(contentIds, own), lastActivityAt };
    })
    .sort((a, b) => b.summary.percent - a.summary.percent || b.summary.done - a.summary.done || a.name.localeCompare(b.name, "fr"));
}
