import "server-only";
import { prisma } from "@/server/db/client";
import { verifyPassword } from "@/server/security/password";
import { throttled } from "@/server/security/throttle";
import { pharmacyForTeamPassword } from "@/server/services/team-password";

/**
 * La vérification d'un couple e-mail / mot de passe, commune aux deux portes d'entrée : la connexion du comptoir
 * (`loginAction`, qui exige une officine active) et celle de PharmaBoost Mobile (`mobileLoginAction`, qui accepte
 * un compte gratuit sans officine). Une seule implémentation : un mot de passe accepté ici l'est partout, refusé
 * ici il l'est partout.
 *
 * Elle ne dit jamais POURQUOI un identifiant est refusé (compte inconnu, supprimé, mauvais mot de passe) : c'est
 * le même `INVALID`, et l'écran affiche le même message.
 */

export type AuthenticatedUser = {
  id: string;
  organizationId: string;
  mobileOnboardedAt: Date | null;
  /** Rattachements actifs à une officine active, du plus ancien au plus récent (connexion par le mot de passe de l'officine : celle-ci en premier). */
  activePharmacyIds: string[];
  /** Connexion faite avec le mot de passe de l'officine (et non le mot de passe personnel). */
  viaTeamPassword?: boolean;
};

export type CredentialCheck =
  | { kind: "OK"; user: AuthenticatedUser }
  /** Compte inconnu, supprimé, ou mot de passe faux. `userId` sert au journal d'audit seulement. */
  | { kind: "INVALID"; userId: string | null; userExists: boolean }
  /** Le bon mot de passe d'un compte suspendu ou désactivé. */
  | { kind: "INACTIVE"; userId: string };

export async function authenticateUser(email: string, password: string): Promise<CredentialCheck> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      organizationId: true,
      passwordHash: true,
      status: true,
      deletedAt: true,
      mobileOnboardedAt: true,
      memberships: {
        where: { isActive: true },
        select: { pharmacyId: true, role: true, pharmacy: { select: { isActive: true, teamPasswordHash: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const passwordValid = await verifyPassword(password, user?.passwordHash);
  // Sinon, le mot de passe de l'officine : l'adresse doit être celle d'un membre de l'équipe (ajouté par le titulaire), jamais
  // d'un titulaire. Les essais sont freinés par adresse, pour qu'on ne devine pas le mot de passe commun en boucle.
  const teamPharmacyId =
    !passwordValid && user && !user.deletedAt && !throttled(`team-password:${email}`, 8, 10 * 60_000)
      ? await pharmacyForTeamPassword(user.memberships, password)
      : null;
  if (!user || (!passwordValid && !teamPharmacyId) || user.deletedAt) return { kind: "INVALID", userId: user?.id ?? null, userExists: Boolean(user) };
  if (user.status !== "ACTIVE") return { kind: "INACTIVE", userId: user.id };
  const active = user.memberships.filter((m) => m.pharmacy.isActive).map((m) => m.pharmacyId);

  return {
    kind: "OK",
    user: {
      id: user.id,
      organizationId: user.organizationId,
      mobileOnboardedAt: user.mobileOnboardedAt,
      activePharmacyIds: teamPharmacyId ? [teamPharmacyId, ...active.filter((id) => id !== teamPharmacyId)] : active,
      viaTeamPassword: Boolean(teamPharmacyId),
    },
  };
}
