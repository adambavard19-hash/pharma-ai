import "server-only";
import { prisma } from "@/server/db/client";

/**
 * Sérialise une opération par clé (un SIRET, un dossier) entre requêtes et
 * instances : verrou consultatif PostgreSQL tenu le temps de la transaction.
 * Le travail lui-même passe par le client habituel ; seul le verrou occupe
 * la connexion de la transaction.
 */
export async function withAdvisoryLock<T>(key: string, fn: () => Promise<T>, timeoutMs = 60_000): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      return fn();
    },
    { timeout: timeoutMs, maxWait: timeoutMs },
  );
}
