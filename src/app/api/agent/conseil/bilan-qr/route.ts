import { NextResponse } from "next/server";
import { authenticateAgent } from "@/server/services/stock-sync";
import { createBilanQr } from "@/server/services/counter-window";

export const dynamic = "force-dynamic";

/**
 * Le bilan par QR code (fondateur, 5 nov. 2026) : demandé par la fenêtre du poste, il rend le lien à montrer au patient. Le lien
 * porte la clé du bilan chiffré : il n'est ni journalisé ni gardé.
 */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { prescription?: string } | null;
  const prescriptionId = body?.prescription ?? "";
  if (!prescriptionId) return NextResponse.json({ ok: false, error: "Vente manquante." }, { status: 400 });
  const result = await createBilanQr(agent, { prescriptionId });
  return NextResponse.json(result, { status: result.ok ? 200 : 422, headers: { "Cache-Control": "no-store" } });
}
