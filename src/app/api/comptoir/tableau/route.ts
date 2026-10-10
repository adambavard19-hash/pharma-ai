import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadCounterDashboard } from "@/server/services/counter-dashboard";

export const dynamic = "force-dynamic";

/** L'état du comptoir, les chiffres du jour et l'activité récente, pour la page « Nouvelle vente ». Portée : la session. */
export async function GET() {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE)) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const data = await loadCounterDashboard(session.scope, new Date(), { canAssign: session.permissions.has(PERMISSIONS.PRODUCT_IMPORT) });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
