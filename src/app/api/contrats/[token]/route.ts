import { NextResponse } from "next/server";
import { getContractByToken, readContractPdf } from "@/server/services/sales/contracts";

export const dynamic = "force-dynamic";

/** Le PDF du contrat, par jeton sécurisé (titulaire). */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const contract = await getContractByToken(token);
  if (!contract) return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 404 });
  const pdf = await readContractPdf(contract.id);
  if (!pdf) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="contrat-pharmaboost-v${contract.version}.pdf"`, "Cache-Control": "private, no-store" } });
}
