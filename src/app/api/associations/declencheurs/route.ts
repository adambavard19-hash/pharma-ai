import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { searchAssociationTriggers, type TriggerOption, type TriggerSearch as StockTriggers } from "@/server/services/stock-search";
import { searchDrugClasses } from "@/core/associations/drug-classes";

export type { TriggerOption };
/** En plus du stock et du catalogue : les familles de médicaments (« amox » → Pénicillines), à choisir d'un coup. */
export type DrugClassOption = { code: string; label: string; detail: string };
export type TriggerSearch = StockTriggers & { classes: DrugClassOption[] };

/**
 * « Quand ce produit ou ce médicament est dans la vente » (écran « Mes associations ») : un seul champ, qui cherche d'un
 * coup dans les médicaments du stock de l'officine (avec la quantité), ses produits, puis le reste du catalogue national.
 * Réservée à qui écrit les associations de l'officine (ASSOCIATIONS_MANAGE) ; le stock interrogé est celui de la session, jamais un autre.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.ASSOCIATIONS_MANAGE)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  const found = query.length === 0 ? { stock: [], catalogue: [] } : await searchAssociationTriggers(session.scope.pharmacyId, query);
  const classes = searchDrugClasses(query).map(({ code, label, detail }) => ({ code, label, detail }));
  const result: TriggerSearch = { ...found, classes };
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
