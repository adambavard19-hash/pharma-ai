import "server-only";
import { prisma } from "@/server/db/client";
import { verifyPassword } from "@/server/security/password";

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
  /** Rattachements actifs à une officine active, du plus ancien au plus récent. */
  activePharmacyIds: string[];
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
        select: { pharmacyId: true, pharmacy: { select: { isActive: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const passwordValid = await verifyPassword(password, user?.passwordHash);
  if (!user || !passwordValid || user.deletedAt) return { kind: "INVALID", userId: user?.id ?? null, userExists: Boolean(user) };
  if (user.status !== "ACTIVE") return { kind: "INACTIVE", userId: user.id };

  return {
    kind: "OK",
    user: {
      id: user.id,
      organizationId: user.organizationId,
      mobileOnboardedAt: user.mobileOnboardedAt,
      activePharmacyIds: user.memberships.filter((m) => m.pharmacy.isActive).map((m) => m.pharmacyId),
    },
  };
}
