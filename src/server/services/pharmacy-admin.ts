import "server-only";
import { prisma } from "@/server/db/client";
import { hashPassword } from "@/server/security/password";
import { generateToken } from "@/server/security/tokens";
import { recordAudit } from "@/server/audit/log";
import { uniqueSlug } from "@/server/services/slugs";
import { isLgoId } from "@/server/services/stock-sync";
import { sendUserPasswordLink } from "@/server/services/user-password";
import { lastDispatchFor } from "@/server/services/email-dispatch";
import { ensureDossierForPharmacy } from "@/server/services/sales/pharmacy-dossier";
import { recordProspectEvent, type SalesActor } from "@/server/services/sales/events";
import { normalizeEmail, normalizeSiret, isValidSiret } from "@/core/contracts/identity";
import type { MessagingProvider } from "@/core/ai/ports";

/**
 * La fiche d'une officine cliente, côté console. Trois adresses e-mail
 * distinctes, jamais confondues :
 *  - l'e-mail de CONTACT de l'officine (Pharmacy.email), simple coordonnée ;
 *  - l'e-mail de CONNEXION du titulaire (User.email), son identifiant ;
 *  - l'e-mail du REPRÉSENTANT au dossier (Prospect.email), où part le contrat.
 * Chaque changement sensible est tracé : ancienne valeur, nouvelle, auteur, date.
 */

type AdminActor = SalesActor & { type: "ADMIN" };
const RESEND_COOLDOWN_MS = 60 * 1000;
const LOCKING_CONTRACT = ["SENT", "OPENED", "SIGNED_PHARMACY", "SIGNED_COMPANY", "FINALIZED"];

export type CreateClientPharmacyInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
  finessNumber?: string | null;
  siret?: string | null;
  brandColor?: string | null;
  postCount: number;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPassword?: string | null;
  lgo?: string | null;
  referredById?: string | null;
};

/** Une officine déjà connue sous ce SIRET (cliente, ou dossier ouvert) : pour refuser un doublon silencieux. */
export async function findSiretOwner(siret: string, exceptPharmacyId?: string): Promise<string | null> {
  const [pharmacy, prospect] = await Promise.all([
    prisma.pharmacy.findFirst({ where: { siret, isDemo: false, ...(exceptPharmacyId ? { id: { not: exceptPharmacyId } } : {}) }, select: { name: true } }),
    prisma.prospect.findFirst({ where: { siret, pharmacyId: null, status: { not: "LOST" } }, select: { name: true } }),
  ]);
  if (pharmacy) return `Une officine cliente existe déjà avec ce SIRET : « ${pharmacy.name} ».`;
  if (prospect) return `Un dossier en cours porte déjà ce SIRET : « ${prospect.name} ». Complétez ce dossier plutôt que d'en créer un second.`;
  return null;
}

/**
 * Créer directement une officine dont on connaît tout. Organisation, officine,
 * titulaire et dossier vont ensemble ; l'e-mail de bienvenue part ensuite, et
 * son issue est conservée (la fiche l'affiche, et permet de le renvoyer).
 */
export async function createClientPharmacy(input: CreateClientPharmacyInput, actor: AdminActor, deps?: { messaging?: MessagingProvider }): Promise<
  { ok: true; pharmacyId: string; prospectId: string; welcome: { status: string; detail: string } } | { ok: false; error: string; fieldErrors?: Record<string, string> }
