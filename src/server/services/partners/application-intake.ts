import "server-only";
import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { PLATFORM_CONTACT_EMAIL, platformEmailContext } from "@/server/services/email-context";
import { buildPartnerApplicationAcknowledgement, buildPartnerApplicationAlert, type PartnerApplicationSummary } from "@/core/platform/partner-emails";

export type PartnerApplicationInput = PartnerApplicationSummary;

/**
 * Une candidature PharmaBoost Partenaires venue du site public.
 *
 * Elle devient une candidature « nouvelle » dans la console, l'équipe est
 * prévenue, le candidat reçoit un accusé de réception. RIEN d'autre n'est
 * créé : ni partenaire, ni marque, ni diffusion. Une candidature ne s'active
 * jamais seule, l'équipe l'étudie d'abord.
 *
 * Une fois la candidature enregistrée, une panne de notification ou
 * d'e-mail ne la fait pas échouer : le candidat ne doit pas la renvoyer, et
 * la console la montre de toute façon.
 */
export async function receivePartnerApplication(input: PartnerApplicationInput): Promise<{ applicationId: string; acknowledged: boolean }> {
  const application = await prisma.partnerApplication.create({
    data: {
      status: "NEW",
      company: input.company,
      brand: input.brand,
      contactFirstName: input.contactFirstName,
      contactLastName: input.contactLastName,
      contactRole: input.contactRole,
      email: input.email,
      phone: input.phone,
      website: input.website,
      universes: input.universes,
      approxReferences: input.approxReferences,
      distribution: input.distribution,
      hasApi: input.hasApi,
      hasB2bPortal: input.hasB2bPortal,
      hasCatalog: input.hasCatalog,
      hasTrainings: input.hasTrainings,
      message: input.message,
      // Le candidat a coché la case de consentement : c'est la condition de l'envoi.
      consentAt: new Date(),
      events: { create: { kind: "RECEIVED", toStatus: "NEW", note: "Candidature reçue depuis le site public." } },
    },
    select: { id: true },
  });
  const applicationId = application.id;
  const linkUrl = `/admin/partenaires/candidatures/${applicationId}`;

  await quietly("notification", () =>
    notifyAdmins({
      type: "PARTNER_APPLICATION",
      title: `Candidature partenaire — ${input.brand}`,
      body: `${input.company} · ${input.contactFirstName} ${input.contactLastName} · ${input.email}`,
      linkUrl,
      severity: "INFO",
    }),
  );

  let acknowledged = false;
  await quietly("e-mails", async () => {
    const [company, ctx] = await Promise.all([
      prisma.companyProfile.findUnique({ where: { id: "default" }, select: { representativeEmail: true } }),
      platformEmailContext(),
    ]);
    const teamEmail = company?.representativeEmail ?? PLATFORM_CONTACT_EMAIL;
    const messaging = getMessagingProvider();

    const alert = buildPartnerApplicationAlert(ctx, { ...input, adminUrl: publicUrl(linkUrl) });
    await messaging.sendEmail({ to: teamEmail, fromName: "PharmaBoost", subject: alert.subject, text: alert.text, html: alert.html });

    const ack = buildPartnerApplicationAcknowledgement(ctx, input);
    const outcome = await messaging.sendEmail({ to: input.email, fromName: "PharmaBoost", subject: ack.subject, text: ack.text, html: ack.html });
    if (outcome.status === "SENT") {
      await prisma.partnerApplication.update({ where: { id: applicationId }, data: { acknowledgedAt: new Date() } });
      acknowledged = true;
    }
  });

  // Aucune donnée personnelle dans le journal : l'identifiant suffit à retrouver la candidature.
  await recordAudit({
    action: "partner.application_received",
    entityType: "PartnerApplication",
    entityId: applicationId,
    metadata: { universes: input.universes, acknowledged },
  });

  return { applicationId, acknowledged };
}

async function quietly(step: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error(`[partenaires] candidature enregistrée, ${step} impossible`, error);
  }
}
