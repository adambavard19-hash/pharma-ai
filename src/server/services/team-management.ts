import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { emailEditBlock, identityEditBlock, moveInOrder, planTeamChange, positionsFor, type TeamActor, type TeamMemberState, type TeamRole } from "@/core/team/rules";

/**
 * L'équipe d'une officine : modifier un collaborateur (nom, coordonnées, poste, titulaire principal) et l'ordonner.
 *
 * Deux appelants, une seule règle : le titulaire depuis son espace, l'administrateur PharmaBoost depuis le sien. Les
 * règles (`core/team/rules.ts`) décident ; ce service les applique en UNE transaction — un changement refusé n'écrit
 * rien, un changement accepté s'écrit en entier.
 */

type Failure = { ok: false; error: string };

/** Qui est derrière le geste, pour le journal d'audit : un membre de l'officine, ou un administrateur. */
export type AuditActor = { userId: string } | { platformAdminId: string };

export type MemberChanges = {
  firstName?: string;
  lastName?: string;
  /** `null` efface le numéro. */
  phone?: string | null;
  rppsNumber?: string | null;
  email?: string;
  role?: TeamRole;
  isPrincipal?: boolean;
};

type Db = Pick<typeof prisma, "membership">;

/** La place suivante dans la liste : un nouveau collaborateur arrive en dernier. */
export async function nextSortOrder(client: Db, pharmacyId: string): Promise<number> {
  const last = await client.membership.findFirst({ where: { pharmacyId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  return (last?.sortOrder ?? 0) + 1;
}

/**
 * Une officine qui a un titulaire actif a TOUJOURS un titulaire principal. À appeler quand un titulaire part (compte
 * supprimé ou retiré) : le suivant dans la liste reprend le rôle. Sans titulaire actif, il n'y a rien à désigner.
 */
export async function ensurePrincipal(client: Pick<typeof prisma, "membership">, pharmacyId: string): Promise<void> {
  const owners = await client.membership.findMany({
    where: { pharmacyId, role: "OWNER", isActive: true, user: { deletedAt: null } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, isPrincipal: true },
  });
  if (owners.length === 0 || owners.some((owner) => owner.isPrincipal)) return;
  await client.membership.update({ where: { id: owners[0].id }, data: { isPrincipal: true } });
}

/** L'équipe, dans l'ordre choisi par le titulaire (puis par ancienneté). Les comptes supprimés n'y figurent pas. */
export async function loadTeam(pharmacyId: string) {
  const memberships = await prisma.membership.findMany({
    where: { pharmacyId, user: { deletedAt: null } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      role: true,
      isActive: true,
      isPrincipal: true,
      sortOrder: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, rppsNumber: true, lastLoginAt: true, _count: { select: { memberships: true } } } },
    },
  });
  return memberships.map((membership) => ({
    membershipId: membership.id,
    userId: membership.user.id,
    firstName: membership.user.firstName,
    lastName: membership.user.lastName,
    email: membership.user.email,
    phone: membership.user.phone,
    rppsNumber: membership.user.rppsNumber,
    lastLoginAt: membership.user.lastLoginAt,
    role: membership.role as TeamRole,
    isActive: membership.isActive,
    isPrincipal: membership.isPrincipal,
    /** Le compte travaille aussi dans une autre officine : son identité ne se modifie pas d'ici. */
    sharedAccount: membership.user._count.memberships > 1,
  }));
}

const auditFields = (audit: AuditActor) => ("userId" in audit ? { userId: audit.userId } : { platformAdminId: audit.platformAdminId });

/**
 * Modifie un collaborateur : son identité (prénom, nom, téléphone, RPPS, adresse), son poste, et s'il est le titulaire
 * principal. Tout ou rien : si le poste est refusé, le nom n'est pas enregistré non plus.
 */
export async function updateTeamMember(input: { pharmacyId: string; userId: string; changes: MemberChanges; actor: TeamActor; audit: AuditActor }): Promise<{ ok: true; name: string; changed: string[] } | Failure> {
  const members = await prisma.membership.findMany({
    where: { pharmacyId: input.pharmacyId, user: { deletedAt: null } },
    select: {
      id: true,
      userId: true,
      role: true,
      isActive: true,
      isPrincipal: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, rppsNumber: true, memberships: { where: { pharmacyId: { not: input.pharmacyId } }, select: { id: true } } } },
    },
  });
  const target = members.find((member) => member.userId === input.userId);
  if (!target) return { ok: false, error: "Collaborateur introuvable dans cette équipe." };

  const { changes } = input;
  const user = target.user;
  const identity: { firstName?: string; lastName?: string; phone?: string | null; rppsNumber?: string | null; email?: string } = {};
  if (changes.firstName !== undefined && changes.firstName !== user.firstName) identity.firstName = changes.firstName;
  if (changes.lastName !== undefined && changes.lastName !== user.lastName) identity.lastName = changes.lastName;
  if (changes.phone !== undefined && (changes.phone || null) !== (user.phone || null)) identity.phone = changes.phone || null;
  if (changes.rppsNumber !== undefined && (changes.rppsNumber || null) !== (user.rppsNumber || null)) identity.rppsNumber = changes.rppsNumber || null;
  const emailChanged = changes.email !== undefined && changes.email.toLowerCase() !== user.email.toLowerCase();
  if (emailChanged) identity.email = changes.email!.toLowerCase();

  if (Object.keys(identity).length > 0) {
    const blocked = identityEditBlock({ actor: input.actor, targetUserId: target.userId, otherPharmacies: user.memberships.length });
    if (blocked) return { ok: false, error: blocked };
  }
  if (emailChanged) {
    const blocked = emailEditBlock({ actor: input.actor, targetUserId: target.userId });
    if (blocked) return { ok: false, error: blocked };
    // « Indisponible » et rien de plus : confirmer qu'une adresse existe ailleurs renseignerait sur la clientèle.
    const taken = await prisma.user.findFirst({ where: { email: { equals: identity.email, mode: "insensitive" }, id: { not: target.userId } }, select: { id: true } });
    if (taken) return { ok: false, error: "Cette adresse e-mail n'est pas disponible." };
  }

  const team: TeamMemberState[] = members.map((member) => ({ userId: member.userId, role: member.role as TeamRole, isActive: member.isActive, isPrincipal: member.isPrincipal }));
  const plan = planTeamChange(team, { userId: target.userId, role: changes.role, isPrincipal: changes.isPrincipal }, input.actor);
  if (!plan.ok) return { ok: false, error: plan.error };

  const changedMemberships = plan.next.filter((next) => {
    const before = team.find((member) => member.userId === next.userId)!;
    return before.role !== next.role || before.isPrincipal !== next.isPrincipal;
  });
  const changedFields = Object.keys(identity).filter((key) => key !== "email");
  if (Object.keys(identity).length === 0 && changedMemberships.length === 0) return { ok: true, name: `${user.firstName} ${user.lastName}`, changed: [] };

  await prisma.$transaction(async (tx) => {
    if (Object.keys(identity).length > 0) {
      await tx.user.update({
        where: { id: target.userId },
        // Une nouvelle adresse invalide le lien « mot de passe » en attente : il partirait vers l'ancienne.
        data: { ...identity, ...(emailChanged ? { passwordResetTokenHash: null, passwordResetExpiresAt: null } : {}) },
      });
    }
    // Changer l'adresse de connexion ferme les sessions ouvertes : la personne se reconnecte avec la nouvelle.
    if (emailChanged) await tx.session.updateMany({ where: { userId: target.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    for (const next of changedMemberships) {
      const membership = members.find((member) => member.userId === next.userId)!;
      await tx.membership.update({ where: { id: membership.id }, data: { role: next.role, isPrincipal: next.isPrincipal } });
    }
  });

  const name = `${identity.firstName ?? user.firstName} ${identity.lastName ?? user.lastName}`;
  const base = { entityType: "User", entityId: target.userId, pharmacyId: input.pharmacyId, ...auditFields(input.audit) };
  if (Object.keys(identity).length > 0) await recordAudit({ ...base, action: "team.member_updated", metadata: { fields: [...changedFields, ...(emailChanged ? ["email"] : [])] } });
  if (plan.roleChanged) await recordAudit({ ...base, action: "team.member_role_changed", metadata: { from: team.find((m) => m.userId === target.userId)!.role, role: changes.role } });
  if (plan.principalChanged) await recordAudit({ ...base, action: "team.principal_changed", metadata: { principal: plan.next.find((m) => m.isPrincipal)?.userId ?? null, previous: team.find((m) => m.isPrincipal)?.userId ?? null } });

  return { ok: true, name, changed: [...changedFields, ...(emailChanged ? ["email"] : []), ...(plan.roleChanged ? ["role"] : []), ...(plan.principalChanged ? ["principal"] : [])] };
}

/** Monte ou descend un collaborateur d'un cran dans la liste de l'équipe. Les places sont renumérotées 1…n. */
export async function moveTeamMember(input: { pharmacyId: string; userId: string; direction: "up" | "down"; audit: AuditActor }): Promise<{ ok: true; moved: boolean; name: string } | Failure> {
  const members = await prisma.membership.findMany({
    where: { pharmacyId: input.pharmacyId, user: { deletedAt: null } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, userId: true, sortOrder: true, user: { select: { firstName: true, lastName: true } } },
  });
  const target = members.find((member) => member.userId === input.userId);
  if (!target) return { ok: false, error: "Collaborateur introuvable dans cette équipe." };
  const name = `${target.user.firstName} ${target.user.lastName}`;

  const order = members.map((member) => member.userId);
  const next = moveInOrder(order, input.userId, input.direction);
  const positions = positionsFor(next);
  const updates = members.filter((member) => member.sortOrder !== positions.get(member.userId));
  if (next.every((id, index) => id === order[index]) && updates.length === 0) return { ok: true, moved: false, name };

  await prisma.$transaction(updates.map((member) => prisma.membership.update({ where: { id: member.id }, data: { sortOrder: positions.get(member.userId)! } })));
  await recordAudit({ action: "team.member_reordered", entityType: "User", entityId: input.userId, pharmacyId: input.pharmacyId, ...auditFields(input.audit), metadata: { direction: input.direction } });
  return { ok: true, moved: true, name };
}
