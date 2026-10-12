import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { normalizeSearchText } from "@/core/reference/search";
import { associationError, cleanSentence, MAX_ADVICE_PER_SAVE, sentenceError } from "@/core/associations/rules";
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
 * Les associations communes à toutes les officines (créées dans la console de PharmaBoost), ramenées à CETTE officine : le
 * produit conseillé et, pour un produit déclencheur, ce produit sont retrouvés dans son stock par leur code-barres. Une
 * association dont le produit conseillé n'est pas dans le stock de l'officine ne s'applique simplement pas chez elle.
 */
async function loadCentralRules(pharmacyId: string): Promise<{ rules: AssociationInput["rules"]; triggerProductIds: string[] }> {
  const central = await prisma.centralAssociation.findMany({
    where: { status: { not: "REMOVED" } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, triggerKind: true, triggerKey: true, adviceEan: true, sentence: true, sortOrder: true },
  });
  if (central.length === 0) return { rules: [], triggerProductIds: [] };

  const eans = [...new Set(central.flatMap((row) => (row.triggerKind === "PRODUCT" ? [row.adviceEan, row.triggerKey.slice("ean:".length)] : [row.adviceEan])))];
  const [products, barcodes] = await Promise.all([
    prisma.product.findMany({ where: { pharmacyId, ean: { in: eans }, deletedAt: null, isActive: true }, select: { id: true, ean: true } }),
    prisma.productBarcode.findMany({ where: { pharmacyId, code: { in: eans }, product: { deletedAt: null, isActive: true } }, select: { code: true, productId: true } }),
  ]);
  const productByEan = new Map<string, string>();
  for (const barcode of barcodes) productByEan.set(barcode.code, barcode.productId);
  for (const product of products) if (product.ean) productByEan.set(product.ean, product.id);

  const rules: AssociationInput["rules"] = [];
  const triggerProductIds: string[] = [];
  for (const row of central) {
    const adviceProductId = productByEan.get(row.adviceEan);
    if (!adviceProductId) continue;
    let triggerKey = row.triggerKey;
    if (row.triggerKind === "PRODUCT") {
      const triggerProductId = productByEan.get(row.triggerKey.slice("ean:".length));
      if (!triggerProductId || triggerProductId === adviceProductId) continue;
      triggerKey = productKey(triggerProductId);
      triggerProductIds.push(triggerProductId);
    }
    // Les associations de l'officine passent avant : elles sont la voix du pharmacien de cette officine.
    rules.push({ id: `central:${row.id}`, triggerKey, adviceProductId, sentence: row.sentence, sortOrder: 1_000_000 + row.sortOrder });
  }
  return { rules, triggerProductIds };
}

/**
 * Ce que le moteur reçoit : les associations actives — celles de l'officine, puis celles communes à toutes les officines —
 * et ce que chaque ligne de la vente est. `undefined` quand il n'y en a aucune (aucune requête de plus, aucune étape dans
 * la trace).
 */
