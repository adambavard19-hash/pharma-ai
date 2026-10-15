import { DIRECTOR_SESSION_COOKIE_NAME, PLATFORM_SESSION_COOKIE_NAME, SALES_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/config/constants";
import { isBot, recordSiteVisit, visitorIp } from "@/server/services/site-visitors";

const SESSIONS = [SESSION_COOKIE_NAME, PLATFORM_SESSION_COOKIE_NAME, SALES_SESSION_COOKIE_NAME, DIRECTOR_SESSION_COOKIE_NAME];

/**
 * Le site public signale qu'il a été ouvert : un visiteur par adresse IP (les doublons ne comptent pas). Les robots et les
 * personnes connectées à PharmaBoost (l'équipe, les officines) ne sont pas comptés. Répond toujours 204 : le site n'attend rien.
 */
export async function POST(request: Request) {
  const ip = visitorIp(request.headers);
  const cookies = request.headers.get("cookie") ?? "";
  const loggedIn = SESSIONS.some((name) => cookies.includes(`${name}=`));
  if (ip && !loggedIn && !isBot(request.headers.get("user-agent"))) {
    await recordSiteVisit(ip).catch((error) => console.error("[visite] non comptée :", error instanceof Error ? error.message : error));
  }
  return new Response(null, { status: 204 });
}
