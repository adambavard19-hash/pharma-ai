import "server-only";
import { prisma } from "@/server/db/client";
import { runAnalysisPipeline } from "@/core/ai/pipeline";
import {
  loadInteractionCatalogState,
  loadInteractionData,
  substanceKey,
} from "./interactions";
import { evaluateExtractionSafety } from "@/core/ai/engines/safety";
import type {
  AnalysisResult,
  DrugKnowledge,
  ExtractedPrescriptionLine,
  OfficialDrugFacts,
  TreatmentExplanationResult,
} from "@/core/ai/types";
import { BDPM_SOURCE } from "@/core/reference";
import {
  getAIProvider,
  getDrugKnowledgeProvider,
  getOCRProvider,
} from "@/server/ai/registry";
import {
  loadCatalogSnapshot,
  loadNationalDrugCandidates,
  loadPharmacyRules,
  loadValidationHistory,
} from "./catalog";
import { buildPatientContext } from "./patients";
import { identifyPrescriptionLines, loadSpecialtyFacts } from "./drug-identification";
import { getReferenceCatalogState } from "./reference";
import { recordAudit } from "@/server/audit/log";
import { createNotification } from "./notifications";
import { ENGINE_VERSION } from "@/config/constants";
import type { TenantScope } from "@/server/db/tenant";

/**
 * Orchestration de l'analyse d'une ordonnance.
 *
 * Ce module fait le pont entre la base de données et le moteur PUR
 * (`src/core/ai/pipeline.ts`). Il :
 *   1. charge le contexte (patient, catalogue, stock, règles, historique) ;
 *   2. exécute le pipeline ;
 *   3. persiste le résultat AVEC sa trace complète, pour l'auditabilité.
 *
 * Aucune règle métier n'est écrite ici : elle vivrait alors hors du moteur
 * testable.
 */

export async function extractPrescription(params: {
  scope: TenantScope;
  prescriptionId: string;
  demoScenarioId?: string;
}): Promise<{ linesCreated: number; isSimulated: boolean; warnings: string[] }> {
  const prescription = await prisma.prescription.findUnique({
    where: { id: params.prescriptionId },
    select: { id: true, pharmacyId: true, fileKey: true, fileMimeType: true, fileName: true },
  });
  if (!prescription || prescription.pharmacyId !== params.scope.pharmacyId) {
    throw new Error("Ordonnance introuvable dans cette officine.");
  }

  const ocr = getOCRProvider();
  await prisma.prescription.update({
    where: { id: prescription.id },
    data: { status: "EXTRACTING" },
  });

  const extracted = await ocr.extract({
    fileKey: prescription.fileKey,
    mimeType: prescription.fileMimeType,
    fileName: prescription.fileName,
    demoScenarioId: params.demoScenarioId,
  });

  await prisma.$transaction(async (tx) => {
    await tx.prescriptionLine.deleteMany({ where: { prescriptionId: prescription.id } });

    for (const line of extracted.lines) {
      await tx.prescriptionLine.create({
        data: {
          prescriptionId: prescription.id,
          position: line.position,
          rawText: line.rawText,
          drugName: line.drugName.value,
          dosage: line.dosage.value,
          form: line.form.value,
          posology: line.posology.value,
          durationDays: line.durationDays.value,
          quantity: line.quantity.value,
          instructions: line.instructions.value,
          status: "NEEDS_REVIEW",
          fieldConfidence: buildConfidenceMap(line) as never,
          unreadableFields: collectUnreadable(line),
        },
      });
    }

    await tx.prescription.update({
      where: { id: prescription.id },
      data: {
        status: "NEEDS_VERIFICATION",
        prescriberName: extracted.prescriberName.value,
        prescriberRpps: extracted.prescriberRpps.value,
        prescribedAt: extracted.prescribedAt.value
          ? new Date(extracted.prescribedAt.value)
          : null,
        ocrConfidence: extracted.overallConfidence,
        ocrProvider: extracted.providerId,
      },
    });
  });

  await recordAudit({
    action: "prescription.created",
    entityType: "Prescription",
    entityId: prescription.id,
    pharmacyId: params.scope.pharmacyId,
    userId: params.scope.userId,
    metadata: {
      provider: extracted.providerId,
      simulated: extracted.isSimulated,
      lines: extracted.lines.length,
    },
  });

  return {
    linesCreated: extracted.lines.length,
    isSimulated: extracted.isSimulated,
    warnings: extracted.warnings,
  };
}

function buildConfidenceMap(line: ExtractedPrescriptionLine): Record<string, number> {
  return {
    drugName: line.drugName.confidence,
    dosage: line.dosage.confidence,
    form: line.form.confidence,
    posology: line.posology.confidence,
    durationDays: line.durationDays.confidence,
    quantity: line.quantity.confidence,
    instructions: line.instructions.confidence,
  };
}

