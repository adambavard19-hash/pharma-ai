import { NextResponse } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { searchGammes } from "@/server/services/central-advice";

/** Toute une gamme de produits conseil d'un coup, pour une association (fondateur, 5 nov. 2026). Administrateur plateforme. */
export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ gammes: await searchGammes(query) }, { headers: { "Cache-Control": "no-store" } });
}
