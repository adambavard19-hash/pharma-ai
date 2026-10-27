import type { AdviceRule } from "./engines/advice";
import { OVERSTOCK_DRUG_CLASSES } from "@/core/overstock/campaign";
import { ASSOCIATION_DRUG_CLASSES } from "@/core/associations/drug-classes";

/**
 * Le classement des conseils par famille de médicaments (fondateur, 26 oct. 2026) : « je veux avoir le choix sur quelle règle
 * passe en premier selon le médicament ou la famille ». Depuis Console → Gestion → Priorités, l'équipe PharmaBoost range les
 * conseils d'une famille — règle 1, règle 2, règle 3 — et cet ordre vaut pour toutes les pharmacies.
 *
 * Le classement ne crée ni ne supprime aucun conseil : il redistribue, dans l'ordre choisi, les priorités que ces conseils
 * avaient déjà pour la vente. Leur place face aux conseils des AUTRES médicaments de la vente ne bouge donc pas, seul leur
 * ordre entre eux change. Une campagne de surstock de la pharmacie reste devant tout (pipeline, étape 9).
 *
 * Module PUR : la console lit et écrit le classement (PlatformSetting « advice.priorities »), le moteur l'applique ici.
 */

export const PRIORITY_SETTING_KEY = "advice.priorities";

export type PriorityFamily = { code: string; label: string };

/** Les familles qu'on peut classer : celles des campagnes de surstock, les familles d'antibiotiques, les antibiotiques locaux. */
export const PRIORITY_FAMILIES: readonly PriorityFamily[] = (() => {
  const list: PriorityFamily[] = [];
  const add = (family: PriorityFamily) => {
    if (!list.some((item) => item.code === family.code)) list.push(family);
  };
  for (const item of OVERSTOCK_DRUG_CLASSES) {
    add(item);
    // Les familles d'antibiotiques viennent juste sous « Antibiotiques ».
    if (item.code === "J01") for (const sub of ASSOCIATION_DRUG_CLASSES) if (sub.code !== "J01") add({ code: sub.code, label: `Antibiotiques — ${sub.label}` });
  }
  add({ code: "D06A", label: "Antibiotiques locaux (crème, pommade)" });
  return list;
})();

const KNOWN = new Set(PRIORITY_FAMILIES.map((family) => family.code));

export const familyLabel = (code: string): string => PRIORITY_FAMILIES.find((family) => family.code === code)?.label ?? code;

/** Famille → clés de règles, dans l'ordre choisi (la première est la règle 1). */
export type PriorityRankings = Record<string, string[]>;

/** Lit la valeur enregistrée ; tout ce qui n'est pas une famille connue ou une liste de clés est ignoré. */
export function readRankings(value: unknown): PriorityRankings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: PriorityRankings = {};
  for (const [code, keys] of Object.entries(value as Record<string, unknown>)) {
    if (!KNOWN.has(code) || !Array.isArray(keys)) continue;
    const clean = [...new Set(keys.filter((key): key is string => typeof key === "string" && key.length > 0 && key.length <= 120))];
    if (clean.length > 0) out[code] = clean.slice(0, 50);
  }
  return out;
}

/** Une règle parle de cette famille quand l'un de ses codes ATC la contient ou y est contenu (« J01 » pour « J01C », et l'inverse). */
export function ruleCoversFamily(rule: Pick<AdviceRule, "atcPrefixes">, code: string): boolean {
  return rule.atcPrefixes.some((prefix) => prefix.startsWith(code) || code.startsWith(prefix));
}

/**
 * Les règles de la famille, dans l'ordre que verra le comptoir : d'abord celles que la console a classées, dans son ordre,
 * puis les autres par priorité de la règle.
 */
export function rankedRulesForFamily<T extends Pick<AdviceRule, "key" | "atcPrefixes" | "basePriority">>(rules: readonly T[], code: string, ranking: readonly string[] = []): T[] {
  const covering = rules.filter((rule) => ruleCoversFamily(rule, code));
  const position = (rule: T) => {
    const index = ranking.indexOf(rule.key);
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  };
  return [...covering].sort((a, b) => position(a) - position(b) || b.basePriority - a.basePriority || a.key.localeCompare(b.key));
}

type RankableOpportunity = { ruleKey?: string | null; priority: number; triggeredBy: { lineIndex: number }[] };

/**
 * Applique les classements aux conseils d'une vente. Chaque médicament suit le classement de sa famille la plus précise
 * (« Pénicillines » avant « Antibiotiques ») ; les conseils qu'il a ouverts et que ce classement nomme reçoivent, dans l'ordre
 * choisi, les priorités qu'ils avaient — strictement décroissantes, pour que la règle 1 passe vraiment devant la règle 2.
 */
export function applyPriorityRankings<T extends RankableOpportunity>(
  opportunities: T[],
  drugs: readonly { lineIndex: number; atcCode: string | null }[],
  rankings: PriorityRankings,
): T[] {
  const codes = Object.keys(rankings);
  if (codes.length === 0) return opportunities;
  const linesByFamily = new Map<string, Set<number>>();
  for (const drug of drugs) {
    const atc = drug.atcCode ?? "";
    if (!atc) continue;
    const family = codes.filter((code) => atc.startsWith(code)).sort((a, b) => b.length - a.length)[0];
    if (!family) continue;
    linesByFamily.set(family, new Set([...(linesByFamily.get(family) ?? []), drug.lineIndex]));
  }
  const priorityOf = new Map<T, number>();
  for (const [family, lines] of linesByFamily) {
    const order = rankings[family];
    const ranked = order
      .map((key) => opportunities.filter((item) => item.ruleKey === key && item.triggeredBy.some((trigger) => lines.has(trigger.lineIndex))))
      .filter((group) => group.length > 0);
    if (ranked.length < 2) continue;
    // Les priorités déjà acquises par ces conseils, de la plus haute à la plus basse, redistribuées dans l'ordre choisi.
    const slots = ranked.map((group) => Math.max(...group.map((item) => priorityOf.get(item) ?? item.priority))).sort((a, b) => b - a);
    let previous = Number.POSITIVE_INFINITY;
    ranked.forEach((group, index) => {
      const value = Math.min(slots[index], previous - 1);
      previous = value;
      for (const item of group) priorityOf.set(item, value);
    });
  }
  if (priorityOf.size === 0) return opportunities;
  return opportunities.map((item) => (priorityOf.has(item) ? { ...item, priority: priorityOf.get(item)! } : item)).sort((a, b) => b.priority - a.priority);
}
