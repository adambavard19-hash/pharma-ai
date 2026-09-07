"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import {
  analysePrescription,
  extractPrescription,
  persistExtraction,
} from "@/server/services/analysis";
import { formatSchedule, hasDoses, readSchedule } from "@/core/posology";
import { nextReference } from "@/server/services/references";
import { recordAudit } from "@/server/audit/log";
import { recordInteraction } from "@/server/services/patients";
import { getOCRProvider, getStorageProvider } from "@/server/ai/registry";
import {
  ACCEPTED_PRESCRIPTION_MIME,
  MAX_PRESCRIPTION_FILE_BYTES,
} from "@/server/services/prescription-upload";
import { recordIsDemo } from "@/server/db/demo-scope";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/** Le formulaire transmet les lignes en JSON : une saisie illisible vaut zéro
 *  ligne, jamais une exception qui ferait perdre la délivrance. */
function safeParseLines(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Le mot juste pour compter les prises : « 2 comprimés », pas « 2 unités ». */
function unitLabel(form: string | undefined): string {
  const normalized = (form ?? "").toLowerCase();
  if (normalized.includes("gélule") || normalized.includes("gelule")) return "gélule";
  if (normalized.includes("sachet")) return "sachet";
  if (normalized.includes("goutte")) return "goutte";
  if (normalized.includes("suppositoire")) return "suppositoire";
  if (normalized.includes("comprim")) return "comprimé";
  return "prise";
}

const MAX_FILE_BYTES = MAX_PRESCRIPTION_FILE_BYTES;
const ACCEPTED_MIME: readonly string[] = ACCEPTED_PRESCRIPTION_MIME;

/** Un médicament saisi ou scanné directement par le pharmacien. */
const manualLineSchema = z.object({
  drugName: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(80).optional(),
  form: z.string().trim().max(120).optional(),
  /** Rattachement au catalogue national, quand la ligne vient d'une recherche. */
  drugSpecialtyId: z.string().trim().optional().nullable(),
});

/**
 * L'extraction lue au dépôt, renvoyée par l'écran à la création.
 *
 * Elle vient de notre propre serveur, mais elle transite par le client : on la
 * revalide donc entièrement, avec des bornes, et on refuse toute extraction
 * déclarée simulée. Rien de ce qu'elle contient n'est délivré sans relecture :
 * chaque ligne naît en NEEDS_REVIEW et la confirmation reste un acte humain.
 */
const extractedField = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.nullable(),
    confidence: z.number().min(0).max(1),
    unreadable: z.boolean(),
  });

const extractedLineSchema = z.object({
  position: z.number().int().min(0).max(100),
  rawText: z.string().max(500).nullable(),
  drugName: extractedField(z.string().max(200)),
  dosage: extractedField(z.string().max(80)),
  form: extractedField(z.string().max(120)),
  posology: extractedField(z.string().max(300)),
  durationDays: extractedField(z.number().int().min(0).max(3650)),
  quantity: extractedField(z.number().int().min(0).max(999)),
  instructions: extractedField(z.string().max(500)),
});

const extractionSchema = z.object({
  prescriberName: extractedField(z.string().max(200)),
  prescriberRpps: extractedField(z.string().max(30)),
  prescribedAt: extractedField(z.string().max(10)),
  patientName: extractedField(z.string().max(200)),
  lines: z.array(extractedLineSchema).max(40),
  overallConfidence: z.number().min(0).max(1),
  providerId: z.string().max(80),
  isSimulated: z.literal(false),
  warnings: z.array(z.string().max(500)).max(20),
});

const createSchema = z.object({
  patientId: z.string().trim().optional().nullable(),
  source: z.enum(["PHOTO", "SCAN", "IMAGE_UPLOAD", "PDF_UPLOAD", "MANUAL"]),
  manualLines: z.array(manualLineSchema).max(20).default([]),
  /**
   * Fichier déjà déposé par `uploadPrescriptionFileAction`.
   *
   * L'écran de départ envoie l'ordonnance dès qu'elle est choisie, pour
   * pouvoir en lire le nom du patient et le proposer. On ne la renvoie donc
   * pas une seconde fois à la validation : on cite sa clé.
   */
  storedFileKey: z.string().trim().max(300).optional().nullable(),
  storedFileName: z.string().trim().max(200).optional().nullable(),
  storedFileMimeType: z.string().trim().max(120).optional().nullable(),
  /** Lecture réalisée au dépôt (cf. `extractionSchema`). */
  extraction: extractionSchema.optional().nullable(),
});

