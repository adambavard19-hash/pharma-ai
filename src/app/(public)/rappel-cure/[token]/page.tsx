import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { peekCureUnsubscribe } from "@/server/services/cure-reminders";
import { CureUnsubscribeForm } from "./unsubscribe-form";

export const metadata: Metadata = {
  title: "Rappels de fin de cure",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/**
 * Les rappels de fin de cure envoyés au patient : s'en désinscrire sans compte. La page n'écrit rien d'elle-même (un antivirus visite
 * les liens) : seul le clic sur le bouton désinscrit l'adresse, pour toutes les pharmacies et tous les rappels à venir.
 */
export default async function CureUnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decoded = decodeURIComponent(token);
  const state = await peekCureUnsubscribe(decoded);
  if (!state) notFound();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-7">
        <div className="space-y-2">
          <h1 className="text-xl leading-7 font-bold tracking-[-0.025em] text-text-primary">Rappels de fin de cure</h1>
          <p className="text-[13.5px] leading-5 text-text-secondary">
            Votre pharmacie vous envoie un e-mail quelques jours avant la fin d&apos;une cure conseillée au comptoir, pour penser à la renouveler. Votre adresse est effacée après chaque envoi.
          </p>
        </div>
        <CureUnsubscribeForm token={decoded} optedOut={state.optedOut} />
      </div>
    </main>
  );
}
