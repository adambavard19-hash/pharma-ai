import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { searchSpecialties } from "@/server/services/drug-identification";

export type DrugSpecialtyResult = { id: string; name: string; form: string | null; substances: string[]; marketed: boolean };

/**
 * Recherche dans le catalogue national des médicaments (nom ou substance), pour choisir le médicament qui déclenche une
 * association (écran « Mes associations »). Réservée à qui gère les règles de conseil de l'officine. Elle rend des
 * spécialités, pas des boîtes : la recherche de l'écran de vente (`/api/medicaments/recherche`) rend des boîtes.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.RECOMMENDATION_RULES_MANAGE)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const found = await searchSpecialties(query, 15);
  const results: DrugSpecialtyResult[] = found.map((candidate) => ({ id: candidate.id, name: candidate.name, form: candidate.pharmaceuticalForm, substances: candidate.substances.slice(0, 4), marketed: candidate.marketed }));
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
