import "server-only";
import { prisma } from "@/server/db/client";
import { generateToken, hashToken } from "@/server/security/tokens";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";
import { platformEmailContext } from "@/server/services/email-context";
import { recordDispatch } from "@/server/services/email-dispatch";
import { recordProspectEvent, type SalesActor } from "@/server/services/sales/events";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { createProspect } from "@/server/services/sales/prospects";
import { buildDossierReceivedEmail, buildPharmacyInvitationEmail } from "@/core/onboarding/emails";
import { onboardingSchema, type OnboardingInput } from "@/core/onboarding/form";
import { PLACEHOLDER_NAME } from "@/core/onboarding/stage";
import { normalizeEmail, normalizeSiret, normalizePhone, normalizePostalCode } from "@/core/contracts/identity";
import { missingContractFields } from "@/core/contracts/requirements";
import type { MessagingProvider } from "@/core/ai/ports";

/**
 * L'inscription d'une officine sur invitation. L'administrateur ne connaît
 * qu'une adresse : un dossier (Prospect, origine console) est ouvert, un lien
 * personnel part ; le titulaire complète lui-même LE MÊME dossier, que la
 * console affiche aussitôt. Le contrat part ensuite par le moteur commun
 * (startContracting), jamais d'ici.
 *
 * Le jeton n'est conservé que sous forme d'empreinte. Un renvoi en émet un
 * nouveau et rend l'ancien inutilisable.
 */

export const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
/** Deux envois rapprochés au même titulaire : le second est ignoré (double clic, double soumission). */
const RESEND_COOLDOWN_MS = 60 * 1000;

export type OnboardingDeps = { messaging?: MessagingProvider; now?: () => Date };
const nowOf = (deps?: OnboardingDeps) => (deps?.now ? deps.now() : new Date());

export type InvitationState = "VALID" | "EXPIRED" | "USED" | "REVOKED" | "UNKNOWN";

function inviteUrl(token: string) {
  return publicUrl(`/inscription/${token}`);
}

/** Inviter un titulaire dont on ne connaît que l'e-mail. Un dossier ouvert pour la même adresse est repris, jamais doublé. */
export async function inviteOwnerByEmail(rawEmail: string, actor: SalesActor & { type: "ADMIN" }, deps?: OnboardingDeps): Promise<{ ok: true; prospectId: string; reused: boolean; send: SendResult } | { ok: false; error: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: "Adresse e-mail invalide." };

  const account = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, deletedAt: null }, select: { id: true } });
  if (account) return { ok: false, error: "Un compte PharmaBoost existe déjà avec cette adresse : utilisez la fiche de l'officine concernée." };

  const open = await prisma.prospect.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, pharmacyId: null, status: { not: "LOST" } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (open) {
    const send = await sendInvitation(open.id, actor, deps);
    return { ok: true, prospectId: open.id, reused: true, send };
  }

  const created = await createProspect({ name: PLACEHOLDER_NAME, email }, null, actor, "SUPER_ADMIN");
  await prisma.prospect.update({ where: { id: created.id }, data: { nextActionLabel: "Attendre que le titulaire complète son dossier", nextActionAt: null } });
  const send = await sendInvitation(created.id, actor, deps);
  return { ok: true, prospectId: created.id, reused: false, send };
}

export type SendResult = { status: "SENT" | "FAILED" | "SIMULATED" | "SKIPPED"; detail: string; email: string };

