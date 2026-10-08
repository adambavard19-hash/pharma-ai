"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { refuseInDemo } from "./demo-guard";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { hashPassword, validatePasswordStrength } from "@/server/security/password";
import { recordAudit } from "@/server/audit/log";
import { moveTeamMember, nextSortOrder, updateTeamMember, type MemberChanges } from "@/server/services/team-management";
import type { TeamActor, TeamRole } from "@/core/team/rules";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Gestion de l'équipe par le titulaire.
 *
 * Toutes ces actions sont bornées à l'officine de la session : le collaborateur
 * visé doit avoir une adhésion (`Membership`) dans CETTE officine, sinon
 * l'action échoue. Ce contrôle est refait à chaque appel côté serveur et ne
 * dépend jamais de ce que l'écran a bien voulu envoyer.
 */

/** Les postes qu'on peut donner à quelqu'un qu'on AJOUTE ; devenir titulaire passe par « Modifier » (règles de l'équipe). */
const ASSIGNABLE_ROLES = ["PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER"] as const;

const createSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est obligatoire").max(80),
  lastName: z.string().trim().min(1, "Le nom est obligatoire").max(80),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  role: z.enum(ASSIGNABLE_ROLES),
  rppsNumber: z.string().trim().max(20).optional(),
  password: z.string().min(1, "Mot de passe requis"),
});

/** Retrouve l'adhésion d'un collaborateur DANS l'officine de la session. */
async function membershipInScope(userId: string, pharmacyId: string) {
  return prisma.membership.findUnique({
    where: { userId_pharmacyId: { userId, pharmacyId } },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
}

export async function createCollaboratorAction(
  payload: z.input<typeof createSchema>,
): Promise<ActionResult<{ userId: string }>> {
  const session = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const input = parsed.data;
  const weaknesses = validatePasswordStrength(input.password);
  if (weaknesses.length > 0) {
    return fail(`Mot de passe trop faible : ${weaknesses.join(", ")}.`, {
      password: `Mot de passe trop faible : ${weaknesses.join(", ")}.`,
    });
  }

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, organizationId: true },
  });

  // Une adresse déjà connue dans une AUTRE organisation ne dit rien de plus
  // qu'« indisponible » : confirmer son existence renseignerait sur la
  // clientèle de PharmaBoost.
  if (existing && existing.organizationId !== session.scope.organizationId) {
    return fail("Cette adresse e-mail n'est pas disponible.", {
      email: "Cette adresse e-mail n'est pas disponible.",
    });
  }

  if (existing) {
    const already = await membershipInScope(existing.id, session.scope.pharmacyId);
    if (already) {
      return fail("Ce collaborateur fait déjà partie de votre équipe.", {
        email: "Ce collaborateur fait déjà partie de votre équipe.",
      });
    }
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            passwordHash,
            status: "ACTIVE",
            deletedAt: null,
            rppsNumber: input.rppsNumber || null,
          },
        })
      : await tx.user.create({
          data: {
            organizationId: session.scope.organizationId,
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            passwordHash,
            status: "ACTIVE",
            rppsNumber: input.rppsNumber || null,
          },
        });

    await tx.membership.create({
      data: {
        userId: created.id,
        pharmacyId: session.scope.pharmacyId,
        role: input.role,
        isActive: true,
        // Le nouveau collaborateur arrive en dernier dans la liste ; le titulaire peut le remonter.
        sortOrder: await nextSortOrder(tx, session.scope.pharmacyId),
      },
    });

    return created;
  });

  await recordAudit({
    action: "team.member_created",
    entityType: "User",
    entityId: user.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { role: input.role },
  });

  revalidatePath("/equipe");
  return ok({ userId: user.id }, `${input.firstName} ${input.lastName} peut se connecter.`);
}

const accessSchema = z.object({
  userId: z.string().min(1),
  isActive: z.boolean(),
});

export async function setCollaboratorAccessAction(
  payload: z.input<typeof accessSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const parsed = accessSchema.safeParse(payload);
  if (!parsed.success) return fail("Requête invalide.");

  const membership = await membershipInScope(parsed.data.userId, session.scope.pharmacyId);
  if (!membership) return fail("Collaborateur introuvable dans votre équipe.");

  // Se couper soi-même l'accès laisserait l'officine sans titulaire connecté.
  if (membership.userId === session.scope.userId) {
    return fail("Vous ne pouvez pas désactiver votre propre accès.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { id: membership.id },
      data: { isActive: parsed.data.isActive },
    });
    // Couper l'accès révoque les sessions ouvertes : sans cela, un
    // collaborateur désactivé resterait connecté jusqu'à l'expiration.
    if (!parsed.data.isActive) {
      await tx.session.updateMany({
        where: { userId: membership.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  });

  await recordAudit({
    action: parsed.data.isActive ? "team.member_enabled" : "team.member_disabled",
    entityType: "User",
    entityId: membership.userId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
  });

  revalidatePath("/equipe");
  return ok(
    null,
    parsed.data.isActive
      ? `Accès rétabli pour ${membership.user.firstName}.`
      : `Accès suspendu pour ${membership.user.firstName}.`,
  );
}

const TEAM_ROLE_VALUES = ["OWNER", "PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER"] as const;

/** Qui agit, pour les règles de l'équipe : un membre de l'officine, avec son poste. */
const memberActor = (session: { scope: { userId: string }; role: string }): TeamActor => ({ kind: "member", userId: session.scope.userId, role: session.role as TeamRole });

const roleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(TEAM_ROLE_VALUES),
});

