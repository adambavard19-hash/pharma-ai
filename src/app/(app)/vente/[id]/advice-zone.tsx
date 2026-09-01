"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import {
  ChevronDown,
  Lock,
  MessageSquareQuote,
  Package,
  Plus,
  ShoppingBasket,
  X,
} from "lucide-react";
import {
  addManualRecommendationAction,
  declineRecommendationAction,
  modifyRecommendationAction,
  presentRecommendationAction,
  removeRecommendationAction,
  replaceRecommendationAction,
} from "@/server/actions/recommendations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductPicker } from "./product-picker";
import { ScoreExplanation } from "./score-explanation";
import { ZoneTitle } from "./prescription-zone";
import type { AdviceView } from "./types";

/**
 * Zone 3 — les conseils.
 *
 * Trois conseils au maximum, trois décisions au comptoir : PROPOSÉ (je l'ai dit
 * au patient), AJOUTÉ À LA VENTE, REFUSÉ (le patient n'a pas voulu). Les gestes
 * plus fins — changer de référence, ajuster la formulation, retirer une
 * proposition jugée non pertinente — restent disponibles, en second rang, pour
 * ne pas alourdir la décision principale.
 */
export function AdviceZone({
  prescriptionId,
  recommendations,
  canDecide,
  locked,
  inBasket,
  onToggleBasket,
}: {
  prescriptionId: string;
  recommendations: AdviceView[];
  canDecide: boolean;
  locked: boolean;
  inBasket: (id: string) => boolean;
  onToggleBasket: (recommendation: AdviceView) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const decided = new Set(["DECLINED", "REMOVED", "PURCHASED"]);
  const open = recommendations.filter((r) => !decided.has(r.status));
  const available = open.filter((r) => !r.product || r.product.quantity > 0);
  const unavailable = open.filter((r) => r.product && r.product.quantity <= 0);
  const closed = recommendations.filter((r) => decided.has(r.status));

  return (
    <section className="space-y-3" aria-labelledby="zone-conseils">
      {/* Tant que la sécurité n'est pas acquittée, le compteur reste muet : le
          bandeau annonce « en attente », le titre ne doit pas déjà annoncer une
          proposition tenue en réserve. */}
      <ZoneTitle
        id="zone-conseils"
        step={3}
        title={!locked && available.length > 0 ? `Conseils (${available.length})` : "Conseils"}
      />

      {locked ? (
        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 py-5">
            <Lock className="mt-0.5 size-[18px] shrink-0 text-text-tertiary" />
            <div className="space-y-1">
              <p className="text-[14px] font-medium text-text-primary">
                Conseils en attente de la vérification de sécurité
              </p>
              <p className="text-[13px] leading-5 text-text-secondary">
                Une alerte bloquante est ouverte au-dessus. Acquittez-la pour ouvrir les
                conseils : aucune vente ne se fait par-dessus une alerte non lue.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {available.map((recommendation) => (
            <AdviceCard
              key={recommendation.id}
              recommendation={recommendation}
              canDecide={canDecide}
              added={inBasket(recommendation.id)}
              onToggleBasket={() => onToggleBasket(recommendation)}
            />
          ))}

          {available.length === 0 && (
            <Card>
              <EmptyState
                icon={<MessageSquareQuote className="size-5" />}
                title="Aucun conseil à proposer"
                description="Le moteur n'a identifié aucune opportunité pertinente et disponible en rayon pour ce traitement. Vous pouvez en ajouter un vous-même."
              />
            </Card>
          )}

          {unavailable.length > 0 && (
            <Alert tone="neutral" title="Écartés faute de stock">
              {unavailable.map((r) => r.product?.name).filter(Boolean).join(", ")} —
              proposition retirée du comptoir : Pharma.ai ne conseille pas ce qu&apos;il ne peut
              pas délivrer aujourd&apos;hui.
            </Alert>
          )}

          {canDecide && (
            <>
              <Button
                variant="outline"
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

          {closed.length > 0 && <ClosedList recommendations={closed} />}
        </>
      )}
    </section>
  );
}

function ClosedList({ recommendations }: { recommendations: AdviceView[] }) {
  const LABELS: Record<string, string> = {
    PURCHASED: "Acheté",
    DECLINED: "Refusé par le patient",
    REMOVED: "Retiré",
  };

  return (
    <ul className="space-y-1.5">
      {recommendations.map((recommendation) => (
        <li
          key={recommendation.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border-subtle bg-surface-sunken/50 px-3.5 py-2.5"
        >
          <span
            className={cn(
              "text-[13px]",
              recommendation.status === "PURCHASED"
                ? "font-medium text-text-primary"
                : "text-text-secondary line-through",
            )}
          >
            {recommendation.product?.name ?? "Produit supprimé"}
          </span>
          <span className="text-[12px] text-text-tertiary">
            {LABELS[recommendation.status] ?? recommendation.status}
          </span>
          {recommendation.pharmacistNote && (
            <span className="text-[12px] text-text-tertiary">
              « {recommendation.pharmacistNote} »
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function AdviceCard({
  recommendation,
  canDecide,
  added,
  onToggleBasket,
}: {
  recommendation: AdviceView;
  canDecide: boolean;
  added: boolean;
  onToggleBasket: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [modifyOpen, setModifyOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const { push } = useToast();

  const product = recommendation.product;
  const lowStock = product ? product.quantity > 0 && product.quantity <= product.alertThreshold : false;
  const presented = recommendation.status === "PRESENTED";

  const run = (action: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    startTransition(async () => {
      const result = await action();
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (result.message ?? "Enregistré") : (result.error ?? "Erreur"),
      });
    });
  };

  return (
    <Card className={cn(added && "border-brand-400 dark:border-brand-700")}>
      <CardContent className="space-y-2.5 pt-4 pb-4">
        <div className="flex items-start gap-3">
          {product?.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt=""
              width={44}
              height={44}
              className="size-11 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-tertiary">
              <Package className="size-4" />
            </span>
          )}

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <p className="min-w-0 text-[14.5px] leading-5 font-semibold text-text-primary">
                {product?.name ?? "Produit supprimé"}
                {product?.brand && (
                  <span className="ml-1.5 text-[12px] font-normal text-text-tertiary">
                    {product.brand}
                  </span>
                )}
              </p>
              <span className="ml-auto flex shrink-0 items-center gap-2 text-[13.5px]">
                <span className="font-semibold tabular text-text-primary">
                  {formatCents(recommendation.unitPriceCents || (product?.salePriceCents ?? 0))}
                </span>
                <Badge tone={lowStock ? "warning" : "success"}>
                  {lowStock
                    ? `Plus que ${product?.quantity}`
                    : `${product?.quantity ?? 0} en stock`}
                </Badge>
              </span>
            </div>

            {/* La raison en une ligne, produite par la règle de conseil. Le
                pharmacien doit comprendre POURQUOI sans ouvrir quoi que ce
                soit ; la version longue est sous « Voir le détail ». */}
            {(recommendation.shortReason ?? recommendation.opportunity?.rationale) && (
              <p className="text-[12.5px] leading-[1.45] text-text-secondary">
                {recommendation.shortReason ?? recommendation.opportunity?.rationale}
              </p>
            )}

            {recommendation.precautions.length > 0 && (
              <p className="text-[11.5px] leading-4 text-warning-700 dark:text-warning-500">
                ⚠ {recommendation.precautions.join(" · ")}
              </p>
            )}
          </div>
        </div>

        {/* La phrase à dire n'apparaît qu'une fois la proposition retenue :
            avant la décision elle n'aide pas, et trois scripts empilés
            remplissent l'écran de texte que personne ne lit. */}
        {added && (recommendation.counterScript ?? recommendation.patientReason) && (
          <p className="flex gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-[13px] leading-5 text-text-primary dark:bg-brand-950/60">
            <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" />
            <span>
              <span className="mr-1 font-medium text-brand-800 dark:text-brand-300">
                À dire au patient :
              </span>
              {recommendation.counterScript ?? recommendation.patientReason}
            </span>
          </p>
        )}

        {canDecide && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={added ? "primary" : "outline"}
              onClick={onToggleBasket}
              leadingIcon={<ShoppingBasket className="size-4" />}
            >
              {added ? "Dans la vente" : "Ajouter"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={pending}
              onClick={() =>
                run(() =>
                  removeRecommendationAction({
                    recommendationId: recommendation.id,
                    reason: "Écarté au comptoir sans être proposé au patient.",
                  }),
                )
              }
              leadingIcon={<X className="size-4" />}
            >
              Ignorer
            </Button>
            {presented && (
              <Badge tone="success" className="self-center">
                Proposé au patient
              </Badge>
            )}
          </div>
        )}

        {/* Une seule porte vers le second rang. Les cinq gestes fins et
            l'explication du score restaient dépliés en permanence sous chaque
            conseil : trois conseils affichés, quinze liens à lire avant
            d'atteindre le bouton suivant. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border-subtle pt-3 text-[12px]">
          <button
            type="button"
            onClick={() => setDetailOpen((value) => !value)}
            aria-expanded={detailOpen}
            className="flex items-center gap-1 text-text-tertiary transition-colors hover:text-text-secondary"
          >
            {detailOpen ? "Masquer le détail" : "Voir le détail"}
            <ChevronDown
              className={cn("size-3.5 transition-transform", detailOpen && "rotate-180")}
            />
          </button>
          {recommendation.origin === "MANUAL" && (
            <Badge tone="brand" className="ml-auto">
              Ajouté par le pharmacien
            </Badge>
          )}
        </div>

        {detailOpen && (
          <div className="space-y-3">
            {canDecide && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
                <SecondaryAction
                  onClick={() => run(() => presentRecommendationAction(recommendation.id))}
                >
                  {presented ? "Déjà proposé" : "Proposé au patient"}
                </SecondaryAction>
                <SecondaryAction
                  onClick={() => run(() => declineRecommendationAction(recommendation.id))}
                >
                  Refusé par le patient
                </SecondaryAction>
                <SecondaryAction onClick={() => setReplaceOpen(true)}>
                  Changer de référence
                </SecondaryAction>
                <SecondaryAction onClick={() => setModifyOpen(true)}>
                  Ajuster la formulation
                </SecondaryAction>
                <SecondaryAction onClick={() => setRemoveOpen(true)}>
                  Retirer ce conseil
                </SecondaryAction>
              </div>
            )}

            {recommendation.origin === "AI" && (
              <>
                {/* Ce nombre est le score global du classement, somme pondérée
                    des dimensions détaillées juste en dessous. Il était
                    présenté comme une « pertinence », ce qu'il n'est pas : la
                    pertinence n'en est qu'une composante. Le calcul est
                    inchangé, l'intitulé est corrigé. */}
                <p className="text-[12px] text-text-tertiary">
                  Score global de classement :{" "}
                  <span className="tabular">
                    {Math.round(recommendation.totalScore * 100)} %
                  </span>{" "}
                  — somme pondérée des dimensions ci-dessous, dont la pertinence n&apos;est
                  qu&apos;une composante.
                </p>
                <ScoreExplanation
                  contributions={recommendation.explanation}
                  justification={recommendation.justification}
                />
              </>
            )}
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

function SecondaryAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-text-tertiary underline-offset-2 transition-colors hover:text-text-secondary hover:underline"
    >
      {children}
    </button>
  );
}

function ModifyModal({
  open,
  onClose,
  recommendation,
}: {
  open: boolean;
  onClose: () => void;
  recommendation: AdviceView;
}) {
  const [patientReason, setPatientReason] = useState(recommendation.patientReason ?? "");
  const [counterScript, setCounterScript] = useState(recommendation.counterScript ?? "");
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
        counterScript: counterScript || undefined,
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
      title="Ajuster le conseil"
      description="La phrase destinée au patient et la quantité conseillée."
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
          label="À dire au patient, au comptoir"
          htmlFor="counterScript"
          hint="Reformulez si vous le souhaitez : votre version sera conservée, signée et horodatée."
        >
          <Textarea
            id="counterScript"
            rows={3}
            value={counterScript}
            onChange={(event) => setCounterScript(event.target.value)}
          />
        </Field>

        <Field
          label="Sur la fiche remise au patient"
          htmlFor="patientReason"
          required
          hint="Formulation écrite, claire, sans promesse thérapeutique."
        >
          <Textarea
            id="patientReason"
            rows={2}
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
      const result = await replaceRecommendationAction({
        recommendationId,
        newProductId: productId,
      });
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
      title="Changer de référence"
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
          « Retirer » traduit votre jugement professionnel : la proposition n&apos;était pas
          pertinente. Si le patient l&apos;a simplement déclinée, utilisez « Refusé » — les deux
          ne mesurent pas la même chose.
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
      {error && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {selected ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3 dark:border-brand-800/60 dark:bg-brand-950">
            <p className="text-[13.5px] font-medium text-text-primary">{selected.name}</p>
          </div>

          <Field
            label="À dire au patient"
            htmlFor="manual-reason"
            required
            hint="Expliquez simplement pourquoi vous conseillez ce produit dans ce contexte."
          >
            <Textarea
              id="manual-reason"
              rows={3}
              value={patientReason}
              onChange={(event) => setPatientReason(event.target.value)}
              placeholder={
                selected.claim || "Ex. : accompagne le confort digestif pendant le traitement."
              }
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
