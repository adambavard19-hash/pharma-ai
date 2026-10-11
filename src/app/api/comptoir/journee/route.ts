import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadDayRecap } from "@/server/services/robot-tips";

export const dynamic = "force-dynamic";

/** « Votre journée », lu à la demande (ou à partir de 18 h) par le robot de « Nouvelle vente ». Portée : la session. */
export async function GET() {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE)) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const recap = await loadDayRecap(session.scope, new Date());
  return NextResponse.json(recap, { headers: { "Cache-Control": "no-store" } });
}
