import { activityScope } from "@/server/db/demo-scope";
import type { Metadata } from "next";
import { isAnalysisInFlight, isEngineOutcome } from "@/core/ai/outcome";
import type { CompanionSuggestion, RoutineStepInfo, VigilanceDetails } from "@/core/ai/types";

function isVigilanceDetails(value: unknown): value is VigilanceDetails {
  return Boolean(value) && typeof value === "object" && typeof (value as VigilanceDetails).kind === "string" && typeof (value as VigilanceDetails).title === "string";
}

function isRoutineStep(value: unknown): value is RoutineStepInfo {
  return Boolean(value) && typeof value === "object" && typeof (value as RoutineStepInfo).key === "string" && typeof (value as RoutineStepInfo).stepIndex === "number";
}

function isCompanion(value: unknown): value is CompanionSuggestion {
  return typeof value === "object" && value !== null && typeof (value as CompanionSuggestion).productId === "string" && typeof (value as CompanionSuggestion).name === "string";
}
import { describeAge, lgoLabel, stockFreshness } from "@/core/stock/connectors";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { referenceAttribution } from "@/core/reference";
import { getReferenceCatalogState } from "@/server/services/reference";
import { proposeSpecialties } from "@/server/services/drug-identification";
import { loadPrescribedAvailability } from "@/server/services/drug-catalog";
import { evaluateLinesRegulation } from "@/server/services/regulation";
import { buildPatientContext } from "@/server/services/patients";
import { patientDataEnabled } from "@/config/env";
import { AUTO_ACCEPT_REFUSAL_MESSAGES, decideAutoAccept, distinctStrengths } from "@/core/reference";
import { parsePosology, readSchedule } from "@/core/posology";
import { SaleWorkspace } from "./sale-workspace";
import { nearestShortDatesFor, todayFor } from "@/server/services/stock-lots";
import { trainingsForProducts } from "@/server/services/training";
import { parseSuggestionVigilances } from "@/config/vigilances";
import { requiresPharmacistValidation } from "@/core/ai/engines/population-vigilance";
import { parseStoredAlternatives } from "@/core/ai/alternatives";
import { MAX_ALTERNATIVES_PER_ADVICE } from "@/config/constants";
import { adviceFamilyOf } from "@/core/ai/family";
import type { PipelineStageTrace, ScoreContribution } from "@/core/ai/types";
import { brandKey, brandLabelOf } from "@/core/catalog/brand";
import { selectCounterCards } from "@/core/partners/counter-card";
import { counterBrandsFor } from "@/server/services/partners/visibility";
import type { PartnerCardView, PatientFactor, SpecialtyProposal } from "./types";

export const metadata: Metadata = { title: "Vente" };

/**
 * L'écran unique du comptoir.
 *
 * Il remplace quatre pages successives — détail, vérification, copilote, fiche —
 * par une seule adresse dont on ne sort qu'à la fin. Toutes les données du
 * parcours sont chargées ici en une fois : au comptoir, un aller-retour serveur
 * de plus est une seconde de perdue.
 */
