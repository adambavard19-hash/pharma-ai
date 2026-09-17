import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { readContractPdf } from "@/server/services/sales/contracts";

export const dynamic = "force-dynamic";

/**
 * Le contrat de l'officine, lu par son titulaire. La portée vient de la
 * session : un contrat d'une autre officine répond « introuvable », jamais
 * son contenu.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.SETTINGS_MANAGE)) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const contract = await prisma.contract.findFirst({
    where: { id, OR: [{ pharmacyId: session.scope.pharmacyId }, { prospect: { pharmacyId: session.scope.pharmacyId } }] },
    select: { id: true, version: true },
  });
  if (!contract) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const pdf = await readContractPdf(contract.id);
  if (!pdf) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="contrat-pharmaboost-v${contract.version}.pdf"`, "Cache-Control": "private, no-store" } });
}
