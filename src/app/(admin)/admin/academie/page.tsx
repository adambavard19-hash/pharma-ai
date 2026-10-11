import type { Metadata } from "next";
import Link from "next/link";
import { Film, FileText, GraduationCap, Plus, Route } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { countByStatus, listAcademyContents, listAcademyModules } from "@/server/services/mobile/academy-admin";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { LinkTabs } from "@/components/ui/tabs";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ACADEMY_TOPIC_LABELS, AUDIENCE_LABELS, type AcademyTopicCode, type AudienceCode } from "@/core/academy/topics";
import { REVIEW_STATUSES, REVIEW_STATUS_LABELS } from "@/core/academy/review";
import { formatSeconds } from "@/core/academy/content";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OnlineBadge, ReviewBadge } from "./_components/status";

export const metadata: Metadata = { title: "Académie" };

/**
 * L'Académie de PharmaBoost Mobile : les micro-vidéos, vidéos et fiches, leurs quiz, les parcours ; la relecture
 * (brouillon → en relecture → approuvé / refusé) et la mise en ligne. Les chiffres sont des agrégats.
 */
export default async function AcademyAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const tab = params.onglet === "parcours" ? "parcours" : "contenus";
  const status = typeof params.statut === "string" && (REVIEW_STATUSES as readonly string[]).includes(params.statut) ? params.statut : null;
  const now = new Date();
  const [contents, modules, counts] = await Promise.all([tab === "contenus" ? listAcademyContents({ status }) : Promise.resolve([]), listAcademyModules(), countByStatus()]);
  const totalContents = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Académie"
        description="Les formations de PharmaBoost Mobile : micro-vidéos, vidéos, fiches, quiz et parcours. Rien n'est visible dans l'application sans relecture approuvée et mise en ligne. Ce ne sont pas des actions de DPC."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/admin/academie/parcours/nouveau">
                <Route className="size-4" aria-hidden="true" />
                Nouveau parcours
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/academie/nouveau">
                <Plus className="size-4" aria-hidden="true" />
                Nouveau contenu
              </Link>
            </Button>
          </>
        }
      />
      <LinkTabs
        items={[
          { key: "contenus", label: "Contenus", count: totalContents },
          { key: "parcours", label: "Parcours", count: modules.length },
        ]}
      />

      {tab === "contenus" ? (
        <>
          <nav aria-label="Filtrer par état" className="flex flex-wrap gap-2">
            {[{ key: null, label: "Tous", count: totalContents }, ...REVIEW_STATUSES.map((key) => ({ key, label: REVIEW_STATUS_LABELS[key], count: counts[key] ?? 0 }))].map((item) => (
              <Link
                key={item.label}
                href={item.key ? `/admin/academie?statut=${item.key}` : "/admin/academie"}
                aria-current={status === item.key ? "true" : undefined}
                className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ring-1 ring-inset", status === item.key ? "bg-ink-900 text-white ring-ink-900" : "bg-surface-card text-text-secondary ring-border-default hover:text-text-primary")}
              >
                {item.label}
                <span className="tabular opacity-70">{item.count}</span>
              </Link>
            ))}
          </nav>
          {contents.length === 0 ? (
            <EmptyState icon={<GraduationCap className="size-6" aria-hidden="true" />} title={status ? "Aucun contenu dans cet état" : "Aucun contenu pour l'instant"} description="Créez une micro-vidéo, une vidéo ou une fiche ; elle passera par la relecture avant d'apparaître dans l'application." />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Contenu</TH>
                    <TH>État</TH>
                    <TH>Relecture</TH>
                    <TH numeric>Vues</TH>
                    <TH numeric>Terminés</TH>
                    <TH numeric>Réussite quiz</TH>
                  </TR>
                </THead>
                <TBody>
                  {contents.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <Link href={`/admin/academie/${row.id}`} className="group flex items-center gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-50 text-brand-700">
                            {row.posterUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- vignette servie par la route contrôlée
                              <img src={row.posterUrl} alt="" className="size-full object-cover" />
                            ) : row.kind === "SHEET" ? (
                              <FileText className="size-5" aria-hidden="true" />
                            ) : (
                              <Film className="size-5" aria-hidden="true" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block max-w-[360px] truncate font-medium text-text-primary group-hover:text-brand-700">{row.title}</span>
                            <span className="block text-[12px] text-text-tertiary">
                              {[row.academyTopic ? ACADEMY_TOPIC_LABELS[row.academyTopic as AcademyTopicCode] : null, formatSeconds(row.durationSeconds), row.authorName, row.partner ? `${row.isSponsored ? "Sponsorisé" : "Partenaire"} · ${row.partner.name}` : null, row.isFreeAccess ? "Gratuit" : "Équipes clientes", `${row._count.quizQuestions} question${row._count.quizQuestions > 1 ? "s" : ""}`]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                        </Link>
                      </TD>
                      <TD>
                        <span className="flex flex-wrap gap-1">
                          <ReviewBadge status={row.reviewStatus} />
                          <OnlineBadge item={row} now={now} />
                        </span>
                      </TD>
                      <TD className="text-[12.5px] text-text-secondary">
                        {row.reviewedBy ? (
                          <>
                            {row.reviewedBy}
                            {row.reviewerIsPharmacist && <Badge tone="brand" className="ml-1">Pharmacien</Badge>}
                            <br />
                            <span className="text-text-tertiary">{formatDate(row.reviewedAt)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD numeric>{row.stats.learners}</TD>
                      <TD numeric>{row.stats.completed}</TD>
                      <TD numeric>{row.stats.passRate === null ? "—" : `${row.stats.passRate} %`}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </>
      ) : modules.length === 0 ? (
        <EmptyState icon={<Route className="size-6" aria-hidden="true" />} title="Aucun parcours" description="Un parcours enchaîne des contenus dans l'ordre : « Bien démarrer à l'officine », « Dermocosmétique »…" />
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>Parcours</TH>
                <TH>Public</TH>
                <TH>État</TH>
                <TH numeric>Étapes</TH>
                <TH numeric>Terminés</TH>
              </TR>
            </THead>
            <TBody>
              {modules.map((module) => (
                <TR key={module.id}>
                  <TD>
                    <Link href={`/admin/academie/parcours/${module.id}`} className="font-medium text-text-primary hover:text-brand-700">
                      {module.title}
                    </Link>
                    <span className="block text-[12px] text-text-tertiary">
                      /m/formations/parcours/{module.slug}
                      {module.partner ? ` · ${module.isSponsored ? "Sponsorisé" : "Partenaire"} · ${module.partner.name}` : ""}
                      {module.isFreeAccess ? " · Gratuit" : ""}
                    </span>
                  </TD>
                  <TD>{AUDIENCE_LABELS[module.audience as AudienceCode]}</TD>
                  <TD>
                    <span className="flex flex-wrap gap-1">
                      <ReviewBadge status={module.reviewStatus} />
                      <OnlineBadge item={module} now={now} />
                    </span>
                  </TD>
                  <TD numeric>{module._count.items}</TD>
                  <TD numeric>{module.completions}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      )}
      <p className="text-[12.5px] text-text-tertiary">Vues : personnes ayant commencé le contenu. Réussite quiz : tentatives réussies sur l&apos;ensemble des tentatives. Agrégats seulement — aucun nom n&apos;est communiqué aux partenaires.</p>
    </div>
  );
}
