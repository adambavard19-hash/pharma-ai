"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { recordAudit } from "@/server/audit/log";
import {
  addChallengeEntry,
  deleteChallenge,
  deleteChallengeEntry,
  saveChallenge,
  searchChallengeProducts,
  setChallengeStatus,
  type ChallengeProductOption,
} from "@/server/services/challenges";
import { isUniverseKey } from "@/config/universes";
import { MAX_TIERS, validateChallengeTerms } from "@/core/challenges/terms";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Les challenges laboratoires, côté titulaire.
 *
 * Réservé à LAB_PROGRAMS_MANAGE (le titulaire par défaut). Un challenge est
 * commercial : il ne touche jamais au moteur de conseil et n'apparaît jamais
 * au comptoir. Chaque action revérifie la permission (masquer un bouton ne
 * protège rien), valide l'entrée, travaille dans l'officine de la session et
 * laisse une trace dans le journal d'audit.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Un identifiant de la base (cuid) : borné, pour ne jamais traîner une chaîne arbitraire jusqu'à Prisma. */
const recordId = z.string().trim().min(1).max(64);

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

const nullableInt = (label: string) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((value, context) => {
      if (value === null || value === undefined || value === "") return null;
      const number = typeof value === "number" ? value : Number(String(value).replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(number) || !Number.isInteger(number)) {
        context.addIssue({ code: "custom", message: `${label} : un nombre entier.` });
        return z.NEVER;
      }
      return number;
    });

const tierSchema = z.object({
  units: z.coerce.number().int("Un seuil entier.").min(1, "Un seuil d'au moins 1 unité."),
  bonusCents: z.coerce.number().int().min(0),
});

const challengeSchema = z.object({
  id: recordId.optional().nullable(),
  title: z.string().trim().min(1, "Donnez un titre au challenge.").max(120, "120 caractères au plus."),
  laboratory: z.string().trim().min(1, "Indiquez le laboratoire.").max(80, "80 caractères au plus."),
  brand: nullableText(80),
  universe: nullableText(60).refine((value) => value === null || isUniverseKey(value), "Univers inconnu."),
  productIds: z.array(recordId).max(500, "500 produits au plus.").default([]),
  startsOn: z.string().regex(DAY, "Date de début invalide."),
  endsOn: z.string().regex(DAY, "Date de fin invalide."),
  targetUnits: nullableInt("Objectif"),
  rewardMode: z.enum(["NONE", "PER_UNIT", "TIERS"]),
  bonusPerUnitCents: nullableInt("Prime"),
  tiers: z.array(tierSchema).max(MAX_TIERS, `${MAX_TIERS} paliers au plus.`).default([]),
  countMode: z.enum(["ALL_SALES", "ATTRIBUTED"]),
  notes: nullableText(1000),
});

function revalidateChallenges(id?: string) {
  revalidatePath("/parametres/laboratoires/challenges");
  if (id) revalidatePath(`/parametres/laboratoires/challenges/${id}`);
  revalidatePath("/pilotage");
  revalidatePath("/admin/challenges");
}

/** Crée ou modifie un challenge. */
export async function saveChallengeAction(payload: z.input<typeof challengeSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  const parsed = challengeSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le challenge saisi.", zodFieldErrors(parsed.error.issues));
  const input = parsed.data;

  const termErrors = validateChallengeTerms({
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    targetUnits: input.targetUnits,
    rewardMode: input.rewardMode,
    bonusPerUnitCents: input.bonusPerUnitCents,
    tiers: input.tiers,
  });
  if (Object.keys(termErrors).length > 0) return fail("Vérifiez le challenge saisi.", termErrors);

  const result = await saveChallenge(
    session.scope,
    {
      title: input.title,
      laboratory: input.laboratory,
      brand: input.brand,
      universe: input.universe,
      productIds: input.productIds,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      targetUnits: input.targetUnits,
      rewardMode: input.rewardMode,
      bonusPerUnitCents: input.rewardMode === "PER_UNIT" ? input.bonusPerUnitCents : null,
      tiers: input.rewardMode === "TIERS" ? input.tiers : [],
      countMode: input.countMode,
      notes: input.notes,
    },
    input.id,
  );
  if (!result.ok) return fail(result.error, result.fieldErrors);

  await recordAudit({
    action: "challenge.saved",
    entityType: "LabChallenge",
    entityId: result.data.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: {
      created: result.data.created,
      laboratory: input.laboratory,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      targetUnits: input.targetUnits,
      rewardMode: input.rewardMode,
      countMode: input.countMode,
      products: input.productIds.length,
    },
  });

  revalidateChallenges(result.data.id);
  return ok({ id: result.data.id }, result.data.created ? "Challenge créé." : "Challenge enregistré.");
}

