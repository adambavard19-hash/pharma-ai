import Link from "next/link";
import { Heart, Package } from "lucide-react";
import type { FavoritesView as Favorites } from "@/server/services/mobile/discover";
import { QuietState } from "../../../_components/ui";
import { BrandCard, LaunchCard, Rail, SectionHeader, TrainingCard } from "./cards";
import { FavoriteButton } from "./favorite-button";

/** « Mes favoris » : marques, nouveautés, formations et produits mis de côté, relus (ce qui a disparu ne s'affiche plus). */
export function FavoritesView({ favorites }: { favorites: Favorites }) {
  const empty = favorites.brands.length + favorites.launches.length + favorites.trainings.length + favorites.products.length === 0;
  if (empty) {
    return (
      <QuietState
        icon={<Heart className="size-6" aria-hidden="true" />}
        title="Aucun favori pour l'instant"
        body="Touchez le cœur d'une marque, d'une nouveauté, d'une formation ou d'un produit pour le retrouver ici."
        action={
          <Link href="/m/decouvertes" className="inline-flex min-h-11 items-center rounded-full bg-ink-900 px-5 text-[14px] font-semibold text-white">
            Parcourir les marques
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-6">
      {favorites.brands.length > 0 && (
        <section className="m-rise space-y-3">
          <SectionHeader title="Marques" />
          <div className="grid gap-3 sm:grid-cols-2">
            {favorites.brands.map((brand) => (
              <BrandCard key={brand.id} brand={brand} favorite />
            ))}
          </div>
        </section>
      )}
      {favorites.launches.length > 0 && (
        <section className="m-rise space-y-3">
          <SectionHeader title="Nouveautés" />
          <Rail label="Nouveautés en favori">
            {favorites.launches.map((launch) => (
              <LaunchCard key={launch.id} launch={launch} favorite />
            ))}
          </Rail>
        </section>
      )}
      {favorites.trainings.length > 0 && (
        <section className="m-rise space-y-3">
          <SectionHeader title="Formations" />
          <Rail label="Formations en favori">
            {favorites.trainings.map((training) => (
              <TrainingCard key={training.id} training={training} favorite />
            ))}
          </Rail>
        </section>
      )}
      {favorites.products.length > 0 && (
        <section className="m-rise space-y-3">
          <SectionHeader title="Produits" />
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-[20px] bg-white shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)]">
            {favorites.products.map((product) => (
              <li key={product.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
                <Link href={`/m/decouvertes/marques/${product.brandSlug}#produit-${product.id}`} className="flex min-h-14 min-w-0 flex-1 items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-50 text-ink-400">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- visuel du partenaire, domaine non connu à l'avance
                      <img src={product.imageUrl} alt="" className="size-full object-contain" loading="lazy" />
                    ) : (
                      <Package className="size-5" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold text-ink-900">{product.name}</span>
                    <span className="block truncate text-[12.5px] text-text-tertiary">{product.brandName}</span>
                  </span>
                </Link>
                <FavoriteButton type="PRODUCT" id={product.id} initial label={product.name} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
