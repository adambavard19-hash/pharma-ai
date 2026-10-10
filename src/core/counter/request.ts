/**
 * La demande spontanée au comptoir : un client sans ordonnance qui décrit ce
 * qu'il ressent (« nez bouché et mal à la tête depuis hier, adulte »).
 *
 * Le modèle ne fait qu'une chose : désigner des besoins parmi la liste fermée
 * de `src/core/understanding/needs.ts`, poser les questions à vérifier, et
 * dire si la situation relève du médecin. Il ne nomme aucun produit, aucun
 * médicament. Ce sont ensuite les règles de conseil écrites, le stock de
 * l'officine et le moteur de sécurité qui décident, exactement comme pour une
 * ordonnance : la demande spontanée n'ouvre aucune porte dérobée.
 */
import {
  NEED_DEFINITIONS,
  NEED_KEYS,
  isNeedKey,
  needLabel,
  type IdentifiedNeed,
  type NeedKey,
} from "../understanding";
import { RECOMMENDATION_MIN_RELEVANCE, RECOMMENDATION_MIN_SCORE } from "@/config/constants";
import { chooseAmongEquivalents } from "../ai/engines/tiebreak";
import { declaredContraindicationFor, suggestionVigilances } from "../ai/engines/population-vigilance";
import { matchesAny } from "../ai/engines/product-name";
import { rangeRankFor, type PreferredRangeInput } from "../catalog/preferred-ranges";
import type { ShortDate } from "../stock/expiry";
import type { SuggestionVigilance } from "@/config/vigilances";
import { detectAdviceOpportunities } from "../ai/engines/advice";
import { findCandidateProducts } from "../ai/engines/matching";
import { evaluateOpportunitySafety, evaluateProductSafety } from "../ai/engines/safety";
import { scoreProductForOpportunity } from "../ai/engines/scoring";
import type { CatalogProduct, PatientContext, PharmacyRuleInput, ProductValidationHistory, ScoredRecommendation } from "../ai/types";

// --- Ce que le modèle reçoit et rend ---------------------------------------

export const REQUEST_TOOL_NAME = "comprendre_demande";

export const REQUEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["besoins", "questions", "orientation_medecin", "motif_orientation", "resume"],
  properties: {
    besoins: {
      type: "array",
      description: "Les besoins plausibles, parmi les clés autorisées uniquement. Vide si aucune ne convient.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["cle", "justification", "confiance"],
        properties: {
          cle: { type: "string", enum: [...NEED_KEYS], description: "Une clé de la liste, et rien d'autre." },
          justification: { type: "string", description: "Pourquoi ce besoin est plausible ici, en une phrase, pour le pharmacien." },
          confiance: { type: "number", description: "Entre 0 et 1." },
        },
      },
    },
    questions: {
      type: "array",
      description: "Les questions à poser au client avant de conseiller quoi que ce soit (trois au plus). Vide si tout est déjà dit.",
      items: { type: "string" },
    },
    orientation_medecin: {
      type: "boolean",
      description: "Vrai si un signal d'alerte impose d'orienter vers un médecin plutôt que de conseiller au comptoir.",
    },
    motif_orientation: { type: "string", description: "Le signal d'alerte, en une phrase. Chaîne vide s'il n'y en a pas." },
    resume: { type: "string", description: "La situation en une phrase prudente, pour le pharmacien. Jamais de diagnostic." },
  },
} as const;

export const REQUEST_SYSTEM_PROMPT = `Tu assistes un pharmacien d'officine en France face à un client SANS ordonnance qui décrit ce qu'il ressent.

Tu ne diagnostiques pas, tu ne nommes aucun produit ni aucun médicament. Tu fais trois choses :
1. Désigner les besoins plausibles, UNIQUEMENT parmi les clés autorisées ci-dessous. Une clé hors liste est une faute. Aucune clé si rien ne convient.
2. Lister les questions que le pharmacien doit poser avant de conseiller (âge si absent, grossesse ou allaitement chez une femme, durée, fièvre, traitements en cours, antécédents), trois au plus, et seulement celles qui changent le conseil.
3. Dire si un signal d'alerte impose d'orienter vers un médecin : fièvre élevée ou qui dure plus de trois jours, sang, douleur thoracique, gêne respiratoire, nourrisson de moins de trois mois, symptômes qui durent au-delà de ce qu'un conseil de comptoir couvre, altération de l'état général, grossesse avec symptômes inquiétants. Tu n'inventes pas d'alerte ; tu ne tais pas celles qui sont là.

Clés autorisées :
${NEED_KEYS.map((key) => `- ${key} : ${NEED_DEFINITIONS[key].label}. ${NEED_DEFINITIONS[key].description}`).join("\n")}

Réponds en français, sobrement.`;

