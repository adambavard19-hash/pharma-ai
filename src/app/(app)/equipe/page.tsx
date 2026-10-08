import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadTeam } from "@/server/services/team-management";
import { PageHeader } from "@/components/ui/page";
import { TeamManager, type TeamMember } from "./team-manager";

export const metadata: Metadata = { title: "Équipe" };

/**
 * L'équipe — écran de titulaire.
 *
 * La requête est bornée à `pharmacyId` : un titulaire de groupe qui bascule
 * d'officine voit l'équipe de l'officine active, jamais l'union des deux.
 * L'ordre est celui que le titulaire a choisi (flèches de la liste).
 */
export default async function TeamPage() {
  const session = await requirePermission(PERMISSIONS.TEAM_MANAGE);

  const team = await loadTeam(session.scope.pharmacyId);
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
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Équipe"
        description={`Les accès à ${session.pharmacy.name} : le poste de chacun, le titulaire principal, l'ordre de l'équipe.`}
      />
      <TeamManager members={members} canManageOwners={session.role === "OWNER"} />
    </div>
  );
}
