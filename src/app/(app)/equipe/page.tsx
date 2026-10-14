import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadTeam } from "@/server/services/team-management";
import { listInvitations, listJoinRequests } from "@/server/services/team-access";
import { listComptoirs } from "@/server/services/comptoirs";
import { ensureTeamPassword } from "@/server/services/team-password";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/ui/page";
import { TeamManager, type TeamMember } from "./team-manager";

export const metadata: Metadata = { title: "Mon équipe" };

/**
 * L'équipe — écran de titulaire.
 *
 * La requête est bornée à `pharmacyId` : un titulaire de groupe qui bascule
 * d'officine voit l'équipe de l'officine active, jamais l'union des deux.
 * L'ordre est celui que le titulaire a choisi (flèches de la liste).
 */
export default async function TeamPage() {
  const session = await requirePermission(PERMISSIONS.TEAM_MANAGE);

  const [team, invitations, requests, comptoirs, joined] = await Promise.all([
    loadTeam(session.scope.pharmacyId),
    listInvitations(session.scope.pharmacyId),
    listJoinRequests(session.scope.pharmacyId),
    listComptoirs(session.scope.pharmacyId),
    prisma.membership.findMany({ where: { pharmacyId: session.scope.pharmacyId }, select: { userId: true, createdAt: true } }),
  ]);
  // Le mot de passe de l'officine : seul un titulaire le voit (créé ici pour une officine d'avant qui n'en a pas encore).
  const teamPassword = session.role === "OWNER" ? await ensureTeamPassword(session.scope.pharmacyId) : null;
  const joinedAt = new Map(joined.map((row) => [row.userId, row.createdAt]));
  // Qui travaille à quel comptoir : une personne, ses comptoirs.
  const comptoirOf = new Map<string, string[]>();
  for (const post of comptoirs) if (post.assignedUserId) comptoirOf.set(post.assignedUserId, [...(comptoirOf.get(post.assignedUserId) ?? []), post.name]);
  const members: TeamMember[] = team.map((member) => ({
    userId: member.userId,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    phone: member.phone,
    rppsNumber: member.rppsNumber,
    role: member.role,
    isActive: member.isActive,
    isPrincipal: member.isPrincipal,
    sharedAccount: member.sharedAccount,
    lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
    isSelf: member.userId === session.scope.userId,
    joinedAt: (joinedAt.get(member.userId) ?? new Date()).toISOString(),
    comptoir: comptoirOf.get(member.userId)?.join(", ") ?? null,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Mon équipe"
        description={`Qui travaille à ${session.pharmacy.name}, et comment chacun se connecte sur son poste.`}
      />
      <TeamManager
        teamPassword={teamPassword ? { password: teamPassword.password, updatedAt: teamPassword.updatedAt.toISOString() } : null}
        members={members}
        canManageOwners={session.role === "OWNER"}
        requests={requests.map((request) => ({ id: request.id, name: request.name, email: request.email, suggestedRole: request.suggestedRole, requestedAt: request.requestedAt.toISOString() }))}
        invitations={invitations.map((invitation) => ({ id: invitation.id, email: invitation.email, firstName: invitation.firstName, lastName: invitation.lastName, role: invitation.role, state: invitation.state, sentAt: invitation.sentAt.toISOString(), sentCount: invitation.sentCount }))}
      />
    </div>
  );
}
