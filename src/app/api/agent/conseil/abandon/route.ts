import { NextResponse } from "next/server";
import { authenticateAgent } from "@/server/services/stock-sync";
import { abandonCounterSale } from "@/server/services/counter-scan";

export const dynamic = "force-dynamic";

/** La vente abandonnée dans LGPI (journal « ABANDON_VENTE ») : la vente PharmaBoost ouverte de ce poste est annulée. */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { prescription?: string } | null;
  const prescriptionId = body?.prescription ?? "";
  if (!prescriptionId) return NextResponse.json({ ok: false, error: "Vente manquante." }, { status: 400 });
  const result = await abandonCounterSale(agent, { prescriptionId });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
