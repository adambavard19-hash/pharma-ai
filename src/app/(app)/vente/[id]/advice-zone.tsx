"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  HelpCircle,
  Lock,
  MoreHorizontal,
  Package,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import {
  addManualRecommendationAction,
  declineRecommendationAction,
  modifyRecommendationAction,
  removeRecommendationAction,
  reopenRecommendationAction,
  replaceRecommendationAction,
  setRecommendationPriceAction,
} from "@/server/actions/recommendations";
import { useRouter } from "next/navigation";
import { answerOpportunityAction } from "@/server/actions/opportunities";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductPicker } from "./product-picker";
import { ScoreExplanation } from "./score-explanation";
import type { AdviceView } from "./types";
import { OUTCOME_MESSAGES, type EngineOutcome } from "@/core/ai/outcome";

/** La note posée par le serveur quand le patient répond « non » à la question. */
const NOT_NEEDED_NOTE = "Le patient n'a pas ce besoin.";

/** Jamais plus de trois cartes ouvertes à la fois : le reste attend un clic. */
const MAX_VISIBLE = 3;

/**
 * Ce que PharmaBoost rappelle de proposer — l'écran le plus important du produit.
 *
 * Trois grandes cartes au plus, lisibles debout, à un mètre : le produit, son
 * prix et son stock, pourquoi on le propose, ce qu'on dit au patient, et deux
 * cibles géantes de même poids — accepte, refuse. Quand le conseil ne se
 * justifie pas par l'ordonnance seule, la carte pose d'abord SA question au
 * patient ; le produit n'apparaît qu'après un « oui ». Tout ce qui est
 * technique — score, référence, reformulation — vit derrière un seul bouton
 * discret. Rien de tout cela n'est visible au comptoir.
 */
