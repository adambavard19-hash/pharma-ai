import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";

/**
 * Les coordonnées imprimées sur la plaquette : celles du commercial connecté (extranet), ou aucune pour la version générique,
 * qui donne alors l'adresse publique de PharmaBoost. Le téléphone n'apparaît que s'il est renseigné sur la fiche du commercial.
 */
export type PlaquetteContact = { name: string; email: string; phone?: string | null };

/** L'adresse publique et le site : ce que la version générique donne comme contact. */
export const PLAQUETTE_PUBLIC_EMAIL = PUBLIC_CONTACT_EMAIL;
export const PLAQUETTE_SITE = "pharmaboost.app";

/** La version générique en PDF, produite par `npm run plaquette:pdf` dans `public/` et servie à cette adresse. */
export const PLAQUETTE_GENERIC_PDF = "/plaquette/pharmaboost-plaquette.pdf";

/** Le guide interne des commerciaux (produit, LGO, vocabulaire, objections, abonnement), produit par `scripts/plaquettes-pdf.mjs`. */
export const PLAQUETTE_SALES_GUIDE_PDF = "/plaquette/pharmaboost-guide-commercial.pdf";

/**
 * Un numéro français lisible : « 0612345678 » → « 06 12 34 56 78 », « +33612345678 » → « +33 6 12 34 56 78 ». Tout autre format
 * reste tel qu'il a été saisi : rien n'est deviné.
 */
export function formatPhoneFr(raw: string): string {
  const compact = raw.replace(/[\s.\-()]/g, "");
  if (/^0\d{9}$/.test(compact)) return compact.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  const intl = compact.match(/^\+33(\d)(\d{8})$/);
  if (intl) return `+33 ${intl[1]} ${intl[2].replace(/(\d{2})(?=\d)/g, "$1 ").trim()}`;
  return raw.trim();
}

/** Le contact nettoyé : un nom et un e-mail non vides, un téléphone mis en forme ou absent. Sans nom ni e-mail : version générique. */
export function normalizeContact(contact: PlaquetteContact | null | undefined): { name: string; email: string; phone: string | null } | null {
  const name = contact?.name?.trim();
  const email = contact?.email?.trim();
  if (!name || !email) return null;
  const phone = contact?.phone?.trim();
  return { name, email, phone: phone ? formatPhoneFr(phone) : null };
}