export async function loadAssociationInput(scope: TenantScope, lines: LineForAssociations[]): Promise<AssociationInput | undefined> {
  const [rows, common] = await Promise.all([
    prisma.productAssociation.findMany({
      where: {
        pharmacyId: scope.pharmacyId,
        isActive: true,
        adviceProduct: { deletedAt: null },
        OR: [{ triggerProductId: { not: null }, triggerProduct: { deletedAt: null } }, { triggerSpecialtyId: { not: null } }],
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, triggerProductId: true, triggerSpecialty: { select: { name: true } }, adviceProductId: true, sentence: true, sortOrder: true },
    }),
    loadCentralRules(scope.pharmacyId),
  ]);
  const own = rows.flatMap((row) => {
    const triggerKey = row.triggerProductId ? productKey(row.triggerProductId) : row.triggerSpecialty ? drugKey(row.triggerSpecialty.name) : null;
    return triggerKey ? [{ id: row.id, triggerKey, adviceProductId: row.adviceProductId, sentence: row.sentence, sortOrder: row.sortOrder }] : [];
  });
  const rules = [...own, ...common.rules];
  if (rules.length === 0) return undefined;

  const wanted = {
    productIds: [...new Set([...rows.map((row) => row.triggerProductId).filter((id): id is string => id !== null), ...common.triggerProductIds])],
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
 * produit conseillé est toujours un produit de l'officine, actif. C'est l'enregistrement par lot réduit à un produit : un
 * seul chemin d'écriture, donc les mêmes contrôles.
 */
export async function createAssociation(
  scope: TenantScope,
  input: { triggerProductId?: string | null; triggerSpecialtyId?: string | null; adviceProductId: string; sentence?: string | null },
): Promise<{ ok: true; id: string; triggerName: string; adviceName: string } | Failure> {
  const { adviceProductId, ...rest } = input;
  if (!adviceProductId) return { ok: false, error: "Choisissez le produit à conseiller." };
  const result = await createAssociations(scope, { ...rest, adviceProductIds: [adviceProductId] });
  if (!result.ok) return result;
  const [created] = result.created;
  if (!created) return { ok: false, error: result.skipped[0]?.reason ?? "Association non enregistrée." };
  return { ok: true, id: created.id, triggerName: result.triggerName, adviceName: created.adviceName };
}

export type BatchSkip = { adviceProductId: string; adviceName: string | null; reason: string };
export type BatchCreated = { id: string; adviceProductId: string; adviceName: string };

/**
 * Plusieurs produits conseillés d'un coup pour UN déclencheur (« quand la cétirizine est dans la vente, proposer le spray,
 * le collyre et les mouchoirs »). Chaque produit passe par les mêmes contrôles qu'une association seule ; un produit déjà
 * associé, d'une autre officine, désactivé ou identique au déclencheur est écarté AVEC sa raison, sans bloquer les autres.
 * L'écriture est une seule instruction : tout ce qui reste est créé, ou rien. Deux enregistrements simultanés ne créent pas
 * de doublon — la contrainte d'unicité de la base départage, et le perdant est signalé « déjà associé ».
 */
export async function createAssociations(
  scope: TenantScope,
  input: { triggerProductId?: string | null; triggerSpecialtyId?: string | null; adviceProductIds: string[]; sentence?: string | null },
): Promise<{ ok: true; triggerName: string; created: BatchCreated[]; skipped: BatchSkip[] } | Failure> {
  const sentence = cleanSentence(input.sentence);
  const adviceIds = [...new Set(input.adviceProductIds.filter(Boolean))];
  if (adviceIds.length === 0) return { ok: false, error: "Choisissez au moins un produit à conseiller." };
  if (adviceIds.length > MAX_ADVICE_PER_SAVE) return { ok: false, error: `${MAX_ADVICE_PER_SAVE} produits au plus en une fois.` };
  // Le déclencheur et la phrase se vérifient une fois : seul le produit conseillé change d'une association à l'autre (le
  // produit associé à lui-même est écarté plus bas, sans bloquer les autres — sauf s'il est le seul).
  const invalid = associationError({ triggerProductId: input.triggerProductId, triggerSpecialtyId: input.triggerSpecialtyId, adviceProductId: adviceIds.find((id) => id !== input.triggerProductId) ?? adviceIds[0], sentence });
  if (invalid) return { ok: false, error: invalid };

  let triggerName: string;
  let trigger: { triggerProductId: string } | { triggerSpecialtyId: string };
  let existing: Set<string>;
  if (input.triggerProductId) {
    const product = await ownProduct(scope, input.triggerProductId);
    if (!product) return { ok: false, error: "Produit introuvable dans votre catalogue." };
    triggerName = product.name;
    trigger = { triggerProductId: product.id };
    const rows = await prisma.productAssociation.findMany({ where: { pharmacyId: scope.pharmacyId, triggerProductId: product.id, adviceProductId: { in: adviceIds } }, select: { adviceProductId: true } });
    existing = new Set(rows.map((row) => row.adviceProductId));
  } else {
    const specialty = await prisma.drugSpecialty.findUnique({ where: { id: input.triggerSpecialtyId as string }, select: { id: true, name: true } });
    if (!specialty) return { ok: false, error: "Médicament introuvable dans le catalogue national." };
    triggerName = specialty.name.split(",")[0].trim();
    trigger = { triggerSpecialtyId: specialty.id };
    // Toutes les formes d'un même nom se valent : un doublon se reconnaît au nom, pas seulement à l'identifiant.
    const rows = await prisma.productAssociation.findMany({
      where: { pharmacyId: scope.pharmacyId, adviceProductId: { in: adviceIds }, triggerSpecialtyId: { not: null } },
      select: { adviceProductId: true, triggerSpecialty: { select: { name: true } } },
    });
    existing = new Set(rows.filter((row) => row.triggerSpecialty && drugKey(row.triggerSpecialty.name) === drugKey(specialty.name)).map((row) => row.adviceProductId));
  }

  const products = await prisma.product.findMany({ where: { id: { in: adviceIds }, pharmacyId: scope.pharmacyId, deletedAt: null }, select: { id: true, name: true, isActive: true } });
  const byId = new Map(products.map((product) => [product.id, product]));
  const skipped: BatchSkip[] = [];
  const accepted: { id: string; name: string }[] = [];
  for (const id of adviceIds) {
    const product = byId.get(id);
    if (!product) skipped.push({ adviceProductId: id, adviceName: null, reason: "Produit introuvable dans votre catalogue." });
    else if (!product.isActive) skipped.push({ adviceProductId: id, adviceName: product.name, reason: `« ${product.name} » est désactivé : on ne peut pas le conseiller.` });
    else if ("triggerProductId" in trigger && trigger.triggerProductId === id) skipped.push({ adviceProductId: id, adviceName: product.name, reason: "Un produit ne peut pas être associé à lui-même." });
    else if (existing.has(id)) skipped.push({ adviceProductId: id, adviceName: product.name, reason: `« ${product.name} » est déjà associé à « ${triggerName} ».` });
    else accepted.push(product);
  }
  if (accepted.length === 0) return { ok: true, triggerName, created: [], skipped };

  const last = await prisma.productAssociation.findFirst({ where: { pharmacyId: scope.pharmacyId, ...trigger }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const first = (last?.sortOrder ?? 0) + 1;
  const rows = await prisma.productAssociation.createManyAndReturn({
    // Dans l'ordre où le pharmacien les a choisis : c'est aussi l'ordre de proposition au comptoir.
    data: accepted.map((product, index) => ({ pharmacyId: scope.pharmacyId, ...trigger, adviceProductId: product.id, sentence, sortOrder: first + index, createdByUserId: scope.userId })),
    skipDuplicates: true,
    select: { id: true, adviceProductId: true },
  });
  const createdIds = new Map(rows.map((row) => [row.adviceProductId, row.id]));
  const created: BatchCreated[] = [];
  for (const product of accepted) {
    const id = createdIds.get(product.id);
    if (id) created.push({ id, adviceProductId: product.id, adviceName: product.name });
    else skipped.push({ adviceProductId: product.id, adviceName: product.name, reason: `« ${product.name} » est déjà associé à « ${triggerName} ».` });
  }
  for (const row of created) {
    await recordAudit({
      action: "association.created",
      entityType: "ProductAssociation",
      entityId: row.id,
      pharmacyId: scope.pharmacyId,
      userId: scope.userId,
      metadata: { ...trigger, adviceProductId: row.adviceProductId, trigger: "triggerProductId" in trigger ? "PRODUCT" : "DRUG", withSentence: sentence !== null, batch: created.length },
    });
  }
  return { ok: true, triggerName, created, skipped };
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
