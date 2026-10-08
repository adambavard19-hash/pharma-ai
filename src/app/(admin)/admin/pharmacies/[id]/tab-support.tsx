import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { listSupportThreadsForPharmacy } from "@/server/services/support";
import { AdminSection } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { SUPPORT_STATE_FOR_ADMIN, SUPPORT_TOPIC_LABELS, excerpt, supportThreadState, type SupportTopicCode } from "@/core/support/rules";
import { cn } from "@/lib/utils";
import { When } from "../client-ui";
import { EmptyLine } from "./shared";

/** Les discussions de support de CETTE officine : l'équipe répond sans quitter sa fiche. La boîte de toutes les officines reste dans « Support ». */
export async function SupportSection({ pharmacyId }: { pharmacyId: string }) {
  const { rows, total } = await listSupportThreadsForPharmacy(pharmacyId);
  return (
    <AdminSection
      id="support"
      title="Support"
      description="Les questions posées par cette officine depuis « Contact support »."
      action={
        <Link href="/admin/support" className="text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">
          Toutes les discussions
        </Link>
      }
    >
      {rows.length === 0 ? (
        <div className="flex items-start gap-2">
          <LifeBuoy className="mt-0.5 size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          <EmptyLine>Cette officine n&apos;a encore écrit au support.</EmptyLine>
        </div>
      ) : (
        <ul className="-my-3 divide-y divide-border-subtle">
          {rows.map((thread) => {
            const state = SUPPORT_STATE_FOR_ADMIN[supportThreadState({ status: thread.status, lastMessageFrom: thread.lastMessageFrom })];
            const last = thread.messages[0];
            return (
              <li key={thread.id} className="py-3">
                <Link href={`/admin/support/${thread.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0 flex-1 basis-64">
                    <span className="flex items-center gap-2 text-[13.5px] text-text-primary">
                      {thread.unreadForSupport && <span className="size-2 shrink-0 rounded-full bg-brand-600" aria-label="Pas encore lue" />}
                      <span className={cn("truncate", thread.unreadForSupport ? "font-bold" : "font-medium")}>{thread.subject}</span>
                    </span>
                    <span className="block truncate text-[12px] text-text-secondary">
                      {SUPPORT_TOPIC_LABELS[thread.topic as SupportTopicCode]} · {last ? `${last.authorName} : ${excerpt(last.body, 90)}` : "—"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <Badge tone={state.tone}>{state.label}</Badge>
                    <When date={thread.lastMessageAt} className="text-[12.5px] text-text-tertiary" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {total > rows.length && <p className="mt-3 text-[12.5px] text-text-tertiary">{total - rows.length} discussion{total - rows.length > 1 ? "s" : ""} plus ancienne{total - rows.length > 1 ? "s" : ""} dans « Support ».</p>}
    </AdminSection>
  );
}
