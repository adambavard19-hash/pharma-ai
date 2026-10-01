import type { Metadata } from "next";
import { Check } from "lucide-react";
import { LeadForm } from "../_components/lead-form";
import { loadPublicOffer } from "@/server/services/site-leads";
import { formatEuros } from "@/core/billing/subscription";

export const metadata: Metadata = { title: "S'abonner", description: "Demandez votre lien d'activation : premier mois offert, carte demandée à l'activation, résiliable à tout moment." };

export default async function SubscribePage() {
  const offer = await loadPublicOffer();
  const price = offer ? formatEuros(offer.monthlyPriceCents) : "69 €";
  const trialDays = offer?.trialDays ?? 30;
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <p className="text-[12.5px] font-semibold tracking-[0.1em] text-brand-700 uppercase dark:text-brand-400">Abonnement</p>
        <h1 className="mt-2 text-[34px] leading-[1.12] font-semibold tracking-[-0.02em] text-text-primary text-balance">Votre espace, prêt sous un jour ouvré.</h1>
        <p className="mt-4 text-[16px] leading-7 text-text-secondary">Laissez-nous les coordonnées de l&apos;officine. Nous préparons votre espace et vous envoyons par e-mail un lien d&apos;activation personnel. Vous y enregistrez votre carte, rien n&apos;est débité pendant l&apos;essai, et vous pouvez arrêter à tout moment.</p>
        <div className="mt-8 rounded-2xl border border-border-subtle bg-surface-card p-6">
          <p className="text-[13px] font-semibold tracking-[0.08em] text-brand-700 uppercase dark:text-brand-400">{offer?.name ?? "PharmaBoost Officine"}</p>
          <p className="mt-2 flex items-baseline gap-2"><span className="text-[36px] leading-none font-semibold tracking-[-0.02em] text-text-primary tabular">{price}</span><span className="text-[14px] text-text-secondary">HT / mois</span></p>
          <ul className="mt-4 space-y-2 text-[14px] text-text-primary">
            {[trialDays >= 28 ? "Premier mois offert" : `${trialDays} jours offerts`, "Tous les postes de comptoir de l'officine", "Sans engagement, résiliable à tout moment", "Paiement sécurisé par Stripe"].map((item) => (
              <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" /> {item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="relative rounded-3xl border border-border-subtle bg-surface-card p-7 md:p-9">
        <LeadForm kind="SUBSCRIBE" />
      </div>
    </div>
  );
}
