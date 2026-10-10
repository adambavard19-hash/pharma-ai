import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { generateToken, hashToken } from "@/server/security/tokens";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/server/security/password";
import { recordDispatch, type DispatchKind } from "@/server/services/email-dispatch";
import { createNotification } from "@/server/services/notifications";
import { nextSortOrder } from "@/server/services/team-management";
import type { TenantScope } from "@/server/db/tenant";
import type { MessagingProvider } from "@/core/ai/ports";
import { TEAM_ROLE_LABELS, type TeamRole } from "@/core/team/rules";
import { buildAccountExistsEmail, buildJoinDecisionEmail, buildJoinRequestAlertEmail, buildTeamInvitationEmail } from "@/core/team/access-emails";
import { INVITATION_TTL_MS, MAX_INVITES_AT_ONCE, MAX_PENDING_JOIN_REQUESTS, invitationState, isDeclarableRole, isEmail, isInvitableRole, normalizeEmail, publicPharmacyLabel, searchTerm, type InvitationState, type InvitableRole } from "@/core/team/access";

/**
 * Entrer dans une officine : le titulaire invite par e-mail, ou le collaborateur demande à rejoindre et le titulaire approuve.
 *
 * Règles qui ne bougent pas :
 *  - tout ce que fait le titulaire est borné à l'officine de SA session (jamais à un identifiant reçu d'un écran) ;
 *  - un lien d'invitation est personnel, daté, à usage unique ; seule son empreinte est conservée ;
 *  - une demande de rattachement ne crée AUCUN accès : le compte n'existe qu'à l'approbation ;
 *  - un écran public ne dit jamais si une adresse e-mail a déjà un compte (c'est l'e-mail qui le dit, à la personne concernée).
 */

type Failure = { ok: false; error: string };
type Deps = { messaging?: MessagingProvider };

const fullName = (user: { firstName: string; lastName: string }) => `${user.firstName} ${user.lastName}`.trim();

async function deliver(input: { to: string; message: { subject: string; text: string; html: string }; kind: DispatchKind; pharmacy: { id: string; organizationId: string; isDemo: boolean }; userId?: string | null; invitationId?: string | null }, deps?: Deps) {
  const messaging = deps?.messaging ?? getMessagingProvider({ demo: input.pharmacy.isDemo });
  const outcome = await messaging
    .sendEmail({ to: input.to, fromName: "PharmaBoost", subject: input.message.subject, text: input.message.text, html: input.message.html })
    .catch((error: unknown) => ({ status: "FAILED" as const, provider: messaging.info.id, detail: error instanceof Error ? error.message : "Envoi impossible." }));
  await recordDispatch({ kind: input.kind, recipient: input.to, outcome, subject: input.message.subject, trigger: "SYSTEM", pharmacyId: input.pharmacy.id, organizationId: input.pharmacy.organizationId, userId: input.userId ?? null, invitationId: null }).catch(() => undefined);
  return outcome;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Les invitations du titulaire
// ---------------------------------------------------------------------------------------------------------------------------------

export type InviteStatus = "SENT" | "SIMULATED" | "FAILED" | "ALREADY_MEMBER" | "UNAVAILABLE";
export type InviteOutcome = { email: string; status: InviteStatus };

async function loadPharmacyForMail(pharmacyId: string) {
  return prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { id: true, name: true, organizationId: true, isDemo: true } });
}

/** Envoie (ou renvoie) le lien d'une invitation : le jeton est refait, l'ancien lien cesse de marcher. */
async function sendInvitationLink(invitationId: string, inviterName: string, deps?: Deps): Promise<InviteStatus> {
  const invitation = await prisma.teamInvitation.findUnique({ where: { id: invitationId } });
  if (!invitation) return "FAILED";
  const pharmacy = await loadPharmacyForMail(invitation.pharmacyId);
  if (!pharmacy) return "FAILED";
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  await prisma.teamInvitation.update({ where: { id: invitation.id }, data: { tokenHash: hashToken(token), expiresAt, lastSentAt: new Date(), sentCount: { increment: 1 } } });
  const message = buildTeamInvitationEmail({ firstName: invitation.firstName, pharmacyName: pharmacy.name, inviterName, roleLabel: TEAM_ROLE_LABELS[invitation.role as TeamRole].toLowerCase(), url: publicUrl(`/invitation/${token}`), expiresAt });
  const outcome = await deliver({ to: invitation.email, message, kind: "TEAM_INVITATION", pharmacy }, deps);
  return outcome.status === "FAILED" ? "FAILED" : outcome.status === "SIMULATED" ? "SIMULATED" : "SENT";
}

