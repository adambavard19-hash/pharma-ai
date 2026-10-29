import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { ADVICE_RULES, type AdviceRule } from "@/core/ai/engines/advice";
import { PRIORITY_FAMILIES, PRIORITY_SETTING_KEY, familyLabel, rankedRulesForFamily, readRankings, type PriorityRankings } from "@/core/ai/priority-ranking";
import { loadCentralAdvice, type Admin } from "./central-advice";

/**
 * Les priorités des conseils par famille de médicaments (fondateur, 26 oct. 2026), côté serveur : lues par l'analyse à chaque
 * vente, écrites depuis Console → Gestion → Priorités. Une seule valeur pour toutes les pharmacies (PlatformSetting).
 */

export async function loadPriorityRankings(): Promise<PriorityRankings> {
  const row = await prisma.platformSetting.findUnique({ where: { key: PRIORITY_SETTING_KEY }, select: { value: true } });
  return readRankings(row?.value);
}

/** Toutes les règles, telles que le moteur les connaît : celles du code (modifiées ou non) et les conseils ajoutés. */
async function allRules(): Promise<{ rules: AdviceRule[]; removed: Set<string> }> {
  const central = await loadCentralAdvice();
  const edited = new Map(central.custom.map((rule) => [rule.key, rule]));
  const codeKeys = new Set(ADVICE_RULES.map((rule) => rule.key));
  return { rules: [...ADVICE_RULES.map((rule) => edited.get(rule.key) ?? rule), ...central.custom.filter((rule) => !codeKeys.has(rule.key))], removed: new Set(central.removed) };
}

/** Les règles en ligne, telles que le moteur les applique. */
async function liveRules(): Promise<AdviceRule[]> {
  const { rules, removed } = await allRules();
  return rules.filter((rule) => !removed.has(rule.key));
}

export type PriorityRuleView = { key: string; title: string; kind: AdviceRule["kind"]; ranked: boolean };
export type PriorityFamilyView = { code: string; label: string; rules: PriorityRuleView[]; customized: boolean; defaultOrder: string[]; removed: { key: string; title: string }[] };

export async function listPriorityFamilies(): Promise<PriorityFamilyView[]> {
  const [{ rules: every, removed }, rankings] = await Promise.all([allRules(), loadPriorityRankings()]);
  const rules = every.filter((rule) => !removed.has(rule.key));
  const gone = every.filter((rule) => removed.has(rule.key));
  return PRIORITY_FAMILIES.map((family) => {
    const order = rankings[family.code] ?? [];
    const ranked = rankedRulesForFamily(rules, family.code, order);
    return {
      code: family.code,
      label: family.label,
      customized: order.length > 0,
      defaultOrder: rankedRulesForFamily(rules, family.code).map((rule) => rule.key),
      rules: ranked.map((rule) => ({ key: rule.key, title: rule.title, kind: rule.kind, ranked: order.includes(rule.key) })),
      // Les conseils retirés de cette famille, pour pouvoir les remettre.
      removed: rankedRulesForFamily(gone, family.code).map((rule) => ({ key: rule.key, title: rule.title })),
    };
  }).filter((family) => family.rules.length > 0 || family.removed.length > 0);
}

type Failure = { ok: false; error: string };

/** Enregistre l'ordre d'une famille (`ruleKeys` vide : retour à l'ordre de PharmaBoost). */
export async function saveFamilyRanking(admin: Admin, code: string, ruleKeys: string[]): Promise<{ ok: true; label: string } | Failure> {
  if (!PRIORITY_FAMILIES.some((family) => family.code === code)) return { ok: false, error: "Famille de médicaments inconnue." };
  const rules = await liveRules();
  const allowed = new Set(rankedRulesForFamily(rules, code).map((rule) => rule.key));
  const keys = [...new Set(ruleKeys)];
  if (keys.some((key) => !allowed.has(key))) return { ok: false, error: "Un conseil de la liste n'existe plus pour cette famille : rechargez la page." };
  const current = await loadPriorityRankings();
  const next: PriorityRankings = { ...current };
  if (keys.length === 0) delete next[code];
  else next[code] = keys;
  await prisma.platformSetting.upsert({
    where: { key: PRIORITY_SETTING_KEY },
    update: { value: next, updatedBy: admin.id },
    create: { key: PRIORITY_SETTING_KEY, value: next, updatedBy: admin.id },
  });
  await recordAudit({ action: "central_advice.priorities_saved", entityType: "AdviceRule", entityId: code, platformAdminId: admin.id, metadata: { family: code, order: keys } });
  return { ok: true, label: familyLabel(code) };
}
