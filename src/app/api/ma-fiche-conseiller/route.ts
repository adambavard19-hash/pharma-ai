import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { issueAdvisorSheet } from "@/server/services/advisor-sheet";

export const dynamic = "force-dynamic";

/** La fiche « Conseiller certifié PharmaBoost » de la personne connectée : SES chiffres, dans SON officine, jamais ceux d'un autre. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (session.pharmacy.isDemo) return NextResponse.json({ error: "Indisponible dans l'officine de démonstration" }, { status: 403 });
  const file = await issueAdvisorSheet({
    scope: { pharmacyId: session.scope.pharmacyId, userId: session.scope.userId },
    fullName: session.user.fullName,
    roleLabel: session.roleLabel,
    pharmacyName: session.pharmacy.name,
    pharmacyCity: session.pharmacy.city,
  });
  return new NextResponse(Buffer.from(file.bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file.fileName}"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
