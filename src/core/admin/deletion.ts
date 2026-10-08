/**
 * Supprimer une officine ou un compte depuis l'espace administrateur : les règles, sans base ni session.
 *
 * Une suppression ne se rattrape pas. Ce module dit donc CE QUI L'INTERDIT, avant tout geste :
 *   • l'officine de démonstration commerciale (recréée par un script, elle ne se supprime pas à la main) ;
 *   • un abonnement encore en cours chez Stripe (on le résilie d'abord : supprimer l'officine ne l'arrêterait pas,
 *     le client continuerait d'être prélevé) ;
 *   • des paiements enregistrés (la facturation se conserve : obligation comptable) ;
 *   • le dernier titulaire d'une officine qui continue d'exister (elle n'aurait plus personne).
 *
 * Ce qui reste permis suit la même ligne que partout dans la console : on ne supprime pas ce qui doit être conservé,
 * on le suspend (`setAccessSuspended`).
 */

export type DeletionBlocker = {
  code: "COMMERCIAL_DEMO" | "LIVE_SUBSCRIPTION" | "PAYMENTS" | "SOLE_OWNER";
  message: string;
};

/** Un abonnement terminé (ou jamais abouti) n'empêche rien : il n'y a plus rien à prélever. */
const ENDED_SUBSCRIPTION_STATUSES = ["CANCELED", "INCOMPLETE_EXPIRED"];

export const DELETION_REASON_MIN_LENGTH = 5;

/** Texte comparé sans casse, sans accents ni espaces en trop : « Pharmacie  de la Gare » = « pharmacie de la gare ». */
export function normalizeConfirmation(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Le nom retapé correspond-il au nom attendu ? Jamais vrai pour un champ vide. */
export function confirmationMatches(expected: string, typed: string): boolean {
  const wanted = normalizeConfirmation(expected);
  return wanted.length > 0 && wanted === normalizeConfirmation(typed);
}

/**
 * L'adresse que prend un compte supprimé. Elle libère l'adresse d'origine (on peut réinviter la personne) tout en
 * restant unique et impossible à utiliser pour se connecter : le domaine `.invalid` n'existe pas (RFC 2606).
 */
export function tombstoneEmail(userId: string): string {
  return `supprime-${userId.toLowerCase()}@suppression.pharmaboost.invalid`;
}

export function isTombstoneEmail(email: string): boolean {
  return email.toLowerCase().endsWith("@suppression.pharmaboost.invalid");
}

export function pharmacyDeletionBlockers(input: {
  isCommercialDemo: boolean;
  subscription: { status: string; stripeSubscriptionId: string | null } | null;
  paymentCount: number;
}): DeletionBlocker[] {
  const blockers: DeletionBlocker[] = [];
  if (input.isCommercialDemo) {
    blockers.push({ code: "COMMERCIAL_DEMO", message: "C'est l'officine de démonstration commerciale : elle est recréée par un script et sert aux présentations. Elle ne se supprime pas ici." });
  }
  const { subscription } = input;
  if (subscription?.stripeSubscriptionId && !ENDED_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
    blockers.push({
      code: "LIVE_SUBSCRIPTION",
      message: "Un abonnement est encore en cours chez Stripe : supprimer l'officine ne l'arrêterait pas, le client continuerait d'être prélevé. Résiliez l'abonnement d'abord (menu Résiliations), puis revenez ici.",
    });
  }
  if (input.paymentCount > 0) {
    blockers.push({
      code: "PAYMENTS",
      message: `${input.paymentCount} paiement${input.paymentCount > 1 ? "s sont enregistrés" : " est enregistré"} pour cette officine : la facturation doit être conservée (obligation comptable). Suspendez l'officine plutôt que de la supprimer.`,
    });
  }
  return blockers;
}

/**
 * Un compte qui est le SEUL titulaire actif d'une officine existante ne se supprime pas : l'officine n'aurait plus
 * personne pour la gérer. On ajoute un autre titulaire d'abord, ou l'on supprime l'officine.
 */
export function userDeletionBlockers(input: {
  userName: string;
  ownerships: { pharmacyName: string; otherActiveOwners: number }[];
}): DeletionBlocker[] {
  return input.ownerships
    .filter((ownership) => ownership.otherActiveOwners === 0)
    .map((ownership) => ({
      code: "SOLE_OWNER" as const,
      message: `${input.userName} est le seul titulaire de « ${ownership.pharmacyName} » : ajoutez d'abord un autre titulaire à cette officine, ou supprimez l'officine.`,
    }));
}