export function AdviceZone({
  prescriptionId,
  recommendations,
  canDecide,
  locked,
  outcome,
  canImportStock,
  stockNotice,
  inBasket,
  onAccept,
  onCancelAccept,
}: {
  prescriptionId: string;
  recommendations: AdviceView[];
  canDecide: boolean;
  locked: boolean;
  /** Pourquoi il n'y a rien, quand il n'y a rien : c'est ce qui décide du message. */
  outcome: EngineOutcome | null;
  canImportStock: boolean;
  stockNotice: { tone: "ok" | "warning"; text: string } | null;
  inBasket: (id: string) => boolean;
  /** Le patient accepte : ajout à la délivrance + décision enregistrée. */
  onAccept: (recommendation: AdviceView) => void;
  /** Retour en arrière immédiat, avant que la vente ne soit close. */
  onCancelAccept: (recommendation: AdviceView) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const decided = new Set(["DECLINED", "REMOVED", "PURCHASED"]);
  const open = recommendations.filter((r) => !decided.has(r.status));
  const available = open.filter((r) => !r.product || r.product.quantity > 0);
  const unavailable = open.filter((r) => r.product && r.product.quantity <= 0);
  const closed = recommendations.filter((r) => decided.has(r.status));
  const visible = showAll ? available : available.slice(0, MAX_VISIBLE);
  const hidden = available.length - visible.length;

  const pending = available.filter((r) => !inBasket(r.id)).length;

  return (
    <section className="space-y-4" aria-labelledby="zone-conseils">
      <div className="flex items-end justify-between gap-3">
        <h2 id="zone-conseils" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <Sparkles className="size-[18px]" />
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
            À proposer au patient
          </span>
        </h2>
        {!locked && available.length > 0 && (
          <span className="rounded-full bg-brand-50 px-3 py-1 text-[12.5px] font-medium text-brand-800 tabular dark:bg-brand-950 dark:text-brand-300">
            {pending > 0 ? `${pending} à décider` : "Tout est décidé"}
          </span>
        )}
      </div>

      {stockNotice && (
        <p className={cn("flex items-center gap-2 px-1 text-[12.5px]", stockNotice.tone === "warning" ? "text-warning-700 dark:text-warning-400" : "text-text-tertiary")}>
          {stockNotice.tone === "warning" ? <AlertTriangle className="size-3.5" /> : <Check className="size-3.5" />}
          {stockNotice.text}
        </p>
      )}

      {locked ? (
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border-default px-5 py-5">
          <Lock className="mt-0.5 size-[18px] shrink-0 text-text-tertiary" />
          <div className="space-y-1">
            <p className="text-[14px] font-medium text-text-primary">
              En attente de la vérification de sécurité
            </p>
            <p className="text-[13px] leading-5 text-text-secondary">
              Une alerte bloquante est ouverte au-dessus. Acquittez-la pour ouvrir les
              propositions : aucune vente ne se fait par-dessus une alerte non lue.
            </p>
          </div>
        </div>
      ) : (
        <>
          {visible.map((recommendation) => (
            <AdviceCard
              key={recommendation.id}
              prescriptionId={prescriptionId}
              recommendation={recommendation}
              canDecide={canDecide}
              accepted={inBasket(recommendation.id)}
              onAccept={() => onAccept(recommendation)}
              onCancelAccept={() => onCancelAccept(recommendation)}
            />
          ))}

          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full rounded-xl border border-dashed border-border-default py-3 text-[13.5px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
            >
              Voir {hidden} autre{hidden > 1 ? "s" : ""} proposition{hidden > 1 ? "s" : ""}
            </button>
          )}

          {available.length === 0 && closed.length > 0 && (
            <p className="flex items-center gap-2 px-1 text-[14px] text-text-secondary">
              <Check className="size-[18px] text-success-600 dark:text-success-500" />
              Toutes les propositions ont été décidées avec le patient.
            </p>
          )}

          {available.length === 0 && closed.length === 0 && (
            <EmptyOutcome outcome={outcome} canImportStock={canImportStock} onAddAdvice={() => setAddOpen(true)} />
          )}

          {unavailable.length > 0 && (
            <p className="px-1 text-[12.5px] leading-5 text-text-tertiary">
              Non proposé faute de stock :{" "}
              {unavailable.map((r) => r.product?.name).filter(Boolean).join(", ")}.
            </p>
          )}

          {canDecide && (
            <>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-1.5 px-1 text-[13px] text-text-tertiary underline-offset-2 transition-colors hover:text-text-secondary hover:underline"
              >
                <Plus className="size-4" />
                Ajouter un conseil de mon choix
              </button>
              <AddAdviceModal
                open={addOpen}
                onClose={() => setAddOpen(false)}
                prescriptionId={prescriptionId}
              />
            </>
          )}

          {closed.length > 0 && <ClosedList recommendations={closed} canDecide={canDecide} />}
        </>
      )}
    </section>
  );
}

/**
 * Ce qui a été tranché.
 *
 * Un conseil refusé reste visible, barré : le patient peut changer d'avis dans
 * la même minute, et le collaborateur doit voir que son refus a bien été pris.
 */
