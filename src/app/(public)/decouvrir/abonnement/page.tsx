import type { Metadata } from "next";
import { Check } from "lucide-react";
import { LeadForm } from "../_components/lead-form";
import { loadPublicOffer } from "@/server/services/site-leads";
import { formatEuros } from "@/core/billing/subscription";
import { normalizeReferralCode } from "@/core/billing/referral";

export const metadata: Metadata = { title: "S'abonner", description: "Premier mois offert, contrat signé en ligne, prélèvement mensuel, résiliable à tout moment." };

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ parrain?: string }> }) {
  const [offer, params] = await Promise.all([loadPublicOffer(), searchParams]);
  const referralCode = normalizeReferralCode(params.parrain) ?? "";
  const price = offer ? formatEuros(offer.monthlyPriceCents) : "69 €";
  const trialDays = offer?.trialDays ?? 30;
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 py-16 md:py-24 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <p className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Abonnement</p>
        <h1 className="mt-3 text-[34px] leading-[1.08] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[42px]">S&apos;abonner.</h1>
        <p className="mt-4 text-[16px] leading-7 text-text-secondary">Votre espace sous un jour ouvré. Contrat signé en ligne.</p>
        <div className="mt-8 rounded-[28px] border border-border-subtle bg-surface-card p-6">
          <p className="font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">{offer?.name ?? "PharmaBoost Officine"}</p>
          <p className="mt-2 flex items-baseline gap-2"><span className="text-[36px] leading-none font-semibold tracking-[-0.02em] text-text-primary tabular">{price}</span><span className="text-[14px] text-text-secondary">HT / mois</span></p>
          <ul className="mt-4 space-y-2 text-[14px] text-text-primary">
            {[trialDays >= 28 ? "Premier mois offert" : `${trialDays} jours offerts`, "Tous les postes de comptoir", "Sans engagement", "Prélèvement mensuel"].map((item) => (
              <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand-600" /> {item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="relative rounded-[28px] border border-border-subtle bg-surface-card p-7 md:p-9">
        {referralCode && <p className="mb-5 rounded-xl bg-brand-50 px-4 py-3 text-[13.5px] text-brand-900">Vous venez de la part d&apos;une officine équipée : son code <strong className="tabular">{referralCode}</strong> est déjà renseigné.</p>}
        <LeadForm kind="SUBSCRIBE" referralCode={referralCode} />
      </div>
    </div>
  );
}
