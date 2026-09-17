import { NextResponse } from "next/server";
import { constructWebhookEvent, StripeNotConfiguredError } from "@/server/billing/stripe-client";
import { handleStripeEvent } from "@/server/billing/webhooks";

export const dynamic = "force-dynamic";

/**
 * Webhook Stripe. Le corps est lu BRUT : la signature porte sur les octets
 * envoyés. Un événement non signé est refusé (400) ; un événement déjà reçu
 * est reconnu et ignoré (200) ; une erreur de traitement répond 500 pour que
 * Stripe réessaie.
 */
export async function POST(request: Request) {
  const rawBody = await request.text().catch(() => "");
  let event;
  try {
    event = constructWebhookEvent(rawBody, request.headers.get("stripe-signature"));
  } catch (error) {
    const status = error instanceof StripeNotConfiguredError ? 503 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Signature invalide." }, { status });
  }
  try {
    const outcome = await handleStripeEvent(event);
    return NextResponse.json({ received: true, ...outcome });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Traitement impossible." }, { status: 500 });
  }
}
