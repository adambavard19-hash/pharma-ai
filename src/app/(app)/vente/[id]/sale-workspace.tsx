"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Sparkles, User } from "lucide-react";
import { verifyPrescriptionAction } from "@/server/actions/prescriptions";
import { acceptRecommendationAction } from "@/server/actions/recommendations";
import { recordSaleAction } from "@/server/actions/sales";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatCents } from "@/lib/format";
import { PRESCRIPTION_STATUS } from "@/config/statuses";
import { PrescriptionZone } from "./prescription-zone";
import { SafetyZone } from "./safety-zone";
import { AdviceZone } from "./advice-zone";
import { PipelineTrace } from "./pipeline-trace";
import { ReanalyseButton } from "./reanalyse-button";
import { counterIsBlocked } from "@/core/ai/safety-gate";
import type {
  AdviceView,
  BlockedOpportunityView,
  SafetyFindingView,
  SaleLineDraft,
} from "./types";
import type { PipelineStageTrace } from "@/core/ai/types";

type BasketLine = { productId: string; quantity: number; unitPriceCents: number };

/**
 * L'écran de vente — les trois zones et la barre d'action, en une seule page.
 *
 * Le pharmacien ne change jamais d'écran entre le scan et l'encaissement : il
 * confirme l'ordonnance là où elle s'affiche, lit la sécurité juste en dessous,
 * tranche trois conseils, puis termine la vente. Une seule sortie, en bas.
 */
