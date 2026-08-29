import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { peekOptOut } from "@/server/services/followup";
import { OptOutForm } from "./opt-out-form";

export const metadata: Metadata = {
  title: "Ne plus recevoir de suivi",
  robots: { index: false, follow: false },
};

/**
 * Désinscription des suivis, sans compte ni mot de passe.
 *
 * La page n'écrit rien : elle demande confirmation. Un lien contenu dans un
 * e-mail est visité par des antivirus et des aperçus de messagerie, et un GET
 * qui désinscrit désinscrirait des patients qui n'ont rien demandé.
 */
export default async function OptOutPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await peekOptOut(token);
  if (!state) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-7">
        <div className="space-y-2">
          <h1 className="text-xl leading-7 font-semibold tracking-[-0.015em] text-text-primary">
            Suivis de {state.pharmacyName}
          </h1>
          <p className="text-[13.5px] leading-5 text-text-secondary">
            {state.alreadyOptedOut
              ? "Vous ne recevez plus de suivi de la part de cette pharmacie. Aucune démarche supplémentaire n'est nécessaire."
              : "Vous pouvez cesser de recevoir les messages de suivi de traitement de cette pharmacie. Votre dossier et vos ordonnances ne sont pas affectés."}
          </p>
        </div>

        {!state.alreadyOptedOut && <OptOutForm token={token} />}

        <p className="border-t border-border-subtle pt-4 text-[12px] leading-4 text-text-tertiary">
          Cette page ne contient aucune information sur votre santé et n&apos;en affiche
          aucune.
        </p>
      </div>
    </main>
  );
}
