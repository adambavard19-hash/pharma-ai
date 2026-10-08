import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { consoleStockOverview, countDepositsNeedingAttention, listDepositsForConsole } from "@/server/services/stock-deposits";
import { DEPOSIT_SOURCE_LABELS, stockReminderLevel } from "@/core/stock-deposit/rules";
import { searchParam } from "@/core/admin/clients";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { FilterChips } from "@/components/admin/filters";
import { KpiTile } from "@/components/admin/kpis";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { formatDate, formatNumber } from "@/lib/format";
import { When } from "../pharmacies/client-ui";
import { DepositFileRow } from "./_components/deposit-file-row";
import { DepositForPharmacy } from "./_components/deposit-for-pharmacy";
import { FreshnessBadge, viewFromParam } from "./_components/status";

export const metadata: Metadata = { title: "Stocks reçus" };
// Le dépôt par l'équipe lit le fichier pendant l'envoi : une grosse édition d'inventaire peut prendre un moment.
export const maxDuration = 300;

const BASE_PATH = "/admin/depots-stock";
/** Combien de fichiers la liste montre : assez pour une semaine d'usage, sans pagination. */
const FILES_LIMIT = 100;

/**
 * « Stocks reçus » : ce que chaque officine a envoyé de son stock, et chaque
 * fichier reçu. Le stock se met à jour tout seul à la réception ; l'équipe
 * n'a un geste à faire que pour un fichier trop petit (il attend sa décision)
 * ou illisible (à relancer), ou pour déposer un fichier à la place d'un
 * titulaire. Trois blocs : les chiffres, une ligne par officine, les fichiers.
 */
export default async function StockDepositsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const now = new Date();

  const [overview, attentionCount, recent] = await Promise.all([consoleStockOverview(), countDepositsNeedingAttention(), listDepositsForConsole({ limit: FILES_LIMIT })]);
  const view = viewFromParam(searchParam(params, "etat"), attentionCount);
  // « À trancher » ne doit jamais se perdre derrière les 100 derniers fichiers : on lit ceux-là à part.
  const files = view === "attention" ? await listDepositsForConsole({ status: "ATTENTION", limit: FILES_LIMIT }) : recent;

  // Les chiffres du bandeau.
  const today = formatDate(now);
  const receivedToday = recent.filter((deposit) => formatDate(deposit.receivedAt) === today).length;
  const receivedTodayLabel = receivedToday >= FILES_LIMIT ? `${FILES_LIMIT}+` : formatNumber(receivedToday);
  const withoutStock = overview.filter((row) => stockReminderLevel(row.stockSyncedAt, now) === "strong");
  const neverReceived = overview.filter((row) => !row.stockSyncedAt).length;

  return (
    <>
      <AdminPageHeader
        space={{ label: "Officines", href: "/admin/pharmacies" }}
        title="Stocks reçus"
        description="Le dernier stock reçu de chaque officine, et chaque fichier envoyé. Le stock se met à jour tout seul à la réception : vous n'intervenez que si un fichier vous attend, ou pour déposer un fichier à la place d'un titulaire."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label="Reçus aujourd'hui" value={receivedTodayLabel} hint="Fichiers arrivés depuis minuit" href={`${BASE_PATH}?etat=tous`} />
        <KpiTile label="À trancher" value={formatNumber(attentionCount)} tone={attentionCount > 0 ? "warning" : "default"} hint={attentionCount > 0 ? "Fichiers à décider ou à relancer" : "Rien en attente"} href={`${BASE_PATH}?etat=attention`} />
        <KpiTile
          label="Officines sans stock depuis 7 jours"
          value={formatNumber(withoutStock.length)}
          tone={withoutStock.length > 0 ? "danger" : "default"}
          hint={withoutStock.length === 0 ? "Toutes les officines ont envoyé leur stock cette semaine" : neverReceived > 0 ? `Dont ${formatNumber(neverReceived)} qui n'ont encore rien envoyé` : "Plus de 7 jours depuis leur dernier stock"}
          href="#stock-par-officine"
        />
      </div>

      <AdminSection id="stock-par-officine" title="Stock de chaque officine" description="La plus ancienne en premier. Rouge à partir de 7 jours, ou quand rien n'est encore arrivé." padded={overview.length > 0}>
        {overview.length === 0 ? (
          <EmptyState icon={<Inbox className="size-5" />} title="Aucune officine cliente pour l'instant" description="Les officines actives apparaîtront ici avec la date de leur dernier stock." />
        ) : (
          <ul className="-my-3.5 divide-y divide-border-subtle">
            {overview.map((row) => (
              <li key={row.pharmacyId} className="py-3.5">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                  <div className="min-w-0 flex-1 basis-56">
                    <Link href={`/admin/pharmacies/${row.pharmacyId}`} className="block truncate text-[14px] font-semibold text-text-primary hover:underline">
                      {row.name}
                    </Link>
                    <span className="block truncate text-[12px] text-text-tertiary">{`${row.connected ? "Dossier PharmaBoost relié" : "Dossier PharmaBoost non relié"}${row.lgoLabel ? ` · ${row.lgoLabel}` : ""}`}</span>
                  </div>
                  <div className="w-44 space-y-1">
                    <FreshnessBadge syncedAt={row.stockSyncedAt} now={now} />
                    <p className="text-[12.5px] text-text-secondary">
                      <When date={row.stockSyncedAt} empty="Aucun stock reçu" />
                    </p>
                  </div>
                  <div className="w-56 text-[12.5px]">
                    <span className="block text-text-secondary">{row.lastSource ? DEPOSIT_SOURCE_LABELS[row.lastSource] : row.stockSyncedAt ? "Autre import" : "Aucun envoi"}</span>
                    <span className="block text-text-tertiary">{row.lines !== null ? `${formatNumber(row.lines)} ligne${row.lines > 1 ? "s" : ""}` : "—"}</span>
                  </div>
                  <DepositForPharmacy pharmacyId={row.pharmacyId} pharmacyName={row.name} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection
        id="fichiers-recus"
        title="Fichiers reçus"
        description={view === "attention" ? "Ceux qui vous attendent : trop petits pour être appliqués seuls, impossibles à lire, ou dont la lecture s'est arrêtée." : `Du plus récent au plus ancien${recent.length >= FILES_LIMIT ? ` (les ${FILES_LIMIT} derniers)` : ""}.`}
        action={
          <FilterChips
            basePath={BASE_PATH}
            param="etat"
            label="Choisir les fichiers à voir"
            current={view}
            options={[
              { value: "attention", label: "À trancher", count: attentionCount },
              { value: "tous", label: "Tous" },
            ]}
          />
        }
        padded={files.length > 0}
      >
        {files.length === 0 ? (
          recent.length === 0 ? (
            <EmptyState icon={<Inbox className="size-5" />} title="Aucun stock reçu pour l'instant" description="Les fichiers envoyés par les titulaires, par le dossier PharmaBoost ou déposés par vous apparaîtront ici." />
          ) : (
            <EmptyState
              icon={<Inbox className="size-5" />}
              title="Rien à trancher"
              description="Aucun fichier n'attend de décision ni de relance."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={`${BASE_PATH}?etat=tous`}>Voir tous les fichiers</Link>
                </Button>
              }
            />
          )
        ) : (
          <ul className="-my-4 divide-y divide-border-subtle">
            {files.map((deposit) => (
              <DepositFileRow key={deposit.id} deposit={deposit} />
            ))}
          </ul>
        )}
      </AdminSection>
    </>
  );
}
