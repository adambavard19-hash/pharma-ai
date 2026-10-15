/**
 * Combien de temps on attend, après le dernier bip, avant d'analyser la vente.
 *
 * Une autre boîte du même client arrive d'ordinaire une à deux secondes après la précédente : on laisse ce délai pour
 * l'analyser UNE fois avec toutes ses boîtes. Trop long, le conseil arrive après le client (six secondes, mesuré en
 * production le 8 octobre 2026 : vingt secondes entre le scan et la fenêtre). Trop court n'est pas grave : une boîte
 * de plus remet la vente « à confirmer » et relance l'analyse, la fenêtre se met à jour sur place.
 *
 * 1,2 s depuis le 15 oct. 2026 (« fais en sorte que ça scanne plus vite ») : la vente reste ouverte jusqu'à « Vente terminée »,
 * une boîte de plus s'ajoute sur place ; attendre plus longtemps ne faisait que retarder le premier conseil.
 */
export const SETTLE_MS = 1_200;

/** La vente est-elle restée sans nouveau bip assez longtemps pour être analysée ? */
export function hasSettled(lastWriteAt: Date, now: Date, settleMs: number = SETTLE_MS): boolean {
  return now.getTime() - lastWriteAt.getTime() >= settleMs;
}
