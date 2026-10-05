import { cleanText, normalizeEmail, normalizePhone, normalizePostalCode, normalizeSiret, personName } from "./identity";

/**
 * Le formulaire de souscription du site, validé et normalisé avant tout
 * usage : ces valeurs deviennent la référence du dossier, du contrat et de
 * l'espace PharmaBoost.
 */
export type SubscriptionRequestInput = {
  pharmacyName: string;
  legalName: string;
  siret: string;
  finessNumber?: string | null;
  addressLine1: string;
  postalCode: string;
  city: string;
  phone?: string | null;
  ownerFirstName: string;
  ownerLastName: string;
  ownerTitle: string;
  ownerEmail: string;
  planId?: string | null;
  outletCount?: number | null;
  referralCode?: string | null;
  /** Le confrère que l'officine souhaite parrainer (facultatif) : l'équipe le contacte, rien ne lui est envoyé. */
  referee?: { name?: string | null; email: string; phone: string } | null;
};

/** Le confrère à parrainer, validé et normalisé. */
export type NormalizedReferee = { name: string | null; email: string; phone: string };

export type NormalizedRequest = {
  name: string;
  legalName: string;
  siret: string;
  finessNumber: string | null;
  addressLine1: string;
  postalCode: string;
  city: string;
  phone: string | null;
  ownerName: string;
  ownerTitle: string;
  email: string;
  outletCount: number | null;
  referee: NormalizedReferee | null;
};

export const REFEREE_NAME_MAX = 120;

/** Validation et normalisation : une valeur invalide est refusée avec son libellé, rien n'est deviné. */
export function normalizeSubscriptionRequest(input: SubscriptionRequestInput): { ok: true; value: NormalizedRequest } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = cleanText(input.pharmacyName);
  const legalName = cleanText(input.legalName);
  const siret = normalizeSiret(input.siret);
  const postalCode = normalizePostalCode(input.postalCode);
  const email = normalizeEmail(input.ownerEmail);
  const first = personName(input.ownerFirstName);
  const last = personName(input.ownerLastName);
  const phone = input.phone?.trim() ? normalizePhone(input.phone) : null;
  if (!name) errors.pharmacyName = "Indiquez le nom de la pharmacie.";
  if (!legalName) errors.legalName = "Indiquez la raison sociale.";
  if (!siret) errors.siret = "Ce SIRET n'est pas valide (14 chiffres).";
  if (!cleanText(input.addressLine1)) errors.addressLine1 = "Indiquez l'adresse.";
  if (!postalCode) errors.postalCode = "Code postal à 5 chiffres.";
  if (!cleanText(input.city)) errors.city = "Indiquez la ville.";
  if (!first) errors.ownerFirstName = "Indiquez le prénom.";
  if (!last) errors.ownerLastName = "Indiquez le nom.";
  if (!cleanText(input.ownerTitle)) errors.ownerTitle = "Indiquez la qualité du signataire.";
  if (!email) errors.ownerEmail = "Cette adresse e-mail n'est pas valide.";
  if (input.phone?.trim() && !phone) errors.phone = "Ce numéro de téléphone n'est pas valide.";
  const referee = normalizeReferee(input.referee, email, errors);
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: name!,
      legalName: legalName!,
      siret: siret!,
      finessNumber: cleanText(input.finessNumber),
      addressLine1: cleanText(input.addressLine1)!,
      postalCode: postalCode!,
      city: cleanText(input.city)!,
      phone,
      ownerName: `${first} ${last}`,
      ownerTitle: cleanText(input.ownerTitle)!,
      email: email!,
      outletCount: input.outletCount && input.outletCount > 0 ? Math.min(input.outletCount, 50) : null,
      referee,
    },
  };
}

/**
 * Le confrère à parrainer : facultatif, mais s'il est donné, son e-mail et son
 * téléphone doivent être valides. Une adresse identique à celle du signataire est
 * refusée : on parraine un confrère, pas soi-même. Les erreurs sont rattachées à
 * `referee.email`, `referee.phone` et `referee.name`.
 */
function normalizeReferee(raw: SubscriptionRequestInput["referee"], signerEmail: string | null, errors: Record<string, string>): NormalizedReferee | null {
  if (!raw) return null;
  const name = cleanText(raw.name);
  const email = normalizeEmail(raw.email);
  const phone = normalizePhone(raw.phone);
  if (name && name.length > REFEREE_NAME_MAX) errors["referee.name"] = `${REFEREE_NAME_MAX} caractères au plus.`;
  if (!email) errors["referee.email"] = "Cette adresse e-mail n'est pas valide.";
  else if (signerEmail && email === signerEmail) errors["referee.email"] = "Indiquez un confrère, pas vous-même.";
  if (!phone) errors["referee.phone"] = "Ce numéro de téléphone n'est pas valide.";
  return email && phone ? { name, email, phone } : null;
}

