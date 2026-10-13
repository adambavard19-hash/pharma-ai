import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { ADVICE_RULES, type AdviceRule } from "@/core/ai/engines/advice";
import { atcKey, drugKey } from "@/core/ai/engines/associations";
import { summariseRuleFeedback, type RuleFeedback } from "@/core/ai/rule-feedback";
import { cleanSentence } from "@/core/associations/rules";
import {
  centralAssociationError,
  centralState,
  customRuleKey,
  customRulesFrom,
  effectiveCodeRule,
  overriddenRulesFrom,
  readOverride,
  parseCustomRuleDefinition,
  removedRuleKeys,
  rowsByKey,
  type CentralRuleRow,
  type CentralStatus,
  type CustomRuleDefinition,
} from "@/core/ai/central-advice";
import { changedEditFields, describeCodeExclusions, describeExclusions, editContextOf, editValuesOf, hasExclusions, parseRuleEdit } from "@/core/ai/central-advice-edit";
import { EDIT_FIELD_LABELS, NO_EXCLUSIONS, type RuleEditValues } from "@/core/ai/central-advice-edit-constants";

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

type StoredRuleRow = CentralRuleRow & { overrideBaseVersion?: string | null; overriddenAt?: Date | null; overriddenByName?: string | null };

export async function loadCentralRuleRows(): Promise<StoredRuleRow[]> {
  const rows = await prisma.centralAdviceRule.findMany({
    select: { ruleKey: true, source: true, status: true, ruleVersion: true, definition: true, decidedAt: true, decidedByName: true, override: true, overrideRevision: true, overrideBaseVersion: true, overriddenAt: true, overriddenByName: true },
  });
  return rows;
}

/**
 * Ce que le moteur applique à toute vente : les règles supprimées, les conseils ajoutés qui sont en ligne, et les règles du
 * code MODIFIÉES depuis la console (même clé : elles remplacent la règle d'origine dans le moteur).
 */
export async function loadCentralAdvice(): Promise<{ removed: string[]; custom: AdviceRule[] }> {
  const rows = await loadCentralRuleRows();
  return { removed: removedRuleKeys(rows), custom: [...customRulesFrom(rows), ...overriddenRulesFrom(rows)] };
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
    const state = centralState(effectiveCodeRule(rule, byKey.get(rule.key)), byKey);
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
  /** Le texte que lit le patient, `{drug}` / `{product}` remplacés par des mots génériques. */
  patientReason: string;
  /** Ce qui se modifie, tel que le formulaire « Modifier » le pré-remplit. */
  edit: RuleEditValues;
  /** La phrase de comptoir doit garder {product}. */
  requiresProduct: boolean;
  /** Une routine (plusieurs étapes) : ses produits restent ceux du code. */
  hasRoutine: boolean;
  /** Les exclusions écrites dans le code, en clair : toujours appliquées, jamais retirées depuis la console. */
  codeExclusions: string[];
  /** Les exclusions ajoutées depuis la console, en clair. */
  addedExclusions: string[];
  /** Les vigilances par population de la règle (grossesse, enfant…), en clair. */
  populations: string[];
  atcPrefixes: string[];
  matchingTags: string[];
  /** Modifiée depuis la console : par qui, quand. `null` : telle qu'à l'origine. */
  modified: { by: string | null; at: Date | null; codeChangedSince: boolean } | null;
};

export type CentralAssociationView = {
  id: string;
  triggerKind: "MEDICINE" | "PRODUCT" | "FAMILY" | "ATC";
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

function describeRule(rule: AdviceRule, status: CentralStatus, outdated: boolean, row: CentralRuleRow | undefined, categoryLabel: string, extra: { edit: RuleEditValues; codeExclusions: string[]; modified: CentralRuleView["modified"]; requiresProduct: boolean }): CentralRuleView {
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
    patientReason: startSentence(rule.patientReasonTemplate.replaceAll("{drug}", "le médicament").replaceAll("{product}", "le produit")),
    edit: extra.edit,
    requiresProduct: extra.requiresProduct,
    hasRoutine: Boolean(rule.routine),
    codeExclusions: extra.codeExclusions,
    addedExclusions: describeExclusions(extra.edit.exclusions),
    populations: (rule.populations ?? []).map((population) => population.text),
    atcPrefixes: rule.atcPrefixes,
    matchingTags: rule.routine ? rule.routine.steps.flatMap((step) => step.matchingTags) : rule.matchingTags,
    modified: extra.modified,
  };
}

