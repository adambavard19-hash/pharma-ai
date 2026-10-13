import type { AdviceRule } from "./engines/advice";
import type { PatientContext, ProductCategoryCode } from "./types";
import { PRODUCT_CATEGORIES } from "@/config/catalog";
import { ADVICE_VOCABULARY } from "@/core/catalog/product-vocabulary";
import { EDIT_LIMITS, type RuleEditValues, type RuleExclusions } from "./central-advice-edit-constants";
export { EDIT_FIELD_LABELS, EDIT_LIMITS, NO_EXCLUSIONS, type RuleEditValues, type RuleExclusions } from "./central-advice-edit-constants";

/**
 * MODIFIER un conseil depuis la console de PharmaBoost (demande du fondateur, 13 oct. 2026).
 *
 * Une règle du code se modifie sans toucher au code : la modification est gardée en base (une « surcharge ») et le moteur
 * l'applique à toutes les pharmacies, à la place des textes, déclencheurs, produits et exclusions de la règle d'origine. Ce
 * qui ne change JAMAIS, quelle que soit la modification :
 *
 *  • les exclusions écrites dans le code (`blockedFor`) restent appliquées — celles de la console s'y AJOUTENT ;
 *  • les motifs du code qui écartent une référence (`productExclude`, ceux qui dépendent du patient) restent ;
 *  • le moteur de sécurité, en aval, écarte toujours un médicament sur ordonnance, une contre-indication, un doublon de
 *    substance, un produit en rupture : une modification ne choisit qu'un BESOIN (catégorie, étiquettes, mots préférés), jamais
 *    un produit qui passerait outre ces garde-fous.
 *
 * Le conseil décrit un besoin (« collyre anti-allergique »), pas une gamme : les étiquettes trouvent, dans le stock de chaque
 * pharmacie, ce qui répond à ce besoin ; les mots préférés (une marque, « sans alcool ») ne font que passer une référence
 * devant ses équivalentes quand la pharmacie l'a.
 *
 * Module pur : aucune base, aucune horloge.
 */

const clean = (value: unknown): string => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "");
const cleanList = (value: unknown): string[] => (Array.isArray(value) ? value.map(clean).filter((item) => item !== "") : []);
const ATC_PATTERN = /^[A-Z](?:\d{2}(?:[A-Z](?:[A-Z](?:\d{2})?)?)?)?$/;
const PLACEHOLDER = /\{([a-z]+)\}/g;

/** Sans accents, en minuscules : la forme sous laquelle le moteur lit le nom d'un produit. */
export const plainText = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** Un mot tapé par la pharmacienne, rendu inoffensif dans un motif : il ne peut que se lire tel quel. */
export const escapeWord = (word: string): string => plainText(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function placeholderError(label: string, text: string, allowed: string[]): string | null {
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (!allowed.includes(match[1])) return `${label} : « {${match[1]}} » n'est pas remplaçable (seuls ${allowed.map((name) => `{${name}}`).join(" et ")} le sont).`;
  }
  return null;
}

/** Les exclusions de la console qui comptent (un âge, une grossesse, un allaitement, un mot). */
export const hasExclusions = (exclusions: RuleExclusions): boolean => exclusions.minAgeYears !== null || exclusions.pregnancy || exclusions.breastfeeding || exclusions.conditions.length > 0;

/** Les exclusions de la console, en clair (« Pas avant 12 ans », « Grossesse »…). */
export function describeExclusions(exclusions: RuleExclusions): string[] {
  return [
    ...(exclusions.minAgeYears !== null ? [`Pas avant ${exclusions.minAgeYears} ans`] : []),
    ...(exclusions.pregnancy ? ["Grossesse"] : []),
    ...(exclusions.breastfeeding ? ["Allaitement"] : []),
    ...exclusions.conditions.map((condition) => `Patient qui déclare : ${condition}`),
  ];
}

/**
 * La raison d'écarter le conseil pour ce patient selon les exclusions de la console, ou `null`. Un âge inconnu n'écarte pas
 * (comme dans le code : on ne suppose pas, on constate) ; une grossesse, un allaitement ou un mot déclaré écartent.
 */
