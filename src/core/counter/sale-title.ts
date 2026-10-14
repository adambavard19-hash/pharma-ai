/**
 * « V-0007 » se dit « Vente 007 » : le numéro de la vente dans l'officine, comme on le dirait au comptoir — partout (comptoir,
 * historique, PDF). Les anciennes références (« ORD-0780 ») se lisent pareil : « Vente 780 ». Module sans dépendance.
 */
export function saleTitle(reference: string | null | undefined): string {
  const digits = (reference ?? "").match(/(\d+)\s*$/)?.[1];
  return digits ? `Vente ${String(Number(digits)).padStart(3, "0")}` : "Vente";
}
