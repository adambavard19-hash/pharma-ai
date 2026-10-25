import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { authenticateAgent } from "@/server/services/stock-sync";
import { SETTLE_MS } from "@/core/counter/settle";
import { settleAndAnalyse as settle } from "@/server/services/counter-settle";
import { getEnv } from "@/config/env";
import { readCounterNotice } from "@/server/services/counter-notice";
import { counterTeamFor } from "@/server/services/counter-served";

export const dynamic = "force-dynamic";
// L'analyse peut dépasser dix secondes : on le déclare à l'hébergeur.
export const maxDuration = 60;

type Agent = { scope: { pharmacyId: string; userId: string; organizationId: string } };

const settleAndAnalyse = (agent: Agent, id: string) => settle(agent.scope, id);

/** L'état de la vente et l'avis qui s'en déduit, lu en base ; `null` quand la vente n'est pas celle de ce poste. */
function readNotice(agent: Agent, id: string) {
  return readCounterNotice(agent.scope.pharmacyId, id);
}

/**
 * L'avis de comptoir d'une vente bipée, pour le poste de caisse qui l'a
 * ouverte : alertes puis conseils, en quelques lignes, dès que l'analyse est
 * prête. Le poste l'interroge après chaque bip et affiche l'avis en coin
 * d'écran, par-dessus le LGO. Aucune donnée patient ne sort : les noms des
 * boîtes, les alertes et les produits conseillés, rien d'autre.
 *
 * Quand c'est cette interrogation qui déclenche l'analyse, la réponse porte DÉJÀ le résultat : le poste n'attend pas
 * un tour d'interrogation de plus (deux secondes) pour le lire.
 */
export async function GET(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé inconnue ou révoquée." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("prescription") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Vente manquante." }, { status: 400 });

  let read = await readNotice(agent, id);
  if (!read) return NextResponse.json({ ok: false, error: "Vente inconnue pour ce poste." }, { status: 404 });
  if (read.status === "NEEDS_VERIFICATION") {
    try {
      let analysed = await settleAndAnalyse(agent, id);
      if (!analysed) {
        // Pas encore le calme après le dernier bip : plutôt que de répondre « pas prêt » et d'attendre la prochaine question du poste,
        // on attend ici les quelques centaines de millisecondes qui manquent, puis on analyse — le conseil part dans CETTE réponse.
        const fresh = await prisma.prescription.findUnique({ where: { id }, select: { status: true, updatedAt: true } });
        const remaining = fresh?.status === "NEEDS_VERIFICATION" ? SETTLE_MS - (Date.now() - fresh.updatedAt.getTime()) : -1;
        if (remaining > 0 && remaining <= SETTLE_MS) {
          await new Promise((resolve) => setTimeout(resolve, remaining + 30));
          analysed = await settleAndAnalyse(agent, id);
        }
      }
      if (analysed) read = (await readNotice(agent, id)) ?? read;
    } catch (error) {
      console.error("[conseil] analyse depuis le poste de caisse", error);
    }
  }
  // L'équipe, pour « Qui a servi ce patient ? » en fin de vente : prénoms et identifiants, rien d'autre.
  const served = await counterTeamFor(agent.scope.pharmacyId, id).catch(() => ({ team: [], servedBy: null }));
  return NextResponse.json({ ok: true, ...read.notice, followUp: read.followUp, ...served, url: `${getEnv().APP_URL}/vente/${id}` });
}
