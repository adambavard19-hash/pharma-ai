import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { confirmOfferOptOut } from "@/server/services/admin/campaigns";
import { clientIp, rateLimited } from "@/server/http/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Le POST « en un clic » de la désinscription (RFC 8058). Les messageries qui
 * affichent « Se désabonner » envoient un POST à l'adresse de l'en-tête
 * `List-Unsubscribe` : une PAGE n'y répondrait que par un 200 sans rien
 * enregistrer, et l'adresse resterait abonnée. Le bouton de la page appelle
 * la même route : un seul chemin d'écriture, idempotent, protégé par le jeton.
 */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  if (rateLimited(`offers-optout:${clientIp(request)}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: "Trop de demandes. Réessayez dans quelques minutes." }, { status: 429 });
  }
  const { token } = await context.params;
  const result = await confirmOfferOptOut(token);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: result.error }, { status: 400 });
}

/** Un GET n'écrit rien : il mène à la page, qui demande confirmation (les aperçus de messagerie ouvrent les liens). */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  redirect(`/offres/desinscription/${encodeURIComponent(token)}`);
}