export function SaleWorkspace({
  prescription,
  patients,
  lines: initialLines,
  findings,
  blockedOpportunities,
  recommendations,
  analysisRunId,
  trace,
  permissions,
  simulatedExtraction,
  hasSale,
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
  patients: { id: string; firstName: string; lastName: string; reference: string }[];
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
  permissions: { verify: boolean; decide: boolean; sell: boolean };
  simulatedExtraction: boolean;
  hasSale: boolean;
}) {
  const [lines, setLines] = useState(initialLines);
  const [patientId, setPatientId] = useState(prescription.patientId ?? "");
  const [prescriberName, setPrescriberName] = useState(prescription.prescriberName ?? "");
  const [prescribedAt, setPrescribedAt] = useState(prescription.prescribedAt ?? "");
  const [forceEdit, setForceEdit] = useState(false);
  const [basket, setBasket] = useState<Map<string, BasketLine>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  // Les lignes sont éditées localement, mais l'analyse les enrichit côté
  // serveur (explication de traitement). On resynchronise dès que le serveur
  // renvoie une nouvelle version : sans cela, le résumé afficherait
  // indéfiniment l'état d'avant l'analyse.
  const [linesSource, setLinesSource] = useState(initialLines);
  if (linesSource !== initialLines) {
    setLinesSource(initialLines);
    setLines(initialLines);
  }

  // La phase est dictée par le serveur, jamais par un état local optimiste :
  // tant que l'analyse n'est pas revenue, on reste sur la vérification plutôt
  // que d'afficher un « aucun conseil » qui serait faux.
  const editing = forceEdit || !prescription.verifiedAt;
  const analysing = pending && !editing;

  const blocked = counterIsBlocked(findings);
  const confirmedCount = lines.filter((line) => line.confirmed).length;
  const status = PRESCRIPTION_STATUS[prescription.status];

  const basketTotal = useMemo(
    () =>
      [...basket.values()].reduce(
        (sum, line) => sum + line.unitPriceCents * line.quantity,
        0,
      ),
    [basket],
  );

  const updateLine = (id: string, patch: Partial<SaleLineDraft>) =>
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );

  const toggleBasket = (recommendation: AdviceView) => {
    if (!recommendation.product) return;
    const product = recommendation.product;

    setBasket((current) => {
      const next = new Map(current);
      if (next.has(recommendation.id)) {
        next.delete(recommendation.id);
        return next;
      }
      next.set(recommendation.id, {
        productId: product.id,
        quantity: recommendation.quantity,
        unitPriceCents: recommendation.unitPriceCents || product.salePriceCents,
      });
      return next;
    });

    // Ajouter à la vente vaut validation professionnelle du conseil : on
    // enregistre la décision côté serveur, sans attendre l'encaissement. C'est
    // ce qui alimente le taux d'acceptation, distinct du taux d'achat.
    if (!basket.has(recommendation.id) && recommendation.status === "PROPOSED") {
      startTransition(async () => {
        await acceptRecommendationAction(recommendation.id);
      });
    }
  };

  const verify = () => {
    setError(null);
    startTransition(async () => {
      const result = await verifyPrescriptionAction({
        prescriptionId: prescription.id,
        patientId: patientId || null,
        prescriberName,
        prescribedAt,
        lines: lines.map((line) => ({
          id: line.id,
          drugName: line.drugName,
          dosage: line.dosage,
          form: line.form,
          posology: line.posology,
          durationDays: line.durationDays ?? undefined,
          quantity: line.quantity ?? undefined,
          instructions: line.instructions,
          confirmed: line.confirmed,
        })),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      push({
        tone: "success",
        title: "Ordonnance confirmée",
        description: `${result.data.recommendationCount} conseil(s) proposé(s).`,
      });
      setForceEdit(false);
      // Pas de `router.refresh()` : la revalidation faite par l'action renvoie
      // déjà les nouvelles données avec sa réponse. Mesuré — les conseils
      // s'affichent en 0,25 s sans rafraîchissement explicite.
    });
  };

  const finish = () => {
    setError(null);
    const lines = [...basket.entries()].map(([recommendationId, line]) => ({
      recommendationId,
      productId: line.productId,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
    }));

    if (lines.length === 0) {
      router.push(`/vente/${prescription.id}/fin`);
      return;
    }

    startTransition(async () => {
      const result = await recordSaleAction({
        prescriptionId: prescription.id,
        patientId: patientId || null,
        lines,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      push({
        tone: "success",
        title: "Vente enregistrée",
        description: `${formatCents(result.data.attributedCents)} attribués à Pharma.ai.`,
      });
      router.push(`/vente/${prescription.id}/fin`);
    });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl leading-7 font-semibold tracking-[-0.015em] text-text-primary">
            {prescription.patientName ?? "Patient non rattaché"}
          </h1>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <div className="flex items-center gap-3 text-[12.5px] text-text-tertiary">
          <span className="tabular">{prescription.reference}</span>
          {prescription.patientId && (
            <Link
              href={`/patients/${prescription.patientId}`}
              className="flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-400"
            >
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

      {/* La marge basse dégage le contenu de la barre d'action collante. */}
      <div className="space-y-7 pb-28">
        <PrescriptionZone
          editing={editing}
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
          simulatedExtraction={simulatedExtraction}
        />

        {!editing && analysing && (
          <Card>
            <CardContent className="flex items-center gap-3 py-6">
              <Loader2 className="size-[18px] shrink-0 animate-spin text-brand-600 dark:text-brand-400" />
              <p className="text-[13.5px] text-text-secondary">
                Analyse en cours — sécurité, puis conseils disponibles en rayon.
              </p>
            </CardContent>
          </Card>
        )}

        {!editing && !analysing && (
          <>
            <SafetyZone
              analysisRunId={analysisRunId}
              findings={findings}
              blockedOpportunities={blockedOpportunities}
              canAcknowledge={permissions.verify}
            />

            <AdviceZone
              prescriptionId={prescription.id}
              recommendations={recommendations}
              canDecide={permissions.decide}
              locked={blocked}
              inBasket={(id) => basket.has(id)}
              onToggleBasket={toggleBasket}
            />

            {trace && (
              <div className="space-y-3">
                <PipelineTrace
                  trace={trace.stages}
                  engineVersion={trace.engineVersion}
                  durationMs={trace.durationMs}
                  providers={trace.providers}
                />
                {permissions.verify && <ReanalyseButton prescriptionId={prescription.id} />}
              </div>
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-subtle bg-surface-card p-4 shadow-lg">
        {editing ? (
          <>
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-text-primary">
                {confirmedCount} ligne{confirmedCount > 1 ? "s" : ""} confirmée
                {confirmedCount > 1 ? "s" : ""} sur {lines.length}
              </p>
              <p className="text-[12px] text-text-tertiary">
                Seules les lignes confirmées alimentent l&apos;analyse et la fiche patient.
              </p>
            </div>
            <Button
              size="lg"
              onClick={verify}
              loading={pending}
              disabled={confirmedCount === 0 || !permissions.verify}
              leadingIcon={pending ? undefined : <Sparkles className="size-[18px]" />}
            >
              {pending ? "Analyse en cours…" : "Confirmer et analyser"}
            </Button>
          </>
        ) : (
          <>
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-text-primary">
                {basket.size === 0
                  ? "Aucun conseil ajouté à la vente"
                  : `${basket.size} conseil${basket.size > 1 ? "s" : ""} · ${formatCents(basketTotal)}`}
              </p>
              <p className="text-[12px] text-text-tertiary">
                {hasSale
                  ? "Une vente est déjà enregistrée pour cette ordonnance."
                  : "Le chiffre d'affaires n'est attribué qu'aux lignes issues d'un conseil."}
              </p>
            </div>
            <Button
              size="lg"
              onClick={finish}
              loading={pending}
              disabled={basket.size > 0 && !permissions.sell}
              leadingIcon={pending ? undefined : <ArrowRight className="size-[18px]" />}
            >
              {basket.size === 0 ? "Terminer sans vente" : "Terminer la vente"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
