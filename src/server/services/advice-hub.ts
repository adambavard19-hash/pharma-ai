import "server-only";
import { prisma } from "@/server/db/client";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { MAX_RECOMMENDATIONS_COUNTER_SCAN } from "@/config/constants";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { runAnalysisPipeline } from "@/core/ai/pipeline";
import { classifiedDrugKnowledge } from "@/core/ai/classified-knowledge";
import { deriveUnderstanding } from "@/core/understanding";
import { CENTRAL_STATUS_LABELS } from "@/core/ai/central-advice-constants";
import { QUESTION_TREES } from "@/core/counter/question-tree";
import { officialAtcForCis, officialTherapeuticClass } from "@/core/reference/atc/official-atc";
import { searchableText, wordsOf } from "@/core/search/tolerant-search";
import { medicineTerms, parseHubQuery, type HubFacets } from "@/core/admin/advice-hub";
import type { PatientContext } from "@/core/ai/types";
import { searchSpecialties } from "./drug-identification";
import { enrichCatalog, loadCatalogSnapshot, loadNationalDrugCandidates, loadPharmacyRules, loadPreferredRanges } from "./catalog";
import { loadCentralAdvice, type CentralAssociationView, type CentralRuleView } from "./central-advice";
import type { RobotProposalView } from "./robot-proposals";

/**
 * « Conseils » dans la console : la partie serveur de l'endroit unique (voir core/admin/advice-hub.ts).
 *
 *  • ce que la recherche et les filtres savent de chaque conseil (`*Facets`) ;
 *  • la recherche PAR MÉDICAMENT : un mot tapé (« Doliprane », « cétirizine », « Maalox ») est cherché dans le catalogue
 *    national ; sa famille officielle (Open Medic) dit quels conseils s'y appliquent ;
 *  • l'aperçu « ce que PharmaBoost proposerait » pour un médicament dans une pharmacie choisie : le moteur réel, le stock réel
 *    de cette pharmacie, un patient adulte sans rien de déclaré. Lecture seule : rien n'est écrit, aucune vente n'est créée.
 */

const join = (parts: (string | null | undefined | false)[]): string => parts.filter(Boolean).join(" · ");

/** Les libellés officiels des familles ATC d'une liste de codes (« R06A » → « antihistaminiques a usage systemique »). */
function familyLabels(prefixes: readonly string[]): string[] {
  return [...new Set(prefixes.flatMap((prefix) => (prefix.length >= 4 ? [officialTherapeuticClass(prefix)] : [])).filter((label): label is string => Boolean(label)))];
}

export function ruleFacets(rule: CentralRuleView, robotKeys: ReadonlySet<string>): HubFacets {
  return {
    id: rule.id,
    trigger: "MEDICINE",
    review: rule.status === "ACTIVE" || rule.outdated,
    robot: robotKeys.has(rule.ruleKey),
    removed: rule.status === "REMOVED",
    atcPrefixes: rule.atcPrefixes,
    searchText: join([
      rule.title,
      rule.when,
      rule.sideEffects.join(" "),
      rule.proposes,
      rule.matchingTags.join(" "),
      rule.edit.preferWords.join(" "),
      rule.script,
      rule.reason,
      rule.patientReason,
      rule.question,
      rule.safetyNotes.join(" "),
      rule.source,
      rule.atcPrefixes.join(" "),
      familyLabels(rule.atcPrefixes).join(" "),
      rule.codeExclusions.join(" "),
      rule.addedExclusions.join(" "),
      rule.populations.join(" "),
      CENTRAL_STATUS_LABELS[rule.status],
      rule.decidedBy,
      rule.origin === "ADDED" ? "ajouté par l'équipe" : "règle du moteur",
      rule.modified ? `modifié ${rule.modified.by ?? ""}` : null,
    ]),
  };
}

export function associationFacets(association: CentralAssociationView, robotKeys: ReadonlySet<string>): HubFacets {
  return {
    id: `association:${association.id}`,
    trigger: association.triggerKind === "MEDICINE" ? "MEDICINE" : "PRODUCT",
    review: association.status === "ACTIVE",
    robot: robotKeys.has(`association:${association.id}`),
    removed: association.status === "REMOVED",
    atcPrefixes: [],
    searchText: join([association.triggerLabel, association.adviceLabel, association.sentence, association.adviceEan, association.triggerKind === "MEDICINE" ? "médicament" : association.triggerKind === "FAMILY" ? "famille produit association" : "produit association", CENTRAL_STATUS_LABELS[association.status], association.createdBy, association.decidedBy]),
  };
}

