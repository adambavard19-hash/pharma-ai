import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { getMessagingProvider } from "@/server/ai/registry";
import { traceDispatch } from "@/server/services/email-dispatch";
import { platformEmailContext } from "@/server/services/email-context";
import { publicUrl } from "@/server/public-url";
import { encryptField, decryptField } from "@/server/security/encryption";
import { hashEmail, openToken, sealToken, signPayload, verifyPayload } from "@/server/security/tokens";
import { maskEmail } from "@/core/counter/patient-report";
import { UNIVERSES, isUniverseKey } from "@/config/universes";
import { buildPartnerEmail, PARTNER_CONSENT_TEXT } from "@/core/partners/patient-email";

/**
 * Les e-mails partenaires aux patients (17 oct. 2026).
 *
 * 1. L'ACCORD : le bilan e-mail porte un lien « Recevoir les offres de nos marques partenaires ». Le lien contient, chiffrés, l'adresse,
 *    l'officine et les univers des produits achetés (rien n'est gardé tant que le patient n'a pas agi). Sur la page, le patient coche
 *    la case puis confirme : son accord est enregistré, adresse chiffrée. Sans ce geste, jamais d'e-mail partenaire.
 * 2. LES CAMPAGNES : écrites dans la console (Partenaires → E-mails patients) : une marque, un message, un lien d'affiliation, des univers.
 *    L'envoi va aux patients qui ont donné leur accord et dont les achats touchent ces univers ; un même patient reçoit au plus un
 *    e-mail partenaire par semaine. Jamais de médicament : seuls les univers de parapharmacie et de compléments existent ici.
 * 3. LE CLIC : le lien de l'e-mail passe par PharmaBoost (/go/<envoi>), qui compte le clic puis renvoie vers le lien d'affiliation.
 * 4. LA DÉSINSCRIPTION : un lien dans chaque e-mail ; l'adresse est alors effacée.
 */

const DAY_MS = 86_400_000;
const CONSENT_PURPOSE = "offres-partenaires";
const UNSUBSCRIBE_KIND = "offres-partenaires-stop";
/** Au plus un e-mail partenaire par patient et par semaine. */
export const PARTNER_EMAIL_MIN_GAP_MS = 7 * DAY_MS;
const SEND_BATCH = 500;

/** Les univers des produits vendus (par leur catégorie), pour l'accord : jamais un médicament. */
export function universesOf(categories: (string | null | undefined)[]): string[] {
  const keys = new Set<string>();
  for (const category of categories) for (const universe of UNIVERSES) if (category && universe.categories.includes(category as never)) keys.add(universe.key);
  return [...keys];
}

/** Le lien de l'accord, mis dans le bilan : l'adresse y est chiffrée, rien n'est enregistré avant le geste du patient. Valable 60 jours. */
export function partnerConsentUrl(input: { email: string; pharmacyId: string; universes: string[] }): string {
  const token = sealToken(CONSENT_PURPOSE, { e: input.email.trim().toLowerCase(), p: input.pharmacyId, u: input.universes.filter(isUniverseKey).slice(0, 12) }, 60 * DAY_MS);
  return publicUrl(`/offres-partenaires/${encodeURIComponent(token)}`);
}

type ConsentToken = { e?: unknown; p?: unknown; u?: unknown };

function readConsentToken(token: string): { email: string; pharmacyId: string | null; universes: string[] } | null {
  const payload = openToken<ConsentToken>(CONSENT_PURPOSE, token);
  if (!payload || typeof payload.e !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.e)) return null;
  return { email: payload.e, pharmacyId: typeof payload.p === "string" ? payload.p : null, universes: Array.isArray(payload.u) ? payload.u.filter((u): u is string => typeof u === "string" && isUniverseKey(u)) : [] };
}

/** La page de l'accord : le lien est-il valable, l'adresse déjà inscrite ? Rien n'est écrit (un antivirus visite les liens). */
export async function peekPartnerConsent(token: string): Promise<{ masked: string; subscribed: boolean } | null> {
  const data = readConsentToken(token);
  if (!data) return null;
  const existing = await prisma.patientPartnerConsent.findUnique({ where: { emailHash: hashEmail(data.email) }, select: { unsubscribedAt: true } });
  return { masked: maskEmail(data.email), subscribed: Boolean(existing && !existing.unsubscribedAt) };
}

/** Le patient a coché la case et confirmé : l'accord est enregistré (ou renouvelé), adresse chiffrée, univers ajoutés. */
export async function givePartnerConsent(token: string, checked: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!checked) return { ok: false, error: "Cochez la case pour confirmer votre accord." };
  const data = readConsentToken(token);
  if (!data) return { ok: false, error: "Ce lien n'est plus valable." };
  const emailHash = hashEmail(data.email);
  const now = new Date();
  const existing = await prisma.patientPartnerConsent.findUnique({ where: { emailHash }, select: { interests: true } });
  const interests = [...new Set([...(existing?.interests ?? []), ...data.universes])];
  const consent = await prisma.patientPartnerConsent.upsert({
    where: { emailHash },
    create: { emailHash, emailEncrypted: encryptField(data.email), pharmacyId: data.pharmacyId, interests, consentText: PARTNER_CONSENT_TEXT, consentAt: now },
    update: { emailEncrypted: encryptField(data.email), interests, consentText: PARTNER_CONSENT_TEXT, consentAt: now, unsubscribedAt: null },
    select: { id: true },
  });
  await recordAudit({ action: "partner_consent.given", entityType: "PatientPartnerConsent", entityId: consent.id, pharmacyId: data.pharmacyId ?? undefined, metadata: { to: maskEmail(data.email), interests } });
  return { ok: true };
}

