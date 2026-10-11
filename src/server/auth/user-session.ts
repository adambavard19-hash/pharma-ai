import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db/client";
import { hashToken } from "@/server/security/tokens";
import { ROLE_LABELS, resolvePermissions, type Permission, type Role } from "@/server/rbac/permissions";
import { SESSION_COOKIE_NAME } from "@/config/constants";
import type { TenantScope } from "@/server/db/tenant";
import type { Profession } from "@/core/mobile/profile";

/**
 * La session de PharmaBoost Mobile : une PERSONNE, avec ou sans officine.
 *
 * Même cookie, même table `sessions`, même jeton que le comptoir — un seul système de comptes. La différence est
 * ce qu'on accepte : `getSession` (comptoir) refuse une session sans rattachement actif ; `getUserSession` la rend,
 * avec `activePharmacy = null` et `scope = null`. Un compte gratuit (organisation « Communauté PharmaBoost ») et un
 * collaborateur d'officine cliente se connectent donc au même endroit, avec le même mot de passe.
 *
 * Règle d'isolement, la même qu'au comptoir : toute lecture d'officine passe par `scope` (ou `requireClientScope`),
 * qui vient de la session et jamais d'un paramètre reçu. Un compte sans officine n'a pas de scope : il ne lit aucune
 * donnée d'officine.
 */

export type MobileMembership = {
  pharmacyId: string;
  pharmacyName: string;
  city: string | null;
  role: Role;
  roleLabel: string;
  isDemo: boolean;
};

export type UserSessionContext = {
  sessionId: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    fullName: string;
    initials: string;
    avatarUrl: string | null;
    profession: Profession | null;
    rppsDeclared: string | null;
    declaredPharmacyName: string | null;
    mobileOnboardedAt: Date | null;
  };
  organization: { id: string; name: string; kind: "CLIENT" | "COMMUNITY" };
  /** Rattachements actifs, à des officines actives. Vide pour un compte gratuit. */
  memberships: MobileMembership[];
  /** L'officine de la session (choisie par « Mon officine »), ou null sans rattachement. */
  activePharmacy: { id: string; name: string; city: string | null; isDemo: boolean; organizationId: string } | null;
  role: Role | null;
  roleLabel: string | null;
  permissions: ReadonlySet<Permission>;
  /** Membre de l'équipe d'une officine cliente : il a, en plus, les fonctions d'officine. */
  isClientStaff: boolean;
  /** Compte de la Communauté PharmaBoost (gratuit). Un collaborateur rattaché ne l'est plus. */
  isCommunity: boolean;
  /** Portée d'officine pour les services existants. Null : aucune donnée d'officine accessible. */
  scope: TenantScope | null;
};

/** Ce que la requête de session ramène de la base : la forme minimale dont la résolution a besoin. */
export type SessionRecord = {
  id: string;
  pharmacyId: string | null;
  revokedAt: Date | null;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    status: string;
    deletedAt: Date | null;
    profession: string | null;
    rppsDeclared: string | null;
    declaredPharmacyName: string | null;
    mobileOnboardedAt: Date | null;
    organization: { id: string; name: string; kind: "CLIENT" | "COMMUNITY" };
    memberships: {
      pharmacyId: string;
      role: string;
      grantedPermissions: string[];
      revokedPermissions: string[];
      pharmacy: { id: string; name: string; city: string | null; isDemo: boolean; isActive: boolean; organizationId: string };
    }[];
  };
};

/**
 * Le cœur, pur : d'un enregistrement de session à un contexte. Exporté pour les essais. Une session révoquée,
 * expirée, ou d'un compte inactif ou supprimé ne donne rien.
 */
export function resolveUserSession(record: SessionRecord | null, now: Date): UserSessionContext | null {
  if (!record || record.revokedAt || record.expiresAt < now) return null;
  const { user } = record;
  if (user.status !== "ACTIVE" || user.deletedAt) return null;

  const active = user.memberships.filter((m) => m.pharmacy.isActive);
  const current = active.find((m) => m.pharmacyId === record.pharmacyId) ?? active[0] ?? null;
  const role = current ? (current.role as Role) : null;

  return {
    sessionId: record.id,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      initials: `${user.firstName.at(0) ?? ""}${user.lastName.at(0) ?? ""}`.toUpperCase(),
      avatarUrl: user.avatarUrl,
      profession: (user.profession as Profession | null) ?? null,
      rppsDeclared: user.rppsDeclared,
      declaredPharmacyName: user.declaredPharmacyName,
      mobileOnboardedAt: user.mobileOnboardedAt,
    },
    organization: user.organization,
    memberships: active.map((m) => ({
      pharmacyId: m.pharmacyId,
      pharmacyName: m.pharmacy.name,
      city: m.pharmacy.city,
      role: m.role as Role,
      roleLabel: ROLE_LABELS[m.role as Role],
      isDemo: m.pharmacy.isDemo,
    })),
    activePharmacy: current
      ? { id: current.pharmacy.id, name: current.pharmacy.name, city: current.pharmacy.city, isDemo: current.pharmacy.isDemo, organizationId: current.pharmacy.organizationId }
      : null,
    role,
    roleLabel: role ? ROLE_LABELS[role] : null,
    permissions: current && role ? resolvePermissions(role, current.grantedPermissions, current.revokedPermissions) : new Set<Permission>(),
    isClientStaff: current !== null,
    isCommunity: current === null && user.organization.kind === "COMMUNITY",
    scope: current
      ? { pharmacyId: current.pharmacy.id, organizationId: current.pharmacy.organizationId, userId: user.id, isDemo: current.pharmacy.isDemo }
      : null,
  };
}

/** Mémoïsé pour la durée du rendu, comme `getSession`. */
export const getUserSession = cache(async (): Promise<UserSessionContext | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const record = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      pharmacyId: true,
      revokedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          status: true,
          deletedAt: true,
          profession: true,
          rppsDeclared: true,
          declaredPharmacyName: true,
          mobileOnboardedAt: true,
          organization: { select: { id: true, name: true, kind: true } },
          memberships: {
            where: { isActive: true },
            orderBy: { createdAt: "asc" },
            select: {
              pharmacyId: true,
              role: true,
              grantedPermissions: true,
              revokedPermissions: true,
              pharmacy: { select: { id: true, name: true, city: true, isDemo: true, isActive: true, organizationId: true } },
            },
          },
        },
      },
    },
  });
  return resolveUserSession(record, new Date());
});

/** Session obligatoire dans l'application mobile : sinon, l'écran de connexion de l'application. */
export async function requireUser(): Promise<UserSessionContext> {
  const session = await getUserSession();
  if (!session) redirect("/m/connexion");
  return session;
}

/**
 * Les fonctions d'officine : session ET rattachement actif. Rend la portée de l'officine ACTIVE de la session —
 * le seul `pharmacyId` qu'un écran mobile ait le droit de lire. Un compte gratuit est renvoyé à l'accueil.
 */
export async function requireClientScope(): Promise<{ session: UserSessionContext; scope: TenantScope }> {
  const session = await requireUser();
  if (!session.scope) redirect("/m");
  return { session, scope: session.scope };
}
