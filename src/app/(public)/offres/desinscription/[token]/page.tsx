import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { peekOfferOptOut } from "@/server/services/admin/campaigns";
import { OptOutForm } from "./opt-out-form";

export const metadata: Metadata = {
  title: "Ne plus recevoir ces offres",
  robots: { index: false, follow: false },
};

/**
 * Désinscription des offres de PharmaBoost, sans compte ni mot de passe.
 *
 * La page n'écrit rien : elle demande confirmation. Un lien contenu dans un
 * e-mail est visité par des antivirus et des aperçus de messagerie, et un GET
 * qui désinscrit désinscrirait des personnes qui n'ont rien demandé. Elle
 * n'affiche aucune information personnelle : le lien ne porte que l'empreinte
 * de l'adresse.
 */
export default async function OffersOptOutPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await peekOfferOptOut(token);
  if (!state) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-7">
        <div className="space-y-2">
          <h1 className="text-xl leading-7 font-bold tracking-[-0.025em] text-text-primary">Offres de PharmaBoost</h1>
          <p className="text-[13.5px] leading-5 text-text-secondary">
            {state.alreadyOptedOut
              ? "Cette adresse ne reçoit plus les offres de PharmaBoost. Aucune démarche supplémentaire n'est nécessaire."
              : "Vous pouvez cesser de recevoir les offres et les informations commerciales de PharmaBoost à l'adresse qui a reçu ce message."}
          </p>
        </div>

        {!state.alreadyOptedOut && <OptOutForm token={token} />}

        <p className="border-t border-border-subtle pt-4 text-[12px] leading-4 text-text-tertiary">
          Les messages liés à un abonnement ou à un contrat en cours (facturation, signature, sécurité du compte) continuent d&apos;être envoyés.
        </p>
      </div>
    </main>
  );
}
