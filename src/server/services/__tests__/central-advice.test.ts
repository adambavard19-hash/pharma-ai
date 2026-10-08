import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { ADVICE_VOCABULARY } from "@/core/catalog/product-vocabulary";

/**
 * Le centre de contrôle des conseils côté serveur : ce que l'équipe PharmaBoost décide vaut pour toutes les officines,
 * signé et daté, sur une règle qui existe vraiment.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    centralAdviceRule: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    centralAssociation: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    product: { findMany: vi.fn() },
  },
  recordAudit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));

import { addCentralAssociation, addCustomRule, decideCentralAssociation, decideRule, listCentralRules, loadCentralAdvice, searchKnownProducts, startSentence } from "../central-advice";

const ADMIN = { id: "adm_1", fullName: "Donna Benveniste" };
const RULE = ADVICE_RULES[0];
const definition = {
  title: "Bouche sèche sous antidépresseur",
  kind: "COMFORT",
  atcPrefixes: ["N06A"],
  therapeuticClasses: [],
  category: "SOINS",
  matchingTags: [ADVICE_VOCABULARY[0]],
  shortReason: "Antidépresseur ({drug}) : la bouche sèche est fréquente.",
  counterScript: "{drug} assèche souvent la bouche. {product} peut soulager cette gêne.",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.centralAdviceRule.findMany.mockResolvedValue([]);
  mocks.prisma.centralAdviceRule.findUnique.mockResolvedValue(null);
});

describe("ce que l'analyse lit", () => {
  it("sans aucune décision : rien n'est supprimé, rien n'est ajouté — les règles du code parlent partout", async () => {
    expect(await loadCentralAdvice()).toEqual({ removed: [], custom: [] });
  });

  it("les règles supprimées et les conseils ajoutés en ligne, pour toutes les officines", async () => {
    mocks.prisma.centralAdviceRule.findMany.mockResolvedValue([
      { ruleKey: RULE.key, source: "BUILT_IN", status: "REMOVED", ruleVersion: RULE.version, definition: null, decidedAt: new Date(), decidedByName: "Donna" },
      { ruleKey: "custom-1", source: "CUSTOM", status: "ACTIVE", ruleVersion: null, definition, decidedAt: null, decidedByName: null },
    ]);
    const central = await loadCentralAdvice();
    expect(central.removed).toEqual([RULE.key]);
    expect(central.custom.map((rule) => rule.key)).toEqual(["custom-1"]);
  });
});

describe("la liste de la console", () => {
  it("montre les 46 règles du code, en ligne et à relire, avec ce qu'elles proposent", async () => {
    const views = await listCentralRules({ SOINS: "Soins" });
    expect(views).toHaveLength(ADVICE_RULES.length);
    expect(views.every((view) => view.status === "ACTIVE" && view.origin === "CODE")).toBe(true);
    expect(views[0]).toMatchObject({ ruleKey: RULE.key, title: RULE.title, decidedBy: null, decidedAt: null });
  });

  it("montre qui a décidé et quand ; un conseil ajouté s'ajoute à la fin, même supprimé (on peut le rétablir)", async () => {
    const decidedAt = new Date("2026-10-09T10:00:00Z");
    mocks.prisma.centralAdviceRule.findMany.mockResolvedValue([
      { ruleKey: RULE.key, source: "BUILT_IN", status: "VALIDATED", ruleVersion: RULE.version, definition: null, decidedAt, decidedByName: "Donna Benveniste" },
      { ruleKey: "custom-1", source: "CUSTOM", status: "REMOVED", ruleVersion: null, definition, decidedAt, decidedByName: "Donna Benveniste" },
    ]);
    const views = await listCentralRules({ SOINS: "Soins" });
    expect(views).toHaveLength(ADVICE_RULES.length + 1);
    expect(views[0]).toMatchObject({ status: "VALIDATED", decidedBy: "Donna Benveniste", decidedAt, outdated: false });
    expect(views.at(-1)).toMatchObject({ ruleKey: "custom-1", origin: "ADDED", status: "REMOVED", proposes: expect.stringContaining("Soins") });
  });

  it("une validation donnée à une ancienne version est signalée « à relire »", async () => {
    mocks.prisma.centralAdviceRule.findMany.mockResolvedValue([{ ruleKey: RULE.key, source: "BUILT_IN", status: "VALIDATED", ruleVersion: "0.1", definition: null, decidedAt: new Date(), decidedByName: "Donna" }]);
    const [first] = await listCentralRules({});
    expect(first).toMatchObject({ status: "ACTIVE", outdated: true, decidedBy: null });
  });

  it("remet les majuscules des phrases de modèle", () => {
    expect(startSentence("le médicament est un antibiotique. le produit l'accompagne.")).toBe("Le médicament est un antibiotique. Le produit l'accompagne.");
    expect(startSentence("« le médicament constipe. »")).toBe("« Le médicament constipe. »");
  });
});

describe("valider, supprimer, rétablir une règle", () => {
  it("valide une règle du code sur sa version actuelle, signée et tracée", async () => {
    expect(await decideRule(ADMIN, RULE.key, "VALIDATE")).toEqual({ ok: true, title: RULE.title });
    const call = mocks.prisma.centralAdviceRule.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ ruleKey: RULE.key });
    expect(call.create).toMatchObject({ ruleKey: RULE.key, source: "BUILT_IN", status: "VALIDATED", ruleVersion: RULE.version, decidedByAdminId: "adm_1", decidedByName: "Donna Benveniste" });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "central_advice.rule_decided", entityId: RULE.key, platformAdminId: "adm_1", metadata: expect.objectContaining({ decision: "VALIDATE", ruleVersion: RULE.version }) }));
  });

  it("supprime une règle du code : elle n'existe plus nulle part, aucune officine n'est nommée", async () => {
    expect(await decideRule(ADMIN, RULE.key, "REMOVE")).toMatchObject({ ok: true });
    const call = mocks.prisma.centralAdviceRule.upsert.mock.calls[0][0];
    expect(call.create).toMatchObject({ status: "REMOVED" });
    expect(JSON.stringify(call)).not.toContain("pharmacyId");
  });

  it("rétablit une règle du code en effaçant la décision : elle redevient « en ligne, à relire »", async () => {
    expect(await decideRule(ADMIN, RULE.key, "RESTORE")).toMatchObject({ ok: true });
    expect(mocks.prisma.centralAdviceRule.deleteMany).toHaveBeenCalledWith({ where: { ruleKey: RULE.key } });
    expect(mocks.prisma.centralAdviceRule.upsert).not.toHaveBeenCalled();
  });

  it("décide d'un conseil ajouté en le mettant à jour (jamais en le recréant)", async () => {
    mocks.prisma.centralAdviceRule.findUnique.mockResolvedValue({ source: "CUSTOM", definition });
    expect(await decideRule(ADMIN, "custom-1", "REMOVE")).toEqual({ ok: true, title: definition.title });
    expect(mocks.prisma.centralAdviceRule.update).toHaveBeenCalledWith({ where: { ruleKey: "custom-1" }, data: expect.objectContaining({ status: "REMOVED", decidedByName: "Donna Benveniste" }) });
    await decideRule(ADMIN, "custom-1", "RESTORE");
    expect(mocks.prisma.centralAdviceRule.update).toHaveBeenLastCalledWith({ where: { ruleKey: "custom-1" }, data: expect.objectContaining({ status: "ACTIVE", decidedAt: null, decidedByName: null }) });
  });

  it("refuse une règle inconnue : rien n'est écrit", async () => {
    expect(await decideRule(ADMIN, "regle-inventee", "VALIDATE")).toEqual({ ok: false, error: "Règle de conseil inconnue." });
    expect(mocks.prisma.centralAdviceRule.upsert).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe("ajouter un conseil", () => {
  it("l'enregistre en ligne « à relire » pour toutes les officines, signé, et le trace", async () => {
    const result = await addCustomRule(ADMIN, definition);
    expect(result.ok).toBe(true);
    const created = mocks.prisma.centralAdviceRule.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ source: "CUSTOM", status: "ACTIVE", decidedByAdminId: "adm_1", decidedByName: "Donna Benveniste" });
    expect(created.ruleKey).toMatch(/^custom-[0-9a-f]{12}$/);
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "central_advice.rule_created", platformAdminId: "adm_1" }));
  });

  it("refuse un conseil invalide : rien n'est écrit", async () => {
    const result = await addCustomRule(ADMIN, { ...definition, counterScript: "Sans produit nommé, donc refusé." });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("{product}") });
    expect(mocks.prisma.centralAdviceRule.create).not.toHaveBeenCalled();
  });
});

describe("les associations communes", () => {
  const draft = { trigger: { kind: "MEDICINE" as const, name: "CORYZALIA, comprimé orodispersible" }, advice: { ean: "3401234567890", name: "Olioseptil Bronche" }, sentence: "  Pour accompagner.  " };

  beforeEach(() => {
    mocks.prisma.centralAssociation.create.mockResolvedValue({ id: "ca_1" });
  });

  it("garde le médicament par son nom sans la forme, le produit par son code-barres, et nettoie la phrase", async () => {
    expect(await addCentralAssociation(ADMIN, draft)).toEqual({ ok: true, id: "ca_1" });
    expect(mocks.prisma.centralAssociation.create.mock.calls[0][0].data).toMatchObject({
      triggerKind: "MEDICINE",
      triggerKey: "drug:CORYZALIA",
      triggerLabel: "CORYZALIA",
      adviceEan: "3401234567890",
      adviceLabel: "Olioseptil Bronche",
      sentence: "Pour accompagner.",
      createdByName: "Donna Benveniste",
    });
  });

  it("un produit déclencheur est reconnu par son code-barres", async () => {
    await addCentralAssociation(ADMIN, { ...draft, trigger: { kind: "PRODUCT", ean: "3400111122223", name: "Spray nasal" } });
    expect(mocks.prisma.centralAssociation.create.mock.calls[0][0].data).toMatchObject({ triggerKind: "PRODUCT", triggerKey: "ean:3400111122223", triggerLabel: "Spray nasal" });
  });

  it("refuse un produit associé à lui-même et un produit sans code-barres, sans rien écrire", async () => {
    expect(await addCentralAssociation(ADMIN, { ...draft, trigger: { kind: "PRODUCT", ean: "3401234567890", name: "Même" } })).toMatchObject({ ok: false, error: expect.stringMatching(/lui-même/) });
    expect(await addCentralAssociation(ADMIN, { ...draft, advice: { ean: "sans", name: "X" } })).toMatchObject({ ok: false, error: expect.stringMatching(/code-barres/) });
    expect(mocks.prisma.centralAssociation.create).not.toHaveBeenCalled();
  });

  it("dit en français qu'une association existe déjà", async () => {
    mocks.prisma.centralAssociation.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    expect(await addCentralAssociation(ADMIN, draft)).toEqual({ ok: false, error: "Cette association existe déjà." });
  });

  it("valide, supprime ou rétablit une association pour toutes les officines", async () => {
    mocks.prisma.centralAssociation.findUnique.mockResolvedValue({ triggerLabel: "CORYZALIA", adviceLabel: "Olioseptil Bronche" });
    expect(await decideCentralAssociation(ADMIN, "ca_1", "REMOVE")).toEqual({ ok: true, label: "CORYZALIA → Olioseptil Bronche" });
    expect(mocks.prisma.centralAssociation.update).toHaveBeenCalledWith({ where: { id: "ca_1" }, data: expect.objectContaining({ status: "REMOVED", decidedByName: "Donna Benveniste" }) });
    await decideCentralAssociation(ADMIN, "ca_1", "RESTORE");
    expect(mocks.prisma.centralAssociation.update).toHaveBeenLastCalledWith({ where: { id: "ca_1" }, data: expect.objectContaining({ status: "ACTIVE", decidedAt: null }) });
    mocks.prisma.centralAssociation.findUnique.mockResolvedValue(null);
    expect(await decideCentralAssociation(ADMIN, "inconnue", "VALIDATE")).toEqual({ ok: false, error: "Association introuvable." });
  });
});

describe("chercher un produit à conseiller", () => {
  it("ne cherche qu'à partir de deux lettres, parmi les vraies officines, un résultat par code-barres", async () => {
    expect(await searchKnownProducts("a")).toEqual([]);
    expect(mocks.prisma.product.findMany).not.toHaveBeenCalled();
    mocks.prisma.product.findMany.mockResolvedValue([{ ean: "3401", name: "Spray", brand: null }, { ean: null, name: "Sans code", brand: null }]);
    expect(await searchKnownProducts("spray")).toEqual([{ ean: "3401", name: "Spray", brand: null }]);
    const where = mocks.prisma.product.findMany.mock.calls[0][0];
    expect(where.where).toMatchObject({ deletedAt: null, ean: { not: null }, pharmacy: { isDemo: false } });
    expect(where.distinct).toEqual(["ean"]);
  });
});