export function partnerUnsubscribeUrl(consentId: string): string {
  return publicUrl(`/offres-partenaires/stop/${encodeURIComponent(signPayload({ c: consentId, k: UNSUBSCRIBE_KIND }, 400 * DAY_MS))}`);
}

function consentFromUnsubscribe(token: string): string | null {
  const payload = verifyPayload<{ c?: unknown; k?: unknown }>(token);
  return payload && payload.k === UNSUBSCRIBE_KIND && typeof payload.c === "string" ? payload.c : null;
}

export async function peekPartnerUnsubscribe(token: string): Promise<{ unsubscribed: boolean } | null> {
  const id = consentFromUnsubscribe(token);
  if (!id) return null;
  const consent = await prisma.patientPartnerConsent.findUnique({ where: { id }, select: { unsubscribedAt: true } });
  return consent ? { unsubscribed: Boolean(consent.unsubscribedAt) } : { unsubscribed: true };
}

/** Ne plus recevoir d'offres partenaires : l'accord est retiré et l'adresse effacée. */
export async function withdrawPartnerConsent(token: string): Promise<boolean> {
  const id = consentFromUnsubscribe(token);
  if (!id) return false;
  await prisma.patientPartnerConsent.updateMany({ where: { id }, data: { unsubscribedAt: new Date(), emailEncrypted: null } });
  await recordAudit({ action: "partner_consent.withdrawn", entityType: "PatientPartnerConsent", entityId: id });
  return true;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Les campagnes (console)                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export type CampaignInput = { brandId: string; subject: string; body: string; imageUrl: string | null; affiliateUrl: string; universes: string[] };

export function validateCampaign(input: CampaignInput): string | null {
  if (!input.brandId) return "Choisissez la marque.";
  if (input.subject.trim().length < 5 || input.subject.length > 120) return "L'objet fait de 5 à 120 caractères.";
  if (input.body.trim().length < 20 || input.body.length > 1500) return "Le message fait de 20 à 1 500 caractères.";
  if (!/^https:\/\/[^\s]+$/.test(input.affiliateUrl)) return "Le lien d'affiliation doit commencer par https://.";
  if (input.imageUrl && !/^https:\/\/[^\s]+$/.test(input.imageUrl)) return "L'image doit être une adresse https://.";
  if (input.universes.length === 0 || !input.universes.every(isUniverseKey)) return "Choisissez au moins un univers.";
  return null;
}

export async function saveCampaign(admin: { fullName: string }, input: CampaignInput & { id?: string | null }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const problem = validateCampaign(input);
  if (problem) return { ok: false, error: problem };
  const brand = await prisma.partnerBrand.findUnique({ where: { id: input.brandId }, select: { id: true } });
  if (!brand) return { ok: false, error: "Marque inconnue." };
  const data = { brandId: input.brandId, subject: input.subject.trim(), body: input.body.trim(), imageUrl: input.imageUrl?.trim() || null, affiliateUrl: input.affiliateUrl.trim(), universes: input.universes };
  if (input.id) {
    const updated = await prisma.partnerEmailCampaign.updateMany({ where: { id: input.id, status: "DRAFT" }, data });
    if (updated.count === 0) return { ok: false, error: "Cette campagne est déjà partie." };
    return { ok: true, id: input.id };
  }
  const created = await prisma.partnerEmailCampaign.create({ data: { ...data, createdByName: admin.fullName }, select: { id: true } });
  return { ok: true, id: created.id };
}

/** Les patients qu'une campagne toucherait maintenant : accord en cours, univers commun, pas d'e-mail partenaire depuis une semaine. */
function audienceWhere(universes: string[], now: Date) {
  return {
    unsubscribedAt: null,
    emailEncrypted: { not: null },
    interests: { hasSome: universes },
    OR: [{ lastSentAt: null }, { lastSentAt: { lt: new Date(now.getTime() - PARTNER_EMAIL_MIN_GAP_MS) } }],
  };
}

export async function campaignAudience(universes: string[], now = new Date()): Promise<number> {
  if (universes.length === 0) return 0;
  return prisma.patientPartnerConsent.count({ where: audienceWhere(universes, now) });
}

export async function listCampaigns() {
  const [campaigns, brands, consents] = await Promise.all([
    prisma.partnerEmailCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { brand: { select: { name: true } }, _count: { select: { sends: true } } } }),
    prisma.partnerBrand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, universes: true } }),
    prisma.patientPartnerConsent.count({ where: { unsubscribedAt: null } }),
  ]);
  const clicks = campaigns.length ? await prisma.partnerEmailSend.groupBy({ by: ["campaignId"], where: { campaignId: { in: campaigns.map((c) => c.id) }, clickedAt: { not: null } }, _count: { _all: true } }) : [];
  const clicksBy = new Map(clicks.map((row) => [row.campaignId, row._count._all]));
  const audiences = await Promise.all(campaigns.map((c) => (c.status === "DRAFT" ? campaignAudience(c.universes) : Promise.resolve(null))));
  return {
    consents,
    brands,
    campaigns: campaigns.map((c, i) => ({ id: c.id, brandId: c.brandId, brand: c.brand.name, subject: c.subject, body: c.body, imageUrl: c.imageUrl, affiliateUrl: c.affiliateUrl, universes: c.universes, status: c.status, sentAt: c.sentAt, recipients: c.recipients, clicks: clicksBy.get(c.id) ?? 0, audience: audiences[i], createdAt: c.createdAt })),
  };
}

