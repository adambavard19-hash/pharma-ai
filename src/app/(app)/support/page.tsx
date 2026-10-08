import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessagesSquare } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { listPharmacyThreads } from "@/server/services/support";
import { SUPPORT_STATE_FOR_PHARMACY, SUPPORT_TOPIC_LABELS, supportThreadState } from "@/core/support/rules";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NewSupportThread } from "./new-thread";

export const metadata: Metadata = { title: "Contact support" };

/**
 * Contact support : écrire à l'équipe PharmaBoost, et retrouver ses discussions. Toute l'équipe de l'officine voit les
 * discussions de l'officine ; la réponse arrive ici, dans la cloche, et par e-mail à celui qui a écrit.
 */
export default async function SupportPage() {
  const session = await requireSession();
  const threads = await listPharmacyThreads(session.pharmacy.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AutoRefresh intervalMs={15_000} />
      <PageHeader title="Contact support" description="Une question, un problème, une idée ? Écrivez à l'équipe PharmaBoost. Sa réponse s'affiche ici, et vous êtes prévenu dès qu'elle arrive." />

      <Card>
        <CardHeader title="Nouvelle question" description="Nous répondons en général dans la journée, les jours ouvrés." />
        <CardContent>
          <NewSupportThread disabledReason={session.scope.isDemo ? "Mode démonstration : le support n'est pas joignable depuis la démo." : null} />
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="mes-discussions">
        <h2 id="mes-discussions" className="text-[17px] leading-6 font-semibold tracking-[-0.02em] text-text-primary">
          Mes discussions
        </h2>
        {threads.length === 0 ? (
          <Card>
            <EmptyState icon={<MessagesSquare className="size-5" />} title="Aucune discussion pour l'instant" description="Vos questions et les réponses de l'équipe PharmaBoost apparaîtront ici." />
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border-subtle">
              {threads.map((thread) => {
                const state = SUPPORT_STATE_FOR_PHARMACY[supportThreadState(thread)];
                return (
                  <li key={thread.id}>
                    <Link href={`/support/${thread.id}`} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-sunken/60">
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={cn("truncate text-[14.5px] text-text-primary", thread.unread ? "font-bold" : "font-medium")}>{thread.subject}</span>
                          {thread.unread && <span className="size-2 shrink-0 rounded-full bg-brand-600" aria-label="Nouvelle réponse" />}
                        </span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-text-secondary">
                          {thread.previewAuthor ? `${thread.previewAuthor} : ` : ""}
                          {thread.preview}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-text-tertiary">
                          <Badge tone={state.tone}>{state.label}</Badge>
                          <span>{SUPPORT_TOPIC_LABELS[thread.topic]}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatRelative(thread.lastMessageAt)}</span>
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
