/**
 * « Au comptoir » : ce que la page montre des ventes, côté règles pures (aucune base, aucun écran).
 *
 * Au comptoir, c'est la bannière du poste Windows qui fait tout ; la page sert à SUIVRE : les délivrances en cours (ce
 * qui a été scanné, les conseils proposés et leur résultat) et les ventes terminées du jour, pour retrouver un patient.
 */

/** Le résultat d'un conseil, dit comme au comptoir : proposé, vendu, non vendu (ou resté sans réponse). */
export type AdviceOutcome = "PROPOSED" | "SOLD" | "NOT_SOLD" | "UNANSWERED";

export const ADVICE_OUTCOME_LABEL: Record<AdviceOutcome, string> = {
  PROPOSED: "Proposé",
  SOLD: "Vendu",
  NOT_SOLD: "Non vendu",
  UNANSWERED: "Sans réponse",
};

/**
 * Le statut d'une recommandation ramené aux trois états du comptoir. « Vendu » : le patient l'a pris (déclaré au poste
 * ou accepté sur l'écran de la vente). Un conseil retiré par le pharmacien n'est pas montré (`null`).
 */
export function adviceOutcome(status: string): AdviceOutcome | null {
  switch (status) {
    case "PURCHASED":
    case "ACCEPTED":
    case "MODIFIED":
    case "REPLACED":
      return "SOLD";
    case "DECLINED":
      return "NOT_SOLD";
    case "IGNORED":
      return "UNANSWERED";
    case "REMOVED":
      return null;
    default:
      return "PROPOSED";
  }
}

export type BoardAdvice = { name: string; outcome: AdviceOutcome };

/** Une délivrance en cours : son comptoir (« Comptoir 2 · Léa Martin »), ce qui a été scanné, les conseils et leur état. */
export type LiveSale = {
  id: string;
  reference: string;
  status: string;
  /** « Comptoir 2 · Léa Martin » ; le nom du poste seul s'il n'est plus dans la liste. */
  comptoir: string | null;
  updatedAt: string;
  lines: { drugName: string; quantity: number }[];
  advice: BoardAdvice[];
  /** Le nombre de conseils (retirés compris) : l'étape de la vente le lit. */
  recommendations: number;
};

/** Une vente terminée aujourd'hui : l'heure, ce qui a été délivré, combien de conseils vendus sur combien. */
export type FinishedSale = {
  id: string;
  reference: string;
  finishedAt: string;
  comptoir: string | null;
  lines: { drugName: string; quantity: number }[];
  soldCount: number;
  adviceCount: number;
  /** Les produits vendus (conseils déclarés vendus), dans l'ordre de la vente, sans doublon. */
  sold?: string[];
};

/** Les conseils montrés d'une vente : sans les retirés, sans doublon de nom, dans l'ordre reçu. */
export function boardAdvice(recommendations: { name: string | null | undefined; status: string }[]): BoardAdvice[] {
  const seen = new Set<string>();
  const out: BoardAdvice[] = [];
  for (const rec of recommendations) {
    const outcome = adviceOutcome(rec.status);
    const name = (rec.name ?? "").trim();
    if (!outcome || !name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, outcome });
  }
  return out;
}

/** « 2 conseils vendus sur 3 », « 1 conseil proposé », « aucun conseil ». */
export function describeAdviceCount(soldCount: number, adviceCount: number): string {
  if (adviceCount === 0) return "aucun conseil";
  if (soldCount === 0) return `${adviceCount} conseil${adviceCount > 1 ? "s" : ""} proposé${adviceCount > 1 ? "s" : ""}, aucun vendu`;
  return `${soldCount} conseil${soldCount > 1 ? "s" : ""} vendu${soldCount > 1 ? "s" : ""} sur ${adviceCount}`;
}
