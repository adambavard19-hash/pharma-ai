"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarClock, ChevronDown, Clock, Send, User, X } from "lucide-react";
import {
  cancelReminderAction,
  sendReminderAction,
  snoozeReminderAction,
} from "@/server/actions/reminders";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type WorklistItem = {
  id: string;
  patientId: string;
  patientName: string;
  templateLabel: string;
  purpose: string;
  dueAt: string;
  note: string | null;
  preview: { subject: string; body: string } | null;
  eligibility:
    | { allowed: true }
    | { allowed: false; code: string; reason: string };
};

/**
 * La liste de travail du jour.
 *
 * Chaque ligne porte déjà son verdict : le pharmacien voit pourquoi une ligne
 * n'est pas envoyable avant de cliquer, plutôt que de découvrir un refus après.
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
  const startOfToday = new Date(startOfTomorrow);
  startOfToday.setDate(startOfToday.getDate() - 1);

  const groups = [
    {
      key: "late",
      title: "En retard",
      items: reminders.filter((r) => new Date(r.dueAt) < startOfToday),
    },
    {
      key: "today",
      title: "Aujourd'hui",
      items: reminders.filter(
        (r) => new Date(r.dueAt) >= startOfToday && new Date(r.dueAt) < startOfTomorrow,
      ),
    },
    {
      key: "soon",
      title: "À venir",
      items: reminders.filter((r) => new Date(r.dueAt) >= startOfTomorrow),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2.5">
          <h2 className="flex items-baseline gap-2 text-[15px] font-semibold text-text-primary">
            {group.title}
            <span className="text-[12.5px] font-normal text-text-tertiary">
              {group.items.length}
            </span>
          </h2>
          {group.items.map((item) => (
            <ReminderRow
              key={item.id}
              item={item}
              canSend={canSend}
              canSchedule={canSchedule}
              late={group.key === "late"}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function ReminderRow({
  item,
  canSend,
  canSchedule,
  late,
}: {
  item: WorklistItem;
  canSend: boolean;
  canSchedule: boolean;
  late: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const run = (
    action: () => Promise<{ ok: boolean; error?: string; message?: string }>,
  ) => {
    startTransition(async () => {
      const result = await action();
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (result.message ?? "Enregistré") : (result.error ?? "Erreur"),
      });
    });
  };

  return (
    <Card className={cn(late && "border-warning-400/60")}>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 space-y-0.5">
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14.5px] font-medium text-text-primary">
              {item.patientName}
              <Badge tone="neutral">{item.templateLabel}</Badge>
            </p>
            <p className="flex items-center gap-1.5 text-[12.5px] text-text-tertiary">
              <CalendarClock className="size-3.5" />
              {late ? "Attendu le" : "Prévu le"} {formatDate(item.dueAt)}
              <Link
                href={`/patients/${item.patientId}`}
                className="ml-1.5 flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-400"
              >
                <User className="size-3.5" />
                Fiche
              </Link>
            </p>
          </div>
        </div>

        {item.purpose && (
          <p className="text-[12.5px] leading-5 text-text-secondary">{item.purpose}</p>
        )}

        {item.note && (
          <p className="text-[12px] text-text-tertiary">Note : « {item.note} »</p>
        )}

        {!item.eligibility.allowed && (
          <p className="rounded-lg bg-warning-50 px-3 py-2 text-[12.5px] leading-5 text-warning-700 dark:bg-warning-700/10 dark:text-warning-500">
            {item.eligibility.reason}
          </p>
        )}

        {item.preview && (
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
                <p className="text-[12.5px] font-medium text-text-primary">
                  {item.preview.subject}
                </p>
                <p className="text-[12.5px] leading-5 whitespace-pre-line text-text-secondary">
                  {item.preview.body}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
          {canSend && (
            <Button
              size="sm"
              loading={pending}
              disabled={!item.eligibility.allowed}
              onClick={() => run(() => sendReminderAction(item.id))}
              leadingIcon={<Send className="size-4" />}
            >
              Envoyer
            </Button>
          )}
          {canSchedule && (
            <>
              <Button
                size="sm"
                variant="outline"
                loading={pending}
                onClick={() => run(() => snoozeReminderAction(item.id, 7))}
                leadingIcon={<Clock className="size-4" />}
              >
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
                Annuler
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