function ClosedList({
  recommendations,
  canDecide,
}: {
  recommendations: AdviceView[];
  canDecide: boolean;
}) {
  const label = (recommendation: AdviceView) => {
    if (recommendation.status === "PURCHASED") return "Acheté";
    if (recommendation.status === "DECLINED") return "Refusé par le patient";
    if (recommendation.pharmacistNote === NOT_NEEDED_NOTE) return "Pas ce besoin";
    return "Retiré du comptoir";
  };

  return (
    <ul className="space-y-1.5">
      {recommendations.map((recommendation) => {
        const notNeeded =
          recommendation.status === "REMOVED" &&
          recommendation.pharmacistNote === NOT_NEEDED_NOTE &&
          recommendation.opportunity;
        return (
          <li
            key={recommendation.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border-subtle bg-surface-sunken/50 px-4 py-2.5"
          >
            {recommendation.status === "PURCHASED" ? (
              <Check className="size-4 shrink-0 text-success-600 dark:text-success-500" />
            ) : (
              <X className="size-4 shrink-0 text-text-tertiary" />
            )}
            <span
              className={cn(
                "text-[13.5px]",
                recommendation.status === "PURCHASED"
                  ? "font-medium text-text-primary"
                  : "text-text-secondary line-through",
              )}
            >
              {recommendation.product?.name ?? "Produit supprimé"}
            </span>
            <span className="text-[12px] text-text-tertiary">
              {label(recommendation)}
              {recommendation.decidedBy ? ` · ${recommendation.decidedBy}` : ""}
            </span>
            {recommendation.pharmacistNote && recommendation.pharmacistNote !== NOT_NEEDED_NOTE && (
              <span className="text-[12px] text-text-tertiary">
                « {recommendation.pharmacistNote} »
              </span>
            )}
            {canDecide && recommendation.status === "DECLINED" && (
              <ReopenButton recommendationId={recommendation.id} />
            )}
            {canDecide && notNeeded && (
              <ReopenButton
                recommendationId={recommendation.id}
                opportunityId={recommendation.opportunity!.id}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Rouvre un conseil refusé par erreur, ou un besoin finalement confirmé. */
function ReopenButton({
  recommendationId,
  opportunityId,
}: {
  recommendationId: string;
  opportunityId?: string;
}) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = opportunityId
            ? await answerOpportunityAction({ opportunityId, answer: true })
            : await reopenRecommendationAction(recommendationId);
          if (!result.ok) push({ tone: "error", title: result.error });
        })
      }
      className="ml-auto flex items-center gap-1 text-[12px] text-text-tertiary underline-offset-2 transition-colors hover:text-text-secondary hover:underline"
    >
      <RotateCcw className="size-3.5" />
      Revenir
    </button>
  );
}

function AdviceCard({
  prescriptionId,
  recommendation,
  canDecide,
  accepted,
  onAccept,
  onCancelAccept,
}: {
  prescriptionId: string;
  recommendation: AdviceView;
  canDecide: boolean;
  accepted: boolean;
  onAccept: () => void;
  onCancelAccept: () => void;
}) {
  const opportunity = recommendation.opportunity;
  // La réponse du patient, locale d'abord : la carte réagit au clic, le
  // serveur confirme ensuite. Un « non » fait disparaître la carte ; le
  // serveur la range alors parmi les décisions prises.
  // « UNKNOWN » : la question a été posée, le patient ne savait pas. La
  // proposition reste visible, à l'appréciation du pharmacien — jamais imposée.
  const [answer, setAnswer] = useState<boolean | null | "UNKNOWN">(
    opportunity?.answer ?? (opportunity?.answeredAt ? "UNKNOWN" : null),
  );
  const [answering, startAnswer] = useTransition();
  const { push } = useToast();

  const askFirst =
    Boolean(opportunity?.requiresConfirmation && opportunity.question) && answer !== true && answer !== "UNKNOWN";

  const respond = (value: boolean | "UNKNOWN") => {
    if (!opportunity) return;
    setAnswer(value);
    startAnswer(async () => {
      const result = await answerOpportunityAction({ opportunityId: opportunity.id, answer: value });
      if (!result.ok) {
        setAnswer(null);
        push({ tone: "error", title: result.error });
      }
    });
  };

  if (askFirst && answer === false) {
    return (
      <p className="flex items-center gap-2 px-1 text-[13px] text-text-tertiary">
        <X className="size-4" />
        Pas ce besoin — proposition retirée.
      </p>
    );
  }

  if (askFirst) {
    return (
      <QuestionCard
        recommendation={recommendation}
        canDecide={canDecide}
        pending={answering}
        onYes={() => respond(true)}
        onNo={() => respond(false)}
        onUnknown={() => respond("UNKNOWN")}
      />
    );
  }

  return (
    <div className="space-y-2">
      {answer === "UNKNOWN" && opportunity?.question && (
        <p className="flex items-center gap-2 px-1 text-[12.5px] text-text-tertiary">
          <HelpCircle className="size-3.5" />
          « {opportunity.question} » — le patient ne sait pas. À votre appréciation.
        </p>
      )}
      <ProductCard
        prescriptionId={prescriptionId}
        recommendation={recommendation}
        canDecide={canDecide}
        accepted={accepted}
        confirmed={answer === true}
        onAccept={onAccept}
        onCancelAccept={onCancelAccept}
      />
    </div>
  );
}

/**
 * Quand il n'y a rien à proposer, dire pourquoi — et quoi faire.
 *
 * Un stock jamais importé, une rupture, un conseil écarté par sécurité et une
 * ordonnance sans besoin sont quatre situations différentes. Le code d'issue
 * vient du moteur ; ici on ne montre que sa traduction.
 */
function EmptyOutcome({
  outcome,
  canImportStock,
  onAddAdvice,
}: {
  outcome: EngineOutcome | null;
  canImportStock: boolean;
  onAddAdvice: () => void;
}) {
  const key = outcome && outcome !== "PROPOSALS" && outcome !== "NEEDS_PATIENT_INFORMATION" ? outcome : "NO_RELEVANT_NEED";
  const message = OUTCOME_MESSAGES[key];
  const Icon = key === "STOCK_NOT_CONFIGURED" ? Package : key === "SAFETY_FILTERED" || key === "AI_UNAVAILABLE" || key === "ENGINE_ERROR" ? AlertTriangle : Check;

  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed px-5 py-5",
        message.tone === "warning" ? "border-warning-300 bg-warning-50/40 dark:border-warning-800 dark:bg-warning-950/20" : "border-border-default",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 size-[18px] shrink-0", message.tone === "warning" ? "text-warning-700 dark:text-warning-400" : "text-text-tertiary")} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[14px] font-medium text-text-primary">{message.title}</p>
          <p className="text-[13px] leading-5 text-text-secondary">{message.body}</p>
        </div>
      </div>
      {(message.action === "IMPORT_STOCK" && canImportStock) || message.action === "ADD_ADVICE" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {message.action === "IMPORT_STOCK" && canImportStock && (
            <Button asChild leadingIcon={<Package className="size-[18px]" />}>
              <Link href="/stock/import">Importer mon stock</Link>
            </Button>
          )}
          {message.action === "ADD_ADVICE" && (
            <Button variant="outline" size="sm" leadingIcon={<Plus className="size-4" />} onClick={onAddAdvice}>
              Ajouter un conseil
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Le cadre commun des cartes : un liseré de couleur, une surface calme. */
function CardFrame({
  accent,
  children,
}: {
  accent: "brand" | "success" | "question";
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface-card shadow-[0_1px_2px_rgba(16,24,40,0.06),0_8px_24px_-12px_rgba(16,24,40,0.18)] transition-colors",
        accent === "success"
          ? "border-success-300 dark:border-success-800"
          : accent === "question"
            ? "border-brand-200 dark:border-brand-800"
            : "border-border-subtle",
      )}
    >
      <div
        className={cn(
          "h-1.5",
          accent === "success"
            ? "bg-success-500"
            : accent === "question"
              ? "bg-gradient-to-r from-brand-400 to-brand-600"
              : "bg-gradient-to-r from-brand-600 to-brand-400",
        )}
      />
      <div className="space-y-5 p-5 sm:p-6">{children}</div>
    </article>
  );
}

/**
 * La question d'abord.
 *
 * Elle est écrite dans la règle de conseil, jamais formulée à la volée. Le
 * produit n'est montré qu'en petit, pour que le pharmacien sache où mène un
 * « oui » — pas pour le vendre avant d'avoir demandé.
 */
function QuestionCard({
  recommendation,
  canDecide,
  pending,
  onYes,
  onNo,
  onUnknown,
}: {
  recommendation: AdviceView;
  canDecide: boolean;
  pending: boolean;
  onYes: () => void;
  onNo: () => void;
  onUnknown: () => void;
}) {
  const opportunity = recommendation.opportunity!;
  const product = recommendation.product;
  const price = recommendation.unitPriceCents || (product?.salePriceCents ?? 0);

  return (
    <CardFrame accent="question">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-brand-700 uppercase dark:text-brand-400">
          Une question au patient
        </p>
        <p className="mt-2 text-[24px] leading-8 font-semibold tracking-[-0.015em] text-text-primary">
          {opportunity.question}
        </p>
        {product && (
          <p className="mt-2 text-[13.5px] text-text-secondary">
            Si oui, proposer <span className="font-medium text-text-primary">{product.name}</span> ·{" "}
            <span className="tabular">{price > 0 ? formatCents(price) : "prix à renseigner"}</span> · {product.quantity} en stock
          </p>
        )}
      </div>

      {canDecide && (
        <div className="grid gap-3 sm:grid-cols-2">
          <DecisionButton
            tone="accept"
            icon={<Check className="size-7" strokeWidth={2.75} />}
            label="Oui"
            hint="Voir la proposition"
            disabled={pending}
            onClick={onYes}
          />
          <DecisionButton
            tone="refuse"
            icon={<X className="size-7" strokeWidth={2.75} />}
            label="Non"
            hint="Pas ce besoin"
            disabled={pending}
            onClick={onNo}
          />
          <button
            type="button"
            disabled={pending}
            onClick={onUnknown}
            className="sm:col-span-2 rounded-xl border border-dashed border-border-default py-2.5 text-[13px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary disabled:opacity-60"
          >
            Ne sait pas — laisser la proposition à mon appréciation
          </button>
        </div>
      )}
    </CardFrame>
  );
}

function ProductCard({
  prescriptionId,
  recommendation,
  canDecide,
  accepted,
  confirmed,
  onAccept,
  onCancelAccept,
}: {
  prescriptionId: string;
  recommendation: AdviceView;
  canDecide: boolean;
  accepted: boolean;
  /** Le patient vient de confirmer le besoin par la question. */
  confirmed: boolean;
  onAccept: () => void;
  onCancelAccept: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [modifyOpen, setModifyOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const { push } = useToast();

  const product = recommendation.product;
  const lowStock = product ? product.quantity > 0 && product.quantity <= product.alertThreshold : false;
  const price = recommendation.unitPriceCents || (product?.salePriceCents ?? 0);
  const [priceDraft, setPriceDraft] = useState("");
  const [companionAdded, setCompanionAdded] = useState(false);
  const router = useRouter();

  // Le pourquoi lu au comptoir vient de la règle : il dit le lien entre
  // l'ordonnance et la proposition. Quand le patient vient de confirmer la
  // gêne, c'est cette confirmation qu'on lit — pas l'hypothèse de départ.
  const why =
    ((confirmed || recommendation.opportunity?.answer === true) &&
      recommendation.opportunity?.confirmedReason) ||
    recommendation.shortReason ||
    recommendation.opportunity?.rationale ||
    null;
  const script = recommendation.counterScript ?? recommendation.patientReason;

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
    <CardFrame accent={accepted ? "success" : "brand"}>
      {recommendation.companion && !companionAdded && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3 dark:border-brand-800 dark:bg-brand-950/20">
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-semibold tracking-[0.08em] text-brand-700 uppercase dark:text-brand-400">À associer — {recommendation.companion.label}</p>
            <p className="text-[14px] font-medium text-text-primary">
              {recommendation.companion.name}
              <span className="ml-2 text-[13px] font-normal text-text-secondary">
                {recommendation.companion.salePriceCents > 0 ? formatCents(recommendation.companion.salePriceCents) : "prix à renseigner"} · {recommendation.companion.stockQuantity} en stock
              </span>
            </p>
            <p className="text-[12.5px] text-text-secondary">{recommendation.companion.reason}</p>
          </div>
          {canDecide && (
            <Button
              size="sm"
              loading={pending}
              leadingIcon={<Plus className="size-4" />}
              onClick={() =>
                run(async () => {
                  const r = await addManualRecommendationAction({
                    prescriptionId,
                    productId: recommendation.companion!.productId,
                    quantity: 1,
                    patientReason: recommendation.companion!.reason,
                  });
                  if (r.ok) {
                    setCompanionAdded(true);
                    router.refresh();
                  }
                  return r;
                })
              }
            >
              Ajouter à la délivrance
            </Button>
          )}
        </div>
      )}
      <div className="flex items-start gap-4">
        {product?.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt=""
            width={72}
            height={72}
            className="size-[72px] shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="flex size-[72px] shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-text-tertiary">
            <Package className="size-7" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-text-primary">
            {product?.name ?? "Produit supprimé"}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {price > 0 ? (
              <span className="text-[26px] leading-7 font-semibold tabular text-text-primary">
                {formatCents(price)}
              </span>
            ) : canDecide ? (
              // Le prix manque (export sans prix de vente) : on le saisit ici,
              // une fois, et il est écrit sur la fiche produit.
              <span className="flex items-center gap-1.5">
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceDraft}
                  onChange={(event) => setPriceDraft(event.target.value)}
                  placeholder="Prix TTC"
                  aria-label="Prix de vente TTC"
                  className="h-9 w-24 rounded-lg border border-warning-300 bg-warning-50/40 px-2 text-[15px] font-semibold tabular text-text-primary dark:border-warning-800 dark:bg-warning-950/20"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!/^\d+([.,]\d{1,2})?$/.test(priceDraft.trim())}
                  loading={pending}
                  onClick={() => run(async () => { const r = await setRecommendationPriceAction({ recommendationId: recommendation.id, unitPriceCents: Math.round(Number(priceDraft.trim().replace(",", ".")) * 100) }); if (r.ok) router.refresh(); return r; })}
                >
                  Enregistrer le prix
                </Button>
              </span>
            ) : (
              <span className="text-[15px] font-medium text-warning-700 dark:text-warning-400">Prix à renseigner</span>
            )}
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[12.5px] font-medium",
                lowStock
                  ? "bg-warning-100 text-warning-800 dark:bg-warning-900/40 dark:text-warning-400"
                  : "bg-success-100 text-success-800 dark:bg-success-900/40 dark:text-success-300",
              )}
            >
              {lowStock
                ? `Plus que ${product?.quantity} en stock`
                : `${product?.quantity ?? 0} en stock`}
            </span>
          </p>
        </div>

        {canDecide && (
          <button
            type="button"
            onClick={() => setMoreOpen((value) => !value)}
            aria-expanded={moreOpen}
            aria-label="Autres options"
            className="shrink-0 rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-secondary"
          >
            <MoreHorizontal className="size-5" />
          </button>
        )}
      </div>

      {why && (
        <div className="rounded-xl bg-surface-sunken/70 px-4 py-3.5">
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">
            Pourquoi
          </p>
          <p className="mt-1 text-[16px] leading-[1.5] text-text-primary">{why}</p>
        </div>
      )}

      {script && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-3.5 dark:border-brand-900 dark:bg-brand-950/50">
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-brand-800 uppercase dark:text-brand-300">
            À dire au patient
          </p>
          <p className="mt-1 text-[17px] leading-[1.5] text-text-primary">{script}</p>
        </div>
      )}

      {recommendation.precautions.length > 0 && (
        <p className="text-[12.5px] leading-5 text-warning-800 dark:text-warning-500">
          ⚠ {recommendation.precautions.join(" · ")}
        </p>
      )}

      {canDecide && !accepted && (
        <div className="grid gap-3 sm:grid-cols-2">
          <DecisionButton
            tone="accept"
            icon={<Check className="size-7" strokeWidth={2.75} />}
            label="Patient accepte"
            hint="Ajouté à la délivrance"
            disabled={pending}
            onClick={onAccept}
          />
          <DecisionButton
            tone="refuse"
            icon={<X className="size-7" strokeWidth={2.75} />}
            label="Patient refuse"
            hint="Refus enregistré"
            disabled={pending}
            onClick={() => run(() => declineRecommendationAction(recommendation.id))}
          />
        </div>
      )}

      {canDecide && accepted && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-success-100/70 px-4 py-3.5 dark:bg-success-900/25">
          <Check className="size-6 shrink-0 text-success-700 dark:text-success-400" strokeWidth={2.5} />
          <p className="min-w-0 flex-1 text-[15px] font-semibold text-success-900 dark:text-success-200">
            Ajouté à la délivrance
          </p>
          <button
            type="button"
            onClick={onCancelAccept}
            className="text-[13px] text-success-800 underline underline-offset-2 dark:text-success-300"
          >
            Annuler
          </button>
        </div>
      )}

      {canDecide && moreOpen && (
        <div className="space-y-2.5 border-t border-border-subtle pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
            <SecondaryAction onClick={() => setReplaceOpen(true)}>Changer de référence</SecondaryAction>
            <SecondaryAction onClick={() => setModifyOpen(true)}>Ajuster la formulation</SecondaryAction>
            <SecondaryAction onClick={() => setRemoveOpen(true)}>Retirer sans le proposer</SecondaryAction>
            {recommendation.origin === "AI" && (
              <button
                type="button"
                onClick={() => setShowExplanation((value) => !value)}
                aria-expanded={showExplanation}
                className="flex items-center gap-1 text-text-tertiary transition-colors hover:text-text-secondary"
              >
                Pourquoi ce produit ?
                <ChevronDown
                  className={cn("size-3.5 transition-transform", showExplanation && "rotate-180")}
                />
              </button>
            )}
          </div>
          {showExplanation && (
            <ScoreExplanation
              contributions={recommendation.explanation}
              justification={recommendation.justification}
            />
          )}
        </div>
      )}

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
    </CardFrame>
  );
}

/**
 * Les deux cibles de la décision.
 *
 * Même hauteur, même largeur, même graisse : le vert n'est pas plus gros que le
 * gris. Un écran qui pousse au « oui » finirait par produire des acceptations
 * de complaisance, donc des chiffres faux et des patients mal servis.
 */
function DecisionButton({
  tone,
  icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  tone: "accept" | "refuse";
  icon: React.ReactNode;
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[112px] items-center gap-4 rounded-2xl border-2 px-6 py-5 text-left transition-all",
        "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50",
        tone === "accept"
          ? "border-success-600 bg-success-600 text-white shadow-[0_8px_20px_-10px_rgba(22,163,74,0.8)] hover:bg-success-700 active:scale-[0.99] focus-visible:outline-success-600"
          : "border-danger-300 bg-danger-50/50 text-danger-800 hover:border-danger-500 hover:bg-danger-100/70 active:scale-[0.99] focus-visible:outline-danger-500 dark:border-danger-800 dark:bg-danger-950/30 dark:text-danger-300 dark:hover:bg-danger-900/40",
      )}
    >
      <span
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-full",
          tone === "accept" ? "bg-white/20" : "bg-danger-100 dark:bg-danger-900/50",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[21px] leading-6 font-semibold tracking-[-0.01em]">
          {label}
        </span>
        <span
          className={cn(
            "mt-0.5 block text-[13px] leading-4",
            tone === "accept" ? "text-white/80" : "text-danger-700/80 dark:text-danger-400",
          )}
        >
          {hint}
        </span>
      </span>
    </button>
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
          pertinente. Si le patient l&apos;a simplement déclinée, utilisez « Patient refuse » —
          les deux ne mesurent pas la même chose.
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
