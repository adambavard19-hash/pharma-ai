import { ADVICE_RULES, type AdviceRule } from "./engines/advice";
import { applyRuleEdit, editContextOf, exclusionReason, escapeWord, parseRuleEdit } from "./central-advice-edit";
import { NO_EXCLUSIONS, type RuleEditValues, type RuleExclusions } from "./central-advice-edit-constants";
import type { ProductCategoryCode } from "./types";
import { PRODUCT_CATEGORIES } from "@/config/catalog";
import { ADVICE_VOCABULARY } from "@/core/catalog/product-vocabulary";
import { brandKey } from "@/core/catalog/brand";
import {
  CENTRAL_SENTENCE_MAX,
  CUSTOM_KINDS,
  CUSTOM_LIMITS,
  type CentralStatus,
  type CustomKind,
} from "./central-advice-constants";
export { CENTRAL_SENTENCE_MAX, CENTRAL_STATUS_LABELS, CUSTOM_KINDS, CUSTOM_KIND_LABELS, CUSTOM_LIMITS, type CentralStatus, type CustomKind } from "./central-advice-constants";

/**
 * Le centre de contrôle des conseils.
 *
 * Les règles du moteur vivent dans le code : toute officine en bénéficie dès l'envoi de son stock, sans rien régler. Ce
 * module dit ce que l'équipe PharmaBoost (la pharmacienne qui relit) peut en décider, UNE FOIS, pour TOUTES les officines :
 *
 *  • ACTIVE    — en ligne, pas encore relue. C'est l'état de départ de toute règle : elle parle déjà partout ;
 *  • VALIDATED — relue et validée (datée, signée) ;
 *  • REMOVED   — supprimée : elle n'existe plus dans PharmaBoost, nulle part. On peut la rétablir.
 *
 * Elle peut aussi AJOUTER un conseil (une règle écrite depuis la console, sans toucher au code). Un conseil ajouté suit
 * exactement les mêmes garde-fous que ceux du code : stock, sécurité, ordonnance — il ne les contourne jamais.
 *
 * La validation porte sur une VERSION de la règle : une règle réécrite depuis redevient « à relire ». Une suppression, elle,
 * tient quelle que soit la version : c'est une décision explicite.
 *
 * Module pur : aucune base, aucune horloge.
 */

/** Ce que la base garde d'une règle : sa décision, et sa définition quand elle a été ajoutée. */
export type CentralRuleRow = {
  ruleKey: string;
  source: "BUILT_IN" | "CUSTOM";
  status: CentralStatus;
  ruleVersion: string | null;
  definition: unknown;
  decidedAt: Date | null;
  decidedByName: string | null;
  /** Règle du code modifiée depuis la console : `{ edit: RuleEditValues }` (voir central-advice-edit.ts). */
  override?: unknown;
  overrideRevision?: number;
};

export function rowsByKey<T extends CentralRuleRow>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.ruleKey, row]));
}

/** Où en est une règle du code : sa décision centrale, et si cette décision porte sur une version plus ancienne. */
export function centralState(rule: { key: string; version: string; validation: AdviceRule["validation"] }, rows: ReadonlyMap<string, CentralRuleRow>): { status: CentralStatus; outdated: boolean } {
  const row = rows.get(rule.key);
  if (row?.status === "REMOVED") return { status: "REMOVED", outdated: false };
  if (row?.status === "VALIDATED") return row.ruleVersion === rule.version ? { status: "VALIDATED", outdated: false } : { status: "ACTIVE", outdated: true };
  return { status: rule.validation.status === "VALIDATED" ? "VALIDATED" : "ACTIVE", outdated: false };
}

/** Les règles supprimées : elles sortent du moteur, pour toutes les officines. */
export function removedRuleKeys(rows: CentralRuleRow[]): string[] {
  return rows.filter((row) => row.status === "REMOVED").map((row) => row.ruleKey);
}

// ---------------------------------------------------------------------------------------------------------------
// Un conseil ajouté depuis la console
// ---------------------------------------------------------------------------------------------------------------

