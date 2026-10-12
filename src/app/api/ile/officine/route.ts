import { getSession } from "@/server/auth/session";
import { loadOfficineIslandHome } from "@/server/services/island/home";

/** L'accueil de l'île du logiciel : l'officine ACTIVE de la session, la personne connectée. */
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Non authentifié" }, { status: 401 });
  try {
    return Response.json(await loadOfficineIslandHome(session), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[ile] accueil officine illisible", error);
    return Response.json({ error: "Accueil indisponible" }, { status: 500 });
  }
}
