"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, ChevronDown, RotateCcw, X } from "lucide-react";
import { reviewAdviceRuleAction } from "@/server/actions/advice-rules";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RULE_STATE_LABELS, type RuleState } from "@/core/ai/rule-review";

export type ReviewRuleView = {
  key: string;
  title: string;
  version: string;
  state: RuleState;
  /** Relue sous une version plus ancienne : à considérer comme pas relue. */
  outdated: boolean;
  decidedBy: string | null;
  decidedAt: string | null;
  /** Quand elle se déclenche, en clair. */
  when: string;
  sideEffects: string[];
  /** Ce qu'elle propose. */
  proposes: string;
  question: string | null;
  /** Ce que le pharmacien dirait au patient. */
  script: string;
  reason: string;
  safetyNotes: string[];
};

const FILTERS: { key: RuleState | "ALL"; label: string }[] = [
  { key: "TO_REVIEW", label: "Pas relues" },
  { key: "VALIDATED", label: "Validées" },
  { key: "REJECTED", label: "Refusées" },
  { key: "ALL", label: "Toutes" },
];

const TONES: Record<RuleState, "warning" | "success" | "danger"> = { TO_REVIEW: "warning", VALIDATED: "success", REJECTED: "danger" };

/**
 * La relecture des règles de conseil par la pharmacienne — facultative.
 *
 * Les règles du moteur fonctionnent déjà dans toute officine, sans rien régler. Ici, la pharmacienne peut les lire en
 * clair et, pour SON officine seulement, en refuser une (elle ne se déclenche plus nulle part) ou la valider (une trace
 * signée et datée, sans effet sur ce qui s'affiche).
 */
export function RuleReview({ rules, canManage }: { rules: ReviewRuleView[]; canManage: boolean }) {
  const [filter, setFilter] = useState<RuleState | "ALL">("ALL");
  const counts = useMemo(() => ({ TO_REVIEW: rules.filter((r) => r.state === "TO_REVIEW").length, VALIDATED: rules.filter((r) => r.state === "VALIDATED").length, REJECTED: rules.filter((r) => r.state === "REJECTED").length, ALL: rules.length }), [rules]);
  const shown = filter === "ALL" ? rules : rules.filter((rule) => rule.state === filter);

  return (
    <div className="space-y-5">
      <Alert tone="info" title="Les conseils fonctionnent déjà dans votre officine : vous n'avez rien à régler">
        Les règles ci-dessous sont celles du moteur, communes à toutes les officines PharmaBoost, et elles s&apos;appliquent dès l&apos;envoi du stock.
        Si l&apos;une ne vous convient pas, <strong>refusez-la</strong> : elle ne se déclenchera plus jamais dans votre officine. <strong>Valider</strong> une règle
        garde simplement la trace que vous la cautionnez. Vos propres associations (« Mes associations ») s&apos;ajoutent à ces règles.
      </Alert>

      <div role="tablist" aria-label="Filtrer les règles" className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={filter === item.key}
            onClick={() => setFilter(item.key)}
            className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors", filter === item.key ? "bg-brand-600 text-white" : "bg-surface-sunken text-text-secondary hover:text-text-primary")}
          >
            {item.label} <span className="tabular opacity-80">{counts[item.key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-[13.5px] text-text-secondary">Aucune règle dans cette liste.</CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((rule) => (
            <RuleCard key={rule.key} rule={rule} canManage={canManage} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RuleCard({ rule, canManage }: { rule: ReviewRuleView; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const decide = (decision: "VALIDATED" | "REJECTED" | null) => {
    startTransition(async () => {
      const result = await reviewAdviceRuleAction({ ruleKey: rule.key, decision });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : result.error });
    });
  };

  return (
    <li>
      <Card>
        <CardContent className="space-y-3.5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h3 className="text-[15px] font-semibold text-text-primary">{rule.title}</h3>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge tone={TONES[rule.state]}>{RULE_STATE_LABELS[rule.state]}</Badge>
                {rule.outdated && <Badge tone="warning">Modifiée depuis votre relecture</Badge>}
                {rule.decidedAt && (
                  <span className="text-[12px] text-text-tertiary">
                    {rule.decidedBy ? `${rule.decidedBy} · ` : ""}
                    {formatDate(rule.decidedAt)}
                  </span>
                )}
              </p>
            </div>
            {canManage && (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {rule.state !== "VALIDATED" && (
                  <Button size="sm" disabled={pending} onClick={() => decide("VALIDATED")} leadingIcon={<Check className="size-4" />}>
                    Valider
                  </Button>
                )}
                {rule.state !== "REJECTED" && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("REJECTED")} leadingIcon={<X className="size-4" />}>
                    Refuser
                  </Button>
                )}
                {rule.state !== "TO_REVIEW" && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide(null)} leadingIcon={<RotateCcw className="size-4" />}>
                    Annuler ma décision
                  </Button>
                )}
              </div>
            )}
          </div>

          <dl className="grid gap-x-6 gap-y-2.5 text-[13px] leading-5 sm:grid-cols-[9.5rem_1fr]">
            <dt className="font-medium text-text-secondary">Quand elle se déclenche</dt>
            <dd className="text-text-primary">
              Quand le patient prend : {rule.when}
              {rule.sideEffects.length > 0 && <span className="text-text-secondary"> — ou signale : {rule.sideEffects.join(", ")}</span>}
            </dd>
            <dt className="font-medium text-text-secondary">Ce qu&apos;elle propose</dt>
            <dd className="text-text-primary">{rule.proposes}</dd>
            <dt className="font-medium text-text-secondary">Ce que vous diriez</dt>
            <dd className="text-text-primary">{rule.script}</dd>
          </dl>

          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center gap-1 text-[12.5px] text-text-tertiary hover:text-text-secondary">
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
            Voir le détail (raison affichée, question au patient, précautions)
          </button>
          {open && (
            <div className="space-y-2 rounded-lg bg-surface-sunken px-3.5 py-3 text-[12.5px] leading-5 text-text-secondary">
              <p>
                <strong className="text-text-primary">Raison affichée : </strong>
                {rule.reason}
              </p>
              {rule.question && (
                <p>
                  <strong className="text-text-primary">Question au patient : </strong>
                  {rule.question}
                </p>
              )}
              {rule.safetyNotes.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5">
                  {rule.safetyNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
              <p className="text-text-tertiary">Version {rule.version} de la règle.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
