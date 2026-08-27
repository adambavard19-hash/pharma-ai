"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import {
  Check,
  ChevronDown,
  Package,
  Pencil,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  acceptRecommendationAction,
  addManualRecommendationAction,
  modifyRecommendationAction,
  removeRecommendationAction,
  replaceRecommendationAction,
} from "@/server/actions/recommendations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert, Progress } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { RECOMMENDATION_STATUS } from "@/config/statuses";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductPicker } from "./product-picker";
import { ScoreExplanation } from "./score-explanation";
import type { ScoreContribution } from "@/core/ai/types";

export type CopilotRecommendation = {
  id: string;
  status: string;
  origin: string;
  totalScore: number;
  justification: string;
  patientReason: string | null;
  precautions: string[];
  quantity: number;
  unitPriceCents: number;
  pharmacistNote: string | null;
  decidedBy: string | null;
  explanation: ScoreContribution[];
  opportunity: {
    title: string;
    rationale: string;
    clinicalContext: string | null;
    priority: number;
    safetyNotes: string[];
  } | null;
  product: {
    id: string;
    name: string;
    brand: string | null;
    imageUrl: string | null;
    salePriceCents: number;
    quantity: number;
    alertThreshold: number;
    claims: string[];
  } | null;
};

/**
 * Tableau de validation du pharmacien.
 *
 * Quatre décisions, toujours à portée de clic : ACCEPTER, MODIFIER, REMPLACER,
 * SUPPRIMER. Chacune est enregistrée avec son auteur et son horodatage.
 */
