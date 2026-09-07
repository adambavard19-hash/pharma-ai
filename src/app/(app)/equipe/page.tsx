import type { Metadata } from "next";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/ui/page";
import { TeamManager, type TeamMember } from "./team-manager";

export const metadata: Metadata = { title: "Équipe" };

/**
 * L'équipe — écran de titulaire.
 *
 * La requête est bornée à `pharmacyId` : un titulaire de groupe qui bascule
 * d'officine voit l'équipe de l'officine active, jamais l'union des deux.
 */
export default async function TeamPage() {
  const session = await requirePermission(PERMISSIONS.TEAM_MANAGE);

  const memberships = await prisma.membership.findMany({
    where: { pharmacyId: session.scope.pharmacyId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          lastLoginAt: true,
          deletedAt: true,
        },
      },
    },
  });

  const members: TeamMember[] = memberships
    .filter((membership) => !membership.user.deletedAt)
    .map((membership) => ({
      userId: membership.user.id,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      email: membership.user.email,
      role: membership.role,
      isActive: membership.isActive,
      lastLoginAt: membership.user.lastLoginAt?.toISOString() ?? null,
      isSelf: membership.user.id === session.scope.userId,
    }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Équipe"
        description={`Les accès à ${session.pharmacy.name}.`}
      />
      <TeamManager members={members} />
    </div>
  );
}