const statusSchema = z.object({ id: recordId, status: z.enum(["ACTIVE", "ENDED", "ARCHIVED"]) });

const STATUS_MESSAGES = { ACTIVE: "Challenge réactivé.", ENDED: "Challenge terminé.", ARCHIVED: "Challenge archivé." } as const;

/** Termine, archive ou réactive un challenge. */
export async function setChallengeStatusAction(payload: z.input<typeof statusSchema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  const parsed = statusSchema.safeParse(payload);
  if (!parsed.success) return fail("Statut invalide.");

  const challenge = await setChallengeStatus(session.scope, parsed.data.id, parsed.data.status);
  if (!challenge) return fail("Challenge introuvable dans cette officine.");

  await recordAudit({
    action: "challenge.saved",
    entityType: "LabChallenge",
    entityId: parsed.data.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { status: parsed.data.status, laboratory: challenge.laboratory },
  });

  revalidateChallenges(parsed.data.id);
  return ok(null, STATUS_MESSAGES[parsed.data.status]);
}

/** Supprime un challenge et ses saisies (pour une erreur de saisie ; sinon, archiver). */
export async function deleteChallengeAction(id: string): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  if (!recordId.safeParse(id).success) return fail("Challenge introuvable dans cette officine.");

  const challenge = await deleteChallenge(session.scope, id);
  if (!challenge) return fail("Challenge introuvable dans cette officine.");

  await recordAudit({
    action: "challenge.deleted",
    entityType: "LabChallenge",
    entityId: id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { title: challenge.title, laboratory: challenge.laboratory },
  });

  revalidateChallenges();
  return ok(null, "Challenge supprimé.");
}

const entrySchema = z.object({
  challengeId: recordId,
  units: z.coerce.number({ message: "Un nombre d'unités." }).int("Un nombre entier d'unités."),
  occurredOn: z.string().regex(DAY, "Date invalide."),
  note: nullableText(200),
});

/** Ajoute des unités vendues hors PharmaBoost (ou une correction négative d'après le relevé du laboratoire). */
export async function addChallengeEntryAction(payload: z.input<typeof entrySchema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  const parsed = entrySchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la saisie.", zodFieldErrors(parsed.error.issues));

  const result = await addChallengeEntry(session.scope, parsed.data.challengeId, {
    units: parsed.data.units,
    occurredOn: parsed.data.occurredOn,
    note: parsed.data.note,
  });
  if (!result.ok) return fail(result.error, result.fieldErrors);

  await recordAudit({
    action: "challenge.entry_added",
    entityType: "LabChallengeEntry",
    entityId: result.data.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { challengeId: parsed.data.challengeId, units: parsed.data.units, occurredOn: parsed.data.occurredOn },
  });

  revalidateChallenges(parsed.data.challengeId);
  return ok(null, parsed.data.units > 0 ? `${parsed.data.units} unité${parsed.data.units > 1 ? "s" : ""} ajoutée${parsed.data.units > 1 ? "s" : ""}.` : "Correction enregistrée.");
}

/** Retire une saisie manuelle. */
export async function deleteChallengeEntryAction(entryId: string): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  if (!recordId.safeParse(entryId).success) return fail("Saisie introuvable dans cette officine.");

  const result = await deleteChallengeEntry(session.scope, entryId);
  if (!result.ok) return fail(result.error);
  const entry = result.data;

  await recordAudit({
    action: "challenge.entry_deleted",
    entityType: "LabChallengeEntry",
    entityId: entryId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { challengeId: entry.challengeId, units: entry.units },
  });

  revalidateChallenges(entry.challengeId);
  return ok(null, "Saisie retirée.");
}

const productSearchSchema = z.object({
  brand: z.string().trim().max(80).optional().nullable(),
  query: z.string().trim().max(80).optional().nullable(),
});

/** Les produits de l'officine d'une marque (et d'un mot du libellé), pour choisir ceux du challenge. */
export async function searchChallengeProductsAction(
  payload: z.input<typeof productSearchSchema>,
): Promise<ActionResult<{ total: number; items: ChallengeProductOption[] }>> {
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  const parsed = productSearchSchema.safeParse(payload);
  if (!parsed.success) return fail("Recherche invalide.");
  return ok(await searchChallengeProducts(session.scope, { brand: parsed.data.brand, query: parsed.data.query, limit: 200 }));
}
