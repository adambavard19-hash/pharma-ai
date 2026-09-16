import { ADVICE_RULES } from "./advice";
import { VIGILANCE_RULES } from "./vigilance";

/**
 * La Base maître « Connecteur Pharma » V1 : cent règles écrites par le
 * pharmacien associé, et ce que chacune est devenue dans le moteur.
 *
 * Le classeur est la source ; ce fichier est la table de correspondance. Une
 * ligne est soit couverte par une règle (`sourceRules` d'une vigilance ou
 * d'un conseil), soit écartée ici avec sa raison. Un test l'impose : aucune
 * ligne ne peut disparaître en silence.
 */

export const BASE_MAITRE = {
  name: "Connecteur Pharma — Base maître V1",
  version: "V1 (100 règles)",
  /** Date du classeur reçu. */
  receivedAt: "2026-09-17",
  total: 100,
} as const;

/**
 * Les lignes volontairement non transposées en règle distincte, et pourquoi.
 * Chacune reste lisible dans `docs/base-maitre-v1.md`.
 */
export const BASE_MAITRE_NOT_INTEGRATED: Record<number, string> = {};

export type BaseMaitreCoverage = {
  ruleId: number;
  coveredBy: { kind: "VIGILANCE" | "ADVICE"; key: string }[];
  notIntegrated: string | null;
};

/** Pour chaque ligne du classeur, la ou les règles du moteur qui la portent. */
export function baseMaitreCoverage(): BaseMaitreCoverage[] {
  const rows: BaseMaitreCoverage[] = [];
  for (let ruleId = 1; ruleId <= BASE_MAITRE.total; ruleId += 1) {
    const coveredBy: BaseMaitreCoverage["coveredBy"] = [];
    for (const rule of VIGILANCE_RULES) if (rule.sourceRules?.includes(ruleId)) coveredBy.push({ kind: "VIGILANCE", key: rule.key });
    for (const rule of ADVICE_RULES) if (rule.sourceRules?.includes(ruleId)) coveredBy.push({ kind: "ADVICE", key: rule.key });
    rows.push({ ruleId, coveredBy, notIntegrated: BASE_MAITRE_NOT_INTEGRATED[ruleId] ?? null });
  }
  return rows;
}
