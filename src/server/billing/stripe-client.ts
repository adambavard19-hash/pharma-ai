import "server-only";
import Stripe from "stripe";
import { getEnv } from "@/config/env";

/**
 * Le client Stripe, construit à la demande depuis l'environnement.
 *
 * Les clés ne sont jamais dans le code. En mode « test » (le seul mode
 * autorisé tant que la mise en production n'est pas décidée), une clé de
 * production est refusée : on ne facture personne par accident.
 */

export class StripeNotConfiguredError extends Error {
  constructor(detail = "STRIPE_SECRET_KEY n'est pas renseignée.") {
    super(`Stripe n'est pas configuré : ${detail}`);
    this.name = "StripeNotConfiguredError";
  }
}

export type StripeConfigState = {
  configured: boolean;
  mode: "test" | "live";
  /** La clé présente correspond-elle au mode annoncé ? */
  keyMatchesMode: boolean;
  webhookConfigured: boolean;
  detail: string;
};

export function stripeConfigState(): StripeConfigState {
  const key = getEnv().STRIPE_SECRET_KEY;
  const mode = getEnv().STRIPE_MODE;
  if (!key) return { configured: false, mode, keyMatchesMode: false, webhookConfigured: Boolean(getEnv().STRIPE_WEBHOOK_SECRET), detail: "Aucune clé secrète Stripe (STRIPE_SECRET_KEY)." };
  const isTestKey = key.startsWith("sk_test_") || key.startsWith("rk_test_");
  const isLiveKey = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  const keyMatchesMode = mode === "test" ? isTestKey : isLiveKey;
  const detail = !isTestKey && !isLiveKey
    ? "La clé ne ressemble pas à une clé Stripe (attendu : sk_test_… ou sk_live_…)."
    : !keyMatchesMode
      ? `La clé est une clé ${isLiveKey ? "de production" : "de test"} alors que STRIPE_MODE vaut « ${mode} ».`
      : `Clé ${mode === "test" ? "de test" : "de production"} présente.`;
  return { configured: keyMatchesMode, mode, keyMatchesMode, webhookConfigured: Boolean(getEnv().STRIPE_WEBHOOK_SECRET), detail };
}

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const state = stripeConfigState();
  if (!state.configured) throw new StripeNotConfiguredError(state.detail);
  if (!client) {
    client = new Stripe(getEnv().STRIPE_SECRET_KEY!, {
      appInfo: { name: "PharmaBoost", url: "https://pharmaboost.app" },
      maxNetworkRetries: 2,
      timeout: 20_000,
    });
  }
  return client;
}

/** Vérifie la signature d'un webhook et rend l'événement ; lève si invalide. */
export function constructWebhookEvent(rawBody: string, signatureHeader: string | null): Stripe.Event {
  const secret = getEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new StripeNotConfiguredError("STRIPE_WEBHOOK_SECRET n'est pas renseignée : impossible de vérifier la signature du webhook.");
  if (!signatureHeader) throw new Error("En-tête Stripe-Signature absent.");
  return Stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
}

/** Pour les tests : signer un corps avec un secret donné, comme Stripe le ferait. */
export function signWebhookForTests(rawBody: string, secret: string): string {
  return Stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret });
}
