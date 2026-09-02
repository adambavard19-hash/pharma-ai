"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Loader2, Sparkles, User } from "lucide-react";
import {
  validatePrescriptionAction,
  verifyPrescriptionAction,
} from "@/server/actions/prescriptions";
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
import { blocksCounter, counterIsBlocked } from "@/core/ai/safety-gate";
import { SummaryBand, buildSummaryRows } from "./summary-band";
import type {
  AdviceView,
  BlockedOpportunityView,
  PatientFactor,
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
  preconfirmed,
  catalogAttribution,
  identificationChangedSinceAnalysis,
  patientFactors,
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
  /**
   * Toutes les lignes ont été retenues par la lecture seule et l'analyse a déjà
   * tourné — mais aucun pharmacien n'a encore validé. L'écran montre tout, et
   * la barre du bas porte l'acte qui manque.
   */
  preconfirmed: boolean;
  /** Mention de source du catalogue national, exigée par sa licence. */
  catalogAttribution: string | null;
  /** Un rattachement a été décidé après la dernière analyse. */
  identificationChangedSinceAnalysis: boolean;
  /** Ce qui, dans le dossier du patient, a réellement pesé sur cette analyse. */
  patientFactors: PatientFactor[];
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
  //
  // Une ordonnance intégralement lue s'ouvre directement sur l'écran complet,
  // sans passer par la saisie ligne à ligne : c'est tout l'objet de la
  // pré-confirmation. Il reste un acte à poser — la validation — et il est dans
  // la barre du bas.
  const editing = forceEdit || (!prescription.verifiedAt && !preconfirmed);
  const analysing = pending && !editing;
  /** L'ordonnance est affichée en entier mais n'engage encore personne. */
  const needsValidation = !prescription.verifiedAt && !editing;

  const blocked = counterIsBlocked(findings);
  const confirmedCount = lines.filter((line) => line.confirmed).length;
  const status = PRESCRIPTION_STATUS[prescription.status];

  // Les quatre chiffres du bandeau. Tous dérivés de ce que le moteur a produit :
  // aucun n'est estimé, aucun n'est arrondi.
  const summaryRows = useMemo(() => {
    const confirmed = lines.filter((line) => line.confirmed);
    const decided = new Set(["DECLINED", "REMOVED", "PURCHASED"]);
    const openRecommendations = recommendations.filter(
      (recommendation) =>
        !decided.has(recommendation.status) &&
        (!recommendation.product || recommendation.product.quantity > 0),
    );

    return buildSummaryRows({
      blockingCount: findings.filter(blocksCounter).length,
      // La couverture du référentiel d'interactions n'est pas un point de
      // vigilance de CETTE ordonnance : c'est une propriété de l'outil, dite
      // en clair dans la zone sécurité. La compter ici afficherait un point
      // d'attention permanent, que plus personne ne lirait au bout d'un jour.
      attentionCount: findings.filter(
        (finding) =>
          (finding.severity === "WARNING" || finding.severity === "CAUTION") &&
          finding.code !== "INTERACTION_NO_REFERENTIAL",
      ).length,
      lineCount: confirmed.length,
      inStock: confirmed.filter((line) => line.availability?.state === "IN_STOCK").length,
      // « À commander » réunit le référencé épuisé et le non référencé : dans les
      // deux cas la boîte n'est pas là. L'état inconnu, lui, reste à part — ne
      // pas savoir n'est pas une rupture.
      missing: confirmed.filter(
        (line) =>
          line.availability?.state === "REFERENCED_EMPTY" ||
          line.availability?.state === "NOT_REFERENCED",
      ).length,
      unknown: confirmed.filter(
        (line) => !line.availability || line.availability.state === "UNKNOWN",
      ).length,
      explainedCount: confirmed.filter((line) => line.purpose !== null).length,
      recommendationCount: openRecommendations.length,
      locked: blocked,
      awaitingValidation: needsValidation,
    });
  }, [lines, findings, recommendations, blocked, needsValidation]);

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

    startTransition(async () => {
      // La validation passe AVANT l'enregistrement de la vente : une vente
      // adossée à une ordonnance que personne n'a validée n'aurait pas de
      // signataire. Si elle échoue, on s'arrête là.
      if (needsValidation) {
        const validated = await validatePrescriptionAction(prescription.id);
        if (!validated.ok) {
          setError(validated.error);
          return;
        }
      }

      if (lines.length === 0) {
        router.push(`/vente/${prescription.id}/fin`);
        return;
      }

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

  const alertFactors = patientFactors.filter((factor) => factor.tone === "warning");
  const neutralFactors = patientFactors.filter((factor) => factor.tone !== "warning");

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
          {/* L'âge se lit à côté de la référence : il sert de repère permanent,
              pas d'alerte. La ligne de badges reste réservée à ce qui doit
              arrêter le regard. */}
          {neutralFactors.map((factor) => (
            <span key={factor.label}>{factor.label}</span>
          ))}
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

      {/* Ce qui, dans le dossier, a réellement pesé sur l'analyse et doit être
          vu — allergies, grossesse, pathologies. Un patient sans particularité
          n'occupe pas de ligne : le reste de la fiche est à un clic. */}
      {alertFactors.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {alertFactors.map((factor) => (
            <Badge key={factor.label} tone="warning">
              {factor.label}
            </Badge>
          ))}
        </div>
      )}

      {error && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {/* La marge basse dégage le contenu de la barre d'action collante. */}
      <div className="space-y-6 pb-28">
        {/* Le bandeau ouvre l'écran : c'est lui qu'on lit en deux secondes, et
            il conduit aux zones plutôt que de les répéter. */}
        {!editing && !analysing && <SummaryBand rows={summaryRows} />}

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
          awaitingValidation={needsValidation}
          catalogAttribution={catalogAttribution}
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
              stale={identificationChangedSinceAnalysis}
            />

            <AdviceZone
              prescriptionId={prescription.id}
              recommendations={recommendations}
              canDecide={permissions.decide}
              locked={blocked}
              inBasket={(id) => basket.has(id)}
              onToggleBasket={toggleBasket}
            />

            {/* Ce qui vient après la vente, annoncé sans être simulé. Aucun
                envoi n'est branché : le lot C s'en chargera, et d'ici là
                l'écran ne prétend rien. */}
            <p className="flex items-center gap-2 text-[12.5px] text-text-tertiary">
              <FileText className="size-3.5 shrink-0" />
              Compte rendu patient — sera préparé à l&apos;étape suivante, à partir des
              conseils que vous aurez validés.
            </p>

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
                {needsValidation
                  ? "Les lignes ont été retenues par la lecture. Votre validation les signe."
                  : hasSale
                    ? "Une vente est déjà enregistrée pour cette ordonnance."
                    : "Le chiffre d'affaires n'est attribué qu'aux lignes issues d'un conseil."}
              </p>
            </div>
            <Button
              size="lg"
              onClick={finish}
              loading={pending}
              disabled={
                (basket.size > 0 && !permissions.sell) ||
                (needsValidation && !permissions.verify)
              }
              leadingIcon={pending ? undefined : <ArrowRight className="size-[18px]" />}
            >
              {needsValidation
                ? basket.size === 0
                  ? "Valider et poursuivre"
                  : "Valider et terminer la vente"
                : basket.size === 0
                  ? "Continuer la délivrance"
                  : "Terminer la vente"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