export type RequestUnderstandingInput = {
  text: string;
  patient: { ageYears: number | null; isPregnant: boolean | null; isBreastfeeding: boolean | null; currentTreatments: string[] };
};

export function buildRequestUserPrompt(input: RequestUnderstandingInput): string {
  const context = [
    input.patient.ageYears !== null ? `âge : ${input.patient.ageYears} ans` : "âge : non précisé",
    input.patient.isPregnant ? "femme enceinte" : null,
    input.patient.isBreastfeeding ? "allaitement en cours" : null,
    input.patient.currentTreatments.length > 0 ? `traitements en cours : ${input.patient.currentTreatments.join(", ")}` : null,
  ].filter(Boolean);
  return `Demande du client : « ${input.text.trim()} »\nContexte connu : ${context.join(" ; ")}.`;
}

export type RequestUnderstanding = {
  needs: IdentifiedNeed[];
  questions: string[];
  referToDoctor: boolean;
  referReason: string | null;
  summary: string | null;
  providerId: string;
  model: string | null;
  warnings: string[];
};

/** La réponse brute du modèle, avant validation. */
export type ClaimedRequestUnderstanding = {
  besoins?: { cle?: unknown; justification?: unknown; confiance?: unknown }[];
  questions?: unknown;
  orientation_medecin?: unknown;
  motif_orientation?: unknown;
  resume?: unknown;
};

const MIN_CONFIDENCE = 0.5;
const MAX_NEEDS = 4;
const MAX_QUESTIONS = 3;

/** Le domaine relit ce que le modèle affirme ; une clé inconnue ne passe jamais. */
export function validateRequestUnderstanding(
  claimed: ClaimedRequestUnderstanding,
  meta: { providerId: string; model: string | null },
): RequestUnderstanding {
  const warnings: string[] = [];
  const needs: IdentifiedNeed[] = [];
  for (const item of Array.isArray(claimed.besoins) ? claimed.besoins : []) {
    const key = typeof item.cle === "string" ? item.cle : "";
    if (!isNeedKey(key)) {
      warnings.push(`Besoin inconnu écarté : « ${key || "?"} ».`);
      continue;
    }
    const confidence = typeof item.confiance === "number" && Number.isFinite(item.confiance) ? Math.max(0, Math.min(1, item.confiance)) : 0;
    if (confidence < MIN_CONFIDENCE) {
      warnings.push(`Besoin ${key} écarté : confiance ${Math.round(confidence * 100)} %.`);
      continue;
    }
    if (needs.some((need) => need.key === key)) continue;
    needs.push({ key, lineIndexes: [0], justification: typeof item.justification === "string" ? item.justification.trim().slice(0, 300) : "", confidence });
  }
  needs.sort((a, b) => b.confidence - a.confidence);
  const questions = (Array.isArray(claimed.questions) ? claimed.questions : [])
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .map((q) => q.trim().slice(0, 200))
    .slice(0, MAX_QUESTIONS);
  const referToDoctor = claimed.orientation_medecin === true;
  const reason = typeof claimed.motif_orientation === "string" ? claimed.motif_orientation.trim().slice(0, 300) : "";
  return {
    needs: needs.slice(0, MAX_NEEDS),
    questions,
    referToDoctor,
    referReason: referToDoctor ? reason || "Signal d'alerte signalé par le modèle, sans motif." : null,
    summary: typeof claimed.resume === "string" && claimed.resume.trim() ? claimed.resume.trim().slice(0, 300) : null,
    providerId: meta.providerId,
    model: meta.model,
    warnings,
  };
}

// --- Sans modèle : des mots-clés, et on le dit ------------------------------

