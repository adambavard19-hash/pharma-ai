import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getEnv } from "@/config/env";
import { renderDocumentPdf } from "@/server/services/document-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le plan du patient en PDF, tel qu'il s'imprime.
 *
 * Réservé à l'officine (session + droit de remise) : le patient, lui, reçoit
 * le lien sécurisé et imprime depuis sa page. Le PDF est produit par un
 * navigateur headless à partir de la page publique en mode papier — un seul
 * rendu, une seule feuille de style, aucun second gabarit à maintenir.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.DOCUMENT_SEND)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const { id } = await context.params;
  const document = await prisma.patientDocument.findUnique({
    where: { id },
    select: { id: true, pharmacyId: true, accessToken: true, revokedAt: true, version: true, patient: { select: { lastName: true } } },
  });
  if (!document || document.pharmacyId !== session.scope.pharmacyId) {
    return NextResponse.json({ error: "Plan introuvable" }, { status: 404 });
  }
  if (document.revokedAt) {
    return NextResponse.json({ error: "Ce plan a été révoqué." }, { status: 410 });
  }

  // Rendu depuis l'adresse interne : le navigateur headless tourne sur le
  // même poste que l'application, il n'a pas besoin de l'adresse publique.
  const internalUrl = `${getEnv().APP_URL.replace(/\/$/, "")}/fiche/${document.accessToken}?format=pdf`;
  const result = await renderDocumentPdf(internalUrl);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }

  await prisma.documentDelivery.create({
    data: {
      documentId: document.id,
      channel: "PRINT",
      status: "SENT",
      provider: "pdf",
      detail: "PDF téléchargé par l'officine.",
      userId: session.scope.userId,
    },
  });

  const name = `plan-${(document.patient?.lastName ?? "patient").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-v${document.version}.pdf`;
  return new NextResponse(new Uint8Array(result.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
