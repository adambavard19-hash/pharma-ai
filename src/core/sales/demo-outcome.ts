/**
 * L'issue d'une démonstration (17 oct. 2026), la même dans les trois espaces (console, commercial, directeur commercial) :
 * programmée → à confirmer (la date est passée, personne ne l'a cochée) → réalisée → abonnée, ou « pas allée au bout ».
 */
export type DemoOutcome = "PROGRAMMEE" | "A_CONFIRMER" | "REALISEE" | "ABONNEE" | "PERDUE";

const SUBSCRIBED = new Set(["CONTRACT_SIGNED", "PHARMACY_CREATED", "ACTIVATED"]);

export function demoOutcome(prospect: { status: string; demoAt: Date | null; demoDoneAt: Date | null; pharmacyId?: string | null }, now: Date): DemoOutcome {
  if (SUBSCRIBED.has(prospect.status) || prospect.pharmacyId) return "ABONNEE";
  if (prospect.status === "LOST") return "PERDUE";
  if (prospect.demoDoneAt) return "REALISEE";
  if (prospect.demoAt && prospect.demoAt.getTime() < now.getTime()) return "A_CONFIRMER";
  return "PROGRAMMEE";
}

export const DEMO_OUTCOME_LABELS: Record<DemoOutcome, { label: string; tone: "info" | "warning" | "brand" | "success" | "danger" }> = {
  PROGRAMMEE: { label: "Programmée", tone: "info" },
  A_CONFIRMER: { label: "À confirmer", tone: "warning" },
  REALISEE: { label: "Démo faite · en réflexion", tone: "brand" },
  ABONNEE: { label: "Abonnée", tone: "success" },
  PERDUE: { label: "Pas allée au bout", tone: "danger" },
};

/** Les compteurs d'un commercial (ou de toute l'équipe) : démos obtenues, faites, abonnées, perdues. */
export function demoCounts(outcomes: DemoOutcome[]): { total: number; done: number; subscribed: number; lost: number; upcoming: number } {
  return {
    total: outcomes.length,
    done: outcomes.filter((o) => o === "REALISEE" || o === "ABONNEE" || o === "PERDUE").length,
    subscribed: outcomes.filter((o) => o === "ABONNEE").length,
    lost: outcomes.filter((o) => o === "PERDUE").length,
    upcoming: outcomes.filter((o) => o === "PROGRAMMEE").length,
  };
}
