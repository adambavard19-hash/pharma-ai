import { NextResponse } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { loadSpecimenInputs } from "@/server/services/admin/contracts-admin";
import { companyPartyForPreview, specimenDocument } from "@/core/contracts/specimen";
import { renderContractPdf } from "@/core/contracts/pdf";
import { markSpecimenPdf } from "@/core/contracts/specimen-pdf";

export const dynamic = "force-dynamic";

/**
 * Le contrat spécimen de la fiche société : le vrai modèle, la fiche
 * enregistrée, une officine fictive marquée comme telle. Généré à la volée,
 * jamais stocké, jamais mis en cache. Réservé à la console.
 */
export async function GET() {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const { company, plan } = await loadSpecimenInputs();
  // Une fiche incomplète s'imprime avec ses manques entre crochets : on voit ce qu'il reste à compléter.
  const document = specimenDocument({ company: companyPartyForPreview(company), plan, startDate: new Date() });
  const pdf = await markSpecimenPdf(await renderContractPdf(document));
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="specimen-contrat-pharmaboost.pdf"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
