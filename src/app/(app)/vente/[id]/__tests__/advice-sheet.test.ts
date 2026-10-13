import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { suggestionVigilances } from "@/core/ai/engines/population-vigilance";
import type { PatientContext } from "@/core/ai/types";
import type { AdviceView, ProductSheetView } from "../types";
import { buildAdviceSheet, SHEET_SOURCES, sortForPatient } from "../advice-sheet";
import { descendants, parseHtml, textOf, type HtmlNode } from "./html-tree";
import { advice, text } from "./fixtures";

/**
 * La fiche complète d'un conseil, ouverte d'un clic sur sa carte dans la bannière du comptoir : pourquoi il est proposé,
 * ce que le pharmacien peut dire, « Contre-indications » et « Conseils d'utilisation » — avec les SEULES données qui
 * existent (fiche produit de l'officine, règle de conseil, vigilances de l'ordonnance). Une rubrique vide le dit.
 */

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: mocks.push }) }));
vi.mock("@/server/actions/opportunities", () => ({ answerOpportunityAction: vi.fn() }));
vi.mock("@/server/actions/recommendations", () => ({
  addManualRecommendationAction: vi.fn(),
  chooseAdviceAlternativeAction: vi.fn(),
  declineRecommendationAction: vi.fn(),
  modifyRecommendationAction: vi.fn(),
  removeRecommendationAction: vi.fn(),
  reopenRecommendationAction: vi.fn(),
  replaceRecommendationAction: vi.fn(),
  setRecommendationPriceAction: vi.fn(),
}));

const { MedicationAdvice } = await import("../medication-advice");
const { AdviceFocusProvider } = await import("../advice-sheet-view");

const SHEET: ProductSheetView = {
  description: "Gel ophtalmique en tube de 10 g.",
  contraindications: ["hypersensibilité à l'un des composants"],
  precautions: ["Ne pas toucher l'œil avec l'embout du tube."],
  vigilances: [{ population: "CHILD", level: "CAUTION", note: "Avis du pharmacien avant 3 ans." }],
};

/** Le gel larme proposé avec la cétirizine, tel que la page le fournit, fiche produit comprise. */
const gel = (overrides: Partial<AdviceView> = {}, sheet: ProductSheetView | null = SHEET): AdviceView => {
  const base = advice({
    id: "rec_gel",
    lineIds: ["l1"],
    shortReason: "La cétirizine peut assécher les yeux.",
    counterScript: "« Vos yeux peuvent être plus secs avec ce traitement : ce gel les hydrate. »",
    patientReason: "Pour le confort de vos yeux pendant le traitement.",
    precautions: ["Ne pas toucher l'œil avec l'embout du tube.", "Retirer les lentilles avant l'application."],
    opportunity: {
      ...advice().opportunity!,
      title: "Sécheresse oculaire",
      rationale: "Antihistaminique H1 prescrit : sécheresse oculaire possible.",
      clinicalContext: "Effet anticholinergique modéré.",
      safetyNotes: ["Retirer les lentilles avant l'application."],
      benefits: ["Hydrate", "Sans conservateur"],
    },
    // Ce que le moteur écrit vraiment pour une contre-indication quand le patient n'est pas connu (mode sans patient).
    vigilances: [{ population: "PREGNANCY", level: "PHARMACIST_VALIDATION", status: null, text: "Non évalué pendant la grossesse.", origin: "RULE", sources: ["RCP"] }],
    ...overrides,
  });
  return { ...base, product: base.product ? { ...base.product, name: "GEL LARMES 10 G", sheet: sheet ?? undefined } : null };
};

