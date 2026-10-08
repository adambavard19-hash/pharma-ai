import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";
import { traceDispatch } from "@/server/services/email-dispatch";
import { buildInstallationGuideEmail } from "@/core/platform/onboarding-emails";
import { DEFAULT_CONTACT_EMAIL } from "@/server/services/site-leads";
import { LGO_DEFINITIONS } from "@/core/stock/connectors";

/**
 * Le guide d'installation, envoyé au titulaire : automatiquement quand son
 * abonnement démarre, et à la demande depuis la console. C'est ce qui remplace
 * la visite d'un commercial : cinq étapes, faites par le titulaire lui-même.
 */
export async function sendInstallationGuide(pharmacyId: string, actor: { adminId?: string | null; reason: "SUBSCRIPTION_STARTED" | "ADMIN" }): Promise<{ status: string; detail: string; sentTo: string | null }> {
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: pharmacyId },
    select: { id: true, name: true, email: true, organizationId: true, memberships: { where: { role: "OWNER", isActive: true }, orderBy: [{ isPrincipal: "desc" }, { createdAt: "asc" }], take: 1, select: { user: { select: { firstName: true, lastName: true, email: true } } } } },
  });
  if (!pharmacy) return { status: "FAILED", detail: "Officine introuvable.", sentTo: null };
  const owner = pharmacy.memberships[0]?.user;
  const to = owner?.email ?? pharmacy.email;
  if (!to) return { status: "FAILED", detail: "Aucune adresse e-mail pour le titulaire.", sentTo: null };
  const [company, connection] = await Promise.all([
    prisma.companyProfile.findUnique({ where: { id: "default" }, select: { representativeEmail: true } }),
    prisma.stockConnection.findUnique({ where: { pharmacyId }, select: { lgo: true } }),
  ]);
  const lgo = connection ? LGO_DEFINITIONS.find((item) => item.id === connection.lgo) ?? null : null;
  const message = buildInstallationGuideEmail({
    ownerName: owner ? `${owner.firstName} ${owner.lastName}` : pharmacy.name,
    pharmacyName: pharmacy.name,
    appUrl: publicUrl("/"),
    contactEmail: company?.representativeEmail ?? DEFAULT_CONTACT_EMAIL,
    lgoLabel: lgo && lgo.id !== "autre" ? lgo.label : null,
    exportSteps: lgo?.exportSteps ?? [],
  });
  const outcome = await getMessagingProvider().sendEmail({ to, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html });
  // Le journal des e-mails garde chaque envoi du guide, réussi ou non.
  await traceDispatch({ kind: "INSTALL_GUIDE", recipient: to, outcome, subject: message.subject, trigger: "SYSTEM", pharmacyId: pharmacy.id, organizationId: pharmacy.organizationId, sentByAdminId: actor.adminId ?? null });
  await recordAudit({ action: "pharmacy.install_guide_sent", entityType: "Pharmacy", entityId: pharmacy.id, pharmacyId: pharmacy.id, platformAdminId: actor.adminId ?? null, metadata: { status: outcome.status, reason: actor.reason, provider: outcome.provider } });
  return { status: outcome.status, detail: outcome.detail, sentTo: to };
}
