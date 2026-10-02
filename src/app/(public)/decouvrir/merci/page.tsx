import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "Demande reçue", robots: { index: false, follow: false } };

const SUBSCRIPTION_OUTCOMES: Record<string, { title: string; body: string }> = {
  confirmation_sent: { title: "Plus qu'une confirmation.", body: "Un e-mail vient de partir à l'adresse indiquée : cliquez sur « Confirmer et recevoir mon contrat ». Votre contrat prérempli vous est alors adressé aussitôt pour signature électronique. Pensez à vérifier les courriers indésirables." },
  received: { title: "Votre demande d'abonnement est reçue.", body: "Notre équipe vérifie votre demande et revient vers vous très rapidement. Un accusé de réception vient de partir à l'adresse indiquée." },
};

export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ type?: string; etat?: string }> }) {
  const { type, etat } = await searchParams;
  const demo = type !== "abonnement";
  const subscription = !demo ? SUBSCRIPTION_OUTCOMES[etat ?? ""] : null;
  return (
    <div className="mx-auto max-w-2xl px-5 py-24 text-center">
      <CheckCircle2 className="mx-auto size-12 text-success-600" aria-hidden="true" />
      <h1 className="mt-5 text-[32px] leading-[1.15] font-semibold tracking-[-0.02em] text-text-primary text-balance">{demo ? "Votre démonstration est demandée." : (subscription?.title ?? "Votre demande d'abonnement est reçue.")}</h1>
      <p className="mt-4 text-[16px] leading-7 text-text-secondary">
        {demo
          ? "Nous vous rappelons sous un jour ouvré pour fixer un créneau de vingt minutes. Un accusé de réception vient de partir à l'adresse indiquée."
          : (subscription?.body ?? "Nous préparons votre contrat et vous l'envoyons par e-mail très prochainement. Un accusé de réception vient de partir à l'adresse indiquée.")}
      </p>
      <Link href="/decouvrir" className="mt-8 inline-flex h-11 items-center rounded-xl border border-border-default px-5 text-[14.5px] font-medium text-text-primary hover:bg-surface-sunken">Retour au site</Link>
    </div>
  );
}