export function robotFacets(proposal: RobotProposalView): HubFacets {
  return {
    id: `robot:${proposal.id}`,
    trigger: "MEDICINE",
    review: proposal.status === "PENDING",
    robot: true,
    removed: proposal.status === "REFUSED",
    atcPrefixes: proposal.atcCode ? [proposal.atcCode] : [],
    searchText: join([
      proposal.drugLabel,
      proposal.substance,
      proposal.atcCode,
      familyLabels(proposal.atcCode ? [proposal.atcCode] : []).join(" "),
      proposal.productName,
      proposal.productBrand,
      proposal.categoryLabel,
      proposal.productTags.join(" "),
      proposal.needLabel,
      proposal.reason,
      proposal.script,
      proposal.pharmacies.join(" "),
      "robot suggestion",
    ]),
  };
}

/** Les conseils centraux nés d'une suggestion du robot validée (« rule:<clé> » est donné par sa clé, « association:<id> » tel quel). */
export async function robotOriginKeys(): Promise<Set<string>> {
  const rows = await prisma.robotRuleProposal.findMany({ where: { status: "VALIDATED", centralRef: { not: null } }, select: { centralRef: true } });
  return new Set(rows.flatMap((row) => (row.centralRef ? [row.centralRef] : [])));
}

// ---------------------------------------------------------------------------------------------------------------
// L'arbre de questions
// ---------------------------------------------------------------------------------------------------------------

export type TreeSummary = { key: string; questions: string[]; atcPrefixes: string[] };