describe("ce que la fiche range, et d'où cela vient", () => {
  it("pourquoi : la raison du comptoir, l'explication de la règle et son contexte, sans doublon ; ses bénéfices ; la phrase à dire", () => {
    const sheet = buildAdviceSheet(gel({ shortReason: "Antihistaminique H1 prescrit : sécheresse oculaire possible." }));
    expect(sheet.reasons).toEqual(["Antihistaminique H1 prescrit : sécheresse oculaire possible.", "Effet anticholinergique modéré."]);
    expect(sheet.benefits).toEqual(["Hydrate", "Sans conservateur"]);
    expect(sheet.counterScript).toContain("ce gel les hydrate");
    expect(sheet.patientReason).toBe("Pour le confort de vos yeux pendant le traitement.");
  });

  it("contre-indications : la fiche produit, puis les vigilances « validation pharmacien » calculées pour ce patient, avec leur source", () => {
    const sheet = buildAdviceSheet(gel());
    expect(sheet.contraindications).toEqual([
      { text: "Hypersensibilité à l'un des composants", detail: null, source: SHEET_SOURCES.product, patient: null },
      { text: "Grossesse · validation pharmacien", detail: "Non évalué pendant la grossesse.", source: `${SHEET_SOURCES.rule} — RCP`, patient: "UNKNOWN" },
    ]);
  });

  it("conseils d'utilisation : précautions de la fiche produit, notes de sécurité de la règle, vigilances de prudence — chacune une fois", () => {
    const sheet = buildAdviceSheet(gel());
    expect(sheet.usage).toEqual([
      { text: "Ne pas toucher l'œil avec l'embout du tube.", detail: null, source: SHEET_SOURCES.product, patient: null },
      { text: "Retirer les lentilles avant l'application.", detail: null, source: SHEET_SOURCES.rule, patient: null },
      { text: "Enfant · prudence", detail: "Avis du pharmacien avant 3 ans.", source: SHEET_SOURCES.declared, patient: null },
    ]);
    expect(sheet.description).toBe("Gel ophtalmique en tube de 10 g.");
  });

  it("une précaution enregistrée par l'analyse qui n'est ni sur la fiche ni dans la règle : attribuée à l'analyse de l'ordonnance", () => {
    const sheet = buildAdviceSheet(gel({ precautions: ["Ne pas associer à un autre collyre sans avis."] }));
    expect(sheet.usage.find((line) => line.text.startsWith("Ne pas associer"))?.source).toBe(SHEET_SOURCES.prescription);
  });

  it("une vigilance déclarée sur la fiche et déjà vue par l'analyse ne se lit qu'une fois, avec le statut du patient", () => {
    const sheet = buildAdviceSheet(gel({ vigilances: [{ population: "CHILD", level: "CAUTION", status: false, text: "Avis du pharmacien avant 3 ans.", origin: "PRODUCT", sources: [] }] }));
    const child = sheet.usage.filter((line) => line.text.startsWith("Enfant"));
    expect(child).toEqual([{ text: "Enfant · prudence", detail: "Avis du pharmacien avant 3 ans.", source: SHEET_SOURCES.product, patient: "NOT_CONCERNED" }]);
  });

  it("une source qui se nomme déjà « Règle de conseil… » n'est pas répétée", () => {
    const sheet = buildAdviceSheet(gel({ vigilances: [{ population: "PREGNANCY", level: "CONTRAINDICATION", status: true, text: "t", origin: "RULE", sources: ["Règle de conseil PharmaBoost (convalescence)"] }] }));
    expect(sheet.contraindications.find((line) => line.text === "Grossesse")).toMatchObject({ source: "PharmaBoost", patient: "CONCERNED" });
  });

  it("les contre-indications qui concernent ce patient passent en tête", () => {
    const sorted = sortForPatient([
      { text: "A", detail: null, source: "s", patient: "NOT_CONCERNED" },
      { text: "B", detail: null, source: "s", patient: null },
      { text: "C", detail: null, source: "s", patient: "CONCERNED" },
    ]);
    expect(sorted.map((line) => line.text)).toEqual(["C", "B", "A"]);
  });

  it("rien de renseigné (médicament du catalogue national, fiche vide) : des rubriques vides, rien d'inventé", () => {
    const sheet = buildAdviceSheet(gel({ precautions: [], vigilances: [], opportunity: { ...advice().opportunity!, safetyNotes: [] } }, null));
    expect(sheet.contraindications).toEqual([]);
    expect(sheet.usage).toEqual([]);
    expect(sheet.description).toBeNull();
  });
});

// --- La page : le conseil cliqué dans la bannière s'ouvre déplié --------------------------------------------------

const Provider = AdviceFocusProvider as (props: { initialId: string | null; canOpenProduct: boolean; children?: ReactNode }) => ReactNode;

const render = (recommendations: AdviceView[], focused: string | null, canOpenProduct = true) =>
  renderToStaticMarkup(
    createElement(
      Provider,
      { initialId: focused, canOpenProduct },
      createElement(MedicationAdvice, {
        drugName: "CÉTIRIZINE 10 mg",
        prescriptionId: "rx_1",
        recommendations,
        canDecide: true,
        canVerify: true,
        presentProductIds: new Set<string>(),
        inBasket: () => false,
        onAccept: vi.fn(),
        onCancelAccept: vi.fn(),
      }),
    ),
  );

/** La carte ancrée sur ce conseil : l'élément qui porte `id="conseil-<id>"`, puis son cadre. */
function cardOf(html: string, id: string): HtmlNode {
  const anchor = descendants(parseHtml(html)).find((node) => node.attrs.includes(`id="conseil-${id}"`));
  if (!anchor?.parent) throw new Error(`pas d'ancre pour ${id}`);
  return anchor.parent;
}

beforeEach(() => vi.clearAllMocks());