> {
  const ownerEmail = normalizeEmail(input.ownerEmail);
  if (!ownerEmail) return { ok: false, error: "Adresse e-mail du titulaire invalide.", fieldErrors: { ownerEmail: "Adresse e-mail invalide." } };
  if (!Number.isInteger(input.postCount) || input.postCount < 1 || input.postCount > 99) return { ok: false, error: "Nombre de postes invalide.", fieldErrors: { postCount: "Entre 1 et 99." } };

  let siret: string | null = null;
  if (input.siret?.trim()) {
    if (!isValidSiret(input.siret)) return { ok: false, error: "SIRET invalide : 14 chiffres attendus.", fieldErrors: { siret: "SIRET invalide." } };
    siret = normalizeSiret(input.siret);
    const taken = siret ? await findSiretOwner(siret) : null;
    if (taken) return { ok: false, error: taken, fieldErrors: { siret: "SIRET déjà présent." } };
  }

  const existingUser = await prisma.user.findFirst({ where: { email: { equals: ownerEmail, mode: "insensitive" }, deletedAt: null }, select: { id: true } });
  if (existingUser) return { ok: false, error: "Un compte existe déjà avec cette adresse e-mail.", fieldErrors: { ownerEmail: "Un compte existe déjà avec cette adresse." } };

  const [organizationSlug, pharmacySlug] = await Promise.all([uniqueSlug(input.name, "organization"), uniqueSlug(input.name, "pharmacy")]);
  // Sans mot de passe fourni, un secret aléatoire que personne ne connaît : le titulaire choisit le sien par le lien reçu.
  const passwordHash = await hashPassword(input.ownerPassword || generateToken(24));
  const lgo = input.lgo && isLgoId(input.lgo) ? input.lgo : null;

  const created = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: input.name, slug: organizationSlug } });
    const pharmacy = await tx.pharmacy.create({
      data: {
        organizationId: organization.id,
        name: input.name,
        slug: pharmacySlug,
        email: normalizeEmail(input.email) ?? null,
        phone: input.phone || null,
        addressLine1: input.addressLine1 || null,
        postalCode: input.postalCode || null,
        city: input.city || null,
        finessNumber: input.finessNumber?.replace(/\s/g, "") || null,
        siret,
        postCount: input.postCount,
        ...(input.brandColor ? { brandColor: input.brandColor } : {}),
        isDemo: false,
        isActive: true,
        referredById: input.referredById ?? null,
      },
    });
    const owner = await tx.user.create({ data: { organizationId: organization.id, email: ownerEmail, firstName: input.ownerFirstName, lastName: input.ownerLastName, passwordHash, status: "ACTIVE" } });
    await tx.membership.create({ data: { userId: owner.id, pharmacyId: pharmacy.id, role: "OWNER", isActive: true } });
    if (lgo) await tx.stockConnection.create({ data: { pharmacyId: pharmacy.id, lgo, status: "PENDING" } });
    await tx.pharmacyPostCountChange.create({ data: { pharmacyId: pharmacy.id, previous: null, next: input.postCount, actorType: actor.type, actorLabel: actor.label } });
    return { pharmacyId: pharmacy.id, ownerId: owner.id };
  });

  // Le dossier commercial est ouvert tout de suite : contrat, signature et abonnement s'y rattachent, sans ressaisie.
  const dossier = await ensureDossierForPharmacy(created.pharmacyId, actor);
  await recordAudit({ action: "platform.pharmacy_created", entityType: "Pharmacy", entityId: created.pharmacyId, pharmacyId: created.pharmacyId, platformAdminId: actor.id, metadata: { name: input.name, ownerEmail, postCount: input.postCount, siret } });

  const welcome = await sendUserPasswordLink(created.ownerId, "welcome", deps).catch((error: unknown) => ({ status: "FAILED", detail: error instanceof Error ? error.message : "Envoi impossible.", url: "" }));
  return { ok: true, pharmacyId: created.pharmacyId, prospectId: dossier.ok ? dossier.prospectId : "", welcome: { status: welcome.status, detail: welcome.detail } };
}

