import { NextResponse } from "next/server";
import { suggestAddresses } from "@/server/services/public-registry";
import { clientIp, rateLimited } from "@/server/http/rate-limit";

/** Formulaires du site : des suggestions d'adresses de la Base Adresse Nationale pendant la saisie. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 3 || q.length > 200) return NextResponse.json({ suggestions: [] }, { headers: { "Cache-Control": "no-store" } });
  if (rateLimited(`annuaire-adresse:${clientIp(request)}`, 90, 60_000)) {
    return NextResponse.json({ suggestions: [], unavailable: true }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  const suggestions = await suggestAddresses(q);
  return NextResponse.json({ suggestions: suggestions ?? [], unavailable: suggestions === null }, { headers: { "Cache-Control": "no-store" } });
}
