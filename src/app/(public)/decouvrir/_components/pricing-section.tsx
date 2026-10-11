import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { HAIRLINE, SectionHead } from "./site-shell";
import { RevenueCalculator } from "./revenue-calculator";
import { VideoButton } from "./video-dialog";
import { formatPriceEuros, referrerPriceCents, type PublicPricing } from "@/core/pricing/official-offer";
import { cn } from "@/lib/utils";

/** Ce que comprend la mise en service : écrit ici, une fois, pour que le visiteur voie ce qu'il paie. */
export const SETUP_INCLUDES = [
  "Installation et configuration de PharmaBoost sur tous les postes de comptoir",
  "Paramétrage de l'officine et import du stock",
  "Tests de fonctionnement",
  "Formation de l'équipe",
];

/** Ce que paie l'abonnement, mois après mois : tout ceci existe dans l'application, pour chaque officine. */
const SUBSCRIPTION_INCLUDES = [
  "Tous vos postes de comptoir",
  "Les mises à jour automatiques des postes",
  "La bibliothèque de conseils commune",
  "Le support, depuis PharmaBoost",
];

/**
 * La section tarif : le simulateur de chiffre d'affaires d'abord (encadré, en
 * grand : ce que PharmaBoost rapporte, précédé du film qui fait le calcul à voix
 * haute), puis l'abonnement, plus discret — un seul
 * abonnement, engagement de 12 mois, une mise en service unique (et ce qu'elle
 * comprend) et le parrainage. Tous les montants viennent de `PublicPricing` (la console, ou
 * l'offre officielle) : aucun n'est écrit dans la page.
 */
export function PricingSection({ pricing }: { pricing: PublicPricing }) {
  const { monthlyPriceCents, setupFeeCents, commitmentMonths, referralDiscountPercent } = pricing;
  const referrerPrice = referrerPriceCents(monthlyPriceCents, referralDiscountPercent);

  return (
    <section id="tarif" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 md:py-28">
      <SectionHead kicker="Tarif" title="Un seul abonnement. Tout est inclus." center>
        Un abonnement par officine, quel que soit le nombre de postes de comptoir.
      </SectionHead>

      {/* Le mot de réassurance : la promesse d'abord, la précision ensuite, plus discrète. */}
      <div className="mx-auto mt-10 max-w-3xl text-center">
        <div className={cn("mx-auto mb-5 h-px w-16", HAIRLINE)} aria-hidden="true" />
        <p className="text-[20px] leading-[1.35] font-semibold tracking-[-0.015em] text-text-primary text-balance md:text-[26px]">
          Rassurez-vous, l’objectif est simple : que PharmaBoost vous rapporte bien plus qu’il ne vous coûte.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-6 text-text-tertiary text-balance md:text-[14.5px]">
          Plus de conseils pertinents, plus d’opportunités au comptoir, sans changer vos habitudes.
        </p>
        {/* Le film du calcul, au-dessus du simulateur : il finit sur « juste en dessous ». */}
        <div className="mt-6 flex justify-center">
          <VideoButton film="tarif" label="Voir le calcul en vidéo" />
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-5xl items-stretch gap-5 lg:grid-cols-[1.22fr_1fr]">
        <RevenueCalculator monthlyPriceCents={monthlyPriceCents} />

        {/* ---- L'abonnement ---- */}
        <article className="relative flex flex-col rounded-[28px] border border-border-subtle bg-surface-card p-7 sm:p-8" aria-labelledby="abonnement-titre">
          <h3 id="abonnement-titre" className="font-mono text-[12px] tracking-[0.14em] text-text-tertiary uppercase">{pricing.name}</h3>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-[34px] leading-none font-semibold tracking-[-0.03em] text-text-primary tabular">{formatPriceEuros(monthlyPriceCents)}</span>
            <span className="text-[14.5px] text-text-secondary">HT / mois</span>
          </p>
          <p className="mt-2 text-[14px] font-medium text-brand-700">Engagement de {commitmentMonths} mois</p>

          <div className="mt-6 rounded-2xl border border-border-subtle bg-surface-app px-5 py-4">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-[15px] font-semibold text-text-primary">Mise en service clé en main</span>
              <span className="text-[15px] font-semibold text-text-primary tabular">{formatPriceEuros(setupFeeCents)} HT, une seule fois</span>
            </p>
            <ul className="mt-3 space-y-2 text-[14px] leading-5 text-text-secondary">
              {SETUP_INCLUDES.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-600" strokeWidth={3} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Le parrainage : ce que ça change sur la facture mensuelle, chiffré. */}
          <div className="mt-4 rounded-2xl bg-brand-50 px-5 py-4">
            <p className="text-[15px] font-semibold text-brand-900">Parrainez un confrère : {referralDiscountPercent} % de moins par mois</p>
            <p className="mt-1 text-[13.5px] leading-5 text-brand-900/85">
              Au moment de votre inscription, indiquez la personne que vous parrainez. Dès qu&apos;elle s&apos;abonne, vous ne payez plus {formatPriceEuros(monthlyPriceCents)} mais {formatPriceEuros(referrerPrice)} HT par mois.
            </p>
          </div>

          <div className="mt-6">
            <p className="text-[14px] font-semibold text-text-primary">Compris dans l&apos;abonnement</p>
            <ul className="mt-2.5 space-y-2 text-[14px] leading-5 text-text-secondary">
              {SUBSCRIPTION_INCLUDES.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-600" strokeWidth={3} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-7">
            <Link href="/decouvrir/abonnement" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-brand-700">
              S&apos;abonner <ArrowRight className="size-4" />
            </Link>
            <Link href="/decouvrir/demo" className="inline-flex h-12 items-center justify-center rounded-full border border-border-default px-6 text-[15px] font-semibold text-text-primary transition-colors hover:border-brand-400">
              Réserver une démo
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
