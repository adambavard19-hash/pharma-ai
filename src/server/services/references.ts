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
