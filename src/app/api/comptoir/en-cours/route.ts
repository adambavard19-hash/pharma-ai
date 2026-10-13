import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadFinishedToday, loadLiveBoard } from "@/server/services/counter-board";
import { NOT_LINKED, thisPcComptoir } from "@/server/services/post-link";

export const dynamic = "force-dynamic";

/**
 * Les délivrances en cours (venues de la douchette), pour la page « Au comptoir » : comptoir, médicaments scannés,
 * conseils proposés et leur état. Avec `?terminees=1`, aussi les ventes terminées du jour (lues moins souvent).
 * Portée : la session, et SES comptoirs seulement — sur le navigateur lié à un poste, celui de CE PC (lu sans rien
 * attribuer : la page s'en charge).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE)) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const thisPc = await thisPcComptoir(session.scope.pharmacyId, session.scope.userId, false).catch(() => NOT_LINKED);
  const withFinished = new URL(request.url).searchParams.get("terminees") === "1";
  const [sales, finished] = await Promise.all([loadLiveBoard(session.scope, thisPc.postId), withFinished ? loadFinishedToday(session.scope, thisPc.postId) : Promise.resolve(undefined)]);
  return NextResponse.json({ sales, ...(finished ? { finished } : {}) }, { headers: { "Cache-Control": "no-store" } });
}
