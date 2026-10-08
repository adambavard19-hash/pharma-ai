"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  HelpCircle,
  Lightbulb,
  Lock,
  MoreHorizontal,
  Package,
  Pill,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
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
import { ReanalyseButton } from "./reanalyse-button";
import { ScoreExplanation } from "./score-explanation";
import { ShortDateBadge, VigilanceStrip } from "./vigilance-strip";
import { ProductTrainingLink } from "../../formation/_components/product-training-link";
import { countUndecided, splitAdvice } from "./group-advice";
import { FamilyPill } from "./complete-advice";
import type { AdviceFamily } from "@/core/ai/family";
import type { AdviceView } from "./types";
import { OUTCOME_MESSAGES, type EngineOutcome } from "@/core/ai/outcome";

/** La note posée par le serveur quand le patient répond « non » à la question. */
const NOT_NEEDED_NOTE = "Le patient n'a pas ce besoin.";

/**
 * Ce que PharmaBoost rappelle de proposer, et tout ce qui n'a pas de médicament.
 *
 * Les conseils liés à un médicament se lisent SOUS ce médicament (voir
 * `MedicationAdvice`) : c'est là que le pharmacien les attend. Cette zone
 * garde ce qui ne se rattache à aucune ligne — un conseil propre au patient,
 * ajouté à la main, ou issu d'une analyse antérieure au rattachement — et ce
 * qui est global : l'avis de stock, l'issue de l'analyse quand elle n'a rien
 * proposé du tout, l'ajout d'un conseil de son choix.
 */
