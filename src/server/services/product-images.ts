import "server-only";
import { prisma } from "@/server/db/client";

/**
 * La photo de la boîte, trouvée par son code-barres dans les bases ouvertes
 * Open Beauty Facts, Open Products Facts et Open Food Facts (licence ODbL,
 * images CC BY-SA : elles se créditent, et la carte le fait).
 *
 * Rien n'est inventé : sans photo connue, la carte montre les initiales de la
 * marque. Une photo prise à l'officine (« officine ») n'est jamais remplacée.
 */

export const OPEN_FACTS_SOURCES = ["openbeautyfacts", "openproductsfacts", "openfoodfacts"] as const;
export type OpenFactsSource = (typeof OPEN_FACTS_SOURCES)[number];

export const OPEN_FACTS_LABELS: Record<string, string> = {
  openbeautyfacts: "Open Beauty Facts",
  openproductsfacts: "Open Products Facts",
  openfoodfacts: "Open Food Facts",
};

const USER_AGENT = "PharmaBoost/1.0 (contact@pharmaboost.app)";
/** Les bases demandent de rester sous 100 requêtes par minute. */
const PAUSE_MS = 650;

export async function findOpenFactsImage(ean: string): Promise<{ url: string; source: OpenFactsSource } | null> {
  const code = ean.replace(/\D/g, "");
  if (code.length < 8) return null;
  for (const source of OPEN_FACTS_SOURCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`https://world.${source}.org/api/v2/product/${code}.json?fields=image_front_url`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) continue;
      const body = (await response.json()) as { status?: number; product?: { image_front_url?: string | null } };
      const url = body.status === 1 ? body.product?.image_front_url : null;
      if (url && /^https:\/\/images\.open(beauty|products|food)facts\.org\//.test(url)) return { url, source };
    } catch {
      // Base injoignable ou lente : on passe à la suivante, sans bloquer l'officine.
    }
  }
  return null;
}

export type ImageFetchSummary = { considered: number; found: number; remaining: number };

/**
 * Cherche une photo pour les produits de l'officine qui ont un code-barres et
 * pas encore d'image, puis pour ses médicaments en stock (le CIP 13 est un
 * EAN). Borné par `limit` : le reste attend le prochain passage.
 */
export async function fetchMissingProductImages(params: { pharmacyId: string; limit?: number; log?: (line: string) => void }): Promise<ImageFetchSummary> {
  const limit = params.limit ?? 150;
  const log = params.log ?? (() => undefined);
  const products = await prisma.product.findMany({
    where: { pharmacyId: params.pharmacyId, deletedAt: null, imageUrl: null, imageSource: null, ean: { not: null } },
    select: { id: true, ean: true, name: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const summary: ImageFetchSummary = { considered: 0, found: 0, remaining: 0 };
  for (const product of products) {
    summary.considered += 1;
    const image = await findOpenFactsImage(product.ean as string);
    // Une recherche faite, même vaine, est mémorisée : « aucune » évite de
    // redemander la même chose à chaque passage.
    await prisma.product.update({
      where: { id: product.id },
      data: image ? { imageUrl: image.url, imageSource: image.source } : { imageSource: "aucune" },
    });
    if (image) {
      summary.found += 1;
      log(`${product.name} → ${OPEN_FACTS_LABELS[image.source]}`);
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }

  const budget = limit - products.length;
  if (budget > 0) {
    const drugs = await prisma.pharmacyDrugStock.findMany({
      where: { pharmacyId: params.pharmacyId, quantity: { gt: 0 }, presentation: { imageUrl: null, imageSource: null } },
      select: { presentation: { select: { id: true, cip13: true, specialty: { select: { name: true } } } } },
      take: budget,
    });
    for (const { presentation } of drugs) {
      summary.considered += 1;
      const image = await findOpenFactsImage(presentation.cip13);
      await prisma.drugPresentation.update({
        where: { id: presentation.id },
        data: image ? { imageUrl: image.url, imageSource: image.source } : { imageSource: "aucune" },
      });
      if (image) {
        summary.found += 1;
        log(`${presentation.specialty.name} → ${OPEN_FACTS_LABELS[image.source]}`);
      }
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
  }

  summary.remaining =
    (await prisma.product.count({ where: { pharmacyId: params.pharmacyId, deletedAt: null, imageUrl: null, imageSource: null, ean: { not: null } } })) +
    (await prisma.pharmacyDrugStock.count({ where: { pharmacyId: params.pharmacyId, quantity: { gt: 0 }, presentation: { imageUrl: null, imageSource: null } } }));
  return summary;
}

/** Combien de références attendent encore une recherche de photo. */
export async function countProductsWithoutImageLookup(pharmacyId: string): Promise<number> {
  return prisma.product.count({ where: { pharmacyId, deletedAt: null, imageUrl: null, imageSource: null, ean: { not: null } } });
}
