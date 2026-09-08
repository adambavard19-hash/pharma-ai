"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check, Pencil, X } from "lucide-react";
import { scheduleReminderAction } from "@/server/actions/reminders";
import { updateConsentAction } from "@/server/actions/patients";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input } from "@/components/ui/field";
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
 * Le suivi que le moteur propose d'office — ou le motif pour lequel il n'en
 * propose aucun. Ne rien proposer est un résultat normal : un produit qui
 * propose toujours quelque chose finit par proposer n'importe quoi.
 */
export type FollowUpSuggestionView =
  | { suggested: true; templateKey: string; label: string; dueAt: string; reason: string }
  | { suggested: false; reason: string };

/**
 * Le suivi automatique, à la fin de la vente.
 *
 * Le pharmacien voit UNE proposition, adossée à un fait de la vente (durée
 * réelle du traitement, renouvellement daté) et trois gestes : Activer,
 * Modifier, Ne pas suivre. Le consentement se recueille ici, devant le
 * patient, et n'est jamais coché par défaut.
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
  const [mode, setMode] = useState<"proposed" | "editing" | "dismissed" | "activated">("proposed");
  const [selected, setSelected] = useState<string | null>(suggestion.suggested ? suggestion.templateKey : null);
  const [delayDays, setDelayDays] = useState<string>(
    suggestion.suggested ? String(daysUntil(suggestion.dueAt)) : "",
  );
  const [consent, setConsent] = useState(hasConsent);
  const [activated, setActivated] = useState<{ label: string; dueAt: string }[]>(scheduled.map((item) => ({ label: item.templateLabel, dueAt: item.dueAt })));
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  if (!patientId) {
    return (
      <Card>
        <CardHeader title="Suivi automatique" description="Rattachez l'ordonnance à un patient pour pouvoir prendre de ses nouvelles." />
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

  const schedule = (templateKey: string, days: number) => {
    const option = options.find((candidate) => candidate.templateKey === templateKey);
    if (!option) return;
    startTransition(async () => {
      const result = await scheduleReminderAction({ patientId, templateKey, delayDays: days, prescriptionId, saleId });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Suivi activé") : result.error });
      if (result.ok) {
        setActivated((current) => [...current, { label: option.label, dueAt: result.data.dueAt }]);
        setMode("activated");
      }
    });
  };

  const activateSuggestion = () => {
    if (!suggestion.suggested) return;
    schedule(suggestion.templateKey, daysUntil(suggestion.dueAt));
  };

  const confirmEdit = () => {
    const days = Number.parseInt(delayDays, 10);
    if (!selected || !Number.isFinite(days) || days < 0) return;
    schedule(selected, days);
  };

  return (
    <Card>
      <CardHeader
        title="Suivi automatique"
        description="Votre officine prendra des nouvelles du patient à la date choisie. Le message est fixe, relu, et part après votre validation."
      />
      <CardContent className="space-y-4">
        {optedOut ? (
          <Alert tone="neutral" title="Ce patient s'est désinscrit">
            Il ne recevra plus de message de suivi. Vous pouvez toujours lui remettre son plan au comptoir.
          </Alert>
        ) : (
          <>
            {activated.length > 0 && (
              <ul className="space-y-1.5">
                {activated.map((item) => (
                  <li key={`${item.label}-${item.dueAt}`} className="flex items-center gap-2 text-[13.5px] text-text-primary">
                    <Check className="size-4 shrink-0 text-success-600 dark:text-success-500" />
                    Suivi activé : {item.label} — {formatDate(item.dueAt)}
                  </li>
                ))}
              </ul>
            )}

            {canSchedule && mode === "dismissed" && (
              <p className="text-[13px] leading-5 text-text-secondary">
                Aucun suivi ne sera envoyé pour ce passage.{" "}
                <button type="button" className="underline underline-offset-2 hover:text-text-primary" onClick={() => setMode("proposed")}>
                  Revenir sur ce choix
                </button>
              </p>
            )}

            {canSchedule && mode === "proposed" && activated.length === 0 && (
              <>
                {suggestion.suggested ? (
                  <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3.5 dark:border-brand-900 dark:bg-brand-950/40">
                    <p className="flex items-start gap-2.5 text-[14px] leading-5 text-text-primary">
                      <CalendarClock className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" />
                      <span>
                        <span className="font-semibold">Suivi proposé : {suggestion.label}</span>
                        <span className="text-text-secondary"> — le {formatDate(suggestion.dueAt)}</span>
                        <span className="mt-0.5 block text-[12.5px] leading-4 text-text-secondary">{suggestion.reason}</span>
                      </span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" loading={pending} onClick={activateSuggestion} leadingIcon={<Check className="size-4" />}>
                        Activer
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setMode("editing")} leadingIcon={<Pencil className="size-4" />}>
                        Modifier
                      </Button>
                      <Button size="sm" variant="ghost" className="ml-auto text-text-secondary" onClick={() => setMode("dismissed")} leadingIcon={<X className="size-4" />}>
                        Ne pas suivre
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[13px] leading-5 text-text-secondary">{suggestion.reason}</p>
                    <button type="button" onClick={() => setMode("editing")} className="text-left text-[12.5px] text-text-tertiary underline underline-offset-2 hover:text-text-secondary">
                      Programmer un suivi malgré tout
                    </button>
                  </div>
                )}
              </>
            )}

            {canSchedule && mode === "activated" && (
              <button type="button" onClick={() => setMode("editing")} className="text-left text-[12.5px] text-text-tertiary underline underline-offset-2 hover:text-text-secondary">
                Ajouter un autre suivi
              </button>
            )}

            {canSchedule && mode === "editing" && (
              <div className="space-y-3">
                <div className="grid gap-2">
                  {options.map((option) => (
                    <button
                      key={option.templateKey}
                      type="button"
                      onClick={() => {
                        setSelected(option.templateKey);
                        setDelayDays(String(daysUntil(option.dueAt)));
                      }}
                      aria-pressed={selected === option.templateKey}
                      className={cn(
                        "rounded-lg border px-3.5 py-3 text-left transition-colors",
                        selected === option.templateKey ? "border-brand-600 bg-brand-50 dark:bg-brand-950" : "border-border-default hover:bg-surface-sunken",
                      )}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-[13.5px] font-medium text-text-primary">{option.label}</span>
                        <span className="flex items-center gap-1 text-[12px] text-text-tertiary">
                          <CalendarClock className="size-3.5" />
                          {formatDate(option.dueAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-4 text-text-secondary">{option.purpose}</span>
                    </button>
                  ))}
                </div>
                <Field label="Dans combien de jours" htmlFor="follow-up-delay" hint="Le message partira le matin de ce jour, après validation dans « Suivis ».">
                  <Input id="follow-up-delay" type="number" min={0} max={365} value={delayDays} onChange={(event) => setDelayDays(event.target.value)} className="max-w-[140px]" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={confirmEdit} loading={pending} disabled={!selected || delayDays === ""} leadingIcon={<Check className="size-4" />}>
                    Activer ce suivi
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMode(activated.length > 0 ? "activated" : "proposed")}>
                    Annuler
                  </Button>
                </div>
              </div>
            )}

            {canSchedule && canUpdateConsent && (
              <Checkbox
                label="Le patient accepte de recevoir un suivi de sa pharmacie"
                description="À cocher devant lui. Distinct de toute communication commerciale, et révocable à tout moment depuis chaque message."
                checked={consent}
                onChange={(event) => grantConsent(event.target.checked)}
              />
            )}

            {canSchedule && !consent && mode !== "dismissed" && (
              <p className="text-[12px] leading-4 text-text-tertiary">
                Sans consentement, le suivi peut être activé mais ne pourra pas être envoyé : il restera dans « Suivis » avec le motif affiché.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000));
}
