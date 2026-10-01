import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/config/constants";

/**
 * La racine du domaine : le site public pour un visiteur, l'application pour
 * quelqu'un de connecté. On ne lit que la présence du cookie de session ; la
 * validité est vérifiée ensuite par l'application elle-même.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/" && !request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.redirect(new URL("/decouvrir", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: "/" };
