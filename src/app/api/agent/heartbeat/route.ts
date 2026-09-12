import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { authenticateAgent, recordHeartbeat } from "@/server/services/stock-sync";

export const dynamic = "force-dynamic";

/** Signe de vie de l'agent, et retour des réglages courants (intervalle, chemins). */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé d'agent inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { version?: string; hostname?: string };
  await recordHeartbeat(agent, body);
  const connection = await prisma.stockConnection.findUniqueOrThrow({ where: { id: agent.connectionId }, select: { intervalSeconds: true, exportPath: true, scansPath: true } });
  return NextResponse.json({ ok: true, ...connection });
}
