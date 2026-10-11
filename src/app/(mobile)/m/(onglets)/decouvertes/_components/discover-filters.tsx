import Link from "next/link";
import { Heart, LayoutGrid, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** L'adresse de l'onglet avec ces filtres (les vides disparaissent). */
export function discoverHref(params: { q?: string | null; univers?: string | null; vue?: string | null }): string {
  const search = new URLSearchParams();
  if (params.vue) search.set("vue", params.vue);
  if (params.q) search.set("q", params.q);
  if (params.univers) search.set("univers", params.univers);
  const query = search.toString();
  return query ? `/m/decouvertes?${query}` : "/m/decouvertes";
}

/** « Tout » / « Mes favoris » : deux vues de l'onglet, en segment natif. */
export function DiscoverSegments({ view }: { view: "tout" | "favoris" }) {
  const item = (active: boolean) =>
    cn(
      "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
      active ? "bg-white text-ink-900 shadow-[0_2px_10px_-2px_rgb(23_33_38/0.16)]" : "text-ink-600",
    );
  return (
    <nav aria-label="Vues de l'onglet Découvertes" className="flex gap-1 rounded-full bg-ink-100/80 p-1">
      <Link href="/m/decouvertes" aria-current={view === "tout" ? "page" : undefined} className={item(view === "tout")}>
        <LayoutGrid className="size-4" aria-hidden="true" />
        À découvrir
      </Link>
      <Link href={discoverHref({ vue: "favoris" })} aria-current={view === "favoris" ? "page" : undefined} className={item(view === "favoris")}>
        <Heart className="size-4" aria-hidden="true" />
        Mes favoris
      </Link>
    </nav>
  );
}

/** Recherche (formulaire GET : marche sans JavaScript) et univers en pastilles. */
export function DiscoverSearch({ query, universe, universes }: { query: string; universe: string | null; universes: { key: string; label: string }[] }) {
  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-10 shrink-0 snap-start items-center rounded-full px-4 text-[13.5px] font-semibold whitespace-nowrap ring-1 transition-colors ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
      active ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-ink-700 ring-ink-200",
    );
  return (
    <div className="space-y-3">
      <form role="search" action="/m/decouvertes" method="get" className="relative">
        <label htmlFor="decouvertes-recherche" className="sr-only">
          Rechercher une marque, une gamme, un produit, une nouveauté
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-ink-400" aria-hidden="true" />
        <input
          id="decouvertes-recherche"
          name="q"
          type="search"
          defaultValue={query}
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Marque, gamme, produit…"
          className="block h-[52px] w-full rounded-full border border-ink-200 bg-white pr-12 pl-11 text-[16px] text-ink-900 shadow-[0_1px_2px_rgb(23_33_38/0.04)] placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {universe && <input type="hidden" name="univers" value={universe} />}
        {query && (
          <Link href={discoverHref({ univers: universe })} aria-label="Effacer la recherche" className="absolute top-1/2 right-1.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-500">
            <X className="size-[18px]" aria-hidden="true" />
          </Link>
        )}
      </form>
      {universes.length > 0 && (
        <nav aria-label="Univers" className="m-rail -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 lg:-mx-8 lg:px-8">
          <Link href={discoverHref({ q: query })} aria-current={!universe ? "page" : undefined} className={chip(!universe)}>
            Tous
          </Link>
          {universes.map((entry) => (
            <Link key={entry.key} href={discoverHref({ q: query, univers: entry.key })} aria-current={universe === entry.key ? "page" : undefined} className={chip(universe === entry.key)}>
              {entry.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