const KEYWORDS: { need: NeedKey; patterns: RegExp[] }[] = [
  { need: "NASAL_CONGESTION", patterns: [/nez (bouch|qui coule|pris)/i, /\brhume\b/i, /rhinite/i, /\bmorve\b/i] },
  { need: "SORE_THROAT", patterns: [/gorge/i, /angine/i, /aval(e|er)/i] },
  { need: "COUGH_COMFORT", patterns: [/\btou(x|sse)/i] },
  { need: "FEVER_MONITORING", patterns: [/fi[eè]vre/i, /temp[ée]rature/i, /\b(38|39|40)\b/] },
  { need: "REHYDRATION", patterns: [/diarrh/i, /vomi/i, /gastro/i, /selles liquides/i] },
  { need: "ALLERGIC_EYE_IRRITATION", patterns: [/yeux/i, /\b[oœ]il\b/i, /conjonctiv/i] },
  { need: "ANTIBIOTIC_DIGESTIVE_TOLERANCE", patterns: [/antibio/i] },
  { need: "DRY_MOUTH", patterns: [/bouche s[eè]che/i, /salive/i] },
  { need: "FATIGUE_CRAMPS", patterns: [/fatigu/i, /crampe/i, /épuis/i] },
  { need: "PHOTOSENSITIVITY", patterns: [/soleil/i, /coup de soleil/i, /photosens/i] },
  { need: "SKIN_DRYNESS", patterns: [/peau s[eè]che/i, /s[ée]cheresse/i, /tiraill/i, /d[ée]mange/i] },
  { need: "GASTRIC_DISCOMFORT", patterns: [/estomac/i, /br[uû]lure/i, /reflux/i, /aigreur/i, /digestion/i] },
  { need: "CONSTIPATION", patterns: [/constip/i, /transit/i] },
  { need: "HERPES_LESION_CARE", patterns: [/herp[eè]s/i, /bouton de fi[eè]vre/i, /\bzona\b/i] },
];

const RED_FLAGS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bsang\b|saign/i, reason: "Présence de sang signalée." },
  { pattern: /(difficult|g[eê]n)[ée]? (à|a|pour) respirer|essouffl|respir/i, reason: "Gêne respiratoire signalée." },
  { pattern: /poitrine|thora/i, reason: "Douleur thoracique signalée." },
  { pattern: /(depuis|plus de|ça fait) .*(semaine|10 jours|15 jours|mois)/i, reason: "Symptômes qui durent au-delà d'un conseil de comptoir." },
  { pattern: /nourrisson|b[ée]b[ée]|\b[0-2] mois\b/i, reason: "Nourrisson : l'avis médical prime." },
];

/**
 * Sans modèle branché, les besoins se lisent dans les mots du client. C'est
 * moins fin, et la trace le dit : `providerId` vaut « mots-clés ».
 */
export function fallbackRequestUnderstanding(input: RequestUnderstandingInput): RequestUnderstanding {
  const text = input.text;
  const needs: IdentifiedNeed[] = [];
  for (const entry of KEYWORDS) {
    const hit = entry.patterns.find((pattern) => pattern.test(text));
    if (!hit) continue;
    const word = text.match(hit)?.[0] ?? "";
    needs.push({ key: entry.need, lineIndexes: [0], justification: `Mot-clé « ${word.trim()} » dans la demande.`, confidence: 0.6 });
  }
  const flag = RED_FLAGS.find((entry) => entry.pattern.test(text));
  const questions: string[] = [];
  if (input.patient.ageYears === null) questions.push("Quel âge a la personne concernée ?");
  if (input.patient.isPregnant === null) questions.push("S'il s'agit d'une femme : grossesse ou allaitement en cours ?");
  questions.push("Depuis combien de temps, et y a-t-il de la fièvre ?");
  return {
    needs: needs.slice(0, MAX_NEEDS),
    questions: questions.slice(0, MAX_QUESTIONS),
    referToDoctor: Boolean(flag),
    referReason: flag?.reason ?? null,
    summary: needs.length > 0 ? `Lecture par mots-clés : ${needs.map((need) => needLabel(need.key).toLowerCase()).join(", ")}.` : "Aucun besoin reconnu dans les mots de la demande.",
    providerId: "mots-clés",
    model: null,
    warnings: ["Aucun modèle branché : les besoins ont été lus dans les mots de la demande, sans compréhension du contexte."],
  };
}