export type CustomRuleDefinition = {
  title: string;
  kind: CustomKind;
  /** Codes ATC (ou début de code) qui déclenchent le conseil : « J01 », « N02AA ». */
  atcPrefixes: string[];
  /** Libellés de classe thérapeutique qui le déclenchent, en plus ou à la place des codes. */
  therapeuticClasses: string[];
  category: ProductCategoryCode;
  /** Les étiquettes du produit à conseiller : prises dans le vocabulaire fermé des règles. */
  matchingTags: string[];
  /** La question à poser au patient avant de proposer. Vide : aucune. */
  question: string | null;
  /** Pourquoi ce conseil pour CE traitement, en une ligne. `{drug}` est remplacé par le médicament. */
  shortReason: string;
  /** Ce que le pharmacien dit. `{product}` est obligatoire ; `{drug}` est remplacé par le médicament. */
  counterScript: string;
  /** Ce que lit le patient. Vide : la raison courte. */
  patientReason: string | null;
  /** D'où vient ce conseil (recommandation, RCP, retour du comptoir…). */
  source: string | null;
  safetyNotes: string[];
  /** Ajouts de la console « Modifier » (facultatifs pour les conseils écrits avant) : préférences, exclusions, priorité. */
  preferWords?: string[];
  exclusions?: RuleExclusions;
  priority?: number;
  /** Le thème sous lequel la console range le conseil (« Acné », « Allergie »…). */
  theme?: string | null;
  /** Les médicaments choisis dans la console pour déclencher le conseil (leurs codes ATC sont dans `atcPrefixes`) : pour l'affichage. */
  medicines?: string[];
  /** Une routine en plusieurs étapes, une gamme par étape (fondateur, 28 oct. 2026). Absente : un conseil d'un seul produit. */
  routine?: { steps: CustomRoutineStep[] };
};

/**
 * Une étape d'une routine de la console : son nom (« Nettoyer »), le type de produit (catégorie et étiquettes, prises sur le
 * produit de référence choisi) et la gamme voulue (« cerave »), avec son produit de référence. Chaque pharmacie prend le
 * produit de son stock : une gamme prioritaire du titulaire d'abord, puis le produit et la gamme choisis ici.
 */
export type CustomRoutineStep = { label: string; category: ProductCategoryCode; tags: string[]; brand: string | null; ean: string | null; productName: string | null };

export const ROUTINE_LIMITS = { steps: { min: 2, max: 5 }, label: 30, theme: 40 } as const;

function parseRoutine(raw: unknown): { ok: true; value: { steps: CustomRoutineStep[] } } | { ok: false; error: string } {
  const list = Array.isArray((raw as { steps?: unknown } | null)?.steps) ? ((raw as { steps: unknown[] }).steps) : [];
  if (list.length < ROUTINE_LIMITS.steps.min || list.length > ROUTINE_LIMITS.steps.max) return { ok: false, error: `Une routine compte de ${ROUTINE_LIMITS.steps.min} à ${ROUTINE_LIMITS.steps.max} étapes.` };
  const steps: CustomRoutineStep[] = [];
  for (const [index, item] of list.entries()) {
    const input = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const label = clean(input.label);
    if (label.length < 2 || label.length > ROUTINE_LIMITS.label) return { ok: false, error: `Étape ${index + 1} : donnez-lui un nom court (« Nettoyer », « Hydrater »…).` };
    const category = clean(input.category) as ProductCategoryCode;
    if (!PRODUCT_CATEGORIES.includes(category)) return { ok: false, error: `Étape ${index + 1} : choisissez le produit de référence.` };
    const tags = [...new Set(cleanList(input.tags).map((tag) => tag.toLowerCase()))].filter((tag) => ADVICE_VOCABULARY.includes(tag));
    if (tags.length === 0) return { ok: false, error: `Étape ${index + 1} : choisissez au moins un type de produit (« nettoyant », « hydratation »…).` };
    if (tags.length > CUSTOM_LIMITS.tags) return { ok: false, error: `Étape ${index + 1} : six types de produit au plus.` };
    const brand = clean(input.brand).slice(0, 60) || null;
    const ean = /^\d{7,14}$/.test(clean(input.ean)) ? clean(input.ean) : null;
    const productName = clean(input.productName).slice(0, 160) || null;
    steps.push({ label, category, tags, brand, ean, productName });
  }
  return { ok: true, value: { steps } };
}


const ATC_PATTERN = /^[A-Z](?:\d{2}(?:[A-Z](?:[A-Z](?:\d{2})?)?)?)?$/;
const PLACEHOLDER = /\{([a-z]+)\}/g;

const clean = (value: unknown): string => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "");
const cleanList = (value: unknown): string[] => (Array.isArray(value) ? value.map(clean).filter((item) => item !== "") : []);

function placeholderError(label: string, text: string, allowed: string[]): string | null {
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (!allowed.includes(match[1])) return `${label} : « {${match[1]}} » n'est pas remplaçable (seuls ${allowed.map((name) => `{${name}}`).join(" et ")} le sont).`;
  }
  return null;
}

