import type {
  CatalogProduct,
  DrugKnowledge,
  OfficialDrugFacts,
  PatientContext,
  PharmacyRuleInput,
} from "../types";

export function drug(overrides: Partial<DrugKnowledge> = {}): DrugKnowledge {
  return {
    id: "drug-1",
    name: "Amoxicilline",
    inn: "Amoxicilline",
    atcCode: "J01CA04",
    therapeuticClass: "Antibiotique de la famille des pénicillines",
    form: "Comprimé",
    commonSideEffects: ["diarrhée", "troubles digestifs"],
    interactionClasses: [],
    cautionPopulations: [],
    patientExplanation: "Cet antibiotique combat une infection bactérienne.",
    intakeAdvice: "À prendre au cours des repas.",
    sourceName: "Test",
    sourceVersion: "1.0",
    isDemoData: false,
    ...overrides,
  };
}

export function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "prod-1",
    origin: "PHARMACY_CATALOG",
    presentationId: null,
    substances: [],
    prescriptionConditions: [],
    name: "Flore Équilibre",
    brand: "Vitalys",
    category: "PROBIOTIQUES",
    subCategory: "Ferments lactiques",
    reference: "REF-0001",
    ean: "3400900000011",
    imageUrl: null,
    description: "Gélules de ferments lactiques",
    commercialClaims: ["Contribue à l'équilibre de la flore intestinale"],
    precautions: [],
    matchingTags: ["probiotique", "flore", "intestinale", "tolérance", "digestive"],
    contraindications: [],
    salePriceCents: 1490,
    purchasePriceCents: 620,
    vatRate: 5.5,
    stockQuantity: 20,
    alertThreshold: 5,
    availableInSiblingPharmacy: false,
    isActive: true,
    ...overrides,
  };
}

export function patient(overrides: Partial<PatientContext> = {}): PatientContext {
  return {
    patientId: "pat-1",
    ageYears: 42,
    sex: "FEMALE",
    isPregnant: false,
    isBreastfeeding: false,
    renalImpairment: false,
    hepaticImpairment: false,
    allergies: [],
    chronicConditions: [],
    currentTreatments: [],
    hasAdviceConsent: true,
    ...overrides,
  };
}

export function rule(overrides: Partial<PharmacyRuleInput> = {}): PharmacyRuleInput {
  return {
    id: "rule-1",
    type: "PREFER_PRODUCT",
    productId: "prod-1",
    category: null,
    context: {},
    weight: 1,
    ...overrides,
  };
}

export function officialFacts(
  overrides: Partial<OfficialDrugFacts> = {},
): OfficialDrugFacts {
  return {
    cisCode: "61266250",
    name: "AMOXICILLINE ARROW 1 g, comprimé dispersible",
    pharmaceuticalForm: "comprimé dispersible",
    administrationRoutes: ["orale"],
    substances: ["AMOXICILLINE"],
    prescriptionConditions: ["liste I"],
    marketed: true,
    sourceName: "Base de données publique des médicaments",
    sourceUpdatedAt: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}