// --- Du besoin au produit : les mêmes règles que pour une ordonnance -------

export type RequestProposal = {
  productId: string;
  name: string;
  brand: string | null;
  salePriceCents: number;
  stockQuantity: number;
  imageUrl: string | null;
  /** Le titre de la règle de conseil qui a parlé. */
  title: string;
  needKey: NeedKey | null;
  shortReason: string;
  counterScript: string;
  patientReason: string;
  precautions: string[];
  /** La question écrite dans la règle, à poser avant de proposer. */
  question: string | null;
  totalScore: number;
  /** Vigilances patient à afficher (grossesse, asthme…), jamais remises au client. */
  vigilances?: SuggestionVigilance[];
  /** Date courte de la référence retenue, pour information. */
  shortDate?: ShortDate | null;
};

export type RequestPipelineResult = {
  proposals: RequestProposal[];
  /** Les questions écrites dans les règles, dédoublonnées. */
  ruleQuestions: string[];
  /** Pourquoi rien, quand il n'y a rien : pour le comptoir, pas pour le patient. */
  notes: string[];
  blocked: string[];
};

const MAX_PROPOSALS = 4;

/**
 * Pure : aucune base, aucun appel. Les besoins passent par les règles de
 * conseil (`needTriggers`), les candidats par le stock, chaque référence par
 * le moteur de sécurité et le score — comme pour une ordonnance.
 */
