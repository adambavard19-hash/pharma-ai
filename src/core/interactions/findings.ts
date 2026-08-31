import { SEVERITY_LABELS, SEVERITY_TO_FINDING } from "./types";
import type { InteractionAnalysis } from "./types";
import type { InteractionCoverage } from "./coverage";
import type { SafetyFindingResult } from "../ai/types";

/**
 * Traduction des interactions en signaux de sécurité.
 *
 * Le texte affiché reprend MOT POUR MOT le risque et la conduite à tenir du
 * référentiel. Reformuler serait déjà réécrire une information médicale, et la
 * responsabilité de la formulation appartient à la source, pas à nous.
 *
 * La provenance suit chaque alerte : au comptoir, « qui dit ça ? » est une
 * question légitime, et elle doit trouver sa réponse sur la ligne même.
 */

const SOURCE = "interactions";

export function interactionFindings(
  analysis: InteractionAnalysis,
  coverage: InteractionCoverage,
): SafetyFindingResult[] {
  const findings: SafetyFindingResult[] = [];

  for (const match of analysis.matches) {
    const severityLabel = SEVERITY_LABELS[match.severity];
    const viaClass = match.viaClass
      ? " Rapprochement établi via une classe du référentiel."
      : "";
    const guidance = match.guidance ? ` Conduite à tenir : ${match.guidance}` : "";

    findings.push({
      severity: SEVERITY_TO_FINDING[match.severity],
      code: `INTERACTION_${match.severity}`,
      message:
        `${severityLabel} — ${match.leftLabel} + ${match.rightLabel}. ${match.risk}` +
        `${guidance}${viaClass} Source : ${match.sourceName} ${match.sourceVersion}.`,
      subjectType: "PRESCRIPTION_LINE",
      subjectId: match.lineIds[0],
      source: SOURCE,
    });
  }

  // Une même substance sur deux lignes n'est pas une interaction : c'est un
  // risque de double dose. On le dit dans ces termes, et on ne le compte jamais
  // comme une couverture d'interactions.
  for (const overlap of analysis.overlaps) {
    findings.push({
      severity: "WARNING",
      code: "SUBSTANCE_DUPLICATED",
      message:
        `${overlap.lineLabels[0]} et ${overlap.lineLabels[1]} apportent la même substance active ` +
        `(${overlap.substanceLabel}) : vérifiez la dose totale. Constaté à partir de la composition ` +
        "du catalogue national, indépendamment de tout référentiel d'interactions.",
      subjectType: "PRESCRIPTION_LINE",
      subjectId: overlap.lineIds[0],
      source: SOURCE,
    });
  }

  // La couverture est un signal comme les autres : elle apparaît dans le détail
  // des signaux, elle est journalisée avec l'analyse, et elle est donc
  // vérifiable a posteriori. Ce n'est pas une phrase d'interface.
  findings.push({
    severity: coverage.loaded ? "INFO" : "WARNING",
    code: coverage.loaded ? "INTERACTION_COVERAGE" : "INTERACTION_NO_REFERENTIAL",
    message: `${coverage.headline} ${coverage.detail}`,
    subjectType: "ANALYSIS",
    subjectId: "interactions",
    source: SOURCE,
  });

  return findings;
}
