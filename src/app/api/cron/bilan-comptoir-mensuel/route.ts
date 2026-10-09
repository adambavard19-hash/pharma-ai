import { NextResponse } from "next/server";
import { sendMonthlyCounterReports } from "@/server/services/counter-results";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Le 1er de chaque mois : le bilan du comptoir du mois écoulé part à chaque titulaire dont l'équipe a terminé des ventes avec la
 * fenêtre du poste de caisse (tâche planifiée Vercel). Protégé par CRON_SECRET : sans secret configuré, la route refuse.
 * Rejouable sans double envoi.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return NextResponse.json(await sendMonthlyCounterReports());
}
