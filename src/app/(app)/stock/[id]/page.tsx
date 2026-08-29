import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, Package, Sparkles, TrendingUp } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { stockStatus, STOCK_STATUS_LABELS } from "@/server/services/catalog";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { DataItem, Grid } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { computeMargin, formatCents, formatDateTime, formatPercent } from "@/lib/format";
import { StockAdjustForm } from "./stock-form";
import type { ProductCategoryCode } from "@/core/ai/types";

export const metadata: Metadata = { title: "Fiche produit" };

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.PRODUCT_VIEW);

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      stockItem: true,
      stockMovements: {
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  if (!product || product.pharmacyId !== session.scope.pharmacyId || product.deletedAt) {
    notFound();
  }

  const [recommendationStats, salesStats] = await Promise.all([
    prisma.recommendation.groupBy({
      by: ["status"],
      where: { productId: product.id, pharmacyId: session.scope.pharmacyId },
      _count: true,
    }),
    prisma.saleLine.aggregate({
      where: {
        productId: product.id,
        sale: { pharmacyId: session.scope.pharmacyId },
        recommendationId: { not: null },
      },
      _sum: { totalCents: true, quantity: true },
    }),
  ]);

  const proposed = recommendationStats.reduce((sum, row) => sum + row._count, 0);
  const purchased =
    recommendationStats.find((row) => row.status === "PURCHASED")?._count ?? 0;

  const quantity = product.stockItem?.quantity ?? 0;
  const threshold = product.stockItem?.alertThreshold ?? 0;
  const status = stockStatus(quantity, threshold);
  const { marginCents, marginRate } = computeMargin(
    product.purchasePriceCents,
    product.salePriceCents,
  );

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/stock?onglet=catalogue">Retour au stock</Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex flex-wrap items-start gap-5">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt=""
              width={96}
              height={96}
              className="size-24 shrink-0 rounded-xl object-cover shadow-sm"
            />
          ) : (
            <span className="flex size-24 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-text-tertiary">
              <Package className="size-8" />
            </span>
          )}
          <div className="space-y-2">
            <div className="space-y-1">
              <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em] text-text-primary">
                {product.name}
              </h1>
              <p className="text-[13.5px] text-text-secondary">
                {product.brand ?? "Sans marque"} ·{" "}
                {PRODUCT_CATEGORY_LABELS[product.category as ProductCategoryCode]}
                {product.subCategory && ` · ${product.subCategory}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
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
              {!product.isActive && <Badge tone="neutral">Inactif</Badge>}
              <Badge tone="neutral">{product.reference}</Badge>
              {product.ean && <Badge tone="neutral">EAN {product.ean}</Badge>}
            </div>
          </div>
        </div>

        {session.permissions.has(PERMISSIONS.PRODUCT_MANAGE) && (
          <Button asChild variant="outline">
            <Link href={`/stock/nouveau?id=${product.id}`}>Modifier la fiche</Link>
          </Button>
        )}
      </div>

      {status === "OUT_OF_STOCK" && (
        <Alert tone="warning" title="Ce produit n'est plus proposé en conseil">
          Une référence en rupture est écartée par le moteur : Pharma.ai ne propose jamais
          un produit que l&apos;officine ne peut pas délivrer.
        </Alert>
      )}

      <Grid cols={4}>
        <StatCard
          label="Prix de vente"
          value={formatCents(product.salePriceCents)}
          sublabel={`TVA ${product.vatRate} %`}
          icon={<Package className="size-4" />}
        />
        <StatCard
          label="Marge unitaire"
          value={formatCents(marginCents)}
          sublabel={marginRate !== null ? formatPercent(marginRate) : "Non calculable"}
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label="Proposé en conseil"
          value={proposed}
          sublabel={`${purchased} achat(s)`}
          icon={<Sparkles className="size-4" />}
          emphasis="brand"
        />
        <StatCard
          label="CA généré"
          value={formatCents(salesStats._sum.totalCents ?? 0)}
          sublabel={`${salesStats._sum.quantity ?? 0} unité(s) vendue(s) via un conseil`}
          emphasis="accent"
          icon={<Boxes className="size-4" />}
        />
      </Grid>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Informations produit"
              description="Ce que le moteur utilise pour apparier ce produit à une opportunité de conseil."
            />
            <CardContent className="space-y-5">
              {product.description && (
                <div className="space-y-1">
                  <p className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">
                    Description
                  </p>
                  <p className="text-[13.5px] leading-6 text-text-secondary">
                    {product.description}
                  </p>
                </div>
              )}

              <TagList
                label="Allégations commerciales autorisées"
                hint="Seules ces formulations peuvent apparaître sur la fiche patient."
                values={product.commercialClaims}
                tone="brand"
              />
              <TagList
                label="Étiquettes d'appariement"
                hint="Mots-clés utilisés par le moteur pour rapprocher ce produit d'un conseil."
                values={product.matchingTags}
                tone="neutral"
              />
              <TagList
                label="Précautions"
                hint="Affichées au pharmacien et, si pertinent, au patient."
                values={product.precautions}
                tone="warning"
              />
              <TagList
                label="Contre-indications déclarées"
                hint="Écartent automatiquement ce produit pour les patients concernés."
                values={product.contraindications}
                tone="danger"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Mouvements de stock" description="Historique des entrées et sorties." />
            <CardContent className="px-0 pb-0">
              {product.stockMovements.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-text-tertiary">
                  Aucun mouvement enregistré.
                </p>
              ) : (
                <TableWrapper className="rounded-none border-x-0 border-b-0">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Date</TH>
                        <TH>Type</TH>
                        <TH numeric>Variation</TH>
                        <TH numeric>Stock après</TH>
                        <TH>Par</TH>
                        <TH>Motif</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {product.stockMovements.map((movement) => (
                        <TR key={movement.id}>
                          <TD className="text-text-secondary">
                            {formatDateTime(movement.createdAt)}
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
                          <TD className="max-w-[220px] truncate text-text-tertiary">
                            {movement.reason ?? "—"}
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

        <div className="space-y-5">
          <Card>
            <CardHeader title="Stock" description="Disponibilité en officine." />
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular text-text-primary">
                  {quantity}
                </span>
                <span className="text-[13px] text-text-secondary">unité(s) disponibles</span>
              </div>
              <dl className="space-y-3">
                <DataItem label="Seuil d'alerte">{threshold}</DataItem>
                <DataItem label="Emplacement">{product.stockItem?.location ?? "—"}</DataItem>
                <DataItem label="Dernier inventaire">
                  {product.stockItem?.lastCountedAt
                    ? formatDateTime(product.stockItem.lastCountedAt)
                    : "—"}
                </DataItem>
                <DataItem label="Prix d'achat">
                  {formatCents(product.purchasePriceCents)}
                </DataItem>
              </dl>

              {session.permissions.has(PERMISSIONS.STOCK_ADJUST) && (
                <div className="border-t border-border-subtle pt-4">
                  <StockAdjustForm productId={product.id} currentQuantity={quantity} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TagList({
  label,
  hint,
  values,
  tone,
}: {
  label: string;
  hint: string;
  values: string[];
  tone: "brand" | "neutral" | "warning" | "danger";
}) {
  return (
    <div className="space-y-1.5">
      <div className="space-y-0.5">
        <p className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">
          {label}
        </p>
        <p className="text-[12px] text-text-tertiary">{hint}</p>
      </div>
      {values.length === 0 ? (
        <p className="text-[13px] text-text-tertiary">Aucune information renseignée.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <li key={value}>
              <Badge tone={tone}>{value}</Badge>
            </li>
          ))}
        </ul>
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
