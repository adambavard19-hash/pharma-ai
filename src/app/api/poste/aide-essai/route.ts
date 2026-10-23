import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { answerCounterHelp, readHelpAdvice, HELP_MAX_QUESTION } from "@/server/services/counter-help";

export const dynamic = "force-dynamic";

/** L'essai de « Aide » dans l'aperçu (`/poste/ile?essai=…`), sans agent : la pharmacie de titulaire@pharma.ai. 404 en production. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { question?: unknown; conseil?: unknown };
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const advice = readHelpAdvice(body.conseil);
  if (question.length < 2 || question.length > HELP_MAX_QUESTION || !advice) return NextResponse.json({ ok: false, error: "Question vide ou trop longue." }, { status: 400 });
  const membership = await prisma.membership.findFirst({
    where: { user: { email: "titulaire@pharma.ai" }, role: "OWNER", isActive: true },
    select: { userId: true, pharmacy: { select: { id: true, organizationId: true, isDemo: true } } },
  });
  if (!membership) return NextResponse.json({ ok: false, error: "Compte titulaire@pharma.ai introuvable dans la base locale." }, { status: 404 });
  const result = await answerCounterHelp({ scope: { pharmacyId: membership.pharmacy.id, organizationId: membership.pharmacy.organizationId, userId: membership.userId }, pharmacyIsDemo: membership.pharmacy.isDemo, question, advice });
  return NextResponse.json(result);
}
