import { NextResponse } from "next/server";
import { isValidSiret } from "@/core/contracts/identity";
import { lookupCompanyBySiret } from "@/server/services/public-registry";
import { clientIp, rateLimited } from "@/server/http/rate-limit";

/**
 * Formulaires du site : l'officine retrouvée par son SIRET dans l'annuaire
 * public des entreprises. Aucune session : ces données sont publiques, et
 * seul ce qui sert à préremplir la fiche est renvoyé.
 */
export async function GET(request: Request) {
  const siret = new URL(request.url).searchParams.get("siret") ?? "";
  if (!isValidSiret(siret)) return NextResponse.json({ error: "SIRET invalide." }, { status: 400 });
  if (rateLimited(`annuaire-siret:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ status: "UNAVAILABLE" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  const result = await lookupCompanyBySiret(siret);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