/**
 * Lit et vérifie ce que la console envoie pour un nouveau conseil. Les messages sont ceux que la pharmacienne lit.
 * Rien n'est deviné : une étiquette hors vocabulaire, un code ATC mal écrit ou une phrase sans `{product}` sont refusés.
 */
export function parseCustomRuleDefinition(raw: unknown): { ok: true; value: CustomRuleDefinition } | { ok: false; error: string } {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = clean(input.title);
  if (title.length < 3) return { ok: false, error: "Donnez un nom au conseil (3 caractères au moins)." };
  if (title.length > CUSTOM_LIMITS.title) return { ok: false, error: `Le nom est trop long (${CUSTOM_LIMITS.title} caractères au plus).` };

  const kind = clean(input.kind) as CustomKind;
  if (!CUSTOM_KINDS.includes(kind)) return { ok: false, error: "Choisissez le type de conseil : tolérance ou confort." };

  const atcPrefixes = [...new Set(cleanList(input.atcPrefixes).map((code) => code.toUpperCase().replace(/\s+/g, "")))];
  for (const code of atcPrefixes) if (!ATC_PATTERN.test(code)) return { ok: false, error: `« ${code} » n'est pas un code ATC valide (exemples : J01, N02AA, R05DA).` };
  const therapeuticClasses = [...new Set(cleanList(input.therapeuticClasses))];
  if (atcPrefixes.length === 0 && therapeuticClasses.length === 0) return { ok: false, error: "Indiquez à quels médicaments le conseil s'applique : un code ATC ou une classe thérapeutique." };
  if (atcPrefixes.length > CUSTOM_LIMITS.atc || therapeuticClasses.length > CUSTOM_LIMITS.classes) return { ok: false, error: "Trop de déclencheurs : restez précis." };
  if (therapeuticClasses.some((label) => label.length < 4 || label.length > 60)) return { ok: false, error: "Une classe thérapeutique s'écrit en 4 à 60 caractères." };

  // Une routine porte ses produits dans ses étapes : la catégorie et les étiquettes du conseil sont celles de la première.
  let routine: { steps: CustomRoutineStep[] } | undefined;
  if (input.routine !== undefined && input.routine !== null) {
    const parsedRoutine = parseRoutine(input.routine);
    if (!parsedRoutine.ok) return parsedRoutine;
    routine = parsedRoutine.value;
  }
  const category = (routine ? routine.steps[0].category : clean(input.category)) as ProductCategoryCode;
  if (!PRODUCT_CATEGORIES.includes(category)) return { ok: false, error: "Choisissez la catégorie du produit à conseiller." };
  const matchingTags = routine ? [...new Set(routine.steps.flatMap((step) => step.tags))].slice(0, CUSTOM_LIMITS.tags) : [...new Set(cleanList(input.matchingTags).map((tag) => tag.toLowerCase()))];
  if (matchingTags.length === 0) return { ok: false, error: "Choisissez au moins une étiquette de produit." };
  if (!routine && matchingTags.length > CUSTOM_LIMITS.tags) return { ok: false, error: `Six étiquettes au plus (${matchingTags.length} choisies).` };
  const unknown = matchingTags.find((tag) => !ADVICE_VOCABULARY.includes(tag));
  if (unknown) return { ok: false, error: `L'étiquette « ${unknown} » n'existe pas : choisissez dans la liste.` };

  const question = clean(input.question) || null;
  if (question && question.length > CUSTOM_LIMITS.question) return { ok: false, error: `La question est trop longue (${CUSTOM_LIMITS.question} caractères au plus).` };

  const shortReason = clean(input.shortReason);
  if (shortReason.length < 10) return { ok: false, error: "Écrivez la raison du conseil en une phrase (10 caractères au moins)." };
  if (shortReason.length > CUSTOM_LIMITS.reason) return { ok: false, error: `La raison est trop longue (${CUSTOM_LIMITS.reason} caractères au plus).` };
  const reasonProblem = placeholderError("La raison", shortReason, ["drug"]);
  if (reasonProblem) return { ok: false, error: reasonProblem };

  const counterScript = clean(input.counterScript);
  if (counterScript.length < 10) return { ok: false, error: "Écrivez ce que le pharmacien dit au patient (10 caractères au moins)." };
  if (counterScript.length > CUSTOM_LIMITS.script) return { ok: false, error: `La phrase est trop longue (${CUSTOM_LIMITS.script} caractères au plus).` };
  if (!counterScript.includes("{product}")) return { ok: false, error: "La phrase à dire doit contenir {product} : c'est là que le nom du produit s'écrit." };
  const scriptProblem = placeholderError("La phrase", counterScript, ["drug", "product"]);
  if (scriptProblem) return { ok: false, error: scriptProblem };

  const patientReason = clean(input.patientReason) || null;
  if (patientReason && patientReason.length > CUSTOM_LIMITS.script) return { ok: false, error: `Le texte du patient est trop long (${CUSTOM_LIMITS.script} caractères au plus).` };
  if (patientReason) {
    const problem = placeholderError("Le texte du patient", patientReason, ["drug"]);
    if (problem) return { ok: false, error: problem };
  }
  const source = clean(input.source) || null;
  if (source && source.length > CUSTOM_LIMITS.source) return { ok: false, error: `La source est trop longue (${CUSTOM_LIMITS.source} caractères au plus).` };
  const safetyNotes = cleanList(input.safetyNotes);
  if (safetyNotes.length > CUSTOM_LIMITS.notes || safetyNotes.some((note) => note.length > CUSTOM_LIMITS.note)) return { ok: false, error: `${CUSTOM_LIMITS.notes} précautions au plus, de ${CUSTOM_LIMITS.note} caractères.` };

  // Les ajouts de « Modifier » : vérifiés par les mêmes règles que pour une règle du code.
  const extras: Pick<CustomRuleDefinition, "preferWords" | "exclusions" | "priority"> = {};
  if (input.preferWords !== undefined || input.exclusions !== undefined || input.priority !== undefined) {
    const checked = parseRuleEdit(
      { title, counterScript, patientReason: patientReason ?? shortReason, shortReason, question, atcPrefixes, therapeuticClasses, category, matchingTags, preferWords: input.preferWords ?? [], exclusions: input.exclusions ?? NO_EXCLUSIONS, priority: input.priority ?? CUSTOM_PRIORITY[kind], safetyNotes, source, confirmNoExclusions: true },
      { requiresProduct: true, hasRoutine: false, previousExclusions: NO_EXCLUSIONS },
    );
    if (!checked.ok) return checked;
    if (checked.value.preferWords.length > 0) extras.preferWords = checked.value.preferWords;
    if (checked.value.exclusions.minAgeYears !== null || checked.value.exclusions.pregnancy || checked.value.exclusions.breastfeeding || checked.value.exclusions.conditions.length > 0) extras.exclusions = checked.value.exclusions;
    if (input.priority !== undefined) extras.priority = checked.value.priority;
  }

  const theme = clean(input.theme).slice(0, ROUTINE_LIMITS.theme) || null;
  const medicines = [...new Set(cleanList(input.medicines).map((name) => name.slice(0, 120)))].slice(0, 30);

  return { ok: true, value: { title, kind, atcPrefixes, therapeuticClasses, category, matchingTags, question, shortReason, counterScript, patientReason, source, safetyNotes, ...extras, ...(theme ? { theme } : {}), ...(medicines.length ? { medicines } : {}), ...(routine ? { routine } : {}) } };
}

