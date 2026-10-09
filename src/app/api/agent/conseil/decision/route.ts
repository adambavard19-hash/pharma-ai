import { NextResponse } from "next/server";
import { authenticateAgent } from "@/server/services/stock-sync";
import { decideCounterAdvice } from "@/server/services/counter-window";
import { readCounterNotice } from "@/server/services/counter-notice";
import type { NoticeOutcome } from "@/core/counter/notice";

export const dynamic = "force-dynamic";

const OUTCOMES = new Set<NoticeOutcome>(["SOLD", "NOT_SOLD", "NONE"]);

/**
 * « Vendu » / « Non vendu » dans la fenêtre du poste de caisse. C'est une déclaration du pharmacien au comptoir : elle est
 * enregistrée comme telle (COUNTER_DECLARED), jamais comme une vente lue dans le logiciel de gestion. La réponse porte les
 * conseils à jour, pour que la fenêtre se redessine sans attendre le prochain tour d'interrogation.
 */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { prescription?: string; recommendation?: string; outcome?: string } | null;
  const prescriptionId = body?.prescription ?? "";
  const recommendationId = body?.recommendation ?? "";
  const outcome = body?.outcome as NoticeOutcome;
  if (!prescriptionId || !recommendationId || !OUTCOMES.has(outcome)) return NextResponse.json({ ok: false, error: "Demande incomplète." }, { status: 400 });
  const result = await decideCounterAdvice(agent, { prescriptionId, recommendationId, outcome });
  if (!result.ok) return NextResponse.json(result, { status: 422 });
  const read = await readCounterNotice(agent.scope.pharmacyId, prescriptionId);
  return NextResponse.json({ ok: true, outcome: result.outcome, items: read?.notice.items ?? [] });
}
