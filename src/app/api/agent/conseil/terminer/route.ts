import { NextResponse } from "next/server";
import { authenticateAgent } from "@/server/services/stock-sync";
import { finishCounterSale } from "@/server/services/counter-window";

export const dynamic = "force-dynamic";
// Le bilan au patient part pendant cet appel : le temps d'un envoi e-mail.
export const maxDuration = 30;

/** « Vente terminée » : résultats enregistrés, bilan envoyé si le patient a donné son accord. Rejouable sans double envoi. */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { prescription?: string } | null;
  const prescriptionId = body?.prescription ?? "";
  if (!prescriptionId) return NextResponse.json({ ok: false, error: "Vente manquante." }, { status: 400 });
  const result = await finishCounterSale(agent, { prescriptionId });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
