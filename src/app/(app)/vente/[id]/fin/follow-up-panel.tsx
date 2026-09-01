"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check } from "lucide-react";
import { scheduleReminderAction } from "@/server/actions/reminders";
import { updateConsentAction } from "@/server/actions/patients";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Checkbox } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FollowUpOption = {
  templateKey: string;
  label: string;
  purpose: string;
  dueAt: string;
};

/**
 * Le rappel que le moteur propose d'office — ou le motif pour lequel il n'en
 * propose aucun. Ne rien proposer est un résultat normal : un produit qui
 * propose toujours quelque chose finit par proposer n'importe quoi.
 */
export type FollowUpSuggestionView =
  | { suggested: true; templateKey: string; label: string; dueAt: string; reason: string }
  | { suggested: false; reason: string };

/**
 * Programmer le retour du patient, à la fin de la vente.
 *
 * Les échéances proposées découlent d'un fait de la vente — la durée réelle du
 * traitement, un renouvellement daté —, jamais d'un profil déduit. Le
 * consentement se recueille ici, devant le patient, et n'est jamais coché par
 * défaut.
 */
export function FollowUpPanel({
  patientId,
  prescriptionId,
  saleId,
  options,
  suggestion,
  hasConsent,
  optedOut,
  scheduled,
  canSchedule,
  canUpdateConsent,
}: {
  patientId: string | null;
  prescriptionId: string;
  saleId: string | null;
  options: FollowUpOption[];
  suggestion: FollowUpSuggestionView;
  hasConsent: boolean;
  optedOut: boolean;
  scheduled: { templateLabel: string; dueAt: string }[];
  canSchedule: boolean;
  canUpdateConsent: boolean;
}) {
  // La proposition est retenue d'avance : au comptoir, choisir dans une liste
  // est un travail qu'on peut éviter au pharmacien.
  const [selected, setSelected] = useState<string | null>(
    suggestion.suggested ? suggestion.templateKey : null,
  );
  const [showAll, setShowAll] = useState(false);
  const [consent, setConsent] = useState(hasConsent);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  if (!patientId) {
    return (
      <Card>
        <CardHeader
          title="Programmer un suivi"
          description="Rattachez l'ordonnance à un patient pour pouvoir le recontacter."
        />
      </Card>
    );
  }

  const grantConsent = (granted: boolean) => {
    setConsent(granted);
    startTransition(async () => {
      const data = new FormData();
      data.set("patientId", patientId);
      data.set("type", "FOLLOW_UP_MESSAGE");
      data.set("granted", String(granted));
      const result = await updateConsentAction(data);
      if (!result.ok) {
        setConsent(!granted);
        push({ tone: "error", title: result.error });
      }
    });
  };

  const schedule = () => {
    if (!selected) return;
    const option = options.find((candidate) => candidate.templateKey === selected)!;
    const delayDays = Math.max(
      0,
      Math.round((new Date(option.dueAt).getTime() - Date.now()) / 86_400_000),
    );

    startTransition(async () => {
      const result = await scheduleReminderAction({
        patientId,
        templateKey: option.templateKey,
        delayDays,
        prescriptionId,
        saleId,
      });
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (result.message ?? "Suivi programmé") : result.error,
      });
      if (result.ok) setSelected(null);
    });
  };

  return (
    <Card>
      <CardHeader
        title="Programmer un suivi"
        description="Le patient réapparaîtra dans « Suivis » à la date choisie. Rien ne partira sans votre clic."
      />
      <CardContent className="space-y-4">
        {optedOut ? (
          <Alert tone="neutral" title="Ce patient s'est désinscrit">
            Il ne recevra plus de message de suivi. Vous pouvez toujours lui remettre sa fiche
            au comptoir.
          </Alert>
        ) : (
          <>
            {scheduled.length > 0 && (
              <ul className="space-y-1.5">
                {scheduled.map((item) => (
                  <li
                    key={`${item.templateLabel}-${item.dueAt}`}
                    className="flex items-center gap-2 text-[13px] text-text-secondary"
                  >
                    <Check className="size-4 shrink-0 text-success-600 dark:text-success-500" />
                    {item.templateLabel} — {formatDate(item.dueAt)}
                  </li>
                ))}
              </ul>
            )}

            {canSchedule && (
              <>
                {/* Une phrase, une date, un bouton. Le reste est à un clic de
                    plus, pour qui veut choisir autrement. */}
                {suggestion.suggested ? (
                  <p className="flex items-start gap-2 rounded-lg bg-surface-sunken px-3.5 py-3 text-[13.5px] leading-5 text-text-primary">
                    <CalendarClock className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" />
                    <span>
                      <span className="font-medium">
                        {suggestion.label} — {formatDate(suggestion.dueAt)}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-4 text-text-secondary">
                        {suggestion.reason}
                      </span>
                    </span>
                  </p>
                ) : (
                  <p className="text-[13px] leading-5 text-text-secondary">
                    {suggestion.reason}
                  </p>
                )}

                {(showAll || !suggestion.suggested) && (
                <div className="grid gap-2">
                  {options.map((option) => (
                    <button
                      key={option.templateKey}
                      type="button"
                      onClick={() =>
                        setSelected((current) =>
                          current === option.templateKey ? null : option.templateKey,
                        )
                      }
                      aria-pressed={selected === option.templateKey}
                      className={cn(
                        "rounded-lg border px-3.5 py-3 text-left transition-colors",
                        selected === option.templateKey
                          ? "border-brand-600 bg-brand-50 dark:bg-brand-950"
                          : "border-border-default hover:bg-surface-sunken",
                      )}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-[13.5px] font-medium text-text-primary">
                          {option.label}
                        </span>
                        <span className="flex items-center gap-1 text-[12px] text-text-tertiary">
                          <CalendarClock className="size-3.5" />
                          {formatDate(option.dueAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-4 text-text-secondary">
                        {option.purpose}
                      </span>
                    </button>
                  ))}
                </div>
                )}

                {suggestion.suggested && !showAll && (
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="text-left text-[12.5px] text-text-tertiary underline underline-offset-2 hover:text-text-secondary"
                  >
                    Choisir un autre rappel
                  </button>
                )}

                {canUpdateConsent && (
                  <Checkbox
                    label="Le patient accepte de recevoir un suivi de sa pharmacie"
                    description="À cocher devant lui. Distinct de toute communication commerciale, et révocable à tout moment depuis chaque message."
                    checked={consent}
                    onChange={(event) => grantConsent(event.target.checked)}
                  />
                )}

                <Button
                  onClick={schedule}
                  loading={pending}
                  disabled={!selected}
                  leadingIcon={<CalendarClock className="size-[18px]" />}
                >
                  {suggestion.suggested && selected === suggestion.templateKey
                    ? "Programmer ce rappel"
                    : "Programmer le suivi"}
                </Button>

                {!consent && (
                  <p className="text-[12px] leading-4 text-text-tertiary">
                    Sans consentement, le suivi peut être programmé mais ne pourra pas être
                    envoyé : il restera dans la liste avec le motif affiché.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
