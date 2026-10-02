/**
 * D'où viennent les chiffres d'un challenge.
 *
 * Aujourd'hui, une seule source est réellement branchée : les ventes
 * enregistrées dans PharmaBoost, complétées par les saisies manuelles du
 * titulaire. Les plateformes partenaires (Opeaz…) sont DÉCLARÉES pour que
 * l'écran dise honnêtement qu'elles ne sont pas connectées — aucune donnée
 * n'en est lue, aucune n'est simulée. Le branchement réel se fait côté serveur
 * (src/server/services/challenge-sources.ts, `fetchUnits`).
 */

export type ChallengeDataSourceKey = "PHARMABOOST" | "OPEAZ";
export type ChallengeDataSourceStatus = "available" | "not_connected";

export type ChallengeDataSourceInfo = {
  key: ChallengeDataSourceKey;
  /** Nom court, tel qu'il apparaît dans la ligne « Source des données ». */
  label: string;
  status: ChallengeDataSourceStatus;
  description: string;
};

export const CHALLENGE_DATA_SOURCES: readonly ChallengeDataSourceInfo[] = [
  {
    key: "PHARMABOOST",
    label: "Ventes enregistrées dans PharmaBoost",
    status: "available",
    description:
      "Les délivrances enregistrées dans PharmaBoost pour les produits du challenge, sur sa période, auxquelles s'ajoutent vos saisies manuelles (ventes passées hors PharmaBoost, relevé du laboratoire).",
  },
  {
    key: "OPEAZ",
    label: "Opeaz",
    status: "not_connected",
    description:
      "Non connecté : PharmaBoost ne lit aucune donnée chez Opeaz. Les unités suivies sur cette plateforme ne sont pas reprises ; saisissez-les à la main si vous voulez les voir ici.",
  },
];

export const CHALLENGE_SOURCE_STATUS_LABELS: Record<ChallengeDataSourceStatus, string> = {
  available: "Disponible",
  not_connected: "Non connecté",
};

export function challengeDataSourceInfo(key: string): ChallengeDataSourceInfo | null {
  return CHALLENGE_DATA_SOURCES.find((source) => source.key === key) ?? null;
}

/**
 * La ligne « Source des données » : les sources disponibles par leur nom, les
 * autres suivies de leur état. Ex. « Ventes enregistrées dans PharmaBoost ·
 * Opeaz : non connecté ».
 */
export function describeChallengeSources(sources: readonly ChallengeDataSourceInfo[] = CHALLENGE_DATA_SOURCES): string {
  return sources
    .map((source) => (source.status === "available" ? source.label : `${source.label} : ${CHALLENGE_SOURCE_STATUS_LABELS[source.status].toLowerCase()}`))
    .join(" · ");
}
