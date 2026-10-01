"use server";

import { sendInstallationGuide } from "@/server/services/platform-onboarding";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { hashPassword, validatePasswordStrength } from "@/server/security/password";
import { recordAudit } from "@/server/audit/log";
import { sendUserPasswordLink } from "@/server/services/user-password";
import { generateToken } from "@/server/security/tokens";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";
import { resolveReferralCode } from "@/server/services/referral";
import { createClientPharmacy, findSiretOwner, setPostCount } from "@/server/services/pharmacy-admin";
import { isValidSiret, normalizeSiret } from "@/core/contracts/identity";

/**
 * Administration des officines clientes, réservée à l'éditeur.
 *
 * ⚠️ RÈGLE STRUCTURELLE : ces actions créent et configurent des officines, mais
 * ne lisent JAMAIS de données patient. Un administrateur plateforme n'obtient
 * pas de `TenantScope` (cf. platform-session.ts) : il n'a donc aucun chemin
 * d'accès aux ordonnances, patients ou ventes d'une officine, même par erreur
 * de programmation.
 */


const pharmacySchema = z.object({
  name: z.string().trim().min(2, "Le nom de l'officine est obligatoire").max(120),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").or(z.literal("")),
  phone: z.string().trim().max(30).optional(),
  addressLine1: z.string().trim().max(160).optional(),
  postalCode: z.string().trim().max(10).optional(),
  city: z.string().trim().max(80).optional(),
  /** Facultatif : ne bloque jamais la création. */
  finessNumber: z.string().trim().max(20).optional(),
  siret: z.string().trim().max(20).optional(),
  /** Nombre de postes de comptoir : base du futur calcul de l'abonnement. */
  postCount: z.coerce.number({ message: "Indiquez le nombre de postes." }).int("Un nombre entier.").min(1, "Au moins un poste.").max(99, "99 postes au plus."),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (format #0F766E)")
    .optional()
    .or(z.literal("")),
});

const createSchema = pharmacySchema.extend({
  ownerFirstName: z.string().trim().min(1, "Le prénom du titulaire est obligatoire").max(80),
  ownerLastName: z.string().trim().min(1, "Le nom du titulaire est obligatoire").max(80),
  ownerEmail: z.string().trim().toLowerCase().email("Adresse e-mail du titulaire invalide"),
  /** Facultatif : sans mot de passe fourni, le titulaire définit le sien par le lien reçu. */
  ownerPassword: z.string().optional().or(z.literal("")),
  /** Le logiciel de gestion de l'officine : il guide l'export du stock dès l'e-mail d'accueil. */
  lgo: z.string().trim().max(30).optional().or(z.literal("")),
  /** Le code de l'officine qui a recommandé celle-ci, s'il y en a une. */
  referralCode: z.string().trim().max(20).optional().or(z.literal("")),
});

/**
 * Signer une nouvelle officine : l'environnement complet en une opération.
 *
 * Organisation, officine et compte titulaire sont créés dans UNE transaction.
 * Une officine sans titulaire serait un client incapable de se connecter, et
 * un titulaire sans officine un compte orphelin : les trois vont ensemble ou
 * aucun n'est créé.
 */
export async function createClientPharmacyAction(
  payload: z.input<typeof createSchema>,
): Promise<ActionResult<{ pharmacyId: string }>> {
  const session = await requirePlatformSession();
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }
  const input = parsed.data;
  if (input.ownerPassword) {
    const weaknesses = validatePasswordStrength(input.ownerPassword);
    if (weaknesses.length > 0) {
      return fail(`Mot de passe trop faible : ${weaknesses.join(", ")}.`, { ownerPassword: `Mot de passe trop faible : ${weaknesses.join(", ")}.` });
    }
  }
  const referrer = await resolveReferralCode(input.referralCode);
  if (input.referralCode && !referrer) return fail("Ce code de parrainage ne correspond à aucune officine.", { referralCode: "Code inconnu." });

  const result = await createClientPharmacy(
    { ...input, referredById: referrer?.id ?? null },
    { type: "ADMIN", id: session.admin.id, label: session.admin.fullName },
  );
  if (!result.ok) return fail(result.error, result.fieldErrors);

  revalidatePath("/admin/pharmacies");
  return ok(
    { pharmacyId: result.pharmacyId },
    result.welcome.status === "SENT"
      ? `${input.name} est prête. E-mail de bienvenue envoyé à ${input.ownerEmail}.`
      : `${input.name} est créée, mais l'e-mail de bienvenue n'est pas parti (${result.welcome.detail}). Renvoyez-le depuis la fiche.`,
  );
}

const updateSchema = pharmacySchema.extend({ pharmacyId: z.string().min(1) });

