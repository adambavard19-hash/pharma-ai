import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, SearchX } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { INBOX_FILTERS, listSupportInbox, type InboxFilter } from "@/server/services/support";
import { parsePage, searchParam } from "@/core/admin/clients";
import { SUPPORT_STATE_FOR_ADMIN, SUPPORT_TOPIC_LABELS, excerpt, supportThreadState, type SupportTopicCode } from "@/core/support/rules";
import { AdminPageHeader } from "@/components/admin/page-header";
import { FilterChips, SearchBox } from "@/components/admin/filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Pagination, When } from "../pharmacies/client-ui";

export const metadata: Metadata = { title: "Support" };

const FILTER_LABELS: Record<InboxFilter, string> = { "a-repondre": "À répondre", "en-attente": "En attente de la pharmacie", fermees: "Fermées", toutes: "Toutes" };

/**
 * La boîte de réception du support : les questions des officines, la plus ancienne en tête quand on cherche ce qui reste à
 * répondre. Une pastille signale ce que l'équipe n'a pas encore lu ; chaque ligne mène à la discussion.
 */
export default async function SupportInboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const q = searchParam(params, "q");
  const requested = searchParam(params, "statut");
  const filter: InboxFilter = INBOX_FILTERS.includes(requested as InboxFilter) ? (requested as InboxFilter) : "a-repondre";
  const requestedPage = parsePage(searchParam(params, "page"));
  const keep = { q, statut: filter === "a-repondre" ? null : filter };

  let data = await listSupportInbox({ filter, q, page: requestedPage });
  if (data.rows.length === 0 && data.total > 0 && requestedPage > data.pages) data = await listSupportInbox({ filter, q, page: data.pages });
  const page = Math.min(requestedPage, data.pages);

  return (
    <>
      <AdminPageHeader space={{ label: "Officines", href: "/admin/pharmacies" }} title="Support" description="Les questions posées par les officines depuis « Contact support ». Une réponse les prévient par e-mail et dans PharmaBoost." />

      <section className="space-y-3">
        <SearchBox action="/admin/support" defaultValue={q} placeholder="Officine, ville ou sujet" keep={{ statut: keep.statut }} />
        <FilterChips
          label="Filtrer par état"
          basePath="/admin/support"
          param="statut"
          current={filter === "a-repondre" ? null : filter}
          keep={{ q }}
          options={INBOX_FILTERS.map((value) => ({ value: value === "a-repondre" ? null : value, label: FILTER_LABELS[value], count: data.counts[value] }))}
        />
      </section>

      {data.rows.length === 0 ? (
        <Card>
          {q ? (
            <EmptyState icon={<SearchX className="size-5" />} title="Aucune discussion ne correspond" description={`Rien pour « ${q} » dans cet onglet.`} action={<Button asChild size="sm" variant="outline"><Link href="/admin/support">Effacer la recherche</Link></Button>} />
          ) : filter === "a-repondre" ? (
            <EmptyState icon={<Inbox className="size-5" />} title="Rien à répondre" description="Toutes les questions des officines ont une réponse. Vous serez prévenu par e-mail et dans la cloche dès qu'une officine écrit." />
          ) : (
            <EmptyState icon={<Inbox className="size-5" />} title="Aucune discussion dans cet onglet" description="Les discussions apparaîtront ici dès qu'une officine écrira au support." />
          )}
        </Card>
      ) : (
        <>
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>Officine</TH>
                  <TH>Discussion</TH>
                  <TH>État</TH>
                  <TH>Dernier message</TH>
                </TR>
              </THead>
              <TBody>
                {data.rows.map((thread) => {
                  const state = SUPPORT_STATE_FOR_ADMIN[supportThreadState({ status: thread.status, lastMessageFrom: thread.lastMessageFrom })];
                  const last = thread.messages[0];
                  return (
                    <TR key={thread.id} interactive>
                      <TD>
                        <Link href={`/admin/pharmacies/${thread.pharmacy.id}`} className="block text-[13.5px] font-medium text-text-primary hover:underline">
                          {thread.pharmacy.name}
                        </Link>
                        <span className="block text-[12px] text-text-tertiary">
                          {thread.pharmacy.city ?? "—"}
                          {!thread.pharmacy.isActive ? " · suspendue" : ""}
                          {thread.pharmacy.isDemo ? " · démo" : ""}
                        </span>
                      </TD>
                      <TD className="max-w-[28rem]">
                        <Link href={`/admin/support/${thread.id}`} className="flex items-center gap-2 text-[13.5px] text-text-primary hover:underline">
                          {thread.unreadForSupport && <span className="size-2 shrink-0 rounded-full bg-brand-600" aria-label="Pas encore lue" />}
                          <span className={cn("truncate", thread.unreadForSupport ? "font-bold" : "font-medium")}>{thread.subject}</span>
                        </Link>
                        <span className="block truncate text-[12px] text-text-secondary">
                          {SUPPORT_TOPIC_LABELS[thread.topic as SupportTopicCode]} · {last ? `${last.authorName} : ${excerpt(last.body, 90)}` : "—"}
                        </span>
                      </TD>
                      <TD>
                        <Badge tone={state.tone}>{state.label}</Badge>
                        <span className="mt-1 block text-[11.5px] text-text-tertiary tabular">{thread._count.messages} message{thread._count.messages > 1 ? "s" : ""}</span>
                      </TD>
                      <TD>
                        <When date={thread.lastMessageAt} className="text-[13px]" />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
          <Pagination basePath="/admin/support" keep={keep} page={page} pages={data.pages} total={data.total} unit={["discussion", "discussions"]} />
        </>
      )}
    </>
  );
}