/**
 * Invite plusieurs personnes d'un coup, au même poste. Les adresses déjà dans l'équipe sont signalées ; une adresse connue d'une autre
 * organisation reste « indisponible » (confirmer qu'elle existe renseignerait sur la clientèle de PharmaBoost).
 */
export async function inviteCollaborators(scope: TenantScope, input: { emails: string[]; role: string; firstName?: string; lastName?: string }, deps?: Deps): Promise<{ ok: true; results: InviteOutcome[] } | Failure> {
  if (!isInvitableRole(input.role)) return { ok: false, error: "Choisissez un poste pour les personnes invitées." };
  const emails = [...new Set(input.emails.map(normalizeEmail))].filter(Boolean);
  if (emails.length === 0) return { ok: false, error: "Saisissez au moins une adresse e-mail." };
  if (emails.length > MAX_INVITES_AT_ONCE) return { ok: false, error: `${MAX_INVITES_AT_ONCE} invitations à la fois au plus.` };
  if (emails.some((email) => !isEmail(email))) return { ok: false, error: "Une adresse e-mail n'est pas valide." };

  const inviter = await prisma.user.findUnique({ where: { id: scope.userId }, select: { firstName: true, lastName: true } });
  const inviterName = inviter ? fullName(inviter) : "Le titulaire";
  const members = await prisma.membership.findMany({ where: { pharmacyId: scope.pharmacyId, user: { deletedAt: null } }, select: { user: { select: { email: true } } } });
  const inTeam = new Set(members.map((member) => member.user.email.toLowerCase()));

  const results: InviteOutcome[] = [];
  for (const email of emails) {
    if (inTeam.has(email)) { results.push({ email, status: "ALREADY_MEMBER" }); continue; }
    const known = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, deletedAt: null }, select: { organizationId: true } });
    if (known && known.organizationId !== scope.organizationId) { results.push({ email, status: "UNAVAILABLE" }); continue; }
    // Une seule invitation vivante par adresse et par officine : la précédente est annulée.
    await prisma.teamInvitation.updateMany({ where: { pharmacyId: scope.pharmacyId, email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    const created = await prisma.teamInvitation.create({
      data: { pharmacyId: scope.pharmacyId, email, role: input.role as InvitableRole, firstName: emails.length === 1 ? input.firstName?.trim() || null : null, lastName: emails.length === 1 ? input.lastName?.trim() || null : null, tokenHash: hashToken(generateToken(32)), expiresAt: new Date(Date.now() + INVITATION_TTL_MS), invitedByUserId: scope.userId, sentCount: 0 },
      select: { id: true },
    });
    const status = await sendInvitationLink(created.id, inviterName, deps);
    await recordAudit({ action: "team.invitation_sent", entityType: "TeamInvitation", entityId: created.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { role: input.role, status } });
    results.push({ email, status });
  }
  return { ok: true, results };
}

export type InvitationRow = { id: string; email: string; role: TeamRole; state: InvitationState; sentAt: Date; sentCount: number; expiresAt: Date };

/** Les invitations de CETTE officine qui n'ont été ni acceptées ni annulées (les expirées y restent, pour pouvoir les renvoyer). */
export async function listInvitations(pharmacyId: string, now = new Date()): Promise<InvitationRow[]> {
  const rows = await prisma.teamInvitation.findMany({ where: { pharmacyId, acceptedAt: null, revokedAt: null }, orderBy: { lastSentAt: "desc" }, take: 100 });
  return rows.map((row) => ({ id: row.id, email: row.email, role: row.role as TeamRole, state: invitationState(row, now), sentAt: row.lastSentAt, sentCount: row.sentCount, expiresAt: row.expiresAt }));
}

export async function resendInvitation(scope: TenantScope, id: string, deps?: Deps): Promise<{ ok: true; email: string; status: InviteStatus } | Failure> {
  const invitation = await prisma.teamInvitation.findFirst({ where: { id, pharmacyId: scope.pharmacyId, acceptedAt: null, revokedAt: null }, select: { id: true, email: true } });
  if (!invitation) return { ok: false, error: "Invitation introuvable." };
  const inviter = await prisma.user.findUnique({ where: { id: scope.userId }, select: { firstName: true, lastName: true } });
  const status = await sendInvitationLink(invitation.id, inviter ? fullName(inviter) : "Le titulaire", deps);
  await recordAudit({ action: "team.invitation_resent", entityType: "TeamInvitation", entityId: invitation.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { status } });
  return { ok: true, email: invitation.email, status };
}

export async function revokeInvitation(scope: TenantScope, id: string): Promise<{ ok: true; email: string } | Failure> {
  const invitation = await prisma.teamInvitation.findFirst({ where: { id, pharmacyId: scope.pharmacyId, acceptedAt: null, revokedAt: null }, select: { id: true, email: true } });
  if (!invitation) return { ok: false, error: "Invitation introuvable." };
  await prisma.teamInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
  await recordAudit({ action: "team.invitation_revoked", entityType: "TeamInvitation", entityId: invitation.id, pharmacyId: scope.pharmacyId, userId: scope.userId });
  return { ok: true, email: invitation.email };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Le collaborateur qui ouvre son lien
// ---------------------------------------------------------------------------------------------------------------------------------

export type InvitationPreview = { pharmacyName: string; role: TeamRole; email: string; firstName: string; lastName: string; existingAccount: boolean };

async function findLiveInvitation(token: string) {
  if (typeof token !== "string" || token.length < 16 || token.length > 200) return null;
  const invitation = await prisma.teamInvitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { pharmacy: { select: { id: true, name: true, organizationId: true, isActive: true, isDemo: true } } } });
  if (!invitation || invitationState(invitation, new Date()) !== "PENDING" || !invitation.pharmacy.isActive) return null;
  return invitation;
}

