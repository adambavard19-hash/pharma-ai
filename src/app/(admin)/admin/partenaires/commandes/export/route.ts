import { NextResponse, type NextRequest } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { exportOrdersCsv, ORDER_STATUSES, type OrderStatus } from "@/server/services/partners/orders-admin";

export const dynamic = "force-dynamic";

/**
 * Export CSV des commandes partenaires, pour les partenaires en mode
 * import / export. Réservé à une session administrateur plateforme (lue
 * depuis le cookie, comme les pages de la console) ; sans elle, 403 et rien
 * d'autre. Hors officines de démonstration ; `?partenaire=` limite l'export
 * aux commandes d'un seul partenaire, `?statut=` à un statut.
 */
export async function GET(request: NextRequest) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  const partnerId = request.nextUrl.searchParams.get("partenaire") || null;
  const rawStatus = request.nextUrl.searchParams.get("statut");
  const status = rawStatus && (ORDER_STATUSES as string[]).includes(rawStatus) ? (rawStatus as OrderStatus) : null;
  if (rawStatus && !status) return NextResponse.json({ error: "Statut inconnu" }, { status: 400 });

  const file = await exportOrdersCsv({ partnerId, status });
  if (!file) return NextResponse.json({ error: "Partenaire introuvable" }, { status: 404 });
  await recordAudit({ action: "partner.orders_exported", entityType: "PartnerOrder", platformAdminId: session.admin.id, metadata: { partnerId, status, filename: file.filename } });

  return new NextResponse(file.content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
