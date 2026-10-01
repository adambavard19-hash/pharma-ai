import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { authenticateAgent, recordHeartbeat } from "@/server/services/stock-sync";

export const dynamic = "force-dynamic";

/** Signe de vie de l'agent, et retour des réglages courants (intervalle, chemins). */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé d'agent inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { version?: string; hostname?: string; notice?: string | null };
  if (agent.postId) {
    const post = await prisma.counterPost.update({
      where: { id: agent.postId },
      data: { lastSeenAt: new Date(), version: body.version ?? undefined, hostname: body.hostname ?? undefined, ...(typeof body.notice === "string" || body.notice === null ? { lastExportError: body.notice } : {}) },
      select: { exportPath: true, syncRequestedAt: true },
    });
    return NextResponse.json({ ok: true, intervalSeconds: 300, exportPath: post.exportPath, scansPath: null, syncRequestedAt: post.syncRequestedAt?.toISOString() ?? null });
  }
  await recordHeartbeat(agent, { version: body.version, hostname: body.hostname, notice: typeof body.notice === "string" || body.notice === null ? body.notice : undefined });
  const connection = await prisma.stockConnection.findUniqueOrThrow({ where: { id: agent.connectionId! }, select: { intervalSeconds: true, exportPath: true, scansPath: true } });
  return NextResponse.json({ ok: true, ...connection });
}
