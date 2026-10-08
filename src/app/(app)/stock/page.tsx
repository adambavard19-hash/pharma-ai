import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Boxes, Cable, Clock, History, Hourglass, PackageX, Plus, Upload } from "lucide-react";
import { ClassifyProductsButton } from "./classify-button";
import { FetchPhotosButton } from "./photos-button";
import { prisma } from "@/server/db/client";
import { countProductsWithoutImageLookup } from "@/server/services/product-images";
import { countLotsNeedingAction } from "@/server/services/stock-lots";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { normalizeSearchText } from "@/core/reference/search";
import { PageHeader, Grid } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { PatientSearchBar } from "../patients/search-bar";
import { loadConnectionOverview } from "@/server/services/connection-overview";
import { ConnectionSummary } from "../connexion/summary";
import { StockList, type StockRow } from "./stock-list";

export const metadata: Metadata = { title: "Stock de mon officine" };

const PAGE_SIZE = 60;

/**
 * Le stock de l'officine — une seule liste.
 *
 * Médicaments (catalogue national, par CIP) et produits de parapharmacie
 * (catalogue de l'officine) vivent dans deux tables, pour de bonnes raisons.
 * Le titulaire, lui, n'a qu'une question : qu'est-ce que j'ai, en quelle
 * quantité, à quel prix ? Cet écran répond en une liste, et une quantité se
 * corrige sur la ligne même.
 */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; etat?: string; page?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.STOCK_VIEW);
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const filter = params.etat ?? "tous";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pharmacyId = session.scope.pharmacyId;

  const canAdjust = session.permissions.has(PERMISSIONS.STOCK_ADJUST);
  const canManage = session.permissions.has(PERMISSIONS.PRODUCT_MANAGE);
  const canImport = session.permissions.has(PERMISSIONS.PRODUCT_IMPORT);

  const [products, drugLines, connectionState, unclassified, withoutImage, shortDates] = await Promise.all([
    prisma.product.findMany({
      where: {
        pharmacyId,
        deletedAt: null,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { brand: { contains: query, mode: "insensitive" } },
                { ean: { contains: query.replace(/\D/g, "") || query } },
                { reference: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        brand: true,
        ean: true,
        salePriceCents: true,
        purchasePriceCents: true,
        isActive: true,
        updatedAt: true,
        stockItem: { select: { quantity: true, alertThreshold: true, updatedAt: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.pharmacyDrugStock.findMany({
      where: {
        pharmacyId,
        ...(query
          ? {
              presentation: {
                OR: [
                  { cip13: { contains: query.replace(/\D/g, "") || query } },
                  { specialty: { searchName: { contains: normalizeSearchText(query) } } },
                  { specialty: { name: { contains: query, mode: "insensitive" } } },
                ],
              },
            }
          : {}),
      },
      select: {
        id: true,
        quantity: true,
        alertThreshold: true,
        priceCents: true,
        updatedAt: true,
        presentation: {
          select: { cip13: true, label: true, priceCents: true, specialty: { select: { name: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    // L'état de la connexion : calculé une seule fois, partout pareil (voir « Ma connexion »).
    loadConnectionOverview(pharmacyId),
    // Les produits que le moteur ne sait pas encore relier à un besoin.
    prisma.product.count({ where: { pharmacyId, deletedAt: null, classifiedAt: null } }),
    // Les boîtes dont la photo n'a pas encore été cherchée.
    countProductsWithoutImageLookup(pharmacyId),
    // Les lots à date courte qui demandent un geste (urgents et expirés).
    countLotsNeedingAction(session.scope),
  ]);
  const shortDateAlerts = shortDates.urgent + shortDates.expired;
  const { overview, stockSyncedAt: syncedAt } = connectionState;
  const zeroPrice = products.filter((product) => product.isActive && product.salePriceCents <= 0).length;
  const anomalies = unclassified + zeroPrice;

  const rows: StockRow[] = [
    ...products.map((product) => ({
      kind: "PRODUCT" as const,
      id: product.id,
      name: product.name,
      detail: product.brand,
      code: product.ean,
      quantity: product.stockItem?.quantity ?? 0,
      threshold: product.stockItem?.alertThreshold ?? 0,
      priceCents: product.salePriceCents,
      purchasePriceCents: canManage ? product.purchasePriceCents : null,
      active: product.isActive,
      href: `/stock/${product.id}`,
      updatedAt: (product.stockItem?.updatedAt ?? product.updatedAt).toISOString(),
    })),
    ...drugLines.map((line) => ({
      kind: "DRUG" as const,
      id: line.id,
      name: line.presentation.specialty.name,
      detail: line.presentation.label,
      code: line.presentation.cip13,
      quantity: line.quantity,
      threshold: line.alertThreshold,
      priceCents: line.priceCents ?? line.presentation.priceCents,
      purchasePriceCents: null,
      active: true,
      href: `/stock/medicaments?q=${line.presentation.cip13}`,
      updatedAt: line.updatedAt.toISOString(),
    })),
  ];

  const stateOf = (row: StockRow) =>
    !row.active ? "inactif" : row.quantity <= 0 ? "rupture" : row.threshold > 0 && row.quantity <= row.threshold ? "faible" : "stock";

  const counts = {
    inStock: rows.filter((row) => stateOf(row) === "stock").length,
    out: rows.filter((row) => stateOf(row) === "rupture").length,
    low: rows.filter((row) => stateOf(row) === "faible").length,
    inactive: rows.filter((row) => stateOf(row) === "inactif").length,
  };

  const filtered = rows
    .filter((row) => (filter === "tous" ? true : stateOf(row) === filter))
    .sort((a, b) => {
      // Ce qui manque d'abord, puis l'ordre alphabétique : au comptoir, une
      // rupture est une information avant d'être une ligne.
      const rank = (row: StockRow) => (stateOf(row) === "rupture" ? 0 : stateOf(row) === "faible" ? 1 : 2);
      return rank(a) - rank(b) || a.name.localeCompare(b.name, "fr");
    });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock de mon officine"
        description="Ce que vous avez réellement en rayon, en quelle quantité et à quel prix. PharmaBoost ne propose jamais un produit absent de cette liste."
        actions={
          <div className="flex flex-wrap gap-2">
            {canImport && (
              <Button asChild variant={syncedAt ? "outline" : "primary"} leadingIcon={<Upload className="size-[18px]" />}>
                <Link href="/stock/mise-a-jour">{syncedAt ? "Mettre à jour mon stock" : "Importer mon stock"}</Link>
              </Button>
            )}
            {(canManage || canAdjust) && (
              <Button asChild variant={syncedAt ? "primary" : "outline"} leadingIcon={<Plus className="size-[18px]" />}>
                <Link href="/stock/ajouter">Ajouter un produit</Link>
              </Button>
            )}
            {canImport && (
              <Button asChild variant="ghost" leadingIcon={<Cable className="size-[18px]" />}>
                <Link href="/connexion">Ma connexion</Link>
              </Button>
            )}
            <Button asChild variant="ghost" leadingIcon={<Hourglass className="size-[18px]" />}>
              <Link href="/stock/dates-courtes" title={shortDateAlerts > 0 ? `${shortDates.expired} expiré(s) · ${shortDates.urgent} urgent(s)` : undefined}>
                Dates courtes
                {shortDateAlerts > 0 && (
                  <span className="rounded-full bg-danger-600 px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white tabular">{shortDateAlerts}</span>
                )}
              </Link>
            </Button>
            <Button asChild variant="ghost" leadingIcon={<History className="size-[18px]" />}>
              <Link href="/stock/historique">Historique</Link>
            </Button>
          </div>
        }
      />

      {/* L'état de la connexion, en une ligne : la première question du titulaire, et ce qui
          conditionne ce que le comptoir propose. Trois états séparés, les mêmes partout. */}
      <ConnectionSummary overview={overview} canOpen={canImport} />
      {((unclassified > 0 && canManage) || (withoutImage > 0 && canManage)) && (
        <div className="flex flex-wrap items-center gap-3">
          {unclassified > 0 && canManage && <ClassifyProductsButton pending={unclassified} />}
          {withoutImage > 0 && canManage && <FetchPhotosButton pending={withoutImage} />}
        </div>
      )}

      <Grid cols={4}>
        <StatCard label="Références" value={rows.length} sublabel={`${counts.inStock} en stock`} icon={<Boxes className="size-4" />} emphasis="brand" />
        <StatCard label="Ruptures" value={counts.out} sublabel={counts.out > 0 ? "jamais proposées" : "aucune rupture"} icon={<PackageX className="size-4" />} />
        <StatCard
          label="Anomalies"
          value={anomalies}
          sublabel={anomalies === 0 ? "rien à corriger" : [unclassified > 0 ? `${unclassified} à comprendre` : null, zeroPrice > 0 ? `${zeroPrice} sans prix` : null].filter(Boolean).join(" · ")}
          icon={<AlertTriangle className="size-4" />}
        />
        <StatCard
          label="Stock reçu"
          value={syncedAt ? formatDateTime(syncedAt) : "—"}
          sublabel={overview.stock.state === "NONE" ? "aucun stock reçu" : overview.stock.state === "FRESH" ? "à jour" : overview.stock.title.toLowerCase()}
          icon={<Clock className="size-4" />}
        />
      </Grid>

      <PatientSearchBar initialQuery={query} basePath="/stock" placeholder="Rechercher un produit — nom, CIP, EAN…" />

      <StockList
        rows={visible}
        total={filtered.length}
        filter={filter}
        counts={{ tous: rows.length, stock: counts.inStock, faible: counts.low, rupture: counts.out, inactif: counts.inactive }}
        page={page}
        totalPages={totalPages}
        query={query}
        canAdjust={canAdjust}
        canManage={canManage}
      />
    </div>
  );
}