/** Les arbres de questions du comptoir, et les familles de médicaments où ils s'ouvrent (celles des conseils qu'ils débloquent). */
export function questionTreeSummaries(): TreeSummary[] {
  return QUESTION_TREES.map((tree) => {
    const unlocked = new Set(Object.values(tree.nodes).flatMap((node) => node.choices.flatMap((choice) => choice.unlocks ?? [])));
    const atcPrefixes = [...new Set(ADVICE_RULES.filter((rule) => unlocked.has(rule.key)).flatMap((rule) => rule.atcPrefixes))];
    return { key: tree.key, questions: Object.values(tree.nodes).map((node) => node.question.replaceAll("{drug}", "ce médicament")), atcPrefixes };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Partir d'un médicament
// ---------------------------------------------------------------------------------------------------------------

export type MedicineCard = { specialtyId: string; name: string; substances: string[]; atcCode: string; family: string | null };

export type MedicineSearch = {
  /** Pour chaque mot tapé, les codes de famille des médicaments qu'il désigne (vide : ce n'est pas un médicament connu). */
  codes: Record<string, string[]>;
  /** Les médicaments que la saisie désigne vraiment (son nom ou une substance commence par le premier mot), une carte par famille. */
  medicines: MedicineCard[];
};

/** Le premier mot du nom, ou un mot d'une substance, commence par ce que la pharmacienne a tapé : c'est bien ce médicament. */
function designates(term: string, name: string, substances: string[]): boolean {
  const first = wordsOf(searchableText(name))[0] ?? "";
  if (first.startsWith(term)) return true;
  return substances.some((substance) => wordsOf(searchableText(substance)).some((word) => word.length >= 4 && word.startsWith(term)));
}

/**
 * Ce que la saisie désigne comme médicaments, d'après le catalogue national : les familles officielles (Open Medic) par mot
 * tapé, et les médicaments eux-mêmes pour la vue « Ce médicament ». Un mot qui ne désigne aucun médicament ne renvoie rien.
 */
export async function resolveMedicineSearch(raw: string): Promise<MedicineSearch> {
  const query = parseHubQuery(raw);
  const terms = medicineTerms(query).slice(0, 4);
  const codes: Record<string, string[]> = {};
  const medicines = new Map<string, MedicineCard>();
  await Promise.all(
    terms.map(async (term, index) => {
      const found = await searchSpecialties(term, 40);
      const atc = new Set<string>();
      for (const specialty of found) {
        const official = officialAtcForCis(specialty.cisCode);
        if (!official) continue;
        atc.add(official.atcCode);
        if (index === 0 && designates(term, specialty.name, specialty.substances) && !medicines.has(official.atcCode)) {
          medicines.set(official.atcCode, { specialtyId: specialty.id, name: specialty.name.split(",")[0].trim(), substances: specialty.substances.slice(0, 4), atcCode: official.atcCode, family: official.therapeuticClass });
        }
      }
      if (atc.size > 0) codes[term] = [...atc].slice(0, 40);
    }),
  );
  return { codes, medicines: [...medicines.values()].slice(0, 4) };
}

// ---------------------------------------------------------------------------------------------------------------
// L'aperçu : ce que PharmaBoost proposerait
// ---------------------------------------------------------------------------------------------------------------

export type PreviewPharmacy = { id: string; name: string };

export async function listPreviewPharmacies(): Promise<PreviewPharmacy[]> {
  return prisma.pharmacy.findMany({ where: { isDemo: false }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 });
}

export type AdvicePreview = {
  pharmacyName: string;
  medicine: string;
  proposals: { title: string; product: string; script: string }[];
  /** Les besoins repérés pour lesquels le stock n'a rien d'adapté (le robot pourra compléter au comptoir). */
  uncovered: string[];
  notes: string[];
};

/** Un patient adulte, rien de déclaré : l'aperçu montre le conseil « par défaut », jamais celui d'un vrai patient. */
const PREVIEW_PATIENT: PatientContext = { patientId: null, ageYears: null, sex: "UNSPECIFIED", isPregnant: null, isBreastfeeding: null, renalImpairment: null, hepaticImpairment: null, allergies: [], chronicConditions: [], currentTreatments: [], hasAdviceConsent: false };

/**
 * Le moteur réel, pour ce médicament, dans le stock réel de cette pharmacie, avec les décisions de la console (supprimés,
 * ajoutés, modifiés). Lecture seule. La suggestion du robot n'est pas appelée ici (elle coûte un appel au modèle) : l'aperçu
 * dit seulement quels besoins restent sans produit.
 */
export async function previewMedicineAdvice(pharmacyId: string, specialtyId: string): Promise<{ ok: true; preview: AdvicePreview } | { ok: false; error: string }> {
  const [pharmacy, specialty] = await Promise.all([
    prisma.pharmacy.findFirst({ where: { id: pharmacyId, isDemo: false }, select: { id: true, name: true, organizationId: true } }),
    prisma.drugSpecialty.findUnique({ where: { id: specialtyId }, select: { name: true, cisCode: true, pharmaceuticalForm: true, compositions: { where: { nature: { in: ["FT", "SA"] } }, select: { substanceLabel: true, nature: true } } } }),
  ]);
  if (!pharmacy) return { ok: false, error: "Pharmacie introuvable." };
  if (!specialty) return { ok: false, error: "Médicament introuvable." };
  const official = officialAtcForCis(specialty.cisCode);
  if (!official) return { ok: false, error: "La famille officielle de ce médicament est inconnue : PharmaBoost ne peut pas dire quels conseils s'y appliquent." };
  const substance = specialty.compositions.find((item) => item.nature === "FT")?.substanceLabel ?? specialty.compositions[0]?.substanceLabel ?? null;
  const name = specialty.name.split(",")[0].trim();

  const scope = { pharmacyId: pharmacy.id, organizationId: pharmacy.organizationId, userId: "console-preview" };
  const [pharmacyCatalog, nationalCandidates, rules, preferredRanges, central] = await Promise.all([loadCatalogSnapshot(scope), loadNationalDrugCandidates(scope), loadPharmacyRules(scope), loadPreferredRanges(scope), loadCentralAdvice()]);
  const catalog = await enrichCatalog(scope, [...pharmacyCatalog, ...nationalCandidates]);

  const key = name.toLowerCase();
  const classification = { lineIndex: 0, substance, atcCode: official.atcCode, therapeuticClass: official.therapeuticClass, commonSideEffects: [], confidence: 1, source: "OFFICIAL" as const };
  const understanding = deriveUnderstanding({ drugs: [classification], patient: { ageYears: null, sex: "UNSPECIFIED", isPregnant: null, isBreastfeeding: null }, providerId: "console-preview", model: "aucun" });
  const result = runAnalysisPipeline({
    maxRecommendations: MAX_RECOMMENDATIONS_COUNTER_SCAN,
    lines: [{ lineIndex: 0, drugName: name, posology: null, durationDays: null, confirmed: true }],
    knowledge: new Map([[key, classifiedDrugKnowledge({ key, drugName: name, form: specialty.pharmaceuticalForm, classification, publishedSubstance: substance, model: "aucun" })]]),
    patient: PREVIEW_PATIENT,
    catalog,
    rules,
    history: {},
    explanations: [],
    extractionFindings: [],
    preferredRanges,
    understanding,
    usedSimulatedProviders: false,
    disabledRuleKeys: central.removed,
    customRules: central.custom,
  });
  const productName = new Map(catalog.map((product) => [product.id, product.name]));
  const titleOf = new Map(result.opportunities.map((opportunity) => [opportunity.key, opportunity.title]));
  const covered = new Set(result.recommendations.map((recommendation) => recommendation.opportunityKey));
  return {
    ok: true,
    preview: {
      pharmacyName: pharmacy.name,
      medicine: name,
      proposals: result.recommendations.map((recommendation) => ({ title: titleOf.get(recommendation.opportunityKey) ?? "Conseil", product: productName.get(recommendation.productId) ?? "Produit du stock", script: recommendation.counterScript })),
      uncovered: [...new Set(result.opportunities.filter((opportunity) => !covered.has(opportunity.key) && !opportunity.isBlocked).map((opportunity) => opportunity.title))],
      notes: result.recommendations.length === 0 ? [catalog.length === 0 ? "Cette pharmacie n'a pas encore envoyé son stock." : "Aucun produit adapté et sûr dans ce stock pour ce médicament : au comptoir, le robot cherchera dans ce stock un produit pour ce besoin."] : [],
    },
  };
}

/** Le libellé d'une catégorie de produit, pour la console. */
export const categoryLabel = (code: string): string => PRODUCT_CATEGORY_LABELS[code as keyof typeof PRODUCT_CATEGORY_LABELS] ?? code;
