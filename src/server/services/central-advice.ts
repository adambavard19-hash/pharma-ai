import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { ADVICE_RULES, type AdviceRule } from "@/core/ai/engines/advice";
import { drugKey } from "@/core/ai/engines/associations";
import { summariseRuleFeedback, type RuleFeedback } from "@/core/ai/rule-feedback";
import { cleanSentence } from "@/core/associations/rules";
import {
  centralAssociationError,
  centralState,
  customRuleKey,
  customRulesFrom,
  parseCustomRuleDefinition,
  removedRuleKeys,
  rowsByKey,
  type CentralRuleRow,
  type CentralStatus,
  type CustomRuleDefinition,
} from "@/core/ai/central-advice";

/**
 * Le centre de contrôle des conseils — la partie serveur.
 *
 * Tout ce qui est décidé ici vaut pour TOUTES les officines, existantes et à venir, dès l'instant suivant : l'analyse relit
 * ces tables à chaque passage, aucune mémoire ne garde l'ancien état. Seul l'espace administrateur de PharmaBoost écrit ici
 * (voir `actions/admin-central-advice.ts`) ; les officines, elles, ne font que subir — ou plutôt profiter — du résultat.
 */

export type Admin = { id: string; fullName: string };
type Failure = { ok: false; error: string };

// ---------------------------------------------------------------------------------------------------------------
// Ce que l'analyse lit
// ---------------------------------------------------------------------------------------------------------------

export async function loadCentralRuleRows(): Promise<CentralRuleRow[]> {
  const rows = await prisma.centralAdviceRule.findMany({
    select: { ruleKey: true, source: true, status: true, ruleVersion: true, definition: true, decidedAt: true, decidedByName: true },
  });
  return rows;
}

/** Ce que le moteur applique à toute vente : les règles supprimées, et les conseils ajoutés qui sont en ligne. */
export async function loadCentralAdvice(): Promise<{ removed: string[]; custom: AdviceRule[] }> {
  const rows = await loadCentralRuleRows();
  return { removed: removedRuleKeys(rows), custom: customRulesFrom(rows) };
}

/**
 * Les règles relues et validées par le pharmacien de PharmaBoost (version courante pour celles du code). Seules leurs phrases
 * « patient » peuvent partir dans un e-mail à un patient : une règle encore à relire ne parle pas en son nom.
 */
export async function validatedRuleKeys(): Promise<Set<string>> {
  const rows = await loadCentralRuleRows();
  const byKey = rowsByKey(rows);
  const keys = new Set<string>();
  for (const rule of ADVICE_RULES) {
    const state = centralState(rule, byKey);
    if (state.status === "VALIDATED" && !state.outdated) keys.add(rule.key);
  }
  for (const row of rows) if (row.source === "CUSTOM" && row.status === "VALIDATED") keys.add(row.ruleKey);
  return keys;
}

// ---------------------------------------------------------------------------------------------------------------
// L'écran de la console
// ---------------------------------------------------------------------------------------------------------------

export type CentralRuleView = {
  /** « rule:<clé> » */
  id: string;
  ruleKey: string;
  title: string;
  version: string;
  origin: "CODE" | "ADDED";
  status: CentralStatus;
  /** La règle a changé depuis sa validation : à relire. */
  outdated: boolean;
  decidedBy: string | null;
  decidedAt: Date | null;
  /** Quand elle se déclenche, en clair. */
  when: string;
  sideEffects: string[];
  /** Ce qu'elle propose. */
  proposes: string;
  question: string | null;
  script: string;
  reason: string;
  safetyNotes: string[];
  source: string;
  /** Ce que les comptoirs de toutes les pharmacies en disent (indication, jamais une décision). Vide : pas encore proposée. */
  feedback: RuleFeedback | null;
};

export type CentralAssociationView = {
  id: string;
  triggerKind: "MEDICINE" | "PRODUCT";
  triggerLabel: string;
  adviceLabel: string;
  adviceEan: string;
  sentence: string | null;
  status: CentralStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
};

/** Une phrase de modèle commence par « le médicament… » une fois les marques remplacées : on remet les majuscules. */
export function startSentence(text: string): string {
  return text.replace(/(^|[.!?]\s+|«\s*)([a-zà-ÿ])/g, (_match, before: string, letter: string) => before + letter.toUpperCase());
}

