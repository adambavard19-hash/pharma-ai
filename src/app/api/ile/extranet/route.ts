import { getSalesSession } from "@/server/auth/sales-session";
import { loadSalesIslandHome } from "@/server/services/island/home";

/** L'accueil de l'île du commercial : SES dossiers, SES démos, SES commissions. */
export async function GET() {
  const session = await getSalesSession();
  if (!session) return Response.json({ error: "Non authentifié" }, { status: 401 });
  try {
    return Response.json(await loadSalesIslandHome(session.rep.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[ile] accueil commercial illisible", error);
    return Response.json({ error: "Accueil indisponible" }, { status: 500 });
  }
}