describe("la carte du conseil visé, sur la page de la vente", () => {
  it("porte l'ancre du lien de la bannière, se signale, et s'ouvre DÉPLIÉE : les deux rubriques titrées, les données réelles", () => {
    const html = render([gel(), advice({ id: "rec_autre", lineIds: ["l1"] })], "rec_gel");
    const card = cardOf(html, "rec_gel");
    expect(card.attrs).toContain("data-advice-focused");
    const shown = textOf(card);
    expect(shown).toContain("GEL LARMES 10 G");
    expect(shown).toContain("Fiche complète du conseil");
    expect(shown).toContain("Pourquoi il est proposé");
    expect(shown).toContain("Effet anticholinergique modéré.");
    expect(shown).toContain("Contre-indications");
    expect(shown).toContain("Hypersensibilité à l'un des composants");
    expect(shown).toContain("Grossesse · validation pharmacien À vérifier avec le patient");
    expect(shown).toContain("Conseils d'utilisation");
    expect(shown).toContain("Ne pas toucher l'œil avec l'embout du tube.");
    expect(shown).toContain("Gel ophtalmique en tube de 10 g.");
    expect(shown).toContain(SHEET_SOURCES.product);
    expect(shown).toContain("Ouvrir la fiche produit");
    expect(html).toContain('href="/stock/p_1"');
    expect(html).toMatch(/aria-expanded="true" aria-controls="fiche-rec_gel"/);
  });

  it("les autres cartes gardent leur fiche repliée (le comptoir ne s'allonge pas)", () => {
    const html = render([gel(), advice({ id: "rec_autre", lineIds: ["l1"] })], "rec_gel");
    const other = cardOf(html, "rec_autre");
    expect(other.attrs).not.toContain("data-advice-focused");
    expect(textOf(other)).toContain("Fiche complète du conseil");
    expect(textOf(other)).not.toContain("Conseils d'utilisation Aucun");
    expect(other.children.some((child) => typeof child !== "string" && textOf(child).includes("Pourquoi il est proposé"))).toBe(false);
  });

  it("sans conseil visé : toutes les fiches repliées, aucune carte signalée", () => {
    const html = render([gel()], null);
    expect(html).not.toContain("data-advice-focused");
    expect(html).toContain('aria-expanded="false" aria-controls="fiche-rec_gel"');
    expect(text(html)).not.toContain("Pourquoi il est proposé");
  });

  it("rubriques sans donnée : elles le disent (« reportez-vous à sa notice »), sans rien inventer ; pas de lien produit sans le droit", () => {
    const empty = gel({ precautions: [], vigilances: [], opportunity: { ...advice().opportunity!, safetyNotes: [] } }, { description: null, contraindications: [], precautions: [], vigilances: [] });
    const shown = text(render([empty], "rec_gel", false));
    expect(shown).toContain("Aucune contre-indication n'est renseignée dans PharmaBoost pour ce produit : reportez-vous à sa notice.");
    expect(shown).toContain("Aucun conseil d'utilisation n'est renseigné dans PharmaBoost pour ce produit : reportez-vous à sa notice.");
    expect(shown).not.toContain("Ouvrir la fiche produit");
  });

  it("un conseil visé déjà tranché (« Non vendu » dans la bannière) : sa fiche complète se lit en tête, avec ce qui a été décidé", () => {
    const html = render([gel({ status: "DECLINED", decidedBy: "Léa Martin" })], "rec_gel");
    const card = cardOf(html, "rec_gel");
    const shown = textOf(card);
    expect(shown).toContain("GEL LARMES 10 G");
    expect(shown).toContain("Non vendu · Léa Martin");
    expect(shown).toContain("Ce que vous pouvez dire");
    expect(shown).toContain("ce gel les hydrate");
    expect(shown).toContain("Contre-indications");
    expect(shown).toContain("Conseils d'utilisation");
  });

  it("un conseil visé en rupture : sa fiche se lit aussi, marquée « Non proposé faute de stock »", () => {
    const base = gel();
    const html = render([{ ...base, product: { ...base.product!, quantity: 0 } }], "rec_gel");
    expect(textOf(cardOf(html, "rec_gel"))).toContain("Non proposé faute de stock");
  });
});

// --- De bout en bout : ce que le moteur calcule (suggestionVigilances), ce que la fiche en range ----------------------

/** Mode sans patient, celui par défaut : rien n'est connu du patient. */
const UNKNOWN_PATIENT: PatientContext = { patientId: null, ageYears: null, sex: "UNSPECIFIED", isPregnant: null, isBreastfeeding: null, renalImpairment: null, hepaticImpairment: null, allergies: [], chronicConditions: [], currentTreatments: [], hasAdviceConsent: false };
const EMPTY_SHEET: ProductSheetView = { description: null, contraindications: [], precautions: [], vigilances: [] };

/** Les vigilances qu'écrit une vraie règle de conseil du moteur. */
function rulePopulations(key: string) {
  const populations = ADVICE_RULES.find((rule) => rule.key === key)?.populations;
  if (!populations?.length) throw new Error(`règle ${key} sans vigilance`);
  return populations;
}

