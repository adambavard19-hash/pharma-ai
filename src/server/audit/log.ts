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
  | "auth.password_link_sent"
  | "auth.password_set"
  | "auth.password_changed"
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
  | "drug_stock.adjusted"
  | "drug_stock.removed"
  | "drug_stock.imported"
  | "prescription.created"
  | "prescription.verified"
  | "prescription.line_identified"
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
  | "recommendation.reopened"
  | "opportunity.answered"
  | "team.member_created"
  | "team.member_enabled"
  | "team.member_disabled"
  | "team.member_role_changed"
  | "team.member_password_reset"
  | "platform.pharmacy_created"
  | "platform.pharmacy_updated"
  | "platform.pharmacy_status_changed"
  | "platform.owner_created"
  | "rule.created"
  | "rule.deleted"
  | "document.generated"
  | "document.delivered"
  | "document.viewed"
  | "reminder.scheduled"
  | "reminder.sent"
  | "reminder.snoozed"
  | "reminder.cancelled"
  | "reminder.opted_out"
  | "reminder.answered"
  | "reminder.handled"
  | "sale.created"
  | "team.member_invited"
  | "team.member_updated"
  | "team.member_disabled"
  | "settings.updated"
  | "sales.rep_created"
  | "sales.rep_updated"
  | "sales.rep_invited"
  | "sales.prospect_created"
  | "sales.prospect_updated"
  | "sales.prospect_status_changed"
  | "sales.prospect_reassigned"
  | "sales.prospect_blocked"
  | "sales.contract_generated"
  | "sales.contract_sent"
  | "sales.contract_signature_recorded"
  | "sales.contract_event"
  | "sales.pharmacy_created"
  | "sales.commission_updated"
  | "sales.company_profile_updated";

export async function recordAudit(params: {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  pharmacyId?: string | null;
  userId?: string | null;
  platformAdminId?: string | null;
  /** Commercial à l'origine de l'action, pour l'extranet. */
  salesRepId?: string | null;
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
        metadata: ({ ...(params.metadata ?? {}), ...(params.salesRepId ? { salesRepId: params.salesRepId } : {}) }) as never,
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