/**
 * Ouvre une délivrance.
 *
 * Deux entrées, et une seule sortie. Soit un fichier est déposé et le lecteur
 * d'ordonnance tente d'en extraire les lignes ; soit le pharmacien a saisi ou
 * scanné les médicaments lui-même, et ce sont ses lignes qui font foi — aucune
 * extraction n'est alors lancée sur un fichier absent. Dans les deux cas rien
 * n'est confirmé : la vérification reste un acte professionnel, à l'écran
 * suivant.
 */
export async function createPrescriptionAction(
  _previous: ActionResult<{ prescriptionId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ prescriptionId: string }>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  const scope = session.scope;

  const rawLines = formData.get("manualLines");
  const parsed = createSchema.safeParse({
    patientId: formData.get("patientId") || null,
    source: formData.get("source") ?? "MANUAL",
    manualLines: typeof rawLines === "string" && rawLines ? safeParseLines(rawLines) : [],
    storedFileKey: formData.get("storedFileKey") || null,
    storedFileName: formData.get("storedFileName") || null,
    storedFileMimeType: formData.get("storedFileMimeType") || null,
    extraction: (() => {
      const raw = formData.get("extractionJson");
      if (typeof raw !== "string" || !raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })(),
  });

  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const { patientId, source, manualLines, extraction } = parsed.data;

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
  let fileKey: string | null = parsed.data.storedFileKey ?? null;
  let fileName: string | null = parsed.data.storedFileName ?? null;
  let fileMimeType: string | null = parsed.data.storedFileMimeType ?? null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) {
      return fail("Ce fichier dépasse 10 Mo. Choisissez un fichier plus léger.");
    }
    if (!ACCEPTED_MIME.includes(file.type)) {
      return fail("Format non pris en charge. Utilisez un PDF ou une photo (JPG, PNG, WEBP).");
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
      isDemo: recordIsDemo(session.pharmacy.isDemo),
    },
  });

  // Lecture déjà faite au dépôt : on l'écrit telle quelle, intégralement.
  // Pas de nouvel appel au lecteur — l'image a déjà été lue une fois, et tout
  // ce qu'elle contenait est ici.
  const extractedCount = extraction && fileKey ? extraction.lines.length : 0;
  if (extraction && fileKey) {
    await persistExtraction({ scope, prescriptionId: prescription.id, extracted: extraction });
  }

  if (manualLines.length > 0) {
    // Saisie directe : ces lignes viennent du pharmacien, pas d'une lecture.
    // Aucune confiance par champ n'est enregistrée — il n'y a rien à douter.
    // Leur position suit celles lues sur l'image : la clé (ordonnance,
    // position) est unique.
    await prisma.prescriptionLine.createMany({
      data: manualLines.map((line, index) => ({
        prescriptionId: prescription.id,
        position: extractedCount + index + 1,
        rawText: null,
        drugName: line.drugName,
        dosage: line.dosage || null,
        form: line.form || null,
        drugSpecialtyId: line.drugSpecialtyId || null,
        identifiedBy: line.drugSpecialtyId ? ("PHARMACIST" as const) : null,
        status: "EXTRACTED" as const,
      })),
    });
    await prisma.prescription.update({
      where: { id: prescription.id },
      data: { status: "NEEDS_VERIFICATION" },
    });
  } else if (!extraction && fileKey && getOCRProvider().info.capability === "LIVE") {
    // La lecture n'est tentée que si un lecteur RÉEL est branché. Sans lui,
    // l'ordonnance reste vide et le pharmacien saisit les lignes : c'est le
    // point le plus important de tout ce fichier. Un lecteur simulé rendrait
    // une ordonnance plausible et fausse — des médicaments que personne n'a
    // prescrits, présentés comme lus sur la photo du patient.
    try {
      await extractPrescription({ scope, prescriptionId: prescription.id });
    } catch (error) {
      // L'échec de lecture ne perd pas la délivrance : l'ordonnance existe,
      // le pharmacien saisit les lignes à l'écran suivant.
      console.error("[prescriptions] extraction impossible", error);
      await prisma.prescription.update({
        where: { id: prescription.id },
        data: { status: "NEEDS_VERIFICATION" },
      });
    }
  } else {
    // Ni fichier ni ligne : une délivrance vide, à compléter au comptoir.
    await prisma.prescription.update({
      where: { id: prescription.id },
      data: { status: "NEEDS_VERIFICATION" },
    });
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

const addLineSchema = z.object({
  prescriptionId: z.string().min(1),
  drugName: z.string().trim().min(1, "Le nom du médicament est obligatoire").max(200),
  form: z.string().trim().max(120).optional(),
});

/**
 * Ajoute un médicament à une délivrance déjà ouverte.
 *
 * C'est la porte de sortie indispensable du comptoir : une ordonnance qui
 * n'a pas pu être lue arrive vide, et il faut pouvoir la remplir sans repartir
 * de l'écran précédent. La ligne créée est NON confirmée, comme toute autre.
 */
export async function addPrescriptionLineAction(
  payload: z.input<typeof addLineSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VERIFY);
  const parsed = addLineSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const prescription = await prisma.prescription.findUnique({
    where: { id: parsed.data.prescriptionId },
    select: { id: true, pharmacyId: true },
  });
  if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) {
    return fail("Ordonnance introuvable dans cette officine.");
  }

  const last = await prisma.prescriptionLine.findFirst({
    where: { prescriptionId: prescription.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await prisma.prescriptionLine.create({
    data: {
      prescriptionId: prescription.id,
      position: (last?.position ?? 0) + 1,
      drugName: parsed.data.drugName,
      form: parsed.data.form || null,
      status: "EXTRACTED",
    },
  });

  revalidatePath(`/vente/${prescription.id}`);
  return ok(null, `${parsed.data.drugName} ajouté.`);
}

const scheduleSchema = z.object({
  morning: z.coerce.number().int().min(0).max(20),
  noon: z.coerce.number().int().min(0).max(20),
  evening: z.coerce.number().int().min(0).max(20),
  bedtime: z.coerce.number().int().min(0).max(20),
  mealTiming: z.enum(["BEFORE", "DURING", "AFTER"]).nullable(),
  times: z.array(z.string().trim().max(5)).max(6).default([]),
});

const lineSchema = z.object({
  id: z.string(),
  drugName: z.string().trim().min(1, "Le nom du médicament est obligatoire"),
  dosage: z.string().trim().optional(),
  form: z.string().trim().optional(),
  posology: z.string().trim().optional(),
  /** Répartition confirmée. Absente = le pharmacien n'a rien tranché. */
  schedule: scheduleSchema.nullable().optional(),
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
  /**
   * `false` : l'écran lance l'analyse lui-même, par la route de progression
   * (`/api/ordonnances/[id]/analyse`), pour montrer chaque étape au fur et à
   * mesure. La vérification, elle, reste un acte atomique enregistré ici.
   */
  runAnalysis: z.boolean().default(true),
});

/**
 * Enregistre la vérification humaine puis lance l'analyse.
 * C'est l'acte professionnel qui autorise la suite du parcours : sans ligne
 * confirmée, le moteur refuse d'analyser.
 */
export async function verifyPrescriptionAction(
  payload: z.input<typeof verifySchema>,
): Promise<ActionResult<{ analysisRunId: string | null; recommendationCount: number }>> {
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
      // La répartition confirmée fait foi : on réécrit le texte de posologie
      // à partir d'elle, pour que le plan patient, les rappels et l'historique
      // racontent tous la même chose. Sans répartition, le texte d'origine est
      // conservé tel quel — on ne le reformule pas à la place du prescripteur.
      const schedule = line.schedule ? readSchedule(line.schedule) : null;
      const posology =
        schedule && hasDoses(schedule)
          ? formatSchedule(schedule, unitLabel(line.form))
          : line.posology || null;

      await tx.prescriptionLine.update({
        where: { id: line.id },
        data: {
          drugName: line.drugName,
          dosage: line.dosage || null,
          form: line.form || null,
          posology,
          schedule: schedule ?? undefined,
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

  if (!input.runAnalysis) {
    revalidatePath(`/vente/${prescription.id}`);
    revalidatePath("/ordonnances");
    return ok({ analysisRunId: null, recommendationCount: 0 });
  }

  const { analysisRunId, result } = await analysePrescription({
    scope,
    prescriptionId: prescription.id,
  });

  revalidatePath(`/vente/${prescription.id}`);
  revalidatePath("/ordonnances");

  return ok({ analysisRunId, recommendationCount: result.recommendations.length });
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
