import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { searchAssociationAdvice, type AdviceOption, type AdviceSearch } from "@/server/services/stock-search";

export type { AdviceOption, AdviceSearch };

/**
 * « PharmaBoost propose » (écran « Mes associations ») : dès la première lettre, les produits de l'officine et ses
 * médicaments SANS ordonnance, en stock d'abord. Réservée à qui écrit les associations de l'officine (ASSOCIATIONS_MANAGE) ; le stock interrogé
 * est celui de la session, jamais un autre.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.ASSOCIATIONS_MANAGE)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  const result: AdviceSearch = query.length === 0 ? { stock: [], empty: [] } : await searchAssociationAdvice(session.scope.pharmacyId, query);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
