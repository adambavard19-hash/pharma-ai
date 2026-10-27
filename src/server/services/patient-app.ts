import "server-only";
import { prisma } from "@/server/db/client";
import { runAnalysisPipeline } from "@/core/ai/pipeline";
import { classifiedDrugKnowledge } from "@/core/ai/classified-knowledge";
import { deriveUnderstanding } from "@/core/understanding";
import { classifyProductByName } from "@/core/catalog/product-vocabulary";
import { officialAtcForCis } from "@/core/reference/atc/official-atc";
import type { CatalogProduct, PatientContext } from "@/core/ai/types";
import { buildDrugSheet, isParapharmacy, normalizeScannedCode, type DrugSheet, type ParaSheet, type PatientAdvice } from "@/core/patient-app/sheet";
import { searchSpecialties } from "./drug-identification";
import { loadCentralAdvice } from "./central-advice";

/**
 * L'appli grand public (phase 1, 21 oct. 2026) : la fiche d'une boîte scannée et ses conseils de parapharmacie.
 * Lecture seule, rien n'est enregistré du scan (aucune donnée de santé en phase 1). Données publiques seulement : la base
 * officielle des médicaments, la famille Open Medic, les produits des marques partenaires publiées — jamais le stock ni les
 * prix d'une officine.
 */

/** Un particulier : rien de déclaré. Les conseils sont ceux « par défaut », avec les garde-fous du moteur. */
const PUBLIC_PATIENT: PatientContext = { patientId: null, ageYears: null, sex: "UNSPECIFIED", isPregnant: null, isBreastfeeding: null, renalImpairment: null, hepaticImpairment: null, allergies: [], chronicConditions: [], currentTreatments: [], hasAdviceConsent: false };

const SPECIALTY_SELECT = {
  id: true,
  cisCode: true,
  name: true,
  pharmaceuticalForm: true,
  administrationRoutes: true,
  compositions: { select: { substanceLabel: true, dosage: true, nature: true }, orderBy: { linkNumber: "asc" } },
  prescriptionConditions: { select: { label: true } },
} as const;

type SpecialtyRow = {
  id: string;
  cisCode: string;
  name: string;
  pharmaceuticalForm: string | null;
  administrationRoutes: string[];
  compositions: { substanceLabel: string; dosage: string | null; nature: string }[];
  prescriptionConditions: { label: string }[];
};

async function sheetFor(specialty: SpecialtyRow, presentation: { label: string; reimbursementRate: number | null } | null): Promise<DrugSheet> {
  const [sideEffects, editorial] = await Promise.all([
    prisma.drugOfficialSideEffects.findUnique({ where: { cisCode: specialty.cisCode }, select: { status: true, effects: true } }),
    prisma.drugReference.findFirst({ where: { cisCode: specialty.cisCode, isDemoData: false }, select: { patientExplanation: true, intakeAdvice: true, sourceName: true } }),
  ]);
  const family = officialAtcForCis(specialty.cisCode);
  // La substance active telle que formulée (SA) ; la fraction thérapeutique (FT) seulement quand il n'y a qu'elle.
  const active = specialty.compositions.filter((c) => c.nature === "SA");
  const substances = (active.length > 0 ? active : specialty.compositions).map((c) => ({ label: c.substanceLabel, dosage: c.dosage }));
  return buildDrugSheet({
    cisCode: specialty.cisCode,
    name: specialty.name,
    form: specialty.pharmaceuticalForm,
    routes: specialty.administrationRoutes,
    presentation: presentation?.label ?? null,
    substances: [...new Map(substances.map((s) => [`${s.label}|${s.dosage}`, s])).values()],
    prescriptionConditions: specialty.prescriptionConditions.map((c) => c.label),
    reimbursementRate: presentation?.reimbursementRate ?? null,
    family: family ? { atcCode: family.atcCode, label: family.therapeuticClass } : null,
    officialSideEffects: sideEffects?.status === "READ" ? sideEffects.effects : [],
    editorial: editorial ? { explanation: editorial.patientExplanation, intake: editorial.intakeAdvice, sourceName: editorial.sourceName } : null,
  });
}

