import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { peekNewsUnsubscribe } from "@/server/services/patient-news";
import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata: Metadata = {
  // Le patient voit sa pharmacie, pas un logiciel : les métadonnées héritées de l'application sont remplacées.
  title: { absolute: "Ne plus recevoir les nouveautés" },
  description: "Se désinscrire des nouveautés de votre pharmacie.",
  applicationName: "Votre pharmacie",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Désinscription des nouveautés, sans compte ni mot de passe.
 *
 * La page n'écrit rien : elle demande confirmation. Un lien contenu dans un
 * e-mail est visité par des antivirus et des aperçus de messagerie, et un GET
 * qui désinscrit désinscrirait des patients qui n'ont rien demandé.
 */
export default async function NewsUnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await peekNewsUnsubscribe(token);
  if (!state) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-7">
        <div className="space-y-2">
          <h1 className="text-xl leading-7 font-bold tracking-[-0.025em] text-text-primary">Nouveautés de {state.pharmacyName}</h1>
          <p className="text-[13.5px] leading-5 text-text-secondary">
            {state.alreadyUnsubscribed
              ? "Vous ne recevez plus les nouveautés de cette pharmacie, et votre adresse a été effacée. Aucune démarche supplémentaire n'est nécessaire."
              : "Vous pouvez cesser de recevoir les nouveautés de cette pharmacie. Votre adresse sera effacée de sa liste : seule une trace illisible de votre choix est gardée, pour qu'il soit respecté. Votre plan n'est pas affecté."}
          </p>
        </div>

        {!state.alreadyUnsubscribed && <UnsubscribeForm token={token} />}

        <p className="border-t border-border-subtle pt-4 text-[12px] leading-4 text-text-tertiary">
          Cette page ne contient aucune information sur votre santé et n&apos;en affiche aucune.
        </p>
      </div>
    </main>
  );
}
