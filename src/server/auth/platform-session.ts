import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db/client";
import { generateToken, hashToken } from "@/server/security/tokens";
import {
  PLATFORM_SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
} from "@/config/constants";

/**
 * Session administrateur plateforme (éditeur de Pharma.ai).
 *
 * Volontairement SÉPARÉE de la session officine : un administrateur plateforme
 * n'obtient jamais de `TenantScope` et ne peut donc pas emprunter les chemins
 * d'accès aux données patients. Cette séparation est structurelle, pas
 * déclarative — c'est le point 31 du cahier des charges.
 */

export type PlatformSession = {
  admin: { id: string; email: string; fullName: string; initials: string };
  sessionId: string;
};

export async function createPlatformSession(params: {
  adminId: string;
  ipAddress?: string | null;
}): Promise<void> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.platformAdminSession.create({
    data: {
      tokenHash: hashToken(token),
      adminId: params.adminId,
      expiresAt,
      ipAddress: params.ipAddress ?? null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(PLATFORM_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  await prisma.platformAdmin.update({
    where: { id: params.adminId },
    data: { lastLoginAt: new Date() },
  });
}

export async function destroyPlatformSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PLATFORM_SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.platformAdminSession
      .updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  cookieStore.delete(PLATFORM_SESSION_COOKIE_NAME);
}

export const getPlatformSession = cache(async (): Promise<PlatformSession | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(PLATFORM_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.platformAdminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { admin: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.admin.isActive) return null;

  return {
    admin: {
      id: session.admin.id,
      email: session.admin.email,
      fullName: `${session.admin.firstName} ${session.admin.lastName}`,
      initials: `${session.admin.firstName.at(0) ?? ""}${session.admin.lastName.at(0) ?? ""}`.toUpperCase(),
    },
    sessionId: session.id,
  };
});

export async function requirePlatformSession(): Promise<PlatformSession> {
  const session = await getPlatformSession();
  if (!session) redirect("/admin-connexion");
  return session;
}
