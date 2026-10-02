import "server-only";
import {
  CHALLENGE_DATA_SOURCES,
  describeChallengeSources,
  type ChallengeDataSourceInfo,
  type ChallengeDataSourceKey,
} from "@/core/challenges/sources";

/**
 * Les sources de chiffres des challenges laboratoires, côté serveur.
 *
 * ÉTAT RÉEL (octobre 2026) :
 * - PHARMABOOST — disponible. Les ventes enregistrées dans PharmaBoost pour
 *   les produits du challenge, plus les saisies manuelles du titulaire. C'est
 *   la seule source que lit `src/server/services/challenges.ts`.
 * - OPEAZ — non connecté. Aucun appel réseau, aucune clé, aucune donnée
 *   simulée : l'écran l'affiche « non connecté », point.
 *
 * POINT D'EXTENSION — brancher une plateforme partenaire :
 * 1. Écrire son client dans `src/server/integrations/<partenaire>/` (fetch,
 *    authentification par officine, gestion d'erreur), sans rien importer du
 *    moteur de conseil.
 * 2. Fournir ici `fetchUnits` pour sa clé et passer `status` à "available" —
 *    SEULEMENT quand l'officine a réellement connecté son compte (le statut
 *    devra alors se lire par officine, pas en dur).
 * 3. Dans le service des challenges, ajouter les unités renvoyées comme une
 *    source à part (jamais fusionnées en silence avec les ventes PharmaBoost),
 *    avec leur date de relevé, et l'afficher dans « Source des données ».
 * 4. Un challenge porte `dataSource` et `externalRef` (identifiant chez le
 *    partenaire) : ils sont déjà en base pour ce raccordement.
 */

export type ExternalUnitsQuery = {
  scope: { pharmacyId: string; userId: string };
  challenge: {
    id: string;
    laboratory: string;
    brandKey: string | null;
    productIds: string[];
    /** « AAAA-MM-JJ », bornes incluses. */
    startsOn: string;
    endsOn: string;
    externalRef: string | null;
  };
};

export type ExternalUnitsResult = {
  units: number;
  /** Quand le partenaire a produit ces chiffres : on l'affiche, on ne le devine pas. */
  measuredAt: Date;
  byProduct?: { reference: string; units: number }[];
};

export interface ChallengeDataSource extends ChallengeDataSourceInfo {
  /**
   * Unités relevées chez le partenaire pour ce challenge. Absent tant que la
   * source n'est pas connectée : personne ne doit pouvoir l'appeler.
   */
  fetchUnits?: (query: ExternalUnitsQuery) => Promise<ExternalUnitsResult>;
}

const REGISTRY: readonly ChallengeDataSource[] = CHALLENGE_DATA_SOURCES.map((source) => ({ ...source }));

export function listChallengeDataSources(): readonly ChallengeDataSource[] {
  return REGISTRY;
}

export function getChallengeDataSource(key: ChallengeDataSourceKey): ChallengeDataSource | null {
  return REGISTRY.find((source) => source.key === key) ?? null;
}

/** La ligne affichée sous chaque challenge : « Ventes enregistrées dans PharmaBoost · Opeaz : non connecté ». */
export function challengeSourcesLine(): string {
  return describeChallengeSources(REGISTRY);
}

/**
 * Unités d'une source externe pour ce challenge, ou null si elle n'est pas
 * connectée. Aujourd'hui, toujours null : aucune source externe n'est branchée.
 */
export async function readExternalUnits(key: ChallengeDataSourceKey, query: ExternalUnitsQuery): Promise<ExternalUnitsResult | null> {
  const source = getChallengeDataSource(key);
  if (!source || source.key === "PHARMABOOST" || source.status !== "available" || !source.fetchUnits) return null;
  return source.fetchUnits(query);
}
