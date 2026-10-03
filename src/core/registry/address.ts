/**
 * Le service de géocodage de la Géoplateforme (IGN), qui sert la Base Adresse
 * Nationale : des suggestions d'adresses pendant la saisie, et la forme
 * officielle d'une adresse lue ailleurs (« 8 PLACE AMPERE » → « 8 Place Ampère »).
 */
export type AddressSuggestion = {
  /** « 8 Place Ampère 69002 Lyon » : ce que la personne lit dans la liste. */
  label: string;
  /** « 8 Place Ampère » : la ligne d'adresse de la fiche. */
  addressLine1: string;
  postalCode: string;
  city: string;
};

export const ADDRESS_SOURCE = "Base Adresse Nationale (Géoplateforme, IGN)";

type Feature = { properties?: { label?: string; name?: string; postcode?: string; city?: string; type?: string; score?: number } };

const PRECISE_TYPES = new Set(["housenumber", "street"]);

/** Les suggestions d'une réponse `GET /geocodage/search`, sans doublon et sans résultat incomplet. */
export function parseAddressSuggestions(payload: unknown, { preciseOnly = false }: { preciseOnly?: boolean } = {}): (AddressSuggestion & { score: number; precise: boolean })[] {
  const features = (payload as { features?: Feature[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const seen = new Set<string>();
  const out: (AddressSuggestion & { score: number; precise: boolean })[] = [];
  for (const feature of features) {
    const p = feature?.properties;
    if (!p?.name || !p.city || !p.postcode || !/^\d{5}$/.test(p.postcode)) continue;
    const precise = PRECISE_TYPES.has(p.type ?? "");
    if (preciseOnly && !precise) continue;
    const label = p.label?.trim() || `${p.name} ${p.postcode} ${p.city}`;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, addressLine1: p.name.trim(), postalCode: p.postcode, city: p.city.trim(), score: typeof p.score === "number" ? p.score : 0, precise });
  }
  return out;
}

/**
 * La forme officielle d'une adresse lue ailleurs, si le géocodeur la reconnaît
 * avec assurance et dans le même code postal ; sinon `null`, et l'on garde
 * l'adresse telle qu'elle a été lue.
 */
export function pickOfficialAddress(payload: unknown, postalCode: string | null): AddressSuggestion | null {
  const best = parseAddressSuggestions(payload, { preciseOnly: true })[0];
  if (!best || best.score < 0.7) return null;
  if (postalCode && best.postalCode !== postalCode) return null;
  return { label: best.label, addressLine1: best.addressLine1, postalCode: best.postalCode, city: best.city };
}
