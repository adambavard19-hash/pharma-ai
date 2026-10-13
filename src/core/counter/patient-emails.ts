/**
 * « E-mails aux patients » : ce que le titulaire peut savoir des bilans envoyés depuis le comptoir — et rien de plus.
 *
 * Au comptoir, la seule chose qui part au patient est le bilan, par e-mail, s'il l'a accepté. L'adresse ne sert qu'à ce bilan :
 * elle est effacée à « Vente terminée » (ou par le passage quotidien). Ce qui reste, et donc ce que cet écran montre : quand,
 * sur quel comptoir, par qui, les produits déclarés vendus (ceux que le bilan reprend), et l'issue de l'envoi telle que la base
 * l'a enregistrée. Jamais l'adresse, jamais une ouverture (elle n'est pas suivie), jamais une issue devinée.
 *
 * Module PUR : il traduit un état enregistré en mots, et filtre.
 */

export type PatientEmailState = "SENT" | "SIMULATED" | "FAILED" | "NOTHING_SOLD" | "WAITING" | "UNKNOWN";

export const PATIENT_EMAIL_STATES: Record<PatientEmailState, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info"; detail: string }> = {
  SENT: { label: "Envoyé", tone: "success", detail: "Remis à la messagerie." },
  SIMULATED: { label: "Simulé", tone: "info", detail: "La messagerie n'est pas branchée : rien n'est réellement parti." },
  FAILED: { label: "Échec", tone: "danger", detail: "La messagerie a refusé l'envoi." },
  NOTHING_SOLD: { label: "Pas envoyé", tone: "neutral", detail: "Aucun produit déclaré vendu : il n'y avait rien à mettre dans le bilan." },
  WAITING: { label: "En attente", tone: "warning", detail: "La vente n'est pas encore terminée : le bilan part à « Terminer la vente »." },
  UNKNOWN: { label: "Inconnu", tone: "neutral", detail: "L'issue de l'envoi n'a pas été enregistrée." },
};

/** L'issue d'un bilan, lue sur ce que la vente a enregistré. */
export function patientEmailState(row: { closedAt: Date | null; reportStatus: string | null }): PatientEmailState {
  if (row.reportStatus === "SENT" || row.reportStatus === "SIMULATED" || row.reportStatus === "FAILED") return row.reportStatus;
  if (!row.closedAt) return "WAITING";
  if (row.reportStatus === "NONE") return "NOTHING_SOLD";
  return "UNKNOWN";
}

/** Les filtres de l'écran, lus dans l'adresse (« ?periode=30&etat=echec ») ; une valeur inconnue retombe sur le défaut. */
export const EMAIL_PERIODS = [
  { key: "7", label: "7 jours", days: 7 },
  { key: "30", label: "30 jours", days: 30 },
  { key: "90", label: "3 mois", days: 90 },
] as const;

export const EMAIL_STATE_FILTERS = [
  { key: "tous", label: "Tous", states: null },
  { key: "envoyes", label: "Envoyés", states: ["SENT"] },
  { key: "echecs", label: "Échecs", states: ["FAILED"] },
  { key: "simules", label: "Simulés", states: ["SIMULATED"] },
  { key: "non-envoyes", label: "Pas envoyés", states: ["NOTHING_SOLD", "WAITING", "UNKNOWN"] },
] as const satisfies readonly { key: string; label: string; states: readonly PatientEmailState[] | null }[];

export function resolveEmailFilters(params: { periode?: string; etat?: string }) {
  const period = EMAIL_PERIODS.find((candidate) => candidate.key === params.periode) ?? EMAIL_PERIODS[1];
  const state = EMAIL_STATE_FILTERS.find((candidate) => candidate.key === params.etat) ?? EMAIL_STATE_FILTERS[0];
  return { period, state };
}