export async function updateClientPharmacyAction(
  payload: z.input<typeof updateSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const input = parsed.data;
  const exists = await prisma.pharmacy.findUnique({
    where: { id: input.pharmacyId },
    select: { id: true, name: true, siret: true, finessNumber: true, email: true },
  });
  if (!exists) return fail("Officine introuvable.");
  const actor = { type: "ADMIN" as const, id: session.admin.id, label: session.admin.fullName };
  let siret: string | null = null;
  if (input.siret?.trim()) {
    if (!isValidSiret(input.siret)) return fail("SIRET invalide : 14 chiffres attendus.", { siret: "SIRET invalide." });
    siret = normalizeSiret(input.siret);
    const taken = siret ? await findSiretOwner(siret, input.pharmacyId) : null;
    if (taken) return fail(taken, { siret: "SIRET déjà présent." });
  }

  await prisma.pharmacy.update({
    where: { id: input.pharmacyId },
    data: {
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      addressLine1: input.addressLine1 || null,
      postalCode: input.postalCode || null,
      city: input.city || null,
      finessNumber: input.finessNumber?.replace(/\s/g, "") || null,
      siret,
      ...(input.brandColor ? { brandColor: input.brandColor } : {}),
    },
  });
  await setPostCount(input.pharmacyId, input.postCount, actor);

  // Ce qui a changé, valeur par valeur : l'historique de la fiche le montre.
  const changes: Record<string, { from: string | null; to: string | null }> = {};
  const track = (key: string, from: string | null, to: string | null) => { if ((from ?? "") !== (to ?? "")) changes[key] = { from, to }; };
  track("name", exists.name, input.name);
  track("siret", exists.siret, siret);
  track("finessNumber", exists.finessNumber, input.finessNumber?.replace(/\s/g, "") || null);
  track("email", exists.email, input.email || null);
  await recordAudit({
    action: "platform.pharmacy_updated",
    entityType: "Pharmacy",
    entityId: input.pharmacyId,
    pharmacyId: input.pharmacyId,
    platformAdminId: session.admin.id,
    metadata: { changes },
  });

  revalidatePath("/admin/pharmacies");
  revalidatePath(`/admin/pharmacies/${input.pharmacyId}`);
  return ok(null, "Officine mise à jour.");
}

const statusSchema = z.object({ pharmacyId: z.string().min(1), isActive: z.boolean() });

/**
 * Suspendre une officine cliente.
 *
 * La suspension révoque les sessions en cours : sans cela, un impayé n'aurait
 * aucun effet avant l'expiration des cookies. Aucune donnée n'est supprimée —
 * une officine réactivée retrouve son dossier intact.
 */
export async function setClientPharmacyStatusAction(
  payload: z.input<typeof statusSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = statusSchema.safeParse(payload);
  if (!parsed.success) return fail("Requête invalide.");

  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: parsed.data.pharmacyId },
    select: { id: true, name: true },
  });
  if (!pharmacy) return fail("Officine introuvable.");

  await prisma.$transaction(async (tx) => {
    await tx.pharmacy.update({
      where: { id: pharmacy.id },
      data: { isActive: parsed.data.isActive },
    });
    if (!parsed.data.isActive) {
      await tx.session.updateMany({
        where: { pharmacyId: pharmacy.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  });

  await recordAudit({
    action: "platform.pharmacy_status_changed",
    entityType: "Pharmacy",
    entityId: pharmacy.id,
    platformAdminId: session.admin.id,
    metadata: { isActive: parsed.data.isActive },
  });

  revalidatePath("/admin/pharmacies");
  revalidatePath(`/admin/pharmacies/${pharmacy.id}`);
  return ok(
    null,
    parsed.data.isActive ? `${pharmacy.name} réactivée.` : `${pharmacy.name} suspendue.`,
  );
}

const ownerSchema = z.object({
  pharmacyId: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  /** Facultatif : sans mot de passe, le titulaire choisit le sien par le lien de bienvenue. */
  password: z.string().optional().or(z.literal("")),
});

/** Ajoute un titulaire à une officine existante (reprise, cession, oubli). */
export async function createPharmacyOwnerAction(
  payload: z.input<typeof ownerSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = ownerSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const input = parsed.data;
  if (input.password) {
    const weaknesses = validatePasswordStrength(input.password);
    if (weaknesses.length > 0) return fail(`Mot de passe trop faible : ${weaknesses.join(", ")}.`);
  }

  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: input.pharmacyId },
    select: { id: true, organizationId: true, name: true },
  });
  if (!pharmacy) return fail("Officine introuvable.");

  const existing = await prisma.user.findFirst({
    where: { email: { equals: input.email, mode: "insensitive" } },
    select: { id: true, deletedAt: true },
  });
  if (existing) return fail(existing.deletedAt ? "Cette adresse appartient à un compte supprimé : utilisez une autre adresse." : "Un compte existe déjà avec cette adresse e-mail.");

  // Sans mot de passe saisi, un secret que personne ne connaît : le titulaire choisit le sien par le lien de bienvenue.
  const passwordHash = await hashPassword(input.password || generateToken(24));

  const ownerId = await prisma.$transaction(async (tx) => {
    const owner = await tx.user.create({
      data: {
        organizationId: pharmacy.organizationId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash,
        status: "ACTIVE",
      },
    });
    await tx.membership.create({
      data: { userId: owner.id, pharmacyId: pharmacy.id, role: "OWNER", isActive: true },
    });
    return owner.id;
  });

  await recordAudit({
    action: "platform.owner_created",
    entityType: "Pharmacy",
    entityId: pharmacy.id,
    platformAdminId: session.admin.id,
    metadata: { ownerEmail: input.email },
  });

  const welcome = await sendUserPasswordLink(ownerId, "welcome").catch((error: unknown) => ({
    status: "FAILED",
    detail: error instanceof Error ? error.message : "envoi impossible",
    url: "",
  }));

  revalidatePath(`/admin/pharmacies/${pharmacy.id}`);
  return ok(
    null,
    welcome.status === "SENT"
      ? `${input.firstName} ${input.lastName} est titulaire de ${pharmacy.name}. E-mail d'accueil envoyé à ${input.email}.`
      : `${input.firstName} ${input.lastName} est titulaire de ${pharmacy.name}, mais l'e-mail d'accueil n'est pas parti (${welcome.detail}).`,
  );
}

