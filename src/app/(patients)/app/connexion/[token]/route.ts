import { NextResponse } from "next/server";
import { APP_SESSION_COOKIE, APP_SESSION_TTL_MS, openAppLogin } from "@/server/services/app-members";

export const dynamic = "force-dynamic";

/** Le lien de connexion reçu par e-mail : il ouvre la session de l'inscrit (cookie scellé) puis mène à son espace. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  // L'appli des patients reste dans l'aperçu (fondateur, 21 oct. 2026) : introuvable sur pharmaboost.app.
  if (process.env.NODE_ENV === "production") return new NextResponse("Introuvable", { status: 404 });
  const { token } = await params;
  const session = await openAppLogin(token.slice(0, 2000));
  // Retour sur l'adresse même où le lien a été ouvert (téléphone sur le réseau local en aperçu) : le cookie y est posé.
  const host = request.headers.get("host");
  const base = host ? `${request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "")}://${host}` : request.url;
  const url = new URL(session ? "/app/ma-pharmacie?bienvenue=1" : "/app/connexion?expire=1", base);
  const response = NextResponse.redirect(url);
  if (session) {
    response.cookies.set(APP_SESSION_COOKIE, session, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/", maxAge: Math.floor(APP_SESSION_TTL_MS / 1000) });
  }
  return response;
}
