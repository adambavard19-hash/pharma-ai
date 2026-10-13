"use client";

import { useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { refuseRobotProposalAction, validateRobotProposalAction } from "@/server/actions/admin-robot-proposals";
import type { RobotProposalView } from "@/server/services/robot-proposals";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";

export type RobotProposalCard = Omit<RobotProposalView, "decidedAt" | "createdAt"> & { decidedAt: string | null; createdAt: string };

/**
 * « Suggestions du robot » : une carte par (médicament, produit). Le robot continue de la proposer, marquée « à confirmer »,
 * tant qu'elle n'est pas tranchée ; validée, elle devient un conseil central ; refusée, elle ne revient plus jamais.
 */
export function RobotProposalsBoard({ pending, recent }: { pending: RobotProposalCard[]; recent: RobotProposalCard[] }) {
  return (
    <div className="space-y-6">
      <Alert tone="info" title="Comment ça marche">
        Le robot ne voit que le médicament et une liste fermée de produits en stock dans la pharmacie, jamais le patient. Ce qu&apos;il choisit passe par les mêmes garde-fous que tout conseil
        (vigilances, contre-indications, exclusions de la pharmacie, stock), et la carte du comptoir ressemble à tout autre conseil : le pharmacien ne voit pas d&apos;où il vient. Validée ici, la proposition devient un
        conseil pour toutes les pharmacies ; refusée, ce produit n&apos;est plus jamais suggéré pour ce médicament.
      </Alert>

      {pending.length === 0 ? (
        <EmptyState title="Aucune proposition à relire" description="Le robot n'a rien proposé de nouveau. Les médicaments bipés sont couverts par les règles, ou il n'a rien trouvé d'utile dans le stock." />
      ) : (
        <ul className="space-y-3">
          {pending.map((proposal) => (
            <li key={proposal.id}>
              <ProposalCard proposal={proposal} />
            </li>
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <details className="rounded-xl border border-border-subtle bg-surface-card p-4">
          <summary className="cursor-pointer text-[14px] font-semibold text-text-primary">Déjà tranchées ({recent.length})</summary>
          <ul className="mt-3 space-y-1.5 text-[13px] text-text-secondary">
            {recent.map((proposal) => (
              <li key={proposal.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={proposal.status === "VALIDATED" ? "success" : "neutral"}>{proposal.status === "VALIDATED" ? "Validée" : "Refusée"}</Badge>
                <span className="text-text-primary">
                  {proposal.drugLabel.replace(/,.*$/, "")} → {proposal.productName}
                </span>
                {proposal.decidedBy && (
                  <span className="text-text-tertiary">
                    · {proposal.decidedBy}, {formatDate(proposal.decidedAt)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: RobotProposalCard }) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();
  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : (result.error ?? "Erreur") });
    });
  const manual = proposal.central.kind === "MANUAL";
  const feedback = proposal.feedback;
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold text-text-primary">
            {proposal.drugLabel.replace(/,.*$/, "")} → {proposal.productName}
          </h3>
          <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-secondary">
            <Badge tone="accent">{proposal.needLabel}</Badge>
            <span>{[proposal.substance, proposal.atcCode ? `ATC ${proposal.atcCode}` : null].filter(Boolean).join(" · ")}</span>
            <span>
              · {proposal.categoryLabel}
              {proposal.productBrand ? ` · ${proposal.productBrand}` : ""}
            </span>
          </p>
          <p className="text-[12.5px] text-text-tertiary">
            Proposé dans {proposal.occurrences} pharmacie{proposal.occurrences > 1 ? "s" : ""}
            {proposal.pharmacies.length > 0 ? ` (${proposal.pharmacies.slice(0, 4).join(", ")}${proposal.pharmacies.length > 4 ? "…" : ""})` : ""}
            {feedback && feedback.decided > 0 ? ` · au comptoir : ${feedback.retained} retenu${feedback.retained > 1 ? "s" : ""} sur ${feedback.decided}, ${feedback.bought} acheté${feedback.bought > 1 ? "s" : ""}` : " · pas encore tranché au comptoir"}
          </p>
        </div>
        <dl className="grid gap-2 text-[13.5px] sm:grid-cols-[9rem_1fr]">
          <dt className="text-text-tertiary">Pourquoi (pharmacien)</dt>
          <dd className="text-text-primary">{proposal.reason}</dd>
          <dt className="text-text-tertiary">Phrase de comptoir</dt>
          <dd className="text-text-primary">« {proposal.script} »</dd>
          <dt className="text-text-tertiary">Une fois validée</dt>
          <dd className={manual ? "text-warning-700" : "text-text-secondary"}>{proposal.central.summary}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button variant="success" size="sm" disabled={pending || manual} onClick={() => run(() => validateRobotProposalAction({ id: proposal.id }))}>
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
            Valider pour toutes les pharmacies
          </Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => refuseRobotProposalAction({ id: proposal.id }))}>
            <X className="size-3.5" aria-hidden />
            Refuser — ne plus le proposer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