export function exclusionReason(exclusions: RuleExclusions, patient: PatientContext): string | null {
  if (exclusions.minAgeYears !== null && patient.ageYears !== null && patient.ageYears < exclusions.minAgeYears) return `Conseil réservé à partir de ${exclusions.minAgeYears} ans (décision de l'équipe PharmaBoost).`;
  if (exclusions.pregnancy && patient.isPregnant === true) return "Grossesse : ce conseil est écarté (décision de l'équipe PharmaBoost).";
  if (exclusions.breastfeeding && patient.isBreastfeeding === true) return "Allaitement : ce conseil est écarté (décision de l'équipe PharmaBoost).";
  const declared = [...patient.chronicConditions, ...patient.allergies].map(plainText);
  const hit = exclusions.conditions.find((condition) => declared.some((text) => text.includes(plainText(condition))));
  return hit ? `${hit} déclaré : ce conseil est écarté (décision de l'équipe PharmaBoost).` : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Ce que la console montre et pré-remplit
// ---------------------------------------------------------------------------------------------------------------

/** Les valeurs modifiables d'une règle telle qu'elle parle aujourd'hui (le formulaire part de là). */
export function editValuesOf(rule: AdviceRule, extra: { preferWords?: string[]; exclusions?: RuleExclusions; source?: string | null } = {}): RuleEditValues {
  return {
    title: rule.title,
    counterScript: rule.counterScriptTemplate,
    patientReason: rule.patientReasonTemplate,
    shortReason: rule.shortReasonTemplate,
    question: rule.question ?? null,
    atcPrefixes: [...rule.atcPrefixes],
    therapeuticClasses: [...rule.therapeuticClasses],
    category: rule.category,
    matchingTags: [...rule.matchingTags],
    preferWords: extra.preferWords ?? [],
    exclusions: extra.exclusions ?? { minAgeYears: null, pregnancy: false, breastfeeding: false, conditions: [] },
    priority: rule.basePriority,
    safetyNotes: [...rule.safetyNotes],
    source: extra.source !== undefined ? extra.source : rule.clinicalContext,
  };
}

/**
 * Les exclusions ÉCRITES DANS LE CODE, lues en clair : la règle est interrogée avec des patients types (âges, grossesse,
 * allaitement, reins, foie, quelques maladies déclarées) et l'on garde ses propres raisons. Elles s'appliquent toujours ; la
 * console les montre, elle ne peut pas les retirer.
 */
export function describeCodeExclusions(rule: Pick<AdviceRule, "blockedFor">): string[] {
  if (!rule.blockedFor) return [];
  const base: PatientContext = { patientId: null, ageYears: 40, sex: "UNSPECIFIED", isPregnant: false, isBreastfeeding: false, renalImpairment: false, hepaticImpairment: false, allergies: [], chronicConditions: [], currentTreatments: [], hasAdviceConsent: false };
  const probe = (patient: Partial<PatientContext>) => {
    try {
      return rule.blockedFor!({ ...base, ...patient });
    } catch {
      return null;
    }
  };
  if (probe({})) return [];
  const reasons = new Set<string>();
  let youngest: number | null = null;
  for (let age = 0; age < 18; age += 1) if (probe({ ageYears: age })) youngest = age;
  if (youngest !== null) reasons.add(`Pas avant ${youngest + 1} ans`);
  for (let age = 60; age <= 100; age += 5) {
    if (probe({ ageYears: age })) {
      reasons.add(`Pas à partir de ${age} ans`);
      break;
    }
  }
  const named: [Partial<PatientContext>, string][] = [
    [{ isPregnant: true, sex: "FEMALE" }, "Grossesse"],
    [{ isBreastfeeding: true, sex: "FEMALE" }, "Allaitement"],
    [{ renalImpairment: true }, "Insuffisance rénale"],
    [{ hepaticImpairment: true }, "Insuffisance hépatique"],
  ];
  for (const [patient, label] of named) {
    const reason = probe(patient);
    if (reason) reasons.add(`${label} — ${reason}`);
  }
  for (const condition of ["asthme", "épilepsie", "immunodépression", "diabète", "hypertension", "insuffisance cardiaque", "allergie à l'aspirine", "ulcère"]) {
    const reason = probe({ chronicConditions: [condition], allergies: condition.startsWith("allergie") ? [condition] : [] });
    if (reason) reasons.add(reason);
  }
  return [...reasons];
}

// ---------------------------------------------------------------------------------------------------------------
// Lire et vérifier une modification
// ---------------------------------------------------------------------------------------------------------------

export type EditContext = {
  /** La règle d'origine porte `{product}` dans sa phrase de comptoir : la modification doit le garder. */
  requiresProduct: boolean;
  /** Les produits d'une routine (plusieurs étapes) restent ceux du code : la catégorie et les étiquettes ne sont pas lues. */
  hasRoutine: boolean;
  /** Les exclusions de la console avant cette modification. */
  previousExclusions: RuleExclusions;
  /** La règle se déclenche aussi autrement (un besoin compris, un effet indésirable) : ses familles peuvent rester vides. */
  otherTriggers?: boolean;
};

/** Le contexte de vérification d'une modification, tiré de la règle d'origine. */
export function editContextOf(rule: AdviceRule, previousExclusions: RuleExclusions): EditContext {
  return { requiresProduct: rule.counterScriptTemplate.includes("{product}"), hasRoutine: Boolean(rule.routine), previousExclusions, otherTriggers: (rule.needTriggers?.length ?? 0) > 0 || rule.sideEffectTriggers.length > 0 };
}

/**
 * Lit et vérifie ce que la console envoie. Les messages sont ceux que la pharmacienne lit. Retirer TOUTES les exclusions que
 * la console avait posées demande une confirmation explicite (`confirmNoExclusions`).
 */
export function parseRuleEdit(raw: unknown, context: EditContext): { ok: true; value: RuleEditValues } | { ok: false; error: string; needsConfirmation?: boolean } {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const L = EDIT_LIMITS;
  const title = clean(input.title);
  if (title.length < 3) return { ok: false, error: "Donnez un nom au conseil (3 caractères au moins)." };
  if (title.length > L.title) return { ok: false, error: `Le nom est trop long (${L.title} caractères au plus).` };

  const counterScript = clean(input.counterScript);
  if (counterScript.length < 10) return { ok: false, error: "Écrivez ce que dit le pharmacien (10 caractères au moins)." };
  if (counterScript.length > L.script) return { ok: false, error: `La phrase du pharmacien est trop longue (${L.script} caractères au plus).` };
  if (context.requiresProduct && !counterScript.includes("{product}")) return { ok: false, error: "La phrase du pharmacien doit garder {product} : c'est là que s'écrit le produit choisi dans le stock." };
  const scriptProblem = placeholderError("La phrase du pharmacien", counterScript, ["drug", "product"]);
  if (scriptProblem) return { ok: false, error: scriptProblem };

  const patientReason = clean(input.patientReason);
  if (patientReason.length < 10) return { ok: false, error: "Écrivez la phrase pour le patient (10 caractères au moins)." };
  if (patientReason.length > L.script) return { ok: false, error: `La phrase pour le patient est trop longue (${L.script} caractères au plus).` };
  const patientProblem = placeholderError("La phrase pour le patient", patientReason, ["drug", "product"]);
  if (patientProblem) return { ok: false, error: patientProblem };

  const shortReason = clean(input.shortReason);
  if (shortReason.length < 10) return { ok: false, error: "Écrivez la raison affichée en une ligne (10 caractères au moins)." };
  if (shortReason.length > L.reason) return { ok: false, error: `La raison affichée est trop longue (${L.reason} caractères au plus).` };
  const reasonProblem = placeholderError("La raison affichée", shortReason, ["drug"]);
  if (reasonProblem) return { ok: false, error: reasonProblem };

  const question = clean(input.question) || null;
  if (question && question.length > L.question) return { ok: false, error: `La question est trop longue (${L.question} caractères au plus).` };

  const atcPrefixes = [...new Set(cleanList(input.atcPrefixes).map((code) => code.toUpperCase().replace(/\s+/g, "")))];
  for (const code of atcPrefixes) if (!ATC_PATTERN.test(code)) return { ok: false, error: `« ${code} » n'est pas un code de famille valide (exemples : J01, N02BE, R06AE07).` };
  const therapeuticClasses = [...new Set(cleanList(input.therapeuticClasses))];
  if (atcPrefixes.length === 0 && therapeuticClasses.length === 0 && !context.otherTriggers) return { ok: false, error: "Dites ce qui déclenche le conseil : un médicament, une famille (code ATC) ou une classe." };
  if (atcPrefixes.length > L.atc || therapeuticClasses.length > L.classes) return { ok: false, error: "Trop de déclencheurs : restez précis." };
  if (therapeuticClasses.some((label) => label.length < 4 || label.length > 60)) return { ok: false, error: "Une classe thérapeutique s'écrit en 4 à 60 caractères." };

  const category = clean(input.category) as ProductCategoryCode;
  if (!PRODUCT_CATEGORIES.includes(category)) return { ok: false, error: "Choisissez le type de produit à proposer." };
  const matchingTags = [...new Set(cleanList(input.matchingTags).map((tag) => tag.toLowerCase()))];
  if (!context.hasRoutine && matchingTags.length === 0) return { ok: false, error: "Choisissez au moins un mot qui décrit le besoin (étiquette du produit à proposer)." };
  if (matchingTags.length > L.tags) return { ok: false, error: `${L.tags} étiquettes au plus (${matchingTags.length} choisies).` };
  const unknownTag = matchingTags.find((tag) => !ADVICE_VOCABULARY.includes(tag));
  if (unknownTag) return { ok: false, error: `L'étiquette « ${unknownTag} » n'existe pas : choisissez dans la liste.` };
  const preferWords = [...new Set(cleanList(input.preferWords))];
  if (preferWords.length > L.preferWords || preferWords.some((word) => word.length < 2 || word.length > L.preferWord)) return { ok: false, error: `${L.preferWords} mots préférés au plus, de 2 à ${L.preferWord} caractères.` };

  const rawExclusions = (input.exclusions && typeof input.exclusions === "object" ? input.exclusions : {}) as Record<string, unknown>;
  const ageText = clean(String(rawExclusions.minAgeYears ?? ""));
  let minAgeYears: number | null = null;
  if (ageText !== "" && ageText !== "null") {
    const age = Number(ageText);
    if (!Number.isInteger(age) || age < 1 || age > 99) return { ok: false, error: "L'âge minimum s'écrit en années entières, de 1 à 99 (vide : aucun)." };
    minAgeYears = age;
  }
  const conditions = [...new Set(cleanList(rawExclusions.conditions))];
  if (conditions.length > L.conditions || conditions.some((item) => item.length < 3 || item.length > 60)) return { ok: false, error: `${L.conditions} autres exclusions au plus, de 3 à 60 caractères.` };
  const exclusions: RuleExclusions = { minAgeYears, pregnancy: rawExclusions.pregnancy === true, breastfeeding: rawExclusions.breastfeeding === true, conditions };
  if (hasExclusions(context.previousExclusions) && !hasExclusions(exclusions) && input.confirmNoExclusions !== true) {
    return { ok: false, needsConfirmation: true, error: "Vous retirez toutes les personnes exclues de ce conseil. Cochez « Je confirme : plus aucune exclusion ajoutée » pour enregistrer." };
  }

  const priority = Number(input.priority);
  if (!Number.isInteger(priority) || priority < 1 || priority > 100) return { ok: false, error: "La priorité s'écrit de 1 (rarement mis en avant) à 100 (toujours en tête)." };
  const safetyNotes = cleanList(input.safetyNotes);
  if (safetyNotes.length > L.notes || safetyNotes.some((note) => note.length > L.note)) return { ok: false, error: `${L.notes} précautions au plus, de ${L.note} caractères.` };
  const source = clean(input.source) || null;
  if (source && source.length > L.source) return { ok: false, error: `La source est trop longue (${L.source} caractères au plus).` };

  return { ok: true, value: { title, counterScript, patientReason, shortReason, question, atcPrefixes, therapeuticClasses, category, matchingTags, preferWords, exclusions, priority, safetyNotes, source } };
}

/** La version d'une règle du code modifiée depuis la console : sa propre version, pour qu'une ancienne validation se relise. */
export const editedVersion = (baseVersion: string, revision: number): string => `${baseVersion}-modif${revision}`;

/**
 * La règle du code telle que la console l'a modifiée, prête pour le moteur. Même clé : elle REMPLACE la règle d'origine
 * (detectAdviceOpportunities). Les garde-fous du code restent : `blockedFor` d'abord, puis les exclusions de la console ;
 * `productExclude`, `productExcludeFor`, `blockedWhenSaleHas`, `verifiedMedicinesOnly`, `nameGate`, `excludeAtcPrefixes` ne
 * changent pas.
 */
export function applyRuleEdit(rule: AdviceRule, edit: RuleEditValues, revision: number): AdviceRule {
  const codeBlock = rule.blockedFor;
  const preferred = edit.preferWords.map(escapeWord).filter(Boolean);
  return {
    ...rule,
    title: edit.title,
    version: editedVersion(rule.version, revision),
    validation: { status: "PENDING" },
    counterScriptTemplate: edit.counterScript,
    patientReasonTemplate: edit.patientReason,
    shortReasonTemplate: edit.shortReason,
    ...(edit.question ? { question: edit.question } : { question: undefined }),
    atcPrefixes: edit.atcPrefixes,
    therapeuticClasses: edit.therapeuticClasses,
    ...(rule.routine ? {} : { category: edit.category as ProductCategoryCode, matchingTags: edit.matchingTags }),
    productPrefer: [...preferred, ...(rule.productPrefer ?? [])],
    basePriority: edit.priority,
    safetyNotes: edit.safetyNotes,
    clinicalContext: edit.source ?? rule.clinicalContext,
    blockedFor: (patient) => codeBlock?.(patient) ?? exclusionReason(edit.exclusions, patient),
  };
}

/** Les libellés des champs qui ont changé entre deux versions (pour l'historique). */
export function changedEditFields(before: RuleEditValues, after: RuleEditValues, labels: Record<keyof RuleEditValues, string>): string[] {
  return (Object.keys(labels) as (keyof RuleEditValues)[]).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map((key) => labels[key]);
}