export function AdviceZone({
  prescriptionId,
  recommendations,
  nothingProposed,
  canDecide,
  canVerify = true,
  locked,
  outcome,
  canImportStock,
  stockNotice,
  presentProductIds,
  inBasket,
  onAccept,
  onCancelAccept,
  renderAlternatives,
}: {
  prescriptionId: string;
  /** Les conseils rattachés à aucun médicament affiché. */
  recommendations: AdviceView[];
  /** Rien à montrer nulle part, ni sous un médicament ni ici : l'issue de l'analyse parle. */
  nothingProposed: boolean;
  canDecide: boolean;
  /** Pharmacien vérificateur : peut valider une proposition qui porte une vigilance. */
  canVerify?: boolean;
  locked: boolean;
  /** Pourquoi il n'y a rien, quand il n'y a rien : c'est ce qui décide du message. */
  outcome: EngineOutcome | null;
  canImportStock: boolean;
  stockNotice: { tone: "ok" | "warning"; text: string } | null;
  /** Les produits déjà présents parmi tous les conseils : un produit associé ne se repropose pas. */
  presentProductIds: Set<string>;
  inBasket: (id: string) => boolean;
  /** Le patient accepte : ajout à la délivrance + décision enregistrée. */
  onAccept: (recommendation: AdviceView) => void;
  /** Retour en arrière immédiat, avant que la vente ne soit close. */
  onCancelAccept: (recommendation: AdviceView) => void;
  /** Les autres références, pour un conseil sans médicament lié mais issu d'une analyse qui les a enregistrées. */
  renderAlternatives?: (recommendation: AdviceView) => React.ReactNode;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const split = splitAdvice(recommendations);

  // Tout est rattaché sous les médicaments et rien de global à dire : pas de
  // zone vide, pas d'espace perdu entre deux blocs.
  const empty = split.cards.length + split.unavailable.length + split.closed.length === 0 && !nothingProposed && !canDecide;
  if (!stockNotice && (locked || empty)) return null;

  return (
    <section className="space-y-4" aria-label="Conseils pour ce patient">
      {!locked && split.cards.length > 0 && (
        <div className="flex items-end justify-between gap-3">
          <h2 id="zone-conseils" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
              <Sparkles className="size-[18px]" />
            </span>
            <span className="text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
              Conseils pour ce patient
            </span>
          </h2>
          <UndecidedPill count={countUndecided(split.cards, inBasket)} />
        </div>
      )}

      {stockNotice && (
        <p className={cn("flex items-center gap-2 px-1 text-[12.5px]", stockNotice.tone === "warning" ? "text-warning-700 dark:text-warning-400" : "text-text-tertiary")}>
          {stockNotice.tone === "warning" ? <AlertTriangle className="size-3.5" /> : <Check className="size-3.5" />}
          {stockNotice.text}
        </p>
      )}

      {!locked && (
        <>
          <AdviceStack
            prescriptionId={prescriptionId}
            split={split}
            canDecide={canDecide}
            canVerify={canVerify}
            presentProductIds={presentProductIds}
            inBasket={inBasket}
            onAccept={onAccept}
            onCancelAccept={onCancelAccept}
            numbered
            renderAlternatives={renderAlternatives}
          />

          {nothingProposed && (
            <EmptyOutcome outcome={outcome} canImportStock={canImportStock} canRelaunch={canDecide} prescriptionId={prescriptionId} onAddAdvice={() => setAddOpen(true)} />
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
        </>
      )}
    </section>
  );
}

/**
 * Une alerte bloquante est ouverte : rien ne se propose par-dessus.
 *
 * Dit une seule fois, en tête de la liste des médicaments — pas sous chacun.
 */
export function AdviceLocked() {
  return (
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
  );
}

/** Où en sont les décisions : ce qu'il reste à trancher avec le patient. */
export function UndecidedPill({ count }: { count: number }) {
  return (
    <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-[12.5px] font-medium text-brand-800 tabular dark:bg-brand-950 dark:text-brand-300">
      {count > 0 ? `${count} à décider` : "Tout est décidé"}
    </span>
  );
}

/**
 * Les conseils d'un groupe — ceux d'un médicament, ou ceux qui n'en ont pas.
 *
 * Les cartes à décider d'abord (la question au patient s'affiche avant le
 * produit quand la règle l'exige), puis ce qu'on ne propose pas faute de
 * stock, puis ce qui est tranché : refusé ou retiré, il reste là où il était
 * proposé, barré, avec « Revenir ». Aucun plafond d'affichage : tout ce que le
 * moteur retient se lit.
 */
export function AdviceStack({
  prescriptionId,
  split,
  canDecide,
  canVerify = true,
  presentProductIds,
  inBasket,
  onAccept,
  onCancelAccept,
  numbered = false,
  renderAlternatives,
}: {
  prescriptionId: string;
  split: ReturnType<typeof splitAdvice>;
  canDecide: boolean;
  canVerify?: boolean;
  presentProductIds: Set<string>;
  inBasket: (id: string) => boolean;
  onAccept: (recommendation: AdviceView) => void;
  onCancelAccept: (recommendation: AdviceView) => void;
  /** Numérote les suggestions (« Suggestion n°2 ») : utile dans une liste sans médicament, inutile sous un médicament. */
  numbered?: boolean;
  /** Les autres références possibles, montrées sous un conseil encore à décider. */
  renderAlternatives?: (recommendation: AdviceView) => React.ReactNode;
}) {
  const { cards, unavailable, closed } = split;
  if (cards.length + unavailable.length + closed.length === 0) return null;
  return (
    <div className="space-y-3.5">
      {cards.map((card, index) =>
        card.kind === "routine" ? (
          <RoutineCard
            key={card.key}
            index={numbered ? index + 1 : undefined}
            steps={card.steps}
            canDecide={canDecide}
            canVerify={canVerify}
            inBasket={inBasket}
            onAccept={onAccept}
            onCancelAccept={onCancelAccept}
          />
        ) : (
          <AdviceCard
            key={card.recommendation.id}
            index={numbered ? index + 1 : undefined}
            prescriptionId={prescriptionId}
            recommendation={card.recommendation}
            canDecide={canDecide}
            canVerify={canVerify}
            accepted={inBasket(card.recommendation.id)}
            presentProductIds={presentProductIds}
            onAccept={() => onAccept(card.recommendation)}
            onCancelAccept={() => onCancelAccept(card.recommendation)}
            alternatives={renderAlternatives?.(card.recommendation)}
          />
        ),
      )}

      {unavailable.length > 0 && (
        <p className="px-1 text-[12.5px] leading-5 text-text-tertiary">
          Non proposé faute de stock :{" "}
          {unavailable.map((r) => r.product?.name).filter(Boolean).join(", ")}.
        </p>
      )}

      {closed.length > 0 && <ClosedList recommendations={closed} canDecide={canDecide} />}
    </div>
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
  index,
  prescriptionId,
  recommendation,
  canDecide,
  canVerify = true,
  accepted,
  presentProductIds,
  onAccept,
  onCancelAccept,
  alternatives,
}: {
  prescriptionId: string;
  recommendation: AdviceView;
  canDecide: boolean;
  canVerify?: boolean;
  index?: number;
  accepted: boolean;
  presentProductIds: Set<string>;
  onAccept: () => void;
  onCancelAccept: () => void;
  /** Les autres références possibles : sous la décision, tant que le conseil n'est pas accepté. */
  alternatives?: React.ReactNode;
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
        index={index}
        prescriptionId={prescriptionId}
        recommendation={recommendation}
        canDecide={canDecide}
        canVerify={canVerify}
        accepted={accepted}
        confirmed={answer === true}
        companionPresent={Boolean(recommendation.companion && presentProductIds.has(recommendation.companion.productId))}
        onAccept={onAccept}
        onCancelAccept={onCancelAccept}
        alternatives={alternatives}
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
  canRelaunch,
  prescriptionId,
  onAddAdvice,
}: {
  outcome: EngineOutcome | null;
  canImportStock: boolean;
  canRelaunch: boolean;
  prescriptionId: string;
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
      {(message.action === "IMPORT_STOCK" && canImportStock) || message.action === "ADD_ADVICE" || (message.action === "RELAUNCH" && canRelaunch) ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {message.action === "RELAUNCH" && canRelaunch && <ReanalyseButton prescriptionId={prescriptionId} />}
          {message.action === "IMPORT_STOCK" && canImportStock && (
            <Button asChild leadingIcon={<Package className="size-[18px]" />}>
              <Link href="/stock/mise-a-jour">Importer mon stock</Link>
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
          "h-1",
          accent === "success"
            ? "bg-success-500"
            : accent === "question"
              ? "bg-gradient-to-r from-brand-400 to-brand-600"
              : "bg-gradient-to-r from-brand-600 to-brand-400",
        )}
      />
      <div className="space-y-3.5 p-4 sm:p-5">{children}</div>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-brand-700 uppercase dark:text-brand-400">
            Une question au patient
          </p>
          <FamilyPill family={recommendation.family} />
        </div>
        <p className="mt-2 text-[20px] leading-7 font-semibold tracking-[-0.015em] text-text-primary">
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
  index,
  prescriptionId,
  recommendation,
  canDecide,
  canVerify = true,
  accepted,
  confirmed,
  companionPresent = false,
  onAccept,
  onCancelAccept,
  alternatives,
}: {
  index?: number;
  prescriptionId: string;
  recommendation: AdviceView;
  canDecide: boolean;
  /** L'utilisateur est pharmacien vérificateur (validation des vigilances). */
  canVerify?: boolean;
  accepted: boolean;
  /** Le produit associé figure déjà parmi les conseils : ne pas le reproposer. */
  companionPresent?: boolean;
  /** Le patient vient de confirmer le besoin par la question. */
  confirmed: boolean;
  onAccept: () => void;
  onCancelAccept: () => void;
  alternatives?: React.ReactNode;
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
      {recommendation.companion && !companionAdded && !companionPresent && (
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
      <CardBand index={index} kind="Conseil associé" title={recommendation.opportunity?.title ?? "Conseil"} family={recommendation.family} />

      <VigilanceStrip vigilances={recommendation.vigilances ?? []} canVerify={canVerify} />

      {why && (
        <div className="flex items-start gap-3 rounded-xl bg-surface-sunken/70 px-3.5 py-3">
          <Pill className="mt-0.5 size-[18px] shrink-0 text-text-tertiary" />
          <p className="text-[14.5px] leading-[1.5] text-text-primary">{why}</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[12px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">Solution disponible dans votre officine</p>
        <div className="flex items-start gap-3.5 rounded-xl border border-border-subtle bg-surface-card px-3.5 py-3">
          <ProductVisual product={product} size={72} />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] leading-6 font-semibold tracking-[-0.01em] text-text-primary">{product?.name ?? "Produit supprimé"}</p>
            {product?.brand && <p className="mt-0.5 text-[13px] text-text-secondary">{product.brand}</p>}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {price > 0 ? (
                <span className="flex items-baseline gap-2">
                  <span className="text-[22px] leading-7 font-semibold tabular text-text-primary">{formatCents(price)}</span>
                  {product?.purchasePriceCents ? (
                    <span className="rounded-md bg-success-50 px-1.5 py-0.5 text-[12.5px] font-medium tabular text-success-800 dark:bg-success-950/40 dark:text-success-300" title="Prix de vente moins prix d'achat">
                      marge {formatCents(price - product.purchasePriceCents)}
                    </span>
                  ) : null}
                </span>
              ) : canDecide ? (
                <span className="flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceDraft}
                    onChange={(event) => setPriceDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && /^\d+([.,]\d{1,2})?$/.test(priceDraft.trim()) && !pending) {
                        event.preventDefault();
                        run(async () => { const r = await setRecommendationPriceAction({ recommendationId: recommendation.id, unitPriceCents: Math.round(Number(priceDraft.trim().replace(",", ".")) * 100) }); if (r.ok) router.refresh(); return r; });
                      }
                    }}
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
              <StockBadge quantity={product?.quantity ?? 0} low={lowStock} />
              <ShortDateBadge shortDate={recommendation.shortDate ?? null} />
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
        <BenefitChips benefits={recommendation.opportunity?.benefits ?? []} />
        <ImageCredit source={product?.imageSource ?? null} />
      </div>

      {script && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/70 px-3.5 py-3 dark:border-brand-900 dark:bg-brand-950/50">
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-brand-800 uppercase dark:text-brand-300">
            À dire au patient
          </p>
          <p className="mt-1 text-[16px] leading-[1.5] text-text-primary">{script}</p>
        </div>
      )}

      {recommendation.precautions.length > 0 && (
        <p className="text-[12.5px] leading-5 text-warning-800 dark:text-warning-500">
          ⚠ {recommendation.precautions.join(" · ")}
        </p>
      )}

      {canDecide && !accepted && (
        <div className="grid gap-2.5 sm:grid-cols-[1.4fr_1fr_1fr]">
          <DecisionButton
            tone="accept"
            icon={<Check className="size-6" strokeWidth={2.75} />}
            label="Proposer ce produit"
            hint={recommendation.requiresValidation && !canVerify ? "Validation pharmacien requise" : "Ajouté à la délivrance"}
            disabled={pending || (recommendation.requiresValidation && !canVerify)}
            onClick={onAccept}
          />
          <DecisionButton
            tone="neutral"
            icon={<RefreshCw className="size-5" strokeWidth={2.5} />}
            label="Autre produit"
            hint="Changer de référence"
            disabled={pending}
            onClick={() => setReplaceOpen(true)}
          />
          <DecisionButton
            tone="refuse"
            icon={<X className="size-6" strokeWidth={2.75} />}
            label="Ignorer"
            hint="Refus enregistré"
            disabled={pending}
            onClick={() => run(() => declineRecommendationAction(recommendation.id))}
          />
        </div>
      )}

      {canDecide && !accepted && alternatives}

      {recommendation.origin === "MANUAL" && (recommendation.trainings?.length ?? 0) > 0 && (
        <div className="px-1">
          <ProductTrainingLink trainings={recommendation.trainings} />
        </div>
      )}

      {recommendation.origin !== "MANUAL" && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <ProductTrainingLink trainings={recommendation.trainings ?? []} className="order-last" />
          <button
            type="button"
            onClick={() => setShowExplanation((value) => !value)}
            aria-expanded={showExplanation}
            className="flex items-center gap-1 text-[12.5px] text-text-tertiary transition-colors hover:text-text-secondary"
          >
            <HelpCircle className="size-3.5" />
            Pourquoi cette suggestion ?
            <ChevronDown className={cn("size-3.5 transition-transform", showExplanation && "rotate-180")} />
          </button>
          {recommendation.opportunity?.clinicalContext && showExplanation && (
            <p className="w-full text-[12.5px] leading-5 text-text-secondary">{recommendation.opportunity.rationale} — {recommendation.opportunity.clinicalContext}</p>
          )}
          {showExplanation && (
            <div className="w-full">
              <ScoreExplanation contributions={recommendation.explanation} justification={recommendation.justification} />
            </div>
          )}
        </div>
      )}

      {canDecide && accepted && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-success-100/70 px-3.5 py-3 dark:bg-success-900/25">
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
          </div>
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
  tone: "accept" | "refuse" | "neutral";
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
        "flex min-h-[64px] items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-left transition-all",
        "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50",
        tone === "accept" &&
          "border-success-600 bg-success-600 text-white shadow-[0_8px_20px_-10px_rgba(22,163,74,0.8)] hover:bg-success-700 active:scale-[0.99] focus-visible:outline-success-600",
        tone === "neutral" &&
          "border-border-default bg-surface-card text-text-primary hover:border-brand-400 hover:bg-brand-50/50 active:scale-[0.99] focus-visible:outline-brand-500 dark:hover:bg-brand-950/30",
        tone === "refuse" &&
          "border-border-default bg-surface-card text-text-secondary hover:border-danger-400 hover:bg-danger-50/60 hover:text-danger-800 active:scale-[0.99] focus-visible:outline-danger-500 dark:hover:bg-danger-950/30 dark:hover:text-danger-300",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          tone === "accept" ? "bg-white/20" : "bg-surface-sunken",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[16px] leading-5 font-semibold tracking-[-0.01em]">
          {label}
        </span>
        <span className={cn("mt-0.5 block text-[12.5px] leading-4", tone === "accept" ? "text-white/80" : "text-text-tertiary")}>
          {hint}
        </span>
      </span>
    </button>
  );
}

/**
 * L'en-tête d'une carte : la nature du conseil, le besoin, son rang.
 *
 * La pastille de famille ne réduit JAMAIS le titre du besoin (seul endroit où
 * il s'affiche) : elle fait partie du bloc du titre, derrière lui. Sur grand
 * écran (à partir de `sm`) elle se lit à sa droite, sur la même ligne ; sur
 * téléphone elle passe SOUS le titre, qui garde toute la largeur du bloc. Un
 * seul élément, rangé dans le bloc du titre — pas une colonne de plus qui
 * prendrait sa part de la ligne, ni deux copies dont l'une serait cachée.
 */
function CardBand({ index, kind, title, tone = "success", family }: { index?: number; kind: string; title: string; tone?: "success" | "brand"; family?: AdviceFamily }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-3.5 py-2",
        tone === "success" ? "bg-success-50 dark:bg-success-950/30" : "bg-brand-50 dark:bg-brand-950/30",
      )}
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-white", tone === "success" ? "bg-success-600" : "bg-brand-600")}>
        {tone === "success" ? <Lightbulb className="size-[17px]" /> : <Sparkles className="size-[17px]" />}
      </span>
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-2">
        <div className="min-w-0 sm:flex-1">
          <p className={cn("text-[11.5px] font-semibold tracking-[0.1em] uppercase", tone === "success" ? "text-success-800 dark:text-success-300" : "text-brand-800 dark:text-brand-300")}>{kind}</p>
          <p className="truncate text-[15px] font-semibold text-text-primary">{title}</p>
        </div>
        {family && (
          <div className="mt-1 max-w-full sm:mt-0 sm:shrink-0">
            <FamilyPill family={family} />
          </div>
        )}
      </div>
      {index !== undefined && (
        <span className="shrink-0 rounded-full border border-border-default bg-surface-card px-2.5 py-0.5 text-[12px] text-text-secondary">Suggestion n°{index}</span>
      )}
    </div>
  );
}

/** La boîte, ou à défaut les initiales de la marque : jamais une case vide. */
export function ProductVisual({ product, size = 84 }: { product: { imageUrl: string | null; brand: string | null; name: string } | null; size?: number }) {
  if (product?.imageUrl) {
    return (
      <Image
        src={product.imageUrl}
        alt=""
        width={size}
        height={size}
        unoptimized={product.imageUrl.startsWith("data:")}
        className="shrink-0 rounded-xl border border-border-subtle bg-white object-contain p-1"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = (product?.brand ?? product?.name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-sunken text-text-tertiary"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="text-[18px] font-semibold tracking-wide">{initials}</span>
    </span>
  );
}

/**
 * Le prix manque (export sans prix de vente) : on le saisit ici, une fois, et
 * il est écrit sur la fiche produit. Entrée ou le bouton enregistrent.
 */
function PriceEntry({ recommendationId, compact = false }: { recommendationId: string; compact?: boolean }) {
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const valid = /^\d+([.,]\d{1,2})?$/.test(draft.trim());
  const save = () =>
    startTransition(async () => {
      const result = await setRecommendationPriceAction({ recommendationId, unitPriceCents: Math.round(Number(draft.trim().replace(",", ".")) * 100) });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? "Prix enregistré" : result.error });
      if (result.ok) router.refresh();
    });
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && valid && !pending) {
            event.preventDefault();
            save();
          }
        }}
        placeholder="Prix TTC"
        aria-label="Prix de vente TTC"
        className={cn(
          "rounded-lg border border-warning-300 bg-warning-50/40 px-2 font-semibold tabular text-text-primary dark:border-warning-800 dark:bg-warning-950/20",
          compact ? "h-8 w-20 text-[13.5px]" : "h-9 w-24 text-[15px]",
        )}
      />
      <Button size="sm" variant="outline" disabled={!valid} loading={pending} onClick={save}>
        {compact ? "OK" : "Enregistrer le prix"}
      </Button>
    </span>
  );
}

