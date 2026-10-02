import type { Metadata } from "next";
import { ConfirmButton } from "./confirm-button";

export const metadata: Metadata = { title: "Confirmer votre demande", robots: { index: false, follow: false, nocache: true } };

/**
 * Atterrissage du lien de confirmation. Ouvrir la page n'envoie rien : seul le
 * bouton déclenche l'envoi du contrat (une messagerie qui « visite » les liens
 * pour les analyser ne doit pas suffire).
 */
export default async function ConfirmSubscriptionPage({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams;
  return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center">
      <p className="text-[12.5px] font-semibold tracking-[0.1em] text-brand-700 uppercase">Demande d&apos;abonnement</p>
      <h1 className="mt-2 text-[30px] leading-[1.15] font-semibold tracking-[-0.02em] text-text-primary text-balance">Confirmez votre demande</h1>
      <p className="mt-4 text-[16px] leading-7 text-text-secondary">Un clic, et votre contrat d&apos;abonnement prérempli vous est adressé par e-mail pour une signature électronique sécurisée.</p>
      <div className="mt-8">{jeton ? <ConfirmButton token={jeton} /> : <p className="text-[15px] text-danger-700">Ce lien est incomplet.</p>}</div>
    </div>
  );
}
