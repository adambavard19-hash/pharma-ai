import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listConsoleOffers, listOfferTargets } from "@/server/services/partners/offers";
import { listCatalogBrands } from "@/server/services/partners/catalog-admin";
import { reachPharmacies } from "@/server/services/partners/brands";
import { PageHeader } from "@/components/ui/page";
import { BrandPicker } from "../catalogues/brand-picker";
import { OffersManager } from "./offers-manager";

export const metadata: Metadata = { title: "Offres partenaires" };

/**
 * Les conditions professionnelles proposées aux officines par les
 * partenaires : remise, minimum de commande, période. Même cycle que les
 * marques (brouillon, test auprès du pilote, publication), et visibles
 * seulement par les officines qui voient la marque.
 */
export default async function PartnerOffersPage({ searchParams }: { searchParams: Promise<{ marque?: string }> }) {
  await requirePlatformSession();
  const { marque } = await searchParams;
  const [brands, targets, pharmacies] = await Promise.all([listCatalogBrands(), listOfferTargets(), reachPharmacies()]);
  const brandId = brands.some((brand) => brand.id === marque) ? (marque as string) : null;
  const offers = await listConsoleOffers({ brandId });

  return (
    <>
      <PageHeader title="Offres" description="Les conditions professionnelles négociées avec les partenaires. Une offre publiée n'est vue que par les officines qui voient sa marque." />
      {brands.length > 0 && (
        <div className="w-full space-y-1.5 sm:w-auto sm:max-w-md">
          <p className="text-[12.5px] font-medium text-text-secondary">Marque</p>
          <BrandPicker brands={brands.map((brand) => ({ id: brand.id, name: brand.name, partnerName: brand.partnerName, status: brand.status }))} current={brandId} basePath="/admin/partenaires/offres" allLabel="Toutes les marques" />
        </div>
      )}
      <OffersManager
        key={brandId ?? "toutes"}
        offers={offers}
        targets={targets}
        defaultBrandId={brandId}
        pilotCount={pharmacies.filter((pharmacy) => pharmacy.partnerPilot).length}
      />
    </>
  );
}
