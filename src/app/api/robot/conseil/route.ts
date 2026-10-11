import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadCounterRobotTips } from "@/server/services/robot-tips";

export const dynamic = "force-dynamic";

/**
 * La phrase du moment du petit robot compagnon (coin de l'écran, pages du logiciel), lue quand on l'ouvre : les mêmes
 * faits que le robot de « Nouvelle vente » (challenge proche d'un palier, dates courtes, stock), par la portée de la
 * session. Aucune donnée de patient, aucun montant.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const canUpdateStock = session.permissions.has(PERMISSIONS.PRODUCT_IMPORT);
  const pharmacy = await prisma.pharmacy
    .findUnique({ where: { id: session.scope.pharmacyId }, select: { stockSyncedAt: true } })
    .catch(() => null);
  const tips = await loadCounterRobotTips(session.scope, {
    canUpdateStock,
    canSeeChallenges: session.permissions.has(PERMISSIONS.TEAM_MANAGE),
    isDemo: session.pharmacy.isDemo,
    stockSyncedAt: pharmacy?.stockSyncedAt ?? null,
  }).catch(() => []);
  return NextResponse.json({ tips }, { headers: { "Cache-Control": "no-store" } });
}
