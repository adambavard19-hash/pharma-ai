import "server-only";
import { prisma } from "./client";

/**
 * Garde-fou d'isolation multi-tenant.
 *
 * Toute requête métier passe par un `TenantScope`. Le `pharmacyId` n'est jamais
 * lu depuis un paramètre d'URL ou un champ de formulaire : il provient
 * exclusivement de la session serveur (cf. `requireSession`). Une officine ne
 * peut donc pas, même en forgeant une requête, atteindre les données d'une
 * autre.
 */
export type TenantScope = {
  readonly pharmacyId: string;
  readonly organizationId: string;
  readonly userId: string;
};

export class TenantIsolationError extends Error {
  constructor(entity: string, id: string) {
    super(
      `Accès refusé : la ressource ${entity} (${id}) n'appartient pas à l'officine courante.`,
    );
    this.name = "TenantIsolationError";
  }
}

/** Filtre à injecter dans tout `where` Prisma d'une table tenant-scopée. */
export function tenantWhere(scope: TenantScope) {
  return { pharmacyId: scope.pharmacyId } as const;
}

/**
 * Vérifie qu'une entité récupérée appartient bien au tenant courant.
 * Utilisé après tout `findUnique` par identifiant fourni par le client.
 */
export function assertTenant<T extends { pharmacyId: string } | null>(
  entity: T,
  scope: TenantScope,
  entityName: string,
  id: string,
): NonNullable<T> {
  if (!entity || entity.pharmacyId !== scope.pharmacyId) {
    throw new TenantIsolationError(entityName, id);
  }
  return entity as NonNullable<T>;
}

/**
 * Liste les officines « sœurs » du même groupe, hors officine courante.
 * Sert à la disponibilité inter-officines, lorsque l'option est activée.
 */
export async function siblingPharmacyIds(scope: TenantScope): Promise<string[]> {
  const pharmacies = await prisma.pharmacy.findMany({
    where: {
      organizationId: scope.organizationId,
      isActive: true,
      id: { not: scope.pharmacyId },
    },
    select: { id: true },
  });
  return pharmacies.map((p) => p.id);
}
