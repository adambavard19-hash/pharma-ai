import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { peekPartnerConsent } from "@/server/services/partner-emails";
import { PARTNER_CONSENT_TEXT } from "@/core/partners/patient-email";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Offres de nos marques partenaires", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

/**
 * Depuis le bilan e-mail : accepter les offres des marques partenaires. La page n'écrit rien d'elle-même — un antivirus visite les
 * liens — : seuls la case cochée et le bouton enregistrent l'accord.
 */
export default async function PartnerConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decoded = decodeURIComponent(token);
  const state = await peekPartnerConsent(decoded);
  if (!state) notFound();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-7">
        <div className="space-y-2">
          <h1 className="text-xl leading-7 font-bold tracking-[-0.025em] text-text-primary">Les offres de nos marques partenaires</h1>
          <p className="text-[13.5px] leading-5 text-text-secondary">
            Recevez à {state.masked} des offres de compléments alimentaires, de soins et d&apos;hygiène, choisies d&apos;après les produits que votre pharmacie vous a conseillés. Votre adresse n&apos;est jamais transmise aux marques.
          </p>
        </div>
        <ConsentForm token={decoded} subscribed={state.subscribed} consentText={PARTNER_CONSENT_TEXT} />
      </div>
    </main>
  );
}
