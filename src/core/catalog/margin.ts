/**
 * Ce que rapporte une référence à l'officine, et ce que l'on sait de son remboursement.
 *
 * Les deux prix d'une fiche ne sont pas sur la même base : le prix de vente est TTC (fiche produit « Prix de vente
 * TTC », colonne « Prix TTC » de l'import), le prix d'achat est HT (« PA HT » de l'export LGPI, « Prix d'achat HT » de
 * la fiche). La marge se calcule donc HORS TAXE des deux côtés : le prix TTC ramené au HT par le taux de TVA, moins le
 * prix d'achat HT. Soustraire un prix d'achat HT d'un prix TTC comptait la TVA comme de la marge — 20 % du prix d'un
 * produit de parapharmacie.
 *
 * Rien n'est deviné : sans prix de vente, sans prix d'achat ou sans taux de TVA, la marge est inconnue (null), et le
 * départage la tient pour neutre.
 */

export type UnitMargin = {
  /** Prix de vente HT, en centimes. */
  saleHtCents: number;
  /** Marge HT par unité vendue, en centimes (négative si le prix de vente est sous le prix d'achat). */
  marginCents: number;
  /** Taux de marge sur le prix de vente HT. */
  rate: number;
};

export function unitMarginHt(prices: { salePriceCents: number; purchasePriceCents: number; vatRate: number | null }): UnitMargin | null {
  const { salePriceCents, purchasePriceCents, vatRate } = prices;
  if (!(salePriceCents > 0) || !(purchasePriceCents > 0) || vatRate === null || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) return null;
  const saleHt = salePriceCents / (1 + vatRate / 100);
  const marginCents = Math.round(saleHt - purchasePriceCents);
  return { saleHtCents: Math.round(saleHt), marginCents, rate: marginCents / saleHt };
}

// --- Remboursement --------------------------------------------------------

/**
 * Une référence remboursable — médicament remboursable, dispositif inscrit à la LPP — a un prix et une marge encadrés :
 * la proposer en vente additionnelle rapporte peu à l'officine, et le patient la paie plein tarif alors qu'il pourrait
 * se la faire prescrire. Le moteur ne la propose donc jamais devant une équivalente non remboursée.
 *
 * L'information ne se devine jamais au nom. Trois sources, toutes lues :
 *   • la colonne de remboursement de l'export du logiciel (taux, code prestation, code LPP) ;
 *   • la BDPM pour un médicament du catalogue national (colonne « taux de remboursement » de CIS_CIP) ;
 *   • la TVA à 2,1 %, réservée aux médicaments remboursables (CGI, art. 281 octies) — les non remboursables sont à 10 %.
 * Sans aucune des trois : null, « on ne sait pas ».
 */
export type Reimbursement = { reimbursed: boolean; source: string };

/** Le taux de TVA des médicaments remboursables (CGI, art. 281 octies). */
export const REIMBURSABLE_DRUG_VAT = 2.1;
/** Le taux de TVA des médicaments non remboursables. */
export const NON_REIMBURSABLE_DRUG_VAT = 10;

export function reimbursementFromVat(vatRate: number | null | undefined): Reimbursement | null {
  if (vatRate === null || vatRate === undefined || Math.abs(vatRate - REIMBURSABLE_DRUG_VAT) > 0.001) return null;
  return { reimbursed: true, source: "TVA 2,1 % (médicament remboursable)" };
}

/**
 * La BDPM : un taux publié vaut remboursement ; ni taux ni prix publiés, c'est une présentation non remboursable (le
 * prix n'y figure que pour les présentations remboursées) ; la fiche de l'Assurance Maladie « non remboursable aux
 * assurés sociaux » le confirme. Le reste : inconnu.
 */
export function reimbursementFromBdpm(presentation: { reimbursementRate: number | null; priceCents: number | null; notReimbursable?: boolean | null }): Reimbursement | null {
  if (presentation.notReimbursable) return { reimbursed: false, source: "Assurance Maladie : non remboursable" };
  if (presentation.reimbursementRate !== null && presentation.reimbursementRate > 0) return { reimbursed: true, source: `BDPM : remboursé à ${presentation.reimbursementRate} %` };
  if (presentation.reimbursementRate === null && presentation.priceCents === null) return { reimbursed: false, source: "BDPM : non remboursable" };
  return null;
}

/**
 * Une cellule de la colonne de remboursement d'un export :
 *   • un taux — « 65 », « 65 % », « 0,3 » — : remboursé au-dessus de zéro, non remboursé à zéro ;
 *   • un code prestation de facturation : PH1, PH2, PH4, PH7 pour un médicament remboursable, PHN pour un médicament
 *     non remboursable, AAD pour un accessoire inscrit à la LPP (Aequasyal : LPP 1100034, prestation AAD) ;
 *   • un code LPP à 7 chiffres : le dispositif est inscrit à la liste des produits remboursables ;
 *   • « oui » / « non », « NR ».
 * Tout autre code reste inconnu : on n'étend pas une liste qu'on n'a pas vérifiée.
 */
export function parseReimbursement(raw: unknown): Reimbursement | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const upper = text.toUpperCase().replace(/\s+/g, "");
  if (/^PH[1247]$/.test(upper)) return { reimbursed: true, source: `export : prestation ${upper}` };
  if (upper === "PHN") return { reimbursed: false, source: "export : prestation PHN" };
  if (upper === "AAD") return { reimbursed: true, source: "export : prestation AAD (LPP)" };
  if (/^\d{7}$/.test(upper)) return { reimbursed: true, source: `export : code LPP ${upper}` };
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/^(non|nr|non rembours\w*)$/.test(lower)) return { reimbursed: false, source: "export : non remboursé" };
  if (/^(oui|rembours\w*)$/.test(lower)) return { reimbursed: true, source: "export : remboursé" };
  const rate = /^(\d+(?:[.,]\d+)?)\s*%?$/.exec(text);
  if (rate) {
    let value = Number(rate[1].replace(",", "."));
    if (value > 0 && value < 1 && !text.includes("%")) value *= 100;
    if (!Number.isFinite(value) || value > 100) return null;
    const shown = Math.round(value);
    return value > 0 ? { reimbursed: true, source: `export : remboursé à ${shown} %` } : { reimbursed: false, source: "export : taux de remboursement 0 %" };
  }
  return null;
}
