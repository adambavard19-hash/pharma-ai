import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageCircleHeart, Smartphone, Star } from "lucide-react";
import { PATIENT_APP_LIVE } from "@/core/patient-app/offers";
import { tagLabel } from "@/core/patient-app/reviews";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getPharmacyReviews } from "@/server/services/patient-reviews";
import { PageHeader } from "@/components/ui/page";
import { SectionTabs } from "@/components/app/section-tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata: Metadata = { title: "Avis patients" };

const day = (date: Date) => date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
const avg = (n: number | null) => (n === null ? "—" : `${String(n).replace(".", ",")} / 5`);

/**
 * Les avis laissés par les patients dans l'appli PharmaBoost (18 nov. 2026). Le collaborateur lit les avis qui le citent ; le
 * titulaire (ANALYTICS_VIEW_TEAM_PERFORMANCE) lit toute l'officine, avec le détail par collaborateur. Aucune donnée de santé.
 */
export default async function PatientReviewsPage() {
  if (!PATIENT_APP_LIVE) notFound();
  const session = await requirePermission(PERMISSIONS.PATIENT_EMAILS_VIEW);
  const teamView = session.permissions.has(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
  const data = await getPharmacyReviews(session.scope, teamView);
  return (
    <div className="space-y-6">
      <SectionTabs section="patients" active="/avis-patients" permissions={session.permissions} />
      <PageHeader
        title="Avis patients"
        description={teamView ? "Ce que vos patients disent de leur passage, dans l'appli PharmaBoost : toute l'équipe, collaborateur par collaborateur." : "Les avis de vos patients qui vous citent, laissés dans l'appli PharmaBoost."}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Note moyenne" value={avg(data.average)} icon={<Star className="size-4" />} sublabel={`${data.total} avis au total`} />
        <StatCard label="Avis ces 30 derniers jours" value={data.last30} icon={<MessageCircleHeart className="size-4" />} sublabel={teamView ? "pour toute l'officine" : "qui vous citent"} />
        <StatCard label="Le mot le plus cité" value={data.tagCounts[0] ? tagLabel(data.tagCounts[0].key) ?? "—" : "—"} icon={<Smartphone className="size-4" />} sublabel={data.tagCounts[0] ? `${data.tagCounts[0].count} fois` : "aucun pour l'instant"} />
      </div>

      {teamView && data.byStaff.length > 0 && (
        <Card>
          <CardHeader title="Par collaborateur" />
          <CardContent>
            <TableWrapper>
              <Table>
                <THead><TR><TH>Collaborateur</TH><TH className="text-right">Avis</TH><TH className="text-right">Note moyenne</TH></TR></THead>
                <TBody>
                  {data.byStaff.map((row) => (
                    <TR key={row.staffUserId ?? "equipe"}>
                      <TD className="font-semibold">{row.staffUserId ? row.firstName : "L'équipe (sans prénom)"}</TD>
                      <TD className="text-right tabular-nums">{row.count}</TD>
                      <TD className="text-right font-semibold tabular-nums">{avg(row.average)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader title="Les derniers avis" />
        <CardContent>
          {data.rows.length === 0 ? (
            <EmptyState title="Aucun avis pour l'instant" description="Vos patients donnent leur avis dans l'appli PharmaBoost, onglet « Donner mon avis », après avoir choisi votre pharmacie." />
          ) : (
            <TableWrapper>
              <Table>
                <THead><TR><TH>Date</TH><TH>Note</TH>{teamView && <TH>Collaborateur</TH>}<TH>En quelques mots</TH></TR></THead>
                <TBody>
                  {data.rows.map((row) => (
                    <TR key={row.id}>
                      <TD className="whitespace-nowrap">{day(row.createdAt)}</TD>
                      <TD className="whitespace-nowrap text-[#F5A524]" aria-label={`${row.rating} sur 5`}>{stars(row.rating)}</TD>
                      {teamView && <TD>{row.staffFirstName ?? <span className="text-text-secondary">L&apos;équipe</span>}</TD>}
                      <TD>
                        <div className="flex flex-wrap gap-1">
                          {row.tags.length === 0 ? <span className="text-text-secondary">—</span> : row.tags.map((tag) => <Badge key={tag} tone="neutral">{tagLabel(tag) ?? tag}</Badge>)}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
