import { NextResponse } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { searchSpecialties } from "@/server/services/drug-identification";
import { officialAtcForCis } from "@/core/reference/atc/official-atc";

/**
 * Recherche dans le catalogue national des médicaments, pour choisir le médicament qui déclenche un conseil. Chaque résultat porte
 * sa famille officielle (Open Medic) : la console peut déclencher un conseil pour ce médicament ou pour toute sa famille.
 */
export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const found = await searchSpecialties(query, 15);
  const results = found.map((candidate) => {
    const official = officialAtcForCis(candidate.cisCode);
    return { id: candidate.id, name: candidate.name, substances: candidate.substances.slice(0, 4), marketed: candidate.marketed, atcCode: official?.atcCode ?? null, family: official?.therapeuticClass ?? null };
  });
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
