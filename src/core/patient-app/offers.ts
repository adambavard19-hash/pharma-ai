/**
 * Les offres de l'appli des patients (fondateur, 22 oct. 2026) : les règles, sans base de données.
 *
 *  - l'appli reste ouverte à tous (scan, fiche, bilan) ; l'abonnement PharmaBoost+ à 2,99 € par mois ouvre les offres
 *    réservées aux abonnés ;
 *  - une offre vient d'une pharmacie (pour ses patients) ou d'un laboratoire (dans tout le réseau PharmaBoost, payée par
 *    le laboratoire à la boîte vendue) ;
 *  - parapharmacie et produits conseil seulement : jamais un médicament (prix réglementé, remise interdite) ;
 *  - chaque inscrit reçoit, par offre, un code de 13 chiffres montré en code-barres : la douchette le bipe une fois.
 */

/**
 * L'appli des patients est mise de côté (fondateur, 21 oct. 2026) : visible dans l'aperçu seulement. Ses offres, ses écrans
 * côté pharmacie et console suivent la même règle, tant qu'elle n'est pas ouverte sur pharmaboost.app.
 */
export const PATIENT_APP_LIVE = process.env.NODE_ENV !== "production";

/** PharmaBoost+ : 2,99 € par mois (fondateur, 22 oct. 2026). */
export const PLUS_PRICE_CENTS = 299;
export const PLUS_PRICE_LABEL = "2,99 € par mois";

/**
 * Le préfixe des codes d'offre. Les préfixes GS1 20 à 29 sont réservés à l'usage interne d'un magasin : aucun produit du
 * commerce ne les porte. Une pharmacie peut s'en servir pour ses propres étiquettes : le code n'est une offre que s'il
 * existe dans la base, sinon le bip suit son chemin habituel.
 */
export const OFFER_CODE_PREFIX = "2990";

export const OFFER_LIMITS = { titleMax: 80, rangeMax: 80, detailsMax: 400, discountMin: 5, discountMax: 70, maxDays: 92 } as const;

/** La clé de contrôle d'un EAN-13, à partir de ses 12 premiers chiffres. */
export function ean13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

/** Un code d'offre neuf, à partir de 8 chiffres tirés au hasard (fournis par l'appelant). */
export function makeOfferCode(randomDigits: string): string {
  const body = `${OFFER_CODE_PREFIX}${randomDigits.replace(/\D/g, "").padStart(8, "0").slice(-8)}`;
  return body + ean13CheckDigit(body);
}

/** Ce code bipé a-t-il la forme d'un code d'offre (préfixe et clé justes) ? */
export function isOfferCode(code: string): boolean {
  return /^2990\d{9}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === code[12];
}

/** « 2990 1234 5678 9 » : le code lisible sous le code-barres, pour le taper à la main si la douchette n'y arrive pas. */
export function spacedCode(code: string): string {
  return code.replace(/^(\d{4})(\d{4})(\d{4})(\d)$/, "$1 $2 $3 $4");
}

// ---------------------------------------------------------------- Code-barres EAN-13 (dessin)

const L_CODES = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G_CODES = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R_CODES = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** Les 95 modules d'un EAN-13 (« 1 » = barre), pour le dessiner en SVG. */
export function ean13Modules(code: string): string {
  if (!/^\d{13}$/.test(code)) throw new Error("EAN-13 attendu");
  const digits = code.split("").map(Number);
  const parity = PARITY[digits[0]];
  let out = "101";
  for (let i = 1; i <= 6; i++) out += (parity[i - 1] === "L" ? L_CODES : G_CODES)[digits[i]];
  out += "01010";
  for (let i = 7; i <= 12; i++) out += R_CODES[digits[i]];
  return out + "101";
}

// ---------------------------------------------------------------- Qui voit quoi

export type OfferForMember = {
  audience: "ALL" | "SUBSCRIBERS";
  funding: "PHARMACY" | "LAB";
  pharmacyId: string | null;
  status: "ACTIVE" | "CANCELED";
  startsAt: Date;
  endsAt: Date;
};

export type MemberForOffer = { plan: "FREE" | "PLUS"; homePharmacyId: string | null };

/** L'offre est-elle en cours (active, entre ses dates) ? */
export function offerIsLive(offer: Pick<OfferForMember, "status" | "startsAt" | "endsAt">, now: Date): boolean {
  return offer.status === "ACTIVE" && offer.startsAt <= now && now <= offer.endsAt;
}

/**
 * Ce que l'inscrit voit d'une offre en cours :
 *  - « hidden » : l'offre d'une autre pharmacie que la sienne (une pharmacie écrit à SES patients) ;
 *  - « locked » : réservée aux abonnés, il ne l'est pas — il la voit, avec « Réservé aux abonnés PharmaBoost+ » ;
 *  - « open » : il peut obtenir son code.
 * Une offre de laboratoire vaut dans tout le réseau : elle se montre à tous les inscrits, même hors réseau (elle les fait
 * venir dans une pharmacie PharmaBoost).
 */
export function offerAccess(offer: OfferForMember, member: MemberForOffer, now: Date): "hidden" | "locked" | "open" {
  if (!offerIsLive(offer, now)) return "hidden";
  if (offer.funding === "PHARMACY" && (!member.homePharmacyId || offer.pharmacyId !== member.homePharmacyId)) return "hidden";
  if (offer.audience === "SUBSCRIBERS" && member.plan !== "PLUS") return "locked";
  return "open";
}

