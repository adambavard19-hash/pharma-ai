import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { getPharmacyThread } from "@/server/services/support";
import { SUPPORT_STATE_FOR_PHARMACY, SUPPORT_TOPIC_LABELS, supportThreadState, type SupportTopicCode } from "@/core/support/rules";
import { PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { SupportConversation } from "./conversation";

export const metadata: Metadata = { title: "Contact support" };

/** Une discussion avec l'équipe PharmaBoost. Elle n'existe que pour l'officine qui l'a ouverte : une autre adresse donne une page introuvable. */
export default async function SupportThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const thread = await getPharmacyThread(session.pharmacy.id, id);
  if (!thread) notFound();

  const state = SUPPORT_STATE_FOR_PHARMACY[supportThreadState(thread)];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AutoRefresh intervalMs={8_000} />
      <PageHeader
        breadcrumb={
          <Link href="/support" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Contact support
          </Link>
        }
        title={thread.subject}
        description={`${SUPPORT_TOPIC_LABELS[thread.topic as SupportTopicCode]} · ouverte le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(thread.createdAt)}`}
        actions={<Badge tone={state.tone}>{state.label}</Badge>}
      />
      <SupportConversation
        threadId={thread.id}
        messages={thread.messages.map((message) => ({ id: message.id, author: message.author, authorName: message.authorName, body: message.body, createdAt: message.createdAt.toISOString() }))}
        closed={thread.status === "CLOSED"}
        unread={thread.unreadForPharmacy}
        disabledReason={session.scope.isDemo ? "Mode démonstration : le support n'est pas joignable depuis la démo." : null}
      />
    </div>
  );
}
