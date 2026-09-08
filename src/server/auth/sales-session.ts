import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db/client";
import { generateToken, hashToken } from "@/server/security/tokens";
import { SALES_SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "@/config/constants";

/**
 * Session d'un commercial (extranet).
 *
 * Troisième type de session, séparé des deux autres. Un commercial n'a ni
 * `TenantScope` (données d'officine) ni session plateforme (console). Il ne
 * voit que ses dossiers ; chaque service revérifie `salesRepId` côté serveur.
 */
export type SalesSession = {
  rep: { id: string; email: string; firstName: string; lastName: string; fullName: string; initials: string };
  sessionId: string;
};

export async function createSalesSession(params: { salesRepId: string; ipAddress?: string | null }): Promise<void> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await prisma.salesRepSession.create({ data: { tokenHash: hashToken(token), salesRepId: params.salesRepId, expiresAt, ipAddress: params.ipAddress ?? null } });
  const store = await cookies();
  store.set(SALES_SESSION_COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
  await prisma.salesRep.update({ where: { id: params.salesRepId }, data: { lastLoginAt: new Date() } });
}

export async function destroySalesSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SALES_SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.salesRepSession.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => undefined);
  }
  store.delete(SALES_SESSION_COOKIE_NAME);
}

export const getSalesSession = cache(async (): Promise<SalesSession | null> => {
  const store = await cookies();
  const token = store.get(SALES_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await prisma.salesRepSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { salesRep: true } });
  if (!session || session.revokedAt || session.expiresAt < new Date() || !session.salesRep.isActive) return null;
  const rep = session.salesRep;
  return {
    rep: { id: rep.id, email: rep.email, firstName: rep.firstName, lastName: rep.lastName, fullName: `${rep.firstName} ${rep.lastName}`, initials: `${rep.firstName[0] ?? ""}${rep.lastName[0] ?? ""}`.toUpperCase() },
    sessionId: session.id,
  };
});

export async function requireSalesSession(): Promise<SalesSession> {
  const session = await getSalesSession();
  if (!session) redirect("/extranet/connexion");
  return session;
}
