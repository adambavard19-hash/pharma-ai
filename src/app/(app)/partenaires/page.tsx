import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Handshake } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { partnerCatalog, type CatalogBrand } from "@/server/services/partners/pharmacy-partners";
import { universeLabel } from "@/config/universes";
import { PageHeader, SectionHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "./_components/brand-logo";
import { PreferenceActions } from "./_components/preference-actions";

export const metadata: Metadata = { title: "Gammes partenaires" };

/**
 * Les gammes que des laboratoires partenaires de PharmaBoost proposent à
 * l'officine.
 *
 * Elles sont à part du conseil : le moteur ne les lit pas, elles ne font
 * entrer aucun produit dans une proposition. Ce que l'officine voit se décide
 * dans `brandsForPharmacy` (statut, audience, groupe pilote, choix de
 * l'officine). Le titulaire peut masquer une marque (absente du comptoir,
 * toujours consultable ici) ou la refuser (absente partout) ; rien n'est
 * définitif. Sans marque proposée, la page le dit simplement.
 */
export default async function PartnersPage() {
  const session = await requirePermission(PERMISSIONS.PARTNERS_VIEW);
  const canManage = session.permissions.has(PERMISSIONS.PARTNERS_MANAGE);
  const catalog = await partnerCatalog(session.scope);
  const nothingOffered = catalog.visibleCount === 0 && catalog.hidden.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gammes partenaires"
        description="Présentation, conditions professionnelles, documentation et contact des laboratoires partenaires qui proposent leurs gammes à votre officine."
      />

      <Alert tone="info">
        Gammes proposées par des laboratoires partenaires de PharmaBoost. Elles ne modifient jamais les conseils du moteur : elles apparaissent à part, signalées comme telles.
      </Alert>

      {nothingOffered ? (
        <Card>
          <EmptyState icon={<Handshake className="size-5" />} title="Aucune gamme partenaire n'est disponible pour votre officine pour l'instant." />
        </Card>
      ) : (
        catalog.groups.map((group) => (
          <section key={group.key} className="space-y-3" aria-labelledby={`univers-${group.key}`}>
            <SectionHeader title={group.label} description={`${group.brands.length} marque${group.brands.length > 1 ? "s" : ""}`} />
            <ul id={`univers-${group.key}`} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.brands.map((brand) => (
                <li key={brand.id}>
                  <BrandCard brand={brand} canManage={canManage} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {catalog.hidden.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            title="Masquées au comptoir"
            description="Elles n'apparaissent plus en carte au comptoir. Vous pouvez toujours les consulter ici."
          />
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {catalog.hidden.map((brand) => (
              <li key={brand.id}>
                <BrandCard brand={brand} canManage={canManage} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {catalog.refused.length > 0 && (
        <Card>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-[14px] font-medium text-text-primary">
              <ChevronRight className="size-4 shrink-0 text-text-tertiary transition-transform group-open:rotate-90" />
              Refusées
              <span className="text-text-tertiary tabular">{catalog.refused.length}</span>
            </summary>
            <div className="border-t border-border-subtle">
              <p className="px-5 pt-3 text-[12.5px] text-text-tertiary">
                Ces marques n&apos;apparaissent ni au comptoir ni dans les gammes partenaires de votre officine.
              </p>
              <ul className="divide-y divide-border-subtle">
                {catalog.refused.map((brand) => (
                  <li key={brand.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <BrandLogo name={brand.name} logoUrl={brand.logoUrl} />
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-text-primary">{brand.name}</p>
                        <p className="truncate text-[12.5px] text-text-tertiary">{brand.partnerName}</p>
                      </div>
                    </div>
                    {canManage && <PreferenceActions brandId={brand.id} brandName={brand.name} preference="REFUSED" />}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </Card>
      )}
    </div>
  );
}

function BrandCard({ brand, canManage }: { brand: CatalogBrand; canManage: boolean }) {
  return (
    <Card className="flex h-full flex-col transition-[border-color,box-shadow] hover:border-border-default hover:shadow-md">
      <Link
        href={`/partenaires/${brand.slug}?from=catalogue`}
        className="group flex flex-1 flex-col gap-3 rounded-xl p-4 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none"
      >
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo name={brand.name} logoUrl={brand.logoUrl} />
          <div className="min-w-0">
            <h3 className="truncate text-[15px] leading-5 font-semibold text-text-primary group-hover:text-brand-700">{brand.name}</h3>
            <p className="truncate text-[12.5px] text-text-tertiary">{brand.partnerName}</p>
          </div>
        </div>
        {brand.description && <p className="line-clamp-2 text-[13px] leading-5 text-text-secondary">{brand.description}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          {brand.preference === "HIDDEN" && <Badge tone="neutral">Masquée au comptoir</Badge>}
          {brand.universes.map((key) => (
            <Badge key={key} tone="brand">
              {universeLabel(key)}
            </Badge>
          ))}
        </div>
      </Link>
      {canManage && (
        <div className="border-t border-border-subtle px-2 py-1.5">
          <PreferenceActions brandId={brand.id} brandName={brand.name} preference={brand.preference} />
        </div>
      )}
    </Card>
  );
}
