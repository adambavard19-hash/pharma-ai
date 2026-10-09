import { NextResponse } from "next/server";
import { authenticateAgent } from "@/server/services/stock-sync";
import { saveCounterEmail } from "@/server/services/counter-window";

export const dynamic = "force-dynamic";

/**
 * L'adresse e-mail du patient, saisie dans la fenêtre du poste avec son accord. Chiffrée, utilisée pour le seul bilan de cette
 * vente. `email` vide : l'adresse est retirée.
 */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { prescription?: string; email?: string | null; consent?: boolean } | null;
  const prescriptionId = body?.prescription ?? "";
  if (!prescriptionId) return NextResponse.json({ ok: false, error: "Vente manquante." }, { status: 400 });
  const result = await saveCounterEmail(agent, { prescriptionId, email: body?.email?.trim() || null, consent: body?.consent === true });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
