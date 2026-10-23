/**
 * Une réponse aux questions du comptoir qui renvoie au médecin sans proposer de produit : retirée de la bannière (fondateur,
 * 22 oct. 2026 : « aucun intérêt, on doit proposer des conseils »). Les signes d'alerte restent écrits dans la fiche du
 * conseil, rubrique « À dire au patient ».
 */
export function sendsToDoctor(answer: { say: string; product?: unknown }): boolean {
  return !answer.product && /m[ée]decin|consult|urgence|orient/i.test(answer.say);
}
