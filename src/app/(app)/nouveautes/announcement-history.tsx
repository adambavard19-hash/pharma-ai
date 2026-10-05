"use client";

import { useState, useTransition } from "react";
import { Megaphone, RotateCw } from "lucide-react";
import { resumeAnnouncementAction } from "@/server/actions/patient-news";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { SectionHeader } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { announcementTally, statusBadge } from "./news-rules";

export type HistoryEntry = {
  id: string;
  title: string;
  rangeLabel: string | null;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  simulated: boolean;
  createdAt: string;
};

/**
 * Les annonces déjà lancées, la plus récente d'abord. Les compteurs sont ceux
 * des envois réellement tentés ; une annonce simulée le dit, et n'est jamais
 * présentée comme envoyée. Une annonce « en cours » (le temps d'un appel a été
 * épuisé avant la fin de la liste) se reprend d'ici, sans doublon pour les
 * abonnés déjà servis.
 */
export function AnnouncementHistory({ announcements }: { announcements: HistoryEntry[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { push } = useToast();

  const resume = (id: string) => {
    setBusy(id);
    start(async () => {
      const result = await resumeAnnouncementAction(id);
      setBusy(null);
      if (!result.ok) return push({ tone: "error", title: result.error });
      push({ tone: result.data.complete ? "success" : "warning", title: result.message ?? "Envoi repris" });
    });
  };

  return (
    <section className="space-y-3" aria-label="Historique des annonces">
      <SectionHeader title="Historique des annonces" description="La plus récente d'abord." />
      <Card>
        {announcements.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="size-5" />}
            title="Aucune annonce pour l'instant"
            description="Quand vous en enverrez une, elle apparaîtra ici avec son état et le nombre de messages remis."
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {announcements.map((announcement) => {
              const badge = statusBadge(announcement.status, announcement.simulated);
              const sending = announcement.status === "SENDING";
              return (
                <li key={announcement.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 py-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-medium text-text-primary">
                      <span className="min-w-0 break-words">{announcement.title}</span>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      {badge.simulated && <Badge tone="warning">Simulée</Badge>}
                    </p>
                    <p className="text-[12.5px] text-text-secondary">
                      {announcement.rangeLabel ? `Gamme : ${announcement.rangeLabel} · ` : ""}
                      {formatDateTime(announcement.createdAt)}
                    </p>
                    <p className="text-[12.5px] text-text-tertiary tabular">
                      {announcementTally(announcement)}
                      {announcement.simulated && " · aucun message n'est parti"}
                    </p>
                    {sending && <p className="text-[12.5px] text-text-secondary">Une partie des abonnés reste à servir. Reprenez l&apos;envoi d&apos;ici : ceux qui ont déjà reçu l&apos;annonce ne la reçoivent pas une seconde fois.</p>}
                  </div>
                  {sending && (
                    <Button size="sm" variant="outline" loading={busy === announcement.id} disabled={pending} onClick={() => resume(announcement.id)} leadingIcon={<RotateCw className="size-3.5" />}>
                      Reprendre l&apos;envoi
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
