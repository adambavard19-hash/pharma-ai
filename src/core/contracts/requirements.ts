import { isValidSiret, normalizeEmail, normalizePostalCode } from "./identity";

/**
 * Ce que le contrat exige avant de partir. Une seule liste, appliquée quelle
 * que soit l'origine du dossier (site, console, commercial) : s'il manque
 * quelque chose, l'envoi est bloqué et seul le manque est demandé.
 */
export type ContractField = "name" | "legalName" | "siret" | "addressLine1" | "postalCode" | "city" | "ownerName" | "email";

export const CONTRACT_FIELD_LABELS: Record<ContractField, string> = {
  name: "Nom de la pharmacie",
  legalName: "Raison sociale",
  siret: "SIRET",
  addressLine1: "Adresse",
  postalCode: "Code postal",
  city: "Ville",
  ownerName: "Nom du représentant signataire",
  email: "E-mail du représentant",
};

export type ContractDossier = {
  name?: string | null;
  legalName?: string | null;
  siret?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
  ownerName?: string | null;
  email?: string | null;
};

export type MissingField = { field: ContractField; label: string; reason: "missing" | "invalid" };

export function missingContractFields(dossier: ContractDossier): MissingField[] {
  const out: MissingField[] = [];
  const need = (field: ContractField, value: string | null | undefined, valid?: (v: string) => boolean) => {
    const v = (value ?? "").trim();
    if (!v) out.push({ field, label: CONTRACT_FIELD_LABELS[field], reason: "missing" });
    else if (valid && !valid(v)) out.push({ field, label: CONTRACT_FIELD_LABELS[field], reason: "invalid" });
  };
  need("name", dossier.name);
  need("legalName", dossier.legalName);
  need("siret", dossier.siret, isValidSiret);
  need("addressLine1", dossier.addressLine1);
  need("postalCode", dossier.postalCode, (v) => normalizePostalCode(v) !== null);
  need("city", dossier.city);
  need("ownerName", dossier.ownerName);
  need("email", dossier.email, (v) => normalizeEmail(v) !== null);
  return out;
}

/** « SIRET (invalide), Code postal » : pour un message court. */
export function describeMissing(missing: MissingField[]): string {
  return missing.map((m) => (m.reason === "invalid" ? `${m.label} (invalide)` : m.label)).join(", ");
}

export type CompanyParty = {
  legalName?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  siren?: string | null;
  representativeName?: string | null;
  representativeEmail?: string | null;
};

/** La partie PharmaBoost doit être complète elle aussi : sinon le contrat ne part pas. */
export function missingCompanyFields(company: CompanyParty | null): string[] {
  if (!company) return ["Fiche société (Console → Société)"];
  const out: string[] = [];
  if (!company.legalName?.trim()) out.push("Dénomination de la société");
  if (!company.addressLine1?.trim() || !company.city?.trim()) out.push("Adresse de la société");
  if (!company.siren?.trim()) out.push("SIREN de la société");
  if (!company.representativeName?.trim()) out.push("Représentant signataire");
  if (!normalizeEmail(company.representativeEmail)) out.push("E-mail du signataire société");
  return out;
}
