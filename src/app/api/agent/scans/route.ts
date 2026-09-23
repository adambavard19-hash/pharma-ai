import { NextResponse } from "next/server";
import { authenticateAgent } from "@/server/services/stock-sync";
import { recordCounterScan } from "@/server/services/counter-scan";

export const dynamic = "force-dynamic";

/**
 * Un bip de douchette, envoyé par l'agent du poste de caisse : le code-barres
 * de la boîte, le nom du poste, l'heure. Rien d'autre ne transite.
 */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { code?: string; post?: string; scannedAt?: string } | null;
  const code = (body?.code ?? "").replace(/\D/g, "");
  if (!code) return NextResponse.json({ ok: false, error: "Code manquant." }, { status: 400 });
  const scannedAt = body?.scannedAt ? new Date(body.scannedAt) : null;
  const result = await recordCounterScan(agent, { code, post: body?.post ?? "poste", scannedAt: scannedAt && !Number.isNaN(scannedAt.getTime()) ? scannedAt : null });
  if (!result.ok) return NextResponse.json(result, { status: 422 });
  return NextResponse.json(result);
}
