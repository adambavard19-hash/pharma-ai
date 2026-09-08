"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarClock, Check, ChevronDown, Clock, MessageCircleHeart, Send, X } from "lucide-react";
import {
  cancelReminderAction,
  markFollowUpHandledAction,
  sendReminderAction,
  snoozeReminderAction,
} from "@/server/actions/reminders";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export type WorklistItem = {
  id: string;
  patientId: string;
  patientName: string;
  templateLabel: string;
  purpose: string;
  dueAt: string;
  status: string;
  sentAt: string | null;
  note: string | null;
  preview: { subject: string; body: string } | null;
  eligibility: { allowed: true } | { allowed: false; code: string; reason: string };
  answer: { code: string; label: string; emoji: string; at: string } | null;
  handledAt: string | null;
};

type GroupKey = "advice" | "today" | "soon" | "done";

/**
 * La liste de travail des suivis.
 *
 * Quatre groupes, dans l'ordre où l'équipe doit les lire : les patients qui
 * demandent un conseil, ceux à contacter aujourd'hui (les retards compris),
 * ceux à venir, et ce qui est terminé. Chaque ligne porte déjà son verdict :
 * le pharmacien voit pourquoi une ligne n'est pas envoyable avant de cliquer.
 */
export function FollowUpWorklist({
  reminders,
  canSend,
  canSchedule,
}: {
  reminders: WorklistItem[];
  canSend: boolean;
  canSchedule: boolean;
}) {
  const startOfTomorrow = new Date();
  startOfTomorrow.setHours(0, 0, 0, 0);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const pending = (item: WorklistItem) => item.status === "SCHEDULED" || item.status === "SNOOZED";
  const needsAdvice = (item: WorklistItem) => item.answer?.code === "NEED_ADVICE" && !item.handledAt;

  const allGroups: { key: GroupKey; title: string; hint: string; items: WorklistItem[] }[] = [
    {
      key: "advice",
      title: "Besoin d'un conseil",
      hint: "Ces patients ont répondu qu'ils avaient encore besoin de vous. À rappeler.",
      items: reminders.filter(needsAdvice),
    },
    {
      key: "today",
      title: "À contacter aujourd'hui",
      hint: "Rien ne part sans votre clic.",
      items: reminders.filter((r) => pending(r) && new Date(r.dueAt) < startOfTomorrow),
    },
    {
      key: "soon",
      title: "À venir",
      hint: "",
      items: reminders.filter((r) => pending(r) && new Date(r.dueAt) >= startOfTomorrow),
    },
    {
      key: "done",
      title: "Terminés",
      hint: "Envoyés ou clos ces derniers jours, avec la réponse du patient quand elle est arrivée.",
      items: reminders.filter((r) => !pending(r) && !needsAdvice(r)),
    },
  ];
  const groups = allGroups.filter((group) => group.items.length > 0);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2.5">
          <div>
            <h2 className="flex items-baseline gap-2 text-[15px] font-semibold text-text-primary">
              {group.title}
              <span className="text-[12.5px] font-normal text-text-tertiary">{group.items.length}</span>
            </h2>
            {group.hint && <p className="text-[12.5px] text-text-tertiary">{group.hint}</p>}
          </div>
          {group.items.map((item) => (
            <ReminderRow key={item.id} item={item} group={group.key} canSend={canSend} canSchedule={canSchedule} />
          ))}
        </section>
      ))}
    </div>
  );
}

function dueLabel(item: WorklistItem): string {
  const due = new Date(item.dueAt);
  const today = new Date();
  const sameDay = due.toDateString() === today.toDateString();
  if (sameDay) return "suivi aujourd'hui";
  if (due < today) return `suivi attendu le ${formatDate(due)}`;
  return `suivi le ${formatDate(due)}`;
}

