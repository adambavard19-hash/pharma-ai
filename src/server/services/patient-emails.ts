import "server-only";
import { prisma } from "@/server/db/client";
import { activityScope } from "@/server/db/demo-scope";
import type { TenantScope } from "@/server/db/tenant";
import { patientEmailState, type PatientEmailState } from "@/core/counter/patient-emails";

/**
 * « E-mails aux patients » : les bilans demandés au comptoir (le patient a donné son accord) dans l'officine de la session.
 * Rien de nominatif : l'adresse est effacée après l'envoi et n'est jamais lue ici (voir core/counter/patient-emails.ts).
 */

export type PatientEmailRow = {
  saleId: string;
  reference: string;
  /** Quand le bilan est parti (ou la vente s'est terminée, ou l'accord a été donné, à défaut). */
  at: Date;
  comptoir: string | null;
  person: string | null;
  /** Les produits déclarés vendus : ceux que le bilan reprend. */
  products: string[];
  state: PatientEmailState;
};

const LIMIT = 200;

/**
 * `handledBy` : ne garder que les ventes de cette personne (un collaborateur voit les bilans de SES ventes — celles qu'il a
 * traitées, ou bipées au comptoir qui lui est attribué). Absent : toute l'officine (le titulaire).
 */
export async function listPatientEmails(scope: TenantScope, options: { days: number; states: readonly PatientEmailState[] | null; now?: Date; handledBy?: string }): Promise<{ rows: PatientEmailRow[]; total: number; truncated: boolean }> {
  const followUps = await prisma.counterSaleFollowUp.findMany({
    where: {
      pharmacyId: scope.pharmacyId,
      OR: [{ consentAt: { not: null } }, { reportStatus: { in: ["SENT", "SIMULATED", "FAILED"] } }],
      updatedAt: { gte: new Date((options.now ?? new Date()).getTime() - options.days * 86_400_000) },
      prescription: { pharmacyId: scope.pharmacyId, deletedAt: null, ...activityScope(scope), ...(options.handledBy !== undefined ? { handledByUserId: options.handledBy } : {}) },
    },
    orderBy: { updatedAt: "desc" },
    take: LIMIT + 1,
    select: {
      consentAt: true,
      closedAt: true,
      closedPost: true,
      reportStatus: true,
      reportSentAt: true,
      prescription: {
        select: {
          id: true,
          reference: true,
          counterPost: true,
          handledByUserId: true,
          recommendations: { where: { status: "PURCHASED" }, select: { product: { select: { name: true } }, presentation: { select: { specialty: { select: { name: true } } } } } },
        },
      },
    },
  });
  const truncated = followUps.length > LIMIT;
  const kept = followUps.slice(0, LIMIT);
  const userIds = [...new Set(kept.map((row) => row.prescription.handledByUserId).filter((id): id is string => Boolean(id)))];
  // Les personnes de CETTE officine seulement : un identifiant étranger ne donne aucun nom.
  const members = userIds.length ? await prisma.membership.findMany({ where: { pharmacyId: scope.pharmacyId, userId: { in: userIds } }, select: { user: { select: { id: true, firstName: true, lastName: true } } } }) : [];
  const names = new Map(members.map(({ user }) => [user.id, `${user.firstName} ${user.lastName}`.trim()]));

  const rows = kept
    .map((row): PatientEmailRow => ({
      saleId: row.prescription.id,
      reference: row.prescription.reference,
      at: row.reportSentAt ?? row.closedAt ?? row.consentAt ?? new Date(0),
      comptoir: row.closedPost ?? row.prescription.counterPost ?? null,
      person: row.prescription.handledByUserId ? (names.get(row.prescription.handledByUserId) ?? null) : null,
      products: [...new Set(row.prescription.recommendations.map((rec) => rec.product?.name ?? rec.presentation?.specialty.name.split(",")[0].trim()).filter((name): name is string => Boolean(name)))],
      state: patientEmailState(row),
    }))
    .filter((row) => !options.states || options.states.includes(row.state));
  return { rows, total: rows.length, truncated };
}
