import { NextResponse } from "next/server";
import { authenticateAgent } from "@/server/services/stock-sync";
import { removeCounterCode } from "@/server/services/counter-scan";

export const dynamic = "force-dynamic";

/** Une ligne supprimée dans LGPI (journal « ABANDON_LIGNE ») : la boîte quitte la vente, ou le conseil bipé repasse « À proposer ». */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { prescription?: string; code?: string } | null;
  const prescriptionId = body?.prescription ?? "";
  const code = body?.code ?? "";
  if (!prescriptionId || !code) return NextResponse.json({ ok: false, error: "Vente ou code manquant." }, { status: 400 });
  const result = await removeCounterCode(agent, { prescriptionId, code });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
