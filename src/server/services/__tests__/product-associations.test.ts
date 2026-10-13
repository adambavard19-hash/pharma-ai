import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les associations de produits côté serveur : ce que le moteur reçoit (les associations actives, et ce que chaque ligne de
 * la vente EST — un produit du stock, un médicament du catalogue national), et ce que le pharmacien peut écrire — toujours
 * dans SON officine.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    productAssociation: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), createManyAndReturn: vi.fn(), update: vi.fn(), delete: vi.fn() },
    centralAssociation: { findMany: vi.fn() },
    triggerFamily: { findMany: vi.fn() },
    productBarcode: { findMany: vi.fn() },
    product: { findMany: vi.fn(), findFirst: vi.fn() },
    drugSpecialty: { findMany: vi.fn(), findUnique: vi.fn() },
    pharmacyDrugStock: { findMany: vi.fn() },
  },
  recordAudit: vi.fn(),
  loadAssociationDrugProducts: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("../catalog", () => ({ loadAssociationDrugProducts: mocks.loadAssociationDrugProducts }));

import { createAssociation, createAssociationGrid, createAssociations, deleteAssociation, listAssociations, loadAssociationInput, resolveLineTriggers, updateAssociation } from "../product-associations";

const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_1" };
const line = (position: number, drugName: string, rawText: string | null = null, extra: { status?: string; drugSpecialtyId?: string | null } = {}) => ({ position, status: extra.status ?? "CONFIRMED", drugName, rawText, drugSpecialtyId: extra.drugSpecialtyId ?? null });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.productAssociation.findMany.mockResolvedValue([]);
  mocks.prisma.centralAssociation.findMany.mockResolvedValue([]);
  mocks.prisma.triggerFamily.findMany.mockResolvedValue([]);
  mocks.prisma.productBarcode.findMany.mockResolvedValue([]);
  mocks.prisma.product.findMany.mockResolvedValue([]);
  mocks.prisma.drugSpecialty.findMany.mockResolvedValue([]);
  mocks.prisma.pharmacyDrugStock.findMany.mockResolvedValue([]);
  mocks.loadAssociationDrugProducts.mockResolvedValue(new Map());
});

describe("ce que chaque ligne de la vente est", () => {
  it("retrouve un produit par le code appris au comptoir, par son EAN, ou par son nom exact", async () => {
    mocks.prisma.productBarcode.findMany.mockResolvedValue([{ code: "3400900000099", productId: "p_learned" }]);
    mocks.prisma.product.findMany
      .mockResolvedValueOnce([{ id: "p_ean", ean: "3400900000011" }])
      .mockResolvedValueOnce([{ id: "p_ean", name: "Spray nasal" }, { id: "p_name", name: "Olioseptil Bronche" }]);
    const found = await resolveLineTriggers("ph_1", [line(0, "X", "3400900000099"), line(1, "Y", "3400900000011"), line(2, "OLIOSEPTIL  BRONCHE")], { productIds: ["p_learned", "p_ean", "p_name"], drugKeys: new Set() });
    expect(found).toEqual([
      { lineIndex: 0, keys: ["product:p_learned"], productId: "p_learned" },
      { lineIndex: 1, keys: ["product:p_ean"], productId: "p_ean" },
      { lineIndex: 2, keys: ["product:p_name"], productId: "p_name" },
    ]);
  });

  it("reconnaît un médicament par son nom sans la forme, et par le nom officiel de sa spécialité", async () => {
    mocks.prisma.drugSpecialty.findMany.mockResolvedValue([{ id: "sp_1", name: "CORYZALIA, comprimé orodispersible" }]);
    const found = await resolveLineTriggers(
      "ph_1",
      [line(0, "CORYZALIA, solution buvable en récipient unidose"), line(1, "Coryza cp (écrit à la main)", null, { drugSpecialtyId: "sp_1" }), line(2, "OSCILLOCOCCINUM, granules")],
      { productIds: [], drugKeys: new Set(["drug:CORYZALIA"]) },
    );
    expect(found).toEqual([
      { lineIndex: 0, keys: ["drug:CORYZALIA"], productId: null },
      { lineIndex: 1, keys: ["drug:CORYZALIA"], productId: null },
    ]);
  });

  it("une ligne peut porter les deux : un médicament et un produit du stock", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([{ id: "p1", name: "Coryzalia" }]);
    const found = await resolveLineTriggers("ph_1", [line(0, "Coryzalia")], { productIds: ["p1"], drugKeys: new Set(["drug:CORYZALIA"]) });
    expect(found).toEqual([{ lineIndex: 0, keys: ["product:p1", "drug:CORYZALIA"], productId: "p1" }]);
  });

  it("ignore une ligne non confirmée, et ne cherche rien dont aucune association n'a besoin", async () => {
    expect(await resolveLineTriggers("ph_1", [line(0, "Spray nasal", null, { status: "EXTRACTED" })], { productIds: ["p1"], drugKeys: new Set() })).toEqual([]);
    expect(await resolveLineTriggers("ph_1", [line(0, "Spray nasal")], { productIds: [], drugKeys: new Set() })).toEqual([]);
    expect(mocks.prisma.product.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.drugSpecialty.findMany).not.toHaveBeenCalled();
  });

  it("ne cherche que parmi les déclencheurs de l'officine, jamais un autre produit", async () => {
    await resolveLineTriggers("ph_1", [line(0, "Spray nasal", "3400900000011")], { productIds: ["p1"], drugKeys: new Set() });
    for (const [args] of mocks.prisma.product.findMany.mock.calls) expect(args.where).toMatchObject({ pharmacyId: "ph_1", id: { in: ["p1"] } });
    expect(mocks.prisma.productBarcode.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_1", productId: { in: ["p1"] } });
  });
});

