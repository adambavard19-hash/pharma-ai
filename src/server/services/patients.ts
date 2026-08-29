import "server-only";
import { prisma } from "@/server/db/client";
import { decryptField, decryptList, encryptField, encryptList } from "@/server/security/encryption";
import { computeAge } from "@/lib/format";
import type { PatientContext } from "@/core/ai/types";
import type { TenantScope } from "@/server/db/tenant";

export type HealthProfileView = {
  allergies: string[];
  conditions: string[];
  currentTreatments: string[];
  notes: string | null;
  isPregnant: boolean | null;
  isBreastfeeding: boolean | null;
  renalImpairment: boolean | null;
  hepaticImpairment: boolean | null;
  weightKg: number | null;
  heightCm: number | null;
  updatedAt: Date | null;
};

const EMPTY_PROFILE: HealthProfileView = {
  allergies: [],
  conditions: [],
  currentTreatments: [],
  notes: null,
  isPregnant: null,
  isBreastfeeding: null,
  renalImpairment: null,
  hepaticImpairment: null,
  weightKg: null,
  heightCm: null,
  updatedAt: null,
};

/**
 * Lecture du profil de santé. Les champs libres sont déchiffrés ici et
 * nulle part ailleurs : aucun composant client ne reçoit la valeur chiffrée.
 */
export async function getHealthProfile(patientId: string): Promise<HealthProfileView> {
  const profile = await prisma.patientHealthProfile.findUnique({ where: { patientId } });
  if (!profile) return EMPTY_PROFILE;

  return {
    allergies: decryptList(profile.allergiesEncrypted),
    conditions: decryptList(profile.conditionsEncrypted),
    currentTreatments: decryptList(profile.currentTreatmentsEncrypted),
    notes: decryptField(profile.notesEncrypted),
    isPregnant: profile.isPregnant,
    isBreastfeeding: profile.isBreastfeeding,
    renalImpairment: profile.renalImpairment,
    hepaticImpairment: profile.hepaticImpairment,
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    updatedAt: profile.updatedAt,
  };
}

export async function upsertHealthProfile(
  patientId: string,
  input: Partial<HealthProfileView>,
  userId: string,
): Promise<void> {
  const data = {
    allergiesEncrypted: input.allergies ? encryptList(input.allergies) : undefined,
    conditionsEncrypted: input.conditions ? encryptList(input.conditions) : undefined,
    currentTreatmentsEncrypted: input.currentTreatments
      ? encryptList(input.currentTreatments)
      : undefined,
    notesEncrypted: input.notes !== undefined ? encryptField(input.notes) : undefined,
    isPregnant: input.isPregnant ?? undefined,
    isBreastfeeding: input.isBreastfeeding ?? undefined,
    renalImpairment: input.renalImpairment ?? undefined,
    hepaticImpairment: input.hepaticImpairment ?? undefined,
    weightKg: input.weightKg ?? undefined,
    heightCm: input.heightCm ?? undefined,
    updatedByUserId: userId,
  };

  await prisma.patientHealthProfile.upsert({
    where: { patientId },
    create: { patientId, ...data },
    update: data,
  });
}

/**
 * Construit le contexte patient transmis au moteur.
 * Un patient non rattaché donne un contexte vide mais explicite : le moteur
 * saura qu'il ne dispose d'aucune information, et le signalera.
 */
export async function buildPatientContext(
  patientId: string | null,
): Promise<PatientContext> {
  if (!patientId) {
    return {
      patientId: null,
      ageYears: null,
      sex: "UNSPECIFIED",
      isPregnant: null,
      isBreastfeeding: null,
      renalImpairment: null,
      hepaticImpairment: null,
      allergies: [],
      chronicConditions: [],
      currentTreatments: [],
      hasAdviceConsent: false,
    };
  }

  const [patient, profile, consent] = await Promise.all([
    prisma.patient.findUnique({
      where: { id: patientId },
      select: { birthDate: true, sex: true },
    }),
    getHealthProfile(patientId),
    prisma.patientConsent.findUnique({
      where: { patientId_type: { patientId, type: "ADVICE_SHARING" } },
      select: { granted: true, revokedAt: true },
    }),
  ]);

  return {
    patientId,
    ageYears: computeAge(patient?.birthDate ?? null),
    sex: patient?.sex ?? "UNSPECIFIED",
    isPregnant: profile.isPregnant,
    isBreastfeeding: profile.isBreastfeeding,
    renalImpairment: profile.renalImpairment,
    hepaticImpairment: profile.hepaticImpairment,
    allergies: profile.allergies,
    chronicConditions: profile.conditions,
    currentTreatments: profile.currentTreatments,
    hasAdviceConsent: Boolean(consent?.granted && !consent.revokedAt),
  };
}

export async function recordInteraction(params: {
  patientId: string;
  scope: TenantScope;
  type:
    | "PRESCRIPTION_RECEIVED"
    | "ADVICE_GIVEN"
    | "DOCUMENT_GENERATED"
    | "DOCUMENT_VIEWED"
    | "SALE_RECORDED"
    | "FOLLOW_UP_SCHEDULED"
    | "FOLLOW_UP_SENT"
    | "FOLLOW_UP_OPTED_OUT"
    | "NOTE";
  summary: string;
  metadata?: Record<string, unknown>;
  /** L'action vient du patient lui-même (désinscription) : aucun auteur interne. */
  byPatient?: boolean;
}): Promise<void> {
  await prisma.patientInteraction.create({
    data: {
      patientId: params.patientId,
      pharmacyId: params.scope.pharmacyId,
      type: params.type,
      summary: params.summary,
      metadata: (params.metadata ?? {}) as never,
      // La désinscription est un acte du patient, pas d'un collaborateur :
      // l'interaction est alors enregistrée sans auteur.
      userId: params.byPatient ? null : params.scope.userId,
    },
  });
}
