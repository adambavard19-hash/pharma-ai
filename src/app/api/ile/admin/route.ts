import { getPlatformSession } from "@/server/auth/platform-session";
import { loadAdminIslandHome } from "@/server/services/island/home";

/** L'accueil de l'île de la console : réservé aux administrateurs de la plateforme. */
export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Non authentifié" }, { status: 401 });
  try {
    return Response.json(await loadAdminIslandHome(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[ile] accueil console illisible", error);
    return Response.json({ error: "Accueil indisponible" }, { status: 500 });
  }
}
