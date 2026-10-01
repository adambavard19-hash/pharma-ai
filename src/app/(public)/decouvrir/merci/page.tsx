import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "Demande reçue", robots: { index: false, follow: false } };

export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const demo = type !== "abonnement";
  return (
    <div className="mx-auto max-w-2xl px-5 py-24 text-center">
      <CheckCircle2 className="mx-auto size-12 text-success-600" aria-hidden="true" />
      <h1 className="mt-5 text-[32px] leading-[1.15] font-semibold tracking-[-0.02em] text-text-primary text-balance">{demo ? "Votre démonstration est demandée." : "Votre demande d'abonnement est reçue."}</h1>
      <p className="mt-4 text-[16px] leading-7 text-text-secondary">
        {demo
          ? "Nous vous rappelons sous un jour ouvré pour fixer un créneau de vingt minutes. Un accusé de réception vient de partir à l'adresse indiquée."
          : "Nous préparons votre espace et vous envoyons sous un jour ouvré votre lien d'activation personnel. Un accusé de réception vient de partir à l'adresse indiquée."}
      </p>
      <Link href="/decouvrir" className="mt-8 inline-flex h-11 items-center rounded-xl border border-border-default px-5 text-[14.5px] font-medium text-text-primary hover:bg-surface-sunken">Retour au site</Link>
    </div>
  );
}
