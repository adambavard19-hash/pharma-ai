import { NextResponse } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { prisma } from "@/server/db/client";
import { officialCisForAtcPrefix, officialTherapeuticClass } from "@/core/reference/atc/official-atc";

const SHOWN = 8;

/**
 * Ce que couvre un code ATC, pour l'écrire sans se tromper d'un chiffre : la classe officielle et les médicaments commercialisés
 * du catalogue national qui portent ce code (ou commencent par lui), comme le comptoir les reconnaîtra.
 */
export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const code = (new URL(request.url).searchParams.get("code") ?? "").replace(/\s+/g, "").toUpperCase().slice(0, 10);
  const cis = officialCisForAtcPrefix(code);
  const rows = cis.length === 0 ? [] : await prisma.drugSpecialty.findMany({ where: { cisCode: { in: cis }, marketingStatus: "Commercialisée" }, select: { name: true }, orderBy: { name: "asc" } });
  const names = [...new Set(rows.map((row) => row.name.split(",")[0].trim()))];
  return NextResponse.json(
    { code, therapeuticClass: cis.length > 0 ? officialTherapeuticClass(code) : null, count: names.length, names: names.slice(0, SHOWN) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
