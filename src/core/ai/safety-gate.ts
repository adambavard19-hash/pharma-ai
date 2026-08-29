/**
 * Ce qui arrête le comptoir.
 *
 * Le moteur de sécurité produit deux familles d'alertes BLOCKING, et les
 * confondre coûterait cher dans les deux sens :
 *
 * • `OPPORTUNITY` / `PRODUCT` — le moteur a DÉJÀ écarté la proposition
 *   (allergie déclarée, interaction documentée, contre-indication). La garantie
 *   est appliquée en amont ; l'alerte informe le pharmacien mais n'a aucune
 *   raison d'arrêter la vente, sinon on ajouterait un clic obligatoire à chaque
 *   ordonnance sans rien sécuriser de plus.
 *
 * • `ANALYSIS` / `PRESCRIPTION_LINE` — c'est le traitement lui-même qui n'est pas
 *   fiable (rien n'a pu être extrait, un nom de médicament est illisible).
 *   Conseiller par-dessus reviendrait à s'appuyer sur une lecture incertaine :
 *   la zone des conseils reste fermée tant qu'un professionnel n'a pas acquitté.
 */

export const COUNTER_BLOCKING_SUBJECTS = ["ANALYSIS", "PRESCRIPTION_LINE"] as const;

export type SafetyGateInput = {
  severity: string;
  subjectType: string;
  acknowledged: boolean;
};

/** Vrai si cette alerte ferme la zone des conseils. */
export function blocksCounter(finding: SafetyGateInput): boolean {
  return (
    finding.severity === "BLOCKING" &&
    (COUNTER_BLOCKING_SUBJECTS as readonly string[]).includes(finding.subjectType) &&
    !finding.acknowledged
  );
}

/** Vrai si au moins une alerte ferme la zone des conseils. */
export function counterIsBlocked(findings: SafetyGateInput[]): boolean {
  return findings.some(blocksCounter);
}
