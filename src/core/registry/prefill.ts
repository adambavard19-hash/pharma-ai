import { digitsOnly } from "@/core/contracts/identity";
import type { CompanyLookup } from "./sirene";

/**
 * Le préremplissage d'une fiche depuis l'annuaire des entreprises, sans
 * jamais écraser une saisie : ce qu'une personne a tapé elle-même reste, et
 * « Ce n'est pas mon officine » ne retire que ce qui venait de l'annuaire.
 */

/** Ce qu'un annuaire a prérempli : `_siret` (repris), `_rejected` (écarté), puis champ → valeur reprise. */
export type Prefill = Record<string, string>;

type CompanyKey = "name" | "legalName" | "addressLine1" | "postalCode" | "city" | "finessNumber";

function companyValue(company: CompanyLookup, key: CompanyKey): string | null {
  if (key === "name") return company.tradeName ?? company.legalName;
  return company[key];
}

/**
 * Reprend l'établissement trouvé dans les champs vides, ou dans ceux qu'un
 * annuaire avait déjà remplis et que la personne n'a pas modifiés. Ce qu'elle
 * a saisi elle-même n'est jamais écrasé.
 */
export function applyCompany<V extends Record<string, unknown>>(values: V, company: CompanyLookup, fields: Partial<Record<CompanyKey, keyof V & string>>, prefill: Prefill): { patch: Partial<V>; prefill: Prefill } {
  const patch: Record<string, string> = {};
  const next: Prefill = { _siret: company.siret };
  for (const [key, field] of Object.entries(fields) as [CompanyKey, keyof V & string][]) {
    const found = companyValue(company, key);
    if (!found) continue;
    const current = String(values[field] ?? "").trim();
    if (!current || current === prefill[field]) {
      patch[field] = found;
      next[field] = found;
    }
  }
  return { patch: patch as Partial<V>, prefill: next };
}

/** « Ce n'est pas mon officine » : les valeurs reprises et restées telles quelles sont retirées. */
export function revertCompany<V extends Record<string, unknown>>(values: V, prefill: Prefill, siret: string): { patch: Partial<V>; prefill: Prefill } {
  const patch: Record<string, string> = {};
  for (const [field, value] of Object.entries(prefill)) {
    if (field.startsWith("_")) continue;
    if (String(values[field] ?? "") === value) patch[field] = "";
  }
  return { patch: patch as Partial<V>, prefill: { _rejected: siret } };
}

/** « 79783222700012 » → « 797 832 227 00012 », au fil de la frappe. */
export function formatSiretInput(value: string): string {
  const d = digitsOnly(value).slice(0, 14);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9)].filter(Boolean).join(" ");
}