function ReminderRow({
  item,
  group,
  canSend,
  canSchedule,
}: {
  item: WorklistItem;
  group: GroupKey;
  canSend: boolean;
  canSchedule: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();
  const late = group === "today" && new Date(item.dueAt).toDateString() !== new Date().toDateString();

  const run = (action: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    startTransition(async () => {
      const result = await action();
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (result.message ?? "Enregistré") : (result.error ?? "Erreur"),
      });
    });
  };

  return (
    <Card className={cn(late && "border-warning-400/60", group === "advice" && "border-brand-500/50")}>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[14.5px] text-text-primary">
            <span className="font-semibold">{item.patientName}</span>
            <span aria-hidden="true" className="text-text-tertiary">·</span>
            <span className="text-text-secondary">
              {group === "done"
                ? item.sentAt
                  ? `envoyé ${formatRelative(item.sentAt)}`
                  : "clos"
                : group === "advice" && item.answer
                  ? `a répondu ${formatRelative(item.answer.at)}`
                  : dueLabel(item)}
            </span>
            <Badge tone="neutral">{item.templateLabel}</Badge>
            {item.answer && (
              <Badge tone={item.answer.code === "NEED_ADVICE" ? "warning" : item.answer.code === "BETTER" ? "success" : "neutral"}>
                {item.answer.emoji} {item.answer.label}
              </Badge>
            )}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href={`/patients/${item.patientId}`}>Voir</Link>
          </Button>
        </div>

        {group === "advice" && (
          <p className="flex items-start gap-2 rounded-lg bg-brand-50 px-3.5 py-2.5 text-[13px] leading-5 text-brand-800 dark:bg-brand-950 dark:text-brand-200">
            <MessageCircleHeart className="mt-0.5 size-4 shrink-0" />
            Le patient demande un conseil. Reprenez contact avec lui — la réponse ne déclenche ni diagnostic ni changement de traitement.
          </p>
        )}

        {group !== "done" && group !== "advice" && item.purpose && (
          <p className="text-[12.5px] leading-5 text-text-secondary">{item.purpose}</p>
        )}

        {item.note && <p className="text-[12px] text-text-tertiary">Note : « {item.note} »</p>}

        {group === "today" && !item.eligibility.allowed && (
          <p className="rounded-lg bg-warning-50 px-3 py-2 text-[12.5px] leading-5 text-warning-700 dark:bg-warning-700/10 dark:text-warning-500">
            {item.eligibility.reason}
          </p>
        )}

        {(group === "today" || group === "soon") && item.preview && (
          <div>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="flex items-center gap-1.5 text-[12.5px] text-text-tertiary transition-colors hover:text-text-secondary"
            >
              {open ? "Masquer" : "Lire"} le message qui sera envoyé
              <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
            </button>
            {open && (
              <div className="mt-2 space-y-2 rounded-lg border border-border-subtle bg-surface-sunken/60 px-3.5 py-3">
                <p className="text-[12.5px] font-medium text-text-primary">{item.preview.subject}</p>
                <p className="text-[12.5px] leading-5 whitespace-pre-line text-text-secondary">{item.preview.body}</p>
              </div>
            )}
          </div>
        )}

        {group === "advice" && canSend && (
          <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
            <Button size="sm" loading={pending} onClick={() => run(() => markFollowUpHandledAction(item.id))} leadingIcon={<Check className="size-4" />}>
              Contact repris
            </Button>
          </div>
        )}

        {(group === "today" || group === "soon") && (canSend || canSchedule) && (
          <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
            {canSend && group === "today" && (
              <Button
                size="sm"
                loading={pending}
                disabled={!item.eligibility.allowed}
                onClick={() => run(() => sendReminderAction(item.id))}
                leadingIcon={<Send className="size-4" />}
              >
                Envoyer maintenant
              </Button>
            )}
            {canSchedule && (
              <>
                <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => snoozeReminderAction(item.id, 7))} leadingIcon={<Clock className="size-4" />}>
                  Reporter d&apos;une semaine
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/15"
                  loading={pending}
                  onClick={() => run(() => cancelReminderAction(item.id))}
                  leadingIcon={<X className="size-4" />}
                >
                  Ne pas suivre
                </Button>
              </>
            )}
            <span className="flex items-center gap-1 text-[12px] text-text-tertiary">
              <CalendarClock className="size-3.5" />
              {formatDate(item.dueAt)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