export type LookupResult = { found: false } | { found: true; sheet: DrugSheet; specialtyId: string } | { found: true; sheet: ParaSheet; specialtyId: null };

/** Une boîte scannée ou un code tapé → sa fiche. */
export async function lookupProductByCode(raw: string): Promise<LookupResult> {
  const code = normalizeScannedCode(raw);
  if (!code) return { found: false };
  if (code.kind === "CIP13" || code.kind === "CIP7") {
    const presentation = await prisma.drugPresentation.findUnique({
      where: code.kind === "CIP13" ? { cip13: code.code } : { cip7: code.code },
      select: { label: true, reimbursementRate: true, specialty: { select: SPECIALTY_SELECT } },
    });
    if (!presentation) return { found: false };
    return { found: true, sheet: await sheetFor(presentation.specialty, presentation), specialtyId: presentation.specialty.id };
  }
  // Parapharmacie : un produit d'une marque partenaire publiée, sinon le nom et la marque lus sur l'étiquette d'une officine.
  const partner = await prisma.partnerProduct.findFirst({
    where: { ean: code.code, isActive: true, brand: { status: "ACTIVE" } },
    select: { name: true, imageUrl: true, brand: { select: { name: true, universes: true } } },
  });
  if (partner) return { found: true, specialtyId: null, sheet: { kind: "PARA", ean: code.code, name: partner.name, brand: partner.brand.name, imageUrl: partner.imageUrl, category: partner.brand.universes[0] ?? null } };
  const product = await prisma.product.findFirst({
    where: { ean: code.code, deletedAt: null, isActive: true, pharmacy: { isDemo: false } },
    select: { name: true, brand: true, imageUrl: true, category: true },
  });
  if (!product) return { found: false };
  return { found: true, specialtyId: null, sheet: { kind: "PARA", ean: code.code, name: product.name, brand: product.brand, imageUrl: product.imageUrl, category: product.category } };
}

/** La fiche d'une spécialité, par son identifiant (depuis la recherche par nom). */
export async function lookupSpecialty(specialtyId: string): Promise<DrugSheet | null> {
  const specialty = await prisma.drugSpecialty.findUnique({ where: { id: specialtyId }, select: { ...SPECIALTY_SELECT, presentations: { where: { withdrawnAt: null }, take: 1, select: { label: true, reimbursementRate: true } } } });
  if (!specialty) return null;
  return sheetFor(specialty, specialty.presentations[0] ?? null);
}

/** La recherche par nom ou substance (saisie manuelle, quand la caméra ne lit pas). */
export async function searchPublicProducts(query: string): Promise<{ id: string; name: string; form: string | null }[]> {
  const rows = await searchSpecialties(query, 15);
  return rows.map((row) => ({ id: row.id, name: row.name, form: row.pharmaceuticalForm }));
}

/** Trois conseils au plus, les plus importants d'abord (sécurité avant confort) : un particulier lit vite. */
export const MAX_PATIENT_ADVICE = 3;

/** Les produits des marques partenaires publiées, vus comme un catalogue : de la parapharmacie seulement. */
async function partnerCatalog(): Promise<{ catalog: CatalogProduct[]; brands: Map<string, string | null> }> {
  const rows = await prisma.partnerProduct.findMany({
    where: { isActive: true, brand: { status: "ACTIVE", partner: { status: "ACTIVE" } } },
    select: { id: true, name: true, ean: true, cip13: true, description: true, imageUrl: true, publicPriceCents: true, brand: { select: { name: true } } },
    take: 2000,
  });
  const brands = new Map<string, string | null>();
  const catalog: CatalogProduct[] = [];
  for (const row of rows) {
    if (!isParapharmacy(row)) continue;
    const classified = classifyProductByName(row.name, { brand: row.brand.name, description: row.description });
    brands.set(row.id, row.brand.name);
    catalog.push({
      id: row.id,
      origin: "PHARMACY_CATALOG",
      presentationId: null,
      substances: [],
      prescriptionConditions: [],
      name: row.name,
      brand: row.brand.name,
      category: classified?.category ?? "AUTRE",
      subCategory: null,
      reference: row.id,
      ean: row.ean,
      imageUrl: row.imageUrl,
      description: row.description,
      commercialClaims: [],
      precautions: [],
      matchingTags: classified?.tags ?? [],
      contraindications: [],
      salePriceCents: row.publicPriceCents ?? 0,
      purchasePriceCents: 0,
      vatRate: 20,
      stockQuantity: 1,
      alertThreshold: 0,
      availableInSiblingPharmacy: false,
      isActive: true,
    });
  }
  return { catalog, brands };
}