/**
 * Changer le poste de quelqu'un, d'un geste (le choix dans la liste). Passe par les règles de l'équipe : on peut
 * nommer un autre titulaire (associé), jamais laisser l'officine sans titulaire actif ni sans titulaire principal.
 */
export async function setCollaboratorRoleAction(
  payload: z.input<typeof roleSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const parsed = roleSchema.safeParse(payload);
  if (!parsed.success) return fail("Poste invalide.");

  const result = await updateTeamMember({
    pharmacyId: session.scope.pharmacyId,
    userId: parsed.data.userId,
    changes: { role: parsed.data.role },
    actor: memberActor(session),
    audit: { userId: session.scope.userId },
  });
  if (!result.ok) return fail(result.error);
  revalidatePath("/equipe");
  return ok(null, result.changed.length > 0 ? "Poste mis à jour." : "Rien à changer.");
}

const updateSchema = z.object({
  userId: z.string().min(1),
  firstName: z.string().trim().min(1, "Le prénom est obligatoire").max(80).optional(),
  lastName: z.string().trim().min(1, "Le nom est obligatoire").max(80).optional(),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(160).optional(),
  phone: z.string().trim().max(30).regex(/^[0-9+().\s-]*$/, "Numéro de téléphone invalide").nullable().optional(),
  rppsNumber: z.string().trim().max(20).regex(/^[0-9]*$/, "Le numéro RPPS ne contient que des chiffres").nullable().optional(),
  role: z.enum(TEAM_ROLE_VALUES).optional(),
  isPrincipal: z.boolean().optional(),
});

/**
 * Modifier un collaborateur depuis l'espace du titulaire : prénom, nom, adresse, téléphone, RPPS, poste, et titulaire
 * principal. Tout ou rien. Un compte qui travaille aussi dans une autre officine garde son identité (voir
 * `core/team/rules.ts`) ; on ne change pas sa propre adresse ici.
 */
export async function updateCollaboratorAction(
  payload: z.input<typeof updateSchema>,
): Promise<ActionResult<{ changed: string[] }>> {
  const session = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const refused = refuseInDemo(session, "Mode démo : les comptes de la démonstration ne se modifient pas.");
  if (refused) return refused;
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));

  const { userId, ...changes } = parsed.data;
  const result = await updateTeamMember({
    pharmacyId: session.scope.pharmacyId,
    userId,
    changes: changes as MemberChanges,
    actor: memberActor(session),
    audit: { userId: session.scope.userId },
  });
  if (!result.ok) return fail(result.error);

  revalidatePath("/equipe");
  if (result.changed.length === 0) return ok({ changed: [] }, "Rien à changer.");
  return ok({ changed: result.changed }, result.changed.includes("email") ? `${result.name} est à jour. Son adresse a changé : ses sessions sont fermées, pensez à lui définir un nouveau mot de passe.` : `${result.name} est à jour.`);
}

const moveSchema = z.object({ userId: z.string().min(1), direction: z.enum(["up", "down"]) });

/** Monter ou descendre un collaborateur dans la liste de l'équipe. */
export async function moveCollaboratorAction(
  payload: z.input<typeof moveSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const parsed = moveSchema.safeParse(payload);
  if (!parsed.success) return fail("Requête invalide.");
  const result = await moveTeamMember({ pharmacyId: session.scope.pharmacyId, userId: parsed.data.userId, direction: parsed.data.direction, audit: { userId: session.scope.userId } });
  if (!result.ok) return fail(result.error);
  revalidatePath("/equipe");
  return ok(null, result.moved ? `${result.name} a changé de place.` : parsed.data.direction === "up" ? `${result.name} est déjà en première place.` : `${result.name} est déjà en dernière place.`);
}

const passwordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(1),
});

export async function resetCollaboratorPasswordAction(
  payload: z.input<typeof passwordSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const refused = refuseInDemo(session, "Mode démo : les mots de passe du compte de démonstration ne changent pas.");
  if (refused) return refused;
  const parsed = passwordSchema.safeParse(payload);
  if (!parsed.success) return fail("Requête invalide.");

  const weaknesses = validatePasswordStrength(parsed.data.password);
  if (weaknesses.length > 0) {
    return fail(`Mot de passe trop faible : ${weaknesses.join(", ")}.`);
  }

  const membership = await membershipInScope(parsed.data.userId, session.scope.pharmacyId);
  if (!membership) return fail("Collaborateur introuvable dans votre équipe.");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: membership.userId },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    });
    await tx.session.updateMany({
      where: { userId: membership.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await recordAudit({
    action: "team.member_password_reset",
    entityType: "User",
    entityId: membership.userId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
  });

  revalidatePath("/equipe");
  return ok(null, `Nouveau mot de passe défini pour ${membership.user.firstName}.`);
}
