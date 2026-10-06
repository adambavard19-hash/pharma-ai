import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La remise à zéro des produits absents d'un stock COMPLET (`zeroAbsent`).
 * Une base en mémoire respecte les filtres que le code lui envoie : un filtre
 * oublié (officine, produit supprimé, produit créé à la main) se verrait tout
 * de suite, parce que la ligne en trop serait remise à zéro.
 */

type Json = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    jobs: [] as Json[],
    drugs: [] as Json[],
    products: [] as Json[],
    stockItems: [] as Json[],
    movements: [] as Json[],
    pharmacySynced: [] as string[],
    sequence: 0,
  };

  const relationsOf = (product: Json): Json => ({
    ...product,
    stockItem: state.stockItems.find((item) => item.productId === product.id) ?? null,
    stockMovements: state.movements.filter((movement) => movement.productId === product.id),
  });

  /** Les opérateurs que le code utilise : égalité, `gt`, `in`, et les deux relations de `Product`. */
  const matches = (row: Json, where: Json): boolean => {
    for (const [key, cond] of Object.entries(where)) {
      if (key === "stockItem") {
        const item = row.stockItem as Json | null;
        if (!item || !matches(item, cond as Json)) return false;
      } else if (key === "stockMovements") {
        const some = (cond as { some: Json }).some;
        if (!(row.stockMovements as Json[]).some((movement) => matches(movement, some))) return false;
      } else if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
        const op = cond as { gt?: number; in?: unknown[] };
        if (op.gt !== undefined && !((row[key] as number) > op.gt)) return false;
        if (op.in !== undefined && !op.in.includes(row[key])) return false;
      } else if (row[key] !== cond) return false;
    }
    return true;
  };

  const tx = {
    pharmacyDrugStock: {
      upsert: vi.fn(async ({ where, create, update }: { where: { pharmacyId_presentationId: { pharmacyId: string; presentationId: string } }; create: Json; update: Json }) => {
        const { pharmacyId, presentationId } = where.pharmacyId_presentationId;
        const found = state.drugs.find((drug) => drug.pharmacyId === pharmacyId && drug.presentationId === presentationId);
        if (found) Object.assign(found, update);
        else state.drugs.push({ id: `ds_new_${++state.sequence}`, ...create });
      }),
      findMany: vi.fn(async ({ where }: { where: Json }) => state.drugs.filter((drug) => matches(drug, where))),
      updateMany: vi.fn(async ({ where, data }: { where: Json; data: Json }) => {
        const targets = state.drugs.filter((drug) => matches(drug, where));
        for (const drug of targets) Object.assign(drug, data);
        return { count: targets.length };
      }),
    },
    product: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.products.find((product) => product.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Json }) => {
        Object.assign(state.products.find((product) => product.id === where.id)!, data);
      }),
      create: vi.fn(async ({ data }: { data: Json & { stockItem: { create: Json } } }) => {
        const { stockItem, ...rest } = data;
        const product = { id: `pr_new_${++state.sequence}`, deletedAt: null, ...rest };
        state.products.push(product);
        state.stockItems.push({ id: `si_new_${state.sequence}`, productId: product.id, ...stockItem.create });
        return { id: product.id };
      }),
      findMany: vi.fn(async ({ where }: { where: Json }) =>
        state.products
          .map(relationsOf)
          .filter((product) => matches(product, where))
          // Une lecture rend une copie, comme la vraie base : la suite ne voit pas les écritures d'après.
          .map((product) => ({ id: product.id, stockItem: product.stockItem ? { ...(product.stockItem as Json) } : null })),
      ),
    },
    stockItem: {
      findUnique: vi.fn(async ({ where }: { where: { productId: string } }) => state.stockItems.find((item) => item.productId === where.productId) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Json }) => {
        Object.assign(state.stockItems.find((item) => item.id === where.id)!, data);
      }),
      create: vi.fn(async ({ data }: { data: Json }) => {
        state.stockItems.push({ id: `si_new_${++state.sequence}`, ...data });
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] }; pharmacyId: string }; data: Json }) => {
        const targets = state.stockItems.filter((item) => where.id.in.includes(item.id as string) && item.pharmacyId === where.pharmacyId);
        for (const item of targets) Object.assign(item, data);
        return { count: targets.length };
      }),
    },
    stockMovement: {
      create: vi.fn(async ({ data }: { data: Json }) => {
        state.movements.push({ ...data });
      }),
      createMany: vi.fn(async ({ data }: { data: Json[] }) => {
        state.movements.push(...data.map((movement) => ({ ...movement })));
        return { count: data.length };
      }),
    },
    importJob: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Json }) => {
        Object.assign(state.jobs.find((job) => job.id === where.id)!, data);
      }),
    },
    pharmacy: {
      update: vi.fn(async ({ where }: { where: { id: string } }) => {
        state.pharmacySynced.push(where.id);
      }),
    },
  };

  const prisma = {
    importJob: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.jobs.find((job) => job.id === where.id) ?? null) },
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  };

  return { state, tx, prisma };
});

