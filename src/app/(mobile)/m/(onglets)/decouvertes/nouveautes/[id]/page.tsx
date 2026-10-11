import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Package, ShieldCheck } from "lucide-react";
import { requireUser } from "@/server/auth/user-session";
import { discoverViewerFor, favoriteKey, favoriteKeysOf, loadLaunchDetail } from "@/server/services/mobile/discover";
import { campaignForDetail } from "@/server/services/mobile/sponsoring";
import { REGULATORY_CATEGORY_LABELS } from "@/core/discover/visibility";
import { PROFESSION_LABELS } from "@/core/mobile/profile";
import { formatDateLong } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BrandLogo, CommercialBadge } from "../../_components/cards";
import { FavoriteButton } from "../../_components/favorite-button";
import { InfoRequestSheet } from "../../_components/info-request-sheet";
import { SponsoredDetailView } from "../../_components/sponsored-tracker";

export const metadata: Metadata = { title: "Nouveauté" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ c?: string; p?: string }>;

/** Une nouveauté de marque : média (image ou vidéo courte), texte, mentions réglementaires, produits concernés. */
export default async function LaunchPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const session = await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await discoverViewerFor(session);
  const launch = await loadLaunchDetail({ viewer, id });
  if (!launch) notFound();
  const [favorites, campaign] = await Promise.all([favoriteKeysOf(session.user.id), campaignForDetail(query.c, query.p, { launchId: launch.id })]);
  const vertical = launch.orientation === "VERTICAL";

  return (
    <div className="space-y-5">
      {campaign && <SponsoredDetailView campaignId={campaign.campaignId} placement={campaign.placement} />}
      <Link href="/m/decouvertes" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[14px] font-semibold text-brand-700">
        <ChevronLeft className="size-5" aria-hidden="true" />
        Découvertes
      </Link>

      <article className="m-rise space-y-5">
        <div className={cn("relative overflow-hidden rounded-[24px] bg-ink-950 shadow-[0_14px_40px_-16px_oklch(0.3_0.05_183/0.55)]", vertical ? "mx-auto aspect-[9/16] max-h-[72dvh] max-w-[420px]" : "aspect-video")}>
          {launch.mediaKind === "embed" && launch.embedUrl ? (
            <iframe
              src={launch.embedUrl}
              title={`Vidéo : ${launch.title}`}
              className="absolute inset-0 size-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-presentation"
            />
          ) : launch.mediaKind === "video" && launch.mediaUrl ? (
            <video src={launch.mediaUrl} poster={launch.posterUrl ?? undefined} controls playsInline preload="metadata" className="absolute inset-0 size-full object-contain">
              <track kind="captions" />
            </video>
          ) : launch.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- visuel fourni par le partenaire, domaine non connu à l'avance
            <img src={launch.posterUrl} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-[linear-gradient(140deg,oklch(0.44_0.075_188)_0%,oklch(0.58_0.105_162)_100%)]" />
          )}
        </div>

        <header className="space-y-3 px-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CommercialBadge kind="Partenaire" />
            {campaign && <CommercialBadge kind="Sponsorisé" />}
            {launch.universeLabel && <span className="rounded-full bg-ink-50 px-2.5 py-1 text-[11.5px] font-medium text-ink-700">{launch.universeLabel}</span>}
          </div>
          <h1 className="text-[25px] leading-[1.15] font-bold tracking-[-0.03em] text-ink-950">{launch.title}</h1>
          {launch.summary && <p className="text-[15px] leading-[1.55] text-text-secondary">{launch.summary}</p>}
        </header>

        <Link href={`/m/decouvertes/marques/${launch.brandSlug}`} className="flex min-h-16 items-center gap-3 rounded-[20px] bg-white px-4 py-3 shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)]">
          <BrandLogo name={launch.brandName} logoUrl={launch.brandLogoUrl} size={44} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-ink-900">{launch.brandName}</span>
            <span className="block truncate text-[12.5px] text-text-tertiary">{launch.partnerName}</span>
          </span>
          <ChevronRight className="size-5 text-ink-400" aria-hidden="true" />
        </Link>

        <div className="flex items-center gap-2">
          <InfoRequestSheet
            brand={{ id: launch.brandId, name: launch.brandName, partnerName: launch.partnerName }}
            person={{ fullName: session.user.fullName, email: session.user.email, professionLabel: session.user.profession ? PROFESSION_LABELS[session.user.profession] : null }}
            pharmacyNameAvailable={session.activePharmacy?.name ?? session.user.declaredPharmacyName}
            launchId={launch.id}
            campaign={campaign ? { campaignId: campaign.campaignId, placement: campaign.placement } : null}
            triggerClassName="min-w-0 flex-1 sm:flex-none"
          />
          <FavoriteButton type="LAUNCH" id={launch.id} initial={favorites.has(favoriteKey("LAUNCH", launch.id))} label={launch.title} bordered />
        </div>

        <div className="space-y-3 px-1 text-[15px] leading-[1.65] whitespace-pre-line text-ink-800">{launch.body}</div>

        {launch.products.length > 0 && (
          <section className="space-y-3">
            <h2 className="px-1 text-[17px] font-bold tracking-[-0.02em] text-ink-900">Produits concernés</h2>
            <ul className="divide-y divide-ink-100 overflow-hidden rounded-[20px] bg-white shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)]">
              {launch.products.map((product) => (
                <li key={product.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
                  <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-50 text-ink-400">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- visuel du partenaire, domaine non connu à l'avance
                      <img src={product.imageUrl} alt="" className="size-full object-contain" loading="lazy" />
                    ) : (
                      <Package className="size-5" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-[14.5px] font-semibold text-ink-900">{product.name}</span>
                  <FavoriteButton type="PRODUCT" id={product.id} initial={favorites.has(favoriteKey("PRODUCT", product.id))} label={product.name} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="space-y-2 rounded-[20px] bg-white/70 px-4 py-4 text-[12.5px] leading-[1.5] text-text-secondary ring-1 ring-ink-100">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
            <span>
              {REGULATORY_CATEGORY_LABELS[launch.regulatoryCategory]} · information fournie par {launch.partnerName}
              {launch.regulatoryValidatedAt ? `, vérifiée par PharmaBoost le ${formatDateLong(launch.regulatoryValidatedAt)}` : ""}.
            </span>
          </p>
          {launch.regulatoryMentions && <p className="whitespace-pre-line text-ink-700">{launch.regulatoryMentions}</p>}
          {campaign && <p>Contenu sponsorisé par {campaign.partnerName}. Il ne modifie pas les conseils proposés au comptoir.</p>}
        </footer>
      </article>
    </div>
  );
}
