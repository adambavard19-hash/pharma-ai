import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Flame, Info, Medal, PackageSearch, Target, TrendingUp, Euro } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadSoldCounter } from "@/server/services/sold-counter";
import { loadOverstockScreen } from "@/server/services/overstock";
import { listLots } from "@/server/services/stock-lots";
import { loadAssortment } from "@/server/services/assortment-gaps";
import { buildOwnerAlerts, type OwnerAlertTone } from "@/core/pilotage/owner-alerts";
import { euros, percent } from "@/core/counter/sales-report";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page";

export const metadata: Metadata = { title: "Vue d'ensemble" };

/**
 * La « Vue d'ensemble » du titulaire (fondateur, 5 nov. 2026) : toute la pharmacie en un écran, sans ouvrir cinq rubriques.
 * Ce qui demande son attention (alertes), le taux de conseil du jour et du mois, le classement de l'équipe, le surstock qui
 * avance, les dates courtes les plus proches et les produits manquants. Chaque bloc mène à sa rubrique. Lecture seule.
 * Un membre de l'équipe n'a pas cette page : il est renvoyé vers ses résultats.
 */
export default async function OwnerOverviewPage() {
  const session = await requireSession();
  if (!session.permissions.has(PERMISSIONS.MANAGEMENT_MENU)) redirect("/pilotage");
  const now = new Date();
  const { pharmacyId, userId } = session.scope;

  const [counter, overstock, shortDates, gaps] = await Promise.all([
    loadSoldCounter({ pharmacyId, now }),
    loadOverstockScreen(session.scope, now),
    listLots({ pharmacyId, userId }),
    loadAssortment({ pharmacyId, userId }, 30, now),
  ]);
  const [today, , month] = counter.periods;
  const team = [...counter.reports[2].byPerson].sort((a, b) => b.sold - a.sold || b.revenueCents - a.revenueCents);
  const active = overstock.campaigns.filter((campaign) => campaign.isActive);
  const lots = shortDates.lots.filter((lot) => lot.level !== "OK").sort((a, b) => a.daysLeft - b.daysLeft);

  const alerts = buildOwnerAlerts({
    lots: shortDates.lots.map((lot) => ({ label: lot.label, daysLeft: lot.daysLeft, quantity: lot.quantity })),
    campaigns: overstock.campaigns.map((campaign) => ({
      productName: campaign.product.name,
      isActive: campaign.isActive,
      endedReason: campaign.endedReason,
      endedAt: campaign.endedAt,
      endsOn: campaign.endsOn,
      quantity: campaign.product.quantity,
      targetQuantity: campaign.targetQuantity,
    })),
    gaps: gaps.groups.map((group) => ({ title: group.title, count: group.count })),
    now,
    today: shortDates.today,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Vue d'ensemble" description={`${session.user.firstName}, toute votre pharmacie en un écran : ce qui demande votre attention, puis les chiffres du jour et du mois.`} />

      {/* Les alertes */}
      <section aria-labelledby="alertes" className={glass}>
        <h2 id="alertes" className="flex items-center gap-2 text-[17px] font-semibold text-text-primary">
          À regarder aujourd&apos;hui
          {alerts.length > 0 && <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[12px] font-bold text-white tabular">{alerts.length}</span>}
        </h2>
        {alerts.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-[14px] text-text-secondary">
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" /> Rien d&apos;urgent : pas de date dépassée, pas de campagne à reprendre, pas de produit manquant demandé souvent.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {alerts.map((alert) => (
              <li key={alert.key} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-3", TONES[alert.tone].box)}>
                <span className={TONES[alert.tone].icon}>{TONES[alert.tone].glyph}</span>
                <span className="min-w-0 flex-1 text-[14px] text-text-primary">{alert.text}</span>
                <Link href={alert.href} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">
                  {alert.cta} <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Les chiffres */}
      <section aria-label="Les chiffres" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Target className="size-4" />} label="Taux de conseil aujourd'hui" value={today.share === null ? "—" : percent(today.share)} sub={today.share === null ? "Aucune vente terminée aujourd'hui" : `${today.withAdvice} client${today.withAdvice > 1 ? "s" : ""} sur ${today.sales}`} href="/pilotage" />
        <Kpi icon={<Target className="size-4" />} label="Taux de conseil ce mois-ci" value={month.share === null ? "—" : percent(month.share)} sub={month.share === null ? "Aucune vente terminée ce mois-ci" : `${month.withAdvice} client${month.withAdvice > 1 ? "s" : ""} sur ${month.sales} · ${month.sold} conseil${month.sold > 1 ? "s" : ""} vendu${month.sold > 1 ? "s" : ""}`} href="/pilotage" />
        <Kpi icon={<Euro className="size-4" />} label="Chiffre d'affaires ajouté ce mois-ci" value={month.revenue} sub="Grâce aux conseils vendus" href="/resultats" />
        <Kpi icon={<TrendingUp className="size-4" />} label="Marge générée ce mois-ci (HT)" value={month.margin ?? "—"} sub="Sur les prix d'achat connus" href="/resultats" />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Le classement */}
        <Block id="classement" title="Classement de l'équipe ce mois-ci" href="/pilotage" cta="Voir les performances">
          {team.length === 0 ? (
            <Empty>Aucune vente terminée ce mois-ci.</Empty>
          ) : (
            <ol className="space-y-2.5">
              {team.slice(0, 5).map((person, i) => (
                <li key={person.who} className="flex items-center gap-3">
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold", i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-ink-100 text-ink-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-surface-sunken text-text-tertiary")}>
                    {i < 3 ? <Medal className="size-3.5" aria-label={`${i + 1}e`} /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text-primary">{person.who}</span>
                  <span className="text-[12.5px] text-text-secondary tabular">{person.sales > 0 ? percent(person.withAdvice / person.sales) : "—"} de taux</span>
                  <span className="w-20 text-right text-[13.5px] font-semibold text-brand-700 tabular dark:text-brand-300">{person.sold} vendu{person.sold > 1 ? "s" : ""}</span>
                </li>
              ))}
            </ol>
          )}
        </Block>

        {/* Le surstock */}
        <Block id="surstock" title="Surstock en cours" icon={<Flame className="size-4 text-orange-500" />} href="/surstock" cta="Gérer le surstock">
          {active.length === 0 ? (
            <Empty>Aucune campagne en cours.</Empty>
          ) : (
            <ul className="space-y-3">
              {active.slice(0, 4).map((campaign) => {
                const span = Math.max(1, campaign.startQuantity - campaign.targetQuantity);
                const done = Math.min(1, Math.max(0, (campaign.startQuantity - campaign.product.quantity) / span));
                return (
                  <li key={campaign.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14px] font-medium text-text-primary">{campaign.product.name}</span>
                      <span className="shrink-0 text-[12.5px] text-text-secondary tabular">{campaign.product.quantity} en stock · objectif {campaign.targetQuantity}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken">
                      <span className="block h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500" style={{ width: `${Math.round(done * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Block>

        {/* Les dates courtes */}
        <Block id="dates" title="Dates courtes les plus proches" icon={<CalendarClock className="size-4 text-amber-600" />} href="/stock/dates-courtes" cta="Voir les dates courtes">
          {lots.length === 0 ? (
            <Empty>Aucune boîte proche de sa date.</Empty>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {lots.slice(0, 5).map((lot) => (
                <li key={lot.id} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-[14px] text-text-primary">{lot.label}</span>
                  <span className={cn("shrink-0 text-[12.5px] font-semibold tabular", lot.daysLeft < 0 ? "text-danger-700" : lot.level === "URGENT" ? "text-warning-700" : "text-text-secondary")}>
                    {lot.daysLeft < 0 ? "dépassée" : lot.daysLeft === 0 ? "aujourd'hui" : `${lot.daysLeft} j`} · {formatDate(lot.expiresOn)}
                    {lot.valueCents ? ` · ${euros(lot.valueCents)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Block>

        {/* Les produits manquants */}
        <Block id="manquants" title="Produits manquants ce mois-ci" icon={<PackageSearch className="size-4 text-brand-600" />} href="/assortiment" cta="Voir les produits manquants">
          {gaps.groups.length === 0 ? (
            <Empty>Rien ne manque : chaque besoin repéré au comptoir avait un produit en stock.</Empty>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {gaps.groups.slice(0, 5).map((group) => (
                <li key={group.key} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-[14px] text-text-primary">{group.title}</span>
                  <span className="shrink-0 text-[12.5px] text-text-secondary tabular">{group.count} fois</span>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>
    </div>
  );
}

const glass = "rounded-2xl border border-white/70 bg-white/60 p-5 shadow-[0_1px_2px_rgba(15,43,38,.06),0_12px_32px_-16px_rgba(15,43,38,.22)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5";

const TONES: Record<OwnerAlertTone, { box: string; icon: string; glyph: React.ReactNode }> = {
  danger: { box: "border-danger-200 bg-danger-50/80 dark:bg-danger-700/10", icon: "text-danger-700", glyph: <AlertTriangle className="size-4" aria-hidden="true" /> },
  warning: { box: "border-warning-300 bg-warning-50/80 dark:bg-warning-700/10", icon: "text-warning-700", glyph: <CalendarClock className="size-4" aria-hidden="true" /> },
  success: { box: "border-emerald-200 bg-emerald-50/80 dark:bg-emerald-700/10", icon: "text-emerald-700", glyph: <CheckCircle2 className="size-4" aria-hidden="true" /> },
  info: { box: "border-brand-200 bg-brand-50/70 dark:border-brand-800 dark:bg-brand-950/30", icon: "text-brand-700", glyph: <Info className="size-4" aria-hidden="true" /> },
};

function Kpi({ icon, label, value, sub, href }: { icon: React.ReactNode; label: string; value: string; sub: string; href: string }) {
  return (
    <Link href={href} className={cn(glass, "block p-4 transition-transform hover:-translate-y-0.5")}>
      <p className="flex items-center gap-1.5 text-[12.5px] text-text-secondary">
        <span className="text-brand-600">{icon}</span>
        {label}
      </p>
      <p className="mt-1 bg-gradient-to-br from-brand-700 to-[#0b5560] bg-clip-text text-[30px] leading-tight font-bold tracking-[-0.02em] text-transparent tabular dark:from-brand-300 dark:to-brand-500">{value}</p>
      <p className="mt-0.5 text-[12.5px] text-text-secondary">{sub}</p>
    </Link>
  );
}

function Block({ id, title, icon, href, cta, children }: { id: string; title: string; icon?: React.ReactNode; href: string; cta: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={glass}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={id} className="flex items-center gap-2 text-[16px] font-semibold text-text-primary">
          {icon}
          {title}
        </h2>
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">
          {cta} <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] text-text-secondary">{children}</p>;
}
