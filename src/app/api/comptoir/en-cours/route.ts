import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { listLiveCounterSales } from "@/server/services/counter-scan";

export const dynamic = "force-dynamic";

/** Les ventes en cours venues de la douchette, pour l'écran d'accueil du comptoir. Portée : la session. */
export async function GET() {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE)) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const sales = await listLiveCounterSales(session.scope.pharmacyId);
  return NextResponse.json(
    { sales: sales.map((sale) => ({ id: sale.id, reference: sale.reference, status: sale.status, post: sale.counterPost, updatedAt: sale.updatedAt.toISOString(), lines: sale.lines.map((line) => ({ drugName: line.drugName ?? "", quantity: line.quantity ?? 1 })), recommendations: sale._count.recommendations })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
