import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { getSupportThread } from "@/server/services/support";
import { SUPPORT_STATE_FOR_ADMIN, SUPPORT_TOPIC_LABELS, supportThreadState, type SupportTopicCode } from "@/core/support/rules";
import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatusCode } from "@/core/billing/subscription";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { SupportThreadPanel } from "./thread-panel";

export const metadata: Metadata = { title: "Discussion du support" };

/** Une discussion avec une officine : sa conversation, la réponse, et ce qu'il faut savoir de l'officine pour répondre sans chercher. */
export default async function SupportThreadPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformSession();
  const { id } = await params;
  const thread = await getSupportThread(id);
  if (!thread) notFound();

  const state = SUPPORT_STATE_FOR_ADMIN[supportThreadState({ status: thread.status, lastMessageFrom: thread.lastMessageFrom })];
  const owner = thread.pharmacy.memberships[0]?.user ?? null;
  const subscription = thread.pharmacy.organization.subscription;

  return (
    <>
      <AutoRefresh intervalMs={10_000} />
      <AdminPageHeader
        space={{ label: "Officines", href: "/admin/pharmacies" }}
        parent={{ label: "Support", href: "/admin/support" }}
        title={thread.subject}
        badge={<Badge tone={state.tone}>{state.label}</Badge>}
        description={`${thread.pharmacy.name}${thread.pharmacy.city ? ` · ${thread.pharmacy.city}` : ""} · ${SUPPORT_TOPIC_LABELS[thread.topic as SupportTopicCode]}`}
      />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
        <SupportThreadPanel
          threadId={thread.id}
          messages={thread.messages.map((message) => ({ id: message.id, author: message.author, authorName: message.authorName, body: message.body, createdAt: message.createdAt.toISOString() }))}
          closed={thread.status === "CLOSED"}
          unread={thread.unreadForSupport}
          pharmacyName={thread.pharmacy.name}
        />

        <AdminSection title="L'officine" action={<Button asChild size="sm" variant="outline"><Link href={`/admin/pharmacies/${thread.pharmacy.id}`}>Ouvrir la fiche</Link></Button>}>
          <FactList
            className="sm:grid-cols-1"
            items={[
              { label: "Officine", value: thread.pharmacy.name, hint: thread.pharmacy.city ?? undefined },
              { label: "Titulaire principal", value: owner ? `${owner.firstName} ${owner.lastName.toUpperCase()}` : "—", hint: owner ? [owner.email, owner.phone].filter(Boolean).join(" · ") : undefined },
              { label: "Abonnement", value: subscription ? (SUBSCRIPTION_STATUS_LABELS[subscription.status as SubscriptionStatusCode]?.label ?? subscription.status) : "Aucun" },
              { label: "Accès", value: thread.pharmacy.isActive ? "Actif" : <Badge tone="warning">Suspendu</Badge> },
            ]}
          />
          {thread.pharmacy.isDemo && <p className="mt-3 text-[12.5px] text-text-secondary">Officine de démonstration.</p>}
        </AdminSection>
      </div>
    </>
  );
}