/** Le conseil tel que l'analyse l'enregistre : vigilances calculées par le moteur sur ce produit et cette fiche. */
function computed(name: string, populations: ReturnType<typeof rulePopulations> | [], sheet: ProductSheetView): AdviceView {
  const vigilances = suggestionVigilances(populations, { contraindications: sheet.contraindications, vigilances: sheet.vigilances, name }, UNKNOWN_PATIENT);
  const base = gel({ precautions: [], vigilances, opportunity: { ...advice().opportunity!, safetyNotes: [] } }, sheet);
  return { ...base, product: { ...base.product!, name } };
}

describe("de bout en bout, patient inconnu : une contre-indication ne se range jamais dans les conseils d'utilisation", () => {
  it("cétirizine → pastille aux huiles essentielles : les contre-indications ANSM sous « Contre-indications », à vérifier avec le patient", () => {
    const pastille = computed("PASTILLES GORGE MIEL EUCALYPTUS", rulePopulations("antihistamine-dry-throat"), EMPTY_SHEET);
    expect((pastille.vigilances ?? []).every((vigilance) => vigilance.level === "PHARMACIST_VALIDATION" && vigilance.status === null)).toBe(true);
    const sheet = buildAdviceSheet(pastille);
    expect(sheet.contraindications.map((line) => line.text).sort()).toEqual(
      ["Allaitement", "Asthme", "Enfant", "Grossesse", "Épilepsie"].map((label) => `${label} · validation pharmacien`).sort(),
    );
    for (const line of sheet.contraindications) {
      expect(line).toMatchObject({ patient: "UNKNOWN", detail: expect.stringContaining("contre-indiquées"), source: expect.stringContaining("ANSM") });
    }
    expect(sheet.usage).toEqual([]);

    const shown = text(render([pastille], "rec_gel"));
    expect(shown).toContain("Asthme · validation pharmacien À vérifier avec le patient");
    expect(shown).not.toContain("Aucune contre-indication n'est renseignée");
  });

  it("contre-indication déclarée par l'officine (grossesse) : sous « Contre-indications », au niveau déclaré, une seule fois", () => {
    const declared: ProductSheetView = { ...EMPTY_SHEET, vigilances: [{ population: "PREGNANCY", level: "CONTRAINDICATION", note: "Ne pas utiliser pendant la grossesse (notice)." }] };
    const sheet = buildAdviceSheet(computed("GEL LARMES 10 G", [], declared));
    expect(sheet.contraindications).toEqual([{ text: "Grossesse", detail: "Ne pas utiliser pendant la grossesse (notice).", source: SHEET_SOURCES.product, patient: "UNKNOWN" }]);
    expect(sheet.usage).toEqual([]);
  });

  it("contre-indication saisie en texte sur la fiche produit : sa vigilance calculée garde le niveau contre-indication", () => {
    const typed: ProductSheetView = { ...EMPTY_SHEET, contraindications: ["enfant de moins de 6 ans"] };
    const sheet = buildAdviceSheet(computed("GEL LARMES 10 G", [], typed));
    expect(sheet.contraindications).toContainEqual({ text: "Enfant de moins de 6 ans", detail: null, source: SHEET_SOURCES.product, patient: null });
    expect(sheet.contraindications).toContainEqual({ text: "Enfant", detail: "Fiche produit : enfant de moins de 6 ans", source: SHEET_SOURCES.product, patient: "UNKNOWN" });
    expect(sheet.usage).toEqual([]);
  });

  it("une règle dont la source demande un avis médical (multivitaminé, grossesse) : sous « Contre-indications », à son propre niveau, jamais promue", () => {
    const sheet = buildAdviceSheet(computed("MULTIVITAMINES 30 CPR", rulePopulations("convalescence-immunity-vitamins"), EMPTY_SHEET));
    expect(sheet.contraindications).toEqual([
      { text: "Grossesse · validation pharmacien", detail: "Grossesse : pas de complément multivitaminé sans avis médical.", source: "PharmaBoost", patient: "UNKNOWN" },
    ]);
  });

  it("une prudence ou une information reste dans les conseils d'utilisation", () => {
    const caution: ProductSheetView = { ...EMPTY_SHEET, vigilances: [{ population: "CHILD", level: "CAUTION", note: "Avis du pharmacien avant 3 ans." }] };
    const sheet = buildAdviceSheet(computed("GEL LARMES 10 G", [], caution));
    expect(sheet.contraindications).toEqual([]);
    expect(sheet.usage).toEqual([{ text: "Enfant · prudence", detail: "Avis du pharmacien avant 3 ans.", source: SHEET_SOURCES.declared, patient: null }]);
  });
});
