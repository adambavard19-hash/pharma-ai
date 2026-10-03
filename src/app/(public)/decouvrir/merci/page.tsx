import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

export const metadata: Metadata = { title: "Demande reçue", robots: { index: false, follow: false } };

type Outcome = { kicker: string; title: string; body: string; steps: { title: string; body: string }[] };

/** Ce qui se passe ensuite, tel que le moteur le fait réellement : rien de plus. */
const OUTCOMES: Record<string, Outcome> = {
  demo: {
    kicker: "Démonstration",
    title: "Votre démonstration est demandée.",
    body: "Un accusé de réception vient de partir à l'adresse indiquée.",
    steps: [
      { title: "Nous vous rappelons sous un jour ouvré", body: "Pour fixer le créneau qui vous convient." },
      { title: "La démonstration, sur votre poste", body: "En visio ou par téléphone : le conseil au scan, l'analyse d'ordonnance, le stock et la marge." },
      { title: "Vous décidez", body: "Si PharmaBoost vous convient, la souscription se fait en ligne, en deux minutes." },
    ],
  },
  confirmation_sent: {
    kicker: "Abonnement",
    title: "Plus qu'une confirmation.",
    body: "Un e-mail vient de partir à l'adresse indiquée. Pensez à vérifier les courriers indésirables.",
    steps: [
      { title: "Confirmez votre adresse e-mail", body: "Cliquez sur « Confirmer et recevoir mon contrat » dans l'e-mail que nous venons d'envoyer." },
      { title: "Signez votre contrat en ligne", body: "Le contrat prérempli arrive aussitôt. PharmaBoost le contresigne et vous adresse la version signée par les deux parties." },
      { title: "Activez l'abonnement, installez vos postes", body: "Vous recevez par e-mail le lien d'activation, puis le guide de mise en service. Rien n'est prélevé avant." },
    ],
  },
  received: {
    kicker: "Abonnement",
    title: "Votre demande d'abonnement est reçue.",
    body: "Un accusé de réception vient de partir à l'adresse indiquée.",
    steps: [
      { title: "Notre équipe vérifie votre demande", body: "Nous rapprochons les informations de votre officine avant tout envoi de contrat." },
      { title: "Nous revenons vers vous", body: "Très rapidement, par e-mail ou par téléphone." },
    ],
  },
};

export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ type?: string; etat?: string }> }) {
  const { type, etat } = await searchParams;
  const outcome = type === "abonnement" ? (OUTCOMES[etat ?? ""] ?? OUTCOMES.received) : OUTCOMES.demo;
  return (
    <div className="mx-auto max-w-2xl px-5 py-16 md:py-24">
      <span className="flex size-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-[0_12px_30px_-12px_rgba(13,148,136,0.7)] motion-safe:animate-slide-up" aria-hidden="true">
        <Check className="size-7" strokeWidth={3} />
      </span>
      <p className="mt-6 font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">{outcome.kicker}</p>
      <h1 className="mt-2 text-[32px] leading-[1.1] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[40px]">{outcome.title}</h1>
      <p className="mt-4 text-[16px] leading-7 text-text-secondary">{outcome.body}</p>

      <h2 className="mt-10 font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">Et maintenant</h2>
      <ol className="mt-4 space-y-0">
        {outcome.steps.map((step, i) => (
          <li key={step.title} className="relative flex gap-4 pb-7 last:pb-0">
            {i < outcome.steps.length - 1 && <span className="absolute top-9 bottom-1 left-[17px] w-px bg-border-default" aria-hidden="true" />}
            <span className={i === 0 ? "flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[14px] font-semibold text-white" : "flex size-9 shrink-0 items-center justify-center rounded-full border border-border-default bg-surface-card text-[14px] font-semibold text-text-secondary"}>{i + 1}</span>
            <div className="pt-1.5">
              <p className="text-[16px] leading-6 font-semibold text-text-primary">{step.title}</p>
              <p className="mt-1 text-[14.5px] leading-6 text-text-secondary">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <Link href="/decouvrir" className="mt-10 inline-flex h-11 items-center rounded-xl border border-border-default px-5 text-[14.5px] font-medium text-text-primary hover:bg-surface-sunken">Retour au site</Link>
    </div>
  );
}
