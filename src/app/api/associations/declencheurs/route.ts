import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { searchAssociationTriggers, type TriggerOption, type TriggerSearch } from "@/server/services/stock-search";

export type { TriggerOption, TriggerSearch };

/**
 * « Quand ce produit ou ce médicament est dans la vente » (écran « Mes associations ») : un seul champ, qui cherche d'un
 * coup dans les médicaments du stock de l'officine (avec la quantité), ses produits, puis le reste du catalogue national.
 * Réservée à qui gère les règles de conseil de l'officine ; le stock interrogé est celui de la session, jamais un autre.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.RECOMMENDATION_RULES_MANAGE)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  const result: TriggerSearch = query.length === 0 ? { stock: [], catalogue: [] } : await searchAssociationTriggers(session.scope.pharmacyId, query);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
