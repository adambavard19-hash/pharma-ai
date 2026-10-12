import type { Metadata } from "next";
import { loadCompanyProfile } from "@/server/services/site-leads";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { buildSubscriptionTerms } from "@/core/billing/subscription-terms";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";

export const metadata: Metadata = { title: "Conditions d'abonnement" };

/**
 * Les conditions acceptées par la case à cocher de la souscription en ligne. Les
 * montants sont ceux que le site affiche ; la version du texte est gardée sur le
 * dossier de chaque officine qui les accepte.
 */
export default async function SubscriptionTermsPage() {
  const [company, pricing] = await Promise.all([loadCompanyProfile(), loadPublicPricing()]);
  const terms = buildSubscriptionTerms({
    companyName: company?.legalName ?? "PharmaBoost",
    monthlyPriceCents: pricing.monthlyPriceCents,
    setupFeeCents: pricing.setupFeeCents,
    commitmentMonths: pricing.commitmentMonths,
    referralDiscountPercent: pricing.referralDiscountPercent,
    contactEmail: PUBLIC_CONTACT_EMAIL,
  });
  return (
    <article className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="text-[32px] leading-[1.15] font-bold tracking-[-0.025em] text-balance text-text-primary">{terms.title}</h1>
      <p className="mt-3 font-mono text-[12px] tracking-[0.06em] text-text-tertiary">Version {terms.version}</p>
      {terms.sections.map((section) => (
        <section key={section.heading}>
          <h2 className="mt-10 text-[20px] font-semibold text-text-primary">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mt-3 text-[14.5px] leading-7 text-text-secondary">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
