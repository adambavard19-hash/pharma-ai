/**
 * Les campagnes de surstock, côté règles (fondateur, 25 oct. 2026) : les classes de médicaments que le pharmacien peut
 * choisir, ce qu'une campagne doit contenir, et quand elle s'arrête. Module pur.
 */

/**
 * Les classes de médicaments proposées, par leur code ATC officiel (OMS) : une ligne de la vente dont le code commence ainsi
 * déclenche la campagne. Liste courte et lisible au comptoir ; un préfixe vaut pour toute la classe.
 */
export const OVERSTOCK_DRUG_CLASSES: readonly { code: string; label: string }[] = [
  { code: "J01", label: "Antibiotiques" },
  { code: "J05", label: "Antiviraux" },
  { code: "M01A", label: "Anti-inflammatoires (AINS)" },
  { code: "N02", label: "Antidouleurs" },
  { code: "R05", label: "Rhume et toux" },
  { code: "R06", label: "Antihistaminiques (allergie)" },
  { code: "R03", label: "Asthme et bronches" },
  { code: "H02", label: "Corticoïdes par voie orale" },
  { code: "A02BC", label: "Protecteurs de l'estomac (IPP)" },
  { code: "A06", label: "Laxatifs" },
  { code: "A07", label: "Antidiarrhéiques" },
  { code: "A10", label: "Diabète" },
  { code: "C09", label: "Tension (IEC, sartans)" },
  { code: "C10", label: "Cholestérol" },
  { code: "B01A", label: "Anticoagulants et antiagrégants" },
  { code: "N06A", label: "Antidépresseurs" },
  { code: "N05B", label: "Anxiolytiques" },
  { code: "N05C", label: "Somnifères" },
  { code: "G03A", label: "Contraception orale" },
  { code: "D10", label: "Acné" },
];

const KNOWN_CODES = new Set(OVERSTOCK_DRUG_CLASSES.map((item) => item.code));

export const OVERSTOCK_SENTENCE_MAX = 240;
export const OVERSTOCK_MAX_FAMILIES = 12;

export type CampaignDraft = { productId: string; atcCodes: string[]; familyIds: string[]; sentence: string; targetQuantity: number; endsOn: string | null };

/** Ce qui manque ou ne va pas, en une phrase ; `null` si la campagne peut partir. */
export function campaignDraftError(draft: CampaignDraft, today: string): string | null {
  if (!draft.productId) return "Choisissez le produit en surstock.";
  if (draft.atcCodes.some((code) => !KNOWN_CODES.has(code))) return "Classe de médicaments inconnue.";
  if (draft.atcCodes.length === 0 && draft.familyIds.length === 0) return "Choisissez au moins une situation : une classe de médicaments ou une famille de produits.";
  if (draft.familyIds.length > OVERSTOCK_MAX_FAMILIES) return `${OVERSTOCK_MAX_FAMILIES} familles au plus.`;
  if (draft.sentence.length > OVERSTOCK_SENTENCE_MAX) return `La phrase fait ${OVERSTOCK_SENTENCE_MAX} caractères au plus.`;
  if (!Number.isInteger(draft.targetQuantity) || draft.targetQuantity < 0 || draft.targetQuantity > 9999) return "L'objectif de stock est un nombre de boîtes (0 ou plus).";
  if (draft.endsOn !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.endsOn) || draft.endsOn <= today)) return "La date de fin doit être après aujourd'hui.";
  return null;
}

export type CampaignEnd = "OBJECTIF" | "DATE";

/** La campagne a-t-elle atteint sa fin ? Le stock à l'objectif, ou la date passée (AAAA-MM-JJ, jour de l'officine). */
export function campaignEnd(campaign: { targetQuantity: number; endsOn: string | null }, stock: number, today: string): CampaignEnd | null {
  if (stock <= campaign.targetQuantity) return "OBJECTIF";
  if (campaign.endsOn !== null && campaign.endsOn < today) return "DATE";
  return null;
}

/** L'argent immobilisé en rayon : boîtes × prix d'achat HT, en centimes ; `null` sans prix d'achat. */
export function tiedUpCents(quantity: number, purchasePriceCents: number | null | undefined): number | null {
  if (!purchasePriceCents || purchasePriceCents <= 0 || quantity <= 0) return quantity <= 0 ? 0 : null;
  return quantity * purchasePriceCents;
}

/**
 * Comment la bannière du poste apprend qu'un conseil est en surstock : par le libellé du challenge de la carte, seul champ
 * libre que les agents déjà installés transmettent tels quels (« Surstock », ou « Surstock · <challenge du laboratoire> »).
 * La page de l'île le relit et affiche une pastille « Surstock » à part ; aucune mise à jour des postes n'est nécessaire.
 */
export const OVERSTOCK_LABEL = "Surstock";
const OVERSTOCK_SEPARATOR = " · ";

export function withOverstockLabel(challenge: string | null): string {
  return challenge ? `${OVERSTOCK_LABEL}${OVERSTOCK_SEPARATOR}${challenge}` : OVERSTOCK_LABEL;
}

export function readOverstockLabel(challenge: string | null | undefined): { overstock: boolean; challenge: string | null } {
  const text = challenge ?? "";
  if (text === OVERSTOCK_LABEL) return { overstock: true, challenge: null };
  if (text.startsWith(`${OVERSTOCK_LABEL}${OVERSTOCK_SEPARATOR}`)) return { overstock: true, challenge: text.slice(OVERSTOCK_LABEL.length + OVERSTOCK_SEPARATOR.length) || null };
  return { overstock: false, challenge: text || null };
}
