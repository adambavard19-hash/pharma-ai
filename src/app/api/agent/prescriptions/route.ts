import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { authenticateAgent } from "@/server/services/stock-sync";
import { storePrescriptionFile, uploadErrorMessage } from "@/server/services/prescription-upload";
import { persistExtraction } from "@/server/services/analysis";
import { prewarmClassifications } from "@/server/services/classification";
import { nextReference } from "@/server/services/references";
import { recordIsDemo } from "@/server/db/demo-scope";
import { recordAudit } from "@/server/audit/log";
import { createNotification } from "@/server/services/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Une ordonnance scannée dans le LGO, récupérée par l'agent : elle est lue
 * par l'OCR et devient une délivrance à vérifier au comptoir, exactement comme
 * une photo prise dans PharmaBoost. Le pharmacien n'a scanné qu'une fois.
 */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé d'agent inconnue ou révoquée." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "Aucun fichier reçu." }, { status: 400 });

  const stored = await storePrescriptionFile({ scope: agent.scope, file });
  if (!stored.ok) return NextResponse.json({ ok: false, error: uploadErrorMessage(stored.error) }, { status: 422 });

  const reference = await nextReference("prescription", agent.scope.pharmacyId);
  const prescription = await prisma.prescription.create({
    data: {
      pharmacyId: agent.scope.pharmacyId,
      reference,
      status: "DRAFT",
      source: "SCAN",
      fileKey: stored.data.fileKey,
      fileName: stored.data.fileName,
      fileMimeType: stored.data.mimeType,
      createdByUserId: agent.scope.userId,
      isDemo: recordIsDemo(agent.pharmacyIsDemo),
    },
  });
  if (stored.data.extraction) {
    await persistExtraction({ scope: agent.scope, prescriptionId: prescription.id, extracted: stored.data.extraction });
  } else {
    await prisma.prescription.update({ where: { id: prescription.id }, data: { status: "NEEDS_VERIFICATION" } });
  }
  const drugNames = stored.data.lines.map((line) => line.drugName);
  if (drugNames.length > 0) prewarmClassifications({ scope: agent.scope, drugNames }).catch(() => undefined);

  await recordAudit({ action: "prescription.created", entityType: "Prescription", entityId: prescription.id, pharmacyId: agent.scope.pharmacyId, userId: agent.scope.userId, metadata: { via: "agent", lines: drugNames.length } });
  await createNotification({
    pharmacyId: agent.scope.pharmacyId,
    userId: null,
    type: "SYSTEM",
    severity: "INFO",
    title: `Ordonnance ${reference} reçue du scanner`,
    body: drugNames.length > 0 ? `${drugNames.length} médicament(s) lu(s) : à confirmer au comptoir.` : "Aucune ligne lue : à saisir au comptoir.",
    linkUrl: `/vente/${prescription.id}`,
  });
  return NextResponse.json({ ok: true, prescriptionId: prescription.id, reference, lines: drugNames.length });
}
