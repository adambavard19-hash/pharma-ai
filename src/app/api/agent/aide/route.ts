import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { authenticateAgent } from "@/server/services/stock-sync";
import { answerCounterHelp, readHelpAdvice, HELP_MAX_QUESTION } from "@/server/services/counter-help";

export const dynamic = "force-dynamic";

/** « Aide » de la bannière du poste (fondateur, 22 oct. 2026) : la question du pharmacien sur le conseil affiché. */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé d'agent inconnue ou révoquée." }, { status: 401 });
  if (!agent.postId) return NextResponse.json({ ok: false, error: "Réservé aux postes de caisse." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { question?: unknown; conseil?: unknown };
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const advice = readHelpAdvice(body.conseil);
  if (question.length < 2 || question.length > HELP_MAX_QUESTION || !advice) return NextResponse.json({ ok: false, error: "Question vide ou trop longue." }, { status: 400 });
  const post = await prisma.counterPost.findUnique({ where: { id: agent.postId }, select: { assignedUserId: true } });
  const scope = post?.assignedUserId ? { ...agent.scope, userId: post.assignedUserId } : agent.scope;
  const result = await answerCounterHelp({ scope, pharmacyIsDemo: agent.pharmacyIsDemo, question, advice });
  return NextResponse.json(result, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
