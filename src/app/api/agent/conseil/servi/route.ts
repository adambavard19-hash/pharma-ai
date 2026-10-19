import { NextResponse } from "next/server";
import { authenticateAgent } from "@/server/services/stock-sync";
import { setCounterServedBy } from "@/server/services/counter-served";

export const dynamic = "force-dynamic";

/** « Qui a servi ce patient ? » : la vente passe aux résultats du collègue touché sur la bannière (agent 0.10.24 et suivants). */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { prescription?: unknown; user?: unknown } | null;
  const prescriptionId = typeof body?.prescription === "string" ? body.prescription : "";
  const userId = typeof body?.user === "string" ? body.user : "";
  if (!prescriptionId || !userId || prescriptionId.length > 80 || userId.length > 80) return NextResponse.json({ ok: false, error: "Vente ou personne manquante." }, { status: 400 });
  const result = await setCounterServedBy(agent, { prescriptionId, userId });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