/** Changer le nombre de postes : la valeur, l'historique, et le dossier commercial suivent. */
export async function setPostCount(pharmacyId: string, next: number, actor: SalesActor): Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  if (!Number.isInteger(next) || next < 1 || next > 99) return { ok: false, error: "Le nombre de postes doit être un entier entre 1 et 99." };
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { postCount: true, prospect: { select: { id: true } } } });
  if (!pharmacy) return { ok: false, error: "Officine introuvable." };
  if (pharmacy.postCount === next) return { ok: true, changed: false };
  await prisma.$transaction([
    prisma.pharmacy.update({ where: { id: pharmacyId }, data: { postCount: next } }),
    prisma.pharmacyPostCountChange.create({ data: { pharmacyId, previous: pharmacy.postCount, next, actorType: actor.type, actorLabel: actor.label } }),
    ...(pharmacy.prospect ? [prisma.prospect.update({ where: { id: pharmacy.prospect.id }, data: { postCount: next } })] : []),
  ]);
  await recordAudit({ action: "platform.post_count_changed", entityType: "Pharmacy", entityId: pharmacyId, pharmacyId, platformAdminId: actor.type === "ADMIN" ? actor.id : null, metadata: { from: pharmacy.postCount, to: next } });
  if (pharmacy.prospect) await recordProspectEvent({ prospectId: pharmacy.prospect.id, type: "NOTE", summary: `Nombre de postes : ${pharmacy.postCount ?? "—"} → ${next}.`, actor, metadata: { from: pharmacy.postCount, to: next } });
  return { ok: true, changed: true };
}

/** E-mail de CONTACT de l'officine : une coordonnée, sans effet sur la connexion. */
export async function changePharmacyContactEmail(pharmacyId: string, raw: string, actor: AdminActor): Promise<{ ok: true; from: string | null; to: string | null } | { ok: false; error: string }> {
  const email = raw.trim() ? normalizeEmail(raw) : null;
  if (raw.trim() && !email) return { ok: false, error: "Adresse e-mail invalide." };
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { email: true, prospect: { select: { id: true } } } });
  if (!pharmacy) return { ok: false, error: "Officine introuvable." };
  if (pharmacy.email === email) return { ok: true, from: pharmacy.email, to: email };
  await prisma.pharmacy.update({ where: { id: pharmacyId }, data: { email } });
  await recordAudit({ action: "platform.pharmacy_email_changed", entityType: "Pharmacy", entityId: pharmacyId, pharmacyId, platformAdminId: actor.id, metadata: { field: "contact", from: pharmacy.email, to: email } });
  if (pharmacy.prospect) await recordProspectEvent({ prospectId: pharmacy.prospect.id, type: "NOTE", summary: `E-mail de contact de l'officine : ${pharmacy.email ?? "—"} → ${email ?? "—"}.`, actor });
  return { ok: true, from: pharmacy.email, to: email };
}

