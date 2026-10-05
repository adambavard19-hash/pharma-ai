import { UNIVERSES } from "@/config/universes";

/**
 * « Votre assortiment » : les besoins de conseil réels que le stock de l'officine
 * n'a pas pu couvrir, regroupés par situation. Pur, sans base : le service lit,
 * ce module compte.
 *
 * Un besoin n'est un manque d'assortiment que s'il est réel (non écarté par la
 * sécurité, non refusé par le patient) ET que le stock n'y a pas répondu :
 * aucune référence, référence en rupture, ou aucune référence qui convienne. Un
 * besoin couvert, même si la carte n'a pas été affichée faute de place, n'est pas
 * un manque.
 */
export type GapCause = "NOT_REFERENCED" | "OUT_OF_STOCK" | "NO_SUITABLE";

export const GAP_CAUSE_LABELS: Record<GapCause, string> = {
  NOT_REFERENCED: "Aucune référence en stock",
  OUT_OF_STOCK: "Référence en rupture",
  NO_SUITABLE: "Aucune référence adaptée",
};

const GAP_CAUSES = new Set<string>(["NOT_REFERENCED", "OUT_OF_STOCK", "NO_SUITABLE"]);

export type OpportunityRow = {
  title: string;
  category: string;
  ruleKey: string | null;
  needKey: string | null;
  coverage: string | null;
  /** La réponse du patient à la question du besoin : `false` = il n'a pas ce besoin. */
  answer: boolean | null;
};

export type GapGroup = {
  key: string;
  title: string;
  category: string;
  /** Combien de fois ce besoin n'a pas été couvert sur la période. */
  count: number;
  causes: Record<GapCause, number>;
};

export type AssortmentSummary = {
  /** Besoins réels détectés (couverts ou non) sur les analyses qui portent l'information. */
  detected: number;
  covered: number;
  unmet: number;
  /** Part des besoins couverts par le stock, en %, ou `null` quand rien n'a été détecté. */
  coveredRate: number | null;
  /** Du plus fréquent au moins fréquent. */
  groups: GapGroup[];
};

export function summarizeGaps(rows: OpportunityRow[]): AssortmentSummary {
  const groups = new Map<string, GapGroup>();
  let detected = 0;
  let covered = 0;
  for (const row of rows) {
    // Un besoin que le patient n'a pas, ou une analyse sans information de couverture, ne compte pas.
    if (row.answer === false || row.coverage === null) continue;
    detected += 1;
    if (!GAP_CAUSES.has(row.coverage)) {
      covered += 1;
      continue;
    }
    const key = row.ruleKey ?? row.needKey ?? row.title;
    const group = groups.get(key) ?? { key, title: row.title, category: row.category, count: 0, causes: { NOT_REFERENCED: 0, OUT_OF_STOCK: 0, NO_SUITABLE: 0 } };
    group.count += 1;
    group.causes[row.coverage as GapCause] += 1;
    groups.set(key, group);
  }
  const unmet = detected - covered;
  return {
    detected,
    covered,
    unmet,
    coveredRate: detected > 0 ? Math.round((covered / detected) * 100) : null,
    groups: [...groups.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, "fr")),
  };
}

/** Les univers de produits (compléments, dermocosmétique…) qui répondent à une catégorie de conseil. */
export function universesForCategory(category: string): string[] {
  return UNIVERSES.filter((universe) => universe.categories.includes(category as never)).map((universe) => universe.key);
}

export const GAP_PERIODS = [
  { key: "7j", days: 7, label: "7 jours" },
  { key: "30j", days: 30, label: "30 jours" },
  { key: "90j", days: 90, label: "3 mois" },
] as const;

export function resolveGapPeriod(value: string | null | undefined): (typeof GAP_PERIODS)[number] {
  return GAP_PERIODS.find((period) => period.key === value) ?? GAP_PERIODS[1];
}
