import { NextResponse } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { readAffiliateContractPdf } from "@/server/services/sales/affiliate-contracts";

export const dynamic = "force-dynamic";

/** Le PDF d'un contrat d'affiliation (signé par les deux parties une fois finalisé et archivé) : administrateurs seulement. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const admin = await getPlatformSession();
  if (!admin) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const document = await readAffiliateContractPdf(id);
  if (!document) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  const filename = `${document.reference}${document.signed ? "-signe" : ""}.pdf`;
  return new NextResponse(Buffer.from(document.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store" } });
}