/** Ce que la page du lien montre : l'officine, le poste, l'adresse. Rien d'autre, et rien du tout pour un lien périmé ou inconnu. */
export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  const invitation = await findLiveInvitation(token);
  if (!invitation) return null;
  const existing = await prisma.user.findFirst({ where: { email: { equals: invitation.email, mode: "insensitive" }, deletedAt: null }, select: { id: true, organizationId: true } });
  if (existing && existing.organizationId !== invitation.pharmacy.organizationId) return null;
  return { pharmacyName: invitation.pharmacy.name, role: invitation.role as TeamRole, email: invitation.email, firstName: invitation.firstName ?? "", lastName: invitation.lastName ?? "", existingAccount: Boolean(existing) };
}

export async function acceptInvitation(token: string, input: { firstName: string; lastName: string; password: string }): Promise<{ ok: true; userId: string; pharmacyId: string } | Failure> {
  const invitation = await findLiveInvitation(token);
  if (!invitation) return { ok: false, error: "Ce lien n'est plus valable. Demandez une nouvelle invitation au titulaire." };
  const existing = await prisma.user.findFirst({ where: { email: { equals: invitation.email, mode: "insensitive" }, deletedAt: null }, select: { id: true, organizationId: true, passwordHash: true, status: true } });
  if (existing && existing.organizationId !== invitation.pharmacy.organizationId) return { ok: false, error: "Ce lien n'est plus valable. Demandez une nouvelle invitation au titulaire." };

  let passwordHash: string | null = null;
  if (existing) {
    // Un compte existe déjà (un collaborateur de plusieurs officines du même groupe) : on vérifie son mot de passe, on ne le change pas.
    if (!(await verifyPassword(input.password, existing.passwordHash)) || existing.status !== "ACTIVE") return { ok: false, error: "Mot de passe incorrect." };
  } else {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) return { ok: false, error: "Indiquez votre prénom et votre nom." };
    const weaknesses = validatePasswordStrength(input.password);
    if (weaknesses.length > 0) return { ok: false, error: `Mot de passe trop faible : ${weaknesses.join(", ")}.` };
    passwordHash = await hashPassword(input.password);
  }

  const userId = await prisma.$transaction(async (tx) => {
    // L'usage unique se joue ici : une seule transaction « consomme » le lien.
    const claimed = await tx.teamInvitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count === 0) return null;
    const user = existing
      ? { id: existing.id }
      : await tx.user.create({ data: { organizationId: invitation.pharmacy.organizationId, email: invitation.email, firstName: input.firstName.trim(), lastName: input.lastName.trim(), passwordHash, status: "ACTIVE" }, select: { id: true } });
    const already = await tx.membership.findUnique({ where: { userId_pharmacyId: { userId: user.id, pharmacyId: invitation.pharmacyId } }, select: { id: true } });
    if (!already) await tx.membership.create({ data: { userId: user.id, pharmacyId: invitation.pharmacyId, role: invitation.role, isActive: true, sortOrder: await nextSortOrder(tx, invitation.pharmacyId) } });
    await tx.teamInvitation.update({ where: { id: invitation.id }, data: { acceptedUserId: user.id } });
    return user.id;
  });
  if (!userId) return { ok: false, error: "Ce lien a déjà été utilisé." };

  await recordAudit({ action: "team.invitation_accepted", entityType: "TeamInvitation", entityId: invitation.id, pharmacyId: invitation.pharmacyId, userId, metadata: { role: invitation.role, existingAccount: Boolean(existing) } });
  const owners = await prisma.membership.findMany({ where: { pharmacyId: invitation.pharmacyId, role: "OWNER", isActive: true }, select: { userId: true } });
  const name = `${input.firstName.trim()} ${input.lastName.trim()}`.trim() || invitation.email;
  for (const owner of owners) await createNotification({ pharmacyId: invitation.pharmacyId, userId: owner.userId, type: "TEAM_EVENT", severity: "SUCCESS", title: `${name} a rejoint l'équipe`, body: `${invitation.email} a accepté votre invitation.`, linkUrl: "/equipe" }).catch(() => undefined);
  return { ok: true, userId, pharmacyId: invitation.pharmacyId };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// « Rejoindre mon officine » : la demande, puis l'approbation du titulaire
