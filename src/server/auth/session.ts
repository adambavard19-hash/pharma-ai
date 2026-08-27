import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db/client";
import { generateToken, hashToken } from "@/server/security/tokens";
import {
  PERMISSIONS,
  ROLE_LABELS,
  resolvePermissions,
  type Permission,
  type Role,
} from "@/server/rbac/permissions";
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "@/config/constants";
import type { TenantScope } from "@/server/db/tenant";

export { getRequestMeta } from "@/server/http/request-meta";

export type SessionContext = {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    fullName: string;
    initials: string;
    avatarUrl: string | null;
    rppsNumber: string | null;
  };
  pharmacy: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    brandColor: string;
    city: string | null;
    isDemo: boolean;
  };
  organization: { id: string; name: string };
  role: Role;
  roleLabel: string;
  permissions: Set<Permission>;
  /** Officines du groupe accessibles à cet utilisateur (bascule d'officine). */
  availablePharmacies: { id: string; name: string; city: string | null }[];
  scope: TenantScope;
  sessionId: string;
};

export class AuthorizationError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Permission requise : ${permission}`);
    this.name = "AuthorizationError";
  }
}

/**
 * Crée une session serveur et pose le cookie correspondant.
 * Le jeton n'est stocké en base que sous forme d'empreinte SHA-256.
 */
export async function createSession(params: {
  userId: string;
  pharmacyId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<string> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: params.userId,
      pharmacyId: params.pharmacyId,
      expiresAt,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  await prisma.user.update({
    where: { id: params.userId },
    data: { lastLoginAt: new Date() },
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.session
      .updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Résout la session courante. Mémoïsé pour la durée du rendu : plusieurs
 * composants serveur peuvent l'appeler sans multiplier les requêtes SQL.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          organization: { select: { id: true, name: true } },
          memberships: {
            where: { isActive: true },
            include: {
              pharmacy: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  logoUrl: true,
                  brandColor: true,
                  city: true,
                  isDemo: true,
                  organizationId: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE" || session.user.deletedAt) return null;

  const memberships = session.user.memberships.filter((m) => m.pharmacy.isActive);
  const active =
    memberships.find((m) => m.pharmacyId === session.pharmacyId) ?? memberships[0];
  if (!active) return null;

  const role = active.role as Role;
  const { user } = session;
  const fullName = `${user.firstName} ${user.lastName}`.trim();

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName,
      initials: `${user.firstName.at(0) ?? ""}${user.lastName.at(0) ?? ""}`.toUpperCase(),
      avatarUrl: user.avatarUrl,
      rppsNumber: user.rppsNumber,
    },
    pharmacy: {
      id: active.pharmacy.id,
      name: active.pharmacy.name,
      slug: active.pharmacy.slug,
      logoUrl: active.pharmacy.logoUrl,
      brandColor: active.pharmacy.brandColor,
      city: active.pharmacy.city,
      isDemo: active.pharmacy.isDemo,
    },
    organization: user.organization,
    role,
    roleLabel: ROLE_LABELS[role],
    permissions: resolvePermissions(
      role,
      active.grantedPermissions,
      active.revokedPermissions,
    ),
    availablePharmacies: memberships.map((m) => ({
      id: m.pharmacy.id,
      name: m.pharmacy.name,
      city: m.pharmacy.city,
    })),
    scope: {
      pharmacyId: active.pharmacy.id,
      organizationId: active.pharmacy.organizationId,
      userId: user.id,
    },
    sessionId: session.id,
  };
});

/** Session obligatoire : redirige vers la connexion si absente. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Session + permission obligatoires. */
export async function requirePermission(
  permission: Permission,
): Promise<SessionContext> {
  const session = await requireSession();
  if (!session.permissions.has(permission)) throw new AuthorizationError(permission);
  return session;
}

export function can(session: SessionContext, permission: Permission): boolean {
  return session.permissions.has(permission);
}

/** Bascule l'officine active de la session (groupes multi-officines). */
export async function switchPharmacy(pharmacyId: string): Promise<void> {
  const session = await requireSession();
  const allowed = session.availablePharmacies.some((p) => p.id === pharmacyId);
  if (!allowed) throw new AuthorizationError(PERMISSIONS.PHARMACY_VIEW);

  await prisma.session.update({
    where: { id: session.sessionId },
    data: { pharmacyId, lastSeenAt: new Date() },
  });
}

