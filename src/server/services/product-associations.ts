import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { normalizeSearchText } from "@/core/reference/search";
import { associationError, cleanSentence } from "@/core/associations/rules";
import type { AssociationInput } from "@/core/ai/engines/associations";
import type { TenantScope } from "@/server/db/tenant";

/**
 * Les associations de produits de l'officine : lecture pour le moteur, et gestion par le pharmacien.
 *
 * Le moteur ne lit que les associations ACTIVES dont les deux produits existent encore (ni supprimés, ni désactivés).
 * Chaque requête est bornée à l'officine du demandeur : un identifiant d'une autre officine est « introuvable ».
 */

type Failure = { ok: false; error: string };

/** Les chiffres d'un code lu : le bip d'un produit en garde l'EAN dans `rawText`. */
const digitsOf = (text: string | null | undefined): string | null => {
  const digits = (text ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
};

/**
 * Quelles lignes de la vente SONT un produit du stock — et lequel. Un bip de parapharmacie en garde le code
 * (EAN du produit, ou code appris au comptoir) ; à défaut, le nom exact. Seuls les produits déclencheurs d'une
 * association sont cherchés : inutile de deviner les autres.
 */
export async function resolveLineProducts(
  pharmacyId: string,
  lines: { position: number; status: string; drugName: string | null; rawText: string | null }[],
  triggerProductIds: string[],
): Promise<{ lineIndex: number; productId: string }[]> {
  const confirmed = lines.filter((line) => line.status === "CONFIRMED" && line.drugName);
  if (confirmed.length === 0 || triggerProductIds.length === 0) return [];

  const codes = [...new Set(confirmed.map((line) => digitsOf(line.rawText)).filter((code): code is string => code !== null))];
  const [barcodes, byEan, byName] = await Promise.all([
    codes.length
      ? prisma.productBarcode.findMany({ where: { pharmacyId, code: { in: codes }, productId: { in: triggerProductIds } }, select: { code: true, productId: true } })
      : Promise.resolve([]),
    codes.length
      ? prisma.product.findMany({ where: { pharmacyId, id: { in: triggerProductIds }, ean: { in: codes }, deletedAt: null }, select: { id: true, ean: true } })
      : Promise.resolve([]),
    prisma.product.findMany({ where: { pharmacyId, id: { in: triggerProductIds }, deletedAt: null }, select: { id: true, name: true } }),
  ]);

  const productByCode = new Map<string, string>();
  for (const barcode of barcodes) productByCode.set(barcode.code, barcode.productId);
  for (const product of byEan) if (product.ean) productByCode.set(product.ean, product.id);
  const productByName = new Map(byName.map((product) => [normalizeSearchText(product.name), product.id]));

  const found: { lineIndex: number; productId: string }[] = [];
  for (const line of confirmed) {
    const code = digitsOf(line.rawText);
    const productId = (code ? productByCode.get(code) : undefined) ?? productByName.get(normalizeSearchText(line.drugName as string));
    if (productId) found.push({ lineIndex: line.position, productId });
  }
  return found;
}

/**
 * Ce que le moteur reçoit : les associations actives et les lignes de la vente qui sont un produit du stock.
 * `undefined` quand l'officine n'a aucune association (aucune requête de plus, aucune étape dans la trace).
 */
export async function loadAssociationInput(
  scope: TenantScope,
  lines: { position: number; status: string; drugName: string | null; rawText: string | null }[],
): Promise<AssociationInput | undefined> {
  const rows = await prisma.productAssociation.findMany({
    where: { pharmacyId: scope.pharmacyId, isActive: true, triggerProduct: { deletedAt: null }, adviceProduct: { deletedAt: null } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, triggerProductId: true, adviceProductId: true, sentence: true, sortOrder: true },
  });
  if (rows.length === 0) return undefined;
  const lineProducts = await resolveLineProducts(scope.pharmacyId, lines, [...new Set(rows.map((row) => row.triggerProductId))]);
  return { rules: rows, lineProducts };
}

export type AssociationView = {
  id: string;
  triggerProduct: ProductBrief;
  adviceProduct: ProductBrief;
  sentence: string | null;
  isActive: boolean;
  createdAt: Date;
  createdBy: string | null;
};

export type ProductBrief = { id: string; name: string; brand: string | null; quantity: number; deleted: boolean };

const briefOf = (product: { id: string; name: string; brand: string | null; deletedAt: Date | null; stockItem: { quantity: number } | null }): ProductBrief => ({
  id: product.id,
  name: product.name,
  brand: product.brand,
  quantity: product.stockItem?.quantity ?? 0,
  deleted: product.deletedAt !== null,
});

const productSelect = { id: true, name: true, brand: true, deletedAt: true, stockItem: { select: { quantity: true } } } as const;

/** Toutes les associations de l'officine, les plus récentes d'abord. */
export async function listAssociations(scope: TenantScope): Promise<AssociationView[]> {
  const rows = await prisma.productAssociation.findMany({
    where: { pharmacyId: scope.pharmacyId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      sentence: true,
      isActive: true,
      createdAt: true,
      triggerProduct: { select: productSelect },
      adviceProduct: { select: productSelect },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    triggerProduct: briefOf(row.triggerProduct),
    adviceProduct: briefOf(row.adviceProduct),
    sentence: row.sentence,
    isActive: row.isActive,
    createdAt: row.createdAt,
    createdBy: row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}` : null,
  }));
}

async function ownProduct(scope: TenantScope, productId: string) {
  return prisma.product.findFirst({ where: { id: productId, pharmacyId: scope.pharmacyId, deletedAt: null }, select: { id: true, name: true, isActive: true } });
}

/** Crée une association. Les deux produits doivent être de CETTE officine et exister encore. */
export async function createAssociation(
  scope: TenantScope,
  input: { triggerProductId: string; adviceProductId: string; sentence?: string | null },
): Promise<{ ok: true; id: string; triggerName: string; adviceName: string } | Failure> {
  const sentence = cleanSentence(input.sentence);
  const invalid = associationError({ triggerProductId: input.triggerProductId, adviceProductId: input.adviceProductId, sentence });
  if (invalid) return { ok: false, error: invalid };

  const [trigger, advice] = await Promise.all([ownProduct(scope, input.triggerProductId), ownProduct(scope, input.adviceProductId)]);
  if (!trigger || !advice) return { ok: false, error: "Produit introuvable dans votre catalogue." };
  if (!advice.isActive) return { ok: false, error: `« ${advice.name} » est désactivé : on ne peut pas le conseiller.` };

  const existing = await prisma.productAssociation.findUnique({
    where: { pharmacyId_triggerProductId_adviceProductId: { pharmacyId: scope.pharmacyId, triggerProductId: trigger.id, adviceProductId: advice.id } },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "Cette association existe déjà." };

  const last = await prisma.productAssociation.findFirst({ where: { pharmacyId: scope.pharmacyId, triggerProductId: trigger.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const created = await prisma.productAssociation.create({
    data: { pharmacyId: scope.pharmacyId, triggerProductId: trigger.id, adviceProductId: advice.id, sentence, sortOrder: (last?.sortOrder ?? 0) + 1, createdByUserId: scope.userId },
    select: { id: true },
  });
  await recordAudit({ action: "association.created", entityType: "ProductAssociation", entityId: created.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { triggerProductId: trigger.id, adviceProductId: advice.id, withSentence: sentence !== null } });
  return { ok: true, id: created.id, triggerName: trigger.name, adviceName: advice.name };
}

/** Modifie la phrase, ou suspend/réactive l'association. */
export async function updateAssociation(
  scope: TenantScope,
  associationId: string,
  changes: { sentence?: string | null; isActive?: boolean },
): Promise<{ ok: true } | Failure> {
  const current = await prisma.productAssociation.findFirst({ where: { id: associationId, pharmacyId: scope.pharmacyId }, select: { id: true, sentence: true, isActive: true } });
  if (!current) return { ok: false, error: "Association introuvable." };

  const data: { sentence?: string | null; isActive?: boolean } = {};
  if (changes.sentence !== undefined) {
    const sentence = cleanSentence(changes.sentence);
    const invalid = associationError({ triggerProductId: "x", adviceProductId: "y", sentence });
    if (invalid) return { ok: false, error: invalid };
    if (sentence !== current.sentence) data.sentence = sentence;
  }
  if (changes.isActive !== undefined && changes.isActive !== current.isActive) data.isActive = changes.isActive;
  if (Object.keys(data).length === 0) return { ok: true };

  await prisma.productAssociation.update({ where: { id: current.id }, data });
  await recordAudit({ action: "association.updated", entityType: "ProductAssociation", entityId: current.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { fields: Object.keys(data) } });
  return { ok: true };
}

export async function deleteAssociation(scope: TenantScope, associationId: string): Promise<{ ok: true } | Failure> {
  const current = await prisma.productAssociation.findFirst({ where: { id: associationId, pharmacyId: scope.pharmacyId }, select: { id: true, triggerProductId: true, adviceProductId: true } });
  if (!current) return { ok: false, error: "Association introuvable." };
  await prisma.productAssociation.delete({ where: { id: current.id } });
  await recordAudit({ action: "association.deleted", entityType: "ProductAssociation", entityId: current.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { triggerProductId: current.triggerProductId, adviceProductId: current.adviceProductId } });
  return { ok: true };
}
