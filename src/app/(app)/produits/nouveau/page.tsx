import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProductForm } from "./product-form";

export const metadata: Metadata = { title: "Produit" };

export default async function ProductFormPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.PRODUCT_MANAGE);
  const { id } = await searchParams;

  const product = id
    ? await prisma.product.findUnique({ where: { id }, include: { stockItem: true } })
    : null;

  if (id && (!product || product.pharmacyId !== session.scope.pharmacyId)) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href={product ? `/produits/${product.id}` : "/produits"}>
          {product ? "Retour à la fiche" : "Retour au catalogue"}
        </Link>
      </Button>

      <PageHeader
        title={product ? "Modifier le produit" : "Nouveau produit"}
        description="Les allégations et contre-indications renseignées ici encadrent ce que Pharma.ai peut proposer et afficher au patient."
      />

      <Card>
        <CardContent className="pt-5">
          <ProductForm
            product={
              product
                ? {
                    id: product.id,
                    name: product.name,
                    brand: product.brand,
                    category: product.category,
                    subCategory: product.subCategory,
                    reference: product.reference,
                    ean: product.ean,
                    imageUrl: product.imageUrl,
                    description: product.description,
                    commercialClaims: product.commercialClaims,
                    precautions: product.precautions,
                    matchingTags: product.matchingTags,
                    contraindications: product.contraindications,
                    purchasePriceCents: product.purchasePriceCents,
                    salePriceCents: product.salePriceCents,
                    vatRate: product.vatRate,
                    isActive: product.isActive,
                    quantity: product.stockItem?.quantity ?? 0,
                    alertThreshold: product.stockItem?.alertThreshold ?? 5,
                    location: product.stockItem?.location ?? null,
                  }
                : undefined
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
