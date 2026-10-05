import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { confirmNewsUnsubscribe } from "@/server/services/patient-news";
import { clientIp, rateLimited } from "@/server/http/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Le POST « en un clic » de la désinscription des nouveautés (RFC 8058).
 *
 * Les messageries qui affichent « Se désabonner » envoient un POST à l'adresse
 * de l'en-tête `List-Unsubscribe` : une PAGE n'y répondrait que par un 200 sans
 * rien enregistrer, et le patient resterait abonné alors que sa messagerie lui
 * dit le contraire. Le bouton de la page, lui, garde son action serveur ; les
 * deux n'ont qu'un seul chemin d'écriture, `confirmNewsUnsubscribe`, idempotent
 * et protégé par le jeton signé du lien.
 */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  // Une clé à part de celle du bouton : les POST des messageries viennent de leurs serveurs, pas du patient.
  if (rateLimited(`news-unsubscribe-un-clic:${clientIp(request)}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: "Trop de demandes. Réessayez dans quelques minutes." }, { status: 429 });
  }
  const { token } = await context.params;
  const result = await confirmNewsUnsubscribe(token);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: result.error }, { status: 400 });
}

/** Un GET n'écrit rien : il mène à la page, qui demande confirmation (les aperçus de messagerie et les antivirus ouvrent les liens). */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  redirect(`/nouveautes/desinscription/${encodeURIComponent(token)}`);
}