describe("ce que le moteur reçoit", () => {
  it("rien du tout quand l'officine n'a aucune association : aucune autre requête", async () => {
    expect(await loadAssociationInput(SCOPE, [line(0, "Spray nasal")])).toBeUndefined();
    expect(mocks.prisma.product.findMany).not.toHaveBeenCalled();
  });

  it("les associations actives, produit ou médicament, avec leur clé de déclenchement, dans l'ordre", async () => {
    mocks.prisma.productAssociation.findMany.mockResolvedValue([
      { id: "a1", triggerProductId: "p1", triggerSpecialty: null, adviceProductId: "p2", sentence: null, sortOrder: 1 },
      { id: "a2", triggerProductId: null, triggerSpecialty: { name: "CORYZALIA, comprimé orodispersible" }, adviceProductId: "p3", sentence: "Pour le rhume.", sortOrder: 2 },
    ]);
    mocks.prisma.product.findMany.mockResolvedValue([{ id: "p1", name: "Spray nasal" }]);
    const input = await loadAssociationInput(SCOPE, [line(0, "Spray nasal"), line(1, "CORYZALIA, comprimé orodispersible")]);
    expect(input?.rules).toEqual([
      { id: "a1", triggerKey: "product:p1", adviceProductId: "p2", sentence: null, sortOrder: 1 },
      { id: "a2", triggerKey: "drug:CORYZALIA", adviceProductId: "p3", sentence: "Pour le rhume.", sortOrder: 2 },
    ]);
    expect(input?.lines).toEqual([
      { lineIndex: 0, keys: ["product:p1"], productId: "p1" },
      { lineIndex: 1, keys: ["drug:CORYZALIA"], productId: null },
    ]);
    const where = mocks.prisma.productAssociation.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ pharmacyId: "ph_1", isActive: true });
    expect(where.AND).toEqual([
      { OR: [{ triggerProductId: { not: null }, triggerProduct: { deletedAt: null } }, { triggerSpecialtyId: { not: null } }] },
      { OR: [{ adviceProductId: { not: null }, adviceProduct: { deletedAt: null } }, { adviceSpecialtyId: { not: null } }] },
    ]);
  });

  it("un médicament proposé est retrouvé dans le stock de l'officine et rendu au moteur ; absent du stock, le moteur dira pourquoi", async () => {
    mocks.prisma.productAssociation.findMany.mockResolvedValue([
      { id: "a1", triggerProductId: "p1", triggerSpecialty: null, adviceProductId: null, adviceSpecialtyId: "sp_doli", sentence: null, sortOrder: 1 },
      { id: "a2", triggerProductId: "p1", triggerSpecialty: null, adviceProductId: null, adviceSpecialtyId: "sp_absent", sentence: null, sortOrder: 2 },
    ]);
    const doliprane = { id: "presentation:pr_doli", origin: "NATIONAL_DRUG", name: "DOLIPRANE 500 mg, gélule" };
    mocks.loadAssociationDrugProducts.mockResolvedValue(new Map([["sp_doli", doliprane]]));
    mocks.prisma.product.findMany.mockResolvedValue([{ id: "p1", name: "Spray nasal" }]);
    const input = await loadAssociationInput(SCOPE, [line(0, "Spray nasal")]);
    expect(mocks.loadAssociationDrugProducts).toHaveBeenCalledWith(SCOPE, ["sp_doli", "sp_absent"]);
    expect(input?.rules.map((rule) => [rule.id, rule.adviceProductId])).toEqual([["a1", "presentation:pr_doli"], ["a2", "specialty:sp_absent"]]);
    expect(input?.products).toEqual([doliprane]);
  });
});

