import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { recordProspectEvent } from "@/server/services/sales/events";
import { notifyAdmins, notifySalesRep } from "@/server/services/sales/notifications";
import { traceDispatch } from "@/server/services/email-dispatch";
import { DEFAULT_CONTACT_EMAIL } from "@/server/services/site-leads";
import { buildRecommendationAcknowledgement, buildRecommendationAlert, type RecommendationSummary } from "@/core/platform/site-emails";
import { AFFILIATE_SIGNUP_BONUS_CENTS } from "@/core/affiliation/terms";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import type { Recommendation } from "@/core/site/recommendation-form";

/**
 * « Recommander une pharmacie » (page Affiliation, fondateur 20 oct. 2026) : la pharmacie que l'apporteur nous écrit
 * devient un dossier du pipeline, la console le voit, l'équipe est prévenue, l'apporteur reçoit un accusé.
 *
 * L'apporteur déjà inscrit comme affilié (même adresse e-mail, compte actif) se voit attribuer le dossier : sa prime de
 * 100 € est alors calculée toute seule, une fois la mise en service réglée (`createSignupBonuses`). Sinon, ses
 * coordonnées sont écrites dans le dossier et l'équipe lui verse la prime si la pharmacie signe. Rien n'est envoyé à la
 * pharmacie : c'est l'équipe qui la contacte.
 */
export async function receivePharmacyRecommendation(input: Recommendation): Promise<{ prospectId: string; acknowledged: boolean }> {
  const bonus = formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS);
  const affiliate = await prisma.salesRep.findFirst({
    where: { email: { equals: input.referrerEmail, mode: "insensitive" }, commissionType: "AFFILIATE", isActive: true },
    select: { id: true, firstName: true, lastName: true },
  });
  const affiliateName = affiliate ? `${affiliate.firstName} ${affiliate.lastName}`.trim() : null;
  const contactName = input.contactName || null;
  const contactPhone = input.contactPhone || null;
  const message = input.message || null;
  const notes = [
    "Pharmacie recommandée depuis la page Affiliation",
    `Apportée par : ${input.referrerName} · ${input.referrerEmail} · ${input.referrerPhone}${affiliateName ? " (affilié inscrit)" : ""}`,
    `Prime d'apport : ${bonus} HT si la pharmacie signe et règle sa mise en service`,
    message ? `Message : ${message}` : null,
  ].filter(Boolean).join("\n");

  const prospect = await prisma.prospect.create({
    data: {
      name: input.pharmacyName,
      origin: "SELF_SERVICE_SITE",
      ownerName: contactName,
      phone: contactPhone,
      city: input.city,
      status: "PROSPECT",
      lastContactAt: new Date(),
      nextActionAt: new Date(Date.now() + 24 * 3600 * 1000),
      nextActionLabel: "Appeler la pharmacie recommandée pour proposer une démonstration",
      notes,
      salesRepId: affiliate?.id ?? null,
    },
    select: { id: true },
  });

  const actor = { type: "SYSTEM" as const, label: "Site public" };
  await recordProspectEvent({ prospectId: prospect.id, type: "CREATED", summary: `Pharmacie recommandée par ${input.referrerName}`, actor, metadata: { kind: "RECOMMENDATION", affiliate: Boolean(affiliate) } });
  const adminUrl = publicUrl(`/admin/dossiers/${prospect.id}`);
  await notifyAdmins({ type: "SITE_LEAD", title: `Pharmacie recommandée — ${input.pharmacyName}`, body: `${input.city} · apportée par ${input.referrerName} (${input.referrerEmail})`, linkUrl: `/admin/dossiers/${prospect.id}`, severity: "INFO" });
  if (affiliate) {
    await notifySalesRep({ salesRepId: affiliate.id, type: "SITE_LEAD", title: `Pharmacie reçue : ${input.pharmacyName}`, body: `Si elle signe, votre prime de ${bonus} HT est acquise dès sa mise en service réglée.`, linkUrl: `/extranet/dossiers/${prospect.id}`, severity: "INFO" }).catch(() => undefined);
  }

  const company = await prisma.companyProfile.findUnique({ where: { id: "default" }, select: { representativeEmail: true } });
  const contactEmail = company?.representativeEmail ?? DEFAULT_CONTACT_EMAIL;
  const summary: RecommendationSummary = { ...input, contactName, contactPhone, message, bonus, affiliateName };
  const messaging = getMessagingProvider();
  const alert = buildRecommendationAlert({ ...summary, adminUrl });
  const alertOutcome = await messaging.sendEmail({ to: contactEmail, fromName: "PharmaBoost", subject: alert.subject, text: alert.text, html: alert.html });
  await traceDispatch({ kind: "RECOMMENDATION_ALERT", recipient: contactEmail, outcome: alertOutcome, subject: alert.subject, trigger: "SYSTEM", prospectId: prospect.id });
  // Chaque pharmacie recommandée est aussi annoncée par e-mail à chaque administrateur de la console, comme une démo réservée
  // (fondateur, 21 oct. 2026 : l'alerte n'arrivait qu'à l'adresse de contact).
  const admins = await Promise.resolve()
    .then(() => prisma.platformAdmin.findMany({ where: { isActive: true }, select: { email: true } }))
    .catch(() => [] as { email: string }[]);
  for (const admin of admins) {
    if (admin.email.toLowerCase() === contactEmail.toLowerCase()) continue;
    const adminOutcome = await messaging.sendEmail({ to: admin.email, fromName: "PharmaBoost", subject: alert.subject, text: alert.text, html: alert.html }).catch(() => null);
    if (adminOutcome) await traceDispatch({ kind: "RECOMMENDATION_ALERT", recipient: admin.email, outcome: adminOutcome, subject: alert.subject, trigger: "SYSTEM", prospectId: prospect.id });
  }
  const ack = buildRecommendationAcknowledgement({ ...summary, contactEmail });
  const outcome = await messaging.sendEmail({ to: input.referrerEmail, fromName: "PharmaBoost", subject: ack.subject, text: ack.text, html: ack.html });
  await traceDispatch({ kind: "SITE_LEAD_ACK", recipient: input.referrerEmail, outcome, subject: ack.subject, trigger: "SYSTEM", prospectId: prospect.id });
  return { prospectId: prospect.id, acknowledged: outcome.status === "SENT" };
}
