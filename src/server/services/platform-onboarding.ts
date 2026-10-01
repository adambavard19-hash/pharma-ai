import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";
import { buildInstallationGuideEmail } from "@/core/platform/onboarding-emails";
import { DEFAULT_CONTACT_EMAIL } from "@/server/services/site-leads";

/**
 * Le guide d'installation, envoyé au titulaire : automatiquement quand son
 * abonnement démarre, et à la demande depuis la console. C'est ce qui remplace
 * la visite d'un commercial : cinq étapes, faites par le titulaire lui-même.
 */
export async function sendInstallationGuide(pharmacyId: string, actor: { adminId?: string | null; reason: "SUBSCRIPTION_STARTED" | "ADMIN" }): Promise<{ status: string; detail: string; sentTo: string | null }> {
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: pharmacyId },
    select: { id: true, name: true, email: true, memberships: { where: { role: "OWNER", isActive: true }, take: 1, select: { user: { select: { firstName: true, lastName: true, email: true } } } } },
  });
  if (!pharmacy) return { status: "FAILED", detail: "Officine introuvable.", sentTo: null };
  const owner = pharmacy.memberships[0]?.user;
  const to = owner?.email ?? pharmacy.email;
  if (!to) return { status: "FAILED", detail: "Aucune adresse e-mail pour le titulaire.", sentTo: null };
  const company = await prisma.companyProfile.findUnique({ where: { id: "default" }, select: { representativeEmail: true } });
  const message = buildInstallationGuideEmail({
    ownerName: owner ? `${owner.firstName} ${owner.lastName}` : pharmacy.name,
    pharmacyName: pharmacy.name,
    appUrl: publicUrl("/"),
    contactEmail: company?.representativeEmail ?? DEFAULT_CONTACT_EMAIL,
  });
  const outcome = await getMessagingProvider().sendEmail({ to, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html });
  await recordAudit({ action: "pharmacy.install_guide_sent", entityType: "Pharmacy", entityId: pharmacy.id, pharmacyId: pharmacy.id, platformAdminId: actor.adminId ?? null, metadata: { status: outcome.status, reason: actor.reason, provider: outcome.provider } });
  return { status: outcome.status, detail: outcome.detail, sentTo: to };
}