// ---------------------------------------------------------------------------------------------------------------------------------

export type PublicPharmacy = { id: string; label: string };

/** Chercher sa pharmacie : nom, ville ou code postal. Trois caractères au moins, six résultats au plus, et seulement nom + commune. */
export async function searchPharmacies(raw: unknown): Promise<PublicPharmacy[]> {
  const term = searchTerm(raw);
  if (!term) return [];
  const rows = await prisma.pharmacy.findMany({
    where: { isActive: true, isDemo: false, OR: [{ name: { contains: term, mode: "insensitive" } }, { city: { contains: term, mode: "insensitive" } }, { postalCode: { startsWith: term } }] },
    orderBy: { name: "asc" },
    take: 6,
    select: { id: true, name: true, postalCode: true, city: true },
  });
  return rows.map((row) => ({ id: row.id, label: publicPharmacyLabel(row) }));
}

export type JoinInput = { pharmacyId: string; firstName: string; lastName: string; email: string; password: string; role: string };

/**
 * Enregistre la demande. Réponse identique que l'adresse soit libre ou non : si elle a déjà un compte, c'est un e-mail (à elle seule) qui le
 * dit. Seuls les refus qui ne renseignent sur personne (champ invalide, officine qui ne reçoit pas) s'affichent.
 */
