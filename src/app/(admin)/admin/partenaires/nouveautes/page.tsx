import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { prisma } from "@/server/db/client";
import { listLaunchesAdmin } from "@/server/services/mobile/sponsoring-admin";
import { LaunchesManager } from "./launches-manager";

export const metadata: Metadata = { title: "Nouveautés partenaires" };

/**
 * Les nouveautés des marques montrées dans l'onglet Découvertes de PharmaBoost Mobile (et en accueil). Rien n'est en
 * ligne sans validation réglementaire (nom + date) puis publication.
 */
export default async function LaunchesAdminPage() {
  await requirePlatformSession();
  const [launches, brands] = await Promise.all([
    listLaunchesAdmin(),
    prisma.partnerBrand.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, partner: { select: { name: true } } } }),
  ]);
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-bold tracking-[-0.02em] text-text-primary">Nouveautés</h1>
        <p className="max-w-2xl text-[14px] text-text-secondary">Lancements et informations des marques, affichés « Partenaire » dans l&apos;application mobile après validation réglementaire et publication.</p>
      </div>
      <LaunchesManager
        brands={brands.map((brand) => ({ id: brand.id, name: brand.name, partnerName: brand.partner.name }))}
        launches={launches.map((launch) => ({
          id: launch.id,
          title: launch.title,
          summary: launch.summary,
          body: launch.body,
          mediaUrl: launch.mediaUrl,
          posterUrl: launch.posterUrl,
          orientation: launch.orientation,
          productCodes: launch.productCodes,
          universe: launch.universe,
          regulatoryCategory: launch.regulatoryCategory,
          regulatoryMentions: launch.regulatoryMentions,
          regulatoryValidatedBy: launch.regulatoryValidatedBy,
          regulatoryValidatedAt: launch.regulatoryValidatedAt?.toISOString() ?? null,
          reviewStatus: launch.reviewStatus,
          publishedAt: launch.publishedAt?.toISOString() ?? null,
          endsAt: launch.endsAt?.toISOString() ?? null,
          partnerName: launch.partner.name,
          brand: { id: launch.brand.id, name: launch.brand.name },
          infoRequests: launch.infoRequests,
        }))}
      />
    </div>
  );
}