/** Une photo venue d'une base ouverte se crédite : c'est la condition de sa licence. */
function ImageCredit({ source }: { source: string | null }) {
  const label = source === "openbeautyfacts" ? "Open Beauty Facts" : source === "openproductsfacts" ? "Open Products Facts" : source === "openfoodfacts" ? "Open Food Facts" : null;
  if (!label) return null;
  return <p className="px-1 text-[10.5px] text-text-tertiary">Photo : {label}, CC BY-SA.</p>;
}

export function StockBadge({ quantity, low }: { quantity: number; low: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-medium",
        quantity <= 0
          ? "bg-danger-100 text-danger-800 dark:bg-danger-900/40 dark:text-danger-300"
          : low
            ? "bg-warning-100 text-warning-800 dark:bg-warning-900/40 dark:text-warning-400"
            : "bg-success-100 text-success-800 dark:bg-success-900/40 dark:text-success-300",
      )}
    >
      <Check className="size-3.5" strokeWidth={3} />
      {quantity <= 0 ? "Rupture" : low ? `Plus que ${quantity} en stock` : `En stock : ${quantity}`}
    </span>
  );
}

/** Ce que le conseil apporte, en trois mots-clés écrits dans la règle. */
function BenefitChips({ benefits }: { benefits: string[] }) {
  if (benefits.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {benefits.slice(0, 3).map((benefit) => (
        <li key={benefit} className="flex items-center gap-1.5 rounded-full bg-surface-sunken/70 px-2.5 py-1 text-[12.5px] leading-4 text-text-secondary">
          <Check className="size-3.5 shrink-0 text-brand-600 dark:text-brand-400" strokeWidth={2.5} />
          {benefit}
        </li>
      ))}
    </ul>
  );
}

