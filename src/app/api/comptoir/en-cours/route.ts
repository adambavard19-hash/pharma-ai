import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { listLiveCounterSales } from "@/server/services/counter-scan";
import { myComptoirs } from "@/server/services/comptoirs";
import { NOT_LINKED, thisPcComptoir } from "@/server/services/post-link";

export const dynamic = "force-dynamic";

/**
 * Les ventes en cours venues de la douchette, pour l'écran d'accueil du comptoir. Portée : la session, et SES comptoirs
 * seulement — sur le navigateur lié à un poste, celui de CE PC (lu sans rien attribuer : la page s'en charge).
 */
export async function GET() {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE)) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const thisPc = await thisPcComptoir(session.scope.pharmacyId, session.scope.userId, false).catch(() => NOT_LINKED);
  const mine = await myComptoirs(session.scope, thisPc.postId);
  const sales = await listLiveCounterSales(session.scope.pharmacyId, mine.postIds);
  return NextResponse.json(
    { sales: sales.map((sale) => ({ id: sale.id, reference: sale.reference, status: sale.status, post: sale.counterPost, updatedAt: sale.updatedAt.toISOString(), lines: sale.lines.map((line) => ({ drugName: line.drugName ?? "", quantity: line.quantity ?? 1 })), recommendations: sale._count.recommendations })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
