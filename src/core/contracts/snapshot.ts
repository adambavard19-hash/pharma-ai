import { formatSiret } from "./identity";
import type { ContractParty, ContractPharmacy } from "./template";

/**
 * La copie des parties d'un contrat, telle qu'imprimée dans le PDF.
 *
 * Le contrat est figé à sa génération : la référence, la société exploitante
 * et l'officine y sont recopiées à partir des MÊMES données que le PDF. Une
 * modification ultérieure de la fiche société (ou du dossier) ne touche
 * jamais un contrat déjà généré : la console relit cette copie, pas la fiche
 * du jour.
 */

/** La fiche société telle qu'enregistrée (Console → Société). */
export type CompanyProfileInput = {
  legalName: string;
  legalForm?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
  siren?: string | null;
  representativeName: string;
  representativeTitle?: string | null;
  representativeEmail: string;
};

/** Le dossier de l'officine, complet (le contrat n'est généré qu'une fois les champs exigés réunis). */
export type PharmacyDossierInput = {
  name: string;
  legalName?: string | null;
  ownerName: string;
  ownerTitle?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
  finessNumber?: string | null;
  siret?: string | null;
  email: string;
};

/** « 12 rue des Lilas, 75011 Paris » : l'adresse telle que le contrat l'imprime. */
export function printedAddress(line1: string | null | undefined, postalCode: string | null | undefined, city: string | null | undefined): string {
  return [line1, [postalCode, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/** La référence imprimée : « PB-2026-PHARMACI-V2 ». */
export function contractReference(prospectName: string, version: number, year: number): string {
  const slug = prospectName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "").toUpperCase().slice(0, 8) || "PHARMA";
  return `PB-${year}-${slug}-V${version}`;
}

/**
 * La référence d'un contrat : celle enregistrée à la génération, sinon (contrat
 * antérieur à l'enregistrement) recalculée avec l'année de sa génération.
 */
export function printedReference(contract: { reference?: string | null; version: number; createdAt: Date }, prospectName: string): string {
  const stored = contract.reference?.trim();
  if (stored) return stored;
  return contractReference(prospectName, contract.version, contract.createdAt.getFullYear());
}

/** La partie « Société » du contrat, depuis la fiche société. */
export function companyPartyOf(profile: CompanyProfileInput): ContractParty {
  return {
    legalName: profile.legalName,
    legalForm: profile.legalForm,
    address: printedAddress(profile.addressLine1, profile.postalCode, profile.city),
    siren: profile.siren,
    representativeName: profile.representativeName,
    representativeTitle: profile.representativeTitle,
    representativeEmail: profile.representativeEmail,
  };
}

/** La partie « Officine » du contrat, depuis le dossier. */
export function pharmacyPartyOf(dossier: PharmacyDossierInput): ContractPharmacy {
  return {
    name: dossier.name,
    legalName: dossier.legalName,
    ownerName: dossier.ownerName,
    ownerTitle: dossier.ownerTitle,
    address: printedAddress(dossier.addressLine1, dossier.postalCode, dossier.city),
    finessNumber: dossier.finessNumber,
    siret: dossier.siret,
    email: dossier.email,
  };
}

export type CompanySnapshot = {
  legalName: string;
  legalForm: string | null;
  address: string;
  siren: string | null;
  representativeName: string;
  representativeTitle: string | null;
  representativeEmail: string;
};

export type PharmacySnapshot = {
  name: string;
  legalName: string | null;
  ownerName: string;
  ownerTitle: string;
  address: string;
  finessNumber: string | null;
  siret: string | null;
  email: string;
  outletCount: number;
};

const clean = (value: string | null | undefined): string | null => {
  const text = (value ?? "").trim();
  return text ? text : null;
};

/**
 * La copie à enregistrer avec le contrat : les valeurs telles que le modèle les
 * imprime (qualité par défaut « pharmacien titulaire », SIRET groupé).
 */
export function contractSnapshot(input: { company: ContractParty; pharmacy: ContractPharmacy; outletCount: number }): { company: CompanySnapshot; pharmacy: PharmacySnapshot } {
  const { company, pharmacy } = input;
  const siret = clean(pharmacy.siret);
  return {
    company: {
      legalName: company.legalName,
      legalForm: clean(company.legalForm),
      address: company.address,
      siren: clean(company.siren),
      representativeName: company.representativeName,
      representativeTitle: clean(company.representativeTitle),
      representativeEmail: company.representativeEmail,
    },
    pharmacy: {
      name: pharmacy.name,
      legalName: clean(pharmacy.legalName),
      ownerName: pharmacy.ownerName,
      ownerTitle: clean(pharmacy.ownerTitle) ?? "pharmacien titulaire",
      address: pharmacy.address,
      finessNumber: clean(pharmacy.finessNumber),
      siret: siret ? formatSiret(siret) : null,
      email: pharmacy.email,
      outletCount: Math.max(1, Math.round(input.outletCount || 1)),
    },
  };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Relit une copie « société » enregistrée ; `null` si absente ou illisible (contrat antérieur). */
export function readCompanySnapshot(value: unknown): CompanySnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const legalName = str(v.legalName);
  const representativeName = str(v.representativeName);
  const representativeEmail = str(v.representativeEmail);
  if (!legalName || !representativeName || !representativeEmail) return null;
  return { legalName, legalForm: str(v.legalForm), address: str(v.address) ?? "", siren: str(v.siren), representativeName, representativeTitle: str(v.representativeTitle), representativeEmail };
}

/** Relit une copie « officine » enregistrée ; `null` si absente ou illisible. */
export function readPharmacySnapshot(value: unknown): PharmacySnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const name = str(v.name);
  const ownerName = str(v.ownerName);
  const email = str(v.email);
  if (!name || !ownerName || !email) return null;
  const outlets = typeof v.outletCount === "number" && Number.isFinite(v.outletCount) ? v.outletCount : 1;
  return { name, legalName: str(v.legalName), ownerName, ownerTitle: str(v.ownerTitle) ?? "pharmacien titulaire", address: str(v.address) ?? "", finessNumber: str(v.finessNumber), siret: str(v.siret), email, outletCount: outlets };
}

// ---------------------------------------------------------------------------
// Fiche société : ce qui a changé, pour le journal d'audit
// ---------------------------------------------------------------------------

export const COMPANY_FIELDS = ["legalName", "legalForm", "addressLine1", "postalCode", "city", "siren", "representativeName", "representativeTitle", "representativeEmail"] as const;
export type CompanyField = (typeof COMPANY_FIELDS)[number];

export const COMPANY_FIELD_LABELS: Record<CompanyField, string> = {
  legalName: "Dénomination sociale",
  legalForm: "Forme juridique",
  addressLine1: "Adresse",
  postalCode: "Code postal",
  city: "Ville",
  siren: "SIREN",
  representativeName: "Représentant signataire",
  representativeTitle: "Qualité du signataire",
  representativeEmail: "E-mail du signataire",
};

export type CompanyProfileChanges = Partial<Record<CompanyField, { from: string | null; to: string | null }>>;

/**
 * Les champs modifiés, avant → après. Un champ absent de la saisie (non
 * transmis) n'est pas comparé ; vide, `null` et absent se valent.
 */
export function diffCompanyProfile(before: Partial<Record<CompanyField, string | null>> | null, after: Partial<Record<CompanyField, string | null | undefined>>): CompanyProfileChanges {
  const changes: CompanyProfileChanges = {};
  for (const field of COMPANY_FIELDS) {
    if (after[field] === undefined) continue;
    const from = clean(before?.[field] ?? null);
    const to = clean(after[field] ?? null);
    if (from !== to) changes[field] = { from, to };
  }
  return changes;
}
