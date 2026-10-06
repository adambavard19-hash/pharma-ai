import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db/client";
import { generateToken, hashToken } from "@/server/security/tokens";
import { DIRECTOR_SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "@/config/constants";

/**
 * Session du directeur commercial.
 *
 * Quatrième type de session, séparé des trois autres (officine, console,
 * commercial). Un directeur n'a ni `TenantScope` (données d'officine) ni
 * session plateforme (console) : il voit l'équipe commerciale, jamais une
 * officine ni un patient. Chaque service du directeur revérifie la session côté
 * serveur ; le menu masqué ne protège rien.
 */
export type DirectorSession = {
  director: { id: string; email: string; firstName: string; lastName: string; fullName: string; initials: string };
  sessionId: string;
};

export async function createDirectorSession(params: { salesDirectorId: string; ipAddress?: string | null }): Promise<void> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await prisma.salesDirectorSession.create({ data: { tokenHash: hashToken(token), salesDirectorId: params.salesDirectorId, expiresAt, ipAddress: params.ipAddress ?? null } });
  const store = await cookies();
  store.set(DIRECTOR_SESSION_COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
  await prisma.salesDirector.update({ where: { id: params.salesDirectorId }, data: { lastLoginAt: new Date() } });
}

export async function destroyDirectorSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(DIRECTOR_SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.salesDirectorSession.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => undefined);
  }
  store.delete(DIRECTOR_SESSION_COOKIE_NAME);
}

export const getDirectorSession = cache(async (): Promise<DirectorSession | null> => {
  const store = await cookies();
  const token = store.get(DIRECTOR_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await prisma.salesDirectorSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { salesDirector: true } });
  if (!session || session.revokedAt || session.expiresAt < new Date() || !session.salesDirector.isActive) return null;
  const director = session.salesDirector;
  return {
    director: {
      id: director.id,
      email: director.email,
      firstName: director.firstName,
      lastName: director.lastName,
      fullName: `${director.firstName} ${director.lastName}`,
      initials: `${director.firstName[0] ?? ""}${director.lastName[0] ?? ""}`.toUpperCase(),
    },
    sessionId: session.id,
  };
});

/** À mettre en PREMIÈRE ligne de chaque action et de chaque page du directeur. */
export async function requireDirectorSession(): Promise<DirectorSession> {
  const session = await getDirectorSession();
  if (!session) redirect("/directeur/connexion");
  return session;
}
