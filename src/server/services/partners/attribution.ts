import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant";
import { attributionCodeFrom } from "@/core/partners/attribution";

/**
 * Crée un identifiant d'attribution PharmaBoost pour une consultation, une
 * prise de contact ou une commande. Seuls l'officine (depuis la session),
 * l'utilisateur et l'univers du conseil sont gardés : jamais le patient, ni
 * l'ordonnance, ni le contenu du conseil.
 */
export async function createAttribution(
  scope: Pick<TenantScope, "pharmacyId" | "userId">,
  input: {
    kind: "VIEW" | "LEAD" | "ORDER";
    source: "COUNTER_CARD" | "CATALOG" | "BRAND_PAGE";
    partnerId: string;
    brandId: string | null;
    rangeId?: string | null;
    universe?: string | null;
  },
): Promise<{ id: string; code: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = attributionCodeFrom(randomBytes(8));
    try {
      return await prisma.partnerAttribution.create({
        data: {
          code,
          kind: input.kind,
          source: input.source,
          partnerId: input.partnerId,
          brandId: input.brandId,
          rangeId: input.rangeId ?? null,
          pharmacyId: scope.pharmacyId,
          userId: scope.userId,
          universe: input.universe ?? null,
        },
        select: { id: true, code: true },
      });
    } catch (error) {
      // Collision de code (31^8 combinaisons) : on retire au sort.
      if ((error as { code?: string }).code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Impossible de créer un identifiant d'attribution unique.");
}
