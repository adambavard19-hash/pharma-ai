import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { peekInvite } from "@/server/billing/subscriptions";
import { stripeConfigState } from "@/server/billing/stripe-client";
import { formatEuros, trialEndDate, trialSentence } from "@/core/billing/subscription";
import { ActivateButton } from "./activate-button";

export const metadata: Metadata = { title: { absolute: "Activer votre abonnement PharmaBoost" }, robots: { index: false, follow: false, nocache: true } };

/**
 * Le lien d'activation, vu par le titulaire : ce qu'il souscrit, pour quelle
 * officine, à quel prix, avec quel essai — puis le bouton vers le paiement
 * sécurisé Stripe. Aucun compte demandé : le jeton, long et daté, suffit.
 */
export default async function ActivateSubscriptionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const peeked = await peekInvite(token);
  if (!peeked) notFound();
  const { invite, expired } = peeked;
  const trialEndsAt = trialEndDate(new Date(), invite.plan.trialDays);
  const ready = stripeConfigState().configured;

  return (
    <div className="min-h-dvh bg-[#eef1f4] py-8">
      <div className="mx-auto max-w-[620px] space-y-4 px-4">
        <section className="rounded-2xl bg-white p-7 shadow-lg">
          <p className="text-[12px] font-bold tracking-[0.1em] text-[#0F766E] uppercase">PharmaBoost</p>
          <h1 className="mt-1 text-[26px] leading-8 font-bold text-[#111827]">Activez votre abonnement</h1>
          <p className="mt-2 text-[15px] leading-6 text-[#374151]">Pour <strong>{invite.pharmacy.name}</strong>.</p>

          <dl className="mt-6 divide-y divide-[#e5e7eb] rounded-xl border border-[#e5e7eb]">
            <div className="flex items-baseline justify-between gap-4 px-4 py-3"><dt className="text-[13.5px] text-[#6b7280]">Offre</dt><dd className="text-[15px] font-semibold text-[#111827]">{invite.plan.name}</dd></div>
            <div className="flex items-baseline justify-between gap-4 px-4 py-3"><dt className="text-[13.5px] text-[#6b7280]">Tarif</dt><dd className="text-[15px] font-semibold text-[#111827]">{formatEuros(invite.plan.monthlyPriceCents)} HT / mois</dd></div>
            {invite.plan.trialDays > 0 && (
              <div className="flex items-baseline justify-between gap-4 px-4 py-3"><dt className="text-[13.5px] text-[#6b7280]">Essai</dt><dd className="text-[15px] font-semibold text-[#0F766E]">{invite.plan.trialDays === 30 || invite.plan.trialDays === 31 ? "Premier mois offert" : `${invite.plan.trialDays} jours offerts`}</dd></div>
            )}
            {invite.contract && (
              <div className="flex items-baseline justify-between gap-4 px-4 py-3"><dt className="text-[13.5px] text-[#6b7280]">Contrat</dt><dd className="text-[15px] text-[#111827]">Version {invite.contract.version}</dd></div>
            )}
          </dl>

          <p className="mt-5 rounded-xl bg-[#ecfdf5] px-4 py-3 text-[14.5px] leading-6 text-[#065f46]">{trialSentence({ monthlyPriceCents: invite.plan.monthlyPriceCents, trialDays: invite.plan.trialDays, trialEndsAt })}</p>

          {invite.completedAt ? (
            <p className="mt-5 rounded-xl bg-[#f3f4f6] px-4 py-3 text-[14px] leading-6 text-[#374151]">Cet abonnement a déjà été activé. Vous pouvez le gérer depuis PharmaBoost, Paramètres → Mon abonnement.</p>
          ) : expired ? (
            <p className="mt-5 rounded-xl bg-[#fff7ed] px-4 py-3 text-[14px] leading-6 text-[#9a3412]">Ce lien a expiré. Écrivez-nous pour en recevoir un nouveau.</p>
          ) : !ready ? (
            <p className="mt-5 rounded-xl bg-[#fff7ed] px-4 py-3 text-[14px] leading-6 text-[#9a3412]">Le paiement en ligne n&apos;est pas encore ouvert. Nous vous préviendrons dès qu&apos;il le sera.</p>
          ) : (
            <ActivateButton token={token} />
          )}

          <p className="mt-5 text-[12.5px] leading-5 text-[#6b7280]">Le paiement est sécurisé par Stripe. PharmaBoost ne voit ni ne conserve votre numéro de carte. Vous renseignerez votre moyen de paiement sur la page Stripe ; rien n&apos;est prélevé pendant la période offerte.</p>
        </section>
      </div>
    </div>
  );
}
