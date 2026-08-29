import "server-only";
import { prisma } from "@/server/db/client";
import {
  isReferenceStale,
  referenceAgeDays,
  type ReferenceCatalogState,
} from "@/core/reference";

/**
 * L'état du catalogue national.
 *
 * Le catalogue est partagé par toutes les officines : cette lecture n'est donc
 * pas rattachée à un tenant. Elle répond à une seule question, celle que la
 * licence BDPM impose de pouvoir afficher — d'où viennent ces données, et de
 * quand datent-elles ?
 */
export async function getReferenceCatalogState(): Promise<ReferenceCatalogState> {
  const lastImport = await prisma.referenceImport.findFirst({
    where: { isDryRun: false },
    orderBy: { startedAt: "desc" },
    select: {
      status: true,
      startedAt: true,
      finishedAt: true,
      sourceUpdatedAt: true,
      error: true,
    },
  });

  if (!lastImport) return { status: "NOT_IMPORTED" };

  if (lastImport.status !== "SUCCEEDED") {
    return {
      status: "FAILED",
      attemptedAt: lastImport.startedAt.toISOString(),
      error: lastImport.error,
    };
  }

  const [specialties, presentations, substances] = await Promise.all([
    prisma.drugSpecialty.count({ where: { withdrawnAt: null } }),
    prisma.drugPresentation.count({ where: { withdrawnAt: null } }),
    prisma.drugSubstance.count(),
  ]);

  const ageDays = referenceAgeDays(lastImport.sourceUpdatedAt, new Date());

  return {
    status: isReferenceStale(ageDays) ? "STALE" : "READY",
    sourceUpdatedAt: lastImport.sourceUpdatedAt?.toISOString() ?? null,
    importedAt: (lastImport.finishedAt ?? lastImport.startedAt).toISOString(),
    ageDays,
    counts: { specialties, presentations, substances },
  };
}
