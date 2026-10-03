import type { Metadata } from "next";
import { SubscriptionForm } from "../_components/subscription-form";
import { loadPublicOffer } from "@/server/services/site-leads";
import { formatEuros } from "@/core/billing/subscription";
import { normalizeReferralCode } from "@/core/billing/referral";

export const metadata: Metadata = { title: "S'abonner", description: "Souscription en ligne : vos informations une seule fois, votre contrat à signer électroniquement." };

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ parrain?: string }> }) {
  const [offer, params] = await Promise.all([loadPublicOffer(), searchParams]);
  const referralCode = normalizeReferralCode(params.parrain) ?? "";
  const price = offer ? formatEuros(offer.monthlyPriceCents) : "69 €";
  const trialDays = offer?.trialDays ?? 30;
  const name = offer?.name ?? "PharmaBoost Officine";
  const trial = trialDays >= 28 && trialDays <= 31 ? "premier mois offert" : trialDays > 0 ? `${trialDays} jours offerts` : null;
  const perks = [trialDays >= 28 ? "Premier mois offert" : `${trialDays} jours offerts`, "Tous les postes de comptoir", "Sans engagement", "Contrat signé en ligne"];
  return (
    <div className="mx-auto max-w-6xl px-5 pt-10 pb-16 md:pt-14 md:pb-24">
      <div className="mb-7 max-w-2xl">
        <p className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Abonnement</p>
        <h1 className="mt-2 text-[30px] leading-[1.08] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[38px]">Souscrire à PharmaBoost.</h1>
        <p className="mt-3 text-[15.5px] leading-7 text-text-secondary">Une question à la fois, environ deux minutes. Le contrat prérempli vous est ensuite envoyé pour une signature en ligne.</p>
        <p className="mt-4 inline-flex flex-wrap items-baseline gap-x-2 rounded-full border border-border-subtle bg-surface-card px-4 py-2 text-[13.5px] text-text-secondary lg:hidden">
          <span className="font-semibold text-text-primary">{name}</span>
          <span className="tabular-nums">{price} HT / mois</span>
          {trial && <span>· {trial}</span>}
        </p>
      </div>
      {referralCode && <p className="mb-5 max-w-2xl rounded-xl bg-brand-50 px-4 py-3 text-[13.5px] text-brand-900">Vous venez de la part d&apos;une officine équipée : son code <strong className="tabular-nums">{referralCode}</strong> est déjà renseigné.</p>}
      <SubscriptionForm planId={offer?.id ?? null} offer={{ name, price, perks }} offerLabel={`${name} — ${price} HT / mois${trial ? `, ${trial}` : ""}`} referralCode={referralCode} />
    </div>
  );
}