/**
 * Les conseils de parapharmacie pour ce médicament : le moteur réel du comptoir (règles, garde-fous de sécurité,
 * décisions de la console), sur le catalogue des marques partenaires. Un besoin sans produit partenaire reste affiché,
 * sans produit : « demandez conseil à votre pharmacien ». Famille officielle inconnue : aucun conseil (rien n'est deviné).
 */
export async function adviceForSpecialty(specialtyId: string): Promise<PatientAdvice[]> {
  const specialty = await prisma.drugSpecialty.findUnique({ where: { id: specialtyId }, select: { name: true, cisCode: true, pharmaceuticalForm: true, compositions: { where: { nature: { in: ["FT", "SA"] } }, select: { substanceLabel: true, nature: true } } } });
  if (!specialty) return [];
  const official = officialAtcForCis(specialty.cisCode);
  if (!official) return [];
  const substance = specialty.compositions.find((item) => item.nature === "FT")?.substanceLabel ?? specialty.compositions[0]?.substanceLabel ?? null;
  const name = specialty.name.split(",")[0].trim();
  const [{ catalog }, central] = await Promise.all([partnerCatalog(), loadCentralAdvice()]);
  const key = name.toLowerCase();
  const classification = { lineIndex: 0, substance, atcCode: official.atcCode, therapeuticClass: official.therapeuticClass, commonSideEffects: [], confidence: 1, source: "OFFICIAL" as const };
  const understanding = deriveUnderstanding({ drugs: [classification], patient: { ageYears: null, sex: "UNSPECIFIED", isPregnant: null, isBreastfeeding: null }, providerId: "appli-patients", model: "aucun" });
  const result = runAnalysisPipeline({
    lines: [{ lineIndex: 0, drugName: name, posology: null, durationDays: null, confirmed: true }],
    knowledge: new Map([[key, classifiedDrugKnowledge({ key, drugName: name, form: specialty.pharmaceuticalForm, classification, publishedSubstance: substance, model: "aucun" })]]),
    patient: PUBLIC_PATIENT,
    catalog,
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    preferredRanges: [],
    understanding,
    usedSimulatedProviders: false,
    disabledRuleKeys: central.removed,
    customRules: central.custom,
  });
  const byId = new Map(catalog.map((product) => [product.id, product]));
  return result.opportunities
    .filter((opportunity) => !opportunity.isBlocked)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_PATIENT_ADVICE)
    .map((opportunity) => ({
      title: opportunity.title,
      reason: opportunity.shortReason,
      products: result.recommendations
        .filter((recommendation) => recommendation.opportunityKey === opportunity.key)
        .map((recommendation) => byId.get(recommendation.productId))
        .filter((product): product is CatalogProduct => Boolean(product) && isParapharmacy(product!))
        .map((product) => ({ id: product.id, name: product.name, brand: product.brand, imageUrl: product.imageUrl, partner: true })),
    }));
}

/** Les pharmacies PharmaBoost, pour « Trouver une pharmacie » : les officines clientes actives (hors démonstration). */
export async function listPublicPharmacies(): Promise<{ id: string; name: string; city: string | null; postalCode: string | null; address: string | null }[]> {
  const rows = await prisma.pharmacy.findMany({ where: { isActive: true, isDemo: false }, select: { id: true, name: true, city: true, postalCode: true, addressLine1: true }, orderBy: [{ city: "asc" }, { name: "asc" }], take: 500 });
  return rows.map((row) => ({ id: row.id, name: row.name, city: row.city, postalCode: row.postalCode, address: row.addressLine1 }));
}
