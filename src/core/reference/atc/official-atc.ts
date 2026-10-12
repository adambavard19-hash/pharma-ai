import { officialAtcAttribution } from "../attribution";
import { OFFICIAL_ATC_BY_CIS, OFFICIAL_ATC_LABELS, OFFICIAL_ATC_SOURCE } from "./official-atc-data";

/**
 * La famille officielle d'une spécialité (code ATC), sans modèle.
 *
 * Le catalogue national (BDPM) dit ce qu'est un médicament — substances, voies — mais pas sa famille : le code ATC
 * n'y figure pas. Sans lui, une cétirizine n'est pas un antihistaminique pour les règles de conseil, et la famille ne
 * venait que du modèle : un crédit épuisé, et le comptoir perdait tout conseil sur un médicament courant (12 oct. 2026,
 * comptoir 3). Ce module est le secours : la famille que l'Assurance Maladie donne à chaque boîte remboursée (Open
 * Medic), jointe à la BDPM, générée par `scripts/atc-officiel.ts`.
 *
 *   • BOX — au moins une boîte de la spécialité est remboursée : son ATC est celui de l'Assurance Maladie ;
 *   • SUBSTANCE — spécialité non remboursée (Zyrtecset, « … Conseil ») : l'ATC unanime des remboursées qui ont les
 *     mêmes substances actives, la même voie et un même dosage. Un désaccord ne donne rien.
 *
 * Pur, sans base ni réseau : la table (≈ 215 Ko) est lue une fois, au premier appel. Elle ne remplace ni une
 * classification en cache ni la réponse de la pharmacienne : c'est `ensureClassifications` qui décide quand s'en servir.
 */

export type OfficialAtcBasis = "BOX" | "SUBSTANCE";

export type OfficialAtc = {
  atcCode: string;
  /** Les libellés officiels des niveaux 3 et 4 (« Antihistaminiques a usage systemique — derives de la piperazine »), ou `null` s'il n'y en a aucun de lisible. */
  therapeuticClass: string | null;
  basis: OfficialAtcBasis;
};

export { OFFICIAL_ATC_SOURCE };

/** La mention à porter partout où une famille officielle est montrée (Licence Ouverte : source, date, licence). */
export const OFFICIAL_ATC_ATTRIBUTION = officialAtcAttribution(OFFICIAL_ATC_SOURCE);

const CIS = /^\d{8}$/;

let index: { byCis: Map<string, { atcCode: string; basis: OfficialAtcBasis }>; labels: Map<string, string> } | null = null;

function load() {
  if (index) return index;
  const byCis = new Map<string, { atcCode: string; basis: OfficialAtcBasis }>();
  for (const entry of OFFICIAL_ATC_BY_CIS.split(";")) {
    const [cis, atcCode, basis] = entry.split(":");
    if (cis && atcCode) byCis.set(cis, { atcCode, basis: basis === "S" ? "SUBSTANCE" : "BOX" });
  }
  const labels = new Map<string, string>();
  for (const entry of OFFICIAL_ATC_LABELS.split(";")) {
    const at = entry.indexOf("=");
    if (at > 0) labels.set(entry.slice(0, at), entry.slice(at + 1));
  }
  index = { byCis, labels };
  return index;
}

/** « ANTIHISTAMINIQUES A USAGE SYSTEMIQUE » → « antihistaminiques a usage systemique » ; les sigles entre parenthèses (« (RGO) ») restent en capitales. */
function readable(label: string): string {
  return label.toLowerCase().replace(/\(([a-z0-9 -]{2,8})\)/g, (_, acronym: string) => `(${acronym.toUpperCase()})`);
}

/** La classe lisible d'un code ATC : libellé du niveau 3, puis celui du niveau 4 s'il dit autre chose. */
export function officialTherapeuticClass(atcCode: string): string | null {
  const { labels } = load();
  const parts = [labels.get(atcCode.slice(0, 4)), labels.get(atcCode.slice(0, 5))]
    .filter((label): label is string => Boolean(label))
    .map(readable);
  const unique = parts.filter((part, at) => parts.indexOf(part) === at);
  if (unique.length === 0) return null;
  const text = unique.join(" — ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** La famille officielle d'une spécialité, par son code CIS. `null` pour un CIS inconnu, absent ou mal formé : jamais deviné. */
export function officialAtcForCis(cisCode: string | null | undefined): OfficialAtc | null {
  const cis = cisCode?.trim() ?? "";
  if (!CIS.test(cis)) return null;
  const entry = load().byCis.get(cis);
  if (!entry) return null;
  return { atcCode: entry.atcCode, therapeuticClass: officialTherapeuticClass(entry.atcCode), basis: entry.basis };
}
