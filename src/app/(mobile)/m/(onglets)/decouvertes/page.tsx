import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Info, SearchX } from "lucide-react";
import { requireUser } from "@/server/auth/user-session";
import { discoverViewerFor, favoriteKey, loadDiscoverFeed, loadFavorites } from "@/server/services/mobile/discover";
import { loadSponsoredSlot } from "@/server/services/mobile/sponsoring";
import { ScreenTitle, QuietState } from "../../_components/ui";
import { BrandCard, LaunchCard, Rail, SectionHeader, SponsoredHeroCard, TrainingCard, VideoCard } from "./_components/cards";
import { DiscoverSearch, DiscoverSegments, discoverHref } from "./_components/discover-filters";
import { FavoritesView } from "./_components/favorites-view";

export const metadata: Metadata = { title: "Découvertes" };

type SearchParams = Promise<{ q?: string | string[]; univers?: string | string[]; vue?: string | string[] }>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * Découvertes & partenaires : les marques, leurs nouveautés, des vidéos courtes et les formations proposées par les
 * laboratoires. Ouvert aux comptes gratuits ET aux équipes clientes ; chacun voit ce que son public autorise. Tout
 * contenu commercial porte « Partenaire » ou « Sponsorisé ».
 */
export default async function DecouvertesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireUser();
  const params = await searchParams;
  const view = first(params.vue) === "favoris" ? "favoris" : "tout";
  const query = first(params.q).trim().slice(0, 80);
  const universeParam = first(params.univers).trim();
  const viewer = await discoverViewerFor(session);
  const now = new Date();

  if (view === "favoris") {
    const favorites = await loadFavorites({ userId: session.user.id, viewer, scope: session.scope, now });
    return (
      <div className="space-y-5">
        <ScreenTitle title="Découvertes" subtitle="Ce que vous avez mis de côté, pour le retrouver au comptoir." />
        <DiscoverSegments view="favoris" />
        <FavoritesView favorites={favorites} />
      </div>
    );
  }

  const feed = await loadDiscoverFeed({ userId: session.user.id, viewer, scope: session.scope, filters: { query, universe: universeParam || null }, now });
  const universe = feed.universes.some((entry) => entry.key === universeParam) ? universeParam : null;
  const slotViewer = { viewer, profession: session.user.profession, role: session.role };
  const sponsored = universe
    ? await loadSponsoredSlot("DISCOVER_CATEGORY", slotViewer, { now, universe, limit: 1 })
    : query
      ? []
      : await loadSponsoredSlot("DISCOVER_TOP", slotViewer, { now, limit: 2 });
  const filtering = !!query || !!universe;
  const nothing = feed.brands.length === 0 && feed.launches.length === 0 && feed.trainings.length === 0;
  const isFavorite = (type: "BRAND" | "LAUNCH" | "TRAINING", id: string) => feed.favorites.has(favoriteKey(type, id));

  return (
    <div className="space-y-6">
      <ScreenTitle title="Découvertes" subtitle="Les marques partenaires, leurs nouveautés et leurs formations, relues avant publication." />
      <div className="m-rise space-y-4">
        <DiscoverSegments view="tout" />
        <DiscoverSearch query={query} universe={universe} universes={feed.universes} />
      </div>

      {sponsored.length > 0 && (
        <section className="m-rise space-y-3" aria-label="À la une">
          {sponsored.map((card) => (
            <SponsoredHeroCard key={card.campaignId} card={card} />
          ))}
        </section>
      )}

      {nothing ? (
        filtering ? (
          <QuietState
            icon={<SearchX className="size-6" aria-hidden="true" />}
            title="Aucun résultat"
            body={query ? `Rien ne correspond à « ${query} »${universe ? " dans cet univers" : ""}.` : "Rien dans cet univers pour l'instant."}
            action={
              <Link href={discoverHref({})} className="inline-flex min-h-11 items-center rounded-full bg-ink-900 px-5 text-[14px] font-semibold text-white">
                Tout afficher
              </Link>
            }
          />
        ) : (
          <QuietState
            icon={<Compass className="size-6" aria-hidden="true" />}
            title="Les premières marques arrivent"
            body="Les fiches des laboratoires partenaires, leurs lancements et leurs formations apparaîtront ici, une fois relus et validés."
          />
        )
      ) : (
        <>
          {feed.launches.length > 0 && (
            <section className="m-rise space-y-3" style={{ animationDelay: "40ms" }}>
              <SectionHeader title="Nouveautés" subtitle="Lancements et nouvelles gammes" />
              <Rail label="Nouveautés">
                {feed.launches.map((launch) => (
                  <LaunchCard key={launch.id} launch={launch} favorite={isFavorite("LAUNCH", launch.id)} />
                ))}
              </Rail>
            </section>
          )}

          {feed.videos.length > 0 && (
            <section className="m-rise space-y-3" style={{ animationDelay: "80ms" }}>
              <SectionHeader title="Vidéos découverte" subtitle="Quelques secondes pour découvrir un produit" />
              <Rail label="Vidéos découverte">
                {feed.videos.map((launch) => (
                  <VideoCard key={launch.id} launch={launch} />
                ))}
              </Rail>
            </section>
          )}

          {feed.trainings.length > 0 && (
            <section className="m-rise space-y-3" style={{ animationDelay: "120ms" }}>
              <SectionHeader title="Formations des laboratoires" subtitle="Relues par PharmaBoost avant publication" />
              <Rail label="Formations des laboratoires">
                {feed.trainings.map((training) => (
                  <TrainingCard key={training.id} training={training} favorite={isFavorite("TRAINING", training.id)} />
                ))}
              </Rail>
            </section>
          )}

          {feed.brands.length > 0 && (
            <section className="m-rise space-y-3" style={{ animationDelay: "160ms" }}>
              <SectionHeader title="Marques" subtitle={`${feed.brands.length} marque${feed.brands.length > 1 ? "s" : ""} partenaire${feed.brands.length > 1 ? "s" : ""}`} />
              <div className="grid gap-3 sm:grid-cols-2">
                {feed.brands.map((brand) => (
                  <BrandCard key={brand.id} brand={brand} favorite={isFavorite("BRAND", brand.id)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <aside className="flex items-start gap-3 rounded-[20px] bg-white/70 px-4 py-4 text-[12.5px] leading-[1.5] text-text-secondary ring-1 ring-ink-100">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
        <p>
          <strong className="font-semibold text-ink-800">« Partenaire »</strong> : contenu publié par une marque. <strong className="font-semibold text-ink-800">« Sponsorisé »</strong> : mise en avant
          payée par un laboratoire. Ni l&apos;un ni l&apos;autre ne change les conseils proposés par PharmaBoost au comptoir.
        </p>
      </aside>
    </div>
  );
}
