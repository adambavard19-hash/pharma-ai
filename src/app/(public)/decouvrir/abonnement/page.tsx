import type { Metadata } from "next";
import Link from "next/link";
import { SubscriptionForm } from "../_components/subscription-form";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { normalizeReferralCode } from "@/core/billing/referral";
import { formatPriceEuros, formulaQuery, parseFormula, type SubscriptionFormula } from "@/core/pricing/official-offer";

export const metadata: Metadata = { title: "S'abonner", description: "Souscription en ligne : vos informations une seule fois, votre contrat à signer électroniquement." };

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ parrain?: string; formule?: string }> }) {
  const [pricing, params] = await Promise.all([loadPublicPricing(), searchParams]);
  const referralCode = normalizeReferralCode(params.parrain) ?? "";
  const formula: SubscriptionFormula = parseFormula(params.formule) ?? "MONTHLY";
  const { monthly, annual } = pricing;

  // Ce que le visiteur a choisi, dit une fois, avec les mêmes montants que la page des tarifs.
  const offer =
    formula === "ANNUAL"
      ? {
          name: `${pricing.name} · formule annuelle`,
          price: `${formatPriceEuros(annual.priceCents)} HT / an`,
          perks: [annual.setupFeeCents === 0 ? "Mise en service offerte" : `Mise en service : ${formatPriceEuros(annual.setupFeeCents)} HT, une seule fois`, "Contrat signé en ligne"],
        }
      : {
          name: `${pricing.name} · formule mensuelle`,
          price: `${formatPriceEuros(monthly.priceCents)} HT / mois`,
          perks: ["Sans engagement", `Mise en service : ${formatPriceEuros(monthly.setupFeeCents)} HT, une seule fois`, "Contrat signé en ligne"],
        };
  const other: SubscriptionFormula = formula === "ANNUAL" ? "MONTHLY" : "ANNUAL";

  return (
    <div className="mx-auto max-w-6xl px-5 pt-10 pb-16 md:pt-14 md:pb-24">
      <div className="mb-7 max-w-2xl">
        <p className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Abonnement</p>
        <h1 className="mt-2 text-[30px] leading-[1.08] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[38px]">Souscrire à PharmaBoost.</h1>
        <p className="mt-3 text-[15.5px] leading-7 text-text-secondary">Une question à la fois, environ deux minutes. Le contrat prérempli vous est ensuite envoyé pour une signature en ligne.</p>
        <p className="mt-4 inline-flex flex-wrap items-baseline gap-x-2 rounded-full border border-border-subtle bg-surface-card px-4 py-2 text-[13.5px] text-text-secondary lg:hidden">
          <span className="font-semibold text-text-primary">{formula === "ANNUAL" ? "Formule annuelle" : "Formule mensuelle"}</span>
          <span className="tabular-nums">{offer.price}</span>
        </p>
        <p className="mt-3 text-[13.5px] text-text-secondary">
          Formule {formula === "ANNUAL" ? "annuelle" : "mensuelle"} choisie.{" "}
          <Link href={`/decouvrir/abonnement?formule=${formulaQuery(other)}${referralCode ? `&parrain=${encodeURIComponent(referralCode)}` : ""}`} className="font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-800">
            Choisir plutôt la formule {other === "ANNUAL" ? "annuelle" : "mensuelle"}
          </Link>
        </p>
      </div>
      {referralCode && <p className="mb-5 max-w-2xl rounded-xl bg-brand-50 px-4 py-3 text-[13.5px] text-brand-900">Vous venez de la part d&apos;une officine équipée : son code <strong className="tabular-nums">{referralCode}</strong> est déjà renseigné.</p>}
      <SubscriptionForm planId={pricing.planId} formula={formula} offer={offer} offerLabel={`${offer.name} — ${offer.price}`} referralCode={referralCode} />
    </div>
  );
}
