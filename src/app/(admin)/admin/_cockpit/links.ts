/**
 * Les listes qu'ouvrent les tuiles et les cartes du cockpit. Chaque adresse
 * applique exactement le critère du chiffre affiché : le même nombre se lit
 * sur la pastille active de la liste (vérifié par
 * `src/server/services/admin/__tests__/cockpit-alignment.test.ts`).
 */
export const COCKPIT_LINKS = {
  // Le parc aujourd'hui
  activePharmacies: "/admin/pharmacies?statut=actives",
  trials: "/admin/abonnements?filtre=essai",
  activeSubscriptions: "/admin/abonnements?filtre=actifs",
  /** La liste des abonnements affiche en tête le même MRR contractuel, calculé par la même règle. */
  mrr: "/admin/abonnements",
  pendingContracts: "/admin/contrats?statut=en-attente",
  paymentsLate: "/admin/impayes",
  // Sur la période (`periode` : 30j, 3m, 12m, comme le sélecteur du cockpit)
  newSubscriptions: (period: string) => `/admin/abonnements?filtre=nouveaux&periode=${encodeURIComponent(period)}`,
  cancellations: (period: string) => `/admin/abonnements?filtre=resilies&periode=${encodeURIComponent(period)}`,
  // À traiter (contrats et technique)
  contractsToCountersign: "/admin/contrats?statut=a-contresigner",
  contractsToSign: "/admin/contrats?statut=a-signer",
  contractsToRemind: "/admin/contrats?statut=relance",
  technical: "/admin/technique?filtre=erreurs",
} as const;