async function activeOwner(pharmacyId: string) {
  const membership = await prisma.membership.findFirst({
    where: { pharmacyId, role: "OWNER", isActive: true, user: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { user: { select: { id: true, email: true, firstName: true, lastName: true, lastLoginAt: true, status: true } } },
  });
  return membership?.user ?? null;
}

/**
 * E-mail de CONNEXION du titulaire : c'est son identifiant. Le lien d'accès en
 * attente est annulé, ses sessions sont fermées ; l'adresse du dossier suit
 * tant qu'aucun contrat n'est parti. Option : renvoyer aussitôt l'accès.
 */
export async function changeOwnerLoginEmail(pharmacyId: string, raw: string, actor: AdminActor, options: { resend: boolean }, deps?: { messaging?: MessagingProvider }): Promise<
  { ok: true; from: string; to: string; dossierUpdated: boolean; resent: { status: string; detail: string } | null } | { ok: false; error: string }
> {
  const email = normalizeEmail(raw);
  if (!email) return { ok: false, error: "Adresse e-mail invalide." };
  const owner = await activeOwner(pharmacyId);
  if (!owner) return { ok: false, error: "Cette officine n'a pas de titulaire actif : ajoutez-en un." };
  if (owner.email.toLowerCase() === email) return { ok: false, error: "C'est déjà l'adresse de connexion du titulaire." };
  const taken = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, id: { not: owner.id } }, select: { id: true, deletedAt: true } });
  if (taken) return { ok: false, error: taken.deletedAt ? "Cette adresse appartient à un compte supprimé : choisissez-en une autre ou contactez l'équipe technique." : "Un autre compte PharmaBoost utilise déjà cette adresse." };

  const prospect = await prisma.prospect.findUnique({ where: { pharmacyId }, select: { id: true, email: true, contracts: { where: { status: { in: LOCKING_CONTRACT as never } }, select: { id: true }, take: 1 } } });
  const syncDossier = Boolean(prospect && prospect.contracts.length === 0 && (!prospect.email || prospect.email.toLowerCase() === owner.email.toLowerCase()));

  await prisma.$transaction([
    prisma.user.update({ where: { id: owner.id }, data: { email, passwordResetTokenHash: null, passwordResetExpiresAt: null } }),
    prisma.session.deleteMany({ where: { userId: owner.id } }),
    ...(syncDossier && prospect ? [prisma.prospect.update({ where: { id: prospect.id }, data: { email } })] : []),
  ]);
  await recordAudit({ action: "platform.owner_email_changed", entityType: "User", entityId: owner.id, pharmacyId, platformAdminId: actor.id, metadata: { field: "login", from: owner.email, to: email, dossierUpdated: syncDossier } });
  if (prospect) {
    await recordProspectEvent({
      prospectId: prospect.id,
      type: "NOTE",
      summary: `E-mail de connexion du titulaire : ${owner.email} → ${email}.${syncDossier ? " Le dossier suit." : prospect.contracts.length ? " Un contrat est en cours : l'adresse du contrat n'est pas modifiée." : ""}`,
      actor,
      metadata: { from: owner.email, to: email },
    });
  }
  const resent = options.resend ? await resendOwnerAccess(pharmacyId, actor, deps, { bypassCooldown: true }) : null;
  return { ok: true, from: owner.email, to: email, dossierUpdated: syncDossier, resent: resent ? (resent.ok ? { status: resent.status, detail: resent.detail } : { status: "FAILED", detail: resent.error }) : null };
}

/**
 * Renvoyer l'accès au titulaire : un e-mail de bienvenue s'il ne s'est jamais
 * connecté, un lien de mot de passe sinon. Un nouveau lien remplace l'ancien.
 */
export async function resendOwnerAccess(pharmacyId: string, actor: AdminActor, deps?: { messaging?: MessagingProvider }, options?: { bypassCooldown?: boolean }): Promise<
  { ok: true; status: string; detail: string; email: string; kind: "welcome" | "reset" } | { ok: false; error: string }
> {
  const owner = await activeOwner(pharmacyId);
  if (!owner) return { ok: false, error: "Cette officine n'a pas de titulaire actif : ajoutez-en un." };
  if (owner.status !== "ACTIVE") return { ok: false, error: "Le compte du titulaire est désactivé." };
  if (!options?.bypassCooldown) {
    const last = await lastDispatchFor({ userId: owner.id }, ["WELCOME", "ACCESS_LINK"]);
    if (last && last.status === "SENT" && last.recipient === owner.email && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      return { ok: true, status: "SKIPPED", detail: "Un accès vient de partir il y a moins d'une minute : pas de second envoi.", email: owner.email, kind: owner.lastLoginAt ? "reset" : "welcome" };
    }
  }
  const kind = owner.lastLoginAt ? "reset" : "welcome";
  const outcome = await sendUserPasswordLink(owner.id, kind, deps);
  await recordAudit({ action: "platform.owner_welcome_resent", entityType: "User", entityId: owner.id, pharmacyId, platformAdminId: actor.id, metadata: { kind, status: outcome.status } });
  return { ok: true, status: outcome.status, detail: outcome.detail, email: owner.email, kind };
}

/** L'état de l'accès du titulaire, pour la fiche : jamais connecté, invitation envoyée, échec, actif. */
export async function ownerAccessSummary(pharmacyId: string) {
  const owner = await activeOwner(pharmacyId);
  if (!owner) return null;
  const last = await lastDispatchFor({ userId: owner.id }, ["WELCOME", "ACCESS_LINK"]);
  return { owner, lastDispatch: last };
}
