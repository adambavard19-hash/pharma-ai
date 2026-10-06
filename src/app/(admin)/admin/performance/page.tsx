import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Euro, LifeBuoy, LineChart, Sparkles } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { loadPortfolioForPlatform } from "@/server/services/performance";
import { HEALTH_LABELS } from "@/core/performance/portfolio";
import { searchParam } from "@/core/admin/clients";
import { LOCALE, TIME_ZONE } from "@/config/constants";
import { AdminPageHeader } from "@/components/admin/page-header";
import { FilterChips } from "@/components/admin/filters";
import { KpiTile } from "@/components/admin/kpis";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { formatCentsCompact, formatDateTime, formatNumber } from "@/lib/format";
import { countByHealth, ETAT_FILTERS, etatFromParam } from "./_components/etat";
import { PortfolioCards, PortfolioTable } from "./_components/portfolio-list";

export const metadata: Metadata = { title: "Performance des officines" };

const BASE_PATH = "/admin/performance";

/**
 * Ce que PharmaBoost rapporte, officine par officine, sur le mois en cours :
 * pour repérer celles qui en tirent beaucoup et celles qui ont besoin d'un
 * coup de main. Uniquement des ventes enregistrées dans PharmaBoost, au prix
 * saisi ; aucune donnée patient, aucune ventilation par collaborateur.
 * La période se règle par la fiche de l'officine (onglet Performance).
 */
export default async function PerformancePortfolioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const etat = etatFromParam(searchParam(params, "etat"));

  const { rows: all, totals, generatedAt } = await loadPortfolioForPlatform({ now: new Date() });
  // L'ordre est celui du calcul (à voir en premier d'abord) : le filtre le garde.
  const rows = etat ? all.filter((row) => row.health === etat.health) : all;
  const counts = countByHealth(all);
  const monthLabel = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, month: "long", year: "numeric" }).format(generatedAt);

  return (
    <>
      <AdminPageHeader
        space={{ label: "Clients", href: "/admin/pharmacies" }}
        title="Performance"
        description="La valeur générée par PharmaBoost, officine par officine : qui en tire beaucoup, qui a besoin d'accompagnement. Chiffres du mois en cours, à partir des ventes enregistrées dans PharmaBoost."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Officines mesurées"
          value={formatNumber(totals.withConfirmedSales)}
          hint={`sur ${formatNumber(totals.pharmacies)} officine${totals.pharmacies > 1 ? "s" : ""} cliente${totals.pharmacies > 1 ? "s" : ""}, avec au moins une vente confirmée en ${monthLabel}`}
          icon={<Building2 className="size-4" />}
        />
        <KpiTile label={`CA confirmé en ${monthLabel}`} value={formatCentsCompact(totals.confirmedTtcCents)} hint="TTC, ventes confirmées au prix saisi" icon={<Euro className="size-4" />} />
        <KpiTile
          label={HEALTH_LABELS.high_value}
          value={formatNumber(totals.highValue)}
          tone={totals.highValue > 0 ? "success" : "default"}
          hint="Les officines qui en tirent le plus"
          href={`${BASE_PATH}?etat=forte-valeur`}
          icon={<Sparkles className="size-4" />}
        />
        <KpiTile
          label={HEALTH_LABELS.needs_support}
          value={formatNumber(totals.needsSupport)}
          tone={totals.needsSupport > 0 ? "warning" : "default"}
          hint={totals.needsSupport > 0 ? "Un appel ou un coup de main peut aider" : "Aucune officine ne demande d'aide"}
          href={`${BASE_PATH}?etat=a-accompagner`}
          icon={<LifeBuoy className="size-4" />}
        />
      </div>

      {all.length > 0 && totals.withConfirmedSales === 0 && (
        <Alert tone="info" title={`Aucune vente confirmée en ${monthLabel} pour l'instant`}>
          PharmaBoost ne compte que les ventes enregistrées depuis un conseil. Tant qu&apos;aucune équipe n&apos;en a enregistré, aucune valeur n&apos;est affichée : rien n&apos;est estimé.
        </Alert>
      )}

      <FilterChips
        label="Filtrer les officines"
        basePath={BASE_PATH}
        param="etat"
        current={etat?.value ?? null}
        options={[
          { value: null, label: "Toutes", count: all.length },
          ...ETAT_FILTERS.map((filter) => ({ value: filter.value, label: HEALTH_LABELS[filter.health], count: counts[filter.health] })),
        ]}
      />

      {all.length === 0 ? (
        <Card>
          <EmptyState icon={<LineChart className="size-5" />} title="Aucune officine cliente pour l'instant" description="La valeur générée apparaît ici dès qu'une officine cliente utilise PharmaBoost." />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LineChart className="size-5" />}
            title="Aucune officine dans cette catégorie"
            description="Aucune officine ne correspond à ce filtre pour l'instant."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href={BASE_PATH}>Voir toutes les officines</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <PortfolioTable rows={rows} />
          <PortfolioCards rows={rows} />
        </>
      )}

      <p className="text-[12.5px] leading-5 text-text-tertiary">
        Du 1er du mois à maintenant ({monthLabel}), calculé le {formatDateTime(generatedAt)}. À voir en premier : les officines à accompagner, puis celles qui n&apos;ont rien mesuré. Le retour sur abonnement compare le chiffre d&apos;affaires HT confirmé au prix mensuel HT de l&apos;abonnement ;
        « Non mesurable » veut dire qu&apos;il manque des ventes ou des prix, jamais qu&apos;il est faible. « Conseils achetés » compte les conseils qui ont donné lieu à une vente ; le chiffre d&apos;affaires ne compte que les lignes de vente au prix saisi. PharmaBoost ne lit pas la caisse du logiciel de gestion. Les officines de démonstration ne sont pas comptées.
      </p>
    </>
  );
}