describe("les associations communes à toutes les officines", () => {
  const central = (overrides: Record<string, unknown> = {}) => ({ id: "ca1", triggerKind: "MEDICINE", triggerKey: "drug:CORYZALIA", adviceEan: "3401111111111", sentence: "Pour accompagner.", sortOrder: 0, ...overrides });

  it("ne lit que les associations en ligne (ni supprimées), et les pose sur le stock de CETTE officine par code-barres", async () => {
    mocks.prisma.centralAssociation.findMany.mockResolvedValue([central()]);
    mocks.prisma.product.findMany.mockResolvedValueOnce([{ id: "p_advice", ean: "3401111111111" }]);
    const input = await loadAssociationInput(SCOPE, [line(0, "CORYZALIA, comprimé orodispersible")]);
    expect(mocks.prisma.centralAssociation.findMany.mock.calls[0][0].where).toEqual({ status: { not: "REMOVED" } });
    expect(mocks.prisma.product.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_1", ean: { in: ["3401111111111"] }, deletedAt: null });
    expect(input?.rules).toEqual([{ id: "central:ca1", triggerKey: "drug:CORYZALIA", adviceProductId: "p_advice", sentence: "Pour accompagner.", sortOrder: 1_000_000 }]);
    expect(input?.lines).toEqual([{ lineIndex: 0, keys: ["drug:CORYZALIA"], productId: null }]);
  });

  it("une officine qui n'a pas le produit conseillé en stock ne reçoit pas l'association : rien du tout", async () => {
    mocks.prisma.centralAssociation.findMany.mockResolvedValue([central()]);
    expect(await loadAssociationInput(SCOPE, [line(0, "CORYZALIA, comprimé orodispersible")])).toBeUndefined();
  });

  it("retrouve le produit conseillé aussi par un code appris au comptoir", async () => {
    mocks.prisma.centralAssociation.findMany.mockResolvedValue([central()]);
    mocks.prisma.productBarcode.findMany.mockResolvedValueOnce([{ code: "3401111111111", productId: "p_learned" }]);
    const input = await loadAssociationInput(SCOPE, [line(0, "CORYZALIA, comprimé orodispersible")]);
    expect(input?.rules[0]).toMatchObject({ adviceProductId: "p_learned" });
  });

  it("un produit déclencheur est retrouvé dans le stock par son code-barres ; absent du stock, l'association ne s'applique pas", async () => {
    mocks.prisma.centralAssociation.findMany.mockResolvedValue([
      central({ id: "ca2", triggerKind: "PRODUCT", triggerKey: "ean:3400222222222" }),
      central({ id: "ca3", triggerKind: "PRODUCT", triggerKey: "ean:3400999999999" }),
    ]);
    mocks.prisma.product.findMany.mockResolvedValueOnce([{ id: "p_advice", ean: "3401111111111" }, { id: "p_trigger", ean: "3400222222222" }]);
    const input = await loadAssociationInput(SCOPE, [line(0, "Spray nasal", "3400222222222")]);
    expect(input?.rules.map((rule) => [rule.id, rule.triggerKey])).toEqual([["central:ca2", "product:p_trigger"]]);
    expect(mocks.prisma.product.findMany.mock.calls[1][0].where).toMatchObject({ id: { in: ["p_trigger"] } });
  });

  it("un produit n'est jamais associé à lui-même, même retrouvé sous le même code", async () => {
    mocks.prisma.centralAssociation.findMany.mockResolvedValue([central({ triggerKind: "PRODUCT", triggerKey: "ean:3401111111111" })]);
    mocks.prisma.product.findMany.mockResolvedValueOnce([{ id: "p_same", ean: "3401111111111" }]);
    expect(await loadAssociationInput(SCOPE, [line(0, "Spray nasal")])).toBeUndefined();
  });

  it("une famille déclencheuse : tout produit dont le libellé en fait partie déclenche, sauf un produit retiré à la main", async () => {
    mocks.prisma.centralAssociation.findMany.mockResolvedValue([central({ id: "ca4", triggerKind: "FAMILY", triggerKey: "family:f1" })]);
    mocks.prisma.product.findMany.mockResolvedValueOnce([{ id: "p_advice", ean: "3401111111111" }]);
    mocks.prisma.triggerFamily.findMany.mockResolvedValue([{ id: "f1", includeTerms: ["shamp/shp chute"], excludeTerms: [], members: [{ key: "ean:3400555555555", included: false }] }]);
    const input = await loadAssociationInput(SCOPE, [line(0, "PHYTOCYANE SHP ANTI-CHUTE 200ML", "3400222222222"), line(1, "KLORANE SHAMPOOING QUININE ANTICHUTE", "3400555555555"), line(2, "SHAMPOOING DOUX")]);
    expect(mocks.prisma.triggerFamily.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["f1"] }, status: { not: "REMOVED" } });
    expect(input?.rules).toEqual([{ id: "central:ca4", triggerKey: "family:f1", adviceProductId: "p_advice", sentence: "Pour accompagner.", sortOrder: 1_000_000 }]);
    expect(input?.lines).toEqual([{ lineIndex: 0, keys: ["family:f1"], productId: null }]);
  });

  it("une famille supprimée ne déclenche plus rien", async () => {
    mocks.prisma.centralAssociation.findMany.mockResolvedValue([central({ id: "ca4", triggerKind: "FAMILY", triggerKey: "family:f1" })]);
    mocks.prisma.product.findMany.mockResolvedValueOnce([{ id: "p_advice", ean: "3401111111111" }]);
    expect(await loadAssociationInput(SCOPE, [line(0, "PHYTOCYANE SHP ANTI-CHUTE 200ML")])).toBeUndefined();
  });

  it("les associations de l'officine passent avant les communes", async () => {
    mocks.prisma.productAssociation.findMany.mockResolvedValue([{ id: "a1", triggerProductId: null, triggerSpecialty: { name: "CORYZALIA, comprimé orodispersible" }, adviceProductId: "p_own", sentence: null, sortOrder: 7 }]);
    mocks.prisma.centralAssociation.findMany.mockResolvedValue([central()]);
    mocks.prisma.product.findMany.mockResolvedValueOnce([{ id: "p_advice", ean: "3401111111111" }]);
    const input = await loadAssociationInput(SCOPE, [line(0, "CORYZALIA, comprimé orodispersible")]);
    expect(input?.rules.map((rule) => rule.id)).toEqual(["a1", "central:ca1"]);
  });
});

