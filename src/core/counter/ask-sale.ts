/**
 * Une vente du comptoir ouverte sans scan, par la demande écrite du patient (fondateur, 23 oct. 2026) : ses conseils portent la
 * demande dans leur justification, qui sert de sujet à la bannière (la vente n'a pas de boîte).
 */
export const ASK_JUSTIFICATION = "Demande du comptoir : ";

/** La demande écrite d'une vente ouverte sans scan, relue dans ses conseils ; null pour une vente bipée. */
export function askTextOf(recommendations: { origin: string; justification: string | null }[]): string | null {
  const found = recommendations.find((rec) => rec.origin === "MANUAL" && rec.justification?.startsWith(ASK_JUSTIFICATION));
  return found ? found.justification!.slice(ASK_JUSTIFICATION.length) : null;
}
