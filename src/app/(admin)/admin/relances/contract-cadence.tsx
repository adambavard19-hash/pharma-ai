"use client";

import { useState } from "react";
import { Play, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { runRemindersNowAction, saveReminderPolicyAction } from "@/server/actions/platform-sales";
import type { ReminderPolicy } from "@/core/contracts/reminders";

type DayKey = "firstAfterDays" | "secondAfterDays" | "escalateAfterDays";

const FIELDS: { key: DayKey; label: string; hint: string; min: number }[] = [
  { key: "firstAfterDays", label: "Première relance", hint: "jours après l'envoi du contrat", min: 1 },
  { key: "secondAfterDays", label: "Deuxième relance", hint: "jours après la première (0 : aucune)", min: 0 },
  { key: "escalateAfterDays", label: "Alerte interne", hint: "jours après la dernière relance (0 : aucune)", min: 0 },
];

/** La cadence en clair : « J+3, puis 4 jours plus tard, alerte 3 jours après ». */
function cadenceSummary(policy: ReminderPolicy): string[] {
  if (!policy.enabled) return ["Relances de contrat désactivées : aucun rappel ne part, aucune alerte n'est levée."];
  return [
    `Première relance au titulaire ${policy.firstAfterDays} jour${policy.firstAfterDays > 1 ? "s" : ""} après l'envoi (J+${policy.firstAfterDays}).`,
    policy.secondAfterDays ? `Deuxième relance ${policy.secondAfterDays} jour${policy.secondAfterDays > 1 ? "s" : ""} après la première.` : "Pas de deuxième relance.",
    policy.escalateAfterDays ? `Alerte à l'équipe et au commercial ${policy.escalateAfterDays} jour${policy.escalateAfterDays > 1 ? "s" : ""} après la dernière relance.` : "Pas d'alerte interne.",
    "Les relances s'arrêtent d'elles-mêmes dès que le titulaire a signé.",
  ];
}

/**
 * La cadence des relances de contrat, présentée avec les autres scénarios :
 * elle se règle uniquement ici.
 */
export function ContractCadenceForm({ initial, schedulerActive }: { initial: ReminderPolicy; schedulerActive: boolean }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [drafts, setDrafts] = useState<Record<DayKey, string>>({ firstAfterDays: String(initial.firstAfterDays), secondAfterDays: String(initial.secondAfterDays), escalateAfterDays: String(initial.escalateAfterDays) });
  const valueOf = (field: (typeof FIELDS)[number]) => {
    const n = Number.parseInt(drafts[field.key], 10);
    return Number.isFinite(n) && n >= field.min && n <= 30 ? n : null;
  };
  const values = Object.fromEntries(FIELDS.map((f) => [f.key, valueOf(f)])) as Record<DayKey, number | null>;
  const valid = FIELDS.every((f) => values[f.key] !== null);
  const policy: ReminderPolicy = { enabled, firstAfterDays: values.firstAfterDays ?? initial.firstAfterDays, secondAfterDays: values.secondAfterDays ?? initial.secondAfterDays, escalateAfterDays: values.escalateAfterDays ?? initial.escalateAfterDays };
  const dirty = valid && JSON.stringify(policy) !== JSON.stringify(initial);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-sunken/50 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-3">
          <span className="relative inline-flex shrink-0">
            <input type="checkbox" className="peer sr-only" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="h-6 w-11 rounded-full bg-ink-300 transition-colors peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/30 dark:bg-ink-700" />
            <span className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
          </span>
          <span className="text-[14px] font-medium text-text-primary">Relances de contrat activées</span>
        </label>
        <Badge tone={initial.enabled ? "success" : "neutral"}>{initial.enabled ? "En service" : "Désactivées"}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {FIELDS.map((field) => (
          <label key={field.key} className="block space-y-1.5">
            <span className="text-[13px] font-medium text-text-primary">{field.label}</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={field.min}
                max={30}
                value={drafts[field.key]}
                disabled={!enabled}
                aria-invalid={values[field.key] === null}
                onChange={(e) => setDrafts({ ...drafts, [field.key]: e.target.value })}
                className="h-9 w-20 rounded-lg border border-border-default bg-surface-card px-2.5 text-[13.5px] text-text-primary tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none disabled:bg-surface-sunken disabled:text-text-tertiary aria-[invalid=true]:border-danger-500"
              />
              <span className="text-[12px] leading-4 text-text-tertiary">{field.hint}</span>
            </span>
            {values[field.key] === null && <span className="block text-[12px] text-danger-600">Entre {field.min} et 30 jours.</span>}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <ConfirmAction
          label="Enregistrer la cadence"
          icon={<Save className="size-4" />}
          variant="primary"
          disabled={!dirty}
          title="Enregistrer la cadence des relances de contrat ?"
          description="Elle s'applique dès le prochain passage aux contrats envoyés et non signés."
          consequences={cadenceSummary(policy)}
          confirmLabel="Enregistrer"
          onConfirm={() => saveReminderPolicyAction(policy)}
        />
        <ConfirmAction
          label="Lancer le passage maintenant"
          icon={<Play className="size-4" />}
          variant="outline"
          title="Lancer le passage des relances de contrat ?"
          consequences={[
            "Chaque contrat envoyé et non signé est vérifié tout de suite, comme lors du passage quotidien.",
            "Les relances dues partent au signataire de l'officine ; les dossiers en retard sont signalés à l'équipe.",
            "Un contrat dont le délai de signature est dépassé passe « Expiré ».",
            "La cadence enregistrée s'applique (pas les modifications non enregistrées).",
          ]}
          confirmLabel="Lancer le passage"
          onConfirm={() => runRemindersNowAction()}
        />
      </div>
      <p className="text-[12.5px] leading-5 text-text-tertiary">
        {schedulerActive ? "Passage automatique chaque jour à 8 h (UTC). " : "Passage automatique inactif sur ce serveur (CRON_SECRET absent) : les relances de contrat ne partent que par « Lancer le passage maintenant ». "}
        Seuls les contrats du modèle de signature actuel sont relancés.
      </p>
    </div>
  );
}