describe("écrire une association", () => {
  const own = (id: string, name: string, isActive = true) => ({ id, name, isActive });
  /** Le catalogue de l'officine ph_1 : un produit d'une autre officine n'y est pas, quel que soit l'identifiant envoyé. */
  const catalog: Record<string, ReturnType<typeof own>> = { p1: own("p1", "Spray nasal"), p2: own("p2", "Olioseptil Bronche"), p3: own("p3", "Sirop au miel"), p4: own("p4", "Pastilles gorge"), off: own("off", "Désactivé", false) };
  beforeEach(() => {
    mocks.prisma.product.findFirst.mockImplementation(async ({ where }: { where: { id: string; pharmacyId: string } }) => (where.pharmacyId === "ph_1" ? (catalog[where.id] ?? null) : null));
    mocks.prisma.product.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] }; pharmacyId: string } }) => (where.pharmacyId === "ph_1" ? where.id.in.flatMap((id) => (catalog[id] ? [catalog[id]] : [])) : []));
    mocks.prisma.productAssociation.findMany.mockResolvedValue([]);
    mocks.prisma.productAssociation.findFirst.mockResolvedValue({ sortOrder: 4 });
    mocks.prisma.productAssociation.createManyAndReturn.mockImplementation(async ({ data }: { data: { adviceProductId: string }[] }) => data.map((row) => ({ id: `a_${row.adviceProductId}`, adviceProductId: row.adviceProductId })));
    mocks.prisma.drugSpecialty.findUnique.mockResolvedValue({ id: "sp_1", name: "CORYZALIA, comprimé orodispersible" });
  });

  it("à partir d'un produit : à la place suivante, avec sa phrase nettoyée, et la trace", async () => {
    const result = await createAssociation(SCOPE, { triggerProductId: "p1", adviceProductId: "p2", sentence: "  Pour la toux\n  qui s'installe.  " });
    expect(result).toEqual({ ok: true, id: "a_p2", triggerName: "Spray nasal", adviceName: "Olioseptil Bronche" });
    const [row] = mocks.prisma.productAssociation.createManyAndReturn.mock.calls[0][0].data;
    expect(row).toMatchObject({ pharmacyId: "ph_1", triggerProductId: "p1", adviceProductId: "p2", sentence: "Pour la toux qui s'installe.", sortOrder: 5, createdByUserId: "u_1" });
    expect(row).not.toHaveProperty("triggerSpecialtyId");
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "association.created", entityId: "a_p2", pharmacyId: "ph_1", metadata: expect.objectContaining({ trigger: "PRODUCT", triggerProductId: "p1", adviceProductId: "p2", withSentence: true }) }));
  });

  it("à partir d'un médicament du catalogue national, sous le nom sans la forme", async () => {
    const result = await createAssociation(SCOPE, { triggerSpecialtyId: "sp_1", adviceProductId: "p2" });
    expect(result).toEqual({ ok: true, id: "a_p2", triggerName: "CORYZALIA", adviceName: "Olioseptil Bronche" });
    const [row] = mocks.prisma.productAssociation.createManyAndReturn.mock.calls[0][0].data;
    expect(row).toMatchObject({ pharmacyId: "ph_1", triggerSpecialtyId: "sp_1", adviceProductId: "p2", createdByUserId: "u_1" });
    expect(row).not.toHaveProperty("triggerProductId");
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ trigger: "DRUG", triggerSpecialtyId: "sp_1" }) }));
  });

  it("refuse le doublon d'un médicament sous une autre forme : Coryzalia est Coryzalia", async () => {
    mocks.prisma.productAssociation.findMany.mockResolvedValue([{ adviceProductId: "p2", triggerSpecialty: { name: "CORYZALIA, solution buvable en récipient unidose" } }]);
    expect(await createAssociation(SCOPE, { triggerSpecialtyId: "sp_1", adviceProductId: "p2" })).toEqual({ ok: false, error: "« Olioseptil Bronche » est déjà associé à « CORYZALIA »." });
    expect(mocks.prisma.productAssociation.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("refuse un déclencheur absent, double ou inconnu, un produit associé à lui-même, une phrase trop longue, un produit d'une autre officine ou désactivé, un doublon", async () => {
    expect((await createAssociation(SCOPE, { adviceProductId: "p2" })).ok).toBe(false);
    expect((await createAssociation(SCOPE, { triggerProductId: "p1", triggerSpecialtyId: "sp_1", adviceProductId: "p2" })).ok).toBe(false);
    expect(await createAssociation(SCOPE, { triggerProductId: "p1", adviceProductId: "p1" })).toEqual({ ok: false, error: "Un produit ne peut pas être associé à lui-même." });
    expect((await createAssociation(SCOPE, { triggerProductId: "p1", adviceProductId: "p2", sentence: "x".repeat(241) })).ok).toBe(false);
    expect(await createAssociation(SCOPE, { triggerProductId: "p1", adviceProductId: "autre_officine" })).toEqual({ ok: false, error: "Produit introuvable dans votre catalogue." });
    expect(await createAssociation(SCOPE, { triggerProductId: "autre_officine", adviceProductId: "p2" })).toEqual({ ok: false, error: "Produit introuvable dans votre catalogue." });
    expect(await createAssociation(SCOPE, { triggerProductId: "p1", adviceProductId: "off" })).toEqual({ ok: false, error: "« Désactivé » est désactivé : on ne peut pas le conseiller." });
    mocks.prisma.drugSpecialty.findUnique.mockResolvedValue(null);
    expect(await createAssociation(SCOPE, { triggerSpecialtyId: "inconnu", adviceProductId: "p2" })).toEqual({ ok: false, error: "Médicament introuvable dans le catalogue national." });
    mocks.prisma.productAssociation.findMany.mockResolvedValue([{ adviceProductId: "p2" }]);
    expect(await createAssociation(SCOPE, { triggerProductId: "p1", adviceProductId: "p2" })).toEqual({ ok: false, error: "« Olioseptil Bronche » est déjà associé à « Spray nasal »." });
    expect(mocks.prisma.productAssociation.createManyAndReturn).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("ne cherche les produits que dans l'officine du demandeur, sans les supprimés", async () => {
    await createAssociation(SCOPE, { triggerProductId: "p1", adviceProductId: "p2" });
    for (const [args] of mocks.prisma.product.findFirst.mock.calls) expect(args.where).toMatchObject({ pharmacyId: "ph_1", deletedAt: null });
    for (const [args] of mocks.prisma.product.findMany.mock.calls) expect(args.where).toMatchObject({ pharmacyId: "ph_1", deletedAt: null });
    expect(mocks.prisma.productAssociation.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_1", triggerProductId: "p1" });
  });
});

describe("plusieurs produits conseillés d'un coup", () => {
  const own = (id: string, name: string, isActive = true) => ({ id, name, isActive });
  const catalog: Record<string, ReturnType<typeof own>> = { p1: own("p1", "Spray nasal"), p2: own("p2", "Olioseptil Bronche"), p3: own("p3", "Sirop au miel"), p4: own("p4", "Pastilles gorge"), off: own("off", "Désactivé", false) };
  beforeEach(() => {
    mocks.prisma.product.findFirst.mockImplementation(async ({ where }: { where: { id: string; pharmacyId: string } }) => (where.pharmacyId === "ph_1" ? (catalog[where.id] ?? null) : null));
    mocks.prisma.product.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] }; pharmacyId: string } }) => (where.pharmacyId === "ph_1" ? where.id.in.flatMap((id) => (catalog[id] ? [catalog[id]] : [])) : []));
    mocks.prisma.productAssociation.findMany.mockResolvedValue([]);
    mocks.prisma.productAssociation.findFirst.mockResolvedValue(null);
    mocks.prisma.productAssociation.createManyAndReturn.mockImplementation(async ({ data }: { data: { adviceProductId: string }[] }) => data.map((row) => ({ id: `a_${row.adviceProductId}`, adviceProductId: row.adviceProductId })));
    mocks.prisma.drugSpecialty.findUnique.mockResolvedValue({ id: "sp_cet", name: "CETIRIZINE ZENTIVA 10 mg, comprimé pelliculé sécable" });
  });

  it("trois produits pour un médicament du stock : trois associations en UNE écriture, dans l'ordre choisi, chacune tracée", async () => {
    const result = await createAssociations(SCOPE, { triggerSpecialtyId: "sp_cet", adviceProductIds: ["p2", "p3", "p4"], sentence: "Pour accompagner." });
    expect(result).toEqual({
      ok: true,
      triggerName: "CETIRIZINE ZENTIVA 10 mg",
      created: [
        { id: "a_p2", adviceProductId: "p2", adviceName: "Olioseptil Bronche" },
        { id: "a_p3", adviceProductId: "p3", adviceName: "Sirop au miel" },
        { id: "a_p4", adviceProductId: "p4", adviceName: "Pastilles gorge" },
      ],
      skipped: [],
    });
    expect(mocks.prisma.productAssociation.createManyAndReturn).toHaveBeenCalledTimes(1);
    const call = mocks.prisma.productAssociation.createManyAndReturn.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data.map((row: { adviceProductId: string; sortOrder: number }) => [row.adviceProductId, row.sortOrder])).toEqual([["p2", 1], ["p3", 2], ["p4", 3]]);
    expect(call.data.every((row: { pharmacyId: string; triggerSpecialtyId: string; sentence: string }) => row.pharmacyId === "ph_1" && row.triggerSpecialtyId === "sp_cet" && row.sentence === "Pour accompagner.")).toBe(true);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(3);
  });

  it("un doublon est signalé sans bloquer les autres ; un produit en double dans la demande ne compte qu'une fois", async () => {
    mocks.prisma.productAssociation.findMany.mockResolvedValue([{ adviceProductId: "p3", triggerSpecialty: { name: "CETIRIZINE ZENTIVA 10 mg, comprimé à sucer" } }]);
    const result = await createAssociations(SCOPE, { triggerSpecialtyId: "sp_cet", adviceProductIds: ["p2", "p3", "p2", "p4"] });
    if (!result.ok) throw new Error(result.error);
    expect(result.created.map((row) => row.adviceProductId)).toEqual(["p2", "p4"]);
    expect(result.skipped).toEqual([{ adviceProductId: "p3", adviceName: "Sirop au miel", reason: "« Sirop au miel » est déjà associé à « CETIRIZINE ZENTIVA 10 mg »." }]);
    expect(mocks.prisma.productAssociation.createManyAndReturn.mock.calls[0][0].data.map((row: { adviceProductId: string }) => row.adviceProductId)).toEqual(["p2", "p4"]);
  });

  it("deux enregistrements simultanés : la base départage, le perdant est dit « déjà associé », rien n'est créé deux fois", async () => {
    // Entre la lecture et l'écriture, un collègue a créé p3 : l'instruction l'ignore (contrainte d'unicité) et ne le rend pas.
    mocks.prisma.productAssociation.createManyAndReturn.mockResolvedValue([{ id: "a_p2", adviceProductId: "p2" }]);
    const result = await createAssociations(SCOPE, { triggerProductId: "p1", adviceProductIds: ["p2", "p3"] });
    if (!result.ok) throw new Error(result.error);
    expect(result.created.map((row) => row.adviceProductId)).toEqual(["p2"]);
    expect(result.skipped.map((skip) => [skip.adviceProductId, skip.reason])).toEqual([["p3", "« Sirop au miel » est déjà associé à « Spray nasal »."]]);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
  });

  it("écarte, avec sa raison, le produit d'une autre officine, le désactivé et le déclencheur lui-même — et crée le reste", async () => {
    const result = await createAssociations(SCOPE, { triggerProductId: "p1", adviceProductIds: ["autre_officine", "off", "p1", "p2"] });
    if (!result.ok) throw new Error(result.error);
    expect(result.created.map((row) => row.adviceProductId)).toEqual(["p2"]);
    expect(result.skipped.map((skip) => [skip.adviceProductId, skip.reason])).toEqual([
      ["autre_officine", "Produit introuvable dans votre catalogue."],
      ["off", "« Désactivé » est désactivé : on ne peut pas le conseiller."],
      ["p1", "Un produit ne peut pas être associé à lui-même."],
    ]);
  });

  it("rien de créable : aucune écriture ; trop de produits ou aucun : refusé d'emblée", async () => {
    mocks.prisma.productAssociation.findMany.mockResolvedValue([{ adviceProductId: "p2" }]);
    const result = await createAssociations(SCOPE, { triggerProductId: "p1", adviceProductIds: ["p2"] });
    expect(result).toMatchObject({ ok: true, created: [] });
    expect(mocks.prisma.productAssociation.createManyAndReturn).not.toHaveBeenCalled();
    expect(await createAssociations(SCOPE, { triggerProductId: "p1", adviceProductIds: [] })).toEqual({ ok: false, error: "Choisissez au moins un produit à conseiller." });
    expect((await createAssociations(SCOPE, { triggerProductId: "p1", adviceProductIds: Array.from({ length: 11 }, (_, index) => `x${index}`) })).ok).toBe(false);
  });
});