/** (Re)envoyer l'invitation du dossier : nouveau jeton, nouvelle échéance, l'ancien lien cesse de fonctionner. */
export async function sendInvitation(prospectId: string, actor: SalesActor, deps?: OnboardingDeps): Promise<SendResult> {
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, include: { invitations: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!prospect?.email) return { status: "FAILED", detail: "Le dossier n'a pas d'adresse e-mail.", email: "" };
  if (prospect.pharmacyId) return { status: "FAILED", detail: "L'espace de cette officine existe déjà : renvoyez plutôt l'accès depuis sa fiche.", email: prospect.email };
  const now = nowOf(deps);
  const last = prospect.invitations[0];
  if (last?.completedAt) return { status: "SKIPPED", detail: "Le titulaire a déjà complété son dossier : aucune invitation à renvoyer.", email: prospect.email };
  if (last?.sentAt && last.lastSendStatus === "SENT" && last.email === prospect.email && now.getTime() - last.sentAt.getTime() < RESEND_COOLDOWN_MS) {
    return { status: "SKIPPED", detail: "Invitation envoyée il y a moins d'une minute : pas de second envoi.", email: prospect.email };
  }

  const token = generateToken(32);
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  const invitation = last
    ? await prisma.pharmacyInvitation.update({ where: { id: last.id }, data: { email: prospect.email, tokenHash: hashToken(token), expiresAt, revokedAt: null, openedAt: null } })
    : await prisma.pharmacyInvitation.create({ data: { prospectId, email: prospect.email, tokenHash: hashToken(token), expiresAt, createdByAdminId: actor.type === "ADMIN" ? actor.id : null } });

  const message = buildPharmacyInvitationEmail(await platformEmailContext(), { url: inviteUrl(token), expiresAt });
  const messaging = deps?.messaging ?? getMessagingProvider();
  const outcome = await messaging
    .sendEmail({ to: prospect.email, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html })
    .catch((error: unknown) => ({ status: "FAILED" as const, provider: messaging.info.id, detail: error instanceof Error ? error.message : "Envoi impossible." }));

  await prisma.pharmacyInvitation.update({
    where: { id: invitation.id },
    data: { lastSendStatus: outcome.status, lastSendDetail: outcome.detail.slice(0, 500), ...(outcome.status === "SENT" ? { sentAt: now, sendCount: { increment: 1 } } : {}) },
  });
  await recordDispatch({ kind: "INVITATION", recipient: prospect.email, outcome, prospectId, invitationId: invitation.id });
  await recordProspectEvent({
    prospectId,
    type: "EMAIL_SENT",
    summary: outcome.status === "SENT" ? `Invitation envoyée à ${prospect.email}${last ? " (nouveau lien)" : ""}.` : `Invitation non envoyée à ${prospect.email} : ${outcome.detail}`,
    actor,
    metadata: { kind: "INVITATION", status: outcome.status, invitationId: invitation.id },
  });
  await recordAudit({ action: "platform.invitation_sent", entityType: "Prospect", entityId: prospectId, platformAdminId: actor.type === "ADMIN" ? actor.id : null, metadata: { status: outcome.status, resent: Boolean(last) } });
  return { status: outcome.status, detail: outcome.detail, email: prospect.email };
}

/** Un nouveau lien, affiché une fois à l'administrateur pour qu'il le transmette lui-même. L'ancien cesse de fonctionner. */
export async function issueInvitationLink(prospectId: string, actor: SalesActor & { type: "ADMIN" }, deps?: OnboardingDeps): Promise<{ ok: true; url: string; expiresAt: Date } | { ok: false; error: string }> {
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, include: { invitations: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!prospect?.email) return { ok: false, error: "Le dossier n'a pas d'adresse e-mail." };
  if (prospect.pharmacyId) return { ok: false, error: "L'espace de cette officine existe déjà." };
  const last = prospect.invitations[0];
  if (last?.completedAt) return { ok: false, error: "Le titulaire a déjà complété son dossier." };
  const token = generateToken(32);
  const expiresAt = new Date(nowOf(deps).getTime() + INVITATION_TTL_MS);
  if (last) await prisma.pharmacyInvitation.update({ where: { id: last.id }, data: { email: prospect.email, tokenHash: hashToken(token), expiresAt, revokedAt: null } });
  else await prisma.pharmacyInvitation.create({ data: { prospectId, email: prospect.email, tokenHash: hashToken(token), expiresAt, createdByAdminId: actor.id } });
  await recordProspectEvent({ prospectId, type: "NOTE", summary: "Nouveau lien d'invitation copié par la console (le lien précédent ne fonctionne plus).", actor });
  await recordAudit({ action: "platform.invitation_link_issued", entityType: "Prospect", entityId: prospectId, platformAdminId: actor.id });
  return { ok: true, url: inviteUrl(token), expiresAt };
}

