import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { authenticateAgent, recordHeartbeat } from "@/server/services/stock-sync";
import { postDrawsRobot } from "@/core/robot/single-robot";
import { personRobotLook } from "@/core/robot/counter-look";

export const dynamic = "force-dynamic";

/**
 * Signe de vie de l'agent, et retour des réglages courants (intervalle, chemins, robot pour la bannière).
 *
 * Poste de caisse :
 *  - il dit la fenêtre qu'il affiche ; s'il DESSINE le robot (l'île ou la bannière), l'instant est noté (`robotShownAt`) :
 *    le navigateur lié à ce poste n'en dessine pas un second (core/robot/single-robot.ts). Ancienne fenêtre, notification
 *    seule, ancien agent : effacé, l'espace garde son robot ;
 *  - le robot qu'il reçoit est celui de la PERSONNE connectée à ce poste (1 robot pour 1 espace) ; personne : le robot de
 *    la marque (null).
 */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé d'agent inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { version?: string; hostname?: string; notice?: string | null; fenetre?: unknown };
  if (agent.postId) {
    const postId = agent.postId;
    const now = new Date();
    const save = (withRobot: boolean) =>
      prisma.counterPost.update({
        where: { id: postId },
        data: {
          lastSeenAt: now,
          version: body.version ?? undefined,
          hostname: body.hostname ?? undefined,
          ...(withRobot ? { robotShownAt: postDrawsRobot(body.fenetre) ? now : null } : {}),
          ...(typeof body.notice === "string" || body.notice === null ? { lastExportError: body.notice } : {}),
        },
        select: { exportPath: true, syncRequestedAt: true, assignedUserId: true },
      });
    // `robotShownAt` est un confort : s'il ne s'écrit pas (code en ligne avant la migration), le signe de vie passe quand
    // même — sans lui, tous les postes se diraient « hors ligne ». Une vraie erreur échoue aussi au second essai.
    const post = await save(true).catch(() => save(false));
    return NextResponse.json({ ok: true, intervalSeconds: 300, exportPath: post.exportPath, scansPath: null, syncRequestedAt: post.syncRequestedAt?.toISOString() ?? null, robotLook: post.assignedUserId ? personRobotLook(post.assignedUserId) : null });
  }
  await recordHeartbeat(agent, { version: body.version, hostname: body.hostname, notice: typeof body.notice === "string" || body.notice === null ? body.notice : undefined });
  const connection = await prisma.stockConnection.findUniqueOrThrow({ where: { id: agent.connectionId! }, select: { intervalSeconds: true, exportPath: true, scansPath: true } });
  return NextResponse.json({ ok: true, ...connection });
}