/** Toutes les règles — celles du code et celles ajoutées — avec leur état central. */
export async function listCentralRules(categoryLabels: Record<string, string>): Promise<CentralRuleView[]> {
  const rows = await loadCentralRuleRows();
  const byKey = rowsByKey(rows);
  const overriddenBy = await lastEdits("RULE");
  const views: CentralRuleView[] = ADVICE_RULES.map((code) => {
    const row = byKey.get(code.key);
    const override = row ? readOverride(row, code) : null;
    const rule = effectiveCodeRule(code, row);
    const state = centralState(rule, byKey);
    return describeRule(rule, state.status, state.outdated, row, categoryLabels[rule.category] ?? rule.category, {
      edit: override ?? editValuesOf(code),
      codeExclusions: describeCodeExclusions(code),
      requiresProduct: code.counterScriptTemplate.includes("{product}"),
      modified: override && row ? { by: row.overriddenByName ?? null, at: row.overriddenAt ?? null, codeChangedSince: Boolean(row.overrideBaseVersion) && row.overrideBaseVersion !== code.version } : null,
    });
  });
  for (const row of rows) {
    if (row.source !== "CUSTOM") continue;
    const parsed = parseCustomRuleDefinition(row.definition);
    if (!parsed.ok) continue;
    const rule = customRulesFrom([{ ...row, status: row.status === "REMOVED" ? "ACTIVE" : row.status }])[0];
    if (!rule) continue;
    const definition = parsed.value;
    views.push(
      describeRule(rule, row.status, false, row, categoryLabels[rule.category] ?? rule.category, {
        edit: customEditValues(definition),
        codeExclusions: [],
        requiresProduct: true,
        modified: overriddenBy.has(row.ruleKey) ? { by: overriddenBy.get(row.ruleKey)!.by, at: overriddenBy.get(row.ruleKey)!.at, codeChangedSince: false } : null,
      }),
    );
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
  const existing = await prisma.centralAdviceRule.findUnique({ where: { ruleKey }, select: { source: true, definition: true, override: true, overrideRevision: true } });
  if (!builtIn && existing?.source !== "CUSTOM") return { ok: false, error: "Règle de conseil inconnue." };

  const status = DECISION_STATUS[decision];
  let title = builtIn?.title ?? "";
  if (builtIn) {
    // Une règle modifiée depuis la console se valide sur SA version (la modification), pas sur celle du code.
    const modified = existing ? readOverride(existing, builtIn) : null;
    const version = modified ? effectiveCodeRule(builtIn, { ruleKey, source: "BUILT_IN", status: "ACTIVE", ruleVersion: null, definition: null, decidedAt: null, decidedByName: null, override: existing?.override, overrideRevision: existing?.overrideRevision }).version : builtIn.version;
    if (decision === "RESTORE" && modified) {
      // La modification reste : seule la décision s'efface.
      await prisma.centralAdviceRule.update({ where: { ruleKey }, data: { status: "ACTIVE", decidedAt: null, decidedByAdminId: null, decidedByName: null } });
    } else if (decision === "RESTORE") {
      // Une règle du code sans décision est « en ligne, à relire » : on efface simplement la ligne.
      await prisma.centralAdviceRule.deleteMany({ where: { ruleKey } });
    } else {
      const data = { status, ruleVersion: version, decidedAt: new Date(), decidedByAdminId: admin.id, decidedByName: admin.fullName };
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

/** Un code ATC officiel, complet ou son début : « D10BA01 », « D10AD », « J01 ». */
const ATC_CODE = /^[A-Z]\d{2}([A-Z]{1,2}(\d{2})?)?$/;

export type AssociationDraft = {
  trigger: { kind: "MEDICINE"; name: string } | { kind: "PRODUCT"; ean: string; name: string } | { kind: "FAMILY"; familyId: string } | { kind: "ATC"; code: string; label: string | null };
  advice: { ean: string; name: string };
  sentence: string | null;
};

export async function addCentralAssociation(admin: Admin, draft: AssociationDraft): Promise<{ ok: true; id: string } | Failure> {
  let familyName: string | null = null;
  if (draft.trigger.kind === "FAMILY") {
    const family = await prisma.triggerFamily.findFirst({ where: { id: draft.trigger.familyId, status: { not: "REMOVED" } }, select: { name: true } });
    if (!family) return { ok: false, error: "Famille introuvable." };
    familyName = family.name;
  }
  if (draft.trigger.kind === "ATC" && !ATC_CODE.test(draft.trigger.code.replace(/\s+/g, "").toUpperCase())) {
    return { ok: false, error: "Code ATC invalide : une lettre, deux chiffres, puis la suite (« D10BA01 », « D10AD »)." };
  }
  const triggerKey =
    draft.trigger.kind === "MEDICINE"
      ? drugKey(draft.trigger.name)
      : draft.trigger.kind === "FAMILY"
        ? `family:${draft.trigger.familyId}`
        : draft.trigger.kind === "ATC"
          ? atcKey(draft.trigger.code)
          : `ean:${draft.trigger.ean.replace(/\D/g, "")}`;
  const adviceEan = draft.advice.ean.replace(/\D/g, "");
  const sentence = cleanSentence(draft.sentence);
  const problem = centralAssociationError({ triggerKey: triggerKey === "drug:" ? "" : triggerKey, adviceEan, sentence });
  if (problem) return { ok: false, error: problem };
  const triggerLabel =
    draft.trigger.kind === "MEDICINE"
      ? draft.trigger.name.split(",")[0].trim()
      : draft.trigger.kind === "FAMILY"
        ? (familyName as string)
        : draft.trigger.kind === "ATC"
          ? [triggerKey.slice("atc:".length), draft.trigger.label?.trim()].filter(Boolean).join(" · ")
          : draft.trigger.name;
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

// ---------------------------------------------------------------------------------------------------------------
// Modifier un conseil — et revenir à la version d'origine
// ---------------------------------------------------------------------------------------------------------------

export type EditHistoryEntry = { id: string; action: "EDIT" | "REVERT"; changed: string[]; by: string | null; at: Date };

/** Les valeurs modifiables d'un conseil ajouté (sa définition), dans la forme du formulaire. */
export function customEditValues(definition: CustomRuleDefinition): RuleEditValues {
  return {
    title: definition.title,
    counterScript: definition.counterScript,
    patientReason: definition.patientReason ?? definition.shortReason,
    shortReason: definition.shortReason,
    question: definition.question,
    atcPrefixes: definition.atcPrefixes,
    therapeuticClasses: definition.therapeuticClasses,
    category: definition.category,
    matchingTags: definition.matchingTags,
    preferWords: definition.preferWords ?? [],
    exclusions: definition.exclusions ?? NO_EXCLUSIONS,
    priority: definition.priority ?? (definition.kind === "TOLERANCE" ? 70 : 55),
    safetyNotes: definition.safetyNotes,
    source: definition.source,
  };
}

/** La dernière modification de chaque conseil (ou association), si elle n'a pas été annulée par un retour à l'origine. */
async function lastEdits(targetKind: "RULE" | "ASSOCIATION"): Promise<Map<string, { by: string | null; at: Date }>> {
  const rows = await prisma.centralAdviceEdit.findMany({ where: { targetKind }, orderBy: { createdAt: "asc" }, select: { targetKey: true, action: true, adminName: true, createdAt: true } });
  const last = new Map<string, { by: string | null; at: Date }>();
  for (const row of rows) {
    if (row.action === "REVERT") last.delete(row.targetKey);
    else last.set(row.targetKey, { by: row.adminName, at: row.createdAt });
  }
  return last;
}

/** L'historique de toutes les modifications, par conseil : qui, quand, quels champs. Le plus récent d'abord. */
export async function loadEditHistory(): Promise<Map<string, EditHistoryEntry[]>> {
  const rows = await prisma.centralAdviceEdit.findMany({ orderBy: { createdAt: "desc" }, take: 2000, select: { id: true, targetKind: true, targetKey: true, action: true, changed: true, adminName: true, createdAt: true } });
  const history = new Map<string, EditHistoryEntry[]>();
  for (const row of rows) {
    const key = `${row.targetKind === "RULE" ? "rule" : "association"}:${row.targetKey}`;
    history.set(key, [...(history.get(key) ?? []), { id: row.id, action: row.action === "REVERT" ? "REVERT" : "EDIT", changed: row.changed, by: row.adminName, at: row.createdAt }]);
  }
  return history;
}

const RULE_EDITED_MESSAGE = "Il repasse « à relire » : validez-le quand vous l'avez relu.";

/**
 * Modifie un conseil pour toutes les pharmacies. Règle du code : la modification est gardée à part (surcharge), la règle
 * d'origine reste intacte et l'on peut y revenir. Conseil ajouté : sa définition est réécrite, l'ancienne gardée dans
 * l'historique. Dans les deux cas : vérification stricte, « à relire » ensuite, trace dans le journal d'audit.
 */
export async function editRule(admin: Admin, ruleKey: string, raw: unknown): Promise<{ ok: true; title: string; message: string } | (Failure & { needsConfirmation?: boolean })> {
  const builtIn = ADVICE_RULES.find((candidate) => candidate.key === ruleKey);
  const existing = await prisma.centralAdviceRule.findUnique({ where: { ruleKey }, select: { source: true, status: true, definition: true, override: true, overrideRevision: true } });
  if (!builtIn && existing?.source !== "CUSTOM") return { ok: false, error: "Conseil inconnu." };

  if (builtIn) {
    const previous = (existing ? readOverride(existing, builtIn) : null) ?? editValuesOf(builtIn);
    const parsed = parseRuleEdit(raw, editContextOf(builtIn, previous.exclusions));
    if (!parsed.ok) return parsed;
    const changed = changedEditFields(previous, parsed.value, EDIT_FIELD_LABELS);
    if (changed.length === 0) return { ok: false, error: "Rien n'a changé." };
    const revision = (existing?.overrideRevision ?? 0) + 1;
    const data = { override: { edit: parsed.value } as never, overrideRevision: revision, overrideBaseVersion: builtIn.version, overriddenAt: new Date(), overriddenByName: admin.fullName, status: existing?.status === "REMOVED" ? ("REMOVED" as const) : ("ACTIVE" as const), decidedAt: null, decidedByAdminId: null, decidedByName: null };
    await prisma.centralAdviceRule.upsert({ where: { ruleKey }, create: { ruleKey, source: "BUILT_IN", ...data }, update: data });
    await prisma.centralAdviceEdit.create({ data: { targetKind: "RULE", targetKey: ruleKey, action: "EDIT", changed, before: previous as never, after: parsed.value as never, adminId: admin.id, adminName: admin.fullName } });
    await recordAudit({ action: "central_advice.rule_edited", entityType: "AdviceRule", entityId: ruleKey, platformAdminId: admin.id, metadata: { ruleKey, revision, changed, before: previous, after: parsed.value } });
    return { ok: true, title: parsed.value.title, message: RULE_EDITED_MESSAGE };
  }

  const current = parseCustomRuleDefinition(existing?.definition);
  if (!current.ok) return { ok: false, error: "Ce conseil est illisible : il ne peut pas être modifié." };
  const previous = customEditValues(current.value);
  const parsed = parseRuleEdit(raw, { requiresProduct: true, hasRoutine: false, previousExclusions: previous.exclusions });
  if (!parsed.ok) return parsed;
  const changed = changedEditFields(previous, parsed.value, EDIT_FIELD_LABELS);
  if (changed.length === 0) return { ok: false, error: "Rien n'a changé." };
  const next = parseCustomRuleDefinition({ ...parsed.value, kind: current.value.kind, patientReason: parsed.value.patientReason });
  if (!next.ok) return next;
  await prisma.centralAdviceRule.update({ where: { ruleKey }, data: { definition: next.value as never, ...(existing?.status === "REMOVED" ? {} : { status: "ACTIVE" as const }), decidedAt: null, decidedByAdminId: null, decidedByName: null } });
  await prisma.centralAdviceEdit.create({ data: { targetKind: "RULE", targetKey: ruleKey, action: "EDIT", changed, before: current.value as never, after: next.value as never, adminId: admin.id, adminName: admin.fullName } });
  await recordAudit({ action: "central_advice.rule_edited", entityType: "AdviceRule", entityId: ruleKey, platformAdminId: admin.id, metadata: { ruleKey, added: true, changed, before: current.value, after: next.value } });
  return { ok: true, title: next.value.title, message: RULE_EDITED_MESSAGE };
}

/** « Revenir à la version d'origine » : la règle du code telle qu'écrite, ou le conseil ajouté tel qu'il a été créé. */
export async function revertRule(admin: Admin, ruleKey: string): Promise<{ ok: true; title: string } | Failure> {
  const builtIn = ADVICE_RULES.find((candidate) => candidate.key === ruleKey);
  const existing = await prisma.centralAdviceRule.findUnique({ where: { ruleKey }, select: { source: true, status: true, definition: true, override: true, overrideRevision: true } });
  if (builtIn) {
    const current = existing ? readOverride(existing, builtIn) : null;
    if (!existing || !existing.override) return { ok: false, error: "Ce conseil n'a pas été modifié : il est déjà dans sa version d'origine." };
    await prisma.centralAdviceRule.update({ where: { ruleKey }, data: { override: Prisma.DbNull, overrideBaseVersion: null, overriddenAt: null, overriddenByName: null, ...(existing.status === "REMOVED" ? {} : { status: "ACTIVE" as const }), decidedAt: null, decidedByAdminId: null, decidedByName: null } });
    await prisma.centralAdviceEdit.create({ data: { targetKind: "RULE", targetKey: ruleKey, action: "REVERT", changed: ["Version d'origine"], before: (current ?? null) as never, after: editValuesOf(builtIn) as never, adminId: admin.id, adminName: admin.fullName } });
    await recordAudit({ action: "central_advice.rule_reverted", entityType: "AdviceRule", entityId: ruleKey, platformAdminId: admin.id, metadata: { ruleKey, before: current } });
    return { ok: true, title: builtIn.title };
  }
  if (existing?.source !== "CUSTOM") return { ok: false, error: "Conseil inconnu." };
  const first = await prisma.centralAdviceEdit.findFirst({ where: { targetKind: "RULE", targetKey: ruleKey, action: "EDIT" }, orderBy: { createdAt: "asc" }, select: { before: true } });
  const origin = parseCustomRuleDefinition(first?.before);
  if (!first || !origin.ok) return { ok: false, error: "Ce conseil n'a pas été modifié : il est déjà dans sa version d'origine." };
  await prisma.centralAdviceRule.update({ where: { ruleKey }, data: { definition: origin.value as never, ...(existing.status === "REMOVED" ? {} : { status: "ACTIVE" as const }), decidedAt: null, decidedByAdminId: null, decidedByName: null } });
  await prisma.centralAdviceEdit.create({ data: { targetKind: "RULE", targetKey: ruleKey, action: "REVERT", changed: ["Version d'origine"], before: existing.definition as never, after: origin.value as never, adminId: admin.id, adminName: admin.fullName } });
  await recordAudit({ action: "central_advice.rule_reverted", entityType: "AdviceRule", entityId: ruleKey, platformAdminId: admin.id, metadata: { ruleKey, added: true } });
  return { ok: true, title: origin.value.title };
}

type AssociationSnapshot = { adviceEan: string; adviceLabel: string; sentence: string | null };

/** Modifie une association commune (la phrase, le produit proposé) pour toutes les pharmacies ; « à relire » ensuite. */
export async function editCentralAssociation(admin: Admin, id: string, draft: { advice: { ean: string; name: string }; sentence: string | null }): Promise<{ ok: true; label: string } | Failure> {
  const row = await prisma.centralAssociation.findUnique({ where: { id }, select: { triggerKey: true, triggerLabel: true, adviceEan: true, adviceLabel: true, sentence: true, status: true } });
  if (!row) return { ok: false, error: "Association introuvable." };
  const after: AssociationSnapshot = { adviceEan: draft.advice.ean.replace(/\D/g, ""), adviceLabel: draft.advice.name.trim().slice(0, 160), sentence: cleanSentence(draft.sentence) };
  const problem = centralAssociationError({ triggerKey: row.triggerKey, adviceEan: after.adviceEan, sentence: after.sentence });
  if (problem) return { ok: false, error: problem };
  if (!after.adviceLabel) return { ok: false, error: "Choisissez le produit à proposer." };
  const before: AssociationSnapshot = { adviceEan: row.adviceEan, adviceLabel: row.adviceLabel, sentence: row.sentence };
  const changed = [...(before.adviceEan !== after.adviceEan ? ["Produit proposé"] : []), ...(before.sentence !== after.sentence ? ["Ce que dit le pharmacien"] : [])];
  if (changed.length === 0) return { ok: false, error: "Rien n'a changé." };
  try {
    await prisma.centralAssociation.update({ where: { id }, data: { ...after, ...(row.status === "REMOVED" ? {} : { status: "ACTIVE" as const }), decidedAt: null, decidedByAdminId: null, decidedByName: null } });
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") return { ok: false, error: "Cette association existe déjà avec ce produit." };
    throw error;
  }
  await prisma.centralAdviceEdit.create({ data: { targetKind: "ASSOCIATION", targetKey: id, action: "EDIT", changed, before: before as never, after: after as never, adminId: admin.id, adminName: admin.fullName } });
  await recordAudit({ action: "central_advice.association_edited", entityType: "CentralAssociation", entityId: id, platformAdminId: admin.id, metadata: { changed, before, after } });
  return { ok: true, label: `${row.triggerLabel} → ${after.adviceLabel}` };
}

/** Remet une association commune telle qu'elle a été créée (le tout premier « avant » de son historique). */
export async function revertCentralAssociation(admin: Admin, id: string): Promise<{ ok: true; label: string } | Failure> {
  const row = await prisma.centralAssociation.findUnique({ where: { id }, select: { triggerLabel: true, adviceEan: true, adviceLabel: true, sentence: true, status: true } });
  if (!row) return { ok: false, error: "Association introuvable." };
  const first = await prisma.centralAdviceEdit.findFirst({ where: { targetKind: "ASSOCIATION", targetKey: id, action: "EDIT" }, orderBy: { createdAt: "asc" }, select: { before: true } });
  const origin = first?.before as AssociationSnapshot | null | undefined;
  if (!origin || typeof origin.adviceEan !== "string") return { ok: false, error: "Cette association n'a pas été modifiée : elle est déjà dans sa version d'origine." };
  const snapshot: AssociationSnapshot = { adviceEan: origin.adviceEan, adviceLabel: origin.adviceLabel, sentence: origin.sentence ?? null };
  await prisma.centralAssociation.update({ where: { id }, data: { ...snapshot, ...(row.status === "REMOVED" ? {} : { status: "ACTIVE" as const }), decidedAt: null, decidedByAdminId: null, decidedByName: null } });
  await prisma.centralAdviceEdit.create({ data: { targetKind: "ASSOCIATION", targetKey: id, action: "REVERT", changed: ["Version d'origine"], before: { adviceEan: row.adviceEan, adviceLabel: row.adviceLabel, sentence: row.sentence } as never, after: snapshot as never, adminId: admin.id, adminName: admin.fullName } });
  await recordAudit({ action: "central_advice.association_reverted", entityType: "CentralAssociation", entityId: id, platformAdminId: admin.id, metadata: { after: snapshot } });
  return { ok: true, label: `${row.triggerLabel} → ${snapshot.adviceLabel}` };
}

/** Les associations modifiées depuis leur création (par qui, quand) : la console propose d'y revenir. */
export async function modifiedAssociations(): Promise<Map<string, { by: string | null; at: Date }>> {
  return lastEdits("ASSOCIATION");
}

export { hasExclusions };
