import { NextResponse, type NextRequest } from "next/server";
import { consumePostLink, signPostLinkCookie } from "@/server/services/post-link";
import { throttled } from "@/server/security/throttle";
import { POST_LINK_COOKIE, POST_LINK_COOKIE_MAX_AGE_S } from "@/core/counter/post-link";

export const dynamic = "force-dynamic";

/**
 * Le lien que le poste de caisse ouvre dans le navigateur de SON PC (core/counter/post-link.ts) : il est brûlé, le navigateur
 * reçoit le cookie signé qui désigne ce poste et sa pharmacie, puis arrive sur « Nouvelle vente » — la connexion d'abord
 * s'il le faut (elle y ramène : l'accueil d'une personne qui prend les ventes, c'est « Nouvelle vente »). Un lien déjà servi,
 * expiré ou inconnu ne pose rien : « Nouvelle vente » dit quoi faire. Rien n'est mis en cache ni transmis en référent.
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  const link = throttled(`poste-lien:${ip}`, 20) ? null : await consumePostLink(request.nextUrl.searchParams.get("jeton")).catch(() => null);
  const response = NextResponse.redirect(new URL(link ? "/vente/nouvelle" : "/vente/nouvelle?lien=perime", request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (link) {
    response.cookies.set(POST_LINK_COOKIE, signPostLinkCookie(link), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: POST_LINK_COOKIE_MAX_AGE_S,
    });
  }
  return response;
}
