import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/server/db/client";
import { getStripe, stripeConfigState } from "@/server/billing/stripe-client";
import { readCheckoutSession, readSubscription } from "@/core/billing/stripe-shapes";
import { syncSubscriptionFromStripe } from "@/server/billing/subscriptions";
import { formatFrenchDate } from "@/core/billing/subscription";

export const metadata: Metadata = { title: { absolute: "Abonnement activé — PharmaBoost" }, robots: { index: false, follow: false, nocache: true } };

/**
 * Retour du Checkout. L'état affiché ne se fie pas au seul retour navigateur :
 * la session est relue chez Stripe, et l'abonnement synchronisé — le webhook
 * fera de même, une seule fois grâce à l'identifiant d'événement.
 */
export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId } = await searchParams;
  let pharmacyName: string | null = null;
  let trialEndsAt: Date | null = null;
  let ok = false;
  if (sessionId && stripeConfigState().configured) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
      const shape = readCheckoutSession(session);
      const invite = shape.clientReferenceId ? await prisma.subscriptionInvite.findUnique({ where: { id: shape.clientReferenceId }, select: { pharmacy: { select: { name: true } } } }) : null;
      pharmacyName = invite?.pharmacy.name ?? null;
      if (session.subscription && typeof session.subscription !== "string") {
        const sub = readSubscription(session.subscription);
        await syncSubscriptionFromStripe(sub);
        trialEndsAt = sub.trialEnd;
        ok = shape.status === "complete";
      }
    } catch {
      ok = false;
    }
  }
  return (
    <div className="min-h-dvh bg-[#eef1f4] py-8">
      <div className="mx-auto max-w-[620px] px-4">
        <section className="rounded-2xl bg-white p-7 shadow-lg">
          <p className="text-[12px] font-bold tracking-[0.1em] text-[#0F766E] uppercase">PharmaBoost</p>
          <h1 className="mt-1 text-[26px] leading-8 font-bold text-[#111827]">{ok ? "Votre abonnement est activé" : "Merci"}</h1>
          <p className="mt-3 text-[15px] leading-6 text-[#374151]">
            {ok
              ? `${pharmacyName ? `${pharmacyName} : ` : ""}votre espace PharmaBoost est ouvert.${trialEndsAt ? ` Votre premier mois est offert ; le premier prélèvement aura lieu le ${formatFrenchDate(trialEndsAt)}.` : ""}`
              : "Nous finalisons votre souscription. Vous recevrez un e-mail de confirmation dès qu'elle sera enregistrée."}
          </p>
          <Link href="/" className="mt-6 inline-flex rounded-xl bg-[#0F766E] px-5 py-3 text-[15px] font-semibold text-white">Ouvrir PharmaBoost</Link>
          <p className="mt-5 text-[12.5px] leading-5 text-[#6b7280]">Moyen de paiement et factures : dans PharmaBoost, Paramètres → Mon abonnement → Gérer mon abonnement.</p>
        </section>
      </div>
    </div>
  );
}