export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VIEW);

  const prescription = await prisma.prescription.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, reference: true } },
      lines: {
        orderBy: { position: "asc" },
        include: {
          explanation: true,
          // Les faits officiels sont lus ici, avec la ligne : c'est la seule
          // façon d'afficher la composition réelle à côté du texte du
          // prescripteur sans un aller-retour de plus au comptoir.
          specialty: {
            select: {
              cisCode: true,
              name: true,
              pharmaceuticalForm: true,
              marketingStatus: true,
              compositions: { where: { nature: "SA" }, select: { substanceLabel: true } },
              prescriptionConditions: { select: { label: true } },
            },
          },
          regulationChecks: { select: { code: true } },
        },
      },
      recommendations: {
        orderBy: [{ totalScore: "desc" }],
        include: {
          product: { include: { stockItem: true } },
          // Un médicament conseil du catalogue national : son nom officiel,
          // et la ligne de stock de CETTE officine pour le prix et la quantité.
          presentation: {
            select: {
              id: true,
              priceCents: true, imageUrl: true, imageSource: true,
              specialty: { select: { name: true } },
              pharmacyStocks: { where: { pharmacyId: session.scope.pharmacyId }, select: { quantity: true, alertThreshold: true, priceCents: true } },
            },
          },
          opportunity: true,
          decidedBy: { select: { firstName: true, lastName: true } },
        },
      },
      analysisRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          safetyFindings: { orderBy: { severity: "desc" } },
          opportunities: { where: { isBlocked: true } },
        },
      },
      sales: { select: { id: true } },
    },
  });

  if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) notFound();

  const patients = await prisma.patient.findMany({
    where: { pharmacyId: session.scope.pharmacyId, deletedAt: null, ...activityScope(session.scope) },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true, reference: true, email: true },
    take: 300,
  });

  const run = prescription.analysisRuns[0] ?? null;
  // Le poste de caisse analyse la vente de lui-même : l'écran peut s'ouvrir pendant ce temps.
  const analysisInFlight = isAnalysisInFlight({ status: prescription.status, hasRun: run !== null, updatedAt: prescription.updatedAt, now: new Date() });

  // Un rattachement décidé après l'analyse rend les signaux de sécurité
  // périmés : ils parlent encore d'un médicament « non rattaché ». On le dit
  // plutôt que de laisser lire un écran qui n'est plus à jour.
  const identificationChangedSinceAnalysis = Boolean(
    run &&
      prescription.lines.some(
        (line) => line.identifiedBy === "PHARMACIST" && line.updatedAt > run.startedAt,
      ),
  );

  // Ce que l'officine détient des médicaments prescrits. Une seule requête,
  // ciblée sur les spécialités rattachées.
  const availability = await loadPrescribedAvailability(session.scope.pharmacyId, prescription.id);

  // De quand date le stock affiché ? Avec un agent connecté, le comptoir le
  // dit, et cesse d'affirmer « en stock » quand la synchronisation a manqué.
  const connection = await prisma.stockConnection.findUnique({
    where: { pharmacyId: session.scope.pharmacyId },
    select: { lgo: true, status: true, lastSyncAt: true, lastSeenAt: true, intervalSeconds: true },
  });
  const stockNotice = (() => {
    if (!connection || connection.status === "PENDING" || connection.status === "DISCONNECTED") return null;
    const fresh = stockFreshness({ lastSyncAt: connection.lastSyncAt, lastSeenAt: connection.lastSeenAt, intervalSeconds: connection.intervalSeconds });
    if (fresh.state === "FRESH") return { tone: "ok" as const, text: `Stock ${lgoLabel(connection.lgo)} vérifié ${describeAge(fresh.ageSeconds)}` };
    if (fresh.state === "STALE") return { tone: "warning" as const, text: `Stock ${lgoLabel(connection.lgo)} non synchronisé ${describeAge(fresh.ageSeconds)} : les quantités affichées peuvent être dépassées.` };
    return { tone: "warning" as const, text: `Agent ${lgoLabel(connection.lgo)} injoignable : stock non vérifié ${describeAge(fresh.ageSeconds)}.` };
  })();

  // Les facteurs patient qui ont RÉELLEMENT pesé sur l'analyse. Ils sont
  // soumis à la permission de consultation des données de santé : le comptoir
  // n'est pas une raison de contourner le contrôle d'accès.
  const patientFactors: PatientFactor[] = [];
  if (prescription.patientId && session.permissions.has(PERMISSIONS.PATIENT_HEALTH_VIEW)) {
    const context = await buildPatientContext(prescription.patientId);
    if (context.ageYears !== null) {
      patientFactors.push({ label: `${context.ageYears} ans`, tone: "neutral" });
    }
    for (const allergy of context.allergies) {
      patientFactors.push({ label: `Allergie : ${allergy}`, tone: "warning" });
    }
    if (context.isPregnant) patientFactors.push({ label: "Grossesse", tone: "warning" });
    if (context.isBreastfeeding) patientFactors.push({ label: "Allaitement", tone: "warning" });
    if (context.renalImpairment) {
      patientFactors.push({ label: "Insuffisance rénale", tone: "warning" });
    }
    if (context.hepaticImpairment) {
      patientFactors.push({ label: "Insuffisance hépatique", tone: "warning" });
    }
    for (const condition of context.chronicConditions) {
      patientFactors.push({ label: condition, tone: "warning" });
    }
  }

  const catalogState = await getReferenceCatalogState();
  const catalogLoaded = catalogState.status === "READY" || catalogState.status === "STALE";
  const attribution = catalogLoaded ? referenceAttribution(catalogState) : null;

  // Candidats proposés uniquement pour les lignes confirmées qui n'ont pas pu
  // être rattachées seules : en pratique zéro à deux lignes par ordonnance.
  const proposals = new Map<string, SpecialtyProposal[]>();
  const refusals = new Map<string, string>();
  const strengthOptions = new Map<string, string[]>();
  if (catalogLoaded) {
    for (const line of prescription.lines) {
      // Toutes les lignes nommées, même avant confirmation : c'est pendant la
      // relecture que le pharmacien précise un dosage manquant.
      if (line.drugSpecialtyId || !line.drugName || line.status === "REJECTED") continue;
      const matches = await proposeSpecialties({
        drugName: line.drugName,
        dosage: line.dosage,
        form: line.form,
      });
      // La raison du refus vient de la même fonction que la décision prise à
      // l'analyse : l'écran ne peut pas raconter autre chose que le moteur.
      const decision = decideAutoAccept(matches);
      if (!decision.accepted) refusals.set(line.id, AUTO_ACCEPT_REFUSAL_MESSAGES[decision.reason]);
      if (!line.dosage) strengthOptions.set(line.id, distinctStrengths(matches.map((match) => match.candidate)));
      proposals.set(
        line.id,
        matches.map((match) => ({
          id: match.candidate.id,
          cisCode: match.candidate.cisCode,
          name: match.candidate.name,
          pharmaceuticalForm: match.candidate.pharmaceuticalForm,
          substances: match.candidate.substances,
          marketed: match.candidate.marketed,
          score: match.score,
          reasons: match.reasons,
        })),
      );
    }
  }

  // Ce que la réglementation impose ligne par ligne — support d'ordonnance,
  // document à réclamer, durée maximale — d'après les conditions publiées et
  // le statut de prise en charge. Calculé ici, avec la page : au comptoir, une
  // alerte de facturation qui arrive après la vente ne sert à rien.
  const regulationByLine = new Map(
    (
      await evaluateLinesRegulation(
        prescription.lines.map((line) => ({
          id: line.id,
          specialtyId: line.drugSpecialtyId,
          conditions: line.specialty?.prescriptionConditions.map((item) => item.label) ?? [],
          durationDays: line.durationDays,
        })),
      )
    ).map((entry) => [entry.lineId, entry.alerts]),
  );

  // Dates courtes du jour et formations liées : lues à l'affichage, elles
  // changent sans nouvelle analyse (un lot sorti, un contenu publié).
  const [shortDates, trainingsByProduct] = await Promise.all([
    nearestShortDatesFor(session.scope.pharmacyId, await todayFor(session.scope.pharmacyId)),
    // Le lien de formation ne s'affiche qu'à qui peut ouvrir la formation.
    session.permissions.has(PERMISSIONS.TRAINING_VIEW)
      ? trainingsForProducts(
          session.scope,
          prescription.recommendations.map((r) => r.product?.id).filter((id): id is string => Boolean(id)),
        )
      : Promise.resolve(new Map<string, { id: string; title: string }[]>()),
  ]);
  // Les autres références retenues avec chaque conseil, enrichies d'UNE requête
  // groupée : le nom, le prix et le stock sont ceux d'aujourd'hui, jamais ceux
  // de l'analyse. Une référence disparue, inactive, hors stock ou d'une autre
  // officine est écartée sans bruit — une alternative qu'on ne peut plus
  // remettre au patient n'a pas à s'afficher.
  const storedAlternatives = new Map(prescription.recommendations.map((r) => [r.id, parseStoredAlternatives(r.alternatives)]));
  const alternativeProductIds = [...new Set([...storedAlternatives.values()].flatMap((list) => list.map((alternative) => alternative.productId)))];
  const alternativeProducts = new Map(
    (alternativeProductIds.length === 0
      ? []
      : await prisma.product.findMany({
          where: { id: { in: alternativeProductIds }, pharmacyId: session.scope.pharmacyId, isActive: true },
          select: { id: true, name: true, brand: true, imageUrl: true, salePriceCents: true, stockItem: { select: { quantity: true } } },
        })
    ).map((product) => [product.id, product]),
  );

  // Gammes partenaires : calculées APRÈS le moteur, à partir des conseils qu'il
  // a déjà rendus, et affichées à part. Rien ici ne retourne au moteur.
  const orderedRecommendations = [...prescription.recommendations].sort(
    (a, b) => (b.opportunity?.priority ?? 0) - (a.opportunity?.priority ?? 0) || b.totalScore - a.totalScore,
  );
  const partnerCards: PartnerCardView[] = session.permissions.has(PERMISSIONS.PARTNERS_VIEW)
    ? selectCounterCards(
        orderedRecommendations.map((recommendation) => {
          const label = recommendation.product ? brandLabelOf(recommendation.product.name, recommendation.product.brand) : null;
          return {
            recommendationId: recommendation.id,
            category: recommendation.opportunity?.category ?? null,
            opportunityBlocked: recommendation.opportunity?.isBlocked ?? false,
            patientAnswer: recommendation.opportunity?.answer ?? null,
            status: recommendation.status,
            contraindicated: parseSuggestionVigilances(recommendation.vigilances).some((v) => v.level === "CONTRAINDICATION" && v.status === true),
            productBrandKey: label ? brandKey(label) : null,
          };
        }),
        await counterBrandsFor(session.scope),
      ).map(({ brandId, slug, name, partnerName, logoUrl, universe }) => ({ brandId, slug, name, partnerName, logoUrl, universe }))
    : [];

  const shortDateOf = (key: string) => {
    const shortDate = shortDates.get(key);
    return shortDate && (shortDate.level === "SOON" || shortDate.level === "URGENT") ? { daysLeft: shortDate.daysLeft, level: shortDate.level } : null;
  };

  return (
    <SaleWorkspace
      prescription={{
        id: prescription.id,
        reference: prescription.reference,
        status: prescription.status,
        verifiedAt: prescription.verifiedAt?.toISOString() ?? null,
        patientId: prescription.patientId,
        patientName: prescription.patient
          ? `${prescription.patient.firstName} ${prescription.patient.lastName.toUpperCase()}`
          : null,
        prescriberName: prescription.prescriberName,
        prescribedAt: prescription.prescribedAt?.toISOString().slice(0, 10) ?? null,
        source: prescription.source,
      }}
      patients={patientDataEnabled() ? patients : []}
      patientData={patientDataEnabled()}
      lines={prescription.lines.map((line) => {
        // La colonne confirmée prime toujours sur une relecture du texte : une
        // fois que le pharmacien a tranché, plus rien ne réinterprète.
        const stored = readSchedule(line.schedule);
        const parsed = stored ? null : parsePosology(line.posology);

        return {
        id: line.id,
        position: line.position,
        rawText: line.rawText,
        drugName: line.drugName ?? "",
        dosage: line.dosage ?? "",
        form: line.form ?? "",
        posology: line.posology ?? "",
        schedule: stored ?? parsed?.schedule ?? null,
        scheduleInferred: stored ? false : (parsed?.inferred ?? false),
        durationDays: line.durationDays,
        quantity: line.quantity,
        instructions: line.instructions ?? "",
        confidence: (line.fieldConfidence ?? {}) as Record<string, number>,
        unreadableFields: line.unreadableFields,
        confirmed: line.status === "CONFIRMED",
        purpose: line.explanation?.purpose ?? null,
        explanationSource: line.explanation?.source ?? null,
        official: line.specialty
          ? {
              cisCode: line.specialty.cisCode,
              name: line.specialty.name,
              pharmaceuticalForm: line.specialty.pharmaceuticalForm,
              substances: [
                ...new Set(line.specialty.compositions.map((item) => item.substanceLabel)),
              ],
              prescriptionConditions: line.specialty.prescriptionConditions.map(
                (item) => item.label,
              ),
              marketed: line.specialty.marketingStatus === "Commercialisée",
            }
          : null,
        availability: (() => {
          const held = availability.get(line.id);
          return held ? { state: held.state, quantity: held.quantity } : null;
        })(),
        identifiedBy: line.identifiedBy,
        candidates: proposals.get(line.id) ?? [],
        identificationRefusal: catalogLoaded
          ? (refusals.get(line.id) ?? null)
          : "Aucun catalogue officiel n'est chargé dans PharmaBoost.",
        strengthOptions: strengthOptions.get(line.id) ?? [],
        cisCode: line.specialty?.cisCode ?? null,
        regulation: { alerts: regulationByLine.get(line.id) ?? [], checked: line.regulationChecks.map((check) => check.code) },
        };
      })}
      catalogAttribution={attribution}
      identificationChangedSinceAnalysis={identificationChangedSinceAnalysis}
      patientFactors={patientFactors}
      findings={
        run?.safetyFindings.map((finding) => ({
          id: finding.id,
          severity: finding.severity,
          code: finding.code,
          message: finding.message,
          subjectType: finding.subjectType,
          acknowledged: Boolean(finding.acknowledgedAt),
          details: isVigilanceDetails(finding.details) ? finding.details : null,
        })) ?? []
      }
      blockedOpportunities={
        run?.opportunities.map((opportunity) => ({
          id: opportunity.id,
          title: opportunity.title,
          blockReason: opportunity.blockReason,
        })) ?? []
      }
      recommendations={[...prescription.recommendations]
        // La priorité clinique de l'opportunité commande l'ordre des cartes ;
        // le score ne départage qu'à priorité égale. Un conseil de sécurité
        // ou de tolérance passe avant un conseil de confort, quel que soit le
        // produit trouvé.
        .sort(
          (a, b) =>
            (b.opportunity?.priority ?? 0) - (a.opportunity?.priority ?? 0) ||
            b.totalScore - a.totalScore,
        )
        .map((recommendation) => {
        const breakdown = (recommendation.scoreBreakdown ?? {}) as Record<string, unknown> & {
          explanation?: ScoreContribution[];
        };

        return {
          id: recommendation.id,
          lineIds: recommendation.opportunity?.triggeredLineIds ?? [],
          alternatives: (storedAlternatives.get(recommendation.id) ?? [])
            .flatMap((alternative) => {
              const found = alternativeProducts.get(alternative.productId);
              const quantity = found?.stockItem?.quantity ?? 0;
              // La référence déjà retenue ne se propose pas à côté d'elle-même
              // (un remplacement à la main a pu la rapprocher de cette liste).
              if (!found || quantity <= 0 || found.id === recommendation.productId) return [];
              return [
                {
                  productId: found.id,
                  name: found.name,
                  brand: found.brand,
                  imageUrl: found.imageUrl,
                  salePriceCents: found.salePriceCents,
                  quantity,
                  shortReason: alternative.shortReason || null,
                },
              ];
            })
            .slice(0, MAX_ALTERNATIVES_PER_ADVICE),
          status: recommendation.status,
          origin: recommendation.origin,
          // Une présentation du catalogue national est un médicament conseil ; sinon la catégorie du produit décide, et sans produit : parapharmacie.
          family: adviceFamilyOf({ presentationId: recommendation.presentation?.id ?? null, category: recommendation.product?.category ?? "AUTRE" }),
          totalScore: recommendation.totalScore,
          justification: recommendation.justification,
          shortReason: recommendation.shortReason,
          patientReason: recommendation.patientReason,
          counterScript: recommendation.counterScript,
          precautions: recommendation.precautions,
          quantity: recommendation.quantity,
          unitPriceCents: recommendation.unitPriceCents,
          pharmacistNote: recommendation.pharmacistNote,
          decidedBy: recommendation.decidedBy
            ? `${recommendation.decidedBy.firstName} ${recommendation.decidedBy.lastName}`
            : null,
          explanation: Array.isArray(breakdown.explanation) ? breakdown.explanation : [],
          opportunity: recommendation.opportunity
            ? {
                id: recommendation.opportunity.id,
                title: recommendation.opportunity.title,
                rationale: recommendation.opportunity.rationale,
                clinicalContext: recommendation.opportunity.clinicalContext,
                priority: recommendation.opportunity.priority,
                safetyNotes: recommendation.opportunity.safetyNotes,
                question: recommendation.opportunity.question,
                requiresConfirmation: recommendation.opportunity.requiresConfirmation,
                answer: recommendation.opportunity.answer,
                answeredAt: recommendation.opportunity.answeredAt?.toISOString() ?? null,
                aiJustification: recommendation.opportunity.aiJustification,
                confirmedReason: recommendation.opportunity.confirmedReason,
                benefits: recommendation.opportunity.benefits,
              }
            : null,
          routine: isRoutineStep(recommendation.routine) ? recommendation.routine : null,
          product: recommendation.product
            ? {
                id: recommendation.product.id,
                presentationId: null,
                name: recommendation.product.name,
                brand: recommendation.product.brand,
                imageUrl: recommendation.product.imageUrl,
                imageSource: recommendation.product.imageSource,
                salePriceCents: recommendation.product.salePriceCents,
                purchasePriceCents: recommendation.product.purchasePriceCents,
                quantity: recommendation.product.stockItem?.quantity ?? 0,
                alertThreshold: recommendation.product.stockItem?.alertThreshold ?? 0,
                claims: recommendation.product.commercialClaims,
              }
            : recommendation.presentation
              ? {
                  id: recommendation.presentation.id,
                  presentationId: recommendation.presentation.id,
                  name: recommendation.presentation.specialty.name,
                  brand: null,
                  imageUrl: recommendation.presentation.imageUrl,
                  imageSource: recommendation.presentation.imageSource,
                  salePriceCents: recommendation.presentation.pharmacyStocks[0]?.priceCents ?? recommendation.presentation.priceCents ?? 0,
                  quantity: recommendation.presentation.pharmacyStocks[0]?.quantity ?? 0,
                  alertThreshold: recommendation.presentation.pharmacyStocks[0]?.alertThreshold ?? 0,
                  claims: [],
                }
              : null,
          companion: isCompanion(recommendation.companion) ? recommendation.companion : null,
          vigilances: parseSuggestionVigilances(recommendation.vigilances),
          requiresValidation: requiresPharmacistValidation(parseSuggestionVigilances(recommendation.vigilances)),
          shortDate: recommendation.product
            ? shortDateOf(`p:${recommendation.product.id}`)
            : recommendation.presentation
              ? shortDateOf(`d:${recommendation.presentation.id}`)
              : null,
          trainings: recommendation.product ? (trainingsByProduct.get(recommendation.product.id) ?? []) : [],
        };
      })}
      analysisRunId={run?.id ?? null}
      trace={
        run
          ? {
              stages: (run.traceJson ?? []) as PipelineStageTrace[],
              engineVersion: run.engineVersion,
              durationMs: run.durationMs,
              providers: (run.providers ?? {}) as Record<string, unknown>,
            }
          : null
      }
      understanding={(() => {
        const stored = run?.understanding as
          | { providerId?: string; context?: { summary?: string; confidence?: number } }
          | null
          | undefined;
        if (!stored?.context?.summary) return null;
        return {
          summary: stored.context.summary,
          confidence: stored.context.confidence ?? 0,
          providerId: stored.providerId ?? "",
        };
      })()}
      permissions={{
        verify: session.permissions.has(PERMISSIONS.PRESCRIPTION_VERIFY),
        decide: session.permissions.has(PERMISSIONS.RECOMMENDATION_DECIDE),
        sell: session.permissions.has(PERMISSIONS.SALE_CREATE),
      }}
      hasSale={prescription.sales.length > 0}
      outcome={
        run
          ? isEngineOutcome(run.outcome)
            ? run.outcome
            : null
          : // Confirmée mais sans analyse enregistrée : l'analyse s'est interrompue — sauf si elle est en train de tourner.
            (prescription.status === "ANALYZING" && !analysisInFlight) || prescription.status === "FAILED"
            ? "ENGINE_ERROR"
            : null
      }
      analysisInFlight={analysisInFlight}
      stockNotice={stockNotice}
      canImportStock={session.permissions.has(PERMISSIONS.PRODUCT_IMPORT)}
      partnerCards={partnerCards}
    />
  );
}
