import { NextResponse } from "next/server";
import { authenticateAgent } from "@/server/services/stock-sync";
import { recordCounterScan } from "@/server/services/counter-scan";
import { parseExpiry } from "@/core/counter/box-expiry";

export const dynamic = "force-dynamic";

/**
 * Un bip de douchette, envoyé par l'agent du poste de caisse : le code-barres
 * de la boîte, le nom du poste, l'heure. Rien d'autre ne transite.
 */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) {
    // Un poste dont la clé n'existe plus (comptoir supprimé, poste réinstallé) bipe dans le vide : son nom dans le journal
    // permet de retrouver l'ordinateur à relier de nouveau. Le nom de l'ordinateur seulement, jamais la clé ni le code.
    const lost = (await request.json().catch(() => null)) as { post?: string } | null;
    console.warn(`[scan] clé inconnue ou révoquée — ordinateur « ${String(lost?.post ?? "?").replace(/[^\w .-]/g, "").slice(0, 40)} »`);
    return NextResponse.json({ ok: false, error: "Clé inconnue ou révoquée." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { code?: string; post?: string; scannedAt?: string; expiresOn?: string } | null;
  const code = (body?.code ?? "").replace(/\D/g, "");
  if (!code) return NextResponse.json({ ok: false, error: "Code manquant." }, { status: 400 });
  const scannedAt = body?.scannedAt ? new Date(body.scannedAt) : null;
  const result = await recordCounterScan(agent, { code, post: body?.post ?? "poste", scannedAt: scannedAt && !Number.isNaN(scannedAt.getTime()) ? scannedAt : null, expiresOn: parseExpiry(body?.expiresOn) });
  if (!result.ok) return NextResponse.json(result, { status: 422 });
  return NextResponse.json(result);
}
