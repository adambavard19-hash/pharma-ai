import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { peekWeeklyDigest } from "@/server/services/weekly-digest";
import { DigestChoiceForm } from "./choice-form";

export const metadata: Metadata = {
  title: "Bilan de la semaine",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/**
 * Le bilan de la semaine (titulaire et équipe) : s'en désinscrire (ou s'y réinscrire) sans se connecter. La page n'écrit rien d'elle-même :
 * un lien d'e-mail est visité par les antivirus, seule la confirmation change le réglage.
 */
export default async function WeeklyDigestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await peekWeeklyDigest(decodeURIComponent(token));
  if (!state) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-7">
        <div className="space-y-2">
          <h1 className="text-xl leading-7 font-bold tracking-[-0.025em] text-text-primary">Le bilan de la semaine</h1>
          <p className="text-[13.5px] leading-5 text-text-secondary">
            {state.firstName}, chaque dimanche après une semaine de ventes, PharmaBoost vous envoie le bilan de la semaine : conseils proposés, vendus et chiffre d&apos;affaires ajouté, avec le PDF.
          </p>
        </div>
        <DigestChoiceForm token={decodeURIComponent(token)} subscribed={state.subscribed} />
        <p className="border-t border-border-subtle pt-4 text-[12px] leading-4 text-text-tertiary">Les autres messages (bilan mensuel, facturation, sécurité du compte) ne changent pas.</p>
      </div>
    </main>
  );
}