/** Renvoyer le guide d'installation au titulaire, depuis la console. */
export async function sendInstallationGuideAction(payload: { pharmacyId: string }): Promise<ActionResult<{ sentTo: string | null }>> {
  const session = await requirePlatformSession();
  const outcome = await sendInstallationGuide(payload.pharmacyId, { adminId: session.admin.id, reason: "ADMIN" });
  if (outcome.status === "FAILED") return fail(`Guide non envoyé : ${outcome.detail}`);
  revalidatePath(`/admin/pharmacies/${payload.pharmacyId}`);
  return ok({ sentTo: outcome.sentTo }, outcome.status === "SENT" ? `Guide d'installation envoyé à ${outcome.sentTo}.` : `Envoi simulé : ${outcome.detail}`);
}

async function loadMember(pharmacyId: string, membershipId: string) {
  const membership = await prisma.membership.findFirst({ where: { id: membershipId, pharmacyId }, include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } });
  if (!membership) throw new Error("Compte introuvable dans cette officine.");
  return membership;
}

/** Renvoyer au collaborateur un lien pour (re)définir son mot de passe. */
export async function resendPharmacyMemberAccessAction(payload: { pharmacyId: string; membershipId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  try {
    const membership = await loadMember(payload.pharmacyId, payload.membershipId);
    const outcome = await sendUserPasswordLink(membership.user.id, "reset");
    await recordAudit({ action: "platform.member_access_resent", entityType: "User", entityId: membership.user.id, pharmacyId: payload.pharmacyId, platformAdminId: session.admin.id, metadata: { status: outcome.status } });
    return outcome.status === "SENT" ? ok(null, `Lien envoyé à ${membership.user.email}.`) : fail(`Lien non envoyé : ${outcome.detail}`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Envoi impossible.");
  }
}

/** Suspendre ou réactiver l'accès d'un compte d'officine ; une suspension ferme ses sessions. */
export async function setPharmacyMemberAccessAction(payload: { pharmacyId: string; membershipId: string; isActive: boolean }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  try {
    const membership = await loadMember(payload.pharmacyId, payload.membershipId);
    await prisma.membership.update({ where: { id: membership.id }, data: { isActive: payload.isActive } });
    if (!payload.isActive) await prisma.session.deleteMany({ where: { userId: membership.user.id, pharmacyId: payload.pharmacyId } });
    await recordAudit({ action: "platform.member_access_changed", entityType: "User", entityId: membership.user.id, pharmacyId: payload.pharmacyId, platformAdminId: session.admin.id, metadata: { isActive: payload.isActive } });
    revalidatePath(`/admin/pharmacies/${payload.pharmacyId}`);
    return ok(null, payload.isActive ? "Accès réactivé." : "Accès suspendu : ses sessions sont fermées.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Modification impossible.");
  }
}

/** Supprimer un compte d'officine : l'accès est retiré, le compte marqué supprimé ; les traces restent. */
export async function deletePharmacyMemberAction(payload: { pharmacyId: string; membershipId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  try {
    const membership = await loadMember(payload.pharmacyId, payload.membershipId);
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId: membership.user.id } }),
      prisma.membership.update({ where: { id: membership.id }, data: { isActive: false } }),
      prisma.user.update({ where: { id: membership.user.id }, data: { deletedAt: new Date(), status: "DISABLED" } }),
    ]);
    await recordAudit({ action: "platform.member_deleted", entityType: "User", entityId: membership.user.id, pharmacyId: payload.pharmacyId, platformAdminId: session.admin.id });
    revalidatePath(`/admin/pharmacies/${payload.pharmacyId}`);
    return ok(null, `Compte de ${membership.user.firstName} ${membership.user.lastName} supprimé.`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Suppression impossible.");
  }
}

