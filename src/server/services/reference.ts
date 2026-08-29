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
  const select = {
    status: true,
    startedAt: true,
    finishedAt: true,
    sourceUpdatedAt: true,
    error: true,
  } as const;

  // Deux lectures et non une : l'état du catalogue est celui du dernier import
  // RÉUSSI. Un échec postérieur est une alerte à afficher, pas une raison de
  // déclarer absent un catalogue qui est toujours là.
  const [lastImport, lastSuccess] = await Promise.all([
    prisma.referenceImport.findFirst({
      where: { isDryRun: false },
      orderBy: { startedAt: "desc" },
      select,
    }),
    prisma.referenceImport.findFirst({
      where: { isDryRun: false, status: "SUCCEEDED" },
      orderBy: { startedAt: "desc" },
      select,
    }),
  ]);

  if (!lastImport) return { status: "NOT_IMPORTED" };

  if (!lastSuccess) {
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

  const ageDays = referenceAgeDays(lastSuccess.sourceUpdatedAt, new Date());

  return {
    status: isReferenceStale(ageDays) ? "STALE" : "READY",
    sourceUpdatedAt: lastSuccess.sourceUpdatedAt?.toISOString() ?? null,
    importedAt: (lastSuccess.finishedAt ?? lastSuccess.startedAt).toISOString(),
    ageDays,
    counts: { specialties, presentations, substances },
    lastFailure:
      lastImport.status === "SUCCEEDED"
        ? null
        : { attemptedAt: lastImport.startedAt.toISOString(), error: lastImport.error },
  };
}
