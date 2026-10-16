import { NextResponse } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { pdfResponseHeaders } from "@/server/services/sales-report-file";
import { pharmaciesPerformancePdf } from "@/server/services/pharmacies-performance";
import { resolveReportRange } from "@/core/counter/sales-report";
import { TIME_ZONE } from "@/config/constants";

export const dynamic = "force-dynamic";

/** Le PDF de la page « Performance » de la console : toutes les pharmacies, sur la période choisie. */
export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const now = new Date();
  const range = resolveReportRange((new URL(request.url).searchParams.get("periode") ?? "semaine").slice(0, 20), now, TIME_ZONE);
  const file = await pharmaciesPerformancePdf(range, now);
  return new NextResponse(Buffer.from(file.bytes), { headers: pdfResponseHeaders(file.fileName) });
}
