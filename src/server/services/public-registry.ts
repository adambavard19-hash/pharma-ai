import "server-only";
import { normalizeSiret } from "@/core/contracts/identity";
import { parseCompanySearch, type CompanyLookup } from "@/core/registry/sirene";
import { parseAddressSuggestions, pickOfficialAddress, type AddressSuggestion } from "@/core/registry/address";

/**
 * Les deux annuaires publics qui évitent une saisie aux formulaires du site :
 *  - l'API Recherche d'entreprises (DINUM, Licence Ouverte 2.0, sans clé,
 *    7 appels par seconde) pour retrouver une officine par son SIRET ;
 *  - le géocodage de la Géoplateforme (IGN, Base Adresse Nationale, sans clé,
 *    50 appels par seconde) pour compléter une adresse.
 * Les appels partent du serveur : l'adresse IP du visiteur n'est transmise à
 * aucun tiers. Une panne de l'un ou l'autre ne bloque rien : la personne
 * saisit elle-même.
 */
const USER_AGENT = "PharmaBoost/1.0 (+https://pharmaboost.app ; contact@pharmaboost.app)";
const TIMEOUT_MS = 6_000;
const COMPANY_URL = "https://recherche-entreprises.api.gouv.fr/search";
const GEOCODE_URL = "https://data.geopf.fr/geocodage/search";

export type CompanyLookupResult = { status: "FOUND"; company: CompanyLookup } | { status: "NOT_FOUND" } | { status: "UNAVAILABLE" };

// Une même recherche n'interroge l'annuaire qu'une fois toutes les dix minutes.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; value: unknown }>();

function cached<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function remember(key: string, value: unknown) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
}

async function getJson(url: URL): Promise<unknown | null> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) {
      console.warn(`[annuaire] ${url.hostname} a répondu ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn(`[annuaire] ${url.hostname} injoignable`, error instanceof Error ? error.message : error);
    return null;
  }
}

/** L'établissement d'un SIRET, avec son adresse sous sa forme officielle quand la Base Adresse Nationale la reconnaît. */
export async function lookupCompanyBySiret(input: string): Promise<CompanyLookupResult> {
  const siret = normalizeSiret(input);
  if (!siret) return { status: "NOT_FOUND" };
  const key = `siret:${siret}`;
  const hit = cached<CompanyLookupResult>(key);
  if (hit) return hit;

  const url = new URL(COMPANY_URL);
  url.searchParams.set("q", siret);
  url.searchParams.set("per_page", "5");
  const payload = await getJson(url);
  if (payload === null) return { status: "UNAVAILABLE" };
  const company = parseCompanySearch(payload, siret);
  if (!company) {
    const result: CompanyLookupResult = { status: "NOT_FOUND" };
    remember(key, result);
    return result;
  }

  // « 8 PLACE AMPERE » → « 8 Place Ampère » : les accents et la casse de la Base Adresse Nationale.
  if (company.addressLine1 && company.postalCode) {
    const geocode = new URL(GEOCODE_URL);
    geocode.searchParams.set("q", `${company.addressLine1} ${company.postalCode} ${company.city ?? ""}`.trim());
    geocode.searchParams.set("index", "address");
    geocode.searchParams.set("limit", "1");
    const official = pickOfficialAddress(await getJson(geocode), company.postalCode);
    if (official) Object.assign(company, { addressLine1: official.addressLine1, city: official.city });
  }

  const result: CompanyLookupResult = { status: "FOUND", company };
  remember(key, result);
  return result;
}

/** Des suggestions d'adresses pendant la saisie ; `null` si le service ne répond pas. */
export async function suggestAddresses(query: string): Promise<AddressSuggestion[] | null> {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 200);
  if (q.length < 3) return [];
  const key = `adresse:${q.toLowerCase()}`;
  const hit = cached<AddressSuggestion[]>(key);
  if (hit) return hit;
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("index", "address");
  url.searchParams.set("autocomplete", "1");
  url.searchParams.set("limit", "6");
  const payload = await getJson(url);
  if (payload === null) return null;
  const suggestions = parseAddressSuggestions(payload).map(({ label, addressLine1, postalCode, city }) => ({ label, addressLine1, postalCode, city }));
  remember(key, suggestions);
  return suggestions;
}
