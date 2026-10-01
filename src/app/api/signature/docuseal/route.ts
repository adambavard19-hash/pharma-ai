import { NextResponse } from "next/server";
import { DOCUSEAL_SECRET_HEADER } from "@/core/signature";
import { getSignatureProvider } from "@/server/signature/registry";
import { handleSignatureEvent } from "@/server/services/sales/contracts";

export const dynamic = "force-dynamic";

/**
 * Webhook DocuSeal. La notification est authentifiée par l'en-tête secret
 * déclaré dans DocuSeal (sinon son statut est relu par l'API), traduite, puis
 * appliquée au contrat concerné.
 */
export async function POST(request: Request) {
  const provider = getSignatureProvider();
  if (provider.info.id !== "docuseal") return NextResponse.json({ ignored: true, reason: "DocuSeal n'est pas le prestataire configuré" }, { status: 202 });
  const rawBody = await request.text().catch(() => "");
  let event;
  try {
    event = await provider.parseWebhook(rawBody, { [DOCUSEAL_SECRET_HEADER]: request.headers.get(DOCUSEAL_SECRET_HEADER) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Vérification impossible." }, { status: 502 });
  }
  if (!event) return NextResponse.json({ ignored: true }, { status: 202 });
  try {
    const applied = await handleSignatureEvent(event);
    return NextResponse.json({ applied });
  } catch (error) {
    // Statut non relu (DocuSeal injoignable) : on répond en erreur pour qu'il réessaie.
    return NextResponse.json({ error: error instanceof Error ? error.message : "Application impossible." }, { status: 502 });
  }
}
