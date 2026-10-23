import { NextResponse } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { prisma } from "@/server/db/client";
import { loadAdviceRows } from "@/server/services/counter-history";
import { resolveReportRange } from "@/core/counter/sales-report";
import { adviceCsv } from "@/core/counter/advice-export";
import { TIME_ZONE } from "@/config/constants";

export const dynamic = "force-dynamic";

/**
 * Tous les conseils proposés au comptoir d'une officine sur la période choisie dans la console (`?periode=…`), éventuellement
 * ceux d'un seul collaborateur (`?qui=…`) : un fichier Excel (CSV) pour les relire avec Donna. Ventes terminées, aucune donnée patient.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await context.params;
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: id.slice(0, 40) }, select: { id: true, name: true } });
  if (!pharmacy) return NextResponse.json({ error: "Officine introuvable" }, { status: 404 });
  const url = new URL(request.url);
  const range = resolveReportRange(url.searchParams.get("periode"), new Date(), TIME_ZONE);
  const who = url.searchParams.get("qui")?.slice(0, 120) || null;
  const rows = (await loadAdviceRows({ pharmacyId: pharmacy.id, from: range.from, to: range.to, take: 10000 })).filter((row) => !who || row.who === who);
  const slug = `${pharmacy.name}-${range.param}${who ? `-${who}` : ""}`.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9-]+/g, "-").replace(/-+/g, "-").slice(0, 90);
  return new NextResponse(adviceCsv(rows, TIME_ZONE), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="conseils-${slug}.csv"`, "Cache-Control": "no-store" },
  });
}
