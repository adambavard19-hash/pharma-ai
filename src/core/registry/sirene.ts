import { digitsOnly } from "@/core/contracts/identity";

/**
 * L'annuaire public des entreprises (API Recherche d'entreprises de la DINUM,
 * données du répertoire SIRENE de l'Insee, Licence Ouverte 2.0) : à partir
 * d'un SIRET, l'établissement tel que le répertoire le décrit.
 *
 * On ne garde que ce qui sert à préremplir la fiche d'une officine. Rien n'est
 * deviné : un champ absent reste vide, et la personne vérifie chaque valeur
 * avant l'envoi. Les dirigeants renvoyés par l'API ne sont jamais repris : le
 * signataire se présente lui-même.
 */
export type CompanyLookup = {
  siret: string;
  /** Raison sociale, mise en casse lisible (« Pharmacie de la Passerelle »). */
  legalName: string;
  /** Enseigne ou nom commercial de l'établissement, s'il en déclare un. */
  tradeName: string | null;
  addressLine1: string | null;
  postalCode: string | null;
  city: string | null;
  /** Un seul numéro FINESS déclaré pour l'établissement : repris ; plusieurs ou aucun : laissé vide. */
  finessNumber: string | null;
  /** Établissement en activité (état administratif « A »). */
  active: boolean;
  /** Code APE 47.73Z : commerce de détail de produits pharmaceutiques en magasin spécialisé. */
  isPharmacy: boolean;
  activityCode: string | null;
};

export const PHARMACY_ACTIVITY_CODE = "47.73Z";

/** Mention de la source, exigée par la Licence Ouverte. */
export const SIRENE_SOURCE = "Annuaire des entreprises (data.gouv.fr), répertoire SIRENE de l'Insee";

type Establishment = {
  siret?: string | null;
  adresse?: string | null;
  code_postal?: string | null;
  libelle_commune?: string | null;
  liste_enseignes?: string[] | null;
  nom_commercial?: string | null;
  liste_finess?: string[] | null;
  etat_administratif?: string | null;
  activite_principale?: string | null;
  statut_diffusion_etablissement?: string | null;
};

type Unit = {
  nom_raison_sociale?: string | null;
  nom_complet?: string | null;
  activite_principale?: string | null;
  siege?: Establishment | null;
  matching_etablissements?: Establishment[] | null;
};

const LEGAL_FORMS = new Set(["SELARL", "SELAS", "SELAFA", "SELCA", "SELEURL", "SARL", "EURL", "SAS", "SASU", "SA", "SNC", "SCP", "SCI", "SPFPL", "SPF", "EI", "EIRL", "GIE"]);
const SMALL_WORDS = new Set(["de", "du", "des", "la", "le", "les", "et", "en", "sur", "sous", "aux", "au", "a", "à"]);

/**
 * « PHARMACIE DE LA PASSERELLE » → « Pharmacie de la Passerelle » ;
 * « SELARL PHARMACIE D'AINAY » → « SELARL Pharmacie d'Ainay ». Les formes
 * juridiques restent en capitales. Un texte déjà en casse mixte est gardé tel quel.
 */
export function displayCase(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text !== text.toUpperCase()) return text;
  let first = true;
  return text
    .split(" ")
    .map((word) => {
      const result = caseWord(word, first);
      first = false;
      return result;
    })
    .join(" ");
}

function caseWord(word: string, first: boolean): string {
  if (LEGAL_FORMS.has(word.replace(/[^A-Z]/g, "")) && /^[A-Z.]+$/.test(word)) return word;
  if (/^\d/.test(word)) return word.toLowerCase();
  const lower = word.toLowerCase();
  // « D'AINAY » → « d'Ainay », « L'ECHAPPEE » → « l'Echappee ».
  const elision = /^([dl])['’](.+)$/.exec(lower);
  if (elision) return `${first ? elision[1].toUpperCase() : elision[1]}'${capitalize(elision[2])}`;
  if (!first && SMALL_WORDS.has(lower)) return lower;
  return lower.split("-").map(capitalize).join("-");
}

function capitalize(part: string): string {
  return part ? part.charAt(0).toUpperCase() + part.slice(1) : part;
}

/** « 8 PLACE AMPERE 69002 LYON » → rue, code postal, commune. */
export function splitSireneAddress(address: string | null | undefined): { street: string | null; postalCode: string | null; city: string | null } {
  const text = (address ?? "").replace(/\s+/g, " ").trim();
  if (!text || /NON[- ]DIFFUSIBLE/i.test(text)) return { street: null, postalCode: null, city: null };
  const match = /^(.*?)\s*\b(\d{5})\s+(.+)$/.exec(text);
  if (!match) return { street: text, postalCode: null, city: null };
  return { street: match[1] || null, postalCode: match[2], city: match[3].replace(/\s+CEDEX(\s+\d+)?$/i, "") || null };
}

/**
 * La réponse de `GET /search?q=<siret>`, réduite à l'établissement dont le
 * SIRET est exactement celui demandé ; `null` s'il n'y figure pas.
 */
export function parseCompanySearch(payload: unknown, siret: string): CompanyLookup | null {
  const wanted = digitsOnly(siret);
  const results = (payload as { results?: Unit[] } | null)?.results;
  if (!Array.isArray(results) || wanted.length !== 14) return null;
  for (const unit of results) {
    const candidates = [...(unit.matching_etablissements ?? []), ...(unit.siege ? [unit.siege] : [])];
    const establishment = candidates.find((e) => digitsOnly(e?.siret) === wanted);
    if (!establishment) continue;
    const legalName = displayCase(unit.nom_raison_sociale) ?? displayCase(unit.nom_complet);
    if (!legalName) return null;
    const hidden = establishment.statut_diffusion_etablissement && establishment.statut_diffusion_etablissement !== "O";
    const address = hidden ? { street: null, postalCode: null, city: null } : splitSireneAddress(establishment.adresse);
    const trade = establishment.liste_enseignes?.find((name) => name?.trim()) ?? establishment.nom_commercial ?? null;
    const finess = (establishment.liste_finess ?? []).map((value) => digitsOnly(value)).filter((value) => value.length === 9);
    const activityCode = establishment.activite_principale ?? unit.activite_principale ?? null;
    return {
      siret: wanted,
      legalName,
      tradeName: displayCase(trade),
      addressLine1: displayCase(address.street),
      postalCode: address.postalCode ?? (hidden ? null : (digitsOnly(establishment.code_postal).length === 5 ? digitsOnly(establishment.code_postal) : null)),
      city: displayCase(address.city ?? (hidden ? null : establishment.libelle_commune)),
      finessNumber: new Set(finess).size === 1 ? finess[0] : null,
      active: establishment.etat_administratif === "A",
      isPharmacy: activityCode === PHARMACY_ACTIVITY_CODE,
      activityCode,
    };
  }
  return null;
}
