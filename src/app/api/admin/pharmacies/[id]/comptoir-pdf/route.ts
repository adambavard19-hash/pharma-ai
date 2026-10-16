import { NextResponse } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { pdfResponseHeaders, salesReportPdfFile } from "@/server/services/sales-report-file";

export const dynamic = "force-dynamic";

/** Le rapport PDF de performance du comptoir d'une officine, depuis la console de PharmaBoost. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await context.params;
  // La période choisie dans la console, telle quelle (« jour », « 2026-10-16 », « 2026-10 »…) : le PDF dit la même chose.
  const param = (new URL(request.url).searchParams.get("periode") ?? "semaine").slice(0, 20);
  const file = await salesReportPdfFile(id.slice(0, 40), { param });
  if (!file) return NextResponse.json({ error: "Officine introuvable" }, { status: 404 });
  return new NextResponse(Buffer.from(file.bytes), { headers: pdfResponseHeaders(file.fileName) });
}
