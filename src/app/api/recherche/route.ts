import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { globalSearch } from "@/server/services/search";

/**
 * Recherche globale. La portée est déterminée par la session serveur :
 * aucun identifiant d'officine n'est accepté depuis le client.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await globalSearch(session, query);

  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "no-store" } },
  );
}
