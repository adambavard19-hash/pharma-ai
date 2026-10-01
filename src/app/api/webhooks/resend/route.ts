import { NextResponse } from "next/server";
import { getEnv } from "@/config/env";
import { verifySvixSignature } from "@/core/email/webhook-signature";
import { applyResendEvent } from "@/server/services/email-dispatch";

/**
 * Événements de délivrance Resend (délivré, rejeté, signalé). À déclarer dans
 * Resend → Webhooks avec l'URL https://pharmaboost.app/api/webhooks/resend et
 * le secret dans RESEND_WEBHOOK_SECRET. Sans secret, la route refuse tout.
 */
export async function POST(request: Request) {
  const secret = getEnv().RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook non configuré." }, { status: 503 });
  const body = await request.text();
  const valid = verifySvixSignature({
    secret,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body,
  });
  if (!valid) return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Corps illisible." }, { status: 400 });
  }
  const applied = await applyResendEvent(event as Parameters<typeof applyResendEvent>[0]);
  return NextResponse.json({ ok: true, applied });
}
