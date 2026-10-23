import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { authenticateAgent } from "@/server/services/stock-sync";
import { askAtCounter, ASK_MAX_CHARS } from "@/server/services/counter-ask";

export const dynamic = "force-dynamic";

/**
 * « Demander un conseil » depuis la bannière du poste, sans scan (fondateur, 22 oct. 2026) : le poste, authentifié par SA
 * clé, envoie ce que le patient demande ; la réponse a la forme d'une vente bipée (l'agent la montre comme après un bip).
 * La demande est comptée pour la personne attribuée au comptoir, sinon pour le titulaire.
 */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé d'agent inconnue ou révoquée." }, { status: 401 });
  if (!agent.postId) return NextResponse.json({ ok: false, error: "Réservé aux postes de caisse." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { texte?: unknown };
  const text = typeof body.texte === "string" ? body.texte.replace(/\s+/g, " ").trim() : "";
  if (text.length < 2 || text.length > ASK_MAX_CHARS) return NextResponse.json({ ok: false, error: "Demande vide ou trop longue." }, { status: 400 });
  const post = await prisma.counterPost.findUnique({ where: { id: agent.postId }, select: { assignedUserId: true } });
  const scope = post?.assignedUserId ? { ...agent.scope, userId: post.assignedUserId } : agent.scope;
  try {
    const { id, body: notice } = await askAtCounter({ scope, pharmacyIsDemo: agent.pharmacyIsDemo, text });
    return NextResponse.json({ ok: true, id, notice }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[poste] demande du comptoir impossible", error);
    return NextResponse.json({ ok: false, error: "La demande n'a pas pu être analysée." }, { status: 500 });
  }
}
