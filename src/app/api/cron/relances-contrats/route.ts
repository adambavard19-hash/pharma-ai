import { NextResponse } from "next/server";
import { runContractReminders } from "@/server/services/sales/contracts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Passage quotidien des relances de contrat (tâche planifiée Vercel). Protégé
 * par CRON_SECRET : sans secret configuré, la route refuse, jamais ouverte.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const report = await runContractReminders();
  return NextResponse.json(report);
}
