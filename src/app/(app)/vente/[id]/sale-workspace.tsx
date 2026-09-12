"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Sparkles, User } from "lucide-react";
import { verifyPrescriptionAction } from "@/server/actions/prescriptions";
import {
  acceptRecommendationAction,
  reopenRecommendationAction,
} from "@/server/actions/recommendations";
import { recordSaleAction } from "@/server/actions/sales";
import { generateDocumentAction } from "@/server/actions/documents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PRESCRIPTION_STATUS } from "@/config/statuses";
import type { PatientOption } from "@/components/app/patient-picker";
import { PrescriptionZone } from "./prescription-zone";
import { TreatmentPanel } from "./treatment-panel";
import { ChecksNote } from "./checks-note";
import { SafetyZone } from "./safety-zone";
import { AdviceZone } from "./advice-zone";
import type { EngineOutcome } from "@/core/ai/outcome";
import { DeliveryZone, type DeliveryExtra } from "./delivery-zone";
import { counterIsBlocked } from "@/core/ai/safety-gate";
import { STAGE_LABELS, STAGE_ORDER, streamAnalysis } from "./analysis-stream";
import type { AnalysisStage } from "@/server/services/analysis";
import type {
  AdviceView,
  BlockedOpportunityView,
  PatientFactor,
  SafetyFindingView,
  SaleLineDraft,
} from "./types";
import type { PipelineStageTrace } from "@/core/ai/types";
import type { ProductSearchResult } from "@/app/api/produits/recherche/route";

type BasketLine = { productId: string | null; presentationId: string | null; quantity: number; unitPriceCents: number };

/**
 * Une ligne lue avec un nom est à confirmer par défaut : le pharmacien exclut
 * ce qu'il ne veut pas, il ne coche pas cinq fois ce qu'il vient de lire. Le
 * geste professionnel reste explicite — c'est le bouton, unique, qui confirme
 * l'ensemble.
 */
function withDefaultConfirmation(lines: SaleLineDraft[], alreadyVerified: boolean): SaleLineDraft[] {
  if (alreadyVerified) return lines;
  return lines.map((line) => ({
    ...line,
    confirmed: line.confirmed || Boolean(line.drugName.trim()),
  }));
}

/**
 * L'écran de vente.
 *
 * Un pharmacien, un patient devant lui, trente secondes. L'ordre de l'écran
 * est celui de l'urgence : ce qu'il y a à proposer d'abord, ce qu'il faut
 * vérifier ensuite, la délivrance, et tout le reste sous « Voir les détails ».
 *
 *   Ordonnance → l'IA comprend → PharmaBoost rappelle quoi proposer →
 *   le patient accepte ou refuse → terminé.
 */
