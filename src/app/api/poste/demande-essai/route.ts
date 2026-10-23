import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { askAtCounter, ASK_MAX_CHARS } from "@/server/services/counter-ask";
import { buildHostEntry } from "../../../../../agent/src/notice-center";

export const dynamic = "force-dynamic";

/**
 * L'essai de « Demander un conseil » dans l'aperçu (`/poste/ile?essai=1`), sans agent ni clé : la pharmacie du compte de
 * démonstration `titulaire@pharma.ai`. N'existe jamais en production (404).
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { texte?: unknown };
  const text = typeof body.texte === "string" ? body.texte.replace(/\s+/g, " ").trim() : "";
  if (text.length < 2 || text.length > ASK_MAX_CHARS) return NextResponse.json({ ok: false, error: "Demande vide ou trop longue." }, { status: 400 });
  const membership = await prisma.membership.findFirst({
    where: { user: { email: "titulaire@pharma.ai" }, role: "OWNER", isActive: true },
    select: { userId: true, pharmacy: { select: { id: true, organizationId: true, isDemo: true } } },
  });
  if (!membership) return NextResponse.json({ ok: false, error: "Compte titulaire@pharma.ai introuvable dans la base locale." }, { status: 404 });
  // Un comptoir de cette pharmacie, s'il y en a un : la demande y ouvre une vraie vente, comme au poste (23 oct. 2026).
  const post = await prisma.counterPost.findFirst({ where: { pharmacyId: membership.pharmacy.id }, orderBy: { createdAt: "asc" }, select: { id: true, hostname: true, assignedUserId: true } });
  const { id, body: notice } = await askAtCounter({
    scope: { pharmacyId: membership.pharmacy.id, organizationId: membership.pharmacy.organizationId, userId: membership.userId },
    pharmacyIsDemo: membership.pharmacy.isDemo,
    text,
    ...(post ? { post: { id: post.id, label: post.hostname, ownerId: post.assignedUserId } } : {}),
  });
  return NextResponse.json({ ok: true, entry: buildHostEntry({ prescriptionId: id, serverUrl: new URL(request.url).origin, body: notice }) });
}
