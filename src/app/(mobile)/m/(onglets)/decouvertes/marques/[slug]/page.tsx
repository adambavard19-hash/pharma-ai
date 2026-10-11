import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, Package } from "lucide-react";
import { requireUser } from "@/server/auth/user-session";
import { discoverViewerFor, favoriteKey, favoriteKeysOf, loadBrandPage } from "@/server/services/mobile/discover";
import { campaignForDetail } from "@/server/services/mobile/sponsoring";
import { PROFESSION_LABELS } from "@/core/mobile/profile";
import { BrandLogo, CommercialBadge, LaunchCard, Rail, SectionHeader, TrainingCard } from "../../_components/cards";
import { FavoriteButton } from "../../_components/favorite-button";
import { InfoRequestSheet } from "../../_components/info-request-sheet";
import { SponsoredDetailView } from "../../_components/sponsored-tracker";

export const metadata: Metadata = { title: "Marque" };

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ c?: string; p?: string }>;

/** La fiche d'une marque : présentation, gammes et produits, nouveautés, formations, et « Demander des informations ». */
export default async function BrandPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const session = await requireUser();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const viewer = await discoverViewerFor(session);
  const brand = await loadBrandPage({ viewer, scope: session.scope, slug });
  if (!brand) notFound();
  const [favorites, campaign] = await Promise.all([favoriteKeysOf(session.user.id), campaignForDetail(query.c, query.p, { brandId: brand.id })]);
  const isFavorite = (type: "BRAND" | "LAUNCH" | "TRAINING" | "PRODUCT", id: string) => favorites.has(favoriteKey(type, id));
  const products = [...brand.ranges.flatMap((range) => range.products), ...brand.otherProducts];

  return (
    <div className="space-y-6">
      {campaign && <SponsoredDetailView campaignId={campaign.campaignId} placement={campaign.placement} />}
      <Link href="/m/decouvertes" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[14px] font-semibold text-brand-700">
        <ChevronLeft className="size-5" aria-hidden="true" />
        Découvertes
      </Link>

      <header className="m-rise relative overflow-hidden rounded-[24px] bg-white p-5 shadow-[0_10px_36px_-14px_oklch(0.45_0.07_183/0.3)] sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-brand-100/70 blur-3xl" />
        <div className="relative space-y-4">
          <div className="flex items-start gap-4">
            <BrandLogo name={brand.name} logoUrl={brand.logoUrl} size={72} className="rounded-[20px] shadow-sm" />
            <div className="min-w-0 flex-1 space-y-1.5 pt-1">
              <div className="flex flex-wrap gap-1.5">
                <CommercialBadge kind="Partenaire" />
                {campaign && <CommercialBadge kind="Sponsorisé" />}
              </div>
              <h1 className="text-[26px] leading-[1.1] font-bold tracking-[-0.03em] text-ink-950">{brand.name}</h1>
              <p className="text-[13.5px] text-text-tertiary">{brand.partnerName}</p>
            </div>
          </div>
          {brand.description && <p className="text-[14.5px] leading-[1.6] text-text-secondary">{brand.description}</p>}
          {brand.universeLabels.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Univers">
              {brand.universeLabels.map((label) => (
                <li key={label} className="rounded-full bg-ink-50 px-2.5 py-1 text-[12px] font-medium text-ink-700">
                  {label}
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2 pt-1">
            <InfoRequestSheet
              brand={{ id: brand.id, name: brand.name, partnerName: brand.partnerName }}
              person={{ fullName: session.user.fullName, email: session.user.email, professionLabel: session.user.profession ? PROFESSION_LABELS[session.user.profession] : null }}
              pharmacyNameAvailable={session.activePharmacy?.name ?? session.user.declaredPharmacyName}
              campaign={campaign ? { campaignId: campaign.campaignId, placement: campaign.placement } : null}
              triggerClassName="min-w-0 flex-1 sm:flex-none"
            />
            <FavoriteButton type="BRAND" id={brand.id} initial={isFavorite("BRAND", brand.id)} label={brand.name} bordered />
          </div>
          {brand.website && (
            <a href={brand.website} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-semibold text-brand-700">
              Site du laboratoire
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
          {campaign && <p className="text-[12px] text-text-tertiary">Contenu sponsorisé par {campaign.partnerName}.</p>}
        </div>
      </header>

      {brand.launches.length > 0 && (
        <section className="m-rise space-y-3" style={{ animationDelay: "60ms" }}>
          <SectionHeader title="Nouveautés" />
          <Rail label={`Nouveautés ${brand.name}`}>
            {brand.launches.map((launch) => (
              <LaunchCard key={launch.id} launch={launch} favorite={isFavorite("LAUNCH", launch.id)} />
            ))}
          </Rail>
        </section>
      )}

      <section className="m-rise space-y-3" style={{ animationDelay: "100ms" }}>
        <SectionHeader title="Gammes et produits" subtitle={products.length > 0 ? `${brand.rangeCount} gamme${brand.rangeCount > 1 ? "s" : ""} · ${products.length} produit${products.length > 1 ? "s" : ""}` : undefined} />
        {brand.ranges.length === 0 && brand.otherProducts.length === 0 ? (
          <p className="rounded-[20px] border border-dashed border-brand-200 bg-white/60 px-4 py-5 text-[13.5px] text-text-secondary">Le catalogue de cette marque n&apos;est pas encore publié.</p>
        ) : (
          <div className="space-y-3">
            {[...brand.ranges, ...(brand.otherProducts.length ? [{ id: "autres", name: "Autres produits", description: null, universeLabel: null, products: brand.otherProducts }] : [])].map((range, index) => (
              <details key={range.id} open={index === 0} className="group overflow-hidden rounded-[20px] bg-white shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)]">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink-900">{range.name}</span>
                    <span className="block text-[12.5px] text-text-tertiary">
                      {[range.universeLabel, `${range.products.length} produit${range.products.length > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <ChevronLeft className="size-5 -rotate-90 text-ink-400 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                {range.description && <p className="px-4 pb-2 text-[13px] leading-[1.5] text-text-secondary">{range.description}</p>}
                <ul className="divide-y divide-ink-100 border-t border-ink-100">
                  {range.products.map((product) => (
                    <li key={product.id} id={`produit-${product.id}`} className="flex scroll-mt-24 items-center gap-3 py-2 pr-2 pl-4">
                      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-50 text-ink-400">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- visuel du partenaire, domaine non connu à l'avance
                          <img src={product.imageUrl} alt="" className="size-full object-contain" loading="lazy" />
                        ) : (
                          <Package className="size-5" aria-hidden="true" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 py-1">
                        <span className="block text-[14.5px] font-semibold text-ink-900">{product.name}</span>
                        {(product.packaging || product.description) && <span className="line-clamp-2 block text-[12.5px] text-text-tertiary">{[product.packaging, product.description].filter(Boolean).join(" · ")}</span>}
                      </span>
                      <FavoriteButton type="PRODUCT" id={product.id} initial={isFavorite("PRODUCT", product.id)} label={product.name} />
                    </li>
                  ))}
                  {range.products.length === 0 && <li className="px-4 py-3 text-[13px] text-text-tertiary">Aucun produit publié dans cette gamme.</li>}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>

      {brand.trainings.length > 0 && (
        <section className="m-rise space-y-3" style={{ animationDelay: "140ms" }}>
          <SectionHeader title="Formations du laboratoire" subtitle="Relues par PharmaBoost avant publication" />
          <Rail label={`Formations ${brand.partnerName}`}>
            {brand.trainings.map((training) => (
              <TrainingCard key={training.id} training={training} favorite={isFavorite("TRAINING", training.id)} />
            ))}
          </Rail>
        </section>
      )}

      <p className="px-1 text-[12px] leading-[1.5] text-text-tertiary">
        Informations fournies par {brand.partnerName}. PharmaBoost les relit avant publication ; elles ne modifient pas les conseils proposés au comptoir.
      </p>
    </div>
  );
}
