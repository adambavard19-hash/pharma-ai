import type { Metadata } from "next";
import { SubscriptionForm } from "../_components/subscription-form";
import { SETUP_INCLUDES } from "../_components/pricing-section";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { normalizeReferralCode } from "@/core/billing/referral";
import { formatPriceEuros, referrerPriceCents } from "@/core/pricing/official-offer";

export const metadata: Metadata = { title: "S'abonner", description: "Souscription en ligne : vos informations une seule fois, votre contrat à signer électroniquement." };

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ parrain?: string }> }) {
  const [pricing, params] = await Promise.all([loadPublicPricing(), searchParams]);
  const referralCode = normalizeReferralCode(params.parrain) ?? "";
  const { monthlyPriceCents, setupFeeCents, commitmentMonths, referralDiscountPercent } = pricing;

  // Ce que le visiteur souscrit, dit une fois, avec les mêmes montants que la page des tarifs.
  const offer = {
    name: pricing.name,
    price: `${formatPriceEuros(monthlyPriceCents)} HT / mois`,
    perks: [`Engagement de ${commitmentMonths} mois`, `Mise en service clé en main : ${formatPriceEuros(setupFeeCents)} HT, une seule fois`, ...SETUP_INCLUDES, "Contrat signé en ligne"],
  };
  const referral = { percent: referralDiscountPercent, fullPrice: formatPriceEuros(monthlyPriceCents), reducedPrice: formatPriceEuros(referrerPriceCents(monthlyPriceCents, referralDiscountPercent)) };

  return (
    <div className="mx-auto max-w-6xl px-5 pt-10 pb-16 md:pt-14 md:pb-24">
      <div className="mb-7 max-w-2xl">
        <p className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Abonnement</p>
        <h1 className="mt-2 text-[30px] leading-[1.08] font-bold tracking-[-0.03em] text-text-primary text-balance md:text-[38px]">Souscrire à PharmaBoost.</h1>
        <p className="mt-3 text-[15.5px] leading-7 text-text-secondary">Une question à la fois, environ deux minutes. Le contrat prérempli vous est ensuite envoyé pour une signature en ligne.</p>
        <p className="mt-4 inline-flex flex-wrap items-baseline gap-x-2 rounded-full border border-border-subtle bg-surface-card px-4 py-2 text-[13.5px] text-text-secondary lg:hidden">
          <span className="font-semibold text-text-primary">{pricing.name}</span>
          <span className="tabular-nums">{offer.price}</span>
          <span>· engagement de {commitmentMonths} mois</span>
        </p>
      </div>
      {referralCode && <p className="mb-5 max-w-2xl rounded-xl bg-brand-50 px-4 py-3 text-[13.5px] text-brand-900">Vous venez de la part d&apos;une officine équipée : son code <strong className="tabular-nums">{referralCode}</strong> est déjà renseigné.</p>}
      <SubscriptionForm planId={pricing.planId} offer={offer} offerLabel={`${offer.name} — ${offer.price}, engagement de ${commitmentMonths} mois`} referral={referral} referralCode={referralCode} />
    </div>
  );
}