describe("un médicament sans ordonnance du stock comme produit proposé", () => {
  beforeEach(() => {
    mocks.prisma.product.findFirst.mockResolvedValue({ id: "p1", name: "Spray nasal", isActive: true });
    mocks.prisma.product.findMany.mockResolvedValue([]);
    mocks.prisma.productAssociation.findMany.mockResolvedValue([]);
    mocks.prisma.productAssociation.findFirst.mockResolvedValue(null);
    mocks.prisma.productAssociation.createManyAndReturn.mockImplementation(async ({ data }: { data: { adviceSpecialtyId?: string; adviceProductId?: string }[] }) => data.map((row, index) => ({ id: `a${index}`, adviceProductId: row.adviceProductId ?? null, adviceSpecialtyId: row.adviceSpecialtyId ?? null })));
    mocks.prisma.drugSpecialty.findMany.mockResolvedValue([
      { id: "sp_doli", name: "DOLIPRANE 500 mg, gélule", withdrawnAt: null, prescriptionConditions: [] },
      { id: "sp_amox", name: "AMOXICILLINE 1 g, comprimé", withdrawnAt: null, prescriptionConditions: [{ label: "Liste I" }] },
      { id: "sp_absent", name: "HUMEX RHUME, comprimé", withdrawnAt: null, prescriptionConditions: [] },
    ]);
    // L'officine détient le Doliprane et l'amoxicilline, pas Humex.
    mocks.prisma.pharmacyDrugStock.findMany.mockResolvedValue([
      { quantity: 10, presentation: { specialtyId: "sp_doli" } },
      { quantity: 4, presentation: { specialtyId: "sp_doli" } },
      { quantity: 3, presentation: { specialtyId: "sp_amox" } },
    ]);
  });

  it("crée l'association vers le médicament détenu ; refuse, avec la raison, celui sur ordonnance et celui hors stock", async () => {
    const result = await createAssociations(SCOPE, { triggerProductId: "p1", adviceSpecialtyIds: ["sp_doli", "sp_amox", "sp_absent"] });
    if (!result.ok) throw new Error(result.error);
    expect(result.created).toEqual([{ id: "a0", adviceSpecialtyId: "sp_doli", adviceName: "DOLIPRANE 500 mg" }]);
    expect(result.skipped.map((skip) => skip.reason)).toEqual([
      "« AMOXICILLINE 1 g » est soumis à prescription : jamais proposé en vente additionnelle.",
      "« HUMEX RHUME » n'est pas dans votre stock : on ne propose que ce que l'officine peut remettre.",
    ]);
    const [row] = mocks.prisma.productAssociation.createManyAndReturn.mock.calls[0][0].data;
    expect(row).toMatchObject({ pharmacyId: "ph_1", triggerProductId: "p1", adviceSpecialtyId: "sp_doli" });
    expect(row).not.toHaveProperty("adviceProductId");
    // Le stock lu est celui de l'officine du demandeur.
    expect(mocks.prisma.pharmacyDrugStock.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_1" });
  });

  it("un médicament ne s'associe pas à lui-même, même sous une autre forme", async () => {
    mocks.prisma.drugSpecialty.findUnique.mockResolvedValue({ id: "sp_doli_cp", name: "DOLIPRANE 500 mg, comprimé" });
    const result = await createAssociations(SCOPE, { triggerSpecialtyId: "sp_doli_cp", adviceSpecialtyIds: ["sp_doli"] });
    expect(result).toMatchObject({ ok: true, created: [], skipped: [{ reason: "Un médicament ne peut pas être associé à lui-même." }] });
  });

  it("la liste dit qu'il s'agit d'un médicament, avec toutes ses boîtes en stock", async () => {
    mocks.prisma.productAssociation.findMany.mockResolvedValue([
      { id: "a1", sentence: null, isActive: true, createdAt: new Date(), triggerProduct: { id: "p1", name: "Spray nasal", brand: null, deletedAt: null, stockItem: { quantity: 3 } }, triggerSpecialty: null, adviceProduct: null, adviceSpecialty: { id: "sp_doli", name: "DOLIPRANE 500 mg, gélule" }, createdBy: null },
    ]);
    const [row] = await listAssociations(SCOPE);
    expect(row.advice).toEqual({ kind: "DRUG", id: "sp_doli", name: "DOLIPRANE 500 mg, gélule", brand: null, quantity: 14, deleted: false });
  });
});

describe("plusieurs déclencheurs × plusieurs produits", () => {
  const catalog: Record<string, { id: string; name: string; isActive: boolean }> = { p1: { id: "p1", name: "Spray nasal", isActive: true }, p2: { id: "p2", name: "Olioseptil", isActive: true }, p3: { id: "p3", name: "Sirop", isActive: true } };
  beforeEach(() => {
    mocks.prisma.product.findFirst.mockImplementation(async ({ where }: { where: { id: string; pharmacyId: string } }) => (where.pharmacyId === "ph_1" ? (catalog[where.id] ?? null) : null));
    mocks.prisma.product.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] }; pharmacyId: string } }) => (where.pharmacyId === "ph_1" ? where.id.in.flatMap((id) => (catalog[id] ? [catalog[id]] : [])) : []));
    mocks.prisma.productAssociation.findFirst.mockResolvedValue(null);
    mocks.prisma.drugSpecialty.findUnique.mockResolvedValue({ id: "sp_cet", name: "CETIRIZINE 10 mg, comprimé" });
    let n = 0;
    mocks.prisma.productAssociation.createManyAndReturn.mockImplementation(async ({ data }: { data: { adviceProductId: string }[] }) => data.map((row) => ({ id: `a${(n += 1)}`, adviceProductId: row.adviceProductId, adviceSpecialtyId: null })));
  });

  it("deux déclencheurs et deux produits : les quatre combinaisons, chacune une fois", async () => {
    const result = await createAssociationGrid(SCOPE, {
      triggers: [{ kind: "PRODUCT", id: "p1" }, { kind: "DRUG", id: "sp_cet" }, { kind: "PRODUCT", id: "p1" }],
      advice: [{ kind: "PRODUCT", id: "p2" }, { kind: "PRODUCT", id: "p3" }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.result.created.map((row) => [row.triggerName, row.adviceName])).toEqual([
      ["Spray nasal", "Olioseptil"],
      ["Spray nasal", "Sirop"],
      ["CETIRIZINE 10 mg", "Olioseptil"],
      ["CETIRIZINE 10 mg", "Sirop"],
    ]);
    expect(mocks.prisma.productAssociation.createManyAndReturn).toHaveBeenCalledTimes(2);
  });

  it("une combinaison qui existe déjà est écartée avec sa raison, le reste est créé", async () => {
    mocks.prisma.productAssociation.findMany.mockImplementation(async ({ where }: { where: { triggerProductId?: string } }) => (where.triggerProductId === "p1" ? [{ adviceProductId: "p2", adviceSpecialtyId: null }] : []));
    const result = await createAssociationGrid(SCOPE, { triggers: [{ kind: "PRODUCT", id: "p1" }, { kind: "DRUG", id: "sp_cet" }], advice: [{ kind: "PRODUCT", id: "p2" }] });
    if (!result.ok) throw new Error(result.error);
    expect(result.result.created.map((row) => row.triggerName)).toEqual(["CETIRIZINE 10 mg"]);
    expect(result.result.skipped).toEqual([{ adviceProductId: "p2", adviceName: "Olioseptil", reason: "« Olioseptil » est déjà associé à « Spray nasal ».", triggerName: "Spray nasal" }]);
  });

  it("un déclencheur d'une autre officine n'empêche pas les autres ; rien choisi ou trop de déclencheurs : refusé", async () => {
    const result = await createAssociationGrid(SCOPE, { triggers: [{ kind: "PRODUCT", id: "autre_officine" }, { kind: "PRODUCT", id: "p1" }], advice: [{ kind: "PRODUCT", id: "p2" }] });
    if (!result.ok) throw new Error(result.error);
    expect(result.result.created).toHaveLength(1);
    expect(result.result.skipped[0].reason).toBe("Produit introuvable dans votre catalogue.");
    expect((await createAssociationGrid(SCOPE, { triggers: [], advice: [{ kind: "PRODUCT", id: "p2" }] })).ok).toBe(false);
    expect((await createAssociationGrid(SCOPE, { triggers: [{ kind: "PRODUCT", id: "p1" }], advice: [] })).ok).toBe(false);
    expect((await createAssociationGrid(SCOPE, { triggers: Array.from({ length: 11 }, (_, i) => ({ kind: "PRODUCT" as const, id: `t${i}` })), advice: [{ kind: "PRODUCT", id: "p2" }] })).ok).toBe(false);
  });
});

