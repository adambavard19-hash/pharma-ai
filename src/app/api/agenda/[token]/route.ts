import { buildDemoFeed, isAgendaToken } from "@/server/services/demo-agenda";

export const dynamic = "force-dynamic";

/**
 * Le flux de l'agenda PharmaBoost : l'appli Calendrier de l'iPhone (ou Google Agenda) s'y abonne une fois et
 * relit seule les démos réservées. Le lien porte un jeton secret, renouvelable dans la console (Agenda des démos).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await isAgendaToken(token.replace(/\.ics$/, "")))) return new Response("Agenda introuvable.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(await buildDemoFeed(), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="pharmaboost-demos.ics"', "Cache-Control": "no-store" },
  });
}
