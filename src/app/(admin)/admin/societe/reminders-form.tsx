"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runRemindersNowAction, saveReminderPolicyAction } from "@/server/actions/platform-sales";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { ReminderPolicy } from "@/core/contracts/reminders";

/**
 * La cadence des relances d'un contrat non signé. Sobre par défaut ; elle
 * s'arrête d'elle-même dès que le titulaire a signé.
 */
export function RemindersForm({ initial }: { initial: ReminderPolicy }) {
  const [policy, setPolicy] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) return setError(r.error ?? "Erreur");
    push({ tone: "success", title: r.message ?? "Enregistré" });
    router.refresh();
  });
  const num = (key: "firstAfterDays" | "secondAfterDays" | "escalateAfterDays") => (e: React.ChangeEvent<HTMLInputElement>) => setPolicy({ ...policy, [key]: Number(e.target.value) });

  return (
    <Card>
      <CardHeader title="Relances des contrats non signés" description="Un premier rappel, éventuellement un second, puis un signalement à l'équipe et au commercial. Aucune relance après la signature." />
      <CardContent className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <label className="flex items-center gap-2 text-[14px] text-text-primary">
          <input type="checkbox" checked={policy.enabled} onChange={(e) => setPolicy({ ...policy, enabled: e.target.checked })} className="size-4 accent-brand-700" />
          Relances automatiques activées
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="1er rappel (jours après l'envoi)" htmlFor="r-first"><Input id="r-first" type="number" min={1} max={30} value={policy.firstAfterDays} onChange={num("firstAfterDays")} disabled={!policy.enabled} /></Field>
          <Field label="2e rappel (jours après le 1er)" htmlFor="r-second" hint="0 : pas de second rappel."><Input id="r-second" type="number" min={0} max={30} value={policy.secondAfterDays} onChange={num("secondAfterDays")} disabled={!policy.enabled} /></Field>
          <Field label="Signalement (jours après le dernier rappel)" htmlFor="r-esc" hint="0 : pas de signalement."><Input id="r-esc" type="number" min={0} max={30} value={policy.escalateAfterDays} onChange={num("escalateAfterDays")} disabled={!policy.enabled} /></Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button loading={pending} onClick={() => run(() => saveReminderPolicyAction(policy))}>Enregistrer</Button>
          <Button variant="outline" loading={pending} onClick={() => run(() => runRemindersNowAction())}>Lancer le passage maintenant</Button>
        </div>
        <p className="text-[12.5px] text-text-tertiary">Le passage s&apos;exécute chaque jour automatiquement ; « Lancer le passage maintenant » l&apos;exécute à la demande. Un contrat dont le délai de signature est dépassé passe « Expiré ».</p>
      </CardContent>
    </Card>
  );
}
