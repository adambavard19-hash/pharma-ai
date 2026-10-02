import type { Metadata } from "next";
import Link from "next/link";
import { CloudOff, Package } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { getConsoleCatalog, listCatalogBrands } from "@/server/services/partners/catalog-admin";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { PublicationBadge } from "../marques/_components/publication-badge";
import { BrandPicker } from "./brand-picker";
import { CatalogManager } from "./catalog-manager";

export const metadata: Metadata = { title: "Catalogues partenaires" };

/**
 * Les produits des marques partenaires, gamme par gamme.
 *
 * Un catalogue central, jamais copié dans les officines. Sans API
 * partenaire, il est saisi ou importé ici ; la synchronisation automatique
 * attend que le partenaire publie la sienne.
 */
export default async function PartnerCatalogsPage({ searchParams }: { searchParams: Promise<{ marque?: string }> }) {
  await requirePlatformSession();
  const { marque } = await searchParams;
  const brands = await listCatalogBrands();
  const brandId = brands.some((brand) => brand.id === marque) ? (marque as string) : (brands[0]?.id ?? null);
  const catalog = brandId ? await getConsoleCatalog(brandId) : null;

  return (
    <>
      <PageHeader title="Catalogues" description="Les produits de chaque marque partenaire, rangés par gamme : nom, codes, conditionnement, prix professionnel et prix public conseillé." />

      <Alert tone="neutral" icon={<CloudOff className="size-[18px]" aria-hidden="true" />} title="Saisie ou import, en attendant l'API du partenaire">
        Sans API partenaire, le catalogue est saisi ou importé ici. La synchronisation automatique (catalogue, disponibilité, prix) attend l&apos;API du partenaire : rien n&apos;est simulé.
      </Alert>

      {brands.length === 0 || !catalog ? (
        <Card>
          <EmptyState
            icon={<Package className="size-5" />}
            title="Aucune marque"
            description="Un catalogue appartient à une marque : créez d'abord la marque et ses gammes."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/partenaires/marques">Marques</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full space-y-1.5 sm:w-auto sm:min-w-[360px]">
              <p className="text-[12.5px] font-medium text-text-secondary">Marque</p>
              <BrandPicker brands={brands} current={catalog.brand.id} basePath="/admin/partenaires/catalogues" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
              <PublicationBadge status={catalog.brand.status} />
              <Link href={`/admin/partenaires/marques/${catalog.brand.id}`} className="font-medium text-text-primary hover:underline">
                Fiche {catalog.brand.name}
              </Link>
              <span>· {catalog.brand.partner.name}</span>
            </div>
          </div>
          {catalog.ranges.length === 0 && (
            <Alert tone="info" title="Aucune gamme">
              Les produits peuvent rester « sans gamme », mais l&apos;import par colonne « gamme » demande que les gammes existent : créez-les dans la{" "}
              <Link href={`/admin/partenaires/marques/${catalog.brand.id}`} className="font-medium text-text-primary underline">
                fiche marque
              </Link>
              .
            </Alert>
          )}
          <CatalogManager key={catalog.brand.id} brandId={catalog.brand.id} ranges={catalog.ranges} products={catalog.products} />
        </>
      )}
    </>
  );
}
