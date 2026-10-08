import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus, RefreshCw } from "lucide-react";
import { prisma } from "@/server/db/client";
import { countLotsNeedingAction } from "@/server/services/stock-lots";
import { loadConnectionOverview } from "@/server/services/connection-overview";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { normalizeSearchText } from "@/core/reference/search";
import { availabilityOf, describeStockAge, parseStockFilter, stockStatus, summarizeStock } from "@/core/stock/stock-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { PatientSearchBar } from "../patients/search-bar";
import { StockList, type StockRow } from "./stock-list";

export const metadata: Metadata = { title: "Mon stock" };

const PAGE_SIZE = 25;

/**
 * Mon stock — un écran simple : l'état du stock et le bouton qui le met à jour, deux chiffres (produits référencés,
 * produits disponibles), la recherche, la liste, « Ajouter un produit ».
 *
 * Les chiffres sont ceux de TOUT le catalogue (jamais ceux de la recherche) et viennent d'un seul calcul
 * (`summarizeStock`) : un produit est disponible (quantité supérieure à zéro), en rupture, ou désactivé. Un produit
 * « non classé » ou sans photo n'est pas en rupture ; ces sujets-là sont dans « Qualité du catalogue ».
 */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; etat?: string; page?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.STOCK_VIEW);
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const filter = parseStockFilter(params.etat);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pharmacyId = session.scope.pharmacyId;

  const canAdjust = session.permissions.has(PERMISSIONS.STOCK_ADJUST);
  const canManage = session.permissions.has(PERMISSIONS.PRODUCT_MANAGE);
  const canImport = session.permissions.has(PERMISSIONS.PRODUCT_IMPORT);

  const [catalogue, catalogueDrugs, products, drugLines, connection, shortDates] = await Promise.all([
    // Les chiffres de tout le catalogue : deux lectures légères, jamais filtrées par la recherche.
    prisma.product.findMany({ where: { pharmacyId, deletedAt: null }, select: { isActive: true, stockItem: { select: { quantity: true } } } }),
    prisma.pharmacyDrugStock.findMany({ where: { pharmacyId }, select: { quantity: true } }),
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
      select: { id: true, name: true, brand: true, ean: true, salePriceCents: true, isActive: true, stockItem: { select: { quantity: true } } },
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
      select: { id: true, quantity: true, priceCents: true, presentation: { select: { cip13: true, label: true, priceCents: true, specialty: { select: { name: true } } } } },
      orderBy: { updatedAt: "desc" },
    }),
    loadConnectionOverview(pharmacyId),
    countLotsNeedingAction(session.scope),
  ]);

  const summary = summarizeStock([...catalogue.map((product) => ({ active: product.isActive, quantity: product.stockItem?.quantity ?? 0 })), ...catalogueDrugs.map((line) => ({ active: true, quantity: line.quantity }))]);

  const rows: StockRow[] = [
    ...products.map((product) => ({
      kind: "PRODUCT" as const,
      id: product.id,
      name: product.name,
      detail: product.brand,
      code: product.ean,
      quantity: product.stockItem?.quantity ?? 0,
      priceCents: product.salePriceCents,
      active: product.isActive,
      href: `/stock/${product.id}`,
    })),
    ...drugLines.map((line) => ({
      kind: "DRUG" as const,
      id: line.id,
      name: line.presentation.specialty.name,
      detail: line.presentation.label,
      code: line.presentation.cip13,
      quantity: line.quantity,
      priceCents: line.priceCents ?? line.presentation.priceCents,
      active: true,
      href: `/stock/medicaments?q=${line.presentation.cip13}`,
    })),
  ];

  const shown = summarizeStock(rows);
  const counts = { tous: shown.referenced, disponible: shown.available, rupture: shown.outOfStock, desactive: shown.inactive };
  const filtered = rows
    .filter((row) => filter === "tous" || availabilityOf(row) === filter)
    // Ce qui manque d'abord, puis l'ordre alphabétique : au comptoir, une rupture est une information avant d'être une ligne.
    .sort((a, b) => Number(availabilityOf(b) === "rupture") - Number(availabilityOf(a) === "rupture") || a.name.localeCompare(b.name, "fr"));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const now = new Date();
  const syncedAt = connection.stockSyncedAt;
  const status = stockStatus(syncedAt, now);
  const age = describeStockAge(syncedAt, now);
  const urgentDates = shortDates.urgent + shortDates.expired;

  return (
    <div className="mx-auto w-full max-w-3xl pb-20">
      <section aria-label="Mon stock" className="space-y-4 rounded-3xl border border-border-subtle bg-surface-card p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h1 className="text-[28px] leading-9 font-bold tracking-[-0.025em] text-text-primary sm:text-[32px] sm:leading-10">Mon stock</h1>
            <p className="truncate text-[15px] leading-6 text-text-secondary">{session.pharmacy.name}</p>
          </div>
          <Badge tone={status.tone} className="mt-2">{status.label}</Badge>
        </header>

        <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface-sunken/60 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h2 className="text-[17px] leading-6 font-semibold text-text-primary">Dernière mise à jour</h2>
            <p className="text-[14.5px] text-text-secondary">{age ?? "Aucun stock reçu"}</p>
          </div>
          {canImport && (
            <Button asChild variant="success" size="xl" className="w-full rounded-full" leadingIcon={<RefreshCw className="size-5" />}>
              <Link href="/stock/mise-a-jour">{syncedAt ? "Mettre à jour mon stock" : "Envoyer mon stock"}</Link>
            </Button>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border-subtle p-4">
            <dt className="text-[13.5px] leading-5 text-text-secondary">Produits référencés</dt>
            <dd className="mt-1 text-[30px] leading-9 font-semibold tabular text-text-primary">{formatNumber(summary.referenced)}</dd>
            <dd className="text-[12.5px] leading-5 text-text-tertiary">Dans votre catalogue</dd>
          </div>
          <div className="rounded-2xl border border-border-subtle p-4">
            <dt className="text-[13.5px] leading-5 text-text-secondary">Produits disponibles</dt>
            <dd className="mt-1 text-[30px] leading-9 font-semibold tabular text-success-600 dark:text-success-500">{formatNumber(summary.available)}</dd>
            <dd className="text-[12.5px] leading-5 text-text-tertiary">Quantité supérieure à zéro</dd>
          </div>
        </dl>

        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="text-[19px] leading-7 font-semibold text-text-primary">Rechercher un produit</h2>
            <p className="text-[13.5px] text-text-tertiary tabular">{formatNumber(filtered.length)} référence{filtered.length > 1 ? "s" : ""}</p>
          </div>
          <PatientSearchBar initialQuery={query} basePath="/stock" placeholder="Nom, code CIP, EAN…" className="max-w-none" />
          <StockList rows={visible} total={filtered.length} filter={filter} counts={counts} page={page} totalPages={totalPages} query={query} canAdjust={canAdjust} />
        </div>

        {(canManage || canAdjust) && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
            <p className="text-[14px] text-text-secondary">Gestion manuelle d&apos;un produit</p>
            <Button asChild variant="outline" className="rounded-full" leadingIcon={<Plus className="size-[18px]" />}>
              <Link href="/stock/ajouter">Ajouter un produit</Link>
            </Button>
          </div>
        )}
      </section>

      <p className="mt-4 text-center">
        <Link href="/stock/qualite" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline">
          Qualité du catalogue
          {urgentDates > 0 && <span className="rounded-full bg-warning-500 px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white tabular" title={`${urgentDates} date${urgentDates > 1 ? "s" : ""} courte${urgentDates > 1 ? "s" : ""} à traiter`}>{urgentDates}</span>}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </p>
    </div>
  );
}
