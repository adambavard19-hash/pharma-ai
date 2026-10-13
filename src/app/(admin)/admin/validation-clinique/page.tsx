import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck, ShieldOff, Stethoscope } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listClinicalFlagGroups, type ClinicalFlagGroup } from "@/server/services/mobile/coach";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { ClinicalDecisionButtons } from "./decision-buttons";

export const metadata: Metadata = { title: "Validation clinique" };

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

const DECISION_LABELS: Record<string, string> = { CONFIRMED_OK: "Règle confirmée", RULE_CHANGED: "Règle modifiée", DISMISSED: "Écarté", UNDER_REVIEW: "En relecture", OPEN: "Ouvert" };

/**
 * La validation clinique centrale : les règles de conseil que des pharmaciens ont jugées « pas adaptées à ce patient »
 * au comptoir. Un refus de ce type n'est jamais renvoyé au pharmacien comme une lacune : c'est la RÈGLE qu'on relit, ici,
 * une fois pour toutes les officines. Agrégats seulement : un compte par règle et par officine, les motifs. Aucune
 * vente, aucun patient, aucun collaborateur.
 */
export default async function ClinicalReviewPage() {
  await requirePlatformSession();
  const { open, closed } = await listClinicalFlagGroups();

  return (
    <>
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Validation clinique"
        description="Les règles de conseil jugées inadaptées au comptoir, par plusieurs refus « pas adapté à ce patient ». Relisez la règle dans Conseils, puis tranchez ici."
      />

      <Alert tone="info" title="Agrégats uniquement" icon={<ShieldOff className="size-[18px]" />}>
        Un nombre de refus par règle et le nombre d&apos;officines concernées. Aucune ordonnance, aucun patient, aucun collaborateur. Les officines de démonstration ne remontent rien.
      </Alert>

      {open.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck className="size-5" />}
            title="Aucune règle signalée"
            description="Quand un pharmacien indique qu'un conseil n'était « pas adapté à ce patient », la règle concernée apparaît ici, comptée, pour relecture."
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {open.map((group) => (
            <FlagCard key={group.ruleKey} group={group} />
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-text-primary">Tranchés récemment</h2>
          <Card className="divide-y divide-border-subtle p-0">
            {closed.map((group) => (
              <div key={group.ruleKey} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text-primary">{group.ruleTitle}</span>
                <span className="text-[12.5px] text-text-tertiary tabular">
                  {group.count} refus · {group.pharmacies} officine{group.pharmacies > 1 ? "s" : ""}
                </span>
                {group.lastDecision && (
                  <Badge tone={group.lastDecision.status === "RULE_CHANGED" ? "brand" : "neutral"}>
                    {DECISION_LABELS[group.lastDecision.status] ?? group.lastDecision.status}
                    {group.lastDecision.at ? ` · ${DATE.format(group.lastDecision.at)}` : ""}
                  </Badge>
                )}
              </div>
            ))}
          </Card>
        </section>
      )}
    </>
  );
}

function FlagCard({ group }: { group: ClinicalFlagGroup }) {
  return (
    <li>
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning-50 text-warning-700">
            <Stethoscope className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-semibold text-text-primary">{group.ruleTitle}</p>
              <Badge tone={group.status === "UNDER_REVIEW" ? "info" : "warning"}>{DECISION_LABELS[group.status]}</Badge>
              {!group.known && <Badge tone="neutral">Règle introuvable</Badge>}
            </div>
            <p className="font-mono text-[11.5px] text-text-tertiary">{group.ruleKey}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-right">
            <div>
              <p className="text-[22px] leading-none font-bold text-text-primary tabular">{group.count}</p>
              <p className="mt-1 text-[11.5px] text-text-tertiary">refus</p>
            </div>
            <div>
              <p className="text-[22px] leading-none font-bold text-text-primary tabular">{group.pharmacies}</p>
              <p className="mt-1 text-[11.5px] text-text-tertiary">officine{group.pharmacies > 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>
        <p className="text-[13px] text-text-secondary">
          Motif : {group.reasons.join(" · ")}
          {group.firstAt && group.lastAt ? ` — du ${DATE.format(group.firstAt)} au ${DATE.format(group.lastAt)}` : ""}
        </p>
        <div className="flex flex-col gap-3 border-t border-border-subtle pt-3 md:flex-row md:items-end md:justify-between">
          <div className="md:max-w-xl md:flex-1">
            <ClinicalDecisionButtons ruleKey={group.ruleKey} underReview={group.status === "UNDER_REVIEW"} />
          </div>
          <Link href="/admin/conseils" className="inline-flex min-h-10 items-center gap-1.5 text-[13.5px] font-semibold text-brand-700 hover:underline">
            Relire la règle dans Conseils &amp; associations
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </Card>
    </li>
  );
}
