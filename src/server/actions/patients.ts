"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { nextReference } from "@/server/services/references";
import { upsertHealthProfile } from "@/server/services/patients";
import { recordAudit } from "@/server/audit/log";
import { isDemoMode } from "@/config/env";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

const patientSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().trim().min(1, "Le prénom est obligatoire").max(80),
  lastName: z.string().trim().min(1, "Le nom est obligatoire").max(80),
  birthDate: z.string().trim().optional(),
  sex: z.enum(["FEMALE", "MALE", "UNSPECIFIED"]).default("UNSPECIFIED"),
  email: z.string().trim().email("Adresse e-mail invalide").optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional(),
  addressLine1: z.string().trim().max(160).optional(),
  postalCode: z.string().trim().max(10).optional(),
  city: z.string().trim().max(80).optional(),
  commercialNotes: z.string().trim().max(1000).optional(),
});

export async function savePatientAction(
  _previous: ActionResult<{ patientId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ patientId: string }>> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = patientSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const input = parsed.data;
  const session = await requirePermission(
    input.id ? PERMISSIONS.PATIENT_UPDATE : PERMISSIONS.PATIENT_CREATE,
  );
  const scope = session.scope;

  const data = {
    firstName: input.firstName,
    lastName: input.lastName,
    birthDate: input.birthDate ? new Date(input.birthDate) : null,
    sex: input.sex,
    email: input.email || null,
    phone: input.phone || null,
    addressLine1: input.addressLine1 || null,
    postalCode: input.postalCode || null,
    city: input.city || null,
    commercialNotes: input.commercialNotes || null,
  };

  if (input.id) {
    const existing = await prisma.patient.findUnique({
      where: { id: input.id },
      select: { pharmacyId: true },
    });
    if (!existing || existing.pharmacyId !== scope.pharmacyId) {
      return fail("Patient introuvable dans cette officine.");
    }

    await prisma.patient.update({ where: { id: input.id }, data });
    await recordAudit({
      action: "patient.updated",
      entityType: "Patient",
      entityId: input.id,
      pharmacyId: scope.pharmacyId,
      userId: scope.userId,
    });

    revalidatePath(`/patients/${input.id}`);
    revalidatePath("/patients");
    return ok({ patientId: input.id }, "Fiche patient mise à jour.");
  }

  const reference = await nextReference("patient", scope.pharmacyId);
  const patient = await prisma.patient.create({
    data: {
      ...data,
      pharmacyId: scope.pharmacyId,
      reference,
      isDemo: isDemoMode(),
    },
  });

  await recordAudit({
    action: "patient.created",
    entityType: "Patient",
    entityId: patient.id,
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    metadata: { reference },
  });

  revalidatePath("/patients");
  return ok({ patientId: patient.id }, "Patient créé.");
}

const healthSchema = z.object({
  patientId: z.string().min(1),
  allergies: z.string().trim().max(1000).optional(),
  conditions: z.string().trim().max(1000).optional(),
  currentTreatments: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
  isPregnant: z.enum(["yes", "no", "unknown"]).default("unknown"),
  isBreastfeeding: z.enum(["yes", "no", "unknown"]).default("unknown"),
  renalImpairment: z.enum(["yes", "no", "unknown"]).default("unknown"),
  hepaticImpairment: z.enum(["yes", "no", "unknown"]).default("unknown"),
});

const triState = (value: "yes" | "no" | "unknown"): boolean | null =>
  value === "unknown" ? null : value === "yes";

const splitList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export async function saveHealthProfileAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PATIENT_HEALTH_UPDATE);
  const parsed = healthSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const input = parsed.data;
  const patient = await prisma.patient.findUnique({
    where: { id: input.patientId },
    select: { pharmacyId: true },
  });
  if (!patient || patient.pharmacyId !== session.scope.pharmacyId) {
    return fail("Patient introuvable dans cette officine.");
  }

  await upsertHealthProfile(
    input.patientId,
    {
      allergies: splitList(input.allergies),
      conditions: splitList(input.conditions),
      currentTreatments: splitList(input.currentTreatments),
      notes: input.notes || null,
      isPregnant: triState(input.isPregnant),
      isBreastfeeding: triState(input.isBreastfeeding),
      renalImpairment: triState(input.renalImpairment),
      hepaticImpairment: triState(input.hepaticImpairment),
    },
    session.scope.userId,
  );

  await recordAudit({
    action: "patient.health_updated",
    entityType: "PatientHealthProfile",
    entityId: input.patientId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    // Aucune donnée de santé en clair dans le journal : on ne trace que des compteurs.
    metadata: {
      allergiesCount: splitList(input.allergies).length,
      conditionsCount: splitList(input.conditions).length,
    },
  });

  revalidatePath(`/patients/${input.patientId}`);
  return ok(null, "Profil de santé mis à jour.");
}

const consentSchema = z.object({
  patientId: z.string().min(1),
  type: z.enum([
    "DATA_PROCESSING",
    "HEALTH_DATA",
    "ADVICE_SHARING",
    "FOLLOW_UP_MESSAGE",
    "MARKETING_EMAIL",
    "MARKETING_SMS",
  ]),
  granted: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function updateConsentAction(formData: FormData): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PATIENT_UPDATE);
  const parsed = consentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return fail("Consentement invalide.");

  const { patientId, type, granted } = parsed.data;
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { pharmacyId: true },
  });
  if (!patient || patient.pharmacyId !== session.scope.pharmacyId) {
    return fail("Patient introuvable dans cette officine.");
  }

  const now = new Date();
  await prisma.patientConsent.upsert({
    where: { patientId_type: { patientId, type } },
    create: {
      patientId,
      type,
      granted,
      grantedAt: granted ? now : null,
      revokedAt: granted ? null : now,
      collectedByUserId: session.scope.userId,
    },
    update: {
      granted,
      grantedAt: granted ? now : undefined,
      revokedAt: granted ? null : now,
      collectedByUserId: session.scope.userId,
    },
  });

  await recordAudit({
    action: "patient.consent_updated",
    entityType: "PatientConsent",
    entityId: patientId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { type, granted },
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/suivis");
  return ok(null, granted ? "Consentement enregistré." : "Consentement retiré.");
}

/**
 * Suppression du patient (droit à l'effacement).
 *
 * Suppression logique immédiate + anonymisation des données identifiantes.
 * L'historique commercial agrégé est conservé sans rattachement nominatif, ce
 * qui préserve la cohérence comptable sans conserver la personne.
 */
export async function deletePatientAction(patientId: string): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PATIENT_DELETE);

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { pharmacyId: true, reference: true },
  });
  if (!patient || patient.pharmacyId !== session.scope.pharmacyId) {
    return fail("Patient introuvable dans cette officine.");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.patientHealthProfile.deleteMany({ where: { patientId } });
    await tx.patient.update({
      where: { id: patientId },
      data: {
        firstName: "Patient",
        lastName: "anonymisé",
        email: null,
        phone: null,
        addressLine1: null,
        postalCode: null,
        city: null,
        birthDate: null,
        commercialNotes: null,
        deletedAt: now,
        anonymizedAt: now,
      },
    });
  });

  await recordAudit({
    action: "patient.deleted",
    entityType: "Patient",
    entityId: patientId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { reference: patient.reference, method: "anonymisation" },
  });

  revalidatePath("/patients");
  return ok(null, "Patient supprimé et données identifiantes anonymisées.");
}
