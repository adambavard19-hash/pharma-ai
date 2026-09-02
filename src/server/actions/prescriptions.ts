"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { analysePrescription, extractPrescription } from "@/server/services/analysis";
import { nextReference } from "@/server/services/references";
import { recordAudit } from "@/server/audit/log";
import { recordInteraction } from "@/server/services/patients";
import { getStorageProvider } from "@/server/ai/registry";
import { isDemoMode } from "@/config/env";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];

const createSchema = z.object({
  patientId: z.string().trim().optional().nullable(),
  source: z.enum(["PHOTO", "SCAN", "IMAGE_UPLOAD", "PDF_UPLOAD", "MANUAL"]),
  demoScenarioId: z.string().trim().optional().nullable(),
});

/**
 * Crée une ordonnance puis déclenche l'extraction.
 *
 * Le fichier est stocké tel quel ; en mode démonstration, le fournisseur OCR
 * simulé restitue un scénario fictif et l'interface l'indique explicitement.
 */
export async function createPrescriptionAction(
  _previous: ActionResult<{ prescriptionId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ prescriptionId: string }>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  const scope = session.scope;

  const parsed = createSchema.safeParse({
    patientId: formData.get("patientId") || null,
    source: formData.get("source") ?? "MANUAL",
    demoScenarioId: formData.get("demoScenarioId") || null,
  });

  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const { patientId, source, demoScenarioId } = parsed.data;

  if (patientId) {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { pharmacyId: true },
    });
    if (!patient || patient.pharmacyId !== scope.pharmacyId) {
      return fail("Patient introuvable dans cette officine.");
    }
  }

  const file = formData.get("file");
  let fileKey: string | null = null;
  let fileName: string | null = null;
  let fileMimeType: string | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) {
      return fail("Le fichier dépasse 12 Mo. Réduisez la résolution de la photo.");
    }
    if (!ACCEPTED_MIME.includes(file.type)) {
      return fail("Format non pris en charge. Utilisez JPEG, PNG, WEBP ou PDF.");
    }

    const storage = getStorageProvider();
    const extension = file.name.split(".").pop() ?? "bin";
    const key = `${scope.pharmacyId}/ordonnances/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    await storage.put(key, new Uint8Array(await file.arrayBuffer()), file.type);

    fileKey = key;
    fileName = file.name;
    fileMimeType = file.type;
  }

  const reference = await nextReference("prescription", scope.pharmacyId);

  const prescription = await prisma.prescription.create({
    data: {
      pharmacyId: scope.pharmacyId,
      patientId: patientId || null,
      reference,
      status: "DRAFT",
      source,
      fileKey,
      fileName,
      fileMimeType,
      createdByUserId: scope.userId,
      isDemo: isDemoMode(),
    },
  });

  let allPreconfirmed = false;
  try {
    const extraction = await extractPrescription({
      scope,
      prescriptionId: prescription.id,
      demoScenarioId: demoScenarioId ?? undefined,
    });
    allPreconfirmed = extraction.allPreconfirmed;
  } catch (error) {
    await prisma.prescription.update({
      where: { id: prescription.id },
      data: { status: "FAILED" },
    });
    console.error("[prescriptions] extraction impossible", error);
    return fail(
      "L'extraction a échoué. L'ordonnance a été créée : les lignes peuvent être saisies manuellement.",
    );
  }

  // L'analyse démarre dès l'extraction terminée, et SEULEMENT quand toutes les
  // lignes sont passées. Sur une ordonnance dont une ligne reste douteuse, elle
  // porterait sur un traitement incomplet : le pharmacien va de toute façon
  // corriger puis relancer, et une analyse partielle affichée entre-temps
  // dirait quelque chose de faux.
  //
  // Elle ne signe rien : `verifiedAt` reste vide jusqu'à la validation par un
  // pharmacien. Une analyse n'est pas une vérification.
  if (allPreconfirmed) {
    try {
      await analysePrescription({ scope, prescriptionId: prescription.id });
    } catch (error) {
      // Une analyse anticipée qui échoue ne doit pas faire échouer l'import :
      // l'ordonnance existe, ses lignes sont lues, l'écran de vérification
      // reprend la main comme avant ce lot.
      console.error("[prescriptions] analyse anticipée impossible", error);
      await prisma.prescription.update({
        where: { id: prescription.id },
        data: { status: "NEEDS_VERIFICATION" },
      });
    }
  }

  if (patientId) {
    await recordInteraction({
      patientId,
      scope,
      type: "PRESCRIPTION_RECEIVED",
      summary: `Ordonnance ${reference} importée.`,
      metadata: { prescriptionId: prescription.id },
    });
  }

  revalidatePath("/ordonnances");
  return ok({ prescriptionId: prescription.id });
}

const lineSchema = z.object({
  id: z.string(),
  drugName: z.string().trim().min(1, "Le nom du médicament est obligatoire"),
  dosage: z.string().trim().optional(),
  form: z.string().trim().optional(),
  posology: z.string().trim().optional(),
  durationDays: z.coerce.number().int().min(0).max(3650).optional(),
  quantity: z.coerce.number().int().min(0).max(9999).optional(),
  instructions: z.string().trim().optional(),
  confirmed: z.boolean(),
});

const verifySchema = z.object({
  prescriptionId: z.string().min(1),
  patientId: z.string().optional().nullable(),
  prescriberName: z.string().trim().optional(),
  prescribedAt: z.string().trim().optional(),
  lines: z.array(lineSchema).min(1, "Au moins une ligne est nécessaire"),
});

/**
 * Enregistre la vérification humaine puis lance l'analyse.
 * C'est l'acte professionnel qui autorise la suite du parcours : sans ligne
 * confirmée, le moteur refuse d'analyser.
 */
export async function verifyPrescriptionAction(
  payload: z.input<typeof verifySchema>,
): Promise<ActionResult<{ analysisRunId: string; recommendationCount: number }>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VERIFY);
  const scope = session.scope;

  const parsed = verifySchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Vérifiez les lignes saisies.", zodFieldErrors(parsed.error.issues));
  }

  const input = parsed.data;

  const prescription = await prisma.prescription.findUnique({
    where: { id: input.prescriptionId },
    select: { id: true, pharmacyId: true, reference: true, patientId: true },
  });
  if (!prescription || prescription.pharmacyId !== scope.pharmacyId) {
    return fail("Ordonnance introuvable dans cette officine.");
  }

  const confirmedCount = input.lines.filter((line) => line.confirmed).length;
  if (confirmedCount === 0) {
    return fail(
      "Au moins une ligne doit être confirmée. Une ligne non confirmée est exclue de l'analyse.",
    );
  }

  if (input.patientId) {
    const patient = await prisma.patient.findUnique({
      where: { id: input.patientId },
      select: { pharmacyId: true },
    });
    if (!patient || patient.pharmacyId !== scope.pharmacyId) {
      return fail("Patient introuvable dans cette officine.");
    }
  }

  const ownedLines = await prisma.prescriptionLine.findMany({
    where: { prescriptionId: prescription.id },
    select: { id: true },
  });
  const ownedIds = new Set(ownedLines.map((line) => line.id));

  await prisma.$transaction(async (tx) => {
    for (const line of input.lines) {
      if (!ownedIds.has(line.id)) continue;
      await tx.prescriptionLine.update({
        where: { id: line.id },
        data: {
          drugName: line.drugName,
          dosage: line.dosage || null,
          form: line.form || null,
          posology: line.posology || null,
          durationDays: line.durationDays ?? null,
          quantity: line.quantity ?? null,
          instructions: line.instructions || null,
          status: line.confirmed ? "CONFIRMED" : "REJECTED",
          correctedByUserId: scope.userId,
          correctedAt: new Date(),
        },
      });
    }

    await tx.prescription.update({
      where: { id: prescription.id },
      data: {
        patientId: input.patientId || prescription.patientId,
        prescriberName: input.prescriberName || undefined,
        prescribedAt: input.prescribedAt ? new Date(input.prescribedAt) : undefined,
        status: "VERIFIED",
        verifiedByUserId: scope.userId,
        verifiedAt: new Date(),
      },
    });
  });

  await recordAudit({
    action: "prescription.verified",
    entityType: "Prescription",
    entityId: prescription.id,
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    metadata: { confirmedLines: confirmedCount, totalLines: input.lines.length },
  });

  const { analysisRunId, result } = await analysePrescription({
    scope,
    prescriptionId: prescription.id,
  });

  revalidatePath(`/vente/${prescription.id}`);
  revalidatePath("/ordonnances");

  return ok({ analysisRunId, recommendationCount: result.recommendations.length });
}

/**
 * La validation professionnelle d'une ordonnance déjà analysée.
 *
 * C'est l'acte que la pré-confirmation ne remplace PAS. Les lignes ont été
 * retenues par la lecture, l'analyse a tourné, l'écran montre tout — mais tant
 * que personne n'a validé, `verifiedAt` reste vide et l'ordonnance n'engage
 * aucun professionnel.
 *
 * Elle ne relance pas l'analyse : celle-ci porte déjà sur ces lignes-là,
 * inchangées. Une correction passe par « Corriger », qui repasse par
 * `verifyPrescriptionAction` et relance le moteur.
 */
export async function validatePrescriptionAction(
  prescriptionId: string,
): Promise<ActionResult<{ verifiedAt: string }>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VERIFY);
  const scope = session.scope;

  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    select: {
      id: true,
      pharmacyId: true,
      verifiedAt: true,
      lines: { where: { status: "CONFIRMED" }, select: { id: true } },
      analysisRuns: { select: { id: true }, take: 1 },
    },
  });
  if (!prescription || prescription.pharmacyId !== scope.pharmacyId) {
    return fail("Ordonnance introuvable dans cette officine.");
  }

  // Déjà validée : rien à refaire, et surtout pas réécrire la signature de
  // quelqu'un d'autre.
  if (prescription.verifiedAt) {
    return ok({ verifiedAt: prescription.verifiedAt.toISOString() });
  }

  if (prescription.lines.length === 0) {
    return fail(
      "Aucune ligne retenue. Ouvrez « Corriger » pour vérifier l'ordonnance ligne par ligne.",
    );
  }

  // Valider une ordonnance que le moteur n'a jamais analysée reviendrait à
  // signer un écran vide.
  if (prescription.analysisRuns.length === 0) {
    return fail("Cette ordonnance n'a pas encore été analysée.");
  }

  const verifiedAt = new Date();
  await prisma.prescription.update({
    where: { id: prescription.id },
    data: { verifiedByUserId: scope.userId, verifiedAt },
  });

  await recordAudit({
    action: "prescription.verified",
    entityType: "Prescription",
    entityId: prescription.id,
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    // La trace distingue les deux chemins : ligne à ligne, ou validation d'un
    // écran dont les lignes avaient été pré-confirmées par la lecture.
    metadata: { path: "preconfirmed", confirmedLines: prescription.lines.length },
  });

  revalidatePath(`/vente/${prescription.id}`);
  revalidatePath("/ordonnances");

  return ok({ verifiedAt: verifiedAt.toISOString() }, "Ordonnance validée.");
}

export async function reanalysePrescriptionAction(
  prescriptionId: string,
): Promise<ActionResult<{ recommendationCount: number }>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VERIFY);

  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    select: { pharmacyId: true },
  });
  if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) {
    return fail("Ordonnance introuvable dans cette officine.");
  }

  const { result } = await analysePrescription({
    scope: session.scope,
    prescriptionId,
  });

  revalidatePath(`/vente/${prescriptionId}`);
  return ok(
    { recommendationCount: result.recommendations.length },
    "Analyse relancée avec les données à jour.",
  );
}

/**
 * Acquittement des alertes de sécurité bloquantes d'une analyse.
 *
 * Tant qu'une alerte BLOCKING n'est pas acquittée, l'écran de vente n'ouvre pas
 * la zone des conseils : on ne vend rien par-dessus une alerte non lue. Cet
 * acquittement est un acte professionnel — il est horodaté, signé et journalisé.
 */
export async function acknowledgeSafetyFindingsAction(
  analysisRunId: string,
): Promise<ActionResult<{ count: number }>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VERIFY);

  const run = await prisma.analysisRun.findUnique({
    where: { id: analysisRunId },
    select: { id: true, pharmacyId: true, prescriptionId: true },
  });
  if (!run || run.pharmacyId !== session.scope.pharmacyId) {
    return fail("Analyse introuvable dans cette officine.");
  }

  const { count } = await prisma.safetyFinding.updateMany({
    where: {
      analysisRunId: run.id,
      severity: "BLOCKING",
      // Les alertes portant sur un produit ou une opportunité traduisent une
      // exclusion déjà appliquée par le moteur : elles informent, elles
      // n'arrêtent pas le comptoir et n'ont donc pas à être acquittées.
      subjectType: { in: ["ANALYSIS", "PRESCRIPTION_LINE"] },
      acknowledgedAt: null,
    },
    data: { acknowledgedAt: new Date(), acknowledgedByUserId: session.scope.userId },
  });

  await recordAudit({
    action: "prescription.safety_acknowledged",
    entityType: "AnalysisRun",
    entityId: run.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { prescriptionId: run.prescriptionId, findings: count },
  });

  revalidatePath(`/vente/${run.prescriptionId}`);
  return ok({ count }, "Points bloquants acquittés.");
}

export async function deletePrescriptionAction(
  prescriptionId: string,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_DELETE);

  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    select: { pharmacyId: true, reference: true },
  });
  if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) {
    return fail("Ordonnance introuvable dans cette officine.");
  }

  await prisma.prescription.update({
    where: { id: prescriptionId },
    data: { deletedAt: new Date(), status: "CANCELLED" },
  });

  await recordAudit({
    action: "prescription.deleted",
    entityType: "Prescription",
    entityId: prescriptionId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { reference: prescription.reference },
  });

  revalidatePath("/ordonnances");
  return ok(null, "Ordonnance supprimée.");
}
