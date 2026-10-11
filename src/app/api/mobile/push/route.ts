import { NextResponse } from "next/server";
import { getUserSession } from "@/server/auth/user-session";
import { registerPushDevice, unregisterPushDevice } from "@/server/services/push";
import { throttled } from "@/server/security/throttle";

export const dynamic = "force-dynamic";

/**
 * Le téléphone de la personne connectée (application iPhone) : POST l'enregistre pour les notifications push, DELETE l'en
 * retire. Le jeton ne vaut que pour le compte connecté — jamais un identifiant envoyé par le téléphone.
 */
async function read(request: Request): Promise<{ token?: unknown; environment?: unknown }> {
  return (await request.json().catch(() => ({}))) as { token?: unknown; environment?: unknown };
}

export async function POST(request: Request) {
  const session = await getUserSession();
  if (!session) return NextResponse.json({ ok: false, error: "Session expirée." }, { status: 401 });
  if (throttled(`push-register:${session.user.id}`, 20)) return NextResponse.json({ ok: false, error: "Trop de demandes." }, { status: 429 });
  const body = await read(request);
  const environment = body.environment === "development" ? "development" : "production";
  const ok = await registerPushDevice(session.user.id, String(body.token ?? ""), environment);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

export async function DELETE(request: Request) {
  const session = await getUserSession();
  if (!session) return NextResponse.json({ ok: false, error: "Session expirée." }, { status: 401 });
  const body = await read(request);
  if (typeof body.token === "string") await unregisterPushDevice(session.user.id, body.token);
  return NextResponse.json({ ok: true });
}
