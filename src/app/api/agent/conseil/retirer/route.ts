import { NextResponse } from "next/server";
import { authenticateAgent } from "@/server/services/stock-sync";
import { removeCounterLine } from "@/server/services/counter-scan";

export const dynamic = "force-dynamic";

/** « Retirer » une boîte de la bannière du poste : le patient l'a reposée. La vente repart à l'analyse avec ce qui reste. */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { prescription?: string; line?: string } | null;
  const prescriptionId = body?.prescription ?? "";
  const lineId = body?.line ?? "";
  if (!prescriptionId || !lineId) return NextResponse.json({ ok: false, error: "Vente ou boîte manquante." }, { status: 400 });
  const result = await removeCounterLine(agent, { prescriptionId, lineId });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