export function SaleWorkspace({
  prescription,
  patients,
  lines: initialLines,
  findings,
  blockedOpportunities,
  recommendations,
  analysisRunId,
  permissions,
  catalogAttribution,
  identificationChangedSinceAnalysis,
  patientFactors,
  hasSale,
  outcome,
  canImportStock,
  stockNotice,
}: {
  prescription: {
    id: string;
    reference: string;
    status: string;
    verifiedAt: string | null;
    patientId: string | null;
    patientName: string | null;
    prescriberName: string | null;
    prescribedAt: string | null;
  };
  patients: PatientOption[];
  lines: SaleLineDraft[];
  findings: SafetyFindingView[];
  blockedOpportunities: BlockedOpportunityView[];
  recommendations: AdviceView[];
  analysisRunId: string | null;
  trace: {
    stages: PipelineStageTrace[];
    engineVersion: string;
    durationMs: number | null;
    providers: Record<string, unknown>;
  } | null;
  /** Le contexte thérapeutique compris par l'IA, s'il y en a un. */
  understanding: { summary: string; confidence: number; providerId: string } | null;
  permissions: { verify: boolean; decide: boolean; sell: boolean };
  /** Mention de source du catalogue national, exigée par sa licence. */
  catalogAttribution: string | null;
  /** Un rattachement a été décidé après la dernière analyse. */
  identificationChangedSinceAnalysis: boolean;
  /** Ce qui, dans le dossier du patient, a réellement pesé sur cette analyse. */
  patientFactors: PatientFactor[];
  hasSale: boolean;
  /** Pourquoi il y a — ou non — des propositions, d'après la dernière analyse. */
  outcome: EngineOutcome | null;
  canImportStock: boolean;
  /** De quand date le stock affiché, quand un agent LGO est connecté. */
  stockNotice: { tone: "ok" | "warning"; text: string } | null;
}) {
  const alreadyVerified = Boolean(prescription.verifiedAt);
  const [lines, setLines] = useState(() => withDefaultConfirmation(initialLines, alreadyVerified));
  const [patientId, setPatientId] = useState(prescription.patientId ?? "");
  const [prescriberName, setPrescriberName] = useState(prescription.prescriberName ?? "");
  const [prescribedAt, setPrescribedAt] = useState(prescription.prescribedAt ?? "");
  const [forceEdit, setForceEdit] = useState(false);
  // Une acceptation déjà enregistrée reste acceptée après un rechargement :
  // la carte reflète le serveur, pas seulement le dernier clic.
  const [basket, setBasket] = useState<Map<string, BasketLine>>(
    () =>
      new Map(
        recommendations
          .filter((r) => r.status === "ACCEPTED" && r.product)
          .map((r) => [
            r.id,
            {
              productId: r.product!.presentationId ? null : r.product!.id,
              presentationId: r.product!.presentationId,
              quantity: r.quantity,
              unitPriceCents: r.unitPriceCents || r.product!.salePriceCents,
            },
          ]),
      ),
  );
  const [extras, setExtras] = useState<Map<string, DeliveryExtra>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // L'étape d'analyse en cours, telle que le serveur l'annonce. `null` hors
  // analyse. C'est elle qui tient l'écran occupé — jamais un minuteur.
  const [stage, setStage] = useState<AnalysisStage | null>(null);
  const router = useRouter();
  const { push } = useToast();

  // Les lignes sont éditées localement, mais l'analyse les enrichit côté
  // serveur. On resynchronise dès que le serveur renvoie une nouvelle version.
  const [linesSource, setLinesSource] = useState(initialLines);
  if (linesSource !== initialLines) {
    setLinesSource(initialLines);
    setLines(withDefaultConfirmation(initialLines, alreadyVerified));
  }

  // Un conseil accepté côté serveur sans passer par la carte (produit associé,
  // conseil ajouté par le pharmacien) rejoint la délivrance dès que le serveur
  // le renvoie ; un prix renseigné après coup remplace le zéro provisoire.
  const [recommendationsSource, setRecommendationsSource] = useState(recommendations);
  if (recommendationsSource !== recommendations) {
    setRecommendationsSource(recommendations);
    setBasket((current) => {
      const next = new Map(current);
      let changed = false;
      for (const r of recommendations) {
        if (r.status !== "ACCEPTED" || !r.product) continue;
        const price = r.unitPriceCents || r.product.salePriceCents;
        const existing = next.get(r.id);
        if (!existing) {
          next.set(r.id, { productId: r.product.presentationId ? null : r.product.id, presentationId: r.product.presentationId, quantity: r.quantity, unitPriceCents: price });
          changed = true;
        } else if (existing.unitPriceCents === 0 && price > 0) {
          next.set(r.id, { ...existing, unitPriceCents: price });
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }

  // La phase est dictée par le serveur, jamais par un état local optimiste.
  const analysing = stage !== null;
  const editing = !analysing && (forceEdit || !prescription.verifiedAt);

  const blocked = counterIsBlocked(findings);
  const confirmedCount = lines.filter((line) => line.confirmed).length;
  const status = PRESCRIPTION_STATUS[prescription.status];

  const adviceTotal = useMemo(
    () => [...basket.values()].reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0),
    [basket],
  );
  const extrasTotal = useMemo(
    () => [...extras.values()].reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0),
    [extras],
  );
  const basketTotal = adviceTotal + extrasTotal;

  const updateLine = (id: string, patch: Partial<SaleLineDraft>) =>
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));

  /**
   * Le patient accepte.
   *
   * Deux effets, immédiats et indissociables : le produit entre dans la
   * délivrance et la décision est enregistrée nominativement — attribuée à la
   * personne connectée, sans qu'elle ait rien à choisir.
   */
  const acceptAdvice = (recommendation: AdviceView) => {
    if (!recommendation.product) return;
    const product = recommendation.product;

    setBasket((current) => {
      const next = new Map(current);
      next.set(recommendation.id, {
        productId: product.presentationId ? null : product.id,
        presentationId: product.presentationId,
        quantity: recommendation.quantity,
        unitPriceCents: recommendation.unitPriceCents || product.salePriceCents,
      });
      return next;
    });

    startTransition(async () => {
      const result = await acceptRecommendationAction(recommendation.id);
      if (!result.ok) {
        setBasket((current) => {
          const next = new Map(current);
          next.delete(recommendation.id);
          return next;
        });
        setError(result.error);
      }
    });
  };

  const cancelAdvice = (recommendation: AdviceView) => {
    setBasket((current) => {
      const next = new Map(current);
      next.delete(recommendation.id);
      return next;
    });
    startTransition(async () => {
      await reopenRecommendationAction(recommendation.id);
    });
  };

  const addExtra = (product: ProductSearchResult) => {
    setExtras((current) => {
      const next = new Map(current);
      const existing = next.get(product.id);
      next.set(product.id, {
        productId: product.id,
        name: product.name,
        brand: product.brand,
        quantity: (existing?.quantity ?? 0) + 1,
        unitPriceCents: product.salePriceCents,
      });
      return next;
    });
  };

  const removeExtra = (productId: string) => {
    setExtras((current) => {
      const next = new Map(current);
      next.delete(productId);
      return next;
    });
  };

  /**
   * Confirmer, puis analyser en montrant chaque étape.
   *
   * La vérification est enregistrée d'un bloc — c'est l'acte professionnel.
   * L'analyse, elle, arrive en flux : l'écran affiche l'étape que le serveur
   * vient de commencer, et bascule sur les propositions dès la fin.
   */
  const verify = () => {
    setError(null);
    startTransition(async () => {
      const result = await verifyPrescriptionAction({
        prescriptionId: prescription.id,
        patientId: patientId || null,
        prescriberName,
        prescribedAt,
        runAnalysis: false,
        lines: lines.map((line) => ({
          id: line.id,
          drugName: line.drugName,
          dosage: line.dosage,
          form: line.form,
          posology: line.posology,
          schedule: line.schedule,
          durationDays: line.durationDays ?? undefined,
          quantity: line.quantity ?? undefined,
          instructions: line.instructions,
          confirmed: line.confirmed && line.drugName.trim() !== "",
        })),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setForceEdit(false);
      setStage("IDENTIFICATION");
      const analysis = await streamAnalysis(prescription.id, setStage);
      setStage(null);

      if (!analysis.ok) {
        setError(analysis.error);
        router.refresh();
        return;
      }

      push({
        tone: "success",
        title: `Analyse terminée en ${(analysis.durationMs / 1000).toFixed(1)} s`,
        description:
          analysis.recommendationCount > 0
            ? `${analysis.recommendationCount} opportunité${analysis.recommendationCount > 1 ? "s" : ""} à proposer.`
            : "Aucune opportunité dans votre stock pour ce traitement.",
      });
      router.refresh();
    });
  };

  /**
   * Fin de la délivrance : la vente est enregistrée, le plan patient est généré
   * à partir des SEULES données validées, et l'écran de remise s'ouvre.
   */
  const finish = () => {
    setError(null);
    const saleLines = [
      ...[...basket.entries()].map(([recommendationId, line]) => ({
        recommendationId,
        productId: line.productId,
        presentationId: line.presentationId,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      })),
      // Sans `recommendationId` : ces lignes ne sont pas attribuées à PharmaBoost.
      ...[...extras.values()].map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      })),
    ];

    startTransition(async () => {
      if (saleLines.length > 0) {
        const sale = await recordSaleAction({
          prescriptionId: prescription.id,
          patientId: patientId || null,
          lines: saleLines,
        });
        if (!sale.ok) {
          setError(sale.error);
          return;
        }
      }

      const document = await generateDocumentAction({ prescriptionId: prescription.id });
      if (!document.ok) {
        push({ tone: "error", title: "Plan patient non généré", description: document.error });
      }

      router.push(`/vente/${prescription.id}/fin`);
    });
  };

  const alertFactors = patientFactors.filter((factor) => factor.tone === "warning");
  const neutralFactors = patientFactors.filter((factor) => factor.tone !== "warning");

  const analysisStage = analysing && stage && (
    <Card>
      <CardContent className="py-5">
        <ol className="space-y-2">
          <li className="flex items-center gap-3 text-[14px] text-text-secondary">
            <Check className="size-[18px] shrink-0 text-success-600 dark:text-success-500" />
            Ordonnance confirmée
          </li>
          {STAGE_ORDER.filter((step) => step !== "PERSIST").map((step) => {
            const position = STAGE_ORDER.indexOf(step);
            const current = STAGE_ORDER.indexOf(stage);
            const done = position < current;
            const active = position === current || (step === "ENGINE" && stage === "PERSIST");
            return (
              <li key={step} className={cn("flex items-center gap-3 text-[14px]", done ? "text-text-secondary" : active ? "font-medium text-text-primary" : "text-text-tertiary")}>
                {done ? (
                  <Check className="size-[18px] shrink-0 text-success-600 dark:text-success-500" />
                ) : active ? (
                  <Loader2 className="size-[18px] shrink-0 animate-spin text-brand-600 dark:text-brand-400" />
                ) : (
                  <span className="size-[18px] shrink-0" />
                )}
                {done ? STAGE_LABELS[step].replace("…", "") : STAGE_LABELS[step]}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-6xl">
      {/* ---- Le patient, en haut ------------------------------------------ */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-text-primary uppercase">
            {prescription.patientName ?? "Patient non rattaché"}
          </h1>
          <Badge tone={status.tone}>{status.label}</Badge>
          {alertFactors.map((factor) => (
            <Badge key={factor.label} tone="warning">
              {factor.label}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-text-tertiary">
          {neutralFactors.map((factor) => (
            <span key={factor.label}>{factor.label}</span>
          ))}
          <span className="tabular">{prescription.reference}</span>
          {prescription.patientId && (
            <Link href={`/patients/${prescription.patientId}`} className="flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-400">
              <User className="size-3.5" />
              Fiche patient
            </Link>
          )}
        </div>
      </header>

      {error && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {/* Une alerte bloquante passe avant tout, sur toute la largeur : rien ne
          se propose par-dessus. */}
      {!editing && !analysing && blocked && (
        <div className="mb-5">
          <SafetyZone analysisRunId={analysisRunId} findings={findings} blockedOpportunities={blockedOpportunities} canAcknowledge={permissions.verify} stale={identificationChangedSinceAnalysis} />
        </div>
      )}

      {/* ---- Traitement à gauche, conseils à droite ------------------------ */}
      <div className="grid items-start gap-6 pb-28 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          {editing && (
            <PrescriptionZone
              prescriptionId={prescription.id}
              editing
              lines={lines}
              onLineChange={updateLine}
              patients={patients}
              patientId={patientId}
              onPatientChange={setPatientId}
              prescriberName={prescriberName}
              onPrescriberChange={setPrescriberName}
              prescribedAt={prescribedAt}
              onPrescribedAtChange={setPrescribedAt}
              onEdit={() => setForceEdit(true)}
              canEdit={permissions.verify}
              catalogAttribution={catalogAttribution}
            />
          )}

          {analysisStage}

          {!editing && !analysing && (
            <>
              <TreatmentPanel lines={lines} canEdit={permissions.verify} onEdit={() => setForceEdit(true)} catalogAttribution={catalogAttribution} />
              <ChecksNote findings={findings} blockedOpportunities={blockedOpportunities} stale={identificationChangedSinceAnalysis} prescriptionId={prescription.id} />
            </>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          {(editing || analysing) && (
            <div className="rounded-2xl border border-dashed border-border-default px-5 py-6 text-[13.5px] leading-5 text-text-secondary">
              <p className="font-medium text-text-primary">Les conseils à proposer apparaîtront ici</p>
              <p className="mt-1">Après confirmation du traitement : au plus trois propositions, issues de votre stock, chacune avec son prix, sa raison et ce que vous dites au patient.</p>
            </div>
          )}

          {!editing && !analysing && (
            <>
              <AdviceZone prescriptionId={prescription.id} recommendations={recommendations} canDecide={permissions.decide} locked={blocked} outcome={outcome} canImportStock={canImportStock} stockNotice={stockNotice} inBasket={(id) => basket.has(id)} onAccept={acceptAdvice} onCancelAccept={cancelAdvice} />
              <DeliveryZone
                accepted={[...basket.entries()].map(([recommendationId, line]) => {
                  const recommendation = recommendations.find((r) => r.id === recommendationId);
                  return { id: recommendationId, name: recommendation?.product?.name ?? "Produit", quantity: line.quantity, unitPriceCents: line.unitPriceCents };
                })}
                extras={[...extras.values()]}
                onAddExtra={addExtra}
                onRemoveExtra={removeExtra}
                canSell={permissions.sell}
              />
            </>
          )}
        </div>
      </div>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-card p-3.5 shadow-lg sm:gap-4 sm:p-4">
        {editing ? (
          <>
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-text-primary">
                {confirmedCount} médicament{confirmedCount > 1 ? "s" : ""} à confirmer
                {lines.length > confirmedCount ? ` · ${lines.length - confirmedCount} exclu${lines.length - confirmedCount > 1 ? "s" : ""}` : ""}
              </p>
              <p className="hidden text-[12px] text-text-tertiary sm:block">
                Confirmer est votre acte professionnel : seules ces lignes alimentent l&apos;analyse.
              </p>
            </div>
            <Button
              size="lg"
              className="w-full sm:w-auto"
              onClick={verify}
              loading={pending}
              disabled={confirmedCount === 0 || !permissions.verify}
              leadingIcon={pending ? undefined : <Sparkles className="size-[18px]" />}
            >
              {pending
                ? "Analyse en cours…"
                : confirmedCount > 1
                  ? `Confirmer les ${confirmedCount} médicaments et analyser`
                  : "Confirmer et analyser"}
            </Button>
          </>
        ) : (
          <>
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-text-primary">
                {basket.size + extras.size === 0
                  ? "Rien à encaisser"
                  : [
                      basket.size > 0
                        ? `${basket.size} vente${basket.size > 1 ? "s" : ""} additionnelle${basket.size > 1 ? "s" : ""}`
                        : null,
                      extras.size > 0
                        ? `${extras.size} produit${extras.size > 1 ? "s" : ""} scanné${extras.size > 1 ? "s" : ""}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") + ` · ${formatCents(basketTotal)}`}
              </p>
              <p className="hidden text-[12px] text-text-tertiary sm:block">
                {hasSale
                  ? "Une vente est déjà enregistrée pour cette ordonnance."
                  : "Valider enregistre la délivrance et prépare le plan du patient."}
              </p>
            </div>
            <Button
              size="lg"
              className="w-full sm:w-auto"
              onClick={finish}
              loading={pending}
              disabled={basket.size + extras.size > 0 && !permissions.sell}
              leadingIcon={pending ? undefined : <ArrowRight className="size-[18px]" />}
            >
              {pending
                ? "Préparation du plan…"
                : "Valider et préparer le plan patient"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
