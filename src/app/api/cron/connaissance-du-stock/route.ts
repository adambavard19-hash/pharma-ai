import { NextResponse } from "next/server";
import { after } from "next/server";
import { runStockLearningPass } from "@/server/services/stock-learning";
import { MAX_CHAIN_DEPTH, scheduleLearningContinuation } from "@/server/services/stock-learning-chain";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Le temps qu'on se donne par passage : on ne commence pas un lot qu'on ne peut pas finir avant la limite de la fonction. */
const BUDGET_MS = 240_000;

/**
 * Le passage qui apprend le stock des pharmacies : produits restés à ranger, médicaments pas encore classés. Ce qui reste incompris
 * est inscrit dans « Produits à connaître » (console super admin).
 *
 * Déclenché par la tâche quotidienne (`/api/cron/automatisations`), par l'enregistrement d'un stock, et par lui-même quand il reste du
 * travail (`?profondeur=` compte les relais). `?pharmacie=` limite le passage à une pharmacie. Protégé par CRON_SECRET ; rejouable.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const pharmacyId = params.get("pharmacie") ?? undefined;
  const depth = Math.max(0, Math.min(MAX_CHAIN_DEPTH + 1, Number.parseInt(params.get("profondeur") ?? "0", 10) || 0));

  const pass = await runStockLearningPass({ deadlineAt: Date.now() + BUDGET_MS, pharmacyId });
  if (pass.moreToDo && depth < MAX_CHAIN_DEPTH) after(() => scheduleLearningContinuation({ pharmacyId, depth: depth + 1 }).then(() => undefined));
  return NextResponse.json({ ...pass, depth });
}
