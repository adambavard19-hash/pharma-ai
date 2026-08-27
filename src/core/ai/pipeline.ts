import { ENGINE_VERSION, MAX_RECOMMENDATIONS_PER_PRESCRIPTION, RECOMMENDATION_MIN_SCORE } from "@/config/constants";
import { detectAdviceOpportunities } from "./engines/advice";
import { findCandidateProducts } from "./engines/matching";
import {
  evaluateKnowledgeCoverage,
  evaluateOpportunitySafety,
  evaluateProductSafety,
} from "./engines/safety";
import { scoreProductForOpportunity } from "./engines/scoring";
import type {
  AnalysisResult,
  CatalogProduct,
  DrugKnowledge,
  PatientContext,
  PharmacyRuleInput,
  PipelineStageName,
  PipelineStageTrace,
  ProductValidationHistory,
  SafetyFindingResult,
  ScoredRecommendation,
  TreatmentExplanationResult,
} from "./types";

/**
 * ORCHESTRATEUR DU MOTEUR PHARMA.AI
 *
 * L'ordre des étapes est structurel, pas conventionnel : chaque étape ne reçoit
 * que la sortie de la précédente. Il est donc impossible qu'une considération
 * commerciale influence la sécurité ou la pertinence, puisque l'étape
 * commerciale n'intervient qu'en toute fin de chaîne, sur un ensemble déjà
 * filtré.
 *
 *   SÉCURITÉ → COMPRÉHENSION → PERTINENCE → APPARIEMENT STOCK → SCORE →
 *   OPTIMISATION COMMERCIALE AUTORISÉE
 *
 * Cette fonction est PURE : elle ne lit ni base de données ni API. Elle est
 * donc directement testable (voir src/core/ai/__tests__/pipeline.test.ts).
 */

export type PipelineInput = {
  lines: {
    lineIndex: number;
    drugName: string | null;
    posology: string | null;
    durationDays: number | null;
    confirmed: boolean;
  }[];
  knowledge: Map<string, DrugKnowledge | null>;
  patient: PatientContext;
  catalog: CatalogProduct[];
  rules: PharmacyRuleInput[];
  history: ProductValidationHistory;
  /** Explications produites par l'`AIProvider` à partir du référentiel. */
  explanations: TreatmentExplanationResult[];
  /** Signaux remontés par l'étape d'extraction. */
  extractionFindings: SafetyFindingResult[];
  usedSimulatedProviders: boolean;
  maxRecommendations?: number;
};

type StageRecorder = {
  trace: PipelineStageTrace[];
  run: <T>(
    stage: PipelineStageName,
    label: string,
    inputCount: number,
    fn: () => { output: T; count: number; notes?: string[]; status?: PipelineStageTrace["status"] },
  ) => T;
};

function createRecorder(): StageRecorder {
  const trace: PipelineStageTrace[] = [];
  return {
    trace,
    run(stage, label, inputCount, fn) {
      const startedAt = Date.now();
      const result = fn();
      trace.push({
        stage,
        label,
        status: result.status ?? "OK",
        durationMs: Date.now() - startedAt,
        inputCount,
        outputCount: result.count,
        notes: result.notes ?? [],
      });
      return result.output;
    },
  };
}

