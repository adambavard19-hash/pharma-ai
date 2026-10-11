"use client";

import { useId, useState, useTransition, type ReactNode, type SelectHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";
import { archiveObjectiveAction, createObjectiveAction, decideBonusAction, proposeBonusAction } from "@/server/actions/mobile-personal";
import { OBJECTIVE_METRICS, OBJECTIVE_METRIC_HINTS, OBJECTIVE_METRIC_LABELS, OBJECTIVE_PERIOD_LABELS, OBJECTIVE_PERIODS, type ObjectiveMetricCode, type ObjectivePeriodCode } from "@/core/personal/objectives";
import type { BonusDecision } from "@/core/personal/bonuses";
import { cn } from "@/lib/utils";
import { FormError, MField, MInput, MSubmit, useFormAction } from "../../../_components/fields";

const SELECT =
  "block h-[52px] w-full appearance-none rounded-[14px] border border-ink-200 bg-white px-4 pr-11 text-[16px] text-ink-900 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none aria-[invalid=true]:border-danger-500";

function MSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={cn(SELECT, props.className)} />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink-500" aria-hidden="true" />
    </div>
  );
}

type Member = { id: string; name: string };

/** Un panneau repliable : le formulaire n'encombre pas l'écran tant qu'on ne l'ouvre pas. */
function Drawer({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-brand-300 bg-white/70 text-[14.5px] font-semibold text-brand-800 transition-colors active:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <Plus className="size-4" aria-hidden="true" />
        {label}
      </button>
    );
  }
  return (
    <div className="rounded-[20px] border border-brand-100 bg-white p-4 shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)] sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[15px] font-bold text-ink-900">{label}</p>
        <button type="button" onClick={() => setOpen(false)} className="-mr-2 flex size-11 items-center justify-center rounded-full text-ink-500 active:bg-ink-50" aria-label="Fermer">
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      {children(() => setOpen(false))}
    </div>
  );
}

export function ObjectiveForm({ members, challenges }: { members: Member[]; challenges: { id: string; title: string }[] }) {
  return <Drawer label="Fixer un objectif">{() => <ObjectiveFields members={members} challenges={challenges} />}</Drawer>;
}

function ObjectiveFields({ members, challenges }: { members: Member[]; challenges: { id: string; title: string }[] }) {
  const id = useId();
  const router = useRouter();
  const { pending, onSubmit, fieldErrors, error, message } = useFormAction(async (previous, formData) => {
    const result = await createObjectiveAction(previous, formData);
    if (result.ok) router.refresh();
    return result;
  });
  const [metric, setMetric] = useState<ObjectiveMetricCode>("ADVICE_SOLD");
  const [period, setPeriod] = useState<ObjectivePeriodCode>("MONTH");
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <MField label="Collaborateur" htmlFor={`${id}-user`} error={fieldErrors.userId}>
        <MSelect id={`${id}-user`} name="userId" required defaultValue="" aria-invalid={Boolean(fieldErrors.userId)}>
          <option value="" disabled>
            Choisir…
          </option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </MSelect>
      </MField>
      <MField label="Nom de l'objectif" htmlFor={`${id}-title`} error={fieldErrors.title}>
        <MInput id={`${id}-title`} name="title" required maxLength={80} placeholder="Ex. : 30 conseils validés ce mois" aria-invalid={Boolean(fieldErrors.title)} />
      </MField>
      <MField label="Ce qui est mesuré" htmlFor={`${id}-metric`} hint={OBJECTIVE_METRIC_HINTS[metric]} error={fieldErrors.metric}>
        <MSelect id={`${id}-metric`} name="metric" value={metric} onChange={(event) => setMetric(event.target.value as ObjectiveMetricCode)}>
          {OBJECTIVE_METRICS.map((value) => (
            <option key={value} value={value}>
              {OBJECTIVE_METRIC_LABELS[value]}
            </option>
          ))}
        </MSelect>
      </MField>
      <div className="grid grid-cols-2 gap-3">
        <MField label="Cible" htmlFor={`${id}-target`} error={fieldErrors.target}>
          <MInput id={`${id}-target`} name="target" type="number" inputMode="numeric" min={1} max={10000} required defaultValue={20} aria-invalid={Boolean(fieldErrors.target)} />
        </MField>
        <MField label="Période" htmlFor={`${id}-period`} error={fieldErrors.period}>
          <MSelect id={`${id}-period`} name="period" value={period} onChange={(event) => setPeriod(event.target.value as ObjectivePeriodCode)}>
            {OBJECTIVE_PERIODS.map((value) => (
              <option key={value} value={value}>
                {OBJECTIVE_PERIOD_LABELS[value]}
              </option>
            ))}
          </MSelect>
        </MField>
      </div>
      {period === "CUSTOM" && (
        <div className="grid grid-cols-2 gap-3">
          <MField label="Du" htmlFor={`${id}-start`} error={fieldErrors.startsOn}>
            <MInput id={`${id}-start`} name="startsOn" type="date" required aria-invalid={Boolean(fieldErrors.startsOn)} />
          </MField>
          <MField label="Au" htmlFor={`${id}-end`} error={fieldErrors.endsOn}>
            <MInput id={`${id}-end`} name="endsOn" type="date" required aria-invalid={Boolean(fieldErrors.endsOn)} />
          </MField>
        </div>
      )}
      {metric === "UNITS_SOLD" && challenges.length > 0 && (
        <MField label="Challenge lié" htmlFor={`${id}-challenge`} optional hint="Les unités comptées seront celles du collaborateur dans ce challenge." error={fieldErrors.challengeId}>
          <MSelect id={`${id}-challenge`} name="challengeId" defaultValue="">
            <option value="">Aucun</option>
            {challenges.map((challenge) => (
              <option key={challenge.id} value={challenge.id}>
                {challenge.title}
              </option>
            ))}
          </MSelect>
        </MField>
      )}
      <FormError message={error} />
      {message && (
        <p role="status" className="rounded-2xl bg-success-50 px-4 py-3 text-[13.5px] font-medium text-success-800">
          {message}
        </p>
      )}
      <MSubmit pending={pending}>Fixer l&apos;objectif</MSubmit>
    </form>
  );
}

