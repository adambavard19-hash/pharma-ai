import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { countUnreadNotifications, listNotifications } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

/** Le contenu de la cloche, à son ouverture : les notifications de la personne connectée, dans son officine. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  const [items, unread] = await Promise.all([listNotifications(session.scope, 40), countUnreadNotifications(session.scope)]);
  return NextResponse.json({ unread, items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) }, { headers: { "Cache-Control": "no-store" } });
}
