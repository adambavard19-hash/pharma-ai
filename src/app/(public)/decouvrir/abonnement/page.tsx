import type { Metadata } from "next";
import { Check } from "lucide-react";
import { SubscriptionForm } from "../_components/subscription-form";
import { loadPublicOffer } from "@/server/services/site-leads";
import { formatEuros } from "@/core/billing/subscription";
import { normalizeReferralCode } from "@/core/billing/referral";

export const metadata: Metadata = { title: "S'abonner", description: "Souscrivez en ligne : vos informations une seule fois, votre contrat à signer électroniquement dans la minute." };

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ parrain?: string }> }) {
  const [offer, params] = await Promise.all([loadPublicOffer(), searchParams]);
  const referralCode = normalizeReferralCode(params.parrain) ?? "";
  const price = offer ? formatEuros(offer.monthlyPriceCents) : "69 €";
  const trialDays = offer?.trialDays ?? 30;
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <p className="text-[12.5px] font-semibold tracking-[0.1em] text-brand-700 uppercase dark:text-brand-400">Abonnement</p>
        <h1 className="mt-2 text-[34px] leading-[1.12] font-semibold tracking-[-0.02em] text-text-primary text-balance">Souscrire à PharmaBoost.</h1>
        <p className="mt-4 text-[16px] leading-7 text-text-secondary">Renseignez une seule fois les informations de l&apos;officine et de son représentant. Votre contrat d&apos;abonnement, prérempli, vous est adressé aussitôt par e-mail pour une signature électronique sécurisée. L&apos;activation de l&apos;abonnement suit la signature.</p>
        <div className="mt-8 rounded-2xl border border-border-subtle bg-surface-card p-6">
          <p className="text-[13px] font-semibold tracking-[0.08em] text-brand-700 uppercase dark:text-brand-400">{offer?.name ?? "PharmaBoost Officine"}</p>
          <p className="mt-2 flex items-baseline gap-2"><span className="text-[36px] leading-none font-semibold tracking-[-0.02em] text-text-primary tabular">{price}</span><span className="text-[14px] text-text-secondary">HT / mois</span></p>
          <ul className="mt-4 space-y-2 text-[14px] text-text-primary">
            {[trialDays >= 28 ? "Premier mois offert" : `${trialDays} jours offerts`, "Tous les postes de comptoir de l'officine", "Sans engagement, résiliable à tout moment", "Contrat signé en ligne, en quelques minutes"].map((item) => (
              <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" /> {item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="relative rounded-3xl border border-border-subtle bg-surface-card p-7 md:p-9">
        {referralCode && <p className="mb-5 rounded-xl bg-brand-50 px-4 py-3 text-[13.5px] text-brand-900 dark:bg-brand-950/40 dark:text-brand-100">Vous venez de la part d&apos;une officine équipée : son code <strong className="tabular">{referralCode}</strong> est déjà renseigné.</p>}
        <SubscriptionForm planId={offer?.id ?? null} offerLabel={`${offer?.name ?? "PharmaBoost Officine"} — ${price} HT / mois${trialDays >= 28 && trialDays <= 31 ? ", premier mois offert" : trialDays > 0 ? `, ${trialDays} jours offerts` : ""}`} referralCode={referralCode} />
      </div>
    </div>
  );
}
