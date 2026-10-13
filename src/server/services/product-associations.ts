import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { normalizeSearchText } from "@/core/reference/search";
import { associationError, cleanSentence, MAX_ADVICE_PER_SAVE, MAX_TRIGGERS_PER_SAVE, sentenceError } from "@/core/associations/rules";
import { drugKey, productKey, type AssociationInput } from "@/core/ai/engines/associations";
import { belongsToFamily, familyKey, type FamilyDefinition } from "@/core/associations/families";
import type { CatalogProduct } from "@/core/ai/types";
import type { TenantScope } from "@/server/db/tenant";
import { loadAssociationDrugProducts } from "./catalog";

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
  wanted: { productIds: string[]; drugKeys: Set<string>; families?: FamilyDefinition[] },
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
    (wanted.drugKeys.size || wanted.families?.length) && specialtyIds.length ? prisma.drugSpecialty.findMany({ where: { id: { in: specialtyIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
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

    // Les familles déclencheuses : le libellé de la ligne (et le nom officiel du médicament), son code-barres, son nom de médicament.
    if (wanted.families?.length) {
      const candidate = { labels: names, keys: [...(code ? [`ean:${code}`] : []), ...names.map(drugKey)] };
      for (const family of wanted.families) if (belongsToFamily(family, candidate)) keys.push(familyKey(family.id));
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
async function loadCentralRules(pharmacyId: string): Promise<{ rules: AssociationInput["rules"]; triggerProductIds: string[]; families: FamilyDefinition[] }> {
  const central = await prisma.centralAssociation.findMany({
    where: { status: { not: "REMOVED" } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, triggerKind: true, triggerKey: true, adviceEan: true, sentence: true, sortOrder: true },
  });
  if (central.length === 0) return { rules: [], triggerProductIds: [], families: [] };

  const eans = [...new Set(central.flatMap((row) => (row.triggerKind === "PRODUCT" ? [row.adviceEan, row.triggerKey.slice("ean:".length)] : [row.adviceEan])))];
  const [products, barcodes] = await Promise.all([
    prisma.product.findMany({ where: { pharmacyId, ean: { in: eans }, deletedAt: null, isActive: true }, select: { id: true, ean: true } }),
    prisma.productBarcode.findMany({ where: { pharmacyId, code: { in: eans }, product: { deletedAt: null, isActive: true } }, select: { code: true, productId: true } }),
  ]);
  const productByEan = new Map<string, string>();
  for (const barcode of barcodes) productByEan.set(barcode.code, barcode.productId);
  for (const product of products) if (product.ean) productByEan.set(product.ean, product.id);

  const familyIds = [...new Set(central.filter((row) => row.triggerKind === "FAMILY").map((row) => row.triggerKey.slice("family:".length)))];
  const families = await loadTriggerFamilies(familyIds);
  const liveFamilies = new Set(families.map((family) => family.id));

  const rules: AssociationInput["rules"] = [];
  const triggerProductIds: string[] = [];
  for (const row of central) {
    if (row.triggerKind === "FAMILY" && !liveFamilies.has(row.triggerKey.slice("family:".length))) continue;
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
  return { rules, triggerProductIds, families };
}

/** Les familles déclencheuses en ligne (non supprimées), avec leurs ajouts et retraits faits à la main. */
export async function loadTriggerFamilies(ids: string[]): Promise<FamilyDefinition[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.triggerFamily.findMany({
    where: { id: { in: ids }, status: { not: "REMOVED" } },
    select: { id: true, includeTerms: true, excludeTerms: true, members: { select: { key: true, included: true } } },
  });
  return rows.map((row) => ({ id: row.id, includeTerms: row.includeTerms, excludeTerms: row.excludeTerms, members: new Map(row.members.map((member) => [member.key, member.included])) }));
}

/** La clé, côté moteur, d'un médicament proposé que l'officine ne détient pas (plus) : le moteur dira « plus au catalogue ». */
const missingDrugAdvice = (specialtyId: string): string => `specialty:${specialtyId}`;

/**
 * Ce que le moteur reçoit : les associations actives — celles de l'officine, puis celles communes à toutes les officines —
 * et ce que chaque ligne de la vente est. `undefined` quand il n'y en a aucune (aucune requête de plus, aucune étape dans
 * la trace).
 *
 * Un médicament proposé (médicament sans ordonnance du stock) est retrouvé dans le stock de CETTE officine — la boîte la mieux
 * fournie de la spécialité — et rendu dans `products`, que l'appelant ajoute au catalogue du moteur AVANT l'analyse : il passe
 * ainsi par les mêmes contrôles de sécurité que tout conseil (prescription, doublon de substance, vigilances, stock).
 */
export async function loadAssociationInput(scope: TenantScope, lines: LineForAssociations[]): Promise<(AssociationInput & { products: CatalogProduct[] }) | undefined> {
  const [rows, common] = await Promise.all([
    prisma.productAssociation.findMany({
      where: {
        pharmacyId: scope.pharmacyId,
        isActive: true,
        AND: [
          { OR: [{ triggerProductId: { not: null }, triggerProduct: { deletedAt: null } }, { triggerSpecialtyId: { not: null } }] },
          { OR: [{ adviceProductId: { not: null }, adviceProduct: { deletedAt: null } }, { adviceSpecialtyId: { not: null } }] },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, triggerProductId: true, triggerSpecialty: { select: { name: true } }, adviceProductId: true, adviceSpecialtyId: true, sentence: true, sortOrder: true },
    }),
    loadCentralRules(scope.pharmacyId),
  ]);
  const drugSpecialtyIds = [...new Set(rows.map((row) => row.adviceSpecialtyId).filter((id): id is string => id !== null))];
  const drugProducts = await loadAssociationDrugProducts(scope, drugSpecialtyIds);
  const own = rows.flatMap((row) => {
    const triggerKey = row.triggerProductId ? productKey(row.triggerProductId) : row.triggerSpecialty ? drugKey(row.triggerSpecialty.name) : null;
    const adviceProductId = row.adviceProductId ?? (row.adviceSpecialtyId ? (drugProducts.get(row.adviceSpecialtyId)?.id ?? missingDrugAdvice(row.adviceSpecialtyId)) : null);
    return triggerKey && adviceProductId ? [{ id: row.id, triggerKey, adviceProductId, sentence: row.sentence, sortOrder: row.sortOrder }] : [];
  });
  const rules = [...own, ...common.rules];
  if (rules.length === 0) return undefined;

  const wanted = {
    productIds: [...new Set([...rows.map((row) => row.triggerProductId).filter((id): id is string => id !== null), ...common.triggerProductIds])],
    drugKeys: new Set(rules.map((rule) => rule.triggerKey).filter((key) => key.startsWith("drug:"))),
    families: common.families,
  };
  return { rules, lines: await resolveLineTriggers(scope.pharmacyId, lines, wanted), products: [...drugProducts.values()] };
}

// ---------------------------------------------------------------------------------------------------------------
// L'écran « Mes associations »
// ---------------------------------------------------------------------------------------------------------------

/** Ce qui est proposé : un produit de l'officine, ou un médicament sans ordonnance de son stock (toutes ses boîtes). */
export type ProductBrief = { kind: "PRODUCT" | "DRUG"; id: string; name: string; brand: string | null; quantity: number; deleted: boolean };

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
  kind: "PRODUCT",
  id: product.id,
  name: product.name,
  brand: product.brand,
  quantity: product.stockItem?.quantity ?? 0,
  deleted: product.deletedAt !== null,
});

const productSelect = { id: true, name: true, brand: true, deletedAt: true, stockItem: { select: { quantity: true } } } as const;

/** Le nombre de boîtes que l'officine détient de chaque spécialité (toutes présentations confondues). */
async function heldQuantities(pharmacyId: string, specialtyIds: string[]): Promise<Map<string, number>> {
  const held = new Map<string, number>();
  if (specialtyIds.length === 0) return held;
  const lines = await prisma.pharmacyDrugStock.findMany({
    where: { pharmacyId, presentation: { specialtyId: { in: specialtyIds } } },
    select: { quantity: true, presentation: { select: { specialtyId: true } } },
  });
  for (const line of lines) held.set(line.presentation.specialtyId, (held.get(line.presentation.specialtyId) ?? 0) + line.quantity);
  return held;
}

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
      adviceSpecialty: { select: { id: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
  const held = await heldQuantities(scope.pharmacyId, [...new Set(rows.flatMap((row) => (row.adviceSpecialty ? [row.adviceSpecialty.id] : [])))]);
  return rows.flatMap((row) => {
    const trigger: TriggerView | null = row.triggerProduct
      ? { kind: "PRODUCT", id: row.triggerProduct.id, name: row.triggerProduct.name, brand: row.triggerProduct.brand, quantity: row.triggerProduct.stockItem?.quantity ?? 0, deleted: row.triggerProduct.deletedAt !== null }
      : row.triggerSpecialty
        ? { kind: "DRUG", id: row.triggerSpecialty.id, name: row.triggerSpecialty.name, brand: null, quantity: null, deleted: false }
        : null;
    const advice: ProductBrief | null = row.adviceProduct
      ? briefOf(row.adviceProduct)
      : row.adviceSpecialty
        ? { kind: "DRUG", id: row.adviceSpecialty.id, name: row.adviceSpecialty.name, brand: null, quantity: held.get(row.adviceSpecialty.id) ?? 0, deleted: false }
        : null;
    if (!trigger || !advice) return [];
    return [{ id: row.id, trigger, advice, sentence: row.sentence, isActive: row.isActive, createdAt: row.createdAt, createdBy: row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}` : null }];
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

/** Un produit proposé écarté : `adviceProductId` pour un produit, `adviceSpecialtyId` pour un médicament. */
export type BatchSkip = { adviceProductId?: string; adviceSpecialtyId?: string; adviceName: string | null; reason: string };
export type BatchCreated = { adviceProductId?: string; adviceSpecialtyId?: string; id: string; adviceName: string };

type AdviceRef = { kind: "PRODUCT" | "DRUG"; id: string };
const refKey = (ref: AdviceRef): string => `${ref.kind}:${ref.id}`;
const refField = (ref: AdviceRef): { adviceProductId: string } | { adviceSpecialtyId: string } => (ref.kind === "PRODUCT" ? { adviceProductId: ref.id } : { adviceSpecialtyId: ref.id });

/**
 * Plusieurs produits proposés d'un coup pour UN déclencheur (« quand la cétirizine est dans la vente, proposer le spray,
 * le collyre et les mouchoirs »). Un produit proposé est un produit de l'officine (`adviceProductIds`) ou un médicament SANS
 * ordonnance de son stock (`adviceSpecialtyIds`). Chacun passe par les mêmes contrôles qu'une association seule ; un produit
 * déjà associé, d'une autre officine, désactivé, soumis à prescription, absent du stock ou identique au déclencheur est
 * écarté AVEC sa raison, sans bloquer les autres. L'écriture est une seule instruction : tout ce qui reste est créé, ou rien.
 * Deux enregistrements simultanés ne créent pas de doublon — la contrainte d'unicité de la base départage, et le perdant
 * est signalé « déjà associé ».
 */
export async function createAssociations(
  scope: TenantScope,
  input: { triggerProductId?: string | null; triggerSpecialtyId?: string | null; adviceProductIds?: string[]; adviceSpecialtyIds?: string[]; sentence?: string | null },
): Promise<{ ok: true; triggerName: string; created: BatchCreated[]; skipped: BatchSkip[] } | Failure> {
  const sentence = cleanSentence(input.sentence);
  const refs: AdviceRef[] = [];
  const seen = new Set<string>();
  for (const ref of [...(input.adviceProductIds ?? []).map((id) => ({ kind: "PRODUCT" as const, id })), ...(input.adviceSpecialtyIds ?? []).map((id) => ({ kind: "DRUG" as const, id }))]) {
    if (!ref.id || seen.has(refKey(ref))) continue;
    seen.add(refKey(ref));
    refs.push(ref);
  }
  if (refs.length === 0) return { ok: false, error: "Choisissez au moins un produit à conseiller." };
  if (refs.length > MAX_ADVICE_PER_SAVE) return { ok: false, error: `${MAX_ADVICE_PER_SAVE} produits au plus en une fois.` };
  // Le déclencheur et la phrase se vérifient une fois : seul le produit proposé change d'une association à l'autre (le
  // produit associé à lui-même est écarté plus bas, sans bloquer les autres — sauf s'il est le seul).
  const firstOther = refs.find((ref) => !(ref.kind === "PRODUCT" && ref.id === input.triggerProductId)) ?? refs[0];
  const invalid = associationError({ triggerProductId: input.triggerProductId, triggerSpecialtyId: input.triggerSpecialtyId, adviceProductId: firstOther.id, sentence });
  if (invalid) return { ok: false, error: invalid };

  const productIds = refs.filter((ref) => ref.kind === "PRODUCT").map((ref) => ref.id);
  const specialtyIds = refs.filter((ref) => ref.kind === "DRUG").map((ref) => ref.id);

  let triggerName: string;
  let triggerDrugKey: string | null = null;
  let trigger: { triggerProductId: string } | { triggerSpecialtyId: string };
  const existing = new Set<string>();
  if (input.triggerProductId) {
    const product = await ownProduct(scope, input.triggerProductId);
    if (!product) return { ok: false, error: "Produit introuvable dans votre catalogue." };
    triggerName = product.name;
    trigger = { triggerProductId: product.id };
    const rows = await prisma.productAssociation.findMany({
      where: { pharmacyId: scope.pharmacyId, triggerProductId: product.id, OR: [...(productIds.length ? [{ adviceProductId: { in: productIds } }] : []), ...(specialtyIds.length ? [{ adviceSpecialtyId: { in: specialtyIds } }] : [])] },
      select: { adviceProductId: true, adviceSpecialtyId: true },
    });
    for (const row of rows) existing.add(row.adviceProductId ? `PRODUCT:${row.adviceProductId}` : `DRUG:${row.adviceSpecialtyId}`);
  } else {
    const specialty = await prisma.drugSpecialty.findUnique({ where: { id: input.triggerSpecialtyId as string }, select: { id: true, name: true } });
    if (!specialty) return { ok: false, error: "Médicament introuvable dans le catalogue national." };
    triggerName = specialty.name.split(",")[0].trim();
    triggerDrugKey = drugKey(specialty.name);
    trigger = { triggerSpecialtyId: specialty.id };
    // Toutes les formes d'un même nom se valent : un doublon se reconnaît au nom, pas seulement à l'identifiant.
    const rows = await prisma.productAssociation.findMany({
      where: { pharmacyId: scope.pharmacyId, triggerSpecialtyId: { not: null }, OR: [...(productIds.length ? [{ adviceProductId: { in: productIds } }] : []), ...(specialtyIds.length ? [{ adviceSpecialtyId: { in: specialtyIds } }] : [])] },
      select: { adviceProductId: true, adviceSpecialtyId: true, triggerSpecialty: { select: { name: true } } },
    });
    for (const row of rows) {
      if (!row.triggerSpecialty || drugKey(row.triggerSpecialty.name) !== triggerDrugKey) continue;
      existing.add(row.adviceProductId ? `PRODUCT:${row.adviceProductId}` : `DRUG:${row.adviceSpecialtyId}`);
    }
  }

  const [products, specialties, held] = await Promise.all([
    productIds.length ? prisma.product.findMany({ where: { id: { in: productIds }, pharmacyId: scope.pharmacyId, deletedAt: null }, select: { id: true, name: true, isActive: true } }) : Promise.resolve([]),
    specialtyIds.length ? prisma.drugSpecialty.findMany({ where: { id: { in: specialtyIds } }, select: { id: true, name: true, withdrawnAt: true, prescriptionConditions: { select: { label: true } } } }) : Promise.resolve([]),
    heldQuantities(scope.pharmacyId, specialtyIds),
  ]);
  const productById = new Map(products.map((product) => [product.id, product]));
  const specialtyById = new Map(specialties.map((specialty) => [specialty.id, specialty]));
  const skipped: BatchSkip[] = [];
  const accepted: { ref: AdviceRef; name: string }[] = [];
  for (const ref of refs) {
    const skip = (adviceName: string | null, reason: string) => skipped.push({ ...refField(ref), adviceName, reason });
    if (ref.kind === "PRODUCT") {
      const product = productById.get(ref.id);
      if (!product) skip(null, "Produit introuvable dans votre catalogue.");
      else if (!product.isActive) skip(product.name, `« ${product.name} » est désactivé : on ne peut pas le conseiller.`);
      else if ("triggerProductId" in trigger && trigger.triggerProductId === ref.id) skip(product.name, "Un produit ne peut pas être associé à lui-même.");
      else if (existing.has(refKey(ref))) skip(product.name, `« ${product.name} » est déjà associé à « ${triggerName} ».`);
      else accepted.push({ ref, name: product.name });
      continue;
    }
    const specialty = specialtyById.get(ref.id);
    const name = specialty ? specialty.name.split(",")[0].trim() : null;
    // Un médicament proposé en vente additionnelle : jamais sur ordonnance, toujours une boîte que l'officine détient.
    if (!specialty || specialty.withdrawnAt || !held.has(ref.id)) skip(name, name ? `« ${name} » n'est pas dans votre stock : on ne propose que ce que l'officine peut remettre.` : "Médicament introuvable dans votre stock.");
    else if (specialty.prescriptionConditions.length > 0) skip(name, `« ${name} » est soumis à prescription : jamais proposé en vente additionnelle.`);
    else if (triggerDrugKey && drugKey(specialty.name) === triggerDrugKey) skip(name, "Un médicament ne peut pas être associé à lui-même.");
    else if (existing.has(refKey(ref))) skip(name, `« ${name} » est déjà associé à « ${triggerName} ».`);
    else accepted.push({ ref, name: name as string });
  }
  if (accepted.length === 0) return { ok: true, triggerName, created: [], skipped };

  const last = await prisma.productAssociation.findFirst({ where: { pharmacyId: scope.pharmacyId, ...trigger }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const first = (last?.sortOrder ?? 0) + 1;
  const rows = await prisma.productAssociation.createManyAndReturn({
    // Dans l'ordre où le pharmacien les a choisis : c'est aussi l'ordre de proposition au comptoir.
    data: accepted.map(({ ref }, index) => ({ pharmacyId: scope.pharmacyId, ...trigger, ...refField(ref), sentence, sortOrder: first + index, createdByUserId: scope.userId })),
    skipDuplicates: true,
    select: { id: true, adviceProductId: true, adviceSpecialtyId: true },
  });
  const createdIds = new Map(rows.map((row) => [row.adviceProductId ? `PRODUCT:${row.adviceProductId}` : `DRUG:${row.adviceSpecialtyId}`, row.id]));
  const created: BatchCreated[] = [];
  for (const { ref, name } of accepted) {
    const id = createdIds.get(refKey(ref));
    if (id) created.push({ id, ...refField(ref), adviceName: name });
    else skipped.push({ ...refField(ref), adviceName: name, reason: `« ${name} » est déjà associé à « ${triggerName} ».` });
  }
  for (const row of created) {
    await recordAudit({
      action: "association.created",
      entityType: "ProductAssociation",
      entityId: row.id,
      pharmacyId: scope.pharmacyId,
      userId: scope.userId,
      metadata: { ...trigger, ...(row.adviceProductId ? { adviceProductId: row.adviceProductId } : { adviceSpecialtyId: row.adviceSpecialtyId }), trigger: "triggerProductId" in trigger ? "PRODUCT" : "DRUG", withSentence: sentence !== null, batch: created.length },
    });
  }
  return { ok: true, triggerName, created, skipped };
}

export type GridSaveResult = {
  /** Toutes les associations créées, déclencheur par déclencheur. */
  created: (BatchCreated & { triggerName: string })[];
  skipped: (BatchSkip & { triggerName: string | null })[];
};

/**
 * Plusieurs déclencheurs × plusieurs produits proposés : « quand la cétirizine OU la desloratadine est dans la vente,
 * proposer le spray ET le collyre » crée les quatre associations. Chaque déclencheur passe par `createAssociations` (mêmes
 * contrôles, doublons écartés avec leur raison) ; un déclencheur refusé (introuvable…) ne bloque pas les autres.
 */
export async function createAssociationGrid(
  scope: TenantScope,
  input: { triggers: { kind: "PRODUCT" | "DRUG"; id: string }[]; advice: { kind: "PRODUCT" | "DRUG"; id: string }[]; sentence?: string | null },
): Promise<{ ok: true; result: GridSaveResult } | Failure> {
  const triggers = [...new Map(input.triggers.filter((trigger) => trigger.id).map((trigger) => [`${trigger.kind}:${trigger.id}`, trigger])).values()];
  if (triggers.length === 0) return { ok: false, error: "Choisissez au moins un produit ou un médicament déclencheur." };
  if (triggers.length > MAX_TRIGGERS_PER_SAVE) return { ok: false, error: `${MAX_TRIGGERS_PER_SAVE} déclencheurs au plus en une fois.` };
  const adviceProductIds = input.advice.filter((ref) => ref.kind === "PRODUCT").map((ref) => ref.id);
  const adviceSpecialtyIds = input.advice.filter((ref) => ref.kind === "DRUG").map((ref) => ref.id);
  if (adviceProductIds.length + adviceSpecialtyIds.length === 0) return { ok: false, error: "Choisissez au moins un produit à conseiller." };

  const result: GridSaveResult = { created: [], skipped: [] };
  for (const trigger of triggers) {
    const saved = await createAssociations(scope, {
      ...(trigger.kind === "PRODUCT" ? { triggerProductId: trigger.id } : { triggerSpecialtyId: trigger.id }),
      adviceProductIds,
      adviceSpecialtyIds,
      sentence: input.sentence,
    });
    if (!saved.ok) {
      // Une erreur commune à tous (phrase trop longue, trop de produits) : inutile de la répéter pour chaque déclencheur.
      if (triggers.length === 1 || saved.error.includes("au plus") || saved.error.includes("phrase")) return saved;
      result.skipped.push({ adviceName: null, reason: saved.error, triggerName: null });
      continue;
    }
    for (const row of saved.created) result.created.push({ ...row, triggerName: saved.triggerName });
    for (const row of saved.skipped) result.skipped.push({ ...row, triggerName: saved.triggerName });
  }
  return { ok: true, result };
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
