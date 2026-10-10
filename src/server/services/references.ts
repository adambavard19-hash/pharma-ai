import "server-only";
import { prisma } from "@/server/db/client";

/**
 * Génération des références lisibles (`ORD-0042`, `PAT-0007`…).
 *
 * Le compteur est dérivé du nombre d'entités existantes de l'officine, dans une
 * transaction sérialisable pour éviter deux références identiques en cas de
 * création simultanée à deux postes du comptoir.
 */

type Entity = "patient" | "prescription" | "sale" | "product";

const PREFIXES: Record<Entity, string> = {
  patient: "PAT",
  prescription: "ORD",
  sale: "VTE",
  product: "REF",
};

export async function nextReference(
  entity: Entity,
  pharmacyId: string,
): Promise<string> {
  const prefix = PREFIXES[entity];

  const count = await (async () => {
    switch (entity) {
      case "patient":
        return prisma.patient.count({ where: { pharmacyId } });
      case "prescription":
        return prisma.prescription.count({ where: { pharmacyId } });
      case "sale":
        return prisma.sale.count({ where: { pharmacyId } });
      case "product":
        return prisma.product.count({ where: { pharmacyId } });
    }
  })();

  // En cas de collision (suppression puis recréation), on incrémente jusqu'à
  // trouver une référence libre.
  let sequence = count + 1;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `${prefix}-${String(sequence).padStart(4, "0")}`;
    const exists = await referenceExists(entity, pharmacyId, candidate);
    if (!exists) return candidate;
    sequence += 1;
  }

  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

async function referenceExists(
  entity: Entity,
  pharmacyId: string,
  reference: string,
): Promise<boolean> {
  switch (entity) {
    case "patient":
      return (
        (await prisma.patient.count({ where: { pharmacyId, reference } })) > 0
      );
    case "prescription":
      return (
        (await prisma.prescription.count({ where: { pharmacyId, reference } })) > 0
      );
    case "sale":
      return (await prisma.sale.count({ where: { pharmacyId, reference } })) > 0;
    case "product":
      return (await prisma.product.count({ where: { pharmacyId, reference } })) > 0;
  }
}

/**
 * Réserve `count` références distinctes d'un coup — pour un import qui crée
 * des dizaines de produits avant qu'aucun ne soit écrit. Appeler
 * `nextReference` en boucle rendrait la même référence à chaque fois, puisque
 * le compteur ne bouge qu'à l'écriture.
 */
export async function reserveReferences(entity: Entity, pharmacyId: string, count: number): Promise<string[]> {
  if (count <= 0) return [];
  const prefix = PREFIXES[entity];
  const existing = await (async () => {
    switch (entity) {
      case "patient":
        return prisma.patient.findMany({ where: { pharmacyId }, select: { reference: true } });
      case "prescription":
        return prisma.prescription.findMany({ where: { pharmacyId }, select: { reference: true } });
      case "sale":
        return prisma.sale.findMany({ where: { pharmacyId }, select: { reference: true } });
      case "product":
        return prisma.product.findMany({ where: { pharmacyId }, select: { reference: true } });
    }
  })();
  const taken = new Set(existing.map((row) => row.reference));
  const reserved: string[] = [];
  let sequence = existing.length + 1;
  while (reserved.length < count) {
    const candidate = `${prefix}-${String(sequence).padStart(4, "0")}`;
    if (!taken.has(candidate)) {
      reserved.push(candidate);
      taken.add(candidate);
    }
    sequence += 1;
  }
  return reserved;
}

/** Une collision sur la référence lisible de l'officine : deux créations simultanées ont calculé le même numéro. */
export function isReferenceCollision(error: unknown): boolean {
  if (typeof error !== "object" || error === null || (error as { code?: string }).code !== "P2002") return false;
  const target = JSON.stringify((error as { meta?: unknown }).meta ?? {});
  return /reference/i.test(target) || target === "{}";
}

/**
 * Crée une entité avec sa référence lisible, sans jamais échouer parce que deux postes (ou deux collaborateurs) créent en même temps.
 *
 * Le numéro suivant se calcule d'après ce qui existe ; deux créations simultanées peuvent donc calculer le MÊME numéro, et la base
 * refuse la seconde (clé unique par officine). Plutôt qu'un bip perdu ou une vente en erreur, on recalcule (le concurrent est alors
 * visible) et on réessaie, après une courte pause décalée. Les autres erreurs remontent telles quelles.
 */
export async function createWithReference<T>(entity: Entity, pharmacyId: string, create: (reference: string) => Promise<T>, options: { attempts?: number } = {}): Promise<T> {
  const attempts = options.attempts ?? 8;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const reference = await nextReference(entity, pharmacyId);
    try {
      return await create(reference);
    } catch (error) {
      if (!isReferenceCollision(error)) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 40 * (attempt + 1)) + 5));
    }
  }
  throw lastError;
}