export const customRuleKey = (id: string): string => `custom-${id}`;
export const isCustomRuleKey = (key: string): boolean => key.startsWith("custom-");

/** La priorité de départ d'un conseil ajouté : de tolérance, un peu plus haut que de confort. */
const CUSTOM_PRIORITY: Record<CustomKind, number> = { TOLERANCE: 70, COMFORT: 55 };

/** Le conseil ajouté, sous la forme que le moteur lit. Même structure qu'une règle du code ; rien n'est contourné. */
export function buildCustomRule(row: Pick<CentralRuleRow, "ruleKey" | "status" | "decidedAt" | "decidedByName">, definition: CustomRuleDefinition): AdviceRule {
  const reasonForPatient = definition.patientReason ?? definition.shortReason;
  return {
    key: row.ruleKey,
    title: definition.title,
    kind: definition.kind,
    version: "1.0",
    validation: row.status === "VALIDATED" && row.decidedAt ? { status: "VALIDATED", validatedAt: row.decidedAt.toISOString(), validatedBy: row.decidedByName ?? "PharmaBoost" } : { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: definition.category,
    atcPrefixes: definition.atcPrefixes,
    therapeuticClasses: definition.therapeuticClasses,
    sideEffectTriggers: [],
    ...(definition.question ? { question: definition.question } : {}),
    basePriority: definition.priority ?? CUSTOM_PRIORITY[definition.kind],
    matchingTags: definition.routine ? [] : definition.matchingTags,
    ...(definition.routine
      ? {
          routine: {
            title: definition.title,
            perStepBrands: true,
            steps: definition.routine.steps.map((step, index) => ({
              key: `etape-${index + 1}`,
              label: step.label,
              matchingTags: step.tags,
              category: step.category,
              brand: step.brand ? brandKey(step.brand) : null,
              ean: step.ean,
              benefit: step.label,
            })),
          },
        }
      : {}),
    ...(definition.preferWords?.length ? { productPrefer: definition.preferWords.map(escapeWord) } : {}),
    ...(definition.exclusions ? { blockedFor: (patient) => exclusionReason(definition.exclusions!, patient) } : {}),
    excludeTags: [],
    benefits: [],
    shortReasonTemplate: definition.shortReason,
    rationaleTemplate: definition.shortReason,
    counterScriptTemplate: definition.counterScript,
    patientReasonTemplate: reasonForPatient,
    clinicalContext: definition.source ? `Conseil ajouté par l'équipe PharmaBoost. Source : ${definition.source}` : "Conseil ajouté par l'équipe PharmaBoost.",
    safetyNotes: definition.safetyNotes,
  };
}

/** Ce que la base garde d'une règle du code modifiée : la modification, lue et revérifiée. `null` : rien, ou illisible. */
export function readOverride(row: Pick<CentralRuleRow, "override">, rule: AdviceRule): RuleEditValues | null {
  const stored = row.override && typeof row.override === "object" ? (row.override as { edit?: unknown }).edit : undefined;
  if (!stored) return null;
  // Revérifiée à chaque lecture : une surcharge abîmée (ou devenue invalide) ne parle pas, la règle du code reprend.
  const parsed = parseRuleEdit({ ...(stored as object), confirmNoExclusions: true }, editContextOf(rule, NO_EXCLUSIONS));
  return parsed.ok ? parsed.value : null;
}

/** La règle du code telle qu'elle parle : modifiée depuis la console si elle l'a été, sinon celle du code. */
export function effectiveCodeRule(rule: AdviceRule, row: CentralRuleRow | undefined): AdviceRule {
  if (!row) return rule;
  const edit = readOverride(row, rule);
  return edit ? applyRuleEdit(rule, edit, row.overrideRevision ?? 1) : rule;
}

/** Les règles du code modifiées depuis la console (et non supprimées), prêtes pour le moteur : elles remplacent celles du code. */
export function overriddenRulesFrom(rows: CentralRuleRow[]): AdviceRule[] {
  const byKey = rowsByKey(rows);
  const rules: AdviceRule[] = [];
  for (const rule of ADVICE_RULES) {
    const row = byKey.get(rule.key);
    if (!row || row.source !== "BUILT_IN" || row.status === "REMOVED") continue;
    const edit = readOverride(row, rule);
    if (edit) rules.push(applyRuleEdit(rule, edit, row.overrideRevision ?? 1));
  }
  return rules;
}

/** Les conseils ajoutés qui sont en ligne (ni supprimés, ni illisibles), prêts pour le moteur. Une définition abîmée est ignorée. */
export function customRulesFrom(rows: CentralRuleRow[]): AdviceRule[] {
  const rules: AdviceRule[] = [];
  for (const row of rows) {
    if (row.source !== "CUSTOM" || row.status === "REMOVED") continue;
    const parsed = parseCustomRuleDefinition(row.definition);
    if (parsed.ok) rules.push(buildCustomRule(row, parsed.value));
  }
  return rules;
}

// ---------------------------------------------------------------------------------------------------------------
// Une association commune
// ---------------------------------------------------------------------------------------------------------------


/** Les erreurs d'une association commune. `null` quand tout va bien. */
export function centralAssociationError(draft: { triggerKey: string; adviceEan: string; sentence: string | null }): string | null {
  if (!draft.triggerKey) return "Choisissez le médicament ou le produit qui déclenche l'association.";
  if (!/^\d{7,14}$/.test(draft.adviceEan)) return "Choisissez le produit à conseiller (il lui faut un code-barres).";
  if (draft.triggerKey === `ean:${draft.adviceEan}`) return "Un produit ne peut pas être associé à lui-même.";
  if (draft.sentence && draft.sentence.length > CENTRAL_SENTENCE_MAX) return `La phrase est trop longue (${CENTRAL_SENTENCE_MAX} caractères au plus).`;
  return null;
}