describe("modifier ou supprimer", () => {
  it("une association d'une autre officine est introuvable", async () => {
    mocks.prisma.productAssociation.findFirst.mockResolvedValue(null);
    expect(await updateAssociation(SCOPE, "a_autre", { isActive: false })).toEqual({ ok: false, error: "Association introuvable." });
    expect(await deleteAssociation(SCOPE, "a_autre")).toEqual({ ok: false, error: "Association introuvable." });
    expect(mocks.prisma.productAssociation.findFirst.mock.calls[0][0].where).toEqual({ id: "a_autre", pharmacyId: "ph_1" });
    expect(mocks.prisma.productAssociation.update).not.toHaveBeenCalled();
    expect(mocks.prisma.productAssociation.delete).not.toHaveBeenCalled();
  });

  it("suspend ou réactive, change la phrase — et n'écrit rien quand rien ne change", async () => {
    mocks.prisma.productAssociation.findFirst.mockResolvedValue({ id: "a1", sentence: "Avant", isActive: true });
    expect(await updateAssociation(SCOPE, "a1", { isActive: false, sentence: "Après" })).toEqual({ ok: true });
    expect(mocks.prisma.productAssociation.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { sentence: "Après", isActive: false } });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "association.updated", metadata: { fields: ["sentence", "isActive"] } }));

    mocks.prisma.productAssociation.update.mockClear();
    mocks.recordAudit.mockClear();
    expect(await updateAssociation(SCOPE, "a1", { isActive: true, sentence: "Avant" })).toEqual({ ok: true });
    expect(mocks.prisma.productAssociation.update).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("refuse une phrase trop longue à la modification", async () => {
    mocks.prisma.productAssociation.findFirst.mockResolvedValue({ id: "a1", sentence: null, isActive: true });
    expect((await updateAssociation(SCOPE, "a1", { sentence: "x".repeat(300) })).ok).toBe(false);
  });

  it("supprime et trace, avec le déclencheur qu'il soit un produit ou un médicament", async () => {
    mocks.prisma.productAssociation.findFirst.mockResolvedValue({ id: "a1", triggerProductId: null, triggerSpecialtyId: "sp_1", adviceProductId: "p2" });
    expect(await deleteAssociation(SCOPE, "a1")).toEqual({ ok: true });
    expect(mocks.prisma.productAssociation.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "association.deleted", entityId: "a1", metadata: { triggerProductId: null, triggerSpecialtyId: "sp_1", adviceProductId: "p2" } }));
  });
});