/** Corriger l'adresse d'une invitation : l'ancien lien est révoqué ; renvoyer ensuite part à la nouvelle adresse. */
export async function changeInvitationEmail(prospectId: string, rawEmail: string, actor: SalesActor & { type: "ADMIN" }): Promise<{ ok: true; from: string | null; to: string } | { ok: false; error: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: "Adresse e-mail invalide." };
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, select: { id: true, email: true, pharmacyId: true } });
  if (!prospect) return { ok: false, error: "Dossier introuvable." };
  if (prospect.pharmacyId) return { ok: false, error: "L'espace existe déjà : modifiez l'e-mail depuis la fiche de l'officine." };
  const account = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, deletedAt: null }, select: { id: true } });
  if (account) return { ok: false, error: "Un compte PharmaBoost existe déjà avec cette adresse." };
  await prisma.$transaction([
    prisma.prospect.update({ where: { id: prospectId }, data: { email } }),
    prisma.pharmacyInvitation.updateMany({ where: { prospectId, completedAt: null, revokedAt: null }, data: { revokedAt: new Date(), email } }),
  ]);
  await recordProspectEvent({ prospectId, type: "NOTE", summary: `Adresse de l'invitation corrigée : ${prospect.email ?? "—"} → ${email}. L'ancien lien ne fonctionne plus.`, actor, metadata: { from: prospect.email, to: email } });
  await recordAudit({ action: "platform.invitation_email_changed", entityType: "Prospect", entityId: prospectId, platformAdminId: actor.id, metadata: { from: prospect.email, to: email } });
  return { ok: true, from: prospect.email, to: email };
}

async function findInvitation(token: string) {
  if (!token || token.length < 20) return null;
  return prisma.pharmacyInvitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { prospect: true } });
}

function stateOf(inv: { expiresAt: Date; completedAt: Date | null; revokedAt: Date | null; prospect: { pharmacyId: string | null } }, now: Date): InvitationState {
  if (inv.completedAt || inv.prospect.pharmacyId) return "USED";
  if (inv.revokedAt) return "REVOKED";
  if (inv.expiresAt < now) return "EXPIRED";
  return "VALID";
}

/**
 * Marquer l'invitation « ouverte ». Appelé par le navigateur du titulaire, pas
 * au chargement de la page : les antivirus de messagerie ouvrent les liens
 * d'eux-mêmes et fausseraient le statut.
 */
export async function markInvitationOpened(token: string, deps?: OnboardingDeps): Promise<boolean> {
  const inv = await findInvitation(token);
  if (!inv) return false;
  const now = nowOf(deps);
  if (stateOf(inv, now) !== "VALID" || inv.openedAt) return false;
  await prisma.pharmacyInvitation.update({ where: { id: inv.id }, data: { openedAt: now } });
  await recordProspectEvent({ prospectId: inv.prospectId, type: "STATUS_CHANGED", summary: "Le titulaire a ouvert son invitation.", actor: { type: "SYSTEM", label: "Titulaire (lien d'invitation)" } });
  await recordAudit({ action: "onboarding.opened", entityType: "Prospect", entityId: inv.prospectId });
  return true;
}

