import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les associations de produits côté serveur : ce que le moteur reçoit (les associations actives, et quelles lignes de
 * la vente SONT un produit du stock), et ce que le pharmacien peut écrire — toujours dans SON officine.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    productAssociation: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    productBarcode: { findMany: vi.fn() },
    product: { findMany: vi.fn(), findFirst: vi.fn() },
  },
  recordAudit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));

import { createAssociation, deleteAssociation, listAssociations, loadAssociationInput, resolveLineProducts, updateAssociation } from "../product-associations";

const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_1" };
const line = (position: number, drugName: string, rawText: string | null = null, status = "CONFIRMED") => ({ position, status, drugName, rawText });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.productAssociation.findMany.mockResolvedValue([]);
  mocks.prisma.productBarcode.findMany.mockResolvedValue([]);
  mocks.prisma.product.findMany.mockResolvedValue([]);
});

describe("quelles lignes de la vente sont un produit du stock", () => {
  it("retrouve un produit par le code appris au comptoir, par son EAN, ou par son nom exact", async () => {
    mocks.prisma.productBarcode.findMany.mockResolvedValue([{ code: "3400900000099", productId: "p_learned" }]);
    mocks.prisma.product.findMany
      .mockResolvedValueOnce([{ id: "p_ean", ean: "3400900000011" }])
      .mockResolvedValueOnce([{ id: "p_ean", name: "Spray nasal" }, { id: "p_name", name: "Olioseptil Bronche" }]);
    const found = await resolveLineProducts("ph_1", [line(0, "X", "3400900000099"), line(1, "Y", "3400900000011"), line(2, "OLIOSEPTIL  BRONCHE")], ["p_learned", "p_ean", "p_name"]);
    expect(found).toEqual([{ lineIndex: 0, productId: "p_learned" }, { lineIndex: 1, productId: "p_ean" }, { lineIndex: 2, productId: "p_name" }]);
  });

  it("ignore une ligne non confirmée, et ne cherche rien sans déclencheur", async () => {
    expect(await resolveLineProducts("ph_1", [line(0, "Spray nasal", null, "EXTRACTED")], ["p1"])).toEqual([]);
    expect(await resolveLineProducts("ph_1", [line(0, "Spray nasal")], [])).toEqual([]);
    expect(mocks.prisma.product.findMany).not.toHaveBeenCalled();
  });

  it("ne cherche que parmi les déclencheurs de l'officine, jamais un autre produit", async () => {
    await resolveLineProducts("ph_1", [line(0, "Spray nasal", "3400900000011")], ["p1"]);
    for (const [args] of mocks.prisma.product.findMany.mock.calls) expect(args.where).toMatchObject({ pharmacyId: "ph_1", id: { in: ["p1"] } });
    expect(mocks.prisma.productBarcode.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_1", productId: { in: ["p1"] } });
  });
});

describe("ce que le moteur reçoit", () => {
  it("rien du tout quand l'officine n'a aucune association : aucune autre requête", async () => {
    expect(await loadAssociationInput(SCOPE, [line(0, "Spray nasal")])).toBeUndefined();
    expect(mocks.prisma.product.findMany).not.toHaveBeenCalled();
  });

  it("les associations actives dont les deux produits existent encore, dans l'ordre", async () => {
    mocks.prisma.productAssociation.findMany.mockResolvedValue([{ id: "a1", triggerProductId: "p1", adviceProductId: "p2", sentence: null, sortOrder: 1 }]);
    mocks.prisma.product.findMany.mockResolvedValue([{ id: "p1", name: "Spray nasal" }]);
    const input = await loadAssociationInput(SCOPE, [line(0, "Spray nasal")]);
    expect(input).toEqual({ rules: [{ id: "a1", triggerProductId: "p1", adviceProductId: "p2", sentence: null, sortOrder: 1 }], lineProducts: [{ lineIndex: 0, productId: "p1" }] });
    expect(mocks.prisma.productAssociation.findMany.mock.calls[0][0].where).toEqual({ pharmacyId: "ph_1", isActive: true, triggerProduct: { deletedAt: null }, adviceProduct: { deletedAt: null } });
  });
});

describe("écrire une association", () => {
  const own = (id: string, name: string, isActive = true) => ({ id, name, isActive });
  beforeEach(() => {
    mocks.prisma.product.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === "p1" ? own("p1", "Spray nasal") : where.id === "p2" ? own("p2", "Olioseptil Bronche") : where.id === "off" ? own("off", "Désactivé", false) : null));
    mocks.prisma.productAssociation.findUnique.mockResolvedValue(null);
    mocks.prisma.productAssociation.findFirst.mockResolvedValue({ sortOrder: 4 });
    mocks.prisma.productAssociation.create.mockResolvedValue({ id: "a_new" });
  });

  it("enregistre l'association à la place suivante, avec sa phrase nettoyée, et la trace", async () => {
    const result = await createAssociation(SCOPE, { triggerProductId: "p1", adviceProductId: "p2", sentence: "  Pour la toux\n  qui s'installe.  " });
    expect(result).toEqual({ ok: true, id: "a_new", triggerName: "Spray nasal", adviceName: "Olioseptil Bronche" });
    expect(mocks.prisma.productAssociation.create.mock.calls[0][0].data).toMatchObject({ pharmacyId: "ph_1", triggerProductId: "p1", adviceProductId: "p2", sentence: "Pour la toux qui s'installe.", sortOrder: 5, createdByUserId: "u_1" });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "association.created", entityId: "a_new", pharmacyId: "ph_1", metadata: { triggerProductId: "p1", adviceProductId: "p2", withSentence: true } }));
  });

  it("refuse un produit associé à lui-même, une phrase trop longue, un produit d'une autre officine ou désactivé, un doublon", async () => {
    expect(await createAssociation(SCOPE, { triggerProductId: "p1", adviceProductId: "p1" })).toEqual({ ok: false, error: "Un produit ne peut pas être associé à lui-même." });
    expect((await createAssociation(SCOPE, { triggerProductId: "p1", adviceProductId: "p2", sentence: "x".repeat(241) })).ok).toBe(false);
    expect(await createAssociation(SCOPE, { triggerProductId: "p1", adviceProductId: "autre_officine" })).toEqual({ ok: false, error: "Produit introuvable dans votre catalogue." });
    expect((await createAssociation(SCOPE, { triggerProductId: "p1", adviceProductId: "off" }))).toEqual({ ok: false, error: "« Désactivé » est désactivé : on ne peut pas le conseiller." });
    mocks.prisma.productAssociation.findUnique.mockResolvedValue({ id: "a_old" });
    expect(await createAssociation(SCOPE, { triggerProductId: "p1", adviceProductId: "p2" })).toEqual({ ok: false, error: "Cette association existe déjà." });
    expect(mocks.prisma.productAssociation.create).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("ne cherche les produits que dans l'officine du demandeur, sans les supprimés", async () => {
    await createAssociation(SCOPE, { triggerProductId: "p1", adviceProductId: "p2" });
    for (const [args] of mocks.prisma.product.findFirst.mock.calls) expect(args.where).toMatchObject({ pharmacyId: "ph_1", deletedAt: null });
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
    mocks.prisma.productAssociation.findFirst.mockResolvedValue({ id: "a1", sentence: "Avant", isActive: true, triggerProductId: "p1", adviceProductId: "p2" });
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

  it("supprime et trace", async () => {
    mocks.prisma.productAssociation.findFirst.mockResolvedValue({ id: "a1", triggerProductId: "p1", adviceProductId: "p2" });
    expect(await deleteAssociation(SCOPE, "a1")).toEqual({ ok: true });
    expect(mocks.prisma.productAssociation.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "association.deleted", entityId: "a1" }));
  });
});

describe("la liste de l'écran", () => {
  it("ne lit que les associations de l'officine et dit le stock et la suppression de chaque produit", async () => {
    mocks.prisma.productAssociation.findMany.mockResolvedValue([
      {
        id: "a1",
        sentence: null,
        isActive: true,
        createdAt: new Date("2026-10-08T10:00:00Z"),
        triggerProduct: { id: "p1", name: "Spray nasal", brand: null, deletedAt: null, stockItem: { quantity: 3 } },
        adviceProduct: { id: "p2", name: "Olioseptil", brand: "Olioseptil", deletedAt: new Date(), stockItem: null },
        createdBy: { firstName: "Donna", lastName: "Benveniste" },
      },
    ]);
    const [view] = await listAssociations(SCOPE);
    expect(mocks.prisma.productAssociation.findMany.mock.calls[0][0].where).toEqual({ pharmacyId: "ph_1" });
    expect(view.triggerProduct).toMatchObject({ quantity: 3, deleted: false });
    expect(view.adviceProduct).toMatchObject({ quantity: 0, deleted: true });
    expect(view.createdBy).toBe("Donna Benveniste");
  });
});