export async function requestToJoin(input: JoinInput, deps?: Deps): Promise<{ ok: true; pharmacyName: string } | Failure> {
  const email = normalizeEmail(input.email);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) return { ok: false, error: "Indiquez votre prénom et votre nom." };
  if (!isEmail(email)) return { ok: false, error: "Adresse e-mail invalide." };
  if (!isDeclarableRole(input.role)) return { ok: false, error: "Choisissez votre poste." };
  const weaknesses = validatePasswordStrength(input.password);
  if (weaknesses.length > 0) return { ok: false, error: `Mot de passe trop faible : ${weaknesses.join(", ")}.` };

  const pharmacy = await prisma.pharmacy.findFirst({ where: { id: input.pharmacyId, isActive: true, isDemo: false }, select: { id: true, name: true, organizationId: true, isDemo: true } });
  if (!pharmacy) return { ok: false, error: "Cette officine ne reçoit pas de demandes. Contactez directement son titulaire." };

  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, deletedAt: null }, select: { id: true } });
  if (existing) {
    await deliver({ to: email, message: buildAccountExistsEmail({ firstName, loginUrl: publicUrl("/login"), resetUrl: publicUrl("/login/oubli") }), kind: "ACCOUNT_EXISTS", pharmacy, userId: existing.id }, deps);
    return { ok: true, pharmacyName: pharmacy.name };
  }

  const passwordHash = await hashPassword(input.password);
  const pending = await prisma.joinRequest.findFirst({ where: { pharmacyId: pharmacy.id, email, status: "PENDING" }, select: { id: true } });
  if (pending) {
    // Une demande en attente pour cette adresse : on la met à jour, sans prévenir une deuxième fois le titulaire.
    await prisma.joinRequest.update({ where: { id: pending.id }, data: { firstName, lastName, suggestedRole: input.role as "PHARMACIST", passwordHash } });
    return { ok: true, pharmacyName: pharmacy.name };
  }
  const count = await prisma.joinRequest.count({ where: { pharmacyId: pharmacy.id, status: "PENDING" } });
  if (count >= MAX_PENDING_JOIN_REQUESTS) return { ok: false, error: "Cette officine ne peut plus recevoir de demandes pour le moment. Contactez directement son titulaire." };

  const created = await prisma.joinRequest.create({ data: { pharmacyId: pharmacy.id, email, firstName, lastName, suggestedRole: input.role as "PHARMACIST", passwordHash }, select: { id: true } });
  await recordAudit({ action: "team.join_requested", entityType: "JoinRequest", entityId: created.id, pharmacyId: pharmacy.id, metadata: { role: input.role } });

  const owners = await prisma.membership.findMany({ where: { pharmacyId: pharmacy.id, role: "OWNER", isActive: true, user: { status: "ACTIVE", deletedAt: null } }, select: { user: { select: { id: true, firstName: true, email: true } } } });
  const requesterName = `${firstName} ${lastName}`;
  for (const { user } of owners) {
    await createNotification({ pharmacyId: pharmacy.id, userId: user.id, type: "TEAM_EVENT", severity: "WARNING", title: `${requesterName} demande à rejoindre l'officine`, body: `${email} attend votre approbation.`, linkUrl: "/equipe" }).catch(() => undefined);
    await deliver({ to: user.email, message: buildJoinRequestAlertEmail({ ownerFirstName: user.firstName, pharmacyName: pharmacy.name, requesterName, requesterEmail: email, roleLabel: TEAM_ROLE_LABELS[input.role as TeamRole].toLowerCase(), url: publicUrl("/equipe") }), kind: "JOIN_REQUEST_ALERT", pharmacy, userId: user.id }, deps).catch(() => undefined);
  }
  return { ok: true, pharmacyName: pharmacy.name };
}

export type JoinRequestRow = { id: string; name: string; email: string; suggestedRole: TeamRole; requestedAt: Date };

/** Les demandes en attente de CETTE officine. */
export async function listJoinRequests(pharmacyId: string): Promise<JoinRequestRow[]> {
  const rows = await prisma.joinRequest.findMany({ where: { pharmacyId, status: "PENDING" }, orderBy: { requestedAt: "asc" }, take: 100 });
  return rows.map((row) => ({ id: row.id, name: `${row.firstName} ${row.lastName}`.trim(), email: row.email, suggestedRole: row.suggestedRole as TeamRole, requestedAt: row.requestedAt }));
}

