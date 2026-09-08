import { NextResponse } from "next/server";
import { getSignatureProvider } from "@/server/signature/registry";
import { handleSignatureEvent } from "@/server/services/sales/contracts";

export const dynamic = "force-dynamic";

/**
 * Webhook du prestataire de signature. La notification est vérifiée par le
 * fournisseur (signature HMAC), traduite, puis appliquée au contrat concerné.
 */
export async function POST(request: Request) {
  const provider = getSignatureProvider();
  if (provider.info.capability !== "LIVE") return NextResponse.json({ ignored: true, reason: "aucun prestataire configuré" }, { status: 202 });
  const payload = await request.json().catch(() => null);
  const event = await provider.parseWebhook(payload, { "x-yousign-signature-256": request.headers.get("x-yousign-signature-256") });
  if (!event) return NextResponse.json({ ignored: true }, { status: 202 });
  const applied = await handleSignatureEvent(event);
  return NextResponse.json({ applied });
}