export function runAnalysisPipeline(input: PipelineInput): AnalysisResult {
  const recorder = createRecorder();
  const blockedReasons: string[] = [];
  const maxRecommendations =
    input.maxRecommendations ?? MAX_RECOMMENDATIONS_PER_PRESCRIPTION;

  // Seules les lignes confirmées par un professionnel alimentent l'analyse.
  const usableLines = input.lines.filter((l) => l.confirmed && l.drugName);

  // ---------------------------------------------------------------- ÉTAPE 1
  // SÉCURITÉ — couverture du référentiel + signaux d'extraction.
  const safetyFindings = recorder.run(
    "SAFETY",
    "Contrôles de sécurité",
    input.lines.length,
    () => {
      const coverage = evaluateKnowledgeCoverage(usableLines, input.knowledge);
      const all = [...input.extractionFindings, ...coverage];
      const notes: string[] = [];

      const unconfirmed = input.lines.length - usableLines.length;
      if (unconfirmed > 0) {
        notes.push(
          `${unconfirmed} ligne(s) non confirmée(s) par un professionnel : exclue(s) de l'analyse.`,
        );
      }

      const blocking = all.filter((f) => f.severity === "BLOCKING");
      if (blocking.length > 0) {
        notes.push(`${blocking.length} signal(aux) bloquant(s).`);
      }

      return {
        output: all,
        count: all.length,
        notes,
        status: blocking.length > 0 ? ("PARTIAL" as const) : ("OK" as const),
      };
    },
  );

  if (usableLines.length === 0) {
    blockedReasons.push(
      "Aucune ligne d'ordonnance confirmée : l'analyse ne peut pas être conduite.",
    );
    return {
      engineVersion: ENGINE_VERSION,
      status: "FAILED",
      safetyFindings,
      explanations: [],
      opportunities: [],
      recommendations: [],
      trace: recorder.trace,
      blockedReasons,
      usedSimulatedProviders: input.usedSimulatedProviders,
    };
  }

  // ---------------------------------------------------------------- ÉTAPE 2
  // COMPRÉHENSION DU TRAITEMENT — reformulation de données référencées.
  const explanations = recorder.run(
    "TREATMENT_UNDERSTANDING",
    "Compréhension du traitement",
    usableLines.length,
    () => {
      const unavailable = input.explanations.filter((e) => e.source === "UNAVAILABLE");
      const notes =
        unavailable.length > 0
          ? [
              `${unavailable.length} médicament(s) sans information référencée : aucune explication n'a été produite.`,
            ]
          : [];
      return {
        output: input.explanations,
        count: input.explanations.length,
        notes,
        status: unavailable.length > 0 ? ("PARTIAL" as const) : ("OK" as const),
      };
    },
  );

  // ---------------------------------------------------------------- ÉTAPE 3
  // PERTINENCE — opportunités de conseil, sans aucun accès au catalogue.
  const drugsForAdvice = usableLines.map((line) => ({
    lineIndex: line.lineIndex,
    drugName: line.drugName as string,
    knowledge: input.knowledge.get((line.drugName as string).toLowerCase()) ?? null,
  }));

  const rawOpportunities = recorder.run(
    "ADVICE_OPPORTUNITIES",
    "Opportunités de conseil",
    drugsForAdvice.length,
    () => {
      const detected = detectAdviceOpportunities({
        drugs: drugsForAdvice,
        patient: input.patient,
      });
      return {
        output: detected,
        count: detected.length,
        notes:
          detected.length === 0
            ? ["Aucune opportunité de conseil identifiée pour ce traitement."]
            : [],
      };
    },
  );

  // ---------------------------------------------------------------- ÉTAPE 4
  // SÉCURITÉ (2e passe) — filtrage des opportunités et des produits.
  const knownDrugs = drugsForAdvice
    .map((d) => d.knowledge)
    .filter((k): k is DrugKnowledge => k !== null);

  const opportunitySafety = evaluateOpportunitySafety(
    rawOpportunities,
    input.patient,
    knownDrugs,
  );
  const productSafety = evaluateProductSafety(input.catalog, input.patient);

  const allSafetyFindings = [
    ...safetyFindings,
    ...opportunitySafety.findings,
    ...productSafety.findings,
  ];

  const opportunities = rawOpportunities.map((opportunity) =>
    opportunitySafety.blockedOpportunityKeys.has(opportunity.key)
      ? {
          ...opportunity,
          isBlocked: true,
          blockReason:
            opportunity.blockReason ??
            opportunitySafety.findings.find((f) => f.subjectId === opportunity.key)
              ?.message ??
            "Écarté par le moteur de sécurité.",
        }
      : opportunity,
  );

  const eligibleOpportunities = opportunities.filter((o) => !o.isBlocked);
  for (const blocked of opportunities.filter((o) => o.isBlocked)) {
    blockedReasons.push(`${blocked.title} : ${blocked.blockReason}`);
  }

  // ---------------------------------------------------------------- ÉTAPE 5
  // APPARIEMENT STOCK — le catalogue n'entre en jeu qu'ici.
  const candidatesByOpportunity = recorder.run(
    "CATALOG_MATCHING",
    "Appariement avec le stock",
    eligibleOpportunities.length,
    () => {
      const map = new Map<string, CatalogProduct[]>();
      const notes: string[] = [];

      for (const opportunity of eligibleOpportunities) {
        const candidates = findCandidateProducts({
          opportunity,
          catalog: input.catalog.filter(
            (p) => !productSafety.blockedProductIds.has(p.id),
          ),
        });
        if (candidates.length === 0) {
          notes.push(
            `« ${opportunity.title} » : aucune référence disponible dans le catalogue de l'officine.`,
          );
        }
        map.set(
          opportunity.key,
          candidates.map((c) => c.product),
        );
      }

      return {
        output: map,
        count: [...map.values()].reduce((sum, list) => sum + list.length, 0),
        notes,
      };
    },
  );

  // ---------------------------------------------------------------- ÉTAPE 6
  // SCORE — classement explicable, sécurité et pertinence dominantes.
  const scored = recorder.run(
    "SCORING",
    "Classement explicable",
    [...candidatesByOpportunity.values()].reduce((s, l) => s + l.length, 0),
    () => {
      const results: ScoredRecommendation[] = [];

      for (const opportunity of eligibleOpportunities) {
        const candidates = candidatesByOpportunity.get(opportunity.key) ?? [];
        for (const product of candidates) {
          const result = scoreProductForOpportunity({
            product,
            opportunity,
            patient: input.patient,
            rules: input.rules,
            history: input.history,
            blockedProductIds: productSafety.blockedProductIds,
          });
          if (result && result.totalScore >= RECOMMENDATION_MIN_SCORE) {
            results.push(result);
          }
        }
      }

      return { output: results, count: results.length };
    },
  );

  // ---------------------------------------------------------------- ÉTAPE 7
  // OPTIMISATION COMMERCIALE AUTORISÉE — dernière étape, périmètre restreint.
  // Elle ne peut QUE : (a) retenir une référence parmi des candidates déjà
  // jugées cliniquement équivalentes, (b) limiter le nombre de propositions.
  // Elle ne peut jamais réintroduire une référence écartée en amont.
  const recommendations = recorder.run(
    "COMMERCIAL_OPTIMIZATION",
    "Optimisation commerciale autorisée",
    scored.length,
    () => {
      const byOpportunity = new Map<string, ScoredRecommendation[]>();
      for (const item of scored) {
        const list = byOpportunity.get(item.opportunityKey) ?? [];
        list.push(item);
        byOpportunity.set(item.opportunityKey, list);
      }

      const selected: ScoredRecommendation[] = [];
      const notes: string[] = [];

      for (const [key, list] of byOpportunity) {
        list.sort((a, b) => b.totalScore - a.totalScore);
        const best = list[0];
        if (!best) continue;

        // Équivalence clinique : écart de score < 2 %. On départage alors par
        // la dimension commerciale, seul cas où elle est décisive.
        const equivalents = list.filter(
          (item) => Math.abs(item.totalScore - best.totalScore) < 0.02,
        );
        const chosen =
          equivalents.length > 1
            ? [...equivalents].sort(
                (a, b) => b.breakdown.commercial - a.breakdown.commercial,
              )[0]
            : best;

        // La note est émise dès qu'un départage commercial a eu lieu, même
        // lorsqu'il confirme la référence déjà en tête : la trace doit refléter
        // ce qui s'est réellement passé, pas seulement ce qui a changé.
        if (equivalents.length > 1) {
          const changed = chosen.productId !== best.productId;
          notes.push(
            `« ${key} » : ${equivalents.length} références cliniquement équivalentes, départage commercial appliqué${changed ? " (référence retenue modifiée)" : " (référence en tête confirmée)"}.`,
          );
        }

        selected.push(chosen);
      }

      const priorityByKey = new Map(
        eligibleOpportunities.map((o) => [o.key, o.priority]),
      );
      selected.sort((a, b) => {
        const priorityDelta =
          (priorityByKey.get(b.opportunityKey) ?? 0) -
          (priorityByKey.get(a.opportunityKey) ?? 0);
        if (priorityDelta !== 0) return priorityDelta;
        return b.totalScore - a.totalScore;
      });

      const limited = selected.slice(0, maxRecommendations);
      if (selected.length > limited.length) {
        notes.push(
          `${selected.length - limited.length} proposition(s) non affichée(s) : limite de ${maxRecommendations} conseils par ordonnance.`,
        );
      }

      return { output: limited, count: limited.length, notes };
    },
  );

  const hasPartial = recorder.trace.some((s) => s.status === "PARTIAL");

  return {
    engineVersion: ENGINE_VERSION,
    status: hasPartial ? "PARTIAL" : "COMPLETED",
    safetyFindings: allSafetyFindings,
    explanations,
    opportunities,
    recommendations,
    trace: recorder.trace,
    blockedReasons,
    usedSimulatedProviders: input.usedSimulatedProviders,
  };
}
