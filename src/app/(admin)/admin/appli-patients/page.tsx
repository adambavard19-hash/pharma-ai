import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MailX, MessageSquareHeart, RotateCcw, Smartphone, Store, UserPlus } from "lucide-react";
import { PATIENT_APP_LIVE } from "@/core/patient-app/offers";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { getAppMembersStats } from "@/server/services/app-member-emails";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata: Metadata = { title: "Appli patients" };
export const dynamic = "force-dynamic";

const when = (date: Date) => date.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const shortDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)} %` : "—");

/**
 * Le suivi des inscrits de l'appli des patients (fondateur, 20 nov. 2026). Les téléchargements, eux, ne se voient que dans
 * App Store Connect : ici, ceux qui ont créé leur espace. Adresses masquées, aucune donnée de santé.
 */
export default async function AppMembersPage() {
  if (!PATIENT_APP_LIVE) notFound();
  await requirePlatformSession();
  const stats = await getAppMembersStats();
  const max = Math.max(1, ...stats.perDay.map((d) => d.count));
  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Gestion" }}
        title="Appli patients"
        description="Les personnes qui ont créé leur espace dans l'appli. Les téléchargements se lisent dans App Store Connect › Analytics."
      />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Inscrits" value={stats.total} icon={<Smartphone className="size-4" />} />
        <StatCard label="Ces 7 derniers jours" value={stats.last7} icon={<UserPlus className="size-4" />} sublabel={`${stats.last30} sur 30 jours`} />
        <StatCard label="Ont choisi une pharmacie" value={stats.withPharmacy} icon={<Store className="size-4" />} sublabel={pct(stats.withPharmacy, stats.total)} />
        <StatCard label="Ont donné un avis" value={stats.withReview} icon={<MessageSquareHeart className="size-4" />} sublabel={pct(stats.withReview, stats.total)} />
        <StatCard label="Sont revenus" value={stats.returned} icon={<RotateCcw className="size-4" />} sublabel="un autre jour que l'inscription" />
        <StatCard label="Relances coupées" value={stats.nurtureOff} icon={<MailX className="size-4" />} sublabel="« Ne plus recevoir »" />
      </div>
      <Card>
        <CardHeader title="Nouveaux inscrits par jour" description="Les 30 derniers jours." />
        <CardContent>
          <div className="flex h-40 items-end gap-1" role="img" aria-label="Nouveaux inscrits par jour sur 30 jours">
            {stats.perDay.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${shortDay(d.day)} : ${d.count}`}>
                {d.count > 0 && <span className="mb-1 text-center text-[10px] font-semibold text-muted-foreground">{d.count}</span>}
                <div className="rounded-t bg-primary/80" style={{ height: `${d.count === 0 ? 2 : Math.max(6, (d.count / max) * 100)}%`, opacity: d.count === 0 ? 0.25 : 1 }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>{shortDay(stats.perDay[0].day)}</span>
            <span>aujourd&apos;hui</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Derniers inscrits" description="Chacun reçoit un mail de bienvenue, puis des conseils de temps en temps (scanner, prise de sang, sa pharmacie, son armoire)." />
        <CardContent>
          {stats.latest.length === 0 ? (
            <EmptyState title="Aucun inscrit pour l'instant" description="Ils apparaîtront ici dès qu'une personne crée son espace dans l'appli." />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR><TH>Adresse</TH><TH>Inscrit le</TH><TH>Pharmacie choisie</TH><TH>Revenu</TH></TR>
                </THead>
                <TBody>
                  {stats.latest.map((row) => (
                    <TR key={row.id}>
                      <TD className="font-medium">{row.emailMasked}</TD>
                      <TD>{when(row.createdAt)}</TD>
                      <TD>{row.pharmacy ?? <span className="text-muted-foreground">—</span>}</TD>
                      <TD>{row.returned ? "Oui" : <span className="text-muted-foreground">Pas encore</span>}</TD>
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
