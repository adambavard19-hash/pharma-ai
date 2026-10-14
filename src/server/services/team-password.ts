import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { decryptField, encryptField } from "@/server/security/encryption";
import { hashPassword, verifyPassword } from "@/server/security/password";
import { canUseTeamPassword, generateTeamPassword, looksLikeTeamPassword, normalizeTeamPassword } from "@/core/team/team-password";
import type { TenantScope } from "@/server/db/tenant";

/**
 * Le mot de passe de l'officine, côté serveur : créé avec l'officine (ou à la première ouverture de Mon équipe pour une officine
 * plus ancienne), relu par le titulaire, changé par lui quand quelqu'un part, et vérifié à la connexion de l'équipe.
 */

function randomByte(): () => number {
  let pool = randomBytes(64);
  let index = 0;
  return () => {
    if (index >= pool.length) {
      pool = randomBytes(64);
      index = 0;
    }
    return pool[index++];
  };
}

/** Les colonnes d'un nouveau mot de passe d'officine, à écrire à la création de l'officine ou à son renouvellement. */
export async function newTeamPasswordData(): Promise<{ password: string; data: { teamPasswordEncrypted: string | null; teamPasswordHash: string; teamPasswordUpdatedAt: Date } }> {
  const password = generateTeamPassword(randomByte());
  return { password, data: { teamPasswordEncrypted: encryptField(password), teamPasswordHash: await hashPassword(normalizeTeamPassword(password)), teamPasswordUpdatedAt: new Date() } };
}

/** Le mot de passe de CETTE officine, créé s'il n'existe pas encore (officine d'avant). */
export async function ensureTeamPassword(pharmacyId: string): Promise<{ password: string; updatedAt: Date }> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { teamPasswordEncrypted: true, teamPasswordUpdatedAt: true } });
  const known = pharmacy?.teamPasswordEncrypted ? decryptField(pharmacy.teamPasswordEncrypted) : null;
  if (known && pharmacy?.teamPasswordUpdatedAt) return { password: known, updatedAt: pharmacy.teamPasswordUpdatedAt };
  const fresh = await newTeamPasswordData();
  // Deux onglets ouverts en même temps : seul le premier écrit, le second relit ce qui a été écrit.
  const written = await prisma.pharmacy.updateMany({ where: { id: pharmacyId, teamPasswordHash: null }, data: fresh.data });
  if (written.count === 0) {
    const again = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { teamPasswordEncrypted: true, teamPasswordUpdatedAt: true } });
    const reread = again?.teamPasswordEncrypted ? decryptField(again.teamPasswordEncrypted) : null;
    if (reread && again?.teamPasswordUpdatedAt) return { password: reread, updatedAt: again.teamPasswordUpdatedAt };
    await prisma.pharmacy.update({ where: { id: pharmacyId }, data: fresh.data });
  }
  return { password: fresh.password, updatedAt: fresh.data.teamPasswordUpdatedAt };
}

/** Un nouveau mot de passe pour l'officine de la session : l'ancien cesse aussitôt de marcher, et les sessions ouvertes avec lui sont fermées. */
export async function regenerateTeamPassword(scope: TenantScope): Promise<{ password: string }> {
  const fresh = await newTeamPasswordData();
  await prisma.pharmacy.update({ where: { id: scope.pharmacyId }, data: fresh.data });
  // Les membres de l'équipe connectés avec l'ancien mot de passe doivent retaper le nouveau (les titulaires, eux, restent connectés).
  const team = await prisma.membership.findMany({ where: { pharmacyId: scope.pharmacyId, role: { not: "OWNER" } }, select: { userId: true } });
  if (team.length > 0) {
    await prisma.session.updateMany({ where: { pharmacyId: scope.pharmacyId, userId: { in: team.map((member) => member.userId) }, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await recordAudit({ action: "team.password_regenerated", entityType: "Pharmacy", entityId: scope.pharmacyId, pharmacyId: scope.pharmacyId, userId: scope.userId });
  return { password: fresh.password };
}

/**
 * La connexion avec le mot de passe de l'officine : parmi les officines actives où ce compte travaille (hors poste de titulaire),
 * celle dont le mot de passe correspond. `null` sinon.
 */
export async function pharmacyForTeamPassword(memberships: { pharmacyId: string; role: string; pharmacy: { isActive: boolean; teamPasswordHash: string | null } }[], password: string): Promise<string | null> {
  if (!looksLikeTeamPassword(password)) return null;
  const normalized = normalizeTeamPassword(password);
  for (const membership of memberships) {
    if (!membership.pharmacy.isActive || !canUseTeamPassword(membership.role) || !membership.pharmacy.teamPasswordHash) continue;
    if (await verifyPassword(normalized, membership.pharmacy.teamPasswordHash)) return membership.pharmacyId;
  }
  return null;
}
