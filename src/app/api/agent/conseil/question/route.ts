import { NextResponse } from "next/server";
import { authenticateAgent } from "@/server/services/stock-sync";
import { answerCounterQuestion } from "@/server/services/counter-questions";
import { readCounterNotice } from "@/server/services/counter-notice";

export const dynamic = "force-dynamic";

/**
 * Une réponse du pharmacien à l'arbre de questions, dans la fenêtre du poste de caisse (« pourquoi le patient prend-il son
 * paracétamol ? » → « douleur localisée » → « dos »). Elle débloque le conseil du bout de la branche. La réponse porte l'avis à
 * jour (questions ouvertes, conseils), pour que la fenêtre se redessine sans attendre le prochain tour d'interrogation.
 */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { prescription?: string; node?: string; choice?: string } | null;
  const prescriptionId = body?.prescription ?? "";
  const node = body?.node ?? "";
  const choice = body?.choice ?? "";
  if (!prescriptionId || !node || !choice) return NextResponse.json({ ok: false, error: "Demande incomplète." }, { status: 400 });
  // Le poste ne sait pas QUI répond (voir counter-window.ts) : la réponse porte le poste, jamais un nom.
  const result = await answerCounterQuestion({ pharmacyId: agent.scope.pharmacyId, userId: null, source: "POSTE", prescriptionId, node, choice });
  if (!result.ok) return NextResponse.json(result, { status: 422 });
  const read = await readCounterNotice(agent.scope.pharmacyId, prescriptionId);
  return NextResponse.json({ ok: true, questions: read?.notice.questions ?? [], guidance: read?.notice.guidance ?? [], items: read?.notice.items ?? [] });
}
