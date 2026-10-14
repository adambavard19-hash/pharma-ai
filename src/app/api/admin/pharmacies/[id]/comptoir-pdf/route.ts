import { NextResponse } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { periodFromParam } from "@/core/counter/sales-report";
import { pdfResponseHeaders, salesReportPdfFile } from "@/server/services/sales-report-file";

export const dynamic = "force-dynamic";

/** Le rapport PDF de performance du comptoir d'une officine, depuis la console de PharmaBoost. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await context.params;
  const period = periodFromParam(new URL(request.url).searchParams.get("periode") ?? undefined);
  const file = await salesReportPdfFile(id.slice(0, 40), period);
  if (!file) return NextResponse.json({ error: "Officine introuvable" }, { status: 404 });
  return new NextResponse(Buffer.from(file.bytes), { headers: pdfResponseHeaders(file.fileName) });
}
