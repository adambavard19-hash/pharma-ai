"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, MessageSquare } from "lucide-react";
import { addNoteAction, addTaskAction, setProspectStatusAction } from "@/server/actions/extranet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { MANUAL_STATUSES, PROSPECT_STATUS_LABELS, type ProspectStatusCode } from "@/core/sales/pipeline";
import { cn } from "@/lib/utils";

/**
 * Les gestes du commercial sur un dossier, pensés pour le pouce : changer
 * l'étape en une pression, noter en trois mots, relancer avec un préréglage,
 * le contrat se gère dans son propre panneau (moteur commun).
 */
export function SalesActionsPanel({ prospect }: { prospect: { id: string; status: string; blocked: boolean } }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [taskLabel, setTaskLabel] = useState("Relancer");
  const [taskDate, setTaskDate] = useState("");
  const router = useRouter();
  const { push } = useToast();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Erreur");
        return;
      }
      push({ tone: "success", title: result.message ?? "Enregistré" });
      router.refresh();
    });
  };

  const current = prospect.status as ProspectStatusCode;
  const pickDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); setTaskDate(d.toISOString().slice(0, 10)); };

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* Étape : les étapes manuelles en pastilles ; les autres se déduisent. */}
      <Card><CardContent className="py-4">
        <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">Étape</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {MANUAL_STATUSES.filter((s) => s !== "LOST").map((s) => (
            <button key={s} type="button" disabled={pending || prospect.blocked || s === current || !["PROSPECT", "CONTACTED", "INTERESTED", "PROPOSAL_SENT"].includes(current)} onClick={() => run(() => setProspectStatusAction({ prospectId: prospect.id, status: s }))}
              className={cn("min-h-[40px] rounded-full border px-3.5 text-[13px] font-medium transition-colors disabled:opacity-50", s === current ? "border-brand-600 bg-brand-600 text-white" : "border-border-default text-text-secondary hover:border-brand-400 hover:text-text-primary")}>
              {PROSPECT_STATUS_LABELS[s]}
            </button>
          ))}
          {current !== "LOST" && current !== "ACTIVATED" && (
            <button type="button" disabled={pending || prospect.blocked} onClick={() => { const reason = window.prompt("Motif (facultatif) :") ?? ""; run(() => setProspectStatusAction({ prospectId: prospect.id, status: "LOST", reason })); }} className="min-h-[40px] rounded-full border border-danger-300 px-3.5 text-[13px] font-medium text-danger-700 hover:bg-danger-50 disabled:opacity-50 dark:text-danger-400">Perdu</button>
          )}
        </div>
        {!["PROSPECT", "CONTACTED", "INTERESTED", "PROPOSAL_SENT", "LOST"].includes(current) && <p className="mt-2 text-[12.5px] text-text-tertiary">L&apos;étape suit désormais le contrat et l&apos;officine.</p>}
      </CardContent></Card>

      {/* Note et relance rapides */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardContent className="space-y-2.5 py-4">
          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase"><MessageSquare className="size-3.5" />Note rapide</p>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Appel : intéressé, rappeler jeudi…" />
          <Button size="sm" variant="outline" disabled={note.trim().length < 2} loading={pending} onClick={() => run(async () => { const r = await addNoteAction({ prospectId: prospect.id, note }); if (r.ok) setNote(""); return r; })}>Ajouter la note</Button>
        </CardContent></Card>
        <Card><CardContent className="space-y-2.5 py-4">
          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase"><CalendarClock className="size-3.5" />Relance</p>
          <div className="flex flex-wrap gap-1.5">
            {[["Relancer dans 2 jours", 2], ["Appeler dans 1 semaine", 7], ["Renvoyer le contrat", 3]].map(([label, days]) => (
              <button key={String(label)} type="button" onClick={() => { setTaskLabel(String(label).replace(/ dans .*/, "")); pickDays(Number(days)); }} className="rounded-full border border-border-default px-3 py-1.5 text-[12.5px] text-text-secondary hover:border-brand-400 hover:text-text-primary">{label}</button>
            ))}
          </div>
          <div className="flex gap-2"><Input value={taskLabel} onChange={(e) => setTaskLabel(e.target.value)} aria-label="Intitulé de la relance" /><Input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} className="max-w-[160px]" aria-label="Date" /></div>
          <Button size="sm" variant="outline" disabled={!taskDate} loading={pending} onClick={() => run(() => addTaskAction({ prospectId: prospect.id, label: taskLabel, dueAt: new Date(`${taskDate}T09:00:00`).toISOString() }))}>Programmer</Button>
        </CardContent></Card>
      </div>

    </div>
  );
}
