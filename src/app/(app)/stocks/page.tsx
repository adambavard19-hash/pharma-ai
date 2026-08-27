import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { AlertTriangle, Boxes, Package, PackageX, Store } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { siblingPharmacyIds } from "@/server/db/tenant";
import { stockStatus, STOCK_STATUS_LABELS } from "@/server/services/catalog";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { PageHeader, Grid } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, Progress } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LinkTabs } from "@/components/ui/tabs";
import { formatCents, formatDateTime } from "@/lib/format";
import type { ProductCategoryCode } from "@/core/ai/types";

export const metadata: Metadata = { title: "Stocks" };

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.STOCK_VIEW);
  const params = await searchParams;
  const tab = params.onglet ?? "alertes";

  const siblings = await siblingPharmacyIds(session.scope);

  const [items, movements] = await Promise.all([
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
    prisma.stockMovement.findMany({
      where: { pharmacyId: session.scope.pharmacyId },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        product: { select: { id: true, name: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    }),
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
  const lowStock = items.filter(
    (item) => item.quantity > 0 && item.quantity <= item.alertThreshold,
  );
  const inventoryValue = items.reduce(
    (sum, item) => sum + item.quantity * item.product.purchasePriceCents,
    0,
  );
  const retailValue = items.reduce(
    (sum, item) => sum + item.quantity * item.product.salePriceCents,
    0,
  );

  const alerts = [...outOfStock, ...lowStock];
  const displayed =
    tab === "tout" ? items : tab === "mouvements" ? [] : alerts;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stocks"
        description="Le moteur ne propose que des références réellement disponibles. Une rupture retire immédiatement le produit du conseil."
        actions={
          <Button asChild variant="outline" leadingIcon={<Package className="size-[18px]" />}>
            <Link href="/produits">Voir le catalogue</Link>
          </Button>
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
          sublabel={
            outOfStock.length > 0 ? "exclues du conseil" : "aucune rupture"
          }
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

      <LinkTabs
        items={[
          { key: "alertes", label: "À surveiller", count: alerts.length },
          { key: "tout", label: "Tout le stock", count: items.length },
          { key: "mouvements", label: "Mouvements", count: movements.length },
        ]}
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
                    <Link href={`/produits/${movement.product.id}`} className="hover:underline">
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
                const inSibling = item.product.ean
                  ? siblingEans.has(item.product.ean)
                  : false;
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
                        href={`/produits/${item.product.id}`}
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
