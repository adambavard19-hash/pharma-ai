import "server-only";
import { prisma } from "@/server/db/client";
import { getRequestMeta } from "@/server/http/request-meta";

/**
 * Journal d'audit.
 *
 * Règle absolue : `metadata` ne contient jamais de donnée de santé en clair.
 * On y consigne des identifiants, des compteurs et des libellés d'action, pas
 * le contenu d'une ordonnance ni le profil médical d'un patient.
 */
export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.pharmacy_switched"
  | "patient.created"
  | "patient.updated"
  | "patient.deleted"
  | "patient.health_viewed"
  | "patient.health_updated"
  | "patient.consent_updated"
  | "product.created"
  | "product.updated"
  | "product.deleted"
  | "product.imported"
  | "stock.adjusted"
  | "prescription.created"
  | "prescription.verified"
  | "prescription.analyzed"
  | "prescription.safety_acknowledged"
  | "prescription.validated"
  | "prescription.deleted"
  | "recommendation.accepted"
  | "recommendation.modified"
  | "recommendation.replaced"
  | "recommendation.removed"
  | "recommendation.added_manually"
  | "recommendation.presented"
  | "recommendation.declined"
  | "rule.created"
  | "rule.deleted"
  | "document.generated"
  | "document.delivered"
  | "document.viewed"
  | "sale.created"
  | "team.member_invited"
  | "team.member_updated"
  | "team.member_disabled"
  | "settings.updated";

export async function recordAudit(params: {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  pharmacyId?: string | null;
  userId?: string | null;
  platformAdminId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const meta = await getRequestMeta();

    await prisma.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        pharmacyId: params.pharmacyId ?? null,
        userId: params.userId ?? null,
        platformAdminId: params.platformAdminId ?? null,
        metadata: (params.metadata ?? {}) as never,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
  } catch (error) {
    // L'audit ne doit jamais faire échouer l'action métier ; on trace côté
    // serveur pour ne pas perdre l'information silencieusement.
    console.error("[audit] écriture impossible", params.action, error);
  }
}