/** Ce que la page d'inscription peut afficher : l'état du lien et, s'il est valable, le dossier à compléter (rien d'autre). Sans effet de bord. */
export async function openInvitation(token: string, deps?: OnboardingDeps) {
  const inv = await findInvitation(token);
  if (!inv) return { state: "UNKNOWN" as const };
  const state = stateOf(inv, nowOf(deps));
  if (state !== "VALID") return { state };
  const p = inv.prospect;
  const [first, ...rest] = (p.ownerName ?? "").split(/\s+/).filter(Boolean);
  return {
    state,
    expiresAt: inv.expiresAt,
    prefill: {
      name: p.name === PLACEHOLDER_NAME ? "" : p.name,
      legalName: p.legalName ?? "",
      siret: p.siret ?? "",
      finessNumber: p.finessNumber ?? "",
      addressLine1: p.addressLine1 ?? "",
      postalCode: p.postalCode ?? "",
      city: p.city ?? "",
      phone: p.phone ?? "",
      contactEmail: p.contactEmail ?? "",
      ownerFirstName: first ?? "",
      ownerLastName: rest.join(" "),
      ownerTitle: p.ownerTitle ?? "",
      ownerEmail: p.email ?? inv.email,
      postCount: p.postCount ? String(p.postCount) : "",
      lgo: p.lgo ?? "",
    },
  };
}

const FIELD_LABELS: Record<string, string> = {
  name: "nom", legalName: "raison sociale", siret: "SIRET", finessNumber: "FINESS", addressLine1: "adresse", postalCode: "code postal", city: "ville",
  phone: "téléphone", contactEmail: "e-mail de contact", ownerName: "représentant", ownerTitle: "qualité", email: "e-mail du représentant", postCount: "postes", lgo: "logiciel",
};