function collectUnreadable(line: ExtractedPrescriptionLine): string[] {
  return (
    [
      ["drugName", line.drugName],
      ["dosage", line.dosage],
      ["form", line.form],
      ["posology", line.posology],
      ["durationDays", line.durationDays],
      ["quantity", line.quantity],
      ["instructions", line.instructions],
    ] as const
  )
    .filter(([, field]) => field.unreadable)
    .map(([name]) => name);
}

/**
 * Lance l'analyse complète et persiste le résultat.
 * Prérequis : les lignes doivent avoir été confirmées par un professionnel.
 */
export async function analysePrescription(params: {
  scope: TenantScope;
  prescriptionId: string;
}): Promise<{ analysisRunId: string; result: AnalysisResult }> {
  const startedAt = Date.now();

  const prescription = await prisma.prescription.findUnique({
    where: { id: params.prescriptionId },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!prescription || prescription.pharmacyId !== params.scope.pharmacyId) {
    throw new Error("Ordonnance introuvable dans cette officine.");
  }

  await prisma.prescription.update({
    where: { id: prescription.id },
    data: { status: "ANALYZING" },
  });

  const ocrProvider = getOCRProvider();
  const aiProvider = getAIProvider();
  const knowledgeProvider = getDrugKnowledgeProvider();

  const [patient, pharmacyCatalog, nationalCandidates, rules, history] = await Promise.all([
    buildPatientContext(prescription.patientId),
    loadCatalogSnapshot(params.scope, { includeSiblingAvailability: true }),
    // Les médicaments de l'officine susceptibles de répondre à une règle de
    // conseil. Sélection bornée et filtrée en base : le comptoir n'attend pas.
    loadNationalDrugCandidates(params.scope),
    loadPharmacyRules(params.scope),
    loadValidationHistory(params.scope),
  ]);

  // Les deux origines se rejoignent ici, le temps d'un classement. Elles ne se
  // mélangent jamais en base.
  const catalog = [...pharmacyCatalog, ...nationalCandidates];

  const drugNames = prescription.lines
    .map((line) => line.drugName)
    .filter((name): name is string => Boolean(name));
  const knowledge = await knowledgeProvider.lookupMany(drugNames);

  // Étape B bis : rattachement au catalogue national. Il précède l'analyse
  // parce qu'il conditionne ce que le moteur de sécurité peut affirmer — et
  // surtout ce qu'il doit reconnaître ne pas savoir.
  const { facts: official, substancesByLine } = await loadOfficialFacts(prescription.id);

  // Étape B ter : interactions. Le référentiel est fourni par l'officine ; en
  // son absence, le moteur le dira au lieu de laisser un écran muet passer
  // pour une vérification.
  const interactionKeys = [...substancesByLine.values()].flat().map((s) => s.key);
  const [interactionCatalog, interactionData] = await Promise.all([
    loadInteractionCatalogState(),
    loadInteractionData(interactionKeys),
  ]);

  // Étape C : explications, produites à partir du référentiel uniquement.
  const explanations: TreatmentExplanationResult[] = [];
  for (const line of prescription.lines) {
    if (line.status !== "CONFIRMED" || !line.drugName) continue;
    const drug = knowledge.get(line.drugName.toLowerCase());

    if (!drug) {
      explanations.push({
        lineIndex: line.position,
        purpose: null,
        instructions: null,
        tips: [],
        precautions: [],
        source: "UNAVAILABLE",
        sourceRefs: [],
        confidence: 0,
        requiresReview: true,
      });
      continue;
    }

    const explanation = await aiProvider.explainTreatment({
      drug: drug as DrugKnowledge,
      posology: line.posology,
      durationDays: line.durationDays,
      patient,
    });
    explanations.push({ ...explanation, lineIndex: line.position });
  }

  // Signaux issus de l'extraction, reconstruits depuis les champs persistés.
  const extractionFindings = evaluateExtractionSafety(
    prescription.lines.map((line) => rebuildExtractedLine(line)),
  );

  const result = runAnalysisPipeline({
    lines: prescription.lines.map((line) => ({
      lineIndex: line.position,
      drugName: line.drugName,
      posology: line.posology,
      durationDays: line.durationDays,
      confirmed: line.status === "CONFIRMED",
    })),
    knowledge,
    official,
    patient,
    catalog,
    rules,
    history,
    explanations,
    extractionFindings,
    interactions: {
      substancesByLine,
      rules: interactionData.rules,
      classMembers: interactionData.classMembers,
      catalog: interactionCatalog,
    },
    usedSimulatedProviders:
      ocrProvider.info.capability === "SIMULATED" ||
      aiProvider.info.capability === "SIMULATED" ||
      knowledgeProvider.info.capability === "SIMULATED",
  });

  const durationMs = Date.now() - startedAt;

  const analysisRun = await prisma.$transaction(async (tx) => {
    const run = await tx.analysisRun.create({
      data: {
        pharmacyId: params.scope.pharmacyId,
        prescriptionId: prescription.id,
        status: result.status === "FAILED" ? "FAILED" : result.status === "PARTIAL" ? "PARTIAL" : "COMPLETED",
        engineVersion: ENGINE_VERSION,
        providers: {
          ocr: ocrProvider.info.id,
          ai: aiProvider.info.id,
          knowledge: knowledgeProvider.info.id,
          simulated: result.usedSimulatedProviders,
        } as never,
        inputSnapshot: {
          lineCount: prescription.lines.length,
          confirmedLines: prescription.lines.filter((l) => l.status === "CONFIRMED").length,
          catalogSize: catalog.length,
          ruleCount: rules.length,
          patientContextAvailable: patient.patientId !== null,
        } as never,
        traceJson: result.trace as never,
        blockedReasons: result.blockedReasons,
        isDemo: prescription.isDemo,
        finishedAt: new Date(),
        durationMs,
      },
    });

    for (const finding of result.safetyFindings) {
      await tx.safetyFinding.create({
        data: {
          analysisRunId: run.id,
          severity: finding.severity,
          code: finding.code,
          message: finding.message,
          subjectType: finding.subjectType,
          subjectId: finding.subjectId,
          source: finding.source,
        },
      });
    }

    const opportunityIdByKey = new Map<string, string>();
    for (const opportunity of result.opportunities) {
      const created = await tx.adviceOpportunity.create({
        data: {
          analysisRunId: run.id,
          category: opportunity.category,
          title: opportunity.title,
          rationale: opportunity.rationale,
          clinicalContext: opportunity.clinicalContext,
          safetyNotes: opportunity.safetyNotes,
          priority: opportunity.priority,
          isBlocked: opportunity.isBlocked,
          blockReason: opportunity.blockReason,
        },
      });
      opportunityIdByKey.set(opportunity.key, created.id);
    }

    for (const explanation of result.explanations) {
      const line = prescription.lines.find((l) => l.position === explanation.lineIndex);
      if (!line) continue;
      await tx.treatmentExplanation.upsert({
        where: { prescriptionLineId: line.id },
        create: {
          prescriptionLineId: line.id,
          purpose: explanation.purpose,
          instructions: explanation.instructions,
          tips: explanation.tips,
          precautions: explanation.precautions,
          source: explanation.source,
          sourceRefs: explanation.sourceRefs,
          confidence: explanation.confidence,
          requiresReview: explanation.requiresReview,
        },
        update: {
          purpose: explanation.purpose,
          instructions: explanation.instructions,
          tips: explanation.tips,
          precautions: explanation.precautions,
          source: explanation.source,
          sourceRefs: explanation.sourceRefs,
          confidence: explanation.confidence,
          requiresReview: explanation.requiresReview,
        },
      });
    }

    // Les recommandations précédentes non décidées sont remplacées : une
    // nouvelle analyse ne doit pas laisser d'anciennes propositions orphelines.
    await tx.recommendation.deleteMany({
      where: { prescriptionId: prescription.id, status: "PROPOSED", origin: "AI" },
    });

    const catalogById = new Map(catalog.map((p) => [p.id, p]));

    for (const recommendation of result.recommendations) {
      const product = catalogById.get(recommendation.productId);
      // Un candidat du catalogue national n'est pas un produit de l'officine :
      // il se range dans l'autre colonne. Les deux liens ne sont jamais remplis
      // ensemble.
      const isNationalDrug = product?.origin === "NATIONAL_DRUG";
      const created = await tx.recommendation.create({
        data: {
          pharmacyId: params.scope.pharmacyId,
          prescriptionId: prescription.id,
          analysisRunId: run.id,
          opportunityId: opportunityIdByKey.get(recommendation.opportunityKey) ?? null,
          productId: isNationalDrug ? null : recommendation.productId,
          presentationId: isNationalDrug ? (product?.presentationId ?? null) : null,
          origin: "AI",
          status: "PROPOSED",
          scoreBreakdown: {
            ...recommendation.breakdown,
            explanation: recommendation.explanation,
          } as never,
          totalScore: recommendation.totalScore,
          justification: recommendation.justification,
          shortReason: recommendation.shortReason,
          patientReason: recommendation.patientReason,
          counterScript: recommendation.counterScript,
          precautions: recommendation.precautions,
          unitPriceCents: product?.salePriceCents ?? 0,
          isDemo: prescription.isDemo,
        },
      });

      await tx.recommendationEvent.create({
        data: {
          recommendationId: created.id,
          type: "GENERATED",
          userId: null,
          metadata: {
            engineVersion: ENGINE_VERSION,
            totalScore: recommendation.totalScore,
            opportunity: recommendation.opportunityKey,
          } as never,
        },
      });
    }

    await tx.prescription.update({
      where: { id: prescription.id },
      data: { status: result.status === "FAILED" ? "FAILED" : "ANALYZED" },
    });

    return run;
  });

  await recordAudit({
    action: "prescription.analyzed",
    entityType: "Prescription",
    entityId: prescription.id,
    pharmacyId: params.scope.pharmacyId,
    userId: params.scope.userId,
    metadata: {
      analysisRunId: analysisRun.id,
      engineVersion: ENGINE_VERSION,
      recommendations: result.recommendations.length,
      blocking: result.safetyFindings.filter((f) => f.severity === "BLOCKING").length,
      durationMs,
    },
  });

  if (result.status === "FAILED") {
    await createNotification({
      pharmacyId: params.scope.pharmacyId,
      type: "ANALYSIS_FAILED",
      severity: "WARNING",
      title: "Analyse impossible",
      body: `L'ordonnance ${prescription.reference} n'a pas pu être analysée : ${result.blockedReasons[0] ?? "aucune ligne confirmée"}.`,
      linkUrl: `/vente/${prescription.id}`,
    });
  } else if (result.recommendations.length > 0) {
    await createNotification({
      pharmacyId: params.scope.pharmacyId,
      type: "RECOMMENDATION_PENDING",
      severity: "INFO",
      title: "Conseils à valider",
      body: `${result.recommendations.length} conseil(s) proposé(s) pour l'ordonnance ${prescription.reference}.`,
      linkUrl: `/vente/${prescription.id}`,
    });
  }

  return { analysisRunId: analysisRun.id, result };
}

function rebuildExtractedLine(line: {
  position: number;
  rawText: string | null;
  drugName: string | null;
  dosage: string | null;
  form: string | null;
  posology: string | null;
  durationDays: number | null;
  quantity: number | null;
  instructions: string | null;
  fieldConfidence: unknown;
  unreadableFields: string[];
}): ExtractedPrescriptionLine {
  const confidence = (line.fieldConfidence ?? {}) as Record<string, number>;
  const unreadable = new Set(line.unreadableFields);

  const field = <T>(name: string, value: T | null) => ({
    value,
    confidence: confidence[name] ?? 0,
    unreadable: unreadable.has(name),
  });

  return {
    position: line.position,
    rawText: line.rawText,
    drugName: field("drugName", line.drugName),
    dosage: field("dosage", line.dosage),
    form: field("form", line.form),
    posology: field("posology", line.posology),
    durationDays: field("durationDays", line.durationDays),
    quantity: field("quantity", line.quantity),
    instructions: field("instructions", line.instructions),
  };
}


/**
 * Les faits officiels des lignes rattachées, indexés par le libellé de
 * l'ordonnance — la même clé que la couche éditoriale, pour que le moteur
 * puisse comparer les deux ligne à ligne.
 *
 * Une officine sans catalogue national importé obtient une table vide : le
 * moteur de sécurité le signale alors sur chaque ligne, au lieu de laisser
 * croire à une analyse complète.
 */
async function loadOfficialFacts(prescriptionId: string): Promise<{
  facts: Map<string, OfficialDrugFacts | null>;
  /** Substances actives par position de ligne, pour le croisement d'interactions. */
  substancesByLine: Map<number, { key: string; label: string }[]>;
}> {
  const [identifications, catalogState] = await Promise.all([
    identifyPrescriptionLines(prescriptionId),
    getReferenceCatalogState(),
  ]);

  const sourceUpdatedAt =
    catalogState.status === "READY" || catalogState.status === "STALE"
      ? catalogState.sourceUpdatedAt
      : null;

  const facts = await loadSpecialtyFacts(
    identifications
      .map((identification) => identification.specialtyId)
      .filter((id): id is string => id !== null),
  );

  const map = new Map<string, OfficialDrugFacts | null>();
  const substancesByLine = new Map<number, { key: string; label: string }[]>();
  for (const identification of identifications) {
    const specialty = identification.specialtyId ? facts.get(identification.specialtyId) : null;
    if (specialty) {
      substancesByLine.set(
        identification.position,
        specialty.interactionSubstances.map((label) => ({
          key: substanceKey(label),
          label,
        })),
      );
    }
    map.set(
      identification.drugName.toLowerCase(),
      specialty
        ? {
            cisCode: specialty.cisCode,
            name: specialty.name,
            pharmaceuticalForm: specialty.pharmaceuticalForm,
            administrationRoutes: specialty.administrationRoutes,
            substances: specialty.substances,
            prescriptionConditions: specialty.prescriptionConditions,
            marketed: specialty.marketed,
            sourceName: BDPM_SOURCE.name,
            sourceUpdatedAt,
          }
        : null,
    );
  }

  return { facts: map, substancesByLine };
}
