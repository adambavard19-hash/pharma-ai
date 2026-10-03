import { NextResponse } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { adminSearch } from "@/server/services/admin/search";

/**
 * Recherche globale de la console. Session d'administrateur plateforme
 * exigée : un compte d'officine ou de commercial reçoit 401.
 */
export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await adminSearch(query);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
