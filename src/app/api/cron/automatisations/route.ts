import { NextResponse } from "next/server";
import { runAutomations } from "@/server/services/admin/automations";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Passage quotidien des relances automatiques (tâche planifiée Vercel).
 * Protégé par CRON_SECRET : sans secret configuré, la route refuse, jamais
 * ouverte. Sûr par défaut : tant qu'aucune règle n'est activée dans la
 * console, le passage ne lit ni n'envoie rien.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const report = await runAutomations({ now: new Date(), dryRun: false });
  // Le détail par officine reste dans la console : la réponse ne porte que les compteurs.
  const { dryRun, enabledRules, planned, sent, failed, simulated, skipped, internal, alreadyDone, errors } = report;
  return NextResponse.json({ dryRun, enabledRules, planned, sent, failed, simulated, skipped, internal, alreadyDone, errors });
}
