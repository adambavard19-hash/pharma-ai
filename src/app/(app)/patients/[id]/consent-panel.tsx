"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { updateConsentAction } from "@/server/actions/patients";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { CONSENT_LABELS } from "@/config/statuses";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Gestion des consentements.
 *
 * Chaque consentement est horodaté et révocable à tout moment. Sans
 * consentement au partage, l'application refuse la transmission de la fiche
 * conseil au patient.
 */
export function ConsentPanel({
  patientId,
  consents,
  canEdit,
}: {
  patientId: string;
  consents: { type: string; granted: boolean; updatedAt: Date }[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const byType = new Map(consents.map((c) => [c.type, c]));

  const toggle = (type: string, granted: boolean) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("patientId", patientId);
      formData.set("type", type);
      formData.set("granted", String(granted));

      const result = await updateConsentAction(formData);
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (result.message ?? "Consentement mis à jour") : result.error,
      });
    });
  };

  return (
    <Card>
      <CardHeader
        title="Consentements"
        description="Recueillis au comptoir, horodatés et révocables."
      />
      <CardContent className="pt-0">
        <ul className="divide-y divide-border-subtle">
          {Object.entries(CONSENT_LABELS).map(([type, meta]) => {
            const consent = byType.get(type);
            const granted = consent?.granted ?? false;

            return (
              <li key={type} className="space-y-1.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-text-primary">{meta.label}</p>
                    <p className="text-[11.5px] leading-4 text-text-tertiary">
                      {meta.description}
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggle(type, true)}
                        aria-label={`Accorder : ${meta.label}`}
                        className={cn(
                          "rounded-md p-1.5 transition-colors disabled:opacity-50",
                          granted
                            ? "bg-success-100 text-success-700 dark:bg-success-700/30 dark:text-success-500"
                            : "text-text-tertiary hover:bg-surface-sunken",
                        )}
                      >
                        <Check className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggle(type, false)}
                        aria-label={`Retirer : ${meta.label}`}
                        className={cn(
                          "rounded-md p-1.5 transition-colors disabled:opacity-50",
                          !granted && consent
                            ? "bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-200"
                            : "text-text-tertiary hover:bg-surface-sunken",
                        )}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <Badge tone={granted ? "success" : "neutral"}>
                      {granted ? "Accordé" : "Non accordé"}
                    </Badge>
                  )}
                </div>
                {consent && (
                  <p className="text-[11px] text-text-tertiary">
                    {granted ? "Accordé" : "Retiré"} le {formatDate(consent.updatedAt)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
