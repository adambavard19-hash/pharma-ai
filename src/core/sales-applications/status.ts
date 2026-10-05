/**
 * Les candidatures commerciales : statuts, libellés, situations possibles.
 * Pur, sans base : le formulaire public, la console et les services s'y réfèrent.
 * Les valeurs reprennent l'énumération Prisma `SalesApplicationStatus`.
 */
export const SALES_APPLICATION_STATUSES = ["NEW", "TO_CONTACT", "INTERVIEW", "ACCEPTED", "REFUSED"] as const;
export type SalesApplicationStatusKey = (typeof SALES_APPLICATION_STATUSES)[number];

export const SALES_APPLICATION_STATUS_LABELS: Record<SalesApplicationStatusKey, string> = {
  NEW: "Nouvelle",
  TO_CONTACT: "À contacter",
  INTERVIEW: "Entretien",
  ACCEPTED: "Acceptée",
  REFUSED: "Refusée",
};

export const SALES_APPLICATION_STATUS_TONES: Record<SalesApplicationStatusKey, "info" | "warning" | "neutral" | "success" | "danger"> = {
  NEW: "info",
  TO_CONTACT: "warning",
  INTERVIEW: "neutral",
  ACCEPTED: "success",
  REFUSED: "danger",
};

/** Le statut actuel de la personne, tel qu'elle le choisit sur le formulaire. */
export const CURRENT_STATUSES = [
  { value: "SALARIED", label: "Salarié(e)" },
  { value: "FREELANCE", label: "Indépendant(e) ou auto-entrepreneur" },
  { value: "JOB_SEEKING", label: "En recherche d'emploi" },
  { value: "STUDENT", label: "Étudiant(e) ou en alternance" },
  { value: "OTHER", label: "Autre situation" },
] as const;
export type CurrentStatusKey = (typeof CURRENT_STATUSES)[number]["value"];

export function currentStatusLabel(value: string): string {
  return CURRENT_STATUSES.find((s) => s.value === value)?.label ?? value;
}
