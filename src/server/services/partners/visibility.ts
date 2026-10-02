import "server-only";
import { prisma } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant";
import { brandVisibility, itemVisible, type Visibility } from "@/core/partners/visibility";
import type { CounterBrand } from "@/core/partners/counter-card";

/**
 * Les marques partenaires que CETTE officine peut voir.
 *
 * Une seule fiche centrale par marque, jamais copiée : la diffusion se lit à
 * chaque fois depuis la plateforme et se décide dans `brandVisibility` (statut
 * du partenaire et de la marque, audience, groupe pilote, choix de l'officine).
 * Le périmètre vient toujours de la session : une officine ne lit jamais la
 * sélection ni les préférences d'une autre.
 */

export type VisibleBrand = {
  id: string;
  slug: string;
  name: string;
  brandKey: string;
  logoUrl: string | null;
  description: string | null;
  universes: string[];
  partner: { id: string; name: string; slug: string; logoUrl: string | null };
  /** Univers des gammes publiées pour cette officine. */
  rangeUniverses: string[];
  visibility: Visibility;
  preference: "HIDDEN" | "REFUSED" | null;
};

export async function isPartnerPilot(pharmacyId: string): Promise<boolean> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { partnerPilot: true } });
  return pharmacy?.partnerPilot ?? false;
}

/**
 * Toutes les marques publiées, avec leur visibilité pour l'officine. Les
 * marques refusées restent dans la liste (pour pouvoir revenir sur le refus),
 * signalées par `visibility.catalog === false` et `preference === "REFUSED"`.
 */
export async function brandsForPharmacy(scope: Pick<TenantScope, "pharmacyId">): Promise<VisibleBrand[]> {
  const pilot = await isPartnerPilot(scope.pharmacyId);
  const brands = await prisma.partnerBrand.findMany({
    where: { status: { in: ["TEST", "ACTIVE"] }, partner: { status: { in: ["TEST", "ACTIVE"] } } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      brandKey: true,
      logoUrl: true,
      description: true,
      universes: true,
      status: true,
      audience: true,
      partner: { select: { id: true, name: true, slug: true, logoUrl: true, status: true } },
      ranges: { select: { universe: true, status: true } },
      audiences: { where: { pharmacyId: scope.pharmacyId }, select: { id: true } },
      preferences: { where: { pharmacyId: scope.pharmacyId }, select: { choice: true } },
    },
  });
  return brands.map((brand) => {
    const preference = brand.preferences[0]?.choice ?? null;
    const visibility = brandVisibility({
      partnerStatus: brand.partner.status,
      brandStatus: brand.status,
      audience: brand.audience,
      selected: brand.audiences.length > 0,
      pilot,
      preference,
    });
    const rangeUniverses = brand.ranges.filter((range) => range.universe && itemVisible(range.status, pilot)).map((range) => range.universe as string);
    return {
      id: brand.id,
      slug: brand.slug,
      name: brand.name,
      brandKey: brand.brandKey,
      logoUrl: brand.logoUrl,
      description: brand.description,
      universes: brand.universes,
      partner: { id: brand.partner.id, name: brand.partner.name, slug: brand.partner.slug, logoUrl: brand.partner.logoUrl },
      rangeUniverses,
      visibility,
      preference,
    };
  });
}

/** Les marques qui peuvent apparaître en carte « À découvrir » au comptoir de cette officine. */
export async function counterBrandsFor(scope: Pick<TenantScope, "pharmacyId">): Promise<CounterBrand[]> {
  const brands = await brandsForPharmacy(scope);
  return brands
    .filter((brand) => brand.visibility.counter)
    .map((brand) => ({
      brandId: brand.id,
      slug: brand.slug,
      name: brand.name,
      brandKey: brand.brandKey,
      partnerName: brand.partner.name,
      logoUrl: brand.logoUrl ?? brand.partner.logoUrl,
      universes: [...new Set([...brand.universes, ...brand.rangeUniverses])],
    }));
}

/** Une marque visible au catalogue de cette officine, par son slug ; null sinon (inexistante, non diffusée, refusée). */
export async function visibleBrandBySlug(scope: Pick<TenantScope, "pharmacyId">, slug: string): Promise<VisibleBrand | null> {
  const brands = await brandsForPharmacy(scope);
  return brands.find((brand) => brand.slug === slug && brand.visibility.catalog) ?? null;
}