function describeRule(rule: AdviceRule, status: CentralStatus, outdated: boolean, row: CentralRuleRow | undefined, categoryLabel: string): CentralRuleView {
  const triggers = [...rule.therapeuticClasses, ...(rule.atcPrefixes.length > 0 ? [`codes ATC ${rule.atcPrefixes.slice(0, 8).join(", ")}${rule.atcPrefixes.length > 8 ? "…" : ""}`] : [])];
  return {
    id: `rule:${rule.key}`,
    ruleKey: rule.key,
    title: rule.title,
    version: rule.version,
    origin: row?.source === "CUSTOM" ? "ADDED" : "CODE",
    status,
    outdated,
    decidedBy: status === "ACTIVE" ? null : (row?.decidedByName ?? null),
    decidedAt: status === "ACTIVE" ? null : (row?.decidedAt ?? null),
    when: triggers.length > 0 ? triggers.join(" · ") : "selon le besoin repéré",
    sideEffects: rule.sideEffectTriggers,
    proposes: `${categoryLabel}${rule.matchingTags.length > 0 ? " — " + rule.matchingTags.slice(0, 5).join(", ") : ""}`,
    question: rule.question ?? null,
    script: startSentence(rule.counterScriptTemplate.replaceAll("{drug}", "le médicament").replaceAll("{product}", "le produit")),
    reason: startSentence(rule.shortReasonTemplate.replaceAll("{drug}", "le médicament")),
    safetyNotes: rule.safetyNotes,
    source: rule.clinicalContext,
    feedback: null,
  };
}

/** Toutes les règles — celles du code et celles ajoutées — avec leur état central. */
export async function listCentralRules(categoryLabels: Record<string, string>): Promise<CentralRuleView[]> {
  const rows = await loadCentralRuleRows();
  const byKey = rowsByKey(rows);
  const views: CentralRuleView[] = ADVICE_RULES.map((rule) => {
    const state = centralState(rule, byKey);
    return describeRule(rule, state.status, state.outdated, byKey.get(rule.key), categoryLabels[rule.category] ?? rule.category);
  });
  for (const row of rows) {
    if (row.source !== "CUSTOM") continue;
    const parsed = parseCustomRuleDefinition(row.definition);
    if (!parsed.ok) continue;
    const rule = customRulesFrom([{ ...row, status: row.status === "REMOVED" ? "ACTIVE" : row.status }])[0];
    if (!rule) continue;
    views.push(describeRule(rule, row.status, false, row, categoryLabels[rule.category] ?? rule.category));
  }
  const feedback = await loadRuleFeedback();
  return views.map((view) => ({ ...view, feedback: feedback.get(view.ruleKey) ?? null }));
}

/**
 * Pour chaque règle, ce que les comptoirs en ont fait, toutes pharmacies réelles confondues (la démonstration ne compte pas).
 * Aucune donnée de patient : seulement des comptes par règle et par statut.
 */
export async function loadRuleFeedback(): Promise<Map<string, RuleFeedback>> {
  const [byStatus, byPharmacy] = await Promise.all([
    prisma.$queryRaw<{ ruleKey: string; status: string; count: number }[]>`
      SELECT o."ruleKey" AS "ruleKey", r."status"::text AS "status", COUNT(*)::int AS "count"
      FROM "recommendations" r
      JOIN "advice_opportunities" o ON o."id" = r."opportunityId"
      JOIN "pharmacies" p ON p."id" = r."pharmacyId"
      WHERE p."isDemo" = false AND r."isDemo" = false AND o."ruleKey" IS NOT NULL
      GROUP BY o."ruleKey", r."status"`,
    prisma.$queryRaw<{ ruleKey: string; pharmacies: number }[]>`
      SELECT o."ruleKey" AS "ruleKey", COUNT(DISTINCT r."pharmacyId")::int AS "pharmacies"
      FROM "recommendations" r
      JOIN "advice_opportunities" o ON o."id" = r."opportunityId"
      JOIN "pharmacies" p ON p."id" = r."pharmacyId"
      WHERE p."isDemo" = false AND r."isDemo" = false AND o."ruleKey" IS NOT NULL
      GROUP BY o."ruleKey"`,
  ]);
  const grouped = new Map<string, { status: string; count: number }[]>();
  for (const row of byStatus) grouped.set(row.ruleKey, [...(grouped.get(row.ruleKey) ?? []), { status: row.status, count: row.count }]);
  const pharmacies = new Map(byPharmacy.map((row) => [row.ruleKey, row.pharmacies]));
  return new Map([...grouped].map(([ruleKey, counts]) => [ruleKey, summariseRuleFeedback(counts, pharmacies.get(ruleKey) ?? 0)]));
}

