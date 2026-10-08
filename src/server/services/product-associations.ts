import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { normalizeSearchText } from "@/core/reference/search";
import { associationError, cleanSentence, sentenceError } from "@/core/associations/rules";
import { drugKey, productKey, type AssociationInput } from "@/core/ai/engines/associations";
import type { TenantScope } from "@/server/db/tenant";

/**
 * Les associations de produits de l'officine : lecture pour le moteur, et gestion par le pharmacien.
 *
 * Le déclencheur d'une association est un produit du stock OU un médicament du catalogue national (un médicament conseil
 * comme Coryzalia se lit par son code CIP : il n'est pas dans le stock). Le moteur ne lit que les associations ACTIVES
 * dont le produit conseillé existe encore et dont le déclencheur n'a pas été supprimé. Chaque requête est bornée à
 * l'officine du demandeur : un identifiant d'une autre officine est « introuvable ».
 */

type Failure = { ok: false; error: string };

/** Les chiffres d'un code lu : le bip d'un produit en garde l'EAN dans `rawText`. */
const digitsOf = (text: string | null | undefined): string | null => {
  const digits = (text ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
};

export type LineForAssociations = { position: number; status: string; drugName: string | null; rawText: string | null; drugSpecialtyId?: string | null };

/**
 * Ce que chaque ligne de la vente EST : un médicament (par son nom, ou par la spécialité à laquelle elle est rattachée) et,
 * le cas échéant, un produit du stock (par le code appris au comptoir, par son EAN, à défaut par son nom exact). Seuls les
 * déclencheurs d'une association sont cherchés : inutile de deviner le reste.
 */
export async function resolveLineTriggers(
  pharmacyId: string,
  lines: LineForAssociations[],
  wanted: { productIds: string[]; drugKeys: Set<string> },
): Promise<AssociationInput["lines"]> {
  const confirmed = lines.filter((line) => line.status === "CONFIRMED" && line.drugName);
  if (confirmed.length === 0) return [];

  const codes = [...new Set(confirmed.map((line) => digitsOf(line.rawText)).filter((code): code is string => code !== null))];
  const specialtyIds = [...new Set(confirmed.map((line) => line.drugSpecialtyId).filter((id): id is string => Boolean(id)))];
  const [barcodes, byEan, byName, specialties] = await Promise.all([
    codes.length && wanted.productIds.length
      ? prisma.productBarcode.findMany({ where: { pharmacyId, code: { in: codes }, productId: { in: wanted.productIds } }, select: { code: true, productId: true } })
      : Promise.resolve([]),
    codes.length && wanted.productIds.length
      ? prisma.product.findMany({ where: { pharmacyId, id: { in: wanted.productIds }, ean: { in: codes }, deletedAt: null }, select: { id: true, ean: true } })
      : Promise.resolve([]),
    wanted.productIds.length ? prisma.product.findMany({ where: { pharmacyId, id: { in: wanted.productIds }, deletedAt: null }, select: { id: true, name: true } }) : Promise.resolve([]),
    wanted.drugKeys.size && specialtyIds.length ? prisma.drugSpecialty.findMany({ where: { id: { in: specialtyIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);

  const productByCode = new Map<string, string>();
  for (const barcode of barcodes) productByCode.set(barcode.code, barcode.productId);
  for (const product of byEan) if (product.ean) productByCode.set(product.ean, product.id);
  const productByName = new Map(byName.map((product) => [normalizeSearchText(product.name), product.id]));
  const specialtyName = new Map(specialties.map((specialty) => [specialty.id, specialty.name]));

  const found: AssociationInput["lines"] = [];
  for (const line of confirmed) {
    const keys: string[] = [];
    let productId: string | null = null;

    const code = digitsOf(line.rawText);
    const matchedProduct = (code ? productByCode.get(code) : undefined) ?? productByName.get(normalizeSearchText(line.drugName as string));
    if (matchedProduct) {
      productId = matchedProduct;
      keys.push(productKey(matchedProduct));
    }

    // Le médicament, sous les deux noms qu'il peut porter : celui de la ligne, et celui de sa spécialité officielle.
    const names = [line.drugName as string];
    const official = line.drugSpecialtyId ? specialtyName.get(line.drugSpecialtyId) : undefined;
    if (official) names.push(official);
    for (const name of names) {
      const key = drugKey(name);
      if (wanted.drugKeys.has(key) && !keys.includes(key)) keys.push(key);
    }

    if (keys.length > 0) found.push({ lineIndex: line.position, keys, productId });
  }
  return found;
}

/**
 * Ce que le moteur reçoit : les associations actives et ce que chaque ligne de la vente est.
 * `undefined` quand l'officine n'a aucune association (aucune requête de plus, aucune étape dans la trace).
 */
export async function loadAssociationInput(scope: TenantScope, lines: LineForAssociations[]): Promise<AssociationInput | undefined> {
  const rows = await prisma.productAssociation.findMany({
    where: {
      pharmacyId: scope.pharmacyId,
      isActive: true,
      adviceProduct: { deletedAt: null },
      OR: [{ triggerProductId: { not: null }, triggerProduct: { deletedAt: null } }, { triggerSpecialtyId: { not: null } }],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, triggerProductId: true, triggerSpecialty: { select: { name: true } }, adviceProductId: true, sentence: true, sortOrder: true },
  });
  if (rows.length === 0) return undefined;

  const rules = rows.flatMap((row) => {
    const triggerKey = row.triggerProductId ? productKey(row.triggerProductId) : row.triggerSpecialty ? drugKey(row.triggerSpecialty.name) : null;
    return triggerKey ? [{ id: row.id, triggerKey, adviceProductId: row.adviceProductId, sentence: row.sentence, sortOrder: row.sortOrder }] : [];
  });
  const wanted = {
    productIds: [...new Set(rows.map((row) => row.triggerProductId).filter((id): id is string => id !== null))],
    drugKeys: new Set(rules.map((rule) => rule.triggerKey).filter((key) => key.startsWith("drug:"))),
  };
  return { rules, lines: await resolveLineTriggers(scope.pharmacyId, lines, wanted) };
}

// ---------------------------------------------------------------------------------------------------------------
// L'écran « Mes associations »
// ---------------------------------------------------------------------------------------------------------------

export type ProductBrief = { id: string; name: string; brand: string | null; quantity: number; deleted: boolean };

/** Ce qui déclenche une association, tel que l'écran le montre. `quantity` n'existe que pour un produit du stock. */
export type TriggerView = { kind: "PRODUCT" | "DRUG"; id: string; name: string; brand: string | null; quantity: number | null; deleted: boolean };

export type AssociationView = {
  id: string;
  trigger: TriggerView;
  advice: ProductBrief;
  sentence: string | null;
  isActive: boolean;
  createdAt: Date;
  createdBy: string | null;
};

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
      triggerSpecialty: { select: { id: true, name: true } },
      adviceProduct: { select: productSelect },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
  return rows.flatMap((row) => {
    const trigger: TriggerView | null = row.triggerProduct
      ? { kind: "PRODUCT", id: row.triggerProduct.id, name: row.triggerProduct.name, brand: row.triggerProduct.brand, quantity: row.triggerProduct.stockItem?.quantity ?? 0, deleted: row.triggerProduct.deletedAt !== null }
      : row.triggerSpecialty
        ? { kind: "DRUG", id: row.triggerSpecialty.id, name: row.triggerSpecialty.name, brand: null, quantity: null, deleted: false }
        : null;
    if (!trigger) return [];
    return [{ id: row.id, trigger, advice: briefOf(row.adviceProduct), sentence: row.sentence, isActive: row.isActive, createdAt: row.createdAt, createdBy: row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}` : null }];
  });
}

async function ownProduct(scope: TenantScope, productId: string) {
  return prisma.product.findFirst({ where: { id: productId, pharmacyId: scope.pharmacyId, deletedAt: null }, select: { id: true, name: true, isActive: true } });
}

/**
 * Crée une association. Le déclencheur est un produit de CETTE officine, ou un médicament du catalogue national ; le
 * produit conseillé est toujours un produit de l'officine, actif.
 */
export async function createAssociation(
  scope: TenantScope,
  input: { triggerProductId?: string | null; triggerSpecialtyId?: string | null; adviceProductId: string; sentence?: string | null },
): Promise<{ ok: true; id: string; triggerName: string; adviceName: string } | Failure> {
  const sentence = cleanSentence(input.sentence);
  const invalid = associationError({ triggerProductId: input.triggerProductId, triggerSpecialtyId: input.triggerSpecialtyId, adviceProductId: input.adviceProductId, sentence });
  if (invalid) return { ok: false, error: invalid };

  const advice = await ownProduct(scope, input.adviceProductId);
  if (!advice) return { ok: false, error: "Produit introuvable dans votre catalogue." };
  if (!advice.isActive) return { ok: false, error: `« ${advice.name} » est désactivé : on ne peut pas le conseiller.` };

  let triggerName: string;
  let data: { triggerProductId: string } | { triggerSpecialtyId: string };
  if (input.triggerProductId) {
    const trigger = await ownProduct(scope, input.triggerProductId);
    if (!trigger) return { ok: false, error: "Produit introuvable dans votre catalogue." };
    const existing = await prisma.productAssociation.findUnique({
      where: { pharmacyId_triggerProductId_adviceProductId: { pharmacyId: scope.pharmacyId, triggerProductId: trigger.id, adviceProductId: advice.id } },
      select: { id: true },
    });
    if (existing) return { ok: false, error: "Cette association existe déjà." };
    triggerName = trigger.name;
    data = { triggerProductId: trigger.id };
  } else {
    const specialty = await prisma.drugSpecialty.findUnique({ where: { id: input.triggerSpecialtyId as string }, select: { id: true, name: true } });
    if (!specialty) return { ok: false, error: "Médicament introuvable dans le catalogue national." };
    // Toutes les formes d'un même nom se valent (« CORYZALIA, comprimé… » et « CORYZALIA, solution… ») : un doublon
    // se reconnaît au nom, pas seulement à l'identifiant.
    const same = await prisma.productAssociation.findMany({
      where: { pharmacyId: scope.pharmacyId, adviceProductId: advice.id, triggerSpecialtyId: { not: null } },
      select: { triggerSpecialty: { select: { name: true } } },
    });
    if (same.some((row) => row.triggerSpecialty && drugKey(row.triggerSpecialty.name) === drugKey(specialty.name))) return { ok: false, error: "Cette association existe déjà." };
    triggerName = specialty.name.split(",")[0].trim();
    data = { triggerSpecialtyId: specialty.id };
  }

  const last = await prisma.productAssociation.findFirst({
    where: { pharmacyId: scope.pharmacyId, ...("triggerProductId" in data ? { triggerProductId: data.triggerProductId } : { triggerSpecialtyId: data.triggerSpecialtyId }) },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const created = await prisma.productAssociation.create({
    data: { pharmacyId: scope.pharmacyId, ...data, adviceProductId: advice.id, sentence, sortOrder: (last?.sortOrder ?? 0) + 1, createdByUserId: scope.userId },
    select: { id: true },
  });
  await recordAudit({
    action: "association.created",
    entityType: "ProductAssociation",
    entityId: created.id,
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    metadata: { ...data, adviceProductId: advice.id, trigger: "triggerProductId" in data ? "PRODUCT" : "DRUG", withSentence: sentence !== null },
  });
  return { ok: true, id: created.id, triggerName, adviceName: advice.name };
}

/** Modifie la phrase, ou suspend/réactive l'association. */
export async function updateAssociation(scope: TenantScope, associationId: string, changes: { sentence?: string | null; isActive?: boolean }): Promise<{ ok: true } | Failure> {
  const current = await prisma.productAssociation.findFirst({ where: { id: associationId, pharmacyId: scope.pharmacyId }, select: { id: true, sentence: true, isActive: true } });
  if (!current) return { ok: false, error: "Association introuvable." };

  const data: { sentence?: string | null; isActive?: boolean } = {};
  if (changes.sentence !== undefined) {
    const sentence = cleanSentence(changes.sentence);
    const invalid = sentenceError(sentence);
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
  const current = await prisma.productAssociation.findFirst({ where: { id: associationId, pharmacyId: scope.pharmacyId }, select: { id: true, triggerProductId: true, triggerSpecialtyId: true, adviceProductId: true } });
  if (!current) return { ok: false, error: "Association introuvable." };
  await prisma.productAssociation.delete({ where: { id: current.id } });
  await recordAudit({
    action: "association.deleted",
    entityType: "ProductAssociation",
    entityId: current.id,
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    metadata: { triggerProductId: current.triggerProductId, triggerSpecialtyId: current.triggerSpecialtyId, adviceProductId: current.adviceProductId },
  });
  return { ok: true };
}