export function runRequestPipeline(params: {
  understanding: RequestUnderstanding;
  patient: PatientContext;
  catalog: CatalogProduct[];
  rules: PharmacyRuleInput[];
  history: ProductValidationHistory;
  stockConfigured: boolean;
  /** Gammes privilégiées : départage de références équivalentes, jamais le score. */
  preferredRanges?: PreferredRangeInput[];
}): RequestPipelineResult {
  const notes: string[] = [];
  const blocked: string[] = [];
  if (params.understanding.needs.length === 0) {
    return { proposals: [], ruleQuestions: [], notes: ["Aucun besoin reconnu : rien n'est proposé."], blocked };
  }
  // Une ligne fictive porte la demande : c'est elle que les règles citent à
  // la place du médicament. « Avec ce que vous décrivez, … » se lit au comptoir.
  const opportunities = detectAdviceOpportunities({
    drugs: [{ lineIndex: 0, drugName: "ce que vous décrivez", knowledge: null, officialName: "demande spontanée au comptoir", officialSubstance: null }],
    patient: params.patient,
    needs: params.understanding.needs,
  });
  if (opportunities.length === 0) {
    notes.push("Les besoins reconnus ne correspondent à aucune règle de conseil écrite.");
    return { proposals: [], ruleQuestions: [], notes, blocked };
  }
  const opportunitySafety = evaluateOpportunitySafety(opportunities, params.patient, []);
  const productSafety = evaluateProductSafety(params.catalog, params.patient, []);
  // Les contre-indications déclarées par l'officine sur ses fiches, comme pour une ordonnance.
  for (const product of params.catalog) {
    if (!productSafety.blockedProductIds.has(product.id) && declaredContraindicationFor(product, params.patient)) productSafety.blockedProductIds.add(product.id);
  }
  const eligible = opportunities.filter((opportunity) => {
    const isBlocked = opportunity.isBlocked || opportunitySafety.blockedOpportunityKeys.has(opportunity.key);
    if (isBlocked) blocked.push(`${opportunity.title} : ${opportunity.blockReason ?? opportunitySafety.findings.find((f) => f.subjectId === opportunity.key)?.message ?? "écarté par le moteur de sécurité."}`);
    return !isBlocked;
  });
  const safeCatalog = params.catalog.filter((product) => !productSafety.blockedProductIds.has(product.id));
  const needByKey = new Map(params.understanding.needs.map((need) => [need.key, need]));

  const proposals: RequestProposal[] = [];
  for (const opportunity of eligible) {
    const candidates = findCandidateProducts({ opportunity, catalog: safeCatalog });
    if (candidates.length === 0) {
      const outOfStock = findCandidateProducts({ opportunity, catalog: safeCatalog, includeOutOfStock: true }).filter((c) => c.product.stockQuantity <= 0);
      notes.push(
        outOfStock.length > 0
          ? `« ${opportunity.title} » : ${outOfStock.length} référence(s) adaptée(s) mais en rupture (${outOfStock.slice(0, 3).map((c) => c.product.name).join(", ")}).`
          : params.stockConfigured
            ? `« ${opportunity.title} » : aucune référence de l'officine ne correspond.`
            : `« ${opportunity.title} » : le stock de l'officine n'est pas configuré.`,
      );
      continue;
    }
    const valid: ScoredRecommendation[] = [];
    for (const candidate of candidates) {
      const scored = scoreProductForOpportunity({ product: candidate.product, opportunity, patient: params.patient, rules: params.rules, history: params.history, blockedProductIds: productSafety.blockedProductIds });
      if (!scored || scored.totalScore < RECOMMENDATION_MIN_SCORE || scored.breakdown.relevance < RECOMMENDATION_MIN_RELEVANCE) continue;
      scored.vigilances = suggestionVigilances(opportunity.populations ?? [], candidate.product, params.patient);
      scored.shortDate = candidate.product.shortDate ?? null;
      valid.push(scored);
    }
    // Même règle que pour une ordonnance : la clinique désigne la meilleure
    // référence, les préférences ne départagent que des équivalentes.
    const catalogById = new Map(candidates.map((c) => [c.product.id, c.product]));
    const best: ScoredRecommendation | null = valid.length
      ? chooseAmongEquivalents(valid, {
          formulaRank: (item) => {
            const name = catalogById.get(item.productId)?.name ?? "";
            const prefer = opportunity.productPrefer ?? [];
            const index = prefer.findIndex((pattern) => matchesAny([pattern], name));
            return index === -1 ? prefer.length : index;
          },
          rangeRank: (item) => {
            const product = catalogById.get(item.productId);
            return product ? rangeRankFor(product, opportunity.category ?? null, params.preferredRanges ?? []) : null;
          },
          shortDate: (item) => catalogById.get(item.productId)?.shortDate ?? null,
          hasChallenge: (item) => Boolean(catalogById.get(item.productId)?.activeChallenge),
        }).chosen
      : null;
    if (!best) {
      notes.push(`« ${opportunity.title} » : les références candidates n'atteignent pas le seuil de pertinence.`);
      continue;
    }
    const product = params.catalog.find((p) => p.id === best!.productId)!;
    const need = opportunity.needKey ? needByKey.get(opportunity.needKey as NeedKey) : undefined;
    proposals.push({
      productId: product.id,
      name: product.name,
      brand: product.brand,
      salePriceCents: product.salePriceCents,
      stockQuantity: product.stockQuantity,
      imageUrl: product.imageUrl,
      title: opportunity.title,
      needKey: (opportunity.needKey as NeedKey | null) ?? null,
      // La raison courte nomme le besoin et ce que le modèle a compris : c'est
      // ce que le pharmacien lit, jamais le patient.
      shortReason: need ? `${needLabel(need.key)} — ${need.justification || opportunity.shortReason}` : opportunity.shortReason,
      counterScript: best.counterScript,
      patientReason: best.patientReason,
      precautions: best.precautions,
      question: opportunity.question ?? null,
      totalScore: best.totalScore,
      vigilances: best.vigilances ?? [],
      shortDate: best.shortDate ?? null,
    });
  }
  proposals.sort((a, b) => b.totalScore - a.totalScore);
  // Une même référence peut répondre à deux besoins (des pastilles pour la
  // gorge et pour la toux) : on ne la propose qu'une fois, pour le besoin où
  // elle est la plus pertinente.
  const seen = new Set<string>();
  const unique = proposals.filter((proposal) => (seen.has(proposal.productId) ? false : (seen.add(proposal.productId), true)));
  // Les questions écrites dans les règles supposent un besoin déduit d'un
  // traitement (« a-t-il aussi le nez bouché ? ») ; ici le client vient de le
  // dire. Elles restent portées par chaque proposition, pas répétées en tête.
  const ruleQuestions: string[] = [];
  return { proposals: unique.slice(0, MAX_PROPOSALS), ruleQuestions, notes, blocked };
}
