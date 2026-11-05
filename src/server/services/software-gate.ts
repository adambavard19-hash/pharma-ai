import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { notifyAdmins } from "@/server/services/sales/notifications";

/**
 * Le logiciel après le paiement (fondateur, 5 nov. 2026) : « ils recevront le logiciel PharmaBoost à installer quand ils
 * auront signé et payé, et surtout pas avant, à moins que j'en aie décidé le contraire depuis mon espace de gestion ».
 *
 * Une officine née des nouveaux parcours (souscription du site, lien de bienvenue après une démo) porte `softwareGate` :
 * tant que `softwareUnlockedAt` est vide, ni l'installateur des postes ni l'archive du serveur ne se téléchargent, et le
 * guide d'installation ne part pas. Le déblocage vient de la première facture PAYÉE (Stripe), ou d'un clic du fondateur
 * dans la console (« Débloquer le logiciel maintenant »). Les officines d'avant ne sont jamais bloquées.
 */

export const SOFTWARE_LOCKED_MESSAGE = "PharmaBoost se télécharge dès que votre abonnement est réglé. Vous recevrez le lien par e-mail juste après le paiement.";

export async function softwareAvailable(pharmacyId: string): Promise<boolean> {
  const row = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { softwareGate: true, softwareUnlockedAt: true } });
  return !row || !row.softwareGate || row.softwareUnlockedAt !== null;
}

/**
 * Débloque le logiciel d'une officine, une seule fois, et lui envoie le guide d'installation (le lien du logiciel).
 * Rend `true` si ce déblocage est le premier. Jamais bloquant pour l'appelant (webhook de paiement, bouton de la console).
 */
export async function unlockSoftware(pharmacyId: string, by: { reason: "PAID" | "ADMIN"; adminId?: string | null }): Promise<boolean> {
  const now = new Date();
  const won = await prisma.pharmacy.updateMany({ where: { id: pharmacyId, softwareGate: true, softwareUnlockedAt: null }, data: { softwareUnlockedAt: now } });
  if (won.count === 0) return false;
  await recordAudit({ action: "pharmacy.software_unlocked", entityType: "Pharmacy", entityId: pharmacyId, pharmacyId, platformAdminId: by.adminId ?? null, metadata: { reason: by.reason } });
  // Le titulaire de la souscription du site n'a pas encore son accès (l'accueil attendait le paiement) : il le reçoit maintenant.
  const owner = await prisma.membership.findFirst({ where: { pharmacyId, role: "OWNER", isActive: true }, orderBy: [{ isPrincipal: "desc" }, { createdAt: "asc" }], select: { user: { select: { id: true, lastLoginAt: true } } } });
  if (owner && !owner.user.lastLoginAt) {
    const { sendUserPasswordLink } = await import("@/server/services/user-password");
    await sendUserPasswordLink(owner.user.id, "welcome").catch((error) => console.error("[logiciel] accueil du titulaire non envoyé", error));
  }
  const { sendInstallationGuide } = await import("@/server/services/platform-onboarding");
  const guide = await sendInstallationGuide(pharmacyId, { adminId: by.adminId ?? null, reason: by.reason === "ADMIN" ? "ADMIN" : "SUBSCRIPTION_PAID" }).catch((error: unknown) => ({ status: "FAILED", detail: error instanceof Error ? error.message : "envoi impossible", sentTo: null }));
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { name: true } });
  await notifyAdmins({
    type: "SOFTWARE_UNLOCKED",
    title: `${pharmacy?.name ?? "Officine"} : logiciel débloqué`,
    body: `${by.reason === "PAID" ? "Première facture payée" : "Débloqué depuis la console"} : ${guide.status === "SENT" ? `le lien du logiciel est parti à ${guide.sentTo}` : `le guide d'installation n'est PAS parti (${guide.detail})`}.`,
    linkUrl: `/admin/abonnements/${pharmacyId}`,
    severity: guide.status === "SENT" ? "SUCCESS" : "WARNING",
  });
  return true;
}

/** Après un paiement reçu : débloque le logiciel des officines de l'organisation qui l'attendaient. */
export async function unlockSoftwareAfterPayment(organizationId: string): Promise<void> {
  const waiting = await prisma.pharmacy.findMany({ where: { organizationId, softwareGate: true, softwareUnlockedAt: null }, select: { id: true } });
  for (const pharmacy of waiting) await unlockSoftware(pharmacy.id, { reason: "PAID" }).catch((error) => console.error("[logiciel] déblocage après paiement impossible", error));
}
