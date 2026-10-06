import type { AdviceAlternativeView, AdviceView, SaleLineDraft } from "../types";

/** Un conseil tel que la page le fournit, avec de quoi remplir chaque carte. */
export const advice = (overrides: Partial<AdviceView> = {}): AdviceView => ({
  id: "rec_1",
  lineIds: [],
  alternatives: [],
  status: "PROPOSED",
  origin: "AI",
  family: "COMPLEMENT",
  totalScore: 80,
  justification: "Justification longue du moteur.",
  shortReason: "La flore intestinale peut être perturbée pendant la cure.",
  patientReason: "Pour accompagner votre flore.",
  counterScript: "« Ce produit accompagne la flore pendant la cure. »",
  precautions: [],
  quantity: 1,
  unitPriceCents: 1490,
  pharmacistNote: null,
  decidedBy: null,
  explanation: [],
  opportunity: {
    id: "opp_1",
    title: "Tolérance digestive",
    rationale: "Antibiotique prescrit.",
    clinicalContext: null,
    priority: 5,
    safetyNotes: [],
    question: null,
    requiresConfirmation: false,
    answer: null,
    answeredAt: null,
    aiJustification: null,
    confirmedReason: null,
    benefits: [],
  },
  routine: null,
  companion: null,
  vigilances: [],
  requiresValidation: false,
  shortDate: null,
  trainings: [],
  product: {
    id: "p_1",
    presentationId: null,
    name: "Flore Équilibre 10 milliards",
    brand: "Vitalys",
    imageUrl: null,
    imageSource: null,
    salePriceCents: 1490,
    quantity: 12,
    alertThreshold: 3,
    claims: [],
  },
  ...overrides,
});

/** Une autre référence du stock, adaptée au même besoin. */
export const alternative = (overrides: Partial<AdviceAlternativeView> = {}): AdviceAlternativeView => ({
  productId: "alt_1",
  name: "Ultra-Levure 200 mg",
  brand: "Biocodex",
  imageUrl: null,
  salePriceCents: 1190,
  quantity: 8,
  shortReason: "Même besoin : soutient la flore pendant l'antibiothérapie.",
  ...overrides,
});

/** Une ligne d'ordonnance confirmée, comme l'écran la reçoit. */
export const line = (overrides: Partial<SaleLineDraft> = {}): SaleLineDraft => ({
  id: "line_1",
  position: 0,
  rawText: null,
  drugName: "AMOXICILLINE ALMUS",
  dosage: "1 g",
  form: "comprimé",
  posology: "1 comprimé matin et soir",
  schedule: null,
  scheduleInferred: false,
  durationDays: 6,
  quantity: 1,
  instructions: "",
  confidence: {},
  unreadableFields: [],
  confirmed: true,
  purpose: null,
  explanationSource: null,
  official: null,
  availability: null,
  identifiedBy: null,
  candidates: [],
  identificationRefusal: null,
  strengthOptions: [],
  cisCode: null,
  regulation: { alerts: [], checked: [] },
  ...overrides,
});

/** Le HTML échappe l'apostrophe : on compare le texte que lit le pharmacien. */
export const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
