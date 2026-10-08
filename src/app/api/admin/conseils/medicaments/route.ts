import { NextResponse } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { searchSpecialties } from "@/server/services/drug-identification";

/** Recherche dans le catalogue national des médicaments, pour choisir le médicament qui déclenche une association commune. */
export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const found = await searchSpecialties(query, 15);
  const results = found.map((candidate) => ({ id: candidate.id, name: candidate.name, substances: candidate.substances.slice(0, 4), marketed: candidate.marketed }));
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