/** Le titulaire enregistre sa fiche : le même dossier est mis à jour, l'invitation est close, la console est prévenue. */
export async function completeOnboarding(token: string, input: OnboardingInput, deps?: OnboardingDeps): Promise<{ ok: true; pharmacyName: string; contractReady: boolean } | { ok: false; error: string; fieldErrors?: Record<string, string>; state?: InvitationState }> {
  const inv = await findInvitation(token);
  if (!inv) return { ok: false, error: "Ce lien n'est pas valable.", state: "UNKNOWN" };
  const now = nowOf(deps);
  const state = stateOf(inv, now);
  if (state !== "VALID") return { ok: false, error: state === "EXPIRED" ? "Ce lien a expiré : demandez-en un nouveau à PharmaBoost." : state === "USED" ? "Ce dossier a déjà été complété." : "Ce lien n'est plus valable.", state };

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: "Vérifiez les champs signalés.", fieldErrors };
  }
  const d = parsed.data;
  const ownerEmail = normalizeEmail(d.ownerEmail)!;
  const siret = normalizeSiret(d.siret)!;
  const next = {
    name: d.name,
    legalName: d.legalName,
    siret,
    finessNumber: d.finessNumber ? d.finessNumber.replace(/\s/g, "") : null,
    addressLine1: d.addressLine1,
    postalCode: normalizePostalCode(d.postalCode),
    city: d.city,
    phone: d.phone ? normalizePhone(d.phone) ?? d.phone : null,
    contactEmail: d.contactEmail ? normalizeEmail(d.contactEmail) : null,
    ownerName: `${d.ownerFirstName} ${d.ownerLastName}`.trim(),
    ownerTitle: d.ownerTitle || null,
    email: ownerEmail,
    postCount: d.postCount,
    lgo: d.lgo || null,
  };

  // L'adresse du représentant devient son futur identifiant : elle ne doit appartenir à aucun autre compte.
  const account = await prisma.user.findFirst({ where: { email: { equals: ownerEmail, mode: "insensitive" }, deletedAt: null }, select: { id: true } });
  if (account) return { ok: false, error: "Cette adresse est déjà utilisée par un compte PharmaBoost.", fieldErrors: { ownerEmail: "Adresse déjà utilisée par un compte PharmaBoost." } };

  const before = inv.prospect;
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => String(before[k] ?? "") !== String(next[k] ?? ""));

  // Même SIRET déjà connu ailleurs : rien n'est fusionné ni créé, l'équipe est prévenue.
  const [samePharmacy, sameProspect] = await Promise.all([
    prisma.pharmacy.findFirst({ where: { siret, isDemo: false }, select: { id: true, name: true } }),
    prisma.prospect.findFirst({ where: { siret, id: { not: inv.prospectId }, status: { not: "LOST" } }, select: { id: true, name: true } }),
  ]);
  const duplicate = samePharmacy ? `SIRET déjà utilisé par l'officine cliente « ${samePharmacy.name} ».` : sameProspect ? `SIRET déjà présent sur le dossier « ${sameProspect.name} ».` : null;

  await prisma.$transaction([
    prisma.prospect.update({ where: { id: inv.prospectId }, data: { ...next, duplicateWarning: duplicate, lastContactAt: now, nextActionLabel: duplicate ? "Vérifier le doublon de SIRET avant le contrat" : "Envoyer le contrat", nextActionAt: now } }),
    prisma.pharmacyInvitation.update({ where: { id: inv.id }, data: { completedAt: now } }),
  ]);

  const actor: SalesActor = { type: "SYSTEM", label: `${next.ownerName} (titulaire)` };
  await recordProspectEvent({
    prospectId: inv.prospectId,
    type: "STATUS_CHANGED",
    summary: `Dossier complété par le titulaire : ${changed.map((k) => FIELD_LABELS[k] ?? k).join(", ") || "aucun changement"}.`,
    actor,
    metadata: { changed: Object.fromEntries(changed.map((k) => [k, { from: before[k] ?? null, to: next[k] ?? null }])) },
  });
  if (duplicate) {
    await recordProspectEvent({ prospectId: inv.prospectId, type: "DUPLICATE_SUSPECTED", summary: duplicate, actor, metadata: { pharmacyId: samePharmacy?.id ?? null, prospectId: sameProspect?.id ?? null } });
  }
  await recordAudit({ action: "onboarding.completed", entityType: "Prospect", entityId: inv.prospectId, metadata: { changed, duplicate: Boolean(duplicate) } });

  const missing = missingContractFields({ ...next });
  await notifyAdmins({
    type: "ONBOARDING_COMPLETED",
    title: `${next.name} : dossier complété par le titulaire`,
    body: duplicate ? `${duplicate} Vérifiez avant d'envoyer le contrat.` : missing.length ? "Des informations manquent encore pour le contrat." : `${next.postCount} poste${next.postCount > 1 ? "s" : ""}. Le contrat peut partir.`,
    linkUrl: `/admin/dossiers/${inv.prospectId}`,
    severity: duplicate ? "WARNING" : "SUCCESS",
  });

  const message = buildDossierReceivedEmail(await platformEmailContext(), { ownerName: d.ownerFirstName, pharmacyName: next.name });
  const messaging = deps?.messaging ?? getMessagingProvider();
  const outcome = await messaging
    .sendEmail({ to: ownerEmail, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html })
    .catch((error: unknown) => ({ status: "FAILED" as const, provider: messaging.info.id, detail: error instanceof Error ? error.message : "Envoi impossible." }));
  await recordDispatch({ kind: "DOSSIER_RECEIVED", recipient: ownerEmail, outcome, prospectId: inv.prospectId, invitationId: inv.id });

  return { ok: true, pharmacyName: next.name, contractReady: missing.length === 0 && !duplicate };
}

/** L'invitation en cours d'un dossier, pour la console : jamais le jeton. */
export async function invitationSummary(prospectId: string) {
  return prisma.pharmacyInvitation.findFirst({
    where: { prospectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, sentAt: true, sendCount: true, lastSendStatus: true, lastSendDetail: true, openedAt: true, completedAt: true, revokedAt: true, expiresAt: true },
  });
}