/**
 * Une routine : plusieurs étapes, une seule carte, un seul geste.
 *
 * Chaque étape garde sa référence, son prix et son stock ; « Proposer la
 * routine » les ajoute toutes à la délivrance, et chacune peut être retirée.
 */
function RoutineCard({
  index,
  steps,
  canDecide,
  canVerify = true,
  inBasket,
  onAccept,
  onCancelAccept,
}: {
  index?: number;
  steps: AdviceView[];
  canDecide: boolean;
  canVerify?: boolean;
  inBasket: (id: string) => boolean;
  onAccept: (recommendation: AdviceView) => void;
  onCancelAccept: (recommendation: AdviceView) => void;
}) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();
  const first = steps[0];
  const routine = first?.routine;
  if (!first || !routine) return null;
  const priceOf = (step: AdviceView) => step.unitPriceCents || step.product?.salePriceCents || 0;
  const total = steps.reduce((sum, step) => sum + priceOf(step), 0);
  const remaining = steps.filter((step) => !inBasket(step.id));
  // La gamme commune : la marque renseignée, sinon le premier mot du nom
  // (« EUCERIN DERMOPURE … » trois fois se lit « la routine Eucerin »).
  const brandOf = (step: AdviceView) => step.product?.brand ?? step.product?.name.split(/\s+/)[0] ?? null;
  const brands = [...new Set(steps.map(brandOf).filter(Boolean))];
  const brand = brands.length === 1 && brands[0] ? brands[0].charAt(0).toUpperCase() + brands[0].slice(1).toLowerCase() : null;
  const vigilances = first.opportunity?.safetyNotes ?? [];
  // Vigilances patient de toutes les étapes, une seule fois par population (la plus forte).
  const rank = { INFO: 0, CAUTION: 1, PHARMACIST_VALIDATION: 2, CONTRAINDICATION: 3 } as const;
  const patientVigilances = [...steps.flatMap((step) => step.vigilances ?? []).reduce((map, v) => {
    const previous = map.get(v.population);
    if (!previous || rank[v.level] > rank[previous.level]) map.set(v.population, v);
    return map;
  }, new Map<string, AdviceView["vigilances"][number]>()).values()];

  const ignoreAll = () =>
    startTransition(async () => {
      for (const step of remaining) await declineRecommendationAction(step.id);
      push({ tone: "success", title: "Routine ignorée" });
    });

  return (
    <CardFrame accent={remaining.length === 0 ? "success" : "brand"}>
      <CardBand index={index} kind="Routine associée" title={routine.title} tone="brand" family={first.family} />

      <VigilanceStrip vigilances={patientVigilances} canVerify={canVerify} />

      {first.shortReason && (
        <div className="flex items-start gap-3 rounded-xl bg-surface-sunken/70 px-3.5 py-3">
          <Pill className="mt-0.5 size-[18px] shrink-0 text-text-tertiary" />
          <p className="text-[14.5px] leading-[1.5] text-text-primary">{first.shortReason}</p>
        </div>
      )}

      {vigilances.length > 0 && (
        <div className="rounded-xl border border-danger-200 bg-danger-50/60 px-4 py-3 dark:border-danger-800 dark:bg-danger-950/30">
          <p className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.06em] text-danger-800 uppercase dark:text-danger-300">
            <ShieldAlert className="size-4" /> Vigilances importantes
          </p>
          <ul className="mt-1.5 space-y-1">
            {vigilances.map((note) => (
              <li key={note} className="text-[13px] leading-5 text-danger-900 dark:text-danger-200">• {note}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[12px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">
          {brand ? `Notre recommandation : la routine ${brand}` : "Notre recommandation, dans votre officine"}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {steps.map((step) => {
            const accepted = inBasket(step.id);
            const price = priceOf(step);
            const low = step.product ? step.product.quantity > 0 && step.product.quantity <= step.product.alertThreshold : false;
            return (
              <div key={step.id} className={cn("flex flex-col gap-2.5 rounded-xl border px-3.5 py-3", accepted ? "border-success-300 bg-success-50/40 dark:border-success-800 dark:bg-success-950/20" : "border-border-subtle bg-surface-card")}>
                <span className="inline-flex w-fit items-center rounded-full bg-success-100 px-2.5 py-0.5 text-[11.5px] font-semibold tracking-[0.06em] text-success-800 uppercase dark:bg-success-900/40 dark:text-success-300">
                  {(step.routine?.stepIndex ?? 0) + 1}. {step.routine?.stepLabel}
                </span>
                <div className="flex items-start gap-3">
                  <ProductVisual product={step.product} size={64} />
                  <div className="min-w-0 flex-1">
                    {step.product?.brand && <p className="text-[12px] font-semibold text-text-secondary">{step.product.brand}</p>}
                    <p className="text-[14px] leading-5 font-semibold text-text-primary">{step.product?.name ?? "Produit supprimé"}</p>
                  </div>
                </div>
                <p className="text-[12.5px] leading-4 text-text-secondary">{step.routine?.benefit}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  {price > 0 ? (
                    <span className="text-[17px] font-semibold tabular text-text-primary">{formatCents(price)}</span>
                  ) : canDecide ? (
                    <PriceEntry recommendationId={step.id} compact />
                  ) : (
                    <span className="text-[13px] font-medium text-warning-700 dark:text-warning-400">Prix à renseigner</span>
                  )}
                  <StockBadge quantity={step.product?.quantity ?? 0} low={low} />
                  <ShortDateBadge shortDate={step.shortDate ?? null} />
                </div>
                {step.precautions.filter((note) => !vigilances.includes(note)).length > 0 && (
                  <p className="text-[12px] leading-4 text-warning-800 dark:text-warning-500">⚠ {step.precautions.filter((note) => !vigilances.includes(note)).join(" · ")}</p>
                )}
                {canDecide && (
                  accepted ? (
                    <p className="flex items-center justify-between text-[12.5px] font-medium text-success-800 dark:text-success-300">
                      <span className="flex items-center gap-1"><Check className="size-4" strokeWidth={2.5} /> Ajouté</span>
                      <button type="button" onClick={() => onCancelAccept(step)} className="underline underline-offset-2">Annuler</button>
                    </p>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => onAccept(step)} disabled={pending || (step.requiresValidation && !canVerify)} title={step.requiresValidation && !canVerify ? "Validation pharmacien requise" : undefined}>Proposer</Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(async () => { await declineRecommendationAction(step.id); })}>Ignorer</Button>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      {first.counterScript && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/70 px-3.5 py-3 dark:border-brand-900 dark:bg-brand-950/50">
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-brand-800 uppercase dark:text-brand-300">À dire au patient</p>
          <p className="mt-1 text-[16px] leading-[1.5] text-text-primary">{first.counterScript.replace(/\.\s*[^.]*est adapté à cette étape\.\s*»$/, ". »")}</p>
        </div>
      )}

      {canDecide && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13.5px] text-text-secondary">
            Routine complète : <span className="font-semibold tabular text-text-primary">{formatCents(total)}</span>
            {remaining.length < steps.length && remaining.length > 0 && ` · ${steps.length - remaining.length} étape(s) déjà ajoutée(s)`}
          </p>
          <div className="flex flex-wrap gap-2">
            {remaining.length > 0 ? (
              <>
                <Button size="lg" leadingIcon={<Check className="size-5" strokeWidth={2.5} />} onClick={() => remaining.forEach((step) => onAccept(step))}>
                  Proposer la routine
                </Button>
                <Button size="lg" variant="outline" leadingIcon={<X className="size-5" />} loading={pending} onClick={ignoreAll}>
                  Ignorer
                </Button>
              </>
            ) : (
              <span className="flex items-center gap-2 rounded-xl bg-success-100/70 px-4 py-2.5 text-[14px] font-semibold text-success-900 dark:bg-success-900/25 dark:text-success-200">
                <Check className="size-5" strokeWidth={2.5} /> Routine ajoutée à la délivrance
              </span>
            )}
          </div>
        </div>
      )}
    </CardFrame>
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
