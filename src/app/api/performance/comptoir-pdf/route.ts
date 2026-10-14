import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { periodFromParam } from "@/core/counter/sales-report";
import { pdfResponseHeaders, salesReportPdfFile } from "@/server/services/sales-report-file";

export const dynamic = "force-dynamic";

/** Le rapport PDF de performance du comptoir, pour le titulaire : son officine (celle de la session), jamais une autre. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!session.permissions.has(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE)) return NextResponse.json({ error: "Accès réservé au titulaire" }, { status: 403 });
  const period = periodFromParam(new URL(request.url).searchParams.get("periode") ?? undefined);
  const file = await salesReportPdfFile(session.scope.pharmacyId, period);
  if (!file) return NextResponse.json({ error: "Officine introuvable" }, { status: 404 });
  return new NextResponse(Buffer.from(file.bytes), { headers: pdfResponseHeaders(file.fileName) });
}