/** Envoie une campagne aux patients concernés, une seule fois. */
export async function sendCampaign(campaignId: string, now = new Date(), options: { deadlineAt?: number } = {}): Promise<{ ok: true; sent: number; failed: number } | { ok: false; error: string }> {
  const claimed = await prisma.partnerEmailCampaign.updateMany({ where: { id: campaignId, status: "DRAFT" }, data: { status: "SENDING" } });
  if (claimed.count === 0) return { ok: false, error: "Cette campagne est déjà partie (ou en cours d'envoi)." };
  const campaign = await prisma.partnerEmailCampaign.findUniqueOrThrow({ where: { id: campaignId }, include: { brand: { select: { name: true, logoUrl: true } } } });
  const ctx = await platformEmailContext();
  const messaging = getMessagingProvider({ demo: false });
  let sent = 0;
  let failed = 0;
  for (;;) {
    if (options.deadlineAt && Date.now() > options.deadlineAt) break;
    const batch = await prisma.patientPartnerConsent.findMany({ where: { ...audienceWhere(campaign.universes, now), sends: { none: { campaignId } } }, take: SEND_BATCH, select: { id: true, emailEncrypted: true } });
    if (batch.length === 0) break;
    for (const consent of batch) {
      const email = decryptField(consent.emailEncrypted);
      const send = await prisma.partnerEmailSend.create({ data: { campaignId, consentId: consent.id, status: "PENDING" }, select: { id: true } });
      if (!email) {
        await prisma.partnerEmailSend.update({ where: { id: send.id }, data: { status: "FAILED" } });
        failed += 1;
        continue;
      }
      const mail = buildPartnerEmail({ brand: campaign.brand.name, brandLogo: campaign.brand.logoUrl, subject: campaign.subject, body: campaign.body, imageUrl: campaign.imageUrl, clickUrl: publicUrl(`/go/${send.id}`), unsubscribeUrl: partnerUnsubscribeUrl(consent.id) }, ctx);
      const outcome = await messaging
        .sendEmail({ to: email, fromName: `${campaign.brand.name} · PharmaBoost`, subject: mail.subject, text: mail.text, html: mail.html })
        .catch((error: unknown) => ({ status: "FAILED" as const, provider: messaging.info.id, detail: error instanceof Error ? error.message : "Envoi impossible." }));
      const ok = outcome.status !== "FAILED";
      await prisma.partnerEmailSend.update({ where: { id: send.id }, data: { status: ok ? "SENT" : "FAILED" } });
      if (ok) await prisma.patientPartnerConsent.update({ where: { id: consent.id }, data: { lastSentAt: now } });
      await traceDispatch({ kind: "PARTNER_PATIENT", recipient: maskEmail(email), outcome, subject: mail.subject, trigger: "MANUAL" });
      if (ok) sent += 1;
      else failed += 1;
    }
  }
  await prisma.partnerEmailCampaign.update({ where: { id: campaignId }, data: { status: "SENT", sentAt: now, recipients: sent } });
  await recordAudit({ action: "partner_campaign.sent", entityType: "PartnerEmailCampaign", entityId: campaignId, metadata: { sent, failed } });
  return { ok: true, sent, failed };
}

/** Le clic sur le lien de l'e-mail : compté, puis renvoi vers le lien d'affiliation de la marque. */
export async function trackPartnerClick(sendId: string): Promise<string | null> {
  const send = await prisma.partnerEmailSend.findUnique({ where: { id: sendId }, select: { id: true, clickedAt: true, campaign: { select: { affiliateUrl: true } } } });
  if (!send || !/^https:\/\//.test(send.campaign.affiliateUrl)) return null;
  await prisma.partnerEmailSend.update({ where: { id: send.id }, data: { clicks: { increment: 1 }, ...(send.clickedAt ? {} : { clickedAt: new Date() }) } });
  return send.campaign.affiliateUrl;
}
