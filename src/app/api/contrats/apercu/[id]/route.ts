import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { getSalesSession } from "@/server/auth/sales-session";
import { getPlatformSession } from "@/server/auth/platform-session";
import { readContractPdf } from "@/server/services/sales/contracts";

export const dynamic = "force-dynamic";

/** Aperçu interne du PDF : le commercial du dossier, ou un administrateur. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [sales, admin] = await Promise.all([getSalesSession(), getPlatformSession()]);
  if (!sales && !admin) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const contract = await prisma.contract.findUnique({ where: { id }, select: { id: true, version: true, prospect: { select: { salesRepId: true } } } });
  if (!contract) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (!admin && sales && contract.prospect.salesRepId !== sales.rep.id) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const pdf = await readContractPdf(contract.id);
  if (!pdf) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="contrat-v${contract.version}.pdf"`, "Cache-Control": "private, no-store" } });
}
