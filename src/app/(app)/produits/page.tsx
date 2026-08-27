import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Package, Plus, Upload } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { stockStatus, STOCK_STATUS_LABELS } from "@/server/services/catalog";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PatientSearchBar } from "../patients/search-bar";
import { CategoryFilter } from "./category-filter";
import { computeMargin, formatCents, formatPercent } from "@/lib/format";
import type { ProductCategoryCode } from "@/core/ai/types";

export const metadata: Metadata = { title: "Produits" };

const PAGE_SIZE = 30;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string; page?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.PRODUCT_VIEW);
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const category = params.categorie;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const validCategory =
    category && PRODUCT_CATEGORIES.includes(category as ProductCategoryCode)
      ? (category as ProductCategoryCode)
      : undefined;

  const where = {
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

  const [products, total, categoryCounts] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { stockItem: true },
    }),
    prisma.product.count({ where }),
    prisma.product.groupBy({
      by: ["category"],
      where: { pharmacyId: session.scope.pharmacyId, deletedAt: null },
      _count: true,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canManage = session.permissions.has(PERMISSIONS.PRODUCT_MANAGE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produits"
        description="Le catalogue de conseil de votre officine. Le moteur ne peut proposer que ce qui figure ici."
        actions={
          <div className="flex gap-2">
            {session.permissions.has(PERMISSIONS.PRODUCT_IMPORT) && (
              <Button asChild variant="outline" leadingIcon={<Upload className="size-[18px]" />}>
                <Link href="/produits/import">Importer</Link>
              </Button>
            )}
            {canManage && (
              <Button asChild leadingIcon={<Plus className="size-[18px]" />}>
                <Link href="/produits/nouveau">Nouveau produit</Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PatientSearchBar
            initialQuery={query}
            basePath="/produits"
            placeholder="Rechercher un produit (nom, marque, référence, EAN…)"
          />
          <p className="text-[13px] text-text-tertiary tabular">
            {total} référence{total > 1 ? "s" : ""}
          </p>
        </div>

        <CategoryFilter
          active={validCategory ?? null}
          counts={Object.fromEntries(
            categoryCounts.map((row) => [row.category, row._count]),
          )}
        />
      </div>

      {products.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package className="size-5" />}
            title={query || validCategory ? "Aucun produit trouvé" : "Catalogue vide"}
            description={
              query || validCategory
                ? "Modifiez votre recherche ou choisissez une autre catégorie."
                : "Ajoutez vos premières références pour que Pharma.ai puisse proposer des conseils."
            }
            action={
              canManage ? (
                <Button asChild leadingIcon={<Plus className="size-4" />}>
                  <Link href="/produits/nouveau">Ajouter un produit</Link>
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
                          href={`/produits/${product.id}`}
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
                            <span className="block max-w-[280px] truncate font-medium">
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
                        {product.subCategory && (
                          <span className="block text-[12px] text-text-tertiary">
                            {product.subCategory}
                          </span>
                        )}
                      </TD>
                      <TD className="font-mono text-[12px] text-text-tertiary">
                        {product.reference}
                      </TD>
                      <TD numeric className="font-medium">
                        {formatCents(product.salePriceCents)}
                      </TD>
                      <TD numeric className="text-text-secondary">
                        {formatCents(marginCents)}
                        {marginRate !== null && (
                          <span className="block text-[12px] text-text-tertiary">
                            {formatPercent(marginRate)}
                          </span>
                        )}
                      </TD>
                      <TD numeric>{quantity}</TD>
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
                          {!product.isActive && <Badge tone="neutral">Inactif</Badge>}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>

          {totalPages > 1 && (
            <nav className="flex items-center justify-between" aria-label="Pagination">
              <p className="text-[13px] text-text-tertiary">
                Page {page} sur {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                >
                  <Link
                    href={`/produits?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(validCategory ? { categorie: validCategory } : {}), page: String(page - 1) })}`}
                  >
                    Précédent
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
                >
                  <Link
                    href={`/produits?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(validCategory ? { categorie: validCategory } : {}), page: String(page + 1) })}`}
                  >
                    Suivant
                  </Link>
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
