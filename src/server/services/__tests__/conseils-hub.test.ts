import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { editValuesOf } from "@/core/ai/central-advice-edit";
import { matchesFilter, matchesHubQuery, parseHubQuery, type HubFacets } from "@/core/admin/advice-hub";

/**
 * « Conseils » côté serveur : modifier un conseil (règle du code, conseil ajouté, conseil déclenché par un produit), revenir
 * à l'origine, l'historique ; la recherche sur les VRAIES règles du moteur ; partir d'un médicament.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    centralAdviceRule: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    centralAssociation: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    centralAdviceEdit: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    robotRuleProposal: { findMany: vi.fn() },
    pharmacy: { findMany: vi.fn(), findFirst: vi.fn() },
    drugSpecialty: { findUnique: vi.fn() },
    product: { findMany: vi.fn() },
    $queryRaw: vi.fn(async (): Promise<unknown[]> => []),
  },
  recordAudit: vi.fn(),
  searchSpecialties: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("../drug-identification", () => ({ searchSpecialties: mocks.searchSpecialties }));
vi.mock("../catalog", () => ({ loadCatalogSnapshot: vi.fn(), loadNationalDrugCandidates: vi.fn(), loadPharmacyRules: vi.fn(), loadPreferredRanges: vi.fn(), enrichCatalog: vi.fn() }));

import { decideRule, editCentralAssociation, editRule, listCentralRules, loadCentralAdvice, loadEditHistory, revertCentralAssociation, revertRule } from "../central-advice";
import { associationFacets, questionTreeSummaries, resolveMedicineSearch, robotFacets, ruleFacets } from "../advice-hub";

const ADMIN = { id: "adm_1", fullName: "Donna Benveniste" };
const THROAT = ADVICE_RULES.find((rule) => rule.key === "antihistamine-dry-throat")!;
const values = (change: Record<string, unknown> = {}) => ({ ...editValuesOf(THROAT), ...change });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.centralAdviceRule.findMany.mockResolvedValue([]);
  mocks.prisma.centralAdviceRule.findUnique.mockResolvedValue(null);
  mocks.prisma.centralAdviceEdit.findMany.mockResolvedValue([]);
  mocks.prisma.$queryRaw.mockResolvedValue([]);
});

describe("modifier une règle du code", () => {
  it("garde la modification à part (la règle du code reste intacte), la trace dans l'historique et le journal, « à relire » ensuite", async () => {
    const result = await editRule(ADMIN, THROAT.key, values({ counterScript: "Avec {drug}, {product} adoucit la gorge (Donna)." }));
    expect(result).toMatchObject({ ok: true, title: THROAT.title });
    const upsert = mocks.prisma.centralAdviceRule.upsert.mock.calls[0][0];
    expect(upsert.create).toMatchObject({ ruleKey: THROAT.key, source: "BUILT_IN", status: "ACTIVE", overrideRevision: 1, overrideBaseVersion: THROAT.version, overriddenByName: "Donna Benveniste" });
    expect(upsert.create.override.edit.counterScript).toMatch(/Donna/);
    expect(mocks.prisma.centralAdviceEdit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ targetKind: "RULE", targetKey: THROAT.key, action: "EDIT", changed: ["Ce que dit le pharmacien"], adminName: "Donna Benveniste" }) });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "central_advice.rule_edited", entityId: THROAT.key, platformAdminId: "adm_1", metadata: expect.objectContaining({ changed: ["Ce que dit le pharmacien"] }) }));
    expect(THROAT.counterScriptTemplate).not.toMatch(/Donna/);
  });

  it("puis le moteur la lit : loadCentralAdvice renvoie la règle modifiée, même clé, qui remplace celle du code", async () => {
    const edit = { ...editValuesOf(THROAT), title: "Gorge sèche (modifié)" };
    mocks.prisma.centralAdviceRule.findMany.mockResolvedValue([{ ruleKey: THROAT.key, source: "BUILT_IN", status: "ACTIVE", ruleVersion: null, definition: null, decidedAt: null, decidedByName: null, override: { edit }, overrideRevision: 1 }]);
    const central = await loadCentralAdvice();
    expect(central.removed).toEqual([]);
    expect(central.custom.find((rule) => rule.key === THROAT.key)?.title).toBe("Gorge sèche (modifié)");
  });

  it("refuse une modification invalide ou vide, sans rien écrire ; demande la confirmation avant de retirer toutes les exclusions", async () => {
    expect(await editRule(ADMIN, THROAT.key, values({ title: "" }))).toMatchObject({ ok: false });
    expect(await editRule(ADMIN, THROAT.key, values())).toMatchObject({ ok: false, error: "Rien n'a changé." });
    mocks.prisma.centralAdviceRule.findUnique.mockResolvedValue({ source: "BUILT_IN", status: "ACTIVE", definition: null, override: { edit: values({ exclusions: { minAgeYears: 12, pregnancy: false, breastfeeding: false, conditions: [] } }) }, overrideRevision: 1 });
    expect(await editRule(ADMIN, THROAT.key, values({ title: "Autre titre" }))).toMatchObject({ ok: false, needsConfirmation: true });
    expect(mocks.prisma.centralAdviceRule.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.centralAdviceEdit.create).not.toHaveBeenCalled();
    expect(await editRule(ADMIN, "regle-inexistante", values())).toMatchObject({ ok: false, error: "Conseil inconnu." });
  });

  it("valider une règle modifiée signe SA version ; « Remettre à relire » garde la modification", async () => {
    mocks.prisma.centralAdviceRule.findUnique.mockResolvedValue({ source: "BUILT_IN", definition: null, override: { edit: values({ title: "Modifié" }) }, overrideRevision: 3 });
    await decideRule(ADMIN, THROAT.key, "VALIDATE");
    expect(mocks.prisma.centralAdviceRule.upsert.mock.calls[0][0].update.ruleVersion).toBe(`${THROAT.version}-modif3`);
    await decideRule(ADMIN, THROAT.key, "RESTORE");
    expect(mocks.prisma.centralAdviceRule.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.centralAdviceRule.update).toHaveBeenCalledWith({ where: { ruleKey: THROAT.key }, data: expect.objectContaining({ status: "ACTIVE", decidedAt: null }) });
  });

  it("« Revenir à la version d'origine » efface la modification, historisé ; sans modification, rien à faire", async () => {
    mocks.prisma.centralAdviceRule.findUnique.mockResolvedValue({ source: "BUILT_IN", status: "VALIDATED", definition: null, override: { edit: values({ title: "Modifié" }) }, overrideRevision: 1 });
    expect(await revertRule(ADMIN, THROAT.key)).toEqual({ ok: true, title: THROAT.title });
    expect(mocks.prisma.centralAdviceRule.update.mock.calls[0][0].data).toMatchObject({ overrideBaseVersion: null, overriddenAt: null, status: "ACTIVE" });
    expect(mocks.prisma.centralAdviceEdit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "REVERT", targetKey: THROAT.key }) });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "central_advice.rule_reverted" }));
    mocks.prisma.centralAdviceRule.findUnique.mockResolvedValue(null);
    expect(await revertRule(ADMIN, THROAT.key)).toMatchObject({ ok: false });
  });
});

describe("modifier un conseil ajouté (ou une suggestion du robot validée)", () => {
  const definition = { title: "Bouche sèche sous antidépresseur", kind: "COMFORT", atcPrefixes: ["N06A"], therapeuticClasses: [], category: "SOINS", matchingTags: ["gorge"], question: null, shortReason: "Antidépresseur ({drug}) : la bouche sèche est fréquente.", counterScript: "{drug} assèche souvent la bouche. {product} peut soulager.", patientReason: null, source: null, safetyNotes: [] };

  it("réécrit sa définition, garde l'ancienne dans l'historique, et revient à l'origine depuis le tout premier « avant »", async () => {
    mocks.prisma.centralAdviceRule.findUnique.mockResolvedValue({ source: "CUSTOM", status: "VALIDATED", definition, override: null, overrideRevision: 0 });
    const edit = { title: definition.title, counterScript: definition.counterScript, patientReason: "Votre traitement assèche la bouche : ce produit soulage.", shortReason: definition.shortReason, question: "", atcPrefixes: ["N06A"], therapeuticClasses: [], category: "SOINS", matchingTags: ["gorge"], preferWords: [], exclusions: { minAgeYears: null, pregnancy: false, breastfeeding: false, conditions: [] }, priority: 55, safetyNotes: [], source: "" };
    expect(await editRule(ADMIN, "custom-1", edit)).toMatchObject({ ok: true });
    const update = mocks.prisma.centralAdviceRule.update.mock.calls[0][0];
    expect(update.data.definition.patientReason).toMatch(/assèche la bouche/);
    expect(update.data.status).toBe("ACTIVE");
    expect(mocks.prisma.centralAdviceEdit.create.mock.calls[0][0].data).toMatchObject({ before: definition, changed: ["Phrase pour le patient"] });

    mocks.prisma.centralAdviceEdit.findFirst.mockResolvedValue({ before: definition });
    expect(await revertRule(ADMIN, "custom-1")).toMatchObject({ ok: true, title: definition.title });
    expect(mocks.prisma.centralAdviceRule.update.mock.calls[1][0].data.definition).toEqual(definition);
  });
});

describe("modifier un conseil déclenché par un produit (association commune)", () => {
  const row = { triggerKey: "ean:3401111111111", triggerLabel: "Crème solaire", adviceEan: "3402222222222", adviceLabel: "Après-soleil", sentence: "Ancienne phrase.", status: "VALIDATED" };

  it("change la phrase et le produit proposé, « à relire », historisé ; revient à l'origine", async () => {
    mocks.prisma.centralAssociation.findUnique.mockResolvedValue(row);
    expect(await editCentralAssociation(ADMIN, "as_1", { advice: { ean: "3403333333333", name: "Lait après-soleil" }, sentence: "Nouvelle phrase." })).toEqual({ ok: true, label: "Crème solaire → Lait après-soleil" });
    expect(mocks.prisma.centralAssociation.update.mock.calls[0][0].data).toMatchObject({ adviceEan: "3403333333333", sentence: "Nouvelle phrase.", status: "ACTIVE" });
    expect(mocks.prisma.centralAdviceEdit.create.mock.calls[0][0].data).toMatchObject({ targetKind: "ASSOCIATION", changed: ["Produit proposé", "Ce que dit le pharmacien"], before: { adviceEan: "3402222222222", adviceLabel: "Après-soleil", sentence: "Ancienne phrase." } });

    mocks.prisma.centralAdviceEdit.findFirst.mockResolvedValue({ before: { adviceEan: "3402222222222", adviceLabel: "Après-soleil", sentence: "Ancienne phrase." } });
    expect(await revertCentralAssociation(ADMIN, "as_1")).toMatchObject({ ok: true });
    expect(mocks.prisma.centralAssociation.update.mock.calls[1][0].data).toMatchObject({ adviceEan: "3402222222222", sentence: "Ancienne phrase." });
  });

  it("refuse un produit associé à lui-même ou sans code-barres", async () => {
    mocks.prisma.centralAssociation.findUnique.mockResolvedValue(row);
    expect(await editCentralAssociation(ADMIN, "as_1", { advice: { ean: "3401111111111", name: "Crème solaire" }, sentence: null })).toMatchObject({ ok: false, error: expect.stringMatching(/lui-même/) });
    expect(await editCentralAssociation(ADMIN, "as_1", { advice: { ean: "abc", name: "X" }, sentence: null })).toMatchObject({ ok: false });
    expect(mocks.prisma.centralAssociation.update).not.toHaveBeenCalled();
  });
});

describe("l'historique : qui a modifié quoi, quand", () => {
  it("regroupe les modifications par conseil, la plus récente d'abord", async () => {
    const at = new Date("2026-10-13T10:00:00Z");
    mocks.prisma.centralAdviceEdit.findMany.mockResolvedValue([
      { id: "e2", targetKind: "RULE", targetKey: THROAT.key, action: "REVERT", changed: ["Version d'origine"], adminName: "Donna", createdAt: at },
      { id: "e1", targetKind: "RULE", targetKey: THROAT.key, action: "EDIT", changed: ["Nom du conseil"], adminName: "Donna", createdAt: at },
      { id: "e0", targetKind: "ASSOCIATION", targetKey: "as_1", action: "EDIT", changed: ["Produit proposé"], adminName: "Adam", createdAt: at },
    ]);
    const history = await loadEditHistory();
    expect(history.get(`rule:${THROAT.key}`)?.map((entry) => entry.action)).toEqual(["REVERT", "EDIT"]);
    expect(history.get("association:as_1")?.[0]).toMatchObject({ by: "Adam", changed: ["Produit proposé"] });
  });
});

describe("la recherche sur les vraies règles du moteur", () => {
  let facets: HubFacets[] = [];
  beforeEach(async () => {
    const rules = await listCentralRules({});
    facets = rules.map((rule) => ruleFacets(rule, new Set()));
  });
  const find = (query: string, codes: Record<string, string[]> = {}) => facets.filter((entry) => matchesHubQuery(entry, parseHubQuery(query), codes)).map((entry) => entry.id.replace(/^rule:/, ""));

  it("« cétirizine » trouve les règles qui visent sa famille (R06AE), par le code que le catalogue national donne pour ce mot", () => {
    const byTextOnly = find("cétirizine");
    const found = find("cétirizine", { CETIRIZINE: ["R06AE07"] });
    expect(found.length).toBeGreaterThan(byTextOnly.length);
    expect(found).toEqual(expect.arrayContaining(["antihistamine-dry-throat", "eye-allergy-antiallergic-drops", "nasal-hygiene-orl"]));
    expect(found).not.toContain("magnesium-fatigue");
    // Le code de famille tapé tel quel marche aussi.
    expect(find("R06AE07")).toEqual(expect.arrayContaining(["antihistamine-dry-throat"]));
  });

  it("« allergie » trouve les conseils de l'allergie (titre, textes, étiquettes), sans accents ni casse", () => {
    const found = find("ALLERGIE");
    expect(found).toEqual(expect.arrayContaining(["eye-allergy-antiallergic-drops"]));
    expect(find("allergie")).toEqual(found);
  });

  it("« 12 ans » trouve les conseils écartés avant 12 ans (exclusions du code lues en clair)", () => {
    const found = find("12 ans");
    expect(found.length).toBeGreaterThan(0);
    for (const key of found) expect(facets.find((entry) => entry.id === `rule:${key}`)?.searchText).toMatch(/12 ans/);
  });

  it("un mot de la phrase pour le patient suffit, et TOUS les mots tapés doivent se retrouver", () => {
    const words = THROAT.patientReasonTemplate.split(/\s+/).filter((word) => /^[a-zà-ÿ]{7,}$/i.test(word));
    expect(words.length).toBeGreaterThan(0);
    expect(find(words[0])).toContain(THROAT.key);
    expect(find(`${words[0]} zzzintrouvable`)).toEqual([]);
  });
});

describe("les autres conseils dans la même liste", () => {
  it("un conseil déclenché par un produit, une suggestion du robot : leurs filtres et leur recherche", () => {
    const association = associationFacets({ id: "as_1", triggerKind: "PRODUCT", triggerLabel: "Crème solaire SPF50", adviceLabel: "Après-soleil", adviceEan: "3402222222222", sentence: "Après l'exposition, apaisez la peau.", status: "ACTIVE", decidedBy: null, decidedAt: null, createdBy: "Donna", createdAt: new Date() }, new Set());
    expect(matchesFilter(association, "PRODUCT")).toBe(true);
    expect(matchesFilter(association, "MEDICINE")).toBe(false);
    expect(matchesHubQuery(association, parseHubQuery("apaisez solaire"))).toBe(true);
    const robot = robotFacets({ id: "rp_1", status: "PENDING", drugLabel: "MAALOX, suspension buvable", atcCode: "A02AD01", substance: "HYDROXYDE D'ALUMINIUM", productName: "Tisane digestive", productBrand: null, categoryLabel: "Phytothérapie", productTags: ["digestion"], needLabel: "Digestion", reason: "Pour le confort digestif.", script: "Une tisane digestive.", pharmacies: ["Pharmacie du Parc"], occurrences: 2, central: { kind: "CUSTOM_RULE", summary: "" }, decidedBy: null, decidedAt: null, createdAt: new Date(), feedback: null });
    expect(matchesFilter(robot, "ROBOT")).toBe(true);
    expect(matchesFilter(robot, "REVIEW")).toBe(true);
    expect(matchesHubQuery(robot, parseHubQuery("maalox"))).toBe(true);
  });
});

describe("partir d'un médicament", () => {
  it("« cétirizine » : la famille officielle (R06AE07) pour la recherche, et la vue « Ce médicament »", async () => {
    mocks.searchSpecialties.mockResolvedValue([{ id: "sp_1", cisCode: "60807297", name: "CETIRIZINE BIOGARAN 10 mg, comprimé pelliculé sécable", substances: ["DICHLORHYDRATE DE CÉTIRIZINE"], substanceCodes: [], marketed: true, pharmaceuticalForm: null }]);
    const result = await resolveMedicineSearch("cétirizine");
    expect(result.codes).toEqual({ CETIRIZINE: ["R06AE07"] });
    expect(result.medicines).toEqual([expect.objectContaining({ specialtyId: "sp_1", name: "CETIRIZINE BIOGARAN 10 mg", atcCode: "R06AE07" })]);
  });

  it("« allergie » n'ouvre pas de vue médicament même si un nom de spécialité le contient ; un mot court ou un nombre n'est pas cherché", async () => {
    mocks.searchSpecialties.mockResolvedValue([{ id: "sp_2", cisCode: "61665908", name: "HUMEX ALLERGIE CETIRIZINE 10 mg, comprimé", substances: ["DICHLORHYDRATE DE CÉTIRIZINE"], substanceCodes: [], marketed: true, pharmaceuticalForm: null }]);
    const result = await resolveMedicineSearch("allergie");
    expect(result.medicines).toEqual([]);
    mocks.searchSpecialties.mockClear();
    await resolveMedicineSearch("12 ans");
    expect(mocks.searchSpecialties).not.toHaveBeenCalled();
  });

  it("l'arbre de questions s'ouvre pour le paracétamol (N02BE01), pas pour la cétirizine", () => {
    const [tree] = questionTreeSummaries();
    expect(tree.questions.join(" ")).toMatch(/Pourquoi le patient prend-il ce médicament/);
    expect(tree.atcPrefixes.some((prefix) => "N02BE01".startsWith(prefix))).toBe(true);
    expect(tree.atcPrefixes.some((prefix) => "R06AE07".startsWith(prefix))).toBe(false);
  });
});
