import { getDirectorSession } from "@/server/auth/director-session";
import { loadDirectorIslandHome } from "@/server/services/island/home";

/** L'accueil de l'île du directeur commercial : son équipe, ce mois-ci. */
export async function GET() {
  const session = await getDirectorSession();
  if (!session) return Response.json({ error: "Non authentifié" }, { status: 401 });
  try {
    return Response.json(await loadDirectorIslandHome(session.director.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[ile] accueil directeur illisible", error);
    return Response.json({ error: "Accueil indisponible" }, { status: 500 });
  }
}
