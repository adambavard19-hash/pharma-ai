import { prisma } from "@/server/db/client";
import { getAIProvider } from "@/server/ai/registry";
import { recordAudit } from "@/server/audit/log";
import { recordIsDemo } from "@/server/db/demo-scope";
import type { TenantScope } from "@/server/db/tenant";
import { loadCatalogSnapshot, enrichCatalog, loadPreferredRanges, loadNationalDrugCandidates, loadPharmacyRules, loadStockState, loadValidationHistory } from "@/server/services/catalog";
import { fallbackRequestUnderstanding, runRequestPipeline, type RequestProposal, type RequestUnderstanding } from "@/core/counter/request";
import { needLabel } from "@/core/understanding";
import type { PatientContext } from "@/core/ai/types";

export type CounterRequestInput = {
  text: string;
  ageYears: number | null;
  isPregnant: boolean;
  isBreastfeeding: boolean;
  treatments: string[];
};

export type CounterRequestAnswer = {
  id: string;
  summary: string | null;
  referToDoctor: boolean;
  referReason: string | null;
  needs: { key: string; label: string; justification: string }[];
  /** Les questions à poser avant de proposer : celles du modèle, puis celles des règles. */
  questions: string[];
  proposals: RequestProposal[];
  notes: string[];
  blocked: string[];
  providerId: string;
  warnings: string[];
};

/**
 * La demande spontanée, de bout en bout : compréhension (modèle ou mots-clés),
 * règles de conseil, stock de l'officine, sécurité, score. Puis la demande est
 * conservée, sans patient identifié, pour que le titulaire voie ce que le
 * comptoir traite et puisse relire ce qui a été proposé.
 */
export async function adviseCounterRequest(params: { scope: TenantScope; pharmacyIsDemo: boolean; input: CounterRequestInput }): Promise<CounterRequestAnswer> {
  const { scope, input } = params;
  const text = input.text.trim().slice(0, 600);
  const patient: PatientContext = {
    patientId: null,
    ageYears: input.ageYears,
    sex: input.isPregnant || input.isBreastfeeding ? "FEMALE" : "UNSPECIFIED",
    isPregnant: input.isPregnant,
    isBreastfeeding: input.isBreastfeeding,
    renalImpairment: null,
    hepaticImpairment: null,
    allergies: [],
    chronicConditions: [],
    currentTreatments: input.treatments,
    hasAdviceConsent: false,
  };
  const request = { text, patient: { ageYears: input.ageYears, isPregnant: input.isPregnant, isBreastfeeding: input.isBreastfeeding, currentTreatments: input.treatments } };

  const provider = getAIProvider();
  let understanding: RequestUnderstanding | null = null;
  try {
    understanding = await provider.understandRequest(request);
  } catch (error) {
    console.error("[comptoir] compréhension de la demande impossible", error);
  }
  if (!understanding) understanding = fallbackRequestUnderstanding(request);

  const [pharmacyCatalog, nationalCandidates, rules, history, stock, preferredRanges] = await Promise.all([
    loadCatalogSnapshot(scope, { includeSiblingAvailability: true }),
    loadNationalDrugCandidates(scope),
    loadPharmacyRules(scope),
    loadValidationHistory(scope),
    loadStockState(scope),
    loadPreferredRanges(scope),
  ]);
  const catalog = await enrichCatalog(scope, [...pharmacyCatalog, ...nationalCandidates]);
  const result = runRequestPipeline({ understanding, patient, catalog, rules, history, stockConfigured: stock.configured, preferredRanges });

  const questions = [...new Set([...understanding.questions, ...result.ruleQuestions])].slice(0, 5);
  const row = await prisma.counterRequest.create({
    data: {
      pharmacyId: scope.pharmacyId,
      userId: scope.userId,
      text,
      ageYears: input.ageYears,
      isPregnant: input.isPregnant,
      isBreastfeeding: input.isBreastfeeding,
      treatments: input.treatments,
      needs: understanding.needs.map((need) => ({ key: need.key, justification: need.justification, confidence: need.confidence })),
      questions,
      referToDoctor: understanding.referToDoctor,
      referReason: understanding.referReason,
      summary: understanding.summary,
      proposals: result.proposals as never,
      proposalCount: result.proposals.length,
      providerId: understanding.providerId,
      model: understanding.model,
      isDemo: recordIsDemo(params.pharmacyIsDemo),
    },
    select: { id: true },
  });
  await recordAudit({
    action: "counter.request_advised",
    entityType: "CounterRequest",
    entityId: row.id,
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    metadata: { needs: understanding.needs.map((need) => need.key), proposals: result.proposals.length, referToDoctor: understanding.referToDoctor, provider: understanding.providerId },
  });

  return {
    id: row.id,
    summary: understanding.summary,
    referToDoctor: understanding.referToDoctor,
    referReason: understanding.referReason,
    needs: understanding.needs.map((need) => ({ key: need.key, label: needLabel(need.key), justification: need.justification })),
    questions,
    proposals: result.proposals,
    notes: result.notes,
    blocked: result.blocked,
    providerId: understanding.providerId,
    warnings: understanding.warnings,
  };
}

/** Les demandes du jour, pour l'accueil : combien, et combien ont donné une proposition. */
export async function countCounterRequestsToday(pharmacyId: string, since: Date): Promise<{ total: number; withProposal: number }> {
  const [total, withProposal] = await Promise.all([
    prisma.counterRequest.count({ where: { pharmacyId, createdAt: { gte: since } } }),
    prisma.counterRequest.count({ where: { pharmacyId, createdAt: { gte: since }, proposalCount: { gt: 0 } } }),
  ]);
  return { total, withProposal };
}