export async function approveJoinRequest(scope: TenantScope, id: string, role: string, deps?: Deps): Promise<{ ok: true; name: string } | Failure> {
  if (!isInvitableRole(role)) return { ok: false, error: "Choisissez le poste de cette personne." };
  const request = await prisma.joinRequest.findFirst({ where: { id, pharmacyId: scope.pharmacyId, status: "PENDING" } });
  if (!request || !request.passwordHash) return { ok: false, error: "Demande introuvable ou déjà traitée." };
  const pharmacy = await loadPharmacyForMail(scope.pharmacyId);
  if (!pharmacy) return { ok: false, error: "Officine introuvable." };
  const name = `${request.firstName} ${request.lastName}`.trim();

  const known = await prisma.user.findFirst({ where: { email: { equals: request.email, mode: "insensitive" }, deletedAt: null }, select: { id: true } });
  if (known) return { ok: false, error: "Cette adresse e-mail a entre-temps reçu un compte : refusez la demande et invitez la personne par e-mail." };

  const userId = await prisma.$transaction(async (tx) => {
    const claimed = await tx.joinRequest.updateMany({ where: { id: request.id, pharmacyId: scope.pharmacyId, status: "PENDING" }, data: { status: "APPROVED", decidedAt: new Date(), decidedByUserId: scope.userId, grantedRole: role, passwordHash: null } });
    if (claimed.count === 0) return null;
    const user = await tx.user.create({ data: { organizationId: pharmacy.organizationId, email: request.email, firstName: request.firstName, lastName: request.lastName, passwordHash: request.passwordHash, status: "ACTIVE" }, select: { id: true } });
    await tx.membership.create({ data: { userId: user.id, pharmacyId: scope.pharmacyId, role, isActive: true, sortOrder: await nextSortOrder(tx, scope.pharmacyId) } });
    await tx.joinRequest.update({ where: { id: request.id }, data: { userId: user.id } });
    return user.id;
  });
  if (!userId) return { ok: false, error: "Demande déjà traitée." };

  await recordAudit({ action: "team.join_approved", entityType: "JoinRequest", entityId: request.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { role, newUserId: userId } });
  await deliver({ to: request.email, message: buildJoinDecisionEmail({ firstName: request.firstName, pharmacyName: pharmacy.name, approved: true, roleLabel: TEAM_ROLE_LABELS[role as TeamRole].toLowerCase(), loginUrl: publicUrl("/login") }), kind: "JOIN_REQUEST_DECISION", pharmacy, userId }, deps).catch(() => undefined);
  return { ok: true, name };
}

export async function refuseJoinRequest(scope: TenantScope, id: string, deps?: Deps): Promise<{ ok: true; name: string } | Failure> {
  const request = await prisma.joinRequest.findFirst({ where: { id, pharmacyId: scope.pharmacyId, status: "PENDING" } });
  if (!request) return { ok: false, error: "Demande introuvable ou déjà traitée." };
  const claimed = await prisma.joinRequest.updateMany({ where: { id: request.id, pharmacyId: scope.pharmacyId, status: "PENDING" }, data: { status: "REFUSED", decidedAt: new Date(), decidedByUserId: scope.userId, passwordHash: null } });
  if (claimed.count === 0) return { ok: false, error: "Demande déjà traitée." };
  await recordAudit({ action: "team.join_refused", entityType: "JoinRequest", entityId: request.id, pharmacyId: scope.pharmacyId, userId: scope.userId });
  const pharmacy = await loadPharmacyForMail(scope.pharmacyId);
  if (pharmacy) await deliver({ to: request.email, message: buildJoinDecisionEmail({ firstName: request.firstName, pharmacyName: pharmacy.name, approved: false, roleLabel: null, loginUrl: publicUrl("/login") }), kind: "JOIN_REQUEST_DECISION", pharmacy }, deps).catch(() => undefined);
  return { ok: true, name: `${request.firstName} ${request.lastName}`.trim() };
}
