import { NextResponse } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { searchKnownProducts } from "@/server/services/central-advice";

/**
 * Les produits connus des officines clientes (un par code-barres), pour choisir un produit déclencheur ou conseillé dans le
 * centre de contrôle des conseils. Session d'administrateur plateforme exigée.
 */
export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchKnownProducts(query);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