describe("la liste de l'écran", () => {
  it("ne lit que les associations de l'officine et dit, pour chaque déclencheur, s'il est un produit ou un médicament", async () => {
    mocks.prisma.productAssociation.findMany.mockResolvedValue([
      { id: "a1", sentence: null, isActive: true, createdAt: new Date("2026-10-08T10:00:00Z"), triggerProduct: { id: "p1", name: "Spray nasal", brand: null, deletedAt: null, stockItem: { quantity: 3 } }, triggerSpecialty: null, adviceProduct: { id: "p2", name: "Olioseptil", brand: "Olioseptil", deletedAt: new Date(), stockItem: null }, createdBy: { firstName: "Donna", lastName: "Benveniste" } },
      { id: "a2", sentence: "Pour le rhume.", isActive: false, createdAt: new Date("2026-10-08T11:00:00Z"), triggerProduct: null, triggerSpecialty: { id: "sp_1", name: "CORYZALIA, comprimé orodispersible" }, adviceProduct: { id: "p3", name: "Sirop", brand: null, deletedAt: null, stockItem: { quantity: 8 } }, createdBy: null },
    ]);
    const [product, drug] = await listAssociations(SCOPE);
    expect(mocks.prisma.productAssociation.findMany.mock.calls[0][0].where).toEqual({ pharmacyId: "ph_1" });
    expect(product.trigger).toMatchObject({ kind: "PRODUCT", id: "p1", quantity: 3, deleted: false });
    expect(product.advice).toMatchObject({ quantity: 0, deleted: true });
    expect(product.createdBy).toBe("Donna Benveniste");
    expect(drug.trigger).toMatchObject({ kind: "DRUG", id: "sp_1", name: "CORYZALIA, comprimé orodispersible", quantity: null });
    expect(drug).toMatchObject({ isActive: false, sentence: "Pour le rhume." });
  });
});