const mocks = vi.hoisted(() => ({
  createNotification: vi.fn(),
  refreshStockNotifications: vi.fn(),
  recordAudit: vi.fn(),
  classify: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));
vi.mock("@/server/db/demo-scope", () => ({ recordIsDemo: () => false }));
vi.mock("../references", () => ({ reserveReferences: async (_kind: string, _pharmacyId: string, count: number) => Array.from({ length: count }, (_, index) => `REF-${index + 1}`) }));
vi.mock("../notifications", () => ({ createNotification: mocks.createNotification, refreshStockNotifications: mocks.refreshStockNotifications }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("../product-classification", () => ({ classifyPharmacyProducts: mocks.classify }));
vi.mock("../pdf-text", () => ({ extractPdfLayoutText: vi.fn() }));

const { commitStockImport } = await import("../stock-import");

const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" };

const row = (line: number, extra: Json) => ({
  line,
  name: `Produit ${line}`,
  code: null,
  quantity: 1,
  salePriceCents: null,
  purchasePriceCents: null,
  vatRate: null,
  brand: null,
  categoryLabel: null,
  issues: [],
  targetId: null,
  targetLabel: null,
  candidates: [],
  ...extra,
});

/** Un stock complet : un médicament, un produit connu, une ligne illisible, un produit nouveau. */
const FILE_ROWS = [
  row(1, { status: "MEDICAMENT", targetId: "pres_A", quantity: 6 }),
  row(2, { status: "PRODUIT_EXISTANT", targetId: "pr_1", quantity: 12 }),
  row(3, { status: "INVALIDE", quantity: null }),
  row(4, { status: "NON_RECONNU", name: "Nouveau produit", quantity: 4 }),
];

const drug = (id: string, pharmacyId: string, presentationId: string, quantity: number, source: string) => ({ id, pharmacyId, presentationId, quantity, source, lastCountedAt: null });
const product = (id: string, pharmacyId: string, deletedAt: Date | null = null) => ({ id, pharmacyId, name: id, deletedAt });
const stockItem = (id: string, productId: string, pharmacyId: string, quantity: number) => ({ id, productId, pharmacyId, quantity, lastCountedAt: null });
const importMovement = (productId: string, pharmacyId: string) => ({ productId, pharmacyId, type: "IMPORT", quantityDelta: 0, quantityAfter: 0, reason: "avant" });

beforeEach(() => {
  vi.resetAllMocks();
  const { state } = db;
  state.sequence = 0;
  state.pharmacySynced = [];
  state.jobs = [{ id: "job_1", pharmacyId: "ph_1", status: "PENDING", fileName: "stock.csv", summary: {}, payload: { rows: FILE_ROWS } }];
  state.drugs = [
    drug("ds_A", "ph_1", "pres_A", 5, "IMPORT"), // dans le fichier
    drug("ds_B", "ph_1", "pres_B", 3, "IMPORT"), // absent : remis à zéro
    drug("ds_C", "ph_1", "pres_C", 4, "MANUAL"), // saisi à la main : jamais touché
    drug("ds_D", "ph_1", "pres_D", 0, "IMPORT"), // déjà à zéro
    drug("ds_X", "ph_2", "pres_B", 9, "IMPORT"), // une autre officine
  ];
  state.products = [
    product("pr_1", "ph_1"), // dans le fichier
    product("pr_2", "ph_1"), // absent : remis à zéro
    product("pr_3", "ph_1"), // créé à la main (aucun mouvement d'import)
    product("pr_4", "ph_1", new Date("2026-09-01")), // supprimé
    product("pr_5", "ph_1"), // déjà à zéro
    product("pr_6", "ph_2"), // une autre officine
  ];
  state.stockItems = [
    stockItem("si_1", "pr_1", "ph_1", 10),
    stockItem("si_2", "pr_2", "ph_1", 7),
    stockItem("si_3", "pr_3", "ph_1", 2),
    stockItem("si_4", "pr_4", "ph_1", 5),
    stockItem("si_5", "pr_5", "ph_1", 0),
    stockItem("si_6", "pr_6", "ph_2", 8),
  ];
  state.movements = [importMovement("pr_1", "ph_1"), importMovement("pr_2", "ph_1"), importMovement("pr_4", "ph_1"), importMovement("pr_5", "ph_1"), importMovement("pr_6", "ph_2")];
  mocks.createNotification.mockResolvedValue(undefined);
  mocks.refreshStockNotifications.mockResolvedValue(undefined);
  mocks.recordAudit.mockResolvedValue(undefined);
  mocks.classify.mockResolvedValue({ considered: 1, remaining: 0 });
});

const quantityOf = (id: string) => db.state.stockItems.find((item) => item.id === id)!.quantity;
const drugQuantity = (id: string) => db.state.drugs.find((item) => item.id === id)!.quantity;

describe("commitStockImport avec zeroAbsent", () => {
  it("remet à zéro ce que l'officine avait par import et que le fichier ne mentionne plus", async () => {
    const outcome = await commitStockImport({ scope: SCOPE, pharmacyIsDemo: false, jobId: "job_1", decisions: {}, createUnknownByDefault: true, zeroAbsent: true });

    // Un médicament et un produit absents.
    expect(outcome.zeroed).toBe(2);
    expect(drugQuantity("ds_B")).toBe(0);
    expect(db.state.drugs.find((item) => item.id === "ds_B")!.lastCountedAt).toBeInstanceOf(Date);
    expect(quantityOf("si_2")).toBe(0);
    expect(db.state.stockItems.find((item) => item.id === "si_2")!.lastCountedAt).toBeInstanceOf(Date);

    // Les lignes du fichier ont leur quantité du fichier.
    expect(drugQuantity("ds_A")).toBe(6);
    expect(quantityOf("si_1")).toBe(12);
    expect(outcome).toMatchObject({ drugsUpserted: 1, productsUpdated: 1, productsCreated: 1, invalid: 1 });
  });

  it("garde la trace : un mouvement d'import par produit remis à zéro, avec le motif et l'ancienne quantité", async () => {
    await commitStockImport({ scope: SCOPE, pharmacyIsDemo: false, jobId: "job_1", decisions: {}, createUnknownByDefault: true, zeroAbsent: true });

    const zeroing = db.state.movements.filter((movement) => movement.productId === "pr_2" && movement.quantityAfter === 0 && movement.reason !== "avant");
    expect(zeroing).toEqual([
      { pharmacyId: "ph_1", productId: "pr_2", type: "IMPORT", quantityDelta: -7, quantityAfter: 0, reason: "Absent du stock envoyé (stock.csv)", userId: "u_owner" },
    ]);
  });

  it("épargne les produits créés à la main, supprimés ou déjà à zéro", async () => {
    await commitStockImport({ scope: SCOPE, pharmacyIsDemo: false, jobId: "job_1", decisions: {}, createUnknownByDefault: true, zeroAbsent: true });

    expect(quantityOf("si_3")).toBe(2); // sans mouvement d'import
    expect(quantityOf("si_4")).toBe(5); // supprimé
    expect(quantityOf("si_5")).toBe(0);
    expect(drugQuantity("ds_C")).toBe(4); // saisi à la main
    expect(drugQuantity("ds_D")).toBe(0);
    const nouveaux = db.state.movements.filter((movement) => movement.reason !== "avant" && (movement.productId === "pr_3" || movement.productId === "pr_4" || movement.productId === "pr_5"));
    expect(nouveaux).toEqual([]);
  });

  it("n'efface jamais le stock d'une autre officine", async () => {
    await commitStockImport({ scope: SCOPE, pharmacyIsDemo: false, jobId: "job_1", decisions: {}, createUnknownByDefault: true, zeroAbsent: true });

    expect(drugQuantity("ds_X")).toBe(9);
    expect(quantityOf("si_6")).toBe(8);
    expect(db.state.movements.filter((movement) => movement.pharmacyId === "ph_2")).toHaveLength(1); // le sien, d'avant
  });

  it("ne remet pas à zéro un produit que le fichier vient de créer", async () => {
    await commitStockImport({ scope: SCOPE, pharmacyIsDemo: false, jobId: "job_1", decisions: {}, createUnknownByDefault: true, zeroAbsent: true });

    const created = db.state.products.find((item) => item.name === "Nouveau produit")!;
    const item = db.state.stockItems.find((candidate) => candidate.productId === created.id)!;
    expect(item.quantity).toBe(4);
  });

  it("tout se passe dans la même transaction, avant la clôture de l'analyse", async () => {
    await commitStockImport({ scope: SCOPE, pharmacyIsDemo: false, jobId: "job_1", decisions: {}, createUnknownByDefault: true, zeroAbsent: true });

    expect(db.prisma.$transaction).toHaveBeenCalledTimes(1);
    const job = db.state.jobs[0] as { status: string; summary: { outcome: { zeroed: number } } };
    expect(job.status).toBe("COMPLETED");
    expect(job.summary.outcome.zeroed).toBe(2);
    expect(db.state.pharmacySynced).toEqual(["ph_1"]);
  });

  it("une écriture qui échoue en route : l'erreur remonte et rien n'est annoncé au titulaire", async () => {
    db.tx.stockItem.updateMany.mockRejectedValueOnce(new Error("panne"));
    await expect(commitStockImport({ scope: SCOPE, pharmacyIsDemo: false, jobId: "job_1", decisions: {}, createUnknownByDefault: true, zeroAbsent: true })).rejects.toThrow("panne");
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe("commitStockImport sans zeroAbsent", () => {
  it("ne touche que les lignes du fichier : c'est le comportement d'avant", async () => {
    const outcome = await commitStockImport({ scope: SCOPE, pharmacyIsDemo: false, jobId: "job_1", decisions: {}, createUnknownByDefault: true });

    expect(outcome.zeroed).toBe(0);
    expect(drugQuantity("ds_B")).toBe(3);
    expect(quantityOf("si_2")).toBe(7);
    expect(db.tx.pharmacyDrugStock.findMany).not.toHaveBeenCalled();
    expect(db.tx.stockMovement.createMany).not.toHaveBeenCalled();
  });

  it("zeroAbsent: false est la même chose que l'absence du paramètre", async () => {
    const outcome = await commitStockImport({ scope: SCOPE, pharmacyIsDemo: false, jobId: "job_1", decisions: {}, createUnknownByDefault: true, zeroAbsent: false });
    expect(outcome.zeroed).toBe(0);
    expect(drugQuantity("ds_B")).toBe(3);
    expect(quantityOf("si_2")).toBe(7);
  });
});

describe("après l'écriture", () => {
  it("une notification qui échoue ne fait pas passer le stock écrit pour perdu", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createNotification.mockRejectedValue(new Error("notification indisponible"));
    const outcome = await commitStockImport({ scope: SCOPE, pharmacyIsDemo: false, jobId: "job_1", decisions: {}, createUnknownByDefault: true, zeroAbsent: true });
    expect(outcome.zeroed).toBe(2);
    expect(quantityOf("si_2")).toBe(0);
  });

  it("la notification du titulaire annonce les produits remis à zéro", async () => {
    await commitStockImport({ scope: SCOPE, pharmacyIsDemo: false, jobId: "job_1", decisions: {}, createUnknownByDefault: true, zeroAbsent: true });
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ pharmacyId: "ph_1", body: expect.stringContaining("2 remis à zéro") }));
  });
});

describe("commitStockImport au nom de l'équipe PharmaBoost", () => {
  const AS_TEAM = { scope: SCOPE, pharmacyIsDemo: false, jobId: "job_1", decisions: {}, createUnknownByDefault: true, zeroAbsent: true, actor: { platformAdminId: "adm_1" } };
  /** Les mouvements écrits par l'import (pas ceux d'avant). */
  const written = () => db.state.movements.filter((movement) => movement.reason !== "avant");

  it("le journal nomme l'administrateur de la console : ni le titulaire, ni un import « du titulaire »", async () => {
    await commitStockImport(AS_TEAM);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).toHaveBeenCalledWith({
      action: "product.imported",
      entityType: "ImportJob",
      entityId: "job_1",
      pharmacyId: "ph_1",
      userId: null,
      platformAdminId: "adm_1",
      metadata: expect.objectContaining({ by: "console", zeroed: 2, productsCreated: 1 }),
    });
  });

  it("les mouvements d'inventaire, de création et de remise à zéro ne sont pas attribués au titulaire", async () => {
    await commitStockImport(AS_TEAM);
    const movements = written();
    // Un produit mis à jour (pr_1), un produit créé, un produit remis à zéro (pr_2).
    expect(movements.length).toBeGreaterThanOrEqual(3);
    expect(movements.every((movement) => movement.userId === null)).toBe(true);
  });

  it("le titulaire reste prévenu : la notification d'import terminé lui est adressée", async () => {
    await commitStockImport(AS_TEAM);
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ pharmacyId: "ph_1", userId: "u_owner", type: "IMPORT_COMPLETED" }));
  });

  it("l'import du titulaire lui-même est inchangé : son nom partout, aucun administrateur, pas de « console »", async () => {
    await commitStockImport({ ...AS_TEAM, actor: undefined });
    const [audit] = mocks.recordAudit.mock.calls[0];
    expect(audit).toMatchObject({ action: "product.imported", userId: "u_owner" });
    expect(audit).not.toHaveProperty("platformAdminId");
    expect(audit.metadata).not.toHaveProperty("by");
    expect(written().every((movement) => movement.userId === "u_owner")).toBe(true);
  });
});