/** Le code bipé vaut-il dans cette pharmacie ? L'offre d'une pharmacie chez elle seulement ; celle d'un laboratoire partout. */
export function codeValidAt(offer: Pick<OfferForMember, "funding" | "pharmacyId">, pharmacyId: string): boolean {
  return offer.funding === "LAB" || offer.pharmacyId === pharmacyId;
}

// ---------------------------------------------------------------- Jamais un médicament

/** Les mots qui désignent un médicament ou une remise interdite : refusés dans une offre, quelle que soit la gamme. */
const MEDICINE_WORDS = /\b(m[ée]dicaments?|ordonnances?|rembours[ée]s?|g[ée]n[ée]riques?|antibiotiques?|parac[ée]tamol|ibuprof[eè]ne|aspirine|dolipran\w*|doliprane|efferalgan|dafalgan|advil|nurofen|spedifen|smecta|imodium|gaviscon|maalox|humex|fervex|actifed|strepsils|biafine)\b/i;

export type OfferInput = { title: string; rangeLabel: string; discountPercent: number; details?: string | null; startsAt: Date; endsAt: Date };
export type OfferValidation = { ok: true; value: OfferInput } | { ok: false; error: string };

/**
 * Les règles d'une offre, rejouées par le serveur. `isMedicineName` dit si un libellé est celui d'un médicament du
 * catalogue national (l'appelant le lit en base) : une offre qui le nomme est refusée.
 */
export function validateOffer(input: OfferInput, now: Date, isMedicineName: (label: string) => boolean = () => false): OfferValidation {
  const title = input.title.trim().replace(/\s+/g, " ");
  const rangeLabel = input.rangeLabel.trim().replace(/\s+/g, " ");
  const details = input.details?.trim() || null;
  if (title.length < 3) return { ok: false, error: "Donnez un titre à l'offre." };
  if (title.length > OFFER_LIMITS.titleMax) return { ok: false, error: `Titre trop long (${OFFER_LIMITS.titleMax} caractères au plus).` };
  if (rangeLabel.length < 2) return { ok: false, error: "Indiquez la gamme ou la marque concernée." };
  if (rangeLabel.length > OFFER_LIMITS.rangeMax) return { ok: false, error: `Gamme trop longue (${OFFER_LIMITS.rangeMax} caractères au plus).` };
  if (details && details.length > OFFER_LIMITS.detailsMax) return { ok: false, error: `Conditions trop longues (${OFFER_LIMITS.detailsMax} caractères au plus).` };
  if (!Number.isInteger(input.discountPercent) || input.discountPercent < OFFER_LIMITS.discountMin || input.discountPercent > OFFER_LIMITS.discountMax) {
    return { ok: false, error: `La remise va de ${OFFER_LIMITS.discountMin} à ${OFFER_LIMITS.discountMax} %.` };
  }
  const text = [title, rangeLabel, details ?? ""].join(" ");
  if (MEDICINE_WORDS.test(text) || isMedicineName(rangeLabel) || isMedicineName(title)) {
    return { ok: false, error: "Une offre ne peut pas porter sur un médicament : parapharmacie et produits conseil seulement." };
  }
  if (Number.isNaN(input.startsAt.getTime()) || Number.isNaN(input.endsAt.getTime())) return { ok: false, error: "Dates invalides." };
  if (input.endsAt <= input.startsAt) return { ok: false, error: "La fin de l'offre doit suivre son début." };
  if (input.endsAt <= now) return { ok: false, error: "Cette offre serait déjà terminée." };
  if (input.endsAt.getTime() - input.startsAt.getTime() > OFFER_LIMITS.maxDays * 86_400_000) return { ok: false, error: `Une offre dure ${OFFER_LIMITS.maxDays} jours au plus.` };
  return { ok: true, value: { title, rangeLabel, discountPercent: input.discountPercent, details, startsAt: input.startsAt, endsAt: input.endsAt } };
}

// ---------------------------------------------------------------- Pharmacies réclamées

/** La clé qui regroupe les demandes d'une même pharmacie : nom sans « pharmacie », sans accents ni ponctuation, + code postal. */
export function joinRequestKey(name: string, postalCode: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(grande\s+)?pharmacie\b|\bpharma\b|\bofficine\b/g, " ")
    .replace(/\b(de|du|des|la|le|les|l|d)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return `${postalCode.replace(/\D/g, "").slice(0, 5)}:${cleaned}`;
}

export type JoinRequestInput = { pharmacyName: string; city: string; postalCode: string };

export function validateJoinRequest(input: JoinRequestInput): { ok: true; value: JoinRequestInput } | { ok: false; error: string } {
  const pharmacyName = input.pharmacyName.trim().replace(/\s+/g, " ").slice(0, 120);
  const city = input.city.trim().replace(/\s+/g, " ").slice(0, 80);
  const postalCode = input.postalCode.replace(/\s/g, "");
  if (pharmacyName.length < 3) return { ok: false, error: "Indiquez le nom de votre pharmacie." };
  if (city.length < 2) return { ok: false, error: "Indiquez la ville." };
  if (!/^\d{5}$/.test(postalCode)) return { ok: false, error: "Le code postal compte 5 chiffres." };
  return { ok: true, value: { pharmacyName, city, postalCode } };
}

/** « -20 % sur la gamme NHCO » */
export function offerHeadline(offer: { discountPercent: number; rangeLabel: string }): string {
  return `-${offer.discountPercent} % · ${offer.rangeLabel}`;
}
