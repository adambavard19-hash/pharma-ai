import "server-only";
import { prisma } from "@/server/db/client";
import { PERMISSIONS } from "@/server/rbac/permissions";
import type { SessionContext } from "@/server/auth/session";
import { formatCents } from "@/lib/format";

export type SearchResult = {
  type: "patient" | "prescription" | "product" | "user";
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  href: string;
};

/**
 * Recherche globale.
 *
 * Toutes les requêtes sont filtrées par `pharmacyId` issu de la session, et
 * chaque famille de résultats est conditionnée à la permission correspondante :
 * un préparateur sans accès aux ordonnances n'en verra aucune ici non plus.
 */
export async function globalSearch(
  session: SessionContext,
  rawQuery: string,
): Promise<SearchResult[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const { pharmacyId } = session.scope;
  const contains = { contains: query, mode: "insensitive" as const };
  const results: SearchResult[] = [];

  const tasks: Promise<void>[] = [];

  if (session.permissions.has(PERMISSIONS.PATIENT_VIEW)) {
    tasks.push(
      prisma.patient
        .findMany({
          where: {
            pharmacyId,
            deletedAt: null,
            OR: [
              { firstName: contains },
              { lastName: contains },
              { reference: contains },
              { email: contains },
              { phone: contains },
            ],
          },
          take: 5,
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            reference: true,
            city: true,
          },
        })
        .then((patients) => {
          for (const patient of patients) {
            results.push({
              type: "patient",
              id: patient.id,
              title: `${patient.firstName} ${patient.lastName.toUpperCase()}`,
              subtitle: patient.city,
              badge: patient.reference,
              href: `/patients/${patient.id}`,
            });
          }
        }),
    );
  }

  if (session.permissions.has(PERMISSIONS.PRESCRIPTION_VIEW)) {
    tasks.push(
      prisma.prescription
        .findMany({
          where: {
            pharmacyId,
            deletedAt: null,
            OR: [
              { reference: contains },
              { prescriberName: contains },
              { patient: { lastName: contains } },
              { patient: { firstName: contains } },
              { lines: { some: { drugName: contains } } },
            ],
          },
          take: 5,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            reference: true,
            status: true,
            createdAt: true,
            patient: { select: { firstName: true, lastName: true } },
          },
        })
        .then((prescriptions) => {
          for (const prescription of prescriptions) {
            results.push({
              type: "prescription",
              id: prescription.id,
              title: prescription.reference,
              subtitle: prescription.patient
                ? `${prescription.patient.firstName} ${prescription.patient.lastName.toUpperCase()}`
                : "Patient non rattaché",
              badge: PRESCRIPTION_STATUS_SHORT[prescription.status] ?? null,
              href: `/vente/${prescription.id}`,
            });
          }
        }),
    );
  }

  if (session.permissions.has(PERMISSIONS.PRODUCT_VIEW)) {
    tasks.push(
      prisma.product
        .findMany({
          where: {
            pharmacyId,
            deletedAt: null,
            OR: [
              { name: contains },
              { brand: contains },
              { reference: contains },
              { ean: contains },
            ],
          },
          take: 5,
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            brand: true,
            reference: true,
            salePriceCents: true,
          },
        })
        .then((products) => {
          for (const product of products) {
            results.push({
              type: "product",
              id: product.id,
              title: product.name,
              subtitle: product.brand ?? product.reference,
              badge: formatCents(product.salePriceCents),
              href: `/stock/${product.id}`,
            });
          }
        }),
    );
  }

  if (session.permissions.has(PERMISSIONS.TEAM_VIEW)) {
    tasks.push(
      prisma.membership
        .findMany({
          where: {
            pharmacyId,
            isActive: true,
            user: {
              deletedAt: null,
              OR: [{ firstName: contains }, { lastName: contains }, { email: contains }],
            },
          },
          take: 4,
          select: {
            role: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        })
        .then((memberships) => {
          for (const membership of memberships) {
            results.push({
              type: "user",
              id: membership.user.id,
              title: `${membership.user.firstName} ${membership.user.lastName}`,
              subtitle: membership.user.email,
              badge: null,
              href: `/parametres/equipe#${membership.user.id}`,
            });
          }
        }),
    );
  }

  await Promise.all(tasks);
  return results;
}

const PRESCRIPTION_STATUS_SHORT: Record<string, string> = {
  DRAFT: "Brouillon",
  EXTRACTING: "Extraction",
  NEEDS_VERIFICATION: "À vérifier",
  VERIFIED: "Vérifiée",
  ANALYZING: "Analyse",
  ANALYZED: "Analysée",
  VALIDATED: "Validée",
  DELIVERED: "Délivrée",
  CANCELLED: "Annulée",
  FAILED: "Échec",
};