export function CopilotBoard({
  prescriptionId,
  recommendations,
  canDecide,
}: {
  prescriptionId: string;
  recommendations: CopilotRecommendation[];
  canDecide: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const pending = recommendations.filter((r) => r.status === "PROPOSED");
  const decided = recommendations.filter(
    (r) => r.status !== "PROPOSED" && r.status !== "REMOVED",
  );
  const removed = recommendations.filter((r) => r.status === "REMOVED");

  return (
    <div className="space-y-5">
      {pending.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
              <Sparkles className="size-4 text-brand-600 dark:text-brand-400" />
              À valider ({pending.length})
            </h2>
          </div>
          {pending.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id}
              recommendation={recommendation}
              canDecide={canDecide}
            />
          ))}
        </section>
      )}

      {decided.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Retenus pour le patient ({decided.length})
          </h2>
          {decided.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id}
              recommendation={recommendation}
              canDecide={canDecide}
            />
          ))}
        </section>
      )}

      {canDecide && (
        <>
          <Button
            variant="outline"
            size="lg"
            className="w-full border-dashed"
            onClick={() => setAddOpen(true)}
            leadingIcon={<Plus className="size-[18px]" />}
          >
            Ajouter un conseil
          </Button>

          <AddAdviceModal
            open={addOpen}
            onClose={() => setAddOpen(false)}
            prescriptionId={prescriptionId}
          />
        </>
      )}

      {removed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[13px] font-medium text-text-tertiary">
            Retirés ({removed.length})
          </h2>
          <ul className="space-y-1.5">
            {removed.map((recommendation) => (
              <li
                key={recommendation.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border-subtle bg-surface-sunken/50 px-3.5 py-2.5"
              >
                <span className="text-[13px] text-text-secondary line-through">
                  {recommendation.product?.name ?? "Produit supprimé"}
                </span>
                {recommendation.pharmacistNote && (
                  <span className="text-[12px] text-text-tertiary">
                    « {recommendation.pharmacistNote} »
                  </span>
                )}
                {recommendation.decidedBy && (
                  <span className="ml-auto text-[11.5px] text-text-tertiary">
                    {recommendation.decidedBy}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RecommendationCard({
  recommendation,
  canDecide,
}: {
  recommendation: CopilotRecommendation;
  canDecide: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [modifyOpen, setModifyOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const { push } = useToast();

  const status = RECOMMENDATION_STATUS[recommendation.status];
  const product = recommendation.product;
  const outOfStock = product ? product.quantity <= 0 : false;
  const lowStock = product ? product.quantity > 0 && product.quantity <= product.alertThreshold : false;

  const run = (
    action: () => Promise<{ ok: boolean; error?: string; message?: string }>,
  ) => {
    startTransition(async () => {
      const result = await action();
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (result.message ?? "Enregistré") : (result.error ?? "Erreur"),
      });
    });
  };

  return (
    <Card
      className={cn(
        recommendation.status === "PROPOSED"
          ? "border-brand-200 dark:border-brand-800/60"
          : "border-border-subtle",
      )}
    >
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-start gap-4">
          {product?.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt=""
              width={80}
              height={80}
              className="size-20 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-tertiary">
              <Package className="size-6" />
            </span>
          )}

          <div className="min-w-[200px] flex-1 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <p className="text-[15px] font-semibold text-text-primary">
                  {product?.name ?? "Produit supprimé"}
                </p>
                {product?.brand && (
                  <p className="text-[12.5px] text-text-tertiary">{product.brand}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <Badge tone={status.tone}>{status.label}</Badge>
                {recommendation.origin === "MANUAL" && (
                  <Badge tone="brand">Ajouté par le pharmacien</Badge>
                )}
              </div>
            </div>

            {recommendation.opportunity && (
              <div className="rounded-lg bg-brand-50/70 px-3 py-2 dark:bg-brand-950/60">
                <p className="text-[12px] font-semibold text-brand-800 dark:text-brand-300">
                  {recommendation.opportunity.title}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-5 text-text-secondary">
                  {recommendation.opportunity.rationale}
                </p>
                {recommendation.opportunity.clinicalContext && (
                  <p className="mt-1 text-[11.5px] leading-4 text-text-tertiary">
                    {recommendation.opportunity.clinicalContext}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
              <span className="font-semibold text-text-primary tabular">
                {formatCents(recommendation.unitPriceCents || (product?.salePriceCents ?? 0))}
              </span>
              <Badge tone={outOfStock ? "danger" : lowStock ? "warning" : "success"}>
                {outOfStock
                  ? "En rupture"
                  : lowStock
                    ? `Stock faible — ${product?.quantity}`
                    : `${product?.quantity ?? 0} en stock`}
              </Badge>
              {recommendation.quantity > 1 && (
                <span className="text-text-secondary">
                  Quantité conseillée : {recommendation.quantity}
                </span>
              )}
            </div>

            {recommendation.precautions.length > 0 && (
              <ul className="space-y-0.5">
                {recommendation.precautions.map((precaution) => (
                  <li
                    key={precaution}
                    className="text-[12px] leading-4 text-warning-700 dark:text-warning-500"
                  >
                    ⚠ {precaution}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {recommendation.origin === "AI" && (
            <div className="w-full shrink-0 space-y-1.5 sm:w-36">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11.5px] font-medium text-text-tertiary">
                  Pertinence
                </span>
                <span className="text-[13px] font-semibold tabular text-text-primary">
                  {Math.round(recommendation.totalScore * 100)} %
                </span>
              </div>
              <Progress
                value={recommendation.totalScore}
                tone={
                  recommendation.totalScore > 0.7
                    ? "success"
                    : recommendation.totalScore > 0.5
                      ? "brand"
                      : "warning"
                }
                label="Score de pertinence"
              />
              <button
                type="button"
                onClick={() => setShowExplanation((v) => !v)}
                className="flex w-full items-center justify-between gap-1 text-left text-[11.5px] text-brand-700 hover:underline dark:text-brand-400"
                aria-expanded={showExplanation}
              >
                Pourquoi ce produit ?
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    showExplanation && "rotate-180",
                  )}
                />
              </button>
            </div>
          )}
        </div>

        {showExplanation && (
          <ScoreExplanation
            contributions={recommendation.explanation}
            justification={recommendation.justification}
          />
        )}

        {recommendation.patientReason && (
          <div className="rounded-lg border border-border-subtle bg-surface-sunken/50 px-3.5 py-2.5">
            <p className="text-[11px] font-medium tracking-wide text-text-tertiary uppercase">
              Ce que verra le patient
            </p>
            <p className="mt-0.5 text-[13px] leading-5 text-text-primary">
              {recommendation.patientReason}
            </p>
          </div>
        )}

        {recommendation.pharmacistNote && (
          <p className="text-[12px] text-text-tertiary">
            Note : « {recommendation.pharmacistNote} »
            {recommendation.decidedBy && ` — ${recommendation.decidedBy}`}
          </p>
        )}

        {canDecide && (
          <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3.5">
            <Button
              size="sm"
              variant={recommendation.status === "PROPOSED" ? "success" : "outline"}
              loading={pending}
              onClick={() => run(() => acceptRecommendationAction(recommendation.id))}
              leadingIcon={<Check className="size-4" />}
            >
              Accepter
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setModifyOpen(true)}
              leadingIcon={<Pencil className="size-4" />}
            >
              Modifier
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReplaceOpen(true)}
              leadingIcon={<Repeat className="size-4" />}
            >
              Remplacer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/15"
              onClick={() => setRemoveOpen(true)}
              leadingIcon={<Trash2 className="size-4" />}
            >
              Supprimer
            </Button>
          </div>
        )}
      </CardContent>

      <ModifyModal
        open={modifyOpen}
        onClose={() => setModifyOpen(false)}
        recommendation={recommendation}
      />
      <ReplaceModal
        open={replaceOpen}
        onClose={() => setReplaceOpen(false)}
        recommendationId={recommendation.id}
        currentProductName={product?.name ?? ""}
      />
      <RemoveModal
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        recommendationId={recommendation.id}
        productName={product?.name ?? ""}
      />
    </Card>
  );
}

function ModifyModal({
  open,
  onClose,
  recommendation,
}: {
  open: boolean;
  onClose: () => void;
  recommendation: CopilotRecommendation;
}) {
  const [patientReason, setPatientReason] = useState(recommendation.patientReason ?? "");
  const [quantity, setQuantity] = useState(recommendation.quantity);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await modifyRecommendationAction({
        recommendationId: recommendation.id,
        patientReason,
        quantity,
        note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Conseil modifié" });
      onClose();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Modifier le conseil"
      description="Ajustez la formulation destinée au patient et la quantité conseillée."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} loading={pending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Field
          label="Ce que verra le patient"
          htmlFor="patientReason"
          required
          hint="Formulation claire, sans promesse thérapeutique excessive."
        >
          <Textarea
            id="patientReason"
            rows={3}
            value={patientReason}
            onChange={(event) => setPatientReason(event.target.value)}
          />
        </Field>

        <Field label="Quantité conseillée" htmlFor="quantity">
          <Input
            id="quantity"
            type="number"
            min={1}
            max={20}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
          />
        </Field>

        <Field
          label="Note interne"
          htmlFor="note"
          hint="Visible par votre équipe uniquement. Non transmise au patient."
        >
          <Input id="note" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function ReplaceModal({
  open,
  onClose,
  recommendationId,
  currentProductName,
}: {
  open: boolean;
  onClose: () => void;
  recommendationId: string;
  currentProductName: string;
}) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const replace = (productId: string) => {
    startTransition(async () => {
      const result = await replaceRecommendationAction({ recommendationId, newProductId: productId });
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (result.message ?? "Conseil remplacé") : result.error,
      });
      if (result.ok) onClose();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Remplacer la référence"
      description={`Choisissez une autre référence de votre stock à la place de « ${currentProductName} ».`}
      size="lg"
    >
      <ProductPicker onSelect={replace} disabled={pending} />
    </Modal>
  );
}

function RemoveModal({
  open,
  onClose,
  recommendationId,
  productName,
}: {
  open: boolean;
  onClose: () => void;
  recommendationId: string;
  productName: string;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const REASONS = [
    "Patient déjà supplémenté",
    "Non pertinent au vu du contexte",
    "Conseil déjà donné récemment",
    "Refus du patient",
  ];

  const submit = () => {
    startTransition(async () => {
      const result = await removeRecommendationAction({ recommendationId, reason });
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (result.message ?? "Conseil retiré") : result.error,
      });
      if (result.ok) onClose();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Retirer ce conseil"
      description={`« ${productName} » ne sera pas proposé au patient.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" onClick={submit} loading={pending}>
            Retirer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="info">
          Le motif alimente les statistiques de votre officine et aide le moteur à mieux cibler
          ses propositions. Il n&apos;est jamais transmis au patient.
        </Alert>

        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setReason(preset)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
                reason === preset
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-border-default text-text-secondary hover:border-border-strong",
              )}
            >
              {preset}
            </button>
          ))}
        </div>

        <Field label="Motif" htmlFor="reason">
          <Input
            id="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Précisez si nécessaire"
          />
        </Field>
      </div>
    </Modal>
  );
}

function AddAdviceModal({
  open,
  onClose,
  prescriptionId,
}: {
  open: boolean;
  onClose: () => void;
  prescriptionId: string;
}) {
  const [selected, setSelected] = useState<{ id: string; name: string; claim: string } | null>(
    null,
  );
  const [patientReason, setPatientReason] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const submit = () => {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const result = await addManualRecommendationAction({
        prescriptionId,
        productId: selected.id,
        patientReason:
          patientReason ||
          selected.claim ||
          "Conseil proposé par votre pharmacien dans le cadre de votre traitement.",
        quantity,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Conseil ajouté" });
      setSelected(null);
      setPatientReason("");
      onClose();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajouter un conseil"
      description="Recherchez une référence de votre stock et formulez la raison destinée au patient."
      size="lg"
      footer={
        selected ? (
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Changer de produit
            </Button>
            <Button onClick={submit} loading={pending}>
              Ajouter le conseil
            </Button>
          </>
        ) : undefined
      }
    >
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}

      {selected ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3 dark:border-brand-800/60 dark:bg-brand-950">
            <p className="text-[13.5px] font-medium text-text-primary">{selected.name}</p>
          </div>

          <Field
            label="Raison destinée au patient"
            htmlFor="manual-reason"
            required
            hint="Expliquez simplement pourquoi vous conseillez ce produit dans ce contexte."
          >
            <Textarea
              id="manual-reason"
              rows={3}
              value={patientReason}
              onChange={(event) => setPatientReason(event.target.value)}
              placeholder={selected.claim || "Ex. : accompagne le confort digestif pendant le traitement."}
            />
          </Field>

          <Field label="Quantité conseillée" htmlFor="manual-quantity">
            <Input
              id="manual-quantity"
              type="number"
              min={1}
              max={20}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </Field>
        </div>
      ) : (
        <ProductPicker
          onSelect={(id, product) =>
            setSelected({ id, name: product.name, claim: product.claims[0] ?? "" })
          }
          disabled={pending}
        />
      )}
    </Modal>
  );
}
