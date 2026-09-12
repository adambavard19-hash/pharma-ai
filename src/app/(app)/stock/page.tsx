import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Boxes, Cable, Clock, History, PackageX, Plus, RefreshCw, Upload } from "lucide-react";
import { describeAge, lgoLabel, stockFreshness } from "@/core/stock/connectors";
import { cn } from "@/lib/utils";
import { ClassifyProductsButton } from "./classify-button";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { normalizeSearchText } from "@/core/reference/search";
import { PageHeader, Grid } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { PatientSearchBar } from "../patients/search-bar";
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

  const [products, drugLines, lastMovement, lastImport, pharmacy, unclassified] = await Promise.all([
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
    prisma.stockMovement.findFirst({ where: { pharmacyId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.importJob.findFirst({
      where: { pharmacyId, kind: "STOCK", status: "COMPLETED" },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true, fileName: true },
    }),
    prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { stockSyncedAt: true, stockConnection: { select: { lgo: true, status: true, lastSyncAt: true, lastSeenAt: true, intervalSeconds: true, lastError: true } } } }),
    // Les produits que le moteur ne sait pas encore relier à un besoin.
    prisma.product.count({ where: { pharmacyId, deletedAt: null, classifiedAt: null } }),
  ]);
  const syncedAt = pharmacy?.stockSyncedAt ?? lastImport?.finishedAt ?? null;
  const connection = pharmacy?.stockConnection && pharmacy.stockConnection.status !== "DISCONNECTED" && pharmacy.stockConnection.status !== "PENDING" ? pharmacy.stockConnection : null;
  const freshness = connection ? stockFreshness({ lastSyncAt: connection.lastSyncAt, lastSeenAt: connection.lastSeenAt, intervalSeconds: connection.intervalSeconds }) : null;
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

  const lastUpdate = [
    lastMovement?.createdAt ?? null,
    lastImport?.finishedAt ?? null,
    ...rows.map((row) => new Date(row.updatedAt)),
  ]
    .filter((date): date is Date => date !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

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
                <Link href="/stock/import">{syncedAt ? "Mettre à jour mon stock" : "Importer mon stock"}</Link>
              </Button>
            )}
            {(canManage || canAdjust) && (
              <Button asChild variant={syncedAt ? "primary" : "outline"} leadingIcon={<Plus className="size-[18px]" />}>
                <Link href="/stock/ajouter">Ajouter un produit</Link>
              </Button>
            )}
            {canImport && (
              <Button asChild variant="ghost" leadingIcon={<Cable className="size-[18px]" />}>
                <Link href="/stock/connexion">{connection ? "Mon logiciel" : "Connecter mon logiciel"}</Link>
              </Button>
            )}
            <Button asChild variant="ghost" leadingIcon={<History className="size-[18px]" />}>
              <Link href="/stock/historique">Historique</Link>
            </Button>
          </div>
        }
      />

      {/* L'état de synchronisation, en une ligne : c'est la première question
          du titulaire, et c'est ce qui conditionne ce que le comptoir propose. */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-[13.5px]",
          (connection ? freshness?.state === "FRESH" : Boolean(syncedAt)) ? "border-border-subtle bg-surface-card" : "border-warning-300 bg-warning-50/50 dark:border-warning-800 dark:bg-warning-950/20",
        )}
      >
        <p className="flex items-center gap-2 text-text-primary">
          {(connection ? freshness?.state === "FRESH" : Boolean(syncedAt)) ? <RefreshCw className="size-4 text-success-600" /> : <AlertTriangle className="size-4 text-warning-700 dark:text-warning-400" />}
          {connection && freshness ? (
            <>
              <span className="font-medium">
                {freshness.state === "FRESH" ? `Stock synchronisé avec ${lgoLabel(connection.lgo)} ${describeAge(freshness.ageSeconds)}` : freshness.state === "STALE" ? `Stock ${lgoLabel(connection.lgo)} non synchronisé ${describeAge(freshness.ageSeconds)} : périmé` : `Agent ${lgoLabel(connection.lgo)} injoignable — stock non vérifié ${describeAge(freshness.ageSeconds)}`}
              </span>
              <span className="text-text-tertiary">· {rows.length} référence{rows.length > 1 ? "s" : ""}{connection.lastError ? ` · ${connection.lastError}` : ""}</span>
            </>
          ) : syncedAt ? (
            <>
              <span className="font-medium">Stock synchronisé le {formatDateTime(syncedAt)}</span>
              <span className="text-text-tertiary">· {rows.length} référence{rows.length > 1 ? "s" : ""} · import de fichier</span>
            </>
          ) : (
            <span className="font-medium">Stock jamais importé — le comptoir ne peut rien proposer de votre rayon.</span>
          )}
        </p>
        {unclassified > 0 && canManage && <ClassifyProductsButton pending={unclassified} />}
      </div>

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
          label="Dernière mise à jour"
          value={lastUpdate ? formatDateTime(lastUpdate) : "—"}
          sublabel={lastImport ? `Import : ${lastImport.fileName}` : counts.low > 0 ? `${counts.low} en stock faible` : "aucun import"}
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
