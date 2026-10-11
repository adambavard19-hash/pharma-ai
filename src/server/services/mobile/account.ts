import "server-only";
import { prisma } from "@/server/db/client";
import { hashPassword, validatePasswordStrength } from "@/server/security/password";
import { CONSENT_KINDS, normalizeRpps, type ConsentKind, type Profession } from "@/core/mobile/profile";
import { ensureCommunityOrganization } from "./community";
import { recordConsent } from "./consents";

/**
 * Les comptes de PharmaBoost Mobile : création d'un compte gratuit, profil, parcours « Bienvenue ».
 *
 * Un compte gratuit appartient à la Communauté PharmaBoost et n'a aucun rattachement : il n'ouvre ni le comptoir ni
 * aucune donnée d'officine. Rejoindre plus tard une officine cliente (invitation du titulaire) le déplace vers
 * l'organisation de cette officine (src/server/services/team-access.ts).
 */

export type CommunitySignup = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  profession: Profession;
  rpps: string | null;
  pharmacyName: string | null;
  consents: Record<ConsentKind, boolean>;
};

export type SignupResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; field?: "email" | "password" | "rpps" };

export async function createCommunityAccount(input: CommunitySignup, now = new Date()): Promise<SignupResult> {
  const weaknesses = validatePasswordStrength(input.password);
  if (weaknesses.length > 0) return { ok: false, field: "password", error: `Mot de passe trop faible : ${weaknesses.join(", ")}.` };
  const rpps = normalizeRpps(input.rpps);
  if (!rpps.ok) return { ok: false, field: "rpps", error: rpps.error };

  const existing = await prisma.user.findFirst({ where: { email: { equals: input.email, mode: "insensitive" } }, select: { id: true } });
  if (existing) return duplicate();

  const organizationId = await ensureCommunityOrganization();
  const passwordHash = await hashPassword(input.password);
  try {
    const userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash,
          status: "ACTIVE",
          profession: input.profession,
          rppsDeclared: rpps.value,
          declaredPharmacyName: input.pharmacyName,
        },
        select: { id: true },
      });
      // Les deux décisions sont consignées, « oui » comme « non » : la preuve qu'aucune case n'était cochée d'avance.
      for (const kind of CONSENT_KINDS) await recordConsent({ userId: user.id, kind, granted: input.consents[kind], source: "MOBILE_SIGNUP", force: true }, tx, now);
      return user.id;
    });
    return { ok: true, userId };
  } catch (error) {
    // Deux inscriptions simultanées à la même adresse : l'index unique tranche, la seconde reçoit le même refus.
    if (typeof error === "object" && error && "code" in error && (error as { code: string }).code === "P2002") return duplicate();
    throw error;
  }
}

/**
 * Une adresse déjà connue. On le dit — une inscription ne peut pas aboutir en silence — mais sans rien dire d'autre
 * (officine, nom), et derrière le frein des tentatives qui empêche de sonder des listes d'adresses.
 */
function duplicate(): SignupResult {
  return { ok: false, field: "email", error: "Un compte existe déjà avec cette adresse. Connectez-vous, ou utilisez « Mot de passe oublié »." };
}

export type ProfileChanges = {
  firstName: string;
  lastName: string;
  profession: Profession | null;
  rpps: string | null;
  pharmacyName: string | null;
};

export async function updateMobileProfile(userId: string, changes: ProfileChanges, options: { markOnboarded?: boolean } = {}, now = new Date()): Promise<{ ok: true } | { ok: false; error: string; field?: string }> {
  const rpps = normalizeRpps(changes.rpps);
  if (!rpps.ok) return { ok: false, field: "rpps", error: rpps.error };
  await prisma.user.update({
    where: { id: userId },
    data: {
      firstName: changes.firstName,
      lastName: changes.lastName,
      profession: changes.profession,
      rppsDeclared: rpps.value,
      declaredPharmacyName: changes.pharmacyName,
      ...(options.markOnboarded ? { mobileOnboardedAt: now } : {}),
    },
  });
  return { ok: true };
}
