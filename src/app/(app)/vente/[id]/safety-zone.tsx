"use client";

import { useState, useTransition } from "react";
import { Ban, ChevronDown, ShieldAlert, ShieldCheck } from "lucide-react";
import { acknowledgeSafetyFindingsAction } from "@/server/actions/prescriptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { SAFETY_SEVERITY } from "@/config/statuses";
import { cn } from "@/lib/utils";
import { ZoneTitle } from "./prescription-zone";
import { COUNTER_BLOCKING_SUBJECTS, blocksCounter } from "@/core/ai/safety-gate";
import type { BlockedOpportunityView, SafetyFindingView } from "./types";

/**
 * Zone 2 — la sécurité.
 *
 * Elle parle avant les conseils, et une alerte bloquante non acquittée ferme la
 * zone 3 : on ne vend rien par-dessus une alerte que personne n'a lue.
 * L'acquittement est un acte professionnel — horodaté, signé, journalisé.
 */
export function SafetyZone({
  analysisRunId,
  findings,
  blockedOpportunities,
  canAcknowledge,
}: {
  analysisRunId: string | null;
  findings: SafetyFindingView[];
  blockedOpportunities: BlockedOpportunityView[];
  canAcknowledge: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { push } = useToast();

  // Deux familles d'alertes bloquantes, qui n'appellent pas la même chose :
  // celles qui portent sur le traitement arrêtent le comptoir ; celles qui
  // portent sur un produit ou un conseil disent qu'il a DÉJÀ été écarté.
  const onTreatment = findings.filter(
    (finding) =>
      finding.severity === "BLOCKING" && (COUNTER_BLOCKING_SUBJECTS as readonly string[]).includes(finding.subjectType),
  );
  const unacknowledged = findings.filter(blocksCounter);
  const excludedByEngine = findings.filter(
    (finding) =>
      finding.severity === "BLOCKING" && !(COUNTER_BLOCKING_SUBJECTS as readonly string[]).includes(finding.subjectType),
  );
  const notable = findings.filter(
    (finding) => finding.severity === "WARNING" || finding.severity === "CAUTION",
  );
  const informational = findings.filter((finding) => finding.severity === "INFO");

  const acknowledge = () => {
    if (!analysisRunId) return;
    startTransition(async () => {
      const result = await acknowledgeSafetyFindingsAction(analysisRunId);
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (result.message ?? "Acquitté") : result.error,
      });
    });
  };

  return (
    <section className="space-y-3" aria-labelledby="zone-securite">
      <ZoneTitle
        id="zone-securite"
        step={2}
        title="Sécurité"
        tone={unacknowledged.length > 0 ? "danger" : "neutral"}
      />

      {unacknowledged.length > 0 ? (
        <Card className="border-danger-400 bg-danger-50/50 dark:border-danger-700/50 dark:bg-danger-700/10">
          <CardContent className="space-y-3 pt-5">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-danger-700 dark:text-danger-400">
              <ShieldAlert className="size-[18px] shrink-0" />
              {unacknowledged.length} point{unacknowledged.length > 1 ? "s" : ""} à vérifier
              avant tout conseil
            </p>
            <ul className="space-y-2">
              {unacknowledged.map((finding) => (
                <li
                  key={finding.id}
                  className="text-[13.5px] leading-5 text-text-primary"
                >
                  • {finding.message}
                </li>
              ))}
            </ul>
            {canAcknowledge ? (
              <Button
                variant="danger"
                loading={pending}
                onClick={acknowledge}
                leadingIcon={<ShieldCheck className="size-[18px]" />}
              >
                J&apos;ai vérifié ces points
              </Button>
            ) : (
              <p className="text-[12.5px] text-text-secondary">
                Seul un pharmacien peut acquitter ces points.
              </p>
            )}
          </CardContent>
        </Card>
      ) : notable.length > 0 ? (
        <Card>
          <CardContent className="pt-4 pb-4">
            <ul className="divide-y divide-border-subtle">
              {notable.map((finding) => {
                const severity = SAFETY_SEVERITY[finding.severity];
                return (
                  <li key={finding.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
                    <Badge tone={severity.tone} className="mt-0.5 shrink-0">
                      {severity.label}
                    </Badge>
                    <p className="min-w-0 text-[13px] leading-5 text-text-secondary">
                      {finding.message}
                    </p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center gap-2.5 py-3.5">
            <ShieldCheck className="size-[18px] shrink-0 text-success-600 dark:text-success-500" />
            <p className="text-[13.5px] text-text-secondary">
              Aucune interaction ni contre-indication détectée sur les lignes confirmées.
            </p>
          </CardContent>
        </Card>
      )}

      {(informational.length > 0 ||
        blockedOpportunities.length > 0 ||
        excludedByEngine.length > 0 ||
        (unacknowledged.length === 0 && onTreatment.length > 0)) && (
        <div>
          <button
            type="button"
            onClick={() => setDetailsOpen((value) => !value)}
            aria-expanded={detailsOpen}
            className="flex items-center gap-1.5 text-[12.5px] text-text-tertiary transition-colors hover:text-text-secondary"
          >
            {detailsOpen ? "Masquer" : "Voir"} le détail des signaux (
            {informational.length +
              blockedOpportunities.length +
              excludedByEngine.length +
              onTreatment.length}
            )
            <ChevronDown className={cn("size-3.5 transition-transform", detailsOpen && "rotate-180")} />
          </button>

          {detailsOpen && (
            <div className="mt-2 space-y-3">
              {excludedByEngine.length > 0 && (
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="mb-2 text-[12px] font-medium tracking-wide text-text-tertiary uppercase">
                      Écartés automatiquement par le moteur
                    </p>
                    <ul className="space-y-1.5">
                      {excludedByEngine.map((finding) => (
                        <li key={finding.id} className="text-[12.5px] leading-5 text-text-secondary">
                          • {finding.message}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {onTreatment.length > 0 && unacknowledged.length === 0 && (
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="mb-2 text-[12px] font-medium tracking-wide text-text-tertiary uppercase">
                      Points bloquants acquittés
                    </p>
                    <ul className="space-y-1.5">
                      {onTreatment.map((finding) => (
                        <li key={finding.id} className="text-[12.5px] leading-5 text-text-secondary">
                          • {finding.message}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {informational.length > 0 && (
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="mb-2 text-[12px] font-medium tracking-wide text-text-tertiary uppercase">
                      Informations
                    </p>
                    <ul className="space-y-1.5">
                      {informational.map((finding) => (
                        <li key={finding.id} className="text-[12.5px] leading-5 text-text-secondary">
                          • {finding.message}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {blockedOpportunities.length > 0 && (
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="mb-2 text-[12px] font-medium tracking-wide text-text-tertiary uppercase">
                      Conseils écartés par le moteur
                    </p>
                    <ul className="space-y-2">
                      {blockedOpportunities.map((opportunity) => (
                        <li key={opportunity.id} className="space-y-0.5">
                          <p className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                            <Ban className="size-3.5 shrink-0 text-danger-600 dark:text-danger-500" />
                            {opportunity.title}
                          </p>
                          <p className="pl-5 text-[12px] leading-5 text-text-secondary">
                            {opportunity.blockReason}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
