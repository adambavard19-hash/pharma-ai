import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { searchDrugCatalog } from "@/server/services/drug-catalog";
import { normalizeSearchText } from "@/core/reference";

export type DrugLookupResult = {
  presentationId: string;
  cip13: string;
  /** Nom de la spécialité, tel que le catalogue national l'écrit. */
  name: string;
  form: string | null;
  label: string;
  substances: string[];
  /** L'officine peut-elle encore se la procurer ? */
  marketed: boolean;
  /** Quantité détenue par l'officine, quand elle référence cette boîte. */
  stockQuantity: number | null;
};

/**
 * Recherche d'un médicament pour démarrer ou compléter une ordonnance.
 *
 * Elle sert aussi de lecteur de code-barres : `searchDrugCatalog` reconnaît un
 * CIP et rend directement la boîte. La portée du stock vient de la session,
 * jamais du client.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2) {
    return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const rows = await searchDrugCatalog({
    pharmacyId: session.scope.pharmacyId,
    query,
    // On demande large puis on reclasse : le tri alphabétique du catalogue
    // remonte « AMOXICILLINE ACIDE CLAVULANIQUE » avant « AMOXICILLINE », ce
    // qui n'est jamais ce que cherche quelqu'un qui tape « amoxicilline ».
    limit: 40,
  });

  const needle = normalizeSearchText(query);
  const ranked = [...rows].sort((a, b) => {
    const rank = (name: string) => {
      const normalized = normalizeSearchText(name);
      if (normalized.startsWith(needle)) return 0;
      return 1;
    };
    const delta = rank(a.specialtyName) - rank(b.specialtyName);
    if (delta !== 0) return delta;
    // À rang égal, le libellé le plus court est le plus proche de la demande.
    return a.specialtyName.length - b.specialtyName.length;
  });

  // Une spécialité n'apparaît qu'une fois : le catalogue en publie une ligne
  // par conditionnement, et proposer six fois « DOXYCYCLINE TEVA 100 mg » à
  // quelqu'un qui saisit une ordonnance n'aide pas — c'est le médicament qui
  // est prescrit, pas la boîte.
  const seen = new Set<string>();
  const unique = ranked.filter((row) => {
    const key = row.specialtyName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results: DrugLookupResult[] = unique.slice(0, 8).map((row) => ({
    presentationId: row.presentationId,
    cip13: row.cip13,
    name: row.specialtyName,
    form: row.pharmaceuticalForm,
    label: row.label,
    substances: row.substances,
    marketed: row.marketed,
    stockQuantity: row.stock?.quantity ?? null,
  }));

  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