export async function listCentralAssociations(): Promise<CentralAssociationView[]> {
  const rows = await prisma.centralAssociation.findMany({ orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  return rows.map((row) => ({
    id: row.id,
    triggerKind: row.triggerKind,
    triggerLabel: row.triggerLabel,
    adviceLabel: row.adviceLabel,
    adviceEan: row.adviceEan,
    sentence: row.sentence,
    status: row.status,
    decidedBy: row.status === "ACTIVE" ? null : row.decidedByName,
    decidedAt: row.status === "ACTIVE" ? null : row.decidedAt,
    createdBy: row.createdByName,
    createdAt: row.createdAt,
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// Les décisions
// ---------------------------------------------------------------------------------------------------------------

export type Decision = "VALIDATE" | "REMOVE" | "RESTORE";

const DECISION_STATUS: Record<Decision, CentralStatus> = { VALIDATE: "VALIDATED", REMOVE: "REMOVED", RESTORE: "ACTIVE" };

/** Valide, supprime ou rétablit une règle — du code ou ajoutée — pour toutes les officines. */
export async function decideRule(admin: Admin, ruleKey: string, decision: Decision): Promise<{ ok: true; title: string } | Failure> {
  const builtIn = ADVICE_RULES.find((candidate) => candidate.key === ruleKey);
  const existing = await prisma.centralAdviceRule.findUnique({ where: { ruleKey }, select: { source: true, definition: true } });
  if (!builtIn && existing?.source !== "CUSTOM") return { ok: false, error: "Règle de conseil inconnue." };

  const status = DECISION_STATUS[decision];
  let title = builtIn?.title ?? "";
  if (builtIn) {
    if (decision === "RESTORE") {
      // Une règle du code sans décision est « en ligne, à relire » : on efface simplement la ligne.
      await prisma.centralAdviceRule.deleteMany({ where: { ruleKey } });
    } else {
      const data = { status, ruleVersion: builtIn.version, decidedAt: new Date(), decidedByAdminId: admin.id, decidedByName: admin.fullName };
      await prisma.centralAdviceRule.upsert({ where: { ruleKey }, create: { ruleKey, source: "BUILT_IN", ...data }, update: data });
    }
  } else {
    const parsed = parseCustomRuleDefinition(existing?.definition);
    title = parsed.ok ? parsed.value.title : ruleKey;
    const data = { status, decidedAt: decision === "RESTORE" ? null : new Date(), decidedByAdminId: decision === "RESTORE" ? null : admin.id, decidedByName: decision === "RESTORE" ? null : admin.fullName, ...(decision === "VALIDATE" ? { ruleVersion: "1.0" } : {}) };
    await prisma.centralAdviceRule.update({ where: { ruleKey }, data });
  }
  await recordAudit({ action: "central_advice.rule_decided", entityType: "AdviceRule", entityId: ruleKey, platformAdminId: admin.id, metadata: { ruleKey, decision, ...(builtIn ? { ruleVersion: builtIn.version } : { added: true }) } });
  return { ok: true, title };
}

/** Ajoute un conseil depuis la console : en ligne tout de suite, dans toutes les officines, « à relire » jusqu'à validation. */
export async function addCustomRule(admin: Admin, raw: unknown): Promise<{ ok: true; ruleKey: string; definition: CustomRuleDefinition } | Failure> {
  const parsed = parseCustomRuleDefinition(raw);
  if (!parsed.ok) return parsed;
  const ruleKey = customRuleKey(randomBytes(6).toString("hex"));
  await prisma.centralAdviceRule.create({ data: { ruleKey, source: "CUSTOM", status: "ACTIVE", definition: parsed.value as never, decidedByAdminId: admin.id, decidedByName: admin.fullName } });
  await recordAudit({ action: "central_advice.rule_created", entityType: "AdviceRule", entityId: ruleKey, platformAdminId: admin.id, metadata: { ruleKey, title: parsed.value.title, atcPrefixes: parsed.value.atcPrefixes, tags: parsed.value.matchingTags } });
  return { ok: true, ruleKey, definition: parsed.value };
}

// ---------------------------------------------------------------------------------------------------------------
// Les associations communes
// ---------------------------------------------------------------------------------------------------------------

export type AssociationDraft = {
  trigger: { kind: "MEDICINE"; name: string } | { kind: "PRODUCT"; ean: string; name: string };
  advice: { ean: string; name: string };
  sentence: string | null;
};

export async function addCentralAssociation(admin: Admin, draft: AssociationDraft): Promise<{ ok: true; id: string } | Failure> {
  const triggerKey = draft.trigger.kind === "MEDICINE" ? drugKey(draft.trigger.name) : `ean:${draft.trigger.ean.replace(/\D/g, "")}`;
  const adviceEan = draft.advice.ean.replace(/\D/g, "");
  const sentence = cleanSentence(draft.sentence);
  const problem = centralAssociationError({ triggerKey: triggerKey === "drug:" ? "" : triggerKey, adviceEan, sentence });
  if (problem) return { ok: false, error: problem };
  const triggerLabel = draft.trigger.kind === "MEDICINE" ? draft.trigger.name.split(",")[0].trim() : draft.trigger.name;
  try {
    const created = await prisma.centralAssociation.create({
      data: {
        triggerKind: draft.trigger.kind,
        triggerKey,
        triggerLabel: triggerLabel.slice(0, 160),
        adviceEan,
        adviceLabel: draft.advice.name.slice(0, 160),
        sentence,
        createdByAdminId: admin.id,
        createdByName: admin.fullName,
      },
      select: { id: true },
    });
    await recordAudit({ action: "central_advice.association_created", entityType: "CentralAssociation", entityId: created.id, platformAdminId: admin.id, metadata: { triggerKey, adviceEan } });
    return { ok: true, id: created.id };
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") return { ok: false, error: "Cette association existe déjà." };
    throw error;
  }
}

export async function decideCentralAssociation(admin: Admin, id: string, decision: Decision): Promise<{ ok: true; label: string } | Failure> {
  const row = await prisma.centralAssociation.findUnique({ where: { id }, select: { triggerLabel: true, adviceLabel: true } });
  if (!row) return { ok: false, error: "Association introuvable." };
  const status = DECISION_STATUS[decision];
  await prisma.centralAssociation.update({
    where: { id },
    data: { status, decidedAt: decision === "RESTORE" ? null : new Date(), decidedByAdminId: decision === "RESTORE" ? null : admin.id, decidedByName: decision === "RESTORE" ? null : admin.fullName },
  });
  await recordAudit({ action: "central_advice.association_decided", entityType: "CentralAssociation", entityId: id, platformAdminId: admin.id, metadata: { decision } });
  return { ok: true, label: `${row.triggerLabel} → ${row.adviceLabel}` };
}

// ---------------------------------------------------------------------------------------------------------------
// Les recherches de la console
// ---------------------------------------------------------------------------------------------------------------

export type ProductHit = { ean: string; name: string; brand: string | null };

/**
 * Les produits connus des officines clientes (hors démonstration), un par code-barres : c'est dans cette liste que la
 * pharmacienne de PharmaBoost choisit un produit à conseiller ou un produit déclencheur. Aucun stock, aucun prix, aucune donnée patient.
 */
export async function searchKnownProducts(query: string): Promise<ProductHit[]> {
  const text = query.trim().slice(0, 80);
  if (text.length < 2) return [];
  const found = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ean: { not: null },
      pharmacy: { isDemo: false },
      OR: [{ name: { contains: text, mode: "insensitive" } }, { brand: { contains: text, mode: "insensitive" } }, { ean: { contains: text } }],
    },
    distinct: ["ean"],
    select: { ean: true, name: true, brand: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  return found.flatMap((product) => (product.ean ? [{ ean: product.ean, name: product.name, brand: product.brand }] : []));
}
