import type { DrugClassification, UnderstandingLine } from "./types";

/**
 * Les effets indésirables officiels d'une ligne (RCP de sa spécialité, BDPM rubrique 4.8) priment sur ceux du modèle.
 *
 * Règles, sans exception :
 *   • seule une ligne rattachée au catalogue national (`officialCisCode`) peut recevoir des effets officiels ;
 *   • une spécialité dont le RCP n'a donné AUCUN effet de la liste fermée ne change rien : les effets du modèle restent
 *     (un RCP en prose, une rubrique sans fréquence ou un RCP non encore lu ne valent pas « aucun effet ») ;
 *   • sinon les effets officiels REMPLACENT ceux du modèle — la famille (ATC, classe) et la substance ne bougent pas ;
 *   • une ligne sans classification du tout (modèle muet, pas de famille officielle) reçoit une classification réduite à
 *     ses effets officiels (`source: "OFFICIAL_RCP"`) : de quoi déclencher une règle « sécheresse buccale » sans modèle.
 *
 * Les effets officiels sont une donnée publique, commune à toutes les pharmacies : la table est lue par CIS, jamais par
 * officine.
 */
export type OfficialSideEffectsByCis = ReadonlyMap<string, { effects: readonly string[] }>;

export function applyOfficialSideEffects(
  drugs: readonly DrugClassification[],
  lines: readonly Pick<UnderstandingLine, "lineIndex" | "officialCisCode" | "officialSubstances">[],
  official: OfficialSideEffectsByCis,
): { drugs: DrugClassification[]; applied: number } {
  const result = [...drugs];
  let applied = 0;
  for (const line of lines) {
    const effects = line.officialCisCode ? official.get(line.officialCisCode)?.effects : undefined;
    if (!effects || effects.length === 0) continue;
    const at = result.findIndex((drug) => drug.lineIndex === line.lineIndex);
    if (at >= 0) {
      result[at] = { ...result[at], commonSideEffects: [...effects], sideEffectsSource: "RCP_BDPM" };
    } else {
      result.push({
        lineIndex: line.lineIndex,
        substance: line.officialSubstances[0] ?? null,
        atcCode: null,
        therapeuticClass: null,
        commonSideEffects: [...effects],
        confidence: 1,
        source: "OFFICIAL_RCP",
        sideEffectsSource: "RCP_BDPM",
      });
    }
    applied += 1;
  }
  return { drugs: result, applied };
}
