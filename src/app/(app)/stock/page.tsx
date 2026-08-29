import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  AlertTriangle,
  Boxes,
  Package,
  PackageX,
  Plus,
  Store,
  Upload,
} from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { siblingPharmacyIds } from "@/server/db/tenant";
import { needsAttention, stockStatus, STOCK_STATUS_LABELS } from "@/server/services/catalog";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { PageHeader, Grid } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, Progress } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StockTabs } from "./stock-tabs";
import { PatientSearchBar } from "../patients/search-bar";
import { CategoryFilter } from "./category-filter";
import { computeMargin, formatCents, formatDateTime, formatPercent } from "@/lib/format";
import type { ProductCategoryCode } from "@/core/ai/types";

export const metadata: Metadata = { title: "Stock" };

const PAGE_SIZE = 30;

/**
 * Le stock — un seul écran.
 *
 * « Produits » et « Stocks » décrivaient le même objet vu sous deux angles :
 * ce qu'on référence et ce qu'on en a. Dans la tête du pharmacien, c'est une
 * seule question — qu'est-ce que je peux conseiller aujourd'hui ? Trois onglets
 * y répondent : ce qui manque, tout le catalogue, ce qui a bougé.
 */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string; q?: string; categorie?: string; page?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.STOCK_VIEW);
  const params = await searchParams;
  const tab = params.onglet ?? "alertes";

  const canSeeCatalog = session.permissions.has(PERMISSIONS.PRODUCT_VIEW);
  const canManage = session.permissions.has(PERMISSIONS.PRODUCT_MANAGE);

  const query = (params.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const category = params.categorie;
  const validCategory =
    category && PRODUCT_CATEGORIES.includes(category as ProductCategoryCode)
      ? (category as ProductCategoryCode)
      : undefined;

  const siblings = await siblingPharmacyIds(session.scope);

  const catalogWhere = {
    pharmacyId: session.scope.pharmacyId,
    deletedAt: null,
    ...(validCategory ? { category: validCategory } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { brand: { contains: query, mode: "insensitive" as const } },
            { reference: { contains: query, mode: "insensitive" as const } },
            { ean: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const showCatalog = tab === "catalogue" && canSeeCatalog;

  const [
    items,
    movements,
    movementCount,
    products,
    catalogTotal,
    categoryCounts,
    drugStockCount,
  ] = await Promise.all([
    prisma.stockItem.findMany({
      where: {
        pharmacyId: session.scope.pharmacyId,
        product: { deletedAt: null, isActive: true },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            brand: true,
            category: true,
            reference: true,
            ean: true,
            imageUrl: true,
            salePriceCents: true,
            purchasePriceCents: true,
          },
        },
      },
      orderBy: [{ quantity: "asc" }],
    }),
    tab === "mouvements"
      ? prisma.stockMovement.findMany({
          where: { pharmacyId: session.scope.pharmacyId },
          orderBy: { createdAt: "desc" },
          take: 40,
          include: {
            product: { select: { id: true, name: true } },
            user: { select: { firstName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
    // Compté à part : le badge de l'onglet doit être juste même quand on ne
    // regarde pas cet onglet.
    prisma.stockMovement.count({ where: { pharmacyId: session.scope.pharmacyId } }),
    showCatalog
      ? prisma.product.findMany({
          where: catalogWhere,
          orderBy: [{ name: "asc" }],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: { stockItem: true },
        })
      : Promise.resolve([]),
    canSeeCatalog ? prisma.product.count({ where: catalogWhere }) : Promise.resolve(0),
    showCatalog
      ? prisma.product.groupBy({
          by: ["category"],
          where: { pharmacyId: session.scope.pharmacyId, deletedAt: null },
          _count: true,
        })
      : Promise.resolve([]),
    // Compté ici aussi pour que la barre d'onglets soit identique sur les deux
    // écrans du stock, quel que soit celui qu'on regarde.
    prisma.pharmacyDrugStock.count({ where: { pharmacyId: session.scope.pharmacyId } }),
  ]);

  // Disponibilité dans les autres officines du groupe, appariée par EAN.
  const siblingEans = new Set<string>();
  if (siblings.length > 0) {
    const available = await prisma.product.findMany({
      where: {
        pharmacyId: { in: siblings },
        deletedAt: null,
        isActive: true,
        ean: { not: null },
        stockItem: { quantity: { gt: 0 } },
      },
      select: { ean: true },
    });
    for (const product of available) if (product.ean) siblingEans.add(product.ean);
  }

  const outOfStock = items.filter((item) => item.quantity <= 0);
  const lowStock = items.filter((item) => item.quantity > 0 && needsAttention(item));
  const inventoryValue = items.reduce(
    (sum, item) => sum + item.quantity * item.product.purchasePriceCents,
    0,
  );
  const retailValue = items.reduce(
    (sum, item) => sum + item.quantity * item.product.salePriceCents,
    0,
  );

  const alerts = [...outOfStock, ...lowStock];
  const displayed = tab === "tout" ? items : alerts;
  const totalPages = Math.max(1, Math.ceil(catalogTotal / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock"
        description="Ce que vous avez en rayon, et donc ce que Pharma.ai peut conseiller. Une rupture retire immédiatement la référence du comptoir."
        actions={
          <div className="flex gap-2">
            {session.permissions.has(PERMISSIONS.PRODUCT_IMPORT) && (
              <Button asChild variant="outline" leadingIcon={<Upload className="size-[18px]" />}>
                <Link href="/stock/import">Importer</Link>
              </Button>
            )}
            {canManage && (
              <Button asChild leadingIcon={<Plus className="size-[18px]" />}>
                <Link href="/stock/nouveau">Nouvelle référence</Link>
              </Button>
            )}
          </div>
        }
      />

      <Grid cols={4}>
        <StatCard
          label="Références suivies"
          value={items.length}
          sublabel="produits actifs"
          icon={<Boxes className="size-4" />}
        />
        <StatCard
          label="En rupture"
          value={outOfStock.length}
          sublabel={outOfStock.length > 0 ? "exclues du conseil" : "aucune rupture"}
          icon={<PackageX className="size-4" />}
        />
        <StatCard
          label="Stock faible"
          value={lowStock.length}
          sublabel="sous le seuil d'alerte"
          icon={<AlertTriangle className="size-4" />}
        />
        <StatCard
          label="Valeur du stock"
          value={formatCents(inventoryValue)}
          sublabel={`${formatCents(retailValue)} au prix de vente`}
          icon={<Store className="size-4" />}
          emphasis="brand"
        />
      </Grid>

      {siblings.length > 0 && (
        <Alert tone="info" title="Disponibilité inter-officines activée">
          Lorsqu&apos;une référence est en rupture ici mais disponible dans une autre officine du
          groupe, Pharma.ai le signale au pharmacien plutôt que d&apos;écarter le conseil.
        </Alert>
      )}

      <StockTabs
        counts={{
          alerts: alerts.length,
          items: items.length,
          catalog: canSeeCatalog ? catalogTotal : null,
          drugs: drugStockCount,
          movements: movementCount,
        }}
      />

      {tab === "mouvements" ? (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Produit</TH>
                <TH>Type</TH>
                <TH numeric>Variation</TH>
                <TH numeric>Stock après</TH>
                <TH>Par</TH>
              </TR>
            </THead>
            <TBody>
              {movements.map((movement) => (
                <TR key={movement.id} interactive>
                  <TD className="text-text-secondary">{formatDateTime(movement.createdAt)}</TD>
                  <TD>
                    <Link href={`/stock/${movement.product.id}`} className="hover:underline">
                      {movement.product.name}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={MOVEMENT_TONES[movement.type] ?? "neutral"}>
                      {MOVEMENT_LABELS[movement.type] ?? movement.type}
                    </Badge>
                  </TD>
                  <TD
                    numeric
                    className={
                      movement.quantityDelta < 0
                        ? "text-danger-600 dark:text-danger-500"
                        : "text-success-600 dark:text-success-500"
                    }
                  >
                    {movement.quantityDelta > 0 ? "+" : ""}
                    {movement.quantityDelta}
                  </TD>
                  <TD numeric>{movement.quantityAfter}</TD>
                  <TD className="text-text-secondary">
                    {movement.user
                      ? `${movement.user.firstName} ${movement.user.lastName}`
                      : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      ) : showCatalog ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PatientSearchBar
              initialQuery={query}
              basePath="/stock"
              placeholder="Rechercher une référence (nom, marque, code, EAN…)"
            />
            <p className="text-[13px] text-text-tertiary tabular">
              {catalogTotal} référence{catalogTotal > 1 ? "s" : ""}
            </p>
          </div>

          <CategoryFilter
            active={validCategory ?? null}
            counts={Object.fromEntries(categoryCounts.map((row) => [row.category, row._count]))}
          />

          {products.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Package className="size-5" />}
                title={query || validCategory ? "Aucune référence trouvée" : "Catalogue vide"}
                description={
                  query || validCategory
                    ? "Modifiez votre recherche ou choisissez une autre catégorie."
                    : "Ajoutez vos premières références pour que Pharma.ai puisse proposer des conseils."
                }
                action={
                  canManage ? (
                    <Button asChild leadingIcon={<Plus className="size-4" />}>
                      <Link href="/stock/nouveau">Ajouter une référence</Link>
                    </Button>
                  ) : null
                }
              />
            </Card>
          ) : (
            <>
              <TableWrapper>
                <Table>
                  <THead>
                    <TR>
                      <TH>Produit</TH>
                      <TH>Catégorie</TH>
                      <TH>Référence</TH>
                      <TH numeric>Prix de vente</TH>
                      <TH numeric>Marge</TH>
                      <TH>Stock</TH>
                      <TH>État</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {products.map((product) => {
                      const quantity = product.stockItem?.quantity ?? 0;
                      const threshold = product.stockItem?.alertThreshold ?? 0;
                      const status = stockStatus(quantity, threshold);
                      const { marginCents, marginRate } = computeMargin(
                        product.purchasePriceCents,
                        product.salePriceCents,
                      );

                      return (
                        <TR key={product.id} interactive>
                          <TD>
                            <Link
                              href={`/stock/${product.id}`}
                              className="flex items-center gap-3 hover:underline"
                            >
                              {product.imageUrl ? (
                                <Image
                                  src={product.imageUrl}
                                  alt=""
                                  width={36}
                                  height={36}
                                  className="size-9 shrink-0 rounded-md object-cover"
                                />
                              ) : (
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-tertiary">
                                  <Package className="size-4" />
                                </span>
                              )}
                              <span className="min-w-0">
                                <span className="block max-w-[240px] truncate font-medium">
                                  {product.name}
                                </span>
                                {product.brand && (
                                  <span className="block text-[12px] text-text-tertiary">
                                    {product.brand}
                                  </span>
                                )}
                              </span>
                            </Link>
                          </TD>
                          <TD className="text-text-secondary">
                            {PRODUCT_CATEGORY_LABELS[product.category as ProductCategoryCode]}
                          </TD>
                          <TD className="text-text-tertiary tabular">{product.reference}</TD>
                          <TD numeric className="font-semibold">
                            {formatCents(product.salePriceCents)}
                          </TD>
                          <TD numeric className="text-text-secondary">
                            {formatCents(marginCents)}
                            {marginRate !== null && (
                              <span className="ml-1.5 text-[12px] text-text-tertiary">
                                {formatPercent(marginRate)}
                              </span>
                            )}
                          </TD>
                          <TD numeric>{quantity}</TD>
                          <TD>
                            <Badge
                              tone={
                                status === "OUT_OF_STOCK"
                                  ? "danger"
                                  : status === "LOW_STOCK"
                                    ? "warning"
                                    : "success"
                              }
                            >
                              {STOCK_STATUS_LABELS[status]}
                            </Badge>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </TableWrapper>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] text-text-tertiary">
                    Page {page} sur {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm" disabled={page <= 1}>
                      <Link
                        href={catalogHref({ query, category: validCategory, page: page - 1 })}
                      >
                        Précédent
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
                      <Link
                        href={catalogHref({ query, category: validCategory, page: page + 1 })}
                      >
                        Suivant
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : displayed.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Boxes className="size-5" />}
            title="Aucune alerte de stock"
            description="Toutes vos références actives sont au-dessus de leur seuil d'alerte."
          />
        </Card>
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>Produit</TH>
                <TH>Catégorie</TH>
                <TH numeric>Quantité</TH>
                <TH numeric>Seuil</TH>
                <TH>Niveau</TH>
                <TH>État</TH>
                <TH>Emplacement</TH>
              </TR>
            </THead>
            <TBody>
              {displayed.map((item) => {
                const status = stockStatus(item.quantity, item.alertThreshold);
                const inSibling = item.product.ean ? siblingEans.has(item.product.ean) : false;
                const ratio =
                  item.alertThreshold > 0
                    ? Math.min(1, item.quantity / (item.alertThreshold * 3))
                    : item.quantity > 0
                      ? 1
                      : 0;

                return (
                  <TR key={item.id} interactive>
                    <TD>
                      <Link
                        href={`/stock/${item.product.id}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        {item.product.imageUrl ? (
                          <Image
                            src={item.product.imageUrl}
                            alt=""
                            width={32}
                            height={32}
                            className="size-8 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-tertiary">
                            <Package className="size-3.5" />
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block max-w-[260px] truncate font-medium">
                            {item.product.name}
                          </span>
                          {item.product.brand && (
                            <span className="block text-[12px] text-text-tertiary">
                              {item.product.brand}
                            </span>
                          )}
                        </span>
                      </Link>
                    </TD>
                    <TD className="text-text-secondary">
                      {PRODUCT_CATEGORY_LABELS[item.product.category as ProductCategoryCode]}
                    </TD>
                    <TD numeric className="font-semibold">
                      {item.quantity}
                    </TD>
                    <TD numeric className="text-text-tertiary">
                      {item.alertThreshold}
                    </TD>
                    <TD className="w-32">
                      <Progress
                        value={ratio}
                        tone={
                          status === "OUT_OF_STOCK"
                            ? "danger"
                            : status === "LOW_STOCK"
                              ? "warning"
                              : "success"
                        }
                        label={`Niveau de stock : ${item.quantity}`}
                      />
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <Badge
                          tone={
                            status === "OUT_OF_STOCK"
                              ? "danger"
                              : status === "LOW_STOCK"
                                ? "warning"
                                : "success"
                          }
                        >
                          {STOCK_STATUS_LABELS[status]}
                        </Badge>
                        {status === "OUT_OF_STOCK" && inSibling && (
                          <Badge tone="info" icon={<Store className="size-3" />}>
                            Dispo. autre officine
                          </Badge>
                        )}
                      </div>
                    </TD>
                    <TD className="text-text-tertiary">{item.location ?? "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrapper>
      )}
    </div>
  );
}

function catalogHref(params: {
  query: string;
  category?: ProductCategoryCode;
  page: number;
}): string {
  const search = new URLSearchParams({ onglet: "catalogue" });
  if (params.query) search.set("q", params.query);
  if (params.category) search.set("categorie", params.category);
  if (params.page > 1) search.set("page", String(params.page));
  return `/stock?${search.toString()}`;
}

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: "Réception",
  SALE: "Vente",
  ADJUSTMENT: "Ajustement",
  LOSS: "Perte",
  RETURN: "Retour",
  INVENTORY: "Inventaire",
  IMPORT: "Import",
};

const MOVEMENT_TONES: Record<
  string,
  "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info"
> = {
  PURCHASE: "success",
  SALE: "accent",
  ADJUSTMENT: "info",
  LOSS: "danger",
  RETURN: "info",
  INVENTORY: "brand",
  IMPORT: "neutral",
};
