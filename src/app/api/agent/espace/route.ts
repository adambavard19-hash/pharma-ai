import { NextResponse } from "next/server";
import { authenticateAgent } from "@/server/services/stock-sync";
import { issuePostLink } from "@/server/services/post-link";
import { recordAudit } from "@/server/audit/log";
import { POST_LINK_PATH } from "@/core/counter/post-link";

export const dynamic = "force-dynamic";

/**
 * « Ouvrir mon espace PharmaBoost » : le poste de caisse, authentifié par SA clé, demande un lien à usage unique (10 minutes)
 * qu'il ouvre aussitôt dans le navigateur de son PC (core/counter/post-link.ts). Le jeton n'est donné qu'ici, une fois ; la
 * base n'en garde que l'empreinte. La clé du serveur de stock n'a pas de comptoir : refusée.
 */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé d'agent inconnue ou révoquée." }, { status: 401 });
  if (!agent.postId) return NextResponse.json({ ok: false, error: "Réservé aux postes de caisse." }, { status: 403 });
  const link = await issuePostLink(agent.postId);
  if (!link) return NextResponse.json({ ok: false, error: "Poste introuvable." }, { status: 404 });
  await recordAudit({ action: "counter_post.link_issued", entityType: "CounterPost", entityId: agent.postId, pharmacyId: agent.scope.pharmacyId });
  return NextResponse.json({ ok: true, jeton: link.token, chemin: POST_LINK_PATH, expiresAt: link.expiresAt.toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