export function BonusForm({ members, links }: { members: Member[]; links: { value: string; label: string; userId: string | null }[] }) {
  return <Drawer label="Proposer une prime">{() => <BonusFields members={members} links={links} />}</Drawer>;
}

function BonusFields({ members, links }: { members: Member[]; links: { value: string; label: string; userId: string | null }[] }) {
  const id = useId();
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const { pending, onSubmit, fieldErrors, error, message } = useFormAction(async (previous, formData) => {
    const result = await proposeBonusAction(previous, formData);
    if (result.ok) router.refresh();
    return result;
  });
  const usable = links.filter((link) => link.userId === null || link.userId === userId);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <MField label="Collaborateur" htmlFor={`${id}-user`} error={fieldErrors.userId}>
        <MSelect id={`${id}-user`} name="userId" value={userId} onChange={(event) => setUserId(event.target.value)} aria-invalid={Boolean(fieldErrors.userId)}>
          <option value="" disabled>
            Choisir…
          </option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </MSelect>
      </MField>
      <MField label="Motif" htmlFor={`${id}-label`} error={fieldErrors.label}>
        <MInput id={`${id}-label`} name="label" maxLength={80} placeholder="Ex. : Objectif d'octobre atteint" aria-invalid={Boolean(fieldErrors.label)} />
      </MField>
      <MField label="Montant (€)" htmlFor={`${id}-amount`} error={fieldErrors.amount}>
        <MInput id={`${id}-amount`} name="amount" inputMode="decimal" placeholder="50" aria-invalid={Boolean(fieldErrors.amount)} />
      </MField>
      {usable.length > 0 && (
        <MField label="Lié à" htmlFor={`${id}-link`} optional error={fieldErrors.objectiveId ?? fieldErrors.challengeId}>
          <MSelect id={`${id}-link`} name="link" defaultValue="">
            <option value="">Rien de particulier</option>
            {usable.map((link) => (
              <option key={link.value} value={link.value}>
                {link.label}
              </option>
            ))}
          </MSelect>
        </MField>
      )}
      <MField label="Note pour vous" htmlFor={`${id}-note`} optional hint="Visible de vous seul.">
        <MInput id={`${id}-note`} name="note" maxLength={300} />
      </MField>
      <FormError message={error} />
      {message && (
        <p role="status" className="rounded-2xl bg-success-50 px-4 py-3 text-[13.5px] font-medium text-success-800">
          {message}
        </p>
      )}
      <MSubmit pending={pending}>Proposer la prime</MSubmit>
      <p className="text-[12px] leading-5 text-text-tertiary">PharmaBoost ne verse rien : il garde la trace de votre décision. Le collaborateur ne voit la prime qu&apos;une fois validée par vous.</p>
    </form>
  );
}

const DECISION_LABELS: Record<BonusDecision, string> = { VALIDATE: "Valider", PAY: "Marquer versée", CANCEL: "Annuler" };

/** Les gestes possibles sur une prime, selon son statut. */
export function BonusButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const decisions: BonusDecision[] = status === "PROPOSED" ? ["VALIDATE", "CANCEL"] : status === "VALIDATED" ? ["PAY", "CANCEL"] : [];
  if (decisions.length === 0) return null;
  const decide = (decision: BonusDecision) =>
    startTransition(async () => {
      if (decision === "CANCEL" && !window.confirm("Annuler cette prime ? Le collaborateur ne la verra plus.")) return;
      const result = await decideBonusAction({ id, decision });
      if (!result.ok) setError(result.error);
      else {
        setError(null);
        router.refresh();
      }
    });
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {decisions.map((decision) => (
          <button
            key={decision}
            type="button"
            disabled={pending}
            onClick={() => decide(decision)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-[12px] px-3.5 text-[13.5px] font-semibold transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
              decision === "CANCEL" ? "border border-ink-200 bg-white text-ink-700 active:bg-ink-50" : "bg-brand-gradient text-white",
            )}
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : decision === "CANCEL" ? <X className="size-4" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
            {DECISION_LABELS[decision]}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-[12.5px] font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function ArchiveObjectiveButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if (!window.confirm(`Retirer l'objectif « ${title} » ?`)) return;
          const result = await archiveObjectiveAction({ id });
          if (result.ok) router.refresh();
        })
      }
      className="inline-flex min-h-11 items-center gap-1 rounded-[12px] px-3 text-[13px] font-semibold text-ink-600 active:bg-ink-50 disabled:opacity-60"
      aria-label={`Retirer l'objectif « ${title} »`}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
      Retirer
    </button>
  );
}
