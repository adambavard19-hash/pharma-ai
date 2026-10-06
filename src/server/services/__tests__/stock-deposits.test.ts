import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le moteur des dépôts de stock : un fichier reçu (dossier PharmaBoost, bouton
 * du titulaire, dépôt de l'équipe) est gardé, lu, puis appliqué sans clic — ou
 * retenu quand il est bien plus petit que le stock connu. Une base en mémoire
 * fait respecter les filtres (officine, statut, délai) ; le stockage, la lecture
 * du fichier et l'écriture du stock sont simulés : rien n'est écrit, aucun
 * message ne part.
 */

type Row = Record<string, unknown> & { id: string; pharmacyId: string; status: string; receivedAt: Date };

const db = vi.hoisted(() => {
  const state = {
    deposits: [] as Row[],
    pharmacies: [] as Record<string, unknown>[],
    sequence: 0,
    failCreate: false,
  };

  const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

  /** Les opérateurs que le code utilise ; une valeur nulle ne satisfait jamais une comparaison, comme en SQL. */
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean => {
    for (const [key, cond] of Object.entries(where)) {
      if (key === "OR") {
        if (!(cond as Record<string, unknown>[]).some((alternative) => matches(row, alternative))) return false;
        continue;
      }
      const value = row[key];
      if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
        const op = cond as { not?: unknown; in?: unknown[]; gte?: Date; gt?: Date; lt?: Date; lte?: Date };
        if (op.not !== undefined && same(value, op.not)) return false;
        if (op.in && !op.in.includes(value)) return false;
        const compared = [op.gte, op.gt, op.lt, op.lte].some((bound) => bound !== undefined);
        if (compared && (value === null || value === undefined)) return false;
        if (op.gte && !((value as Date) >= op.gte)) return false;
        if (op.gt && !((value as Date) > op.gt)) return false;
        if (op.lt && !((value as Date) < op.lt)) return false;
        if (op.lte && !((value as Date) <= op.lte)) return false;
      } else if (!same(value, cond)) return false;
    }
    return true;
  };

  const withPharmacy = (row: Row) => ({ ...row, pharmacy: { name: (state.pharmacies.find((p) => p.id === row.pharmacyId)?.name as string) ?? "?" } });

  const stockDeposit = {
    // Une lecture rend une copie, comme la vraie base : deux administrateurs ne partagent pas la même ligne.
    findFirst: vi.fn(async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: { receivedAt: "asc" | "desc" }; select?: unknown }) => {
      const direction = orderBy?.receivedAt === "asc" ? 1 : -1;
      const found = state.deposits.filter((row) => matches(row, where)).sort((a, b) => direction * (a.receivedAt.getTime() - b.receivedAt.getTime()))[0];
      return found ? { ...found } : null;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const found = state.deposits.find((row) => row.id === where.id);
      return found ? { ...found } : null;
    }),
    findMany: vi.fn(async ({ where, orderBy, take, include }: { where: Record<string, unknown>; orderBy?: { receivedAt: "asc" | "desc" }; take?: number; include?: unknown }) => {
      const direction = orderBy?.receivedAt === "asc" ? 1 : -1;
      const rows = state.deposits.filter((row) => matches(row, where)).sort((a, b) => direction * (a.receivedAt.getTime() - b.receivedAt.getTime())).slice(0, take ?? 1000).map((row) => ({ ...row }));
      return include ? rows.map(withPharmacy) : rows;
    }),
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => state.deposits.filter((row) => matches(row, where)).length),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (state.failCreate) throw new Error("base indisponible");
      const row = {
        storageKey: null,
        lines: null,
        created: null,
        updated: null,
        invalid: null,
        zeroed: null,
        knownLines: null,
        message: null,
        importJobId: null,
        appliedAt: null,
        decidedById: null,
        decidedAt: null,
        fileDeletedAt: null,
        userId: null,
        receivedAt: new Date(),
        ...data,
      } as unknown as Row;
      state.deposits.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = state.deposits.find((candidate) => candidate.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const targets = state.deposits.filter((row) => matches(row, where));
      for (const row of targets) Object.assign(row, data);
      return { count: targets.length };
    }),
  };

  const prisma = {
    stockDeposit,
    pharmacy: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.pharmacies.find((p) => p.id === where.id) ?? null),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        state.pharmacies
          .filter((p) => matches(p, where))
          .map((p) => ({
            ...p,
            stockDeposits: state.deposits
              .filter((row) => row.pharmacyId === p.id && row.status === "APPLIED")
              .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
              .slice(0, 1),
          })),
      ),
    },
    pharmacyDrugStock: { count: vi.fn() },
    product: { count: vi.fn() },
    importJob: { updateMany: vi.fn() },
    stockConnection: { updateMany: vi.fn() },
  };

  return { state, prisma };
});

const mocks = vi.hoisted(() => ({
  analyse: vi.fn(),
  commit: vi.fn(),
  put: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
  getStorage: vi.fn(),
  rateLimited: vi.fn(),
  recordAudit: vi.fn(),
  notifyAdmins: vi.fn(),
  createNotification: vi.fn(),
  classify: vi.fn(),
  images: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));
vi.mock("@/server/ai/registry", () => ({ getStorageProvider: mocks.getStorage }));
vi.mock("@/server/http/rate-limit", () => ({ rateLimited: mocks.rateLimited }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("../sales/notifications", () => ({ notifyAdmins: mocks.notifyAdmins }));
vi.mock("../notifications", () => ({ createNotification: mocks.createNotification }));
vi.mock("../stock-import", () => ({ analyseStockImport: mocks.analyse, commitStockImport: mocks.commit }));
vi.mock("../product-classification", () => ({ classifyPharmacyProducts: mocks.classify }));
vi.mock("../product-images", () => ({ fetchMissingProductImages: mocks.images }));

const service = await import("../stock-deposits");
const { UnreadableFileError } = await import("@/core/stock-import");

const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" };
const BYTES = new TextEncoder().encode("cip;quantite\n3400930000001;4\n");
const DAY = 86_400_000;
/** L'empreinte réelle de BYTES : celle que le moteur calcule pour reconnaître un renvoi. */
const SHA = createHash("sha256").update(BYTES).digest("hex");

/** L'aperçu d'une analyse : `valid` lignes lisibles (dont `toVerify` à vérifier), `invalid` illisibles. */
function preview(options: { valid?: number; invalid?: number; toVerify?: number; missing?: string[]; jobId?: string; incomplete?: boolean; incompleteReason?: string } = {}) {
  const { valid = 10, invalid = 0, toVerify = 0, missing = [], jobId = "job_1", incomplete = false, incompleteReason } = options;
  const rows = [
    ...Array.from({ length: valid }, (_, index) => ({ line: index + 1, status: index < toVerify ? "A_VERIFIER" : "MEDICAMENT" })),
    ...Array.from({ length: invalid }, (_, index) => ({ line: valid + index + 1, status: "INVALIDE" })),
  ];
  return { jobId, fileName: "stock.csv", headers: [], mapping: {}, missing, warnings: [], incomplete, ...(incompleteReason ? { incompleteReason } : {}), rows, summary: { detected: rows.length, invalid } };
}

const OUTCOME = { jobId: "job_1", drugsUpserted: 6, productsUpdated: 3, productsCreated: 1, ignored: 0, invalid: 0, zeroed: 2, classification: null };

const owner = { id: "ph_1", name: "Pharmacie du Parc", organizationId: "org_1", isDemo: false, isActive: true, memberships: [{ userId: "u_owner" }] };

const deposit = (extra: Record<string, unknown> = {}): Row => ({
  id: "dep_1",
  pharmacyId: "ph_1",
  userId: "u_owner",
  fileName: "stock.csv",
  fileSize: 100,
  fileSha256: "sha",
  storageKey: "stock-deposits/ph_1/dep_1/stock.csv",
  status: "APPLIED",
  source: "WEB",
  lines: 10,
  created: 1,
  updated: 9,
  invalid: 0,
  zeroed: 0,
  knownLines: 10,
  message: null,
  importJobId: "job_0",
  receivedAt: new Date(),
  appliedAt: new Date(),
  decidedById: null,
  decidedAt: null,
  fileDeletedAt: null,
  ...extra,
});

const send = (extra: Record<string, unknown> = {}) =>
  service.receiveStockDeposit({ scope: SCOPE, pharmacyIsDemo: false, fileName: "stock.csv", bytes: BYTES, source: "WEB", ...extra });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.state.deposits = [];
  db.state.pharmacies = [owner];
  db.state.failCreate = false;
  mocks.getStorage.mockReturnValue({ put: mocks.put, read: mocks.read, delete: mocks.remove });
  mocks.put.mockResolvedValue({ key: "k" });
  mocks.read.mockResolvedValue(BYTES);
  mocks.remove.mockResolvedValue(undefined);
  mocks.rateLimited.mockReturnValue(false);
  mocks.recordAudit.mockResolvedValue(undefined);
  mocks.notifyAdmins.mockResolvedValue(undefined);
  mocks.createNotification.mockResolvedValue(undefined);
  mocks.analyse.mockResolvedValue(preview());
  mocks.commit.mockResolvedValue(OUTCOME);
  mocks.classify.mockResolvedValue({});
  mocks.images.mockResolvedValue({});
  // Le stock connu : 10 médicaments + 0 produit.
  db.prisma.pharmacyDrugStock.count.mockResolvedValue(10);
  db.prisma.product.count.mockResolvedValue(0);
  db.prisma.importJob.updateMany.mockResolvedValue({ count: 1 });
  db.prisma.stockConnection.updateMany.mockResolvedValue({ count: 1 });
});

describe("receiveStockDeposit : un fichier complet est appliqué tout seul", () => {
  it("garde le fichier, le lit, met le stock à jour et rend les compteurs", async () => {
    const result = await send();

    expect(result).toMatchObject({ ok: true, duplicate: false });
    if (!result.ok) return;
    expect(result.deposit).toMatchObject({
      pharmacyId: "ph_1",
      fileName: "stock.csv",
      fileSize: BYTES.byteLength,
      status: "APPLIED",
      source: "WEB",
      lines: 10,
      created: 1,
      updated: 9,
      invalid: 0,
      zeroed: 2,
      knownLines: 10,
      message: null,
      hasFile: true,
      stalled: false,
    });
    expect(result.deposit.appliedAt).toBeInstanceOf(Date);

    // Le fichier est rangé sous l'officine et le dépôt.
    const key = mocks.put.mock.calls[0][0] as string;
    expect(key).toBe(`stock-deposits/ph_1/${result.deposit.id}/stock.csv`);
    expect(mocks.put).toHaveBeenCalledWith(key, BYTES, "text/csv");
    expect(db.state.deposits[0]).toMatchObject({ storageKey: key, userId: "u_owner", source: "WEB", importJobId: "job_1" });
    expect(db.state.deposits[0].fileSha256).toMatch(/^[0-9a-f]{64}$/);

    // Une seule analyse, une seule écriture : stock complet, absents remis à zéro.
    expect(mocks.analyse).toHaveBeenCalledWith({ scope: SCOPE, fileName: "stock.csv", bytes: BYTES });
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(mocks.commit).toHaveBeenCalledWith({ scope: SCOPE, pharmacyIsDemo: false, jobId: "job_1", decisions: {}, createUnknownByDefault: true, zeroAbsent: true });
  });

  it("une piste incertaine devient un produit, comme pour l'agent", async () => {
    mocks.analyse.mockResolvedValue(preview({ valid: 5, toVerify: 2 }));
    await send();
    expect(mocks.commit.mock.calls[0][0].decisions).toEqual({ "1": { kind: "CREER_PRODUIT" }, "2": { kind: "CREER_PRODUIT" } });
  });

  it("journalise la réception et l'application, jamais le contenu du fichier", async () => {
    const result = await send();
    if (!result.ok) throw new Error("attendu");
    const actions = mocks.recordAudit.mock.calls.map(([call]) => call.action);
    expect(actions).toEqual(["stock.deposit_received", "stock.deposit_applied"]);
    for (const [call] of mocks.recordAudit.mock.calls) {
      expect(call).toMatchObject({ entityType: "StockDeposit", entityId: result.deposit.id, pharmacyId: "ph_1" });
      expect(JSON.stringify(call.metadata)).not.toContain("3400930000001");
    }
    expect(mocks.recordAudit.mock.calls[1][0].metadata).toMatchObject({ source: "WEB", lines: 10, created: 1, updated: 9, zeroed: 2 });
  });

  it("prévient l'équipe (information) ; le succès est déjà annoncé au titulaire par l'import", async () => {
    await send();
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: "STOCK_DEPOSIT", title: "Pharmacie du Parc — stock reçu", linkUrl: "/admin/depots-stock", severity: "INFO" }),
    );
    expect(mocks.notifyAdmins.mock.calls[0][0].body).toContain("stock.csv");
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("une notification qui échoue ne fait pas échouer le dépôt", async () => {
    mocks.notifyAdmins.mockRejectedValue(new Error("messagerie interne en panne"));
    const result = await send();
    expect(result).toMatchObject({ ok: true });
    expect(db.state.deposits[0].status).toBe("APPLIED");
  });

  it("le titulaire n'est nommé que pour un envoi qu'il a fait lui-même ; l'équipe, oui", async () => {
    await send({ source: "AGENT" });
    expect(db.state.deposits[0]).toMatchObject({ source: "AGENT", userId: null, decidedById: null });
    mocks.recordAudit.mockClear();
    db.state.deposits = [];
    mocks.analyse.mockResolvedValue(preview());
    await service.receiveStockDeposit({ scope: SCOPE, pharmacyIsDemo: false, fileName: "autre.csv", bytes: new TextEncoder().encode("autre"), source: "CONSOLE", adminId: "adm_1" });
    expect(db.state.deposits[0]).toMatchObject({ source: "CONSOLE", userId: null, decidedById: "adm_1" });
    expect(db.state.deposits[0].decidedAt).toBeInstanceOf(Date);
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ action: "stock.deposit_received", platformAdminId: "adm_1", userId: null });
  });

  it("compte le stock connu de CETTE officine seulement", async () => {
    await send();
    expect(db.prisma.pharmacyDrugStock.count).toHaveBeenCalledWith({ where: { pharmacyId: "ph_1", source: "IMPORT", quantity: { gt: 0 } } });
    expect(db.prisma.product.count.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_1", deletedAt: null, stockMovements: { some: { type: "IMPORT" } } });
  });
});

describe("receiveStockDeposit : le garde-fou de taille", () => {
  beforeEach(() => {
    // 4 200 lignes connues ; le fichier n'en contient que 120.
    db.prisma.pharmacyDrugStock.count.mockResolvedValue(4000);
    db.prisma.product.count.mockResolvedValue(200);
    mocks.analyse.mockResolvedValue(preview({ valid: 120, invalid: 3 }));
  });

  it("un fichier bien plus petit que le stock connu attend l'équipe : le stock ne bouge pas", async () => {
    const result = await send();
    if (!result.ok) throw new Error("attendu");
    expect(result.deposit).toMatchObject({ status: "HELD", lines: 120, invalid: 3, knownLines: 4200, appliedAt: null });
    expect(result.deposit.message).toContain("120 lignes valides");
    expect(result.deposit.message).toContain("4200");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("l'analyse n'est pas laissée en attente, et le fichier lui-même n'y reste pas", async () => {
    await send();
    expect(db.prisma.importJob.updateMany).toHaveBeenCalledWith({ where: { id: "job_1", status: "PENDING" }, data: expect.objectContaining({ status: "FAILED", payload: {} }) });
  });

  it("prévient l'équipe et le titulaire (avertissement), journalise la mise en attente", async () => {
    await send();
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ severity: "WARNING", linkUrl: "/admin/depots-stock" }));
    expect(mocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ pharmacyId: "ph_1", severity: "WARNING", linkUrl: "/stock/mise-a-jour", body: expect.stringContaining("votre stock n'a pas changé") }),
    );
    expect(mocks.recordAudit.mock.calls.map(([call]) => call.action)).toEqual(["stock.deposit_received", "stock.deposit_held"]);
  });
});

describe("receiveStockDeposit : un fichier qu'on ne sait pas lire", () => {
  it("colonnes manquantes : en échec, avec les colonnes en clair, l'analyse clôturée, le stock intact", async () => {
    mocks.analyse.mockResolvedValue(preview({ missing: ["quantity"] }));
    const result = await send();
    if (!result.ok) throw new Error("attendu");
    expect(result.deposit.status).toBe("FAILED");
    expect(result.deposit.message).toBe("Colonnes non reconnues : Quantité. Envoyez l'édition d'inventaire complète de votre logiciel.");
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(db.prisma.importJob.updateMany).toHaveBeenCalledWith({ where: { id: "job_1", status: "PENDING" }, data: expect.objectContaining({ status: "FAILED" }) });
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "IMPORT_FAILED", severity: "WARNING", linkUrl: "/stock/mise-a-jour" }));
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ severity: "WARNING" }));
    expect(mocks.recordAudit.mock.calls.map(([call]) => call.action)).toEqual(["stock.deposit_received", "stock.deposit_failed"]);
  });

  it("aucune ligne lisible : refus net, même quand le stock connu est petit (rien n'est remis à zéro)", async () => {
    db.prisma.pharmacyDrugStock.count.mockResolvedValue(5);
    mocks.analyse.mockResolvedValue(preview({ valid: 0, invalid: 8 }));
    const result = await send();
    if (!result.ok) throw new Error("attendu");
    expect(result.deposit).toMatchObject({ status: "FAILED", lines: 0, invalid: 8 });
    expect(result.deposit.message).toContain("Aucune ligne de stock lisible");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("le message du moteur, quand il parle du fichier, est celui que le titulaire lit", async () => {
    mocks.analyse.mockRejectedValue(new Error("Le fichier ne contient aucune ligne exploitable."));
    const result = await send();
    expect(result.ok && result.deposit).toMatchObject({ status: "FAILED", message: "Le fichier ne contient aucune ligne exploitable." });
  });

  it("une panne technique ne s'affiche jamais telle quelle", async () => {
    mocks.analyse.mockRejectedValue(new Error("Invalid `prisma.importJob.create()` invocation: connection refused"));
    const result = await send();
    if (!result.ok) throw new Error("attendu");
    expect(result.deposit.status).toBe("FAILED");
    expect(result.deposit.message).toContain("Le fichier n'a pas pu être lu");
    expect(result.deposit.message).not.toContain("prisma");
  });

  it("l'écriture du stock qui échoue : en échec, rien n'est annoncé comme appliqué, l'analyse est clôturée", async () => {
    mocks.commit.mockRejectedValue(new Error("Invalid `prisma.$transaction()` invocation: timeout"));
    const result = await send();
    if (!result.ok) throw new Error("attendu");
    expect(result.deposit).toMatchObject({ status: "FAILED", appliedAt: null });
    expect(result.deposit.message).toContain("rien n'a été modifié");
    expect(db.prisma.importJob.updateMany).toHaveBeenCalledWith({ where: { id: "job_1", status: "PENDING" }, data: expect.objectContaining({ status: "FAILED" }) });
    expect(mocks.recordAudit.mock.calls.map(([call]) => call.action)).toContain("stock.deposit_failed");
  });
});

describe("receiveStockDeposit : refus avant toute écriture", () => {
  const untouched = () => {
    expect(mocks.put).not.toHaveBeenCalled();
    expect(db.state.deposits).toHaveLength(0);
    expect(mocks.analyse).not.toHaveBeenCalled();
  };

  it("un format qui n'est pas un fichier de stock", async () => {
    const result = await send({ fileName: "photo.jpg" });
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain("Format non accepté");
    untouched();
  });

  it("un fichier vide", async () => {
    expect(await send({ bytes: new Uint8Array(0) })).toEqual({ ok: false, error: "Le fichier est vide." });
    untouched();
  });

  it("un fichier de plus de 8 Mo", async () => {
    expect(await send({ bytes: new Uint8Array(8 * 1024 * 1024 + 1) })).toEqual({ ok: false, error: "Le fichier dépasse 8 Mo." });
    untouched();
  });

  it("trop d'envois dans la journée : la limite est comptée par officine ET par origine", async () => {
    mocks.rateLimited.mockReturnValue(true);
    const result = await send();
    expect(result).toMatchObject({ ok: false });
    expect(mocks.rateLimited).toHaveBeenCalledWith("stock-deposit:ph_1:WEB", 30, 24 * 60 * 60 * 1000);
    untouched();
  });

  it("stockage indisponible : refus clair, rien n'est enregistré ni appliqué", async () => {
    mocks.put.mockRejectedValue(new Error("S3 injoignable"));
    const result = await send();
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain("stockage des fichiers est indisponible");
    expect(!result.ok && result.error).toContain("Rien n'a été modifié");
    expect(db.state.deposits).toHaveLength(0);
    expect(mocks.analyse).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("stockage mal configuré : même refus clair", async () => {
    mocks.getStorage.mockImplementation(() => {
      throw new Error("Stockage S3 incomplet");
    });
    const result = await send();
    expect(result).toMatchObject({ ok: false });
    expect(db.state.deposits).toHaveLength(0);
  });

  it("une ligne d'historique impossible à écrire : le fichier gardé est supprimé, l'erreur remonte", async () => {
    db.state.failCreate = true;
    await expect(send()).rejects.toThrow("base indisponible");
    expect(mocks.remove).toHaveBeenCalledWith(mocks.put.mock.calls[0][0]);
    expect(mocks.analyse).not.toHaveBeenCalled();
  });

  it("le nom de fichier est nettoyé : jamais de chemin dans l'historique ni dans la clé", async () => {
    const result = await send({ fileName: "C:\\Users\\Marie\\Bureau\\stock du jour.csv" });
    if (!result.ok) throw new Error("attendu");
    expect(result.deposit.fileName).toBe("stock du jour.csv");
    expect(mocks.put.mock.calls[0][0]).toBe(`stock-deposits/ph_1/${result.deposit.id}/stock_du_jour.csv`);
  });
});

describe("receiveStockDeposit : le double envoi", () => {
  it("le même fichier renvoyé tout de suite rend le dépôt existant sans rien refaire", async () => {
    const first = await send();
    if (!first.ok) throw new Error("attendu");
    vi.clearAllMocks();
    const second = await send();

    expect(second).toMatchObject({ ok: true, duplicate: true });
    expect(second.ok && second.deposit.id).toBe(first.deposit.id);
    expect(db.state.deposits).toHaveLength(1);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.analyse).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
  });

  it("au-delà de deux minutes, c'est un nouvel envoi", async () => {
    const first = await send();
    if (!first.ok) throw new Error("attendu");
    db.state.deposits[0].receivedAt = new Date(Date.now() - 3 * 60 * 1000);
    const second = await send();
    expect(second).toMatchObject({ ok: true, duplicate: false });
    expect(db.state.deposits).toHaveLength(2);
  });

  it("un fichier resté en échec peut être renvoyé aussitôt : la panne a pu passer", async () => {
    mocks.analyse.mockRejectedValueOnce(new Error("Le fichier est illisible."));
    const first = await send();
    expect(first.ok && first.deposit.status).toBe("FAILED");
    const second = await send();
    expect(second).toMatchObject({ ok: true, duplicate: false });
    expect(second.ok && second.deposit.status).toBe("APPLIED");
  });

  it("le même fichier chez une AUTRE officine n'est pas un doublon", async () => {
    db.state.deposits.push(deposit({ id: "dep_other", pharmacyId: "ph_2", fileSha256: "sha", receivedAt: new Date() }));
    // L'empreinte réelle du fichier diffère de « sha » : on la recopie pour rendre le test sans ambiguïté.
    const first = await send();
    const sha = db.state.deposits.find((row) => row.id === (first.ok && first.deposit.id))!.fileSha256;
    db.state.deposits.find((row) => row.id === "dep_other")!.fileSha256 = sha;
    const second = await send({ fileName: "stock.csv" });
    expect(second).toMatchObject({ ok: true, duplicate: true });
    expect(second.ok && second.deposit.pharmacyId).toBe("ph_1");
  });
});

describe("decideHeldDeposit : l'équipe tranche", () => {
  const held = () => deposit({ status: "HELD", lines: 120, created: null, updated: null, zeroed: null, knownLines: 4200, appliedAt: null, message: "trop petit" });

  beforeEach(() => {
    db.state.deposits = [held()];
    // Le stock a changé depuis : le fichier retenu est relu tel quel.
    mocks.analyse.mockResolvedValue(preview({ valid: 120 }));
    db.prisma.pharmacyDrugStock.count.mockResolvedValue(4000);
    db.prisma.product.count.mockResolvedValue(200);
  });

  it("« appliquer (stock complet) » : relit le fichier gardé, applique avec la remise à zéro, au nom du titulaire", async () => {
    const result = await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_FULL");
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.deposit).toMatchObject({ status: "APPLIED", message: null, zeroed: 2 });
    expect(mocks.read).toHaveBeenCalledWith("stock-deposits/ph_1/dep_1/stock.csv");
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({ scope: SCOPE, zeroAbsent: true, createUnknownByDefault: true }));
    expect(db.state.deposits[0]).toMatchObject({ decidedById: "adm_1", status: "APPLIED" });
    expect(db.state.deposits[0].decidedAt).toBeInstanceOf(Date);
    expect(mocks.recordAudit.mock.calls.map(([call]) => call.action)).toEqual(["stock.deposit_decided", "stock.deposit_applied"]);
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ platformAdminId: "adm_1", metadata: { decision: "APPLY_FULL", status: "APPLIED" } });
  });

  it("la décision de l'équipe l'emporte sur le garde-fou : un fichier 30 fois plus petit s'applique", async () => {
    await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_FULL");
    expect(db.state.deposits[0].status).toBe("APPLIED");
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it("« appliquer sans remettre à zéro » : seules les lignes du fichier sont écrites", async () => {
    const result = await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_PARTIAL");
    expect(result).toMatchObject({ ok: true });
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({ zeroAbsent: false }));
  });

  it("« écarter » : le fichier est écarté, rien n'est lu ni écrit, le titulaire en est prévenu", async () => {
    const result = await service.decideHeldDeposit("dep_1", "adm_1", "REJECT");
    expect(result).toMatchObject({ ok: true, deposit: { status: "REJECTED", decidedAt: expect.any(Date) } });
    expect(db.state.deposits[0]).toMatchObject({ status: "REJECTED", decidedById: "adm_1" });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.analyse).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ pharmacyId: "ph_1", linkUrl: "/stock/mise-a-jour" }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "stock.deposit_decided", platformAdminId: "adm_1", metadata: { decision: "REJECT" } }));
  });

  it("un fichier déjà traité ne se tranche pas une seconde fois", async () => {
    db.state.deposits = [deposit({ status: "APPLIED" })];
    expect(await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_FULL")).toEqual({ ok: false, error: "Ce fichier a déjà été traité." });
    expect(await service.decideHeldDeposit("dep_1", "adm_1", "REJECT")).toEqual({ ok: false, error: "Ce fichier a déjà été traité." });
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("deux administrateurs au même instant : le second perd, le fichier n'est appliqué qu'une fois", async () => {
    // La place est prise au moment de la lecture du fichier : l'autre l'a prise avant nous.
    db.prisma.pharmacy.findUnique.mockImplementationOnce(async () => {
      db.state.deposits[0].status = "RECEIVED";
      return owner;
    });
    expect(await service.decideHeldDeposit("dep_1", "adm_2", "APPLY_FULL")).toEqual({ ok: false, error: "Ce fichier a déjà été traité." });
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("un dépôt inconnu, une décision inconnue", async () => {
    expect(await service.decideHeldDeposit("nope", "adm_1", "APPLY_FULL")).toEqual({ ok: false, error: "Dépôt introuvable." });
    expect(await service.decideHeldDeposit("dep_1", "adm_1", "TOUT_EFFACER" as never)).toEqual({ ok: false, error: "Décision inconnue." });
    expect(db.state.deposits[0].status).toBe("HELD");
  });

  it("sans titulaire actif, rien n'est appliqué et le fichier reste à trancher", async () => {
    db.state.pharmacies = [{ ...owner, memberships: [] }];
    const result = await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_FULL");
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain("pas de titulaire actif");
    expect(db.state.deposits[0].status).toBe("HELD");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("un fichier purgé, introuvable ou un stockage en panne : erreur claire, le fichier reste à trancher", async () => {
    db.state.deposits = [{ ...held(), storageKey: null, fileDeletedAt: new Date() }];
    let result = await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_FULL");
    expect(!result.ok && result.error).toContain("n'est plus conservé");

    db.state.deposits = [held()];
    mocks.read.mockResolvedValueOnce(null);
    result = await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_FULL");
    expect(!result.ok && result.error).toContain("introuvable");

    mocks.read.mockRejectedValueOnce(new Error("panne"));
    result = await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_FULL");
    expect(!result.ok && result.error).toContain("indisponible");

    expect(db.state.deposits[0].status).toBe("HELD");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("une clé de stockage altérée n'ouvre jamais le fichier d'une autre officine", async () => {
    db.state.deposits = [{ ...held(), storageKey: "stock-deposits/ph_2/dep_9/stock.csv" }];
    const result = await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_FULL");
    expect(result).toMatchObject({ ok: false });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("l'écriture qui échoue après la décision : en échec (à relancer), le titulaire est prévenu", async () => {
    mocks.commit.mockRejectedValue(new Error("Invalid `prisma.$transaction()` invocation"));
    const result = await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_FULL");
    expect(result).toMatchObject({ ok: true, deposit: { status: "FAILED" } });
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "IMPORT_FAILED" }));
  });
});

describe("retryDeposit", () => {
  beforeEach(() => {
    db.state.deposits = [deposit({ status: "FAILED", message: "Colonnes non reconnues : Quantité.", lines: null, appliedAt: null })];
  });

  it("relit le fichier gardé et refait tout : stock complet, absents remis à zéro", async () => {
    const result = await service.retryDeposit("dep_1", "adm_1");
    expect(result).toMatchObject({ ok: true, deposit: { status: "APPLIED", message: null } });
    expect(mocks.read).toHaveBeenCalledWith("stock-deposits/ph_1/dep_1/stock.csv");
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({ scope: SCOPE, zeroAbsent: true }));
    expect(db.state.deposits[0]).toMatchObject({ decidedById: "adm_1" });
    expect(mocks.recordAudit.mock.calls.map(([call]) => call.action)).toContain("stock.deposit_retried");
  });

  it("le garde-fou s'applique encore : un fichier trop petit repasse en attente", async () => {
    db.prisma.pharmacyDrugStock.count.mockResolvedValue(4000);
    mocks.analyse.mockResolvedValue(preview({ valid: 5 }));
    const result = await service.retryDeposit("dep_1", "adm_1");
    expect(result).toMatchObject({ ok: true, deposit: { status: "HELD" } });
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("seul un fichier en échec (ou bloqué en cours) se relance : ni un fichier appliqué, ni en attente, ni écarté, ni tout juste reçu", async () => {
    for (const status of ["APPLIED", "HELD", "REJECTED", "RECEIVED"]) {
      db.state.deposits = [deposit({ status })];
      expect(await service.retryDeposit("dep_1", "adm_1")).toEqual({ ok: false, error: "Seul un fichier en échec, ou resté trop longtemps en cours de lecture, peut être relancé." });
    }
    expect(await service.retryDeposit("nope", "adm_1")).toEqual({ ok: false, error: "Dépôt introuvable." });
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("un fichier purgé ne se relance pas : on demande au titulaire de le renvoyer", async () => {
    db.state.deposits = [deposit({ status: "FAILED", storageKey: null, fileDeletedAt: new Date() })];
    const result = await service.retryDeposit("dep_1", "adm_1");
    expect(!result.ok && result.error).toContain("le renvoyer");
    expect(db.state.deposits[0].status).toBe("FAILED");
  });
});

describe("getDepositFile", () => {
  it("rend le fichier d'origine sous son nom, et trace le téléchargement au nom de l'administrateur (jamais le contenu)", async () => {
    db.state.deposits = [deposit()];
    expect(await service.getDepositFile("dep_1", "adm_1")).toEqual({ ok: true, bytes: BYTES, fileName: "stock.csv" });
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).toHaveBeenCalledWith({
      action: "stock.deposit_downloaded",
      entityType: "StockDeposit",
      entityId: "dep_1",
      pharmacyId: "ph_1",
      platformAdminId: "adm_1",
      metadata: { sizeBytes: BYTES.byteLength },
    });
    expect(JSON.stringify(mocks.recordAudit.mock.calls)).not.toContain("3400930000001");
  });

  it("dit ce qui manque : dépôt, fichier purgé, fichier perdu, stockage en panne — et ne trace rien quand rien n'est sorti", async () => {
    expect(await service.getDepositFile("nope", "adm_1")).toEqual({ ok: false, reason: "NOT_FOUND" });
    db.state.deposits = [deposit({ storageKey: null, fileDeletedAt: new Date() })];
    expect(await service.getDepositFile("dep_1", "adm_1")).toEqual({ ok: false, reason: "NO_FILE" });
    db.state.deposits = [deposit()];
    mocks.read.mockResolvedValueOnce(null);
    expect(await service.getDepositFile("dep_1", "adm_1")).toEqual({ ok: false, reason: "FILE_MISSING" });
    mocks.read.mockRejectedValueOnce(new Error("panne"));
    expect(await service.getDepositFile("dep_1", "adm_1")).toEqual({ ok: false, reason: "STORAGE_UNAVAILABLE" });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("une clé qui n'est pas celle de ce dépôt n'est jamais lue", async () => {
    for (const storageKey of ["stock-deposits/ph_2/dep_1/stock.csv", "stock-deposits/ph_1/dep_2/stock.csv", "stock-deposits/ph_1/dep_1/../../ph_2/dep_1/x.csv", "sales-applications/dep_1/cv.pdf"]) {
      db.state.deposits = [deposit({ storageKey })];
      expect(await service.getDepositFile("dep_1", "adm_1"), storageKey).toEqual({ ok: false, reason: "NO_FILE" });
    }
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe("purgeExpiredDepositFiles", () => {
  const NOW = new Date("2026-10-12T04:00:00Z");
  const at = (days: number) => new Date(NOW.getTime() - days * DAY);

  it("supprime les fichiers de plus de 90 jours, garde la ligne d'historique, ne touche pas aux récents", async () => {
    db.state.deposits = [
      deposit({ id: "old_1", storageKey: "stock-deposits/ph_1/old_1/a.csv", receivedAt: at(91) }),
      deposit({ id: "old_2", pharmacyId: "ph_2", storageKey: "stock-deposits/ph_2/old_2/b.csv", receivedAt: at(200) }),
      deposit({ id: "recent", storageKey: "stock-deposits/ph_1/recent/c.csv", receivedAt: at(89) }),
      deposit({ id: "already", storageKey: null, fileDeletedAt: at(10), receivedAt: at(120) }),
    ];
    const result = await service.purgeExpiredDepositFiles(NOW);

    expect(result).toEqual({ purged: 2 });
    expect(mocks.remove.mock.calls.map(([key]) => key).sort()).toEqual(["stock-deposits/ph_1/old_1/a.csv", "stock-deposits/ph_2/old_2/b.csv"]);
    const byId = (id: string) => db.state.deposits.find((row) => row.id === id)!;
    expect(byId("old_1")).toMatchObject({ storageKey: null, fileDeletedAt: NOW, status: "APPLIED" });
    expect(byId("old_2")).toMatchObject({ storageKey: null, fileDeletedAt: NOW });
    expect(byId("recent").storageKey).toBe("stock-deposits/ph_1/recent/c.csv");
    expect(db.state.deposits).toHaveLength(4);
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "stock.deposit_files_purged", entityType: "StockDeposit", metadata: { purged: 2 } });
  });

  it("un fichier qui résiste reste référencé pour le prochain passage", async () => {
    db.state.deposits = [
      deposit({ id: "old_1", storageKey: "stock-deposits/ph_1/old_1/a.csv", receivedAt: at(100) }),
      deposit({ id: "old_2", storageKey: "stock-deposits/ph_1/old_2/b.csv", receivedAt: at(101) }),
    ];
    mocks.remove.mockRejectedValueOnce(new Error("S3 en panne"));
    const result = await service.purgeExpiredDepositFiles(NOW);
    expect(result).toEqual({ purged: 1 });
    // Le plus ancien (old_2) a résisté.
    expect(db.state.deposits.find((row) => row.id === "old_2")!.storageKey).toBe("stock-deposits/ph_1/old_2/b.csv");
    expect(db.state.deposits.find((row) => row.id === "old_1")!.storageKey).toBeNull();
  });

  it("rien à purger : le stockage n'est même pas ouvert, rien n'est journalisé", async () => {
    db.state.deposits = [deposit({ receivedAt: at(5) })];
    expect(await service.purgeExpiredDepositFiles(NOW)).toEqual({ purged: 0 });
    expect(mocks.getStorage).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe("les listes et la vue de la console", () => {
  it("listPharmacyDeposits : les envois de CETTE officine, récents d'abord, 5 par défaut, sans nom d'officine", async () => {
    db.state.deposits = [
      ...Array.from({ length: 7 }, (_, index) => deposit({ id: `dep_${index}`, receivedAt: new Date(Date.UTC(2026, 9, 1 + index)) })),
      deposit({ id: "autre", pharmacyId: "ph_2", receivedAt: new Date(Date.UTC(2026, 9, 20)) }),
    ];
    const list = await service.listPharmacyDeposits("ph_1");
    expect(list.map((item) => item.id)).toEqual(["dep_6", "dep_5", "dep_4", "dep_3", "dep_2"]);
    expect(list.every((item) => item.pharmacyId === "ph_1" && !("pharmacyName" in item))).toBe(true);
    expect(await service.listPharmacyDeposits("ph_1", 2)).toHaveLength(2);
  });

  it("listDepositsForConsole : « à trancher » = en attente + en échec, avec le nom de l'officine", async () => {
    db.state.pharmacies = [owner, { id: "ph_2", name: "Pharmacie du Port", isActive: true, isDemo: false, memberships: [] }];
    db.state.deposits = [
      deposit({ id: "a", status: "APPLIED" }),
      deposit({ id: "b", status: "HELD", pharmacyId: "ph_2" }),
      deposit({ id: "c", status: "FAILED" }),
      deposit({ id: "d", status: "REJECTED" }),
    ];
    const attention = await service.listDepositsForConsole({ status: "ATTENTION" });
    expect(attention.map((item) => item.id).sort()).toEqual(["b", "c"]);
    expect(attention.find((item) => item.id === "b")?.pharmacyName).toBe("Pharmacie du Port");
    expect((await service.listDepositsForConsole({ status: "HELD" })).map((item) => item.id)).toEqual(["b"]);
    expect((await service.listDepositsForConsole({ pharmacyId: "ph_2" })).map((item) => item.id)).toEqual(["b"]);
    expect(await service.listDepositsForConsole()).toHaveLength(4);
    expect(await service.listDepositsForConsole({ limit: 2 })).toHaveLength(2);
  });

  it("countDepositsNeedingAttention : en attente + en échec", async () => {
    db.state.deposits = [deposit({ id: "a", status: "APPLIED" }), deposit({ id: "b", status: "HELD" }), deposit({ id: "c", status: "FAILED" }), deposit({ id: "d", status: "REJECTED" })];
    expect(await service.countDepositsNeedingAttention()).toBe(2);
  });

  it("consoleStockOverview : les officines réelles et actives, la plus ancienne d'abord, jamais envoyé en tête", async () => {
    const day = (n: number) => new Date(Date.UTC(2026, 9, n));
    const pharmacy = (id: string, name: string, stockSyncedAt: Date | null, extra: Record<string, unknown> = {}) => ({ id, name, isActive: true, isDemo: false, stockSyncedAt, stockConnection: null, ...extra });
    db.state.pharmacies = [
      pharmacy("ph_recent", "Récente", day(11), { stockConnection: { status: "CONNECTED", lgo: "lgpi" } }),
      pharmacy("ph_never", "Jamais", null),
      pharmacy("ph_old", "Ancienne", day(2)),
      pharmacy("ph_demo", "Démo", day(1), { isDemo: true }),
      pharmacy("ph_off", "Suspendue", day(1), { isActive: false }),
      pharmacy("ph_ab", "Aaa même jour", day(11)),
    ];
    db.state.deposits = [deposit({ id: "d1", pharmacyId: "ph_recent", source: "AGENT", lines: 4235, receivedAt: day(11) }), deposit({ id: "d0", pharmacyId: "ph_recent", source: "WEB", lines: 3000, receivedAt: day(5) })];

    const rows = await service.consoleStockOverview();
    expect(rows.map((row) => row.pharmacyId)).toEqual(["ph_never", "ph_old", "ph_ab", "ph_recent"]);
    expect(rows[0]).toEqual({ pharmacyId: "ph_never", name: "Jamais", stockSyncedAt: null, lastDepositAt: null, lastSource: null, lines: null, connected: false, lgoLabel: null });
    expect(rows[3]).toMatchObject({ lastDepositAt: day(11), lastSource: "AGENT", lines: 4235, connected: true, lgoLabel: "LGPI" });
    expect(db.prisma.pharmacy.findMany.mock.calls[0][0].where).toEqual({ isActive: true, isDemo: false });
  });

  it("ownerScopeForPharmacy : le titulaire actif, ou rien", async () => {
    expect(await service.ownerScopeForPharmacy("ph_1")).toEqual({ scope: SCOPE, pharmacyIsDemo: false, pharmacyName: "Pharmacie du Parc" });
    expect(await service.ownerScopeForPharmacy("inconnue")).toBeNull();
    db.state.pharmacies = [{ ...owner, memberships: [] }];
    expect(await service.ownerScopeForPharmacy("ph_1")).toBeNull();
    // Seul un titulaire actif compte, et c'est la requête qui le dit.
    expect((db.prisma.pharmacy.findUnique.mock.calls[0][0] as unknown as { select: { memberships: { where: unknown } } }).select.memberships.where).toEqual({ role: "OWNER", isActive: true });
  });
});

describe("continueAfterStockDeposit", () => {
  it("comprend les produits nouveaux et cherche leurs photos, au nom du titulaire ; une panne ne remonte pas", async () => {
    mocks.classify.mockRejectedValueOnce(new Error("modèle indisponible"));
    await expect(service.continueAfterStockDeposit(SCOPE)).resolves.toBeUndefined();
    expect(mocks.classify).toHaveBeenCalledWith({ scope: SCOPE, maxAiBatches: 60 });
    expect(mocks.images).toHaveBeenCalledWith({ pharmacyId: "ph_1", limit: 200 });
  });
});

// ================================================================ La vague de corrections

const MINUTE = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);
/** Un dépôt dont la clé de stockage est bien celle de son identifiant. */
const stored = (id: string, extra: Record<string, unknown> = {}) => deposit({ id, storageKey: `stock-deposits/ph_1/${id}/stock.csv`, ...extra });

describe("un fichier lu en partie n'est jamais appliqué comme un stock complet", () => {
  beforeEach(() => {
    // 3 700 lignes connues : le fichier les couvre toutes, mais il manque des pages.
    db.prisma.pharmacyDrugStock.count.mockResolvedValue(3700);
    db.prisma.product.count.mockResolvedValue(0);
  });

  it("des pages du PDF sautées : en attente, rien n'est écrit, même quand le fichier couvre tout le stock connu", async () => {
    mocks.analyse.mockResolvedValue(preview({ valid: 3700, incomplete: true, incompleteReason: "3 pages du fichier n'ont pas pu être lues" }));
    const result = await send({ fileName: "inventaire.pdf" });
    if (!result.ok) throw new Error("attendu");

    expect(result.deposit).toMatchObject({ status: "HELD", lines: 3700, knownLines: 3700, appliedAt: null });
    expect(result.deposit.message).toContain("3 pages du fichier n'ont pas pu être lues : le stock n'a pas été appliqué.");
    expect(mocks.commit).not.toHaveBeenCalled();
    // L'analyse n'est pas laissée en attente ; le fichier, lui, est gardé : l'équipe peut le tranche ou le télécharger.
    expect(db.prisma.importJob.updateMany).toHaveBeenCalledWith({ where: { id: "job_1", status: "PENDING" }, data: expect.objectContaining({ status: "FAILED", payload: {} }) });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(db.state.deposits[0].storageKey).not.toBeNull();
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ severity: "WARNING" }));
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ severity: "WARNING", body: expect.stringContaining("votre stock n'a pas changé") }));
  });

  it("le plafond de pages ou de lignes atteint : même sort", async () => {
    mocks.analyse.mockResolvedValue(preview({ valid: 3700, incomplete: true, incompleteReason: "60 000 lignes dans le fichier, seules les 50 000 premières ont été lues" }));
    const result = await send();
    expect(result.ok && result.deposit).toMatchObject({ status: "HELD" });
    expect(result.ok && result.deposit.message).toContain("seules les 50 000 premières ont été lues : le stock n'a pas été appliqué.");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("sans raison précisée, un message par défaut : le fichier attend quand même", async () => {
    mocks.analyse.mockResolvedValue(preview({ valid: 3700, incomplete: true }));
    const result = await send();
    expect(result.ok && result.deposit).toMatchObject({ status: "HELD", message: expect.stringContaining("Une partie du fichier n'a pas pu être lue : le stock n'a pas été appliqué.") });
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("un fichier lu en entier est appliqué comme avant", async () => {
    mocks.analyse.mockResolvedValue(preview({ valid: 3700, incomplete: false }));
    expect(await send()).toMatchObject({ ok: true, deposit: { status: "APPLIED" } });
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it("si l'équipe tranche « stock complet » malgré tout, c'est sa décision : le fichier s'applique", async () => {
    db.state.deposits = [stored("dep_1", { status: "HELD", appliedAt: null, message: "3 pages du fichier n'ont pas pu être lues : le stock n'a pas été appliqué." })];
    mocks.analyse.mockResolvedValue(preview({ valid: 3700, incomplete: true, incompleteReason: "3 pages du fichier n'ont pas pu être lues" }));
    const result = await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_FULL");
    expect(result).toMatchObject({ ok: true, deposit: { status: "APPLIED" } });
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({ zeroAbsent: true }));
  });

  it("des lignes illisibles au-delà du seuil (plus de 5 et plus de 2 %) : en attente, parce que leurs produits seraient remis à 0", async () => {
    mocks.analyse.mockResolvedValue(preview({ valid: 3700, invalid: 80 }));
    const result = await send();
    if (!result.ok) throw new Error("attendu");
    expect(result.deposit).toMatchObject({ status: "HELD", lines: 3700, invalid: 80 });
    expect(result.deposit.message).toContain("80 lignes du fichier sont illisibles : le stock n'a pas été appliqué.");
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(db.prisma.importJob.updateMany).toHaveBeenCalledWith({ where: { id: "job_1", status: "PENDING" }, data: expect.objectContaining({ status: "FAILED" }) });
  });

  it("jusqu'à 5 lignes illisibles, ou 2 % du fichier : appliqué, les lignes illisibles sont comptées", async () => {
    mocks.commit.mockResolvedValue({ ...OUTCOME, invalid: 5 });
    mocks.analyse.mockResolvedValue(preview({ valid: 3700, invalid: 5 }));
    expect(await send()).toMatchObject({ ok: true });
    expect(db.state.deposits[0]).toMatchObject({ status: "APPLIED", invalid: 5 });
    expect(mocks.commit).toHaveBeenCalledTimes(1);

    db.state.deposits = [];
    mocks.analyse.mockResolvedValue(preview({ valid: 3700, invalid: 70 }));
    await send({ fileName: "autre.csv", bytes: new TextEncoder().encode("autre") });
    expect(db.state.deposits[0].status).toBe("APPLIED");
  });

  it("l'équipe qui tranche malgré les lignes illisibles : appliqué", async () => {
    db.state.deposits = [stored("dep_1", { status: "HELD", appliedAt: null })];
    mocks.analyse.mockResolvedValue(preview({ valid: 3700, invalid: 80 }));
    expect(await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_PARTIAL")).toMatchObject({ ok: true, deposit: { status: "APPLIED" } });
  });
});

describe("le garde-fou de taille à 80 %", () => {
  beforeEach(() => {
    db.prisma.pharmacyDrugStock.count.mockResolvedValue(1000);
    db.prisma.product.count.mockResolvedValue(0);
  });

  it("un fichier à 60 % du stock connu (un seul rayon) attend l'équipe au lieu de vider les 40 % restants", async () => {
    mocks.analyse.mockResolvedValue(preview({ valid: 600 }));
    const result = await send();
    expect(result.ok && result.deposit).toMatchObject({ status: "HELD", lines: 600, knownLines: 1000 });
    expect(result.ok && result.deposit.message).toContain("moins de 80 %");
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("799 sur 1 000 attend, 800 sur 1 000 s'applique", async () => {
    mocks.analyse.mockResolvedValue(preview({ valid: 799 }));
    expect((await send()).ok && db.state.deposits[0].status).toBe("HELD");
    db.state.deposits = [];
    mocks.analyse.mockResolvedValue(preview({ valid: 800 }));
    await send({ fileName: "autre.csv", bytes: new TextEncoder().encode("autre") });
    expect(db.state.deposits[0].status).toBe("APPLIED");
  });
});

describe("un envoi plus récent ferme les plus anciens", () => {
  it("après un envoi appliqué, les fichiers plus anciens de la MÊME officine, en attente, en échec ou bloqués, sont écartés", async () => {
    db.state.deposits = [
      stored("held_old", { status: "HELD", receivedAt: ago(2 * DAY) }),
      stored("failed_old", { status: "FAILED", receivedAt: ago(DAY) }),
      stored("stalled_old", { status: "RECEIVED", receivedAt: ago(3 * 60 * MINUTE) }),
      stored("applied_old", { status: "APPLIED", receivedAt: ago(5 * DAY) }),
      stored("rejected_old", { status: "REJECTED", message: "Écarté par l'équipe", receivedAt: ago(4 * DAY) }),
      stored("held_other", { status: "HELD", pharmacyId: "ph_2", receivedAt: ago(2 * DAY) }),
      stored("held_newer", { status: "HELD", receivedAt: new Date(Date.now() + MINUTE) }),
      // Reçu il y a 7 minutes : pas bloqué (moins de 10), et plus assez récent pour refuser l'envoi (plus de 5).
      stored("reading_old", { status: "RECEIVED", receivedAt: ago(7 * MINUTE) }),
    ];
    const result = await send();
    if (!result.ok) throw new Error("attendu");
    expect(result.deposit.status).toBe("APPLIED");

    const statusOf = (id: string) => db.state.deposits.find((row) => row.id === id)!;
    for (const id of ["held_old", "failed_old", "stalled_old"]) expect(statusOf(id), id).toMatchObject({ status: "REJECTED", message: "Remplacé par un envoi plus récent." });
    expect(statusOf("applied_old").status).toBe("APPLIED");
    expect(statusOf("rejected_old").message).toBe("Écarté par l'équipe");
    expect(statusOf("held_other").status).toBe("HELD");
    expect(statusOf("held_newer").status).toBe("HELD");
    expect(statusOf("reading_old").status).toBe("RECEIVED");
  });

  it("un envoi qui n'est pas appliqué (en attente, en échec) ne ferme rien", async () => {
    db.state.deposits = [stored("held_old", { status: "HELD", receivedAt: ago(2 * DAY) })];
    mocks.analyse.mockResolvedValue(preview({ missing: ["quantity"] }));
    await send();
    expect(db.state.deposits.find((row) => row.id === "held_old")!.status).toBe("HELD");
  });

  it("l'équipe qui applique un envoi ferme aussi les plus anciens (décision et relance passent par le même moteur)", async () => {
    db.state.deposits = [stored("held_old", { status: "HELD", receivedAt: ago(2 * DAY) }), stored("dep_1", { status: "HELD", appliedAt: null, receivedAt: ago(DAY) })];
    await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_FULL");
    expect(db.state.deposits.find((row) => row.id === "held_old")).toMatchObject({ status: "REJECTED", message: "Remplacé par un envoi plus récent." });
    expect(db.state.deposits.find((row) => row.id === "dep_1")!.status).toBe("APPLIED");
  });

  it("une fermeture qui échoue ne fait pas échouer le dépôt appliqué", async () => {
    db.prisma.stockDeposit.updateMany.mockRejectedValueOnce(new Error("base occupée"));
    const result = await send();
    expect(result.ok && result.deposit.status).toBe("APPLIED");
  });

  it("un fichier ancien en attente ne s'applique plus par-dessus un stock déjà à jour (« appliquer » refusé), mais s'écarte toujours", async () => {
    db.state.deposits = [
      stored("old", { status: "HELD", appliedAt: null, receivedAt: ago(2 * DAY) }),
      stored("newer", { status: "APPLIED", receivedAt: ago(DAY) }),
    ];
    const refused = { ok: false, error: "Un envoi plus récent a déjà mis le stock à jour : écartez ce fichier." };
    expect(await service.decideHeldDeposit("old", "adm_1", "APPLY_FULL")).toEqual(refused);
    expect(await service.decideHeldDeposit("old", "adm_1", "APPLY_PARTIAL")).toEqual(refused);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(db.state.deposits.find((row) => row.id === "old")!.status).toBe("HELD");

    expect(await service.decideHeldDeposit("old", "adm_1", "REJECT")).toMatchObject({ ok: true, deposit: { status: "REJECTED" } });
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("un fichier en échec ou bloqué ne se relance pas non plus après un envoi plus récent appliqué", async () => {
    db.state.deposits = [
      stored("failed", { status: "FAILED", appliedAt: null, receivedAt: ago(2 * DAY) }),
      stored("stalled", { status: "RECEIVED", appliedAt: null, receivedAt: ago(3 * 60 * MINUTE) }),
      stored("newer", { status: "APPLIED", receivedAt: ago(DAY) }),
    ];
    // L'envoi bloqué date de moins que l'envoi appliqué : il est plus ancien, donc périmé.
    db.state.deposits[1].receivedAt = ago(2 * DAY);
    const refused = { ok: false, error: "Un envoi plus récent a déjà mis le stock à jour : écartez ce fichier." };
    expect(await service.retryDeposit("failed", "adm_1")).toEqual(refused);
    expect(await service.retryDeposit("stalled", "adm_1")).toEqual(refused);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("un envoi appliqué PLUS ANCIEN, ou d'une autre officine, n'empêche rien", async () => {
    db.state.deposits = [
      stored("failed", { status: "FAILED", appliedAt: null, receivedAt: ago(DAY) }),
      stored("older_applied", { status: "APPLIED", receivedAt: ago(5 * DAY) }),
      stored("other_pharmacy", { status: "APPLIED", pharmacyId: "ph_2", receivedAt: new Date() }),
    ];
    expect(await service.retryDeposit("failed", "adm_1")).toMatchObject({ ok: true, deposit: { status: "APPLIED" } });
  });
});

describe("un dépôt « en cours » trop longtemps est bloqué, pas oublié", () => {
  const reading = (id: string, ageMinutes: number, extra: Record<string, unknown> = {}) =>
    stored(id, { status: "RECEIVED", lines: null, created: null, updated: null, zeroed: null, knownLines: null, appliedAt: null, receivedAt: ago(ageMinutes * MINUTE), ...extra });

  it("la vue dit « bloqué » au bout de 10 minutes, pas avant", async () => {
    db.state.deposits = [reading("fresh", 9), reading("stuck", 11), stored("done", { receivedAt: ago(60 * MINUTE) })];
    const list = await service.listPharmacyDeposits("ph_1");
    const by = (id: string) => list.find((item) => item.id === id)!;
    expect(by("fresh").stalled).toBe(false);
    expect(by("stuck").stalled).toBe(true);
    // Seul un dépôt « en cours » peut être bloqué.
    expect(by("done").stalled).toBe(false);
  });

  it("l'équipe peut relancer un dépôt bloqué : le fichier gardé est relu et tout est refait", async () => {
    db.state.deposits = [reading("stuck", 30)];
    const result = await service.retryDeposit("stuck", "adm_1");
    expect(result).toMatchObject({ ok: true, deposit: { status: "APPLIED", stalled: false } });
    expect(mocks.read).toHaveBeenCalledWith("stock-deposits/ph_1/stuck/stock.csv");
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({ zeroAbsent: true }));
    expect(db.state.deposits[0]).toMatchObject({ decidedById: "adm_1" });
    expect(mocks.recordAudit.mock.calls.map(([call]) => call.action)).toContain("stock.deposit_retried");
  });

  it("un dépôt tout juste reçu (moins de 10 minutes) ne se relance pas : il est peut-être en train d'être lu", async () => {
    db.state.deposits = [reading("fresh", 4)];
    const result = await service.retryDeposit("fresh", "adm_1");
    expect(result).toMatchObject({ ok: false });
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("deux administrateurs qui relancent le même dépôt bloqué : un seul le rejoue", async () => {
    db.state.deposits = [reading("stuck", 30)];
    const [first, second] = await Promise.all([service.retryDeposit("stuck", "adm_1"), service.retryDeposit("stuck", "adm_2")]);
    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(outcomes.find((outcome) => !outcome.ok)).toEqual({ ok: false, error: "Ce fichier a déjà été traité." });
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it("un dépôt bloqué compte parmi ceux qu'il faut regarder, et le filtre « à trancher » le liste", async () => {
    db.state.pharmacies = [owner];
    db.state.deposits = [
      stored("a", { status: "APPLIED" }),
      stored("b", { status: "HELD" }),
      stored("c", { status: "FAILED" }),
      reading("stuck", 11),
      reading("fresh", 3),
      stored("d", { status: "REJECTED" }),
    ];
    expect(await service.countDepositsNeedingAttention()).toBe(3);
    const attention = await service.listDepositsForConsole({ status: "ATTENTION" });
    expect(attention.map((item) => item.id).sort()).toEqual(["b", "c", "stuck"]);
    expect(attention.find((item) => item.id === "stuck")?.stalled).toBe(true);
    // Les autres filtres ne changent pas : « en cours » liste aussi celui qui vient d'arriver.
    expect((await service.listDepositsForConsole({ status: "RECEIVED" })).map((item) => item.id).sort()).toEqual(["fresh", "stuck"]);
    // Filtrer par officine garde la même règle.
    expect((await service.listDepositsForConsole({ status: "ATTENTION", pharmacyId: "ph_2" })).map((item) => item.id)).toEqual([]);
  });
});

describe("closeStalledDeposits : le passage quotidien referme ce qui n'a pas abouti", () => {
  const NOW = new Date();
  const reading = (id: string, ageMinutes: number, extra: Record<string, unknown> = {}) => stored(id, { status: "RECEIVED", appliedAt: null, receivedAt: new Date(NOW.getTime() - ageMinutes * MINUTE), ...extra });

  it("un dépôt « en cours » depuis plus de 15 minutes passe en échec, le fichier est gardé et la console peut le relancer", async () => {
    db.prisma.importJob.updateMany.mockResolvedValue({ count: 2 });
    db.state.deposits = [reading("stuck", 16), reading("recent", 14), stored("applied", { receivedAt: new Date(NOW.getTime() - 600 * MINUTE) }), stored("held", { status: "HELD", receivedAt: new Date(NOW.getTime() - 600 * MINUTE) })];
    const report = await service.closeStalledDeposits(NOW);

    expect(report).toEqual({ failed: 1, superseded: 0, jobsClosed: 2 });
    expect(db.state.deposits.find((row) => row.id === "stuck")).toMatchObject({ status: "FAILED", message: "Le traitement a été interrompu avant la fin. Le stock n'a pas changé : renvoyez le fichier.", storageKey: "stock-deposits/ph_1/stuck/stock.csv" });
    expect(db.state.deposits.find((row) => row.id === "recent")!.status).toBe("RECEIVED");
    expect(db.state.deposits.find((row) => row.id === "applied")!.status).toBe("APPLIED");
    expect(db.state.deposits.find((row) => row.id === "held")!.status).toBe("HELD");
    // Le fichier est gardé : « Relancer » fonctionne ensuite.
    expect(await service.retryDeposit("stuck", "adm_1")).toMatchObject({ ok: true, deposit: { status: "APPLIED" } });
  });

  it("les analyses de stock restées « en attente » depuis plus de 15 minutes sont fermées, leur contenu vidé", async () => {
    await service.closeStalledDeposits(NOW);
    expect(db.prisma.importJob.updateMany).toHaveBeenCalledTimes(1);
    expect(db.prisma.importJob.updateMany).toHaveBeenCalledWith({
      where: { kind: "STOCK", status: "PENDING", createdAt: { lt: new Date(NOW.getTime() - 15 * MINUTE) } },
      data: { status: "FAILED", finishedAt: NOW, payload: {} },
    });
  });

  it("un dépôt bloqué qu'un envoi plus récent a déjà remplacé est écarté, pas laissé en échec dans « à trancher »", async () => {
    db.state.deposits = [reading("stuck", 600), stored("newer", { status: "APPLIED", receivedAt: new Date(NOW.getTime() - 60 * MINUTE) })];
    const report = await service.closeStalledDeposits(NOW);
    expect(report).toMatchObject({ failed: 0, superseded: 1 });
    expect(db.state.deposits.find((row) => row.id === "stuck")).toMatchObject({ status: "REJECTED", message: "Remplacé par un envoi plus récent." });
  });

  it("un dépôt que l'équipe vient de reprendre (relance en cours) n'est pas refermé sous ses pieds", async () => {
    db.state.deposits = [reading("retrying", 600, { decidedAt: new Date(NOW.getTime() - 2 * MINUTE), decidedById: "adm_1" }), reading("abandoned_retry", 600, { decidedAt: new Date(NOW.getTime() - 90 * MINUTE), decidedById: "adm_1" })];
    const report = await service.closeStalledDeposits(NOW);
    expect(report.failed).toBe(1);
    expect(db.state.deposits.find((row) => row.id === "retrying")!.status).toBe("RECEIVED");
    expect(db.state.deposits.find((row) => row.id === "abandoned_retry")!.status).toBe("FAILED");
  });

  it("rien à fermer : rien n'est écrit sur les dépôts", async () => {
    db.prisma.importJob.updateMany.mockResolvedValue({ count: 0 });
    db.state.deposits = [stored("applied")];
    expect(await service.closeStalledDeposits(NOW)).toEqual({ failed: 0, superseded: 0, jobsClosed: 0 });
    expect(db.prisma.stockDeposit.updateMany).not.toHaveBeenCalled();
  });
});

describe("un fichier qui n'est pas un stock ne reste pas", () => {
  const KEY = (id: string) => `stock-deposits/ph_1/${id}/stock.csv`;

  it("colonnes non reconnues : le fichier est supprimé du stockage tout de suite, la ligne d'historique dit qu'il n'est plus là", async () => {
    mocks.analyse.mockResolvedValue(preview({ missing: ["quantity"] }));
    const result = await send({ fileName: "patients_2026.csv" });
    if (!result.ok) throw new Error("attendu");
    expect(result.deposit).toMatchObject({ status: "FAILED", hasFile: false });
    const key = mocks.put.mock.calls[0][0] as string;
    expect(mocks.remove).toHaveBeenCalledWith(key);
    expect(db.state.deposits[0]).toMatchObject({ storageKey: null, status: "FAILED" });
    expect(db.state.deposits[0].fileDeletedAt).toBeInstanceOf(Date);
  });

  it("aucune ligne lisible : supprimé aussi", async () => {
    mocks.analyse.mockResolvedValue(preview({ valid: 0, invalid: 8 }));
    const result = await send();
    expect(result.ok && result.deposit).toMatchObject({ status: "FAILED", hasFile: false });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });

  it("un PDF qui n'est pas un inventaire (erreur de lecture du fichier lui-même) : supprimé aussi", async () => {
    mocks.analyse.mockRejectedValue(new UnreadableFileError("Ce PDF n'est pas une édition d'inventaire LGPI reconnue."));
    const result = await send({ fileName: "ordonnancier.pdf" });
    expect(result.ok && result.deposit).toMatchObject({ status: "FAILED", hasFile: false, message: "Ce PDF n'est pas une édition d'inventaire LGPI reconnue." });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(db.state.deposits[0].storageKey).toBeNull();
  });

  it("une panne passagère garde le fichier : « Relancer » la répare", async () => {
    mocks.analyse.mockRejectedValue(new Error("Invalid `prisma.importJob.create()` invocation: connection refused"));
    const failedRead = await send();
    expect(failedRead.ok && failedRead.deposit).toMatchObject({ status: "FAILED", hasFile: true });

    db.state.deposits = [];
    mocks.analyse.mockResolvedValue(preview());
    mocks.commit.mockRejectedValue(new Error("Invalid `prisma.$transaction()` invocation: timeout"));
    const failedWrite = await send({ fileName: "autre.csv", bytes: new TextEncoder().encode("autre") });
    expect(failedWrite.ok && failedWrite.deposit).toMatchObject({ status: "FAILED", hasFile: true });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("un fichier lisible mais retenu (en attente) est gardé : l'équipe doit pouvoir le trancher", async () => {
    db.prisma.pharmacyDrugStock.count.mockResolvedValue(4000);
    mocks.analyse.mockResolvedValue(preview({ valid: 5 }));
    const result = await send();
    expect(result.ok && result.deposit).toMatchObject({ status: "HELD", hasFile: true });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("une suppression qui échoue n'empêche pas le dépôt d'être en échec ; le fichier reste référencé pour la purge", async () => {
    mocks.remove.mockRejectedValue(new Error("S3 injoignable"));
    mocks.analyse.mockResolvedValue(preview({ missing: ["quantity"] }));
    const result = await send();
    expect(result.ok && result.deposit).toMatchObject({ status: "FAILED", hasFile: true });
    expect(db.state.deposits[0].storageKey).not.toBeNull();
    expect(db.state.deposits[0].fileDeletedAt).toBeNull();
  });

  it("rejoué par l'équipe : un fichier qui n'est toujours pas un stock est supprimé à son tour", async () => {
    db.state.deposits = [stored("dep_1", { status: "FAILED", appliedAt: null })];
    mocks.analyse.mockResolvedValue(preview({ missing: ["quantity"] }));
    const result = await service.retryDeposit("dep_1", "adm_1");
    expect(result).toMatchObject({ ok: true, deposit: { status: "FAILED", hasFile: false } });
    expect(mocks.remove).toHaveBeenCalledWith(KEY("dep_1"));
  });
});

describe("le plafond de taille dépend de l'origine", () => {
  const nineMb = () => new Uint8Array(9 * 1024 * 1024).fill(97);

  it("le titulaire (web) et l'équipe (console) : 9 Mo refusés, avant toute écriture", async () => {
    for (const source of ["WEB", "CONSOLE"] as const) {
      expect(await send({ bytes: nineMb(), source, ...(source === "CONSOLE" ? { adminId: "adm_1" } : {}) }), source).toEqual({ ok: false, error: "Le fichier dépasse 8 Mo." });
    }
    expect(mocks.put).not.toHaveBeenCalled();
    expect(db.state.deposits).toHaveLength(0);
  });

  it("le dossier PharmaBoost du serveur (agent) : 9 Mo acceptés, jusqu'à 25 Mo", async () => {
    const result = await send({ bytes: nineMb(), source: "AGENT" });
    expect(result).toMatchObject({ ok: true, duplicate: false });
    expect(db.state.deposits[0]).toMatchObject({ source: "AGENT", fileSize: 9 * 1024 * 1024, status: "APPLIED" });
    expect(await send({ bytes: new Uint8Array(25 * 1024 * 1024).fill(98), source: "AGENT" })).toMatchObject({ ok: true });
  });

  it("au-delà de 25 Mo, même l'agent est refusé, avec le bon plafond dans le message", async () => {
    expect(await send({ bytes: new Uint8Array(25 * 1024 * 1024 + 1), source: "AGENT" })).toEqual({ ok: false, error: "Le fichier dépasse 25 Mo." });
    expect(mocks.put).not.toHaveBeenCalled();
  });
});

describe("l'agent qui renvoie le même fichier en échec", () => {
  it("le même export resté en échec n'ajoute ni ligne, ni fichier gardé, ni notification : le dépôt existant est rendu", async () => {
    mocks.analyse.mockResolvedValue(preview({ missing: ["quantity"] }));
    const first = await send({ source: "AGENT" });
    if (!first.ok) throw new Error("attendu");
    expect(first.deposit.status).toBe("FAILED");
    vi.clearAllMocks();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const again = await send({ source: "AGENT" });
      expect(again).toMatchObject({ ok: true, duplicate: true });
      expect(again.ok && again.deposit).toMatchObject({ id: first.deposit.id, status: "FAILED", message: first.deposit.message });
    }
    expect(db.state.deposits).toHaveLength(1);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.analyse).not.toHaveBeenCalled();
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("au bout de 24 heures, le même export est relu : la panne a pu passer", async () => {
    db.state.deposits = [stored("old_failure", { status: "FAILED", fileSha256: SHA, receivedAt: ago(25 * 60 * MINUTE) })];
    expect(await send({ source: "AGENT" })).toMatchObject({ ok: true, duplicate: false, deposit: { status: "APPLIED" } });
    expect(db.state.deposits).toHaveLength(2);
  });

  it("23 heures plus tard, c'est encore le même échec", async () => {
    db.state.deposits = [stored("old_failure", { status: "FAILED", fileSha256: SHA, receivedAt: ago(23 * 60 * MINUTE) })];
    expect(await send({ source: "AGENT" })).toMatchObject({ ok: true, duplicate: true, deposit: { id: "old_failure", status: "FAILED" } });
    expect(db.state.deposits).toHaveLength(1);
  });

  it("le titulaire (web) et l'équipe (console) peuvent renvoyer le même fichier en échec aussitôt", async () => {
    mocks.analyse.mockRejectedValueOnce(new Error("Le fichier est illisible."));
    expect((await send({ source: "WEB" })).ok).toBe(true);
    expect(await send({ source: "WEB" })).toMatchObject({ ok: true, duplicate: false });
  });

  it("un échec d'une AUTRE officine n'est pas un doublon", async () => {
    db.state.deposits = [stored("elsewhere", { status: "FAILED", pharmacyId: "ph_2", fileSha256: SHA, receivedAt: new Date() })];
    expect(await send({ source: "AGENT" })).toMatchObject({ ok: true, duplicate: false });
  });
});

describe("la limite d'envois vient après le doublon, et se compte par origine", () => {
  it("un doublon est rendu même quand la limite du jour est atteinte : il ne consomme rien et ne bloque rien", async () => {
    const first = await send();
    if (!first.ok) throw new Error("attendu");
    mocks.rateLimited.mockClear();
    mocks.rateLimited.mockReturnValue(true);
    expect(await send()).toMatchObject({ ok: true, duplicate: true });
    expect(mocks.rateLimited).not.toHaveBeenCalled();
  });

  it("la clé est « officine + origine » : un agent qui boucle ne bloque ni le titulaire ni l'équipe", async () => {
    await send({ source: "AGENT" });
    await send({ source: "WEB", fileName: "web.csv", bytes: new TextEncoder().encode("web") });
    await send({ source: "CONSOLE", adminId: "adm_1", fileName: "console.csv", bytes: new TextEncoder().encode("console") });
    expect(mocks.rateLimited.mock.calls.map(([key]) => key)).toEqual(["stock-deposit:ph_1:AGENT", "stock-deposit:ph_1:WEB", "stock-deposit:ph_1:CONSOLE"]);

    // La limite de l'agent atteinte : seule sa clé est refusée.
    mocks.rateLimited.mockImplementation((key: string) => key.endsWith(":AGENT"));
    expect(await send({ source: "AGENT", fileName: "agent2.csv", bytes: new TextEncoder().encode("agent2") })).toMatchObject({ ok: false });
    expect(await send({ source: "WEB", fileName: "web2.csv", bytes: new TextEncoder().encode("web2") })).toMatchObject({ ok: true });
  });
});

describe("deux envois simultanés d'une même officine", () => {
  const reading = (extra: Record<string, unknown> = {}) => stored("busy", { status: "RECEIVED", appliedAt: null, lines: null, receivedAt: ago(MINUTE), ...extra });

  it("un autre fichier est en cours de lecture depuis moins de 5 minutes : refus clair, rien n'est écrit", async () => {
    db.state.deposits = [reading({ fileSha256: "un-autre-fichier" })];
    expect(await send()).toEqual({ ok: false, error: "Un envoi est déjà en cours de lecture. Réessayez dans une minute." });
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.analyse).not.toHaveBeenCalled();
    expect(mocks.rateLimited).not.toHaveBeenCalled();
    expect(db.state.deposits).toHaveLength(1);
  });

  it("le MÊME fichier déjà en cours de lecture (même après les 2 minutes du double clic) : le dépôt existant est rendu", async () => {
    const first = await send();
    if (!first.ok) throw new Error("attendu");
    // Le premier envoi est encore en lecture, depuis 4 minutes.
    Object.assign(db.state.deposits[0], { status: "RECEIVED", appliedAt: null, lines: null, receivedAt: ago(4 * MINUTE) });
    mocks.put.mockClear();
    const again = await send();
    expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(again.ok && again.deposit.id).toBe(first.deposit.id);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(db.state.deposits).toHaveLength(1);
  });

  it("un dépôt en cours depuis plus de 5 minutes ne bloque plus : il est peut-être mort, le nouveau fichier passe", async () => {
    db.state.deposits = [reading({ fileSha256: "un-autre-fichier", receivedAt: ago(6 * MINUTE) })];
    expect(await send()).toMatchObject({ ok: true, duplicate: false });
  });

  it("l'envoi en cours d'une AUTRE officine ne bloque pas celle-ci", async () => {
    db.state.deposits = [reading({ pharmacyId: "ph_2", fileSha256: "un-autre-fichier" })];
    expect(await send()).toMatchObject({ ok: true, duplicate: false });
  });

  it("un fichier appliqué ou en attente n'est pas « en cours » : il ne bloque pas le suivant", async () => {
    db.state.deposits = [stored("done", { status: "APPLIED", fileSha256: "un-autre-fichier", receivedAt: ago(MINUTE) }), stored("held", { status: "HELD", fileSha256: "encore-un-autre", receivedAt: ago(MINUTE) })];
    expect(await send()).toMatchObject({ ok: true, duplicate: false });
  });
});

describe("la liaison du serveur après une décision de l'équipe", () => {
  it("un fichier appliqué par l'équipe met à jour la liaison : dernière synchronisation, erreur effacée, ERROR → CONNECTED", async () => {
    db.state.deposits = [stored("dep_1", { source: "AGENT", status: "HELD", appliedAt: null })];
    mocks.analyse.mockResolvedValue(preview({ valid: 120 }));
    const result = await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_FULL");
    expect(result).toMatchObject({ ok: true, deposit: { status: "APPLIED" } });

    expect(db.prisma.stockConnection.updateMany).toHaveBeenCalledTimes(2);
    expect(db.prisma.stockConnection.updateMany).toHaveBeenNthCalledWith(1, { where: { pharmacyId: "ph_1" }, data: { lastSyncAt: expect.any(Date), lastSyncLines: 120, lastError: null } });
    expect(db.prisma.stockConnection.updateMany).toHaveBeenNthCalledWith(2, { where: { pharmacyId: "ph_1", status: "ERROR" }, data: { status: "CONNECTED" } });
  });

  it("une relance qui aboutit fait de même", async () => {
    db.state.deposits = [stored("dep_1", { source: "AGENT", status: "FAILED", appliedAt: null })];
    await service.retryDeposit("dep_1", "adm_1");
    expect(db.prisma.stockConnection.updateMany).toHaveBeenCalledTimes(2);
    expect(db.prisma.stockConnection.updateMany.mock.calls[0][0]).toMatchObject({ where: { pharmacyId: "ph_1" }, data: { lastSyncLines: 10, lastError: null } });
  });

  it("rien n'est touché quand le fichier n'est pas appliqué : écarté, de nouveau en attente, en échec", async () => {
    db.state.deposits = [stored("dep_1", { status: "HELD", appliedAt: null })];
    await service.decideHeldDeposit("dep_1", "adm_1", "REJECT");

    db.state.deposits = [stored("dep_2", { status: "FAILED", appliedAt: null })];
    db.prisma.pharmacyDrugStock.count.mockResolvedValue(4000);
    mocks.analyse.mockResolvedValue(preview({ valid: 5 }));
    expect(await service.retryDeposit("dep_2", "adm_1")).toMatchObject({ ok: true, deposit: { status: "HELD" } });

    db.state.deposits = [stored("dep_3", { status: "FAILED", appliedAt: null })];
    mocks.analyse.mockRejectedValue(new Error("panne"));
    expect(await service.retryDeposit("dep_3", "adm_1")).toMatchObject({ ok: true, deposit: { status: "FAILED" } });
    expect(db.prisma.stockConnection.updateMany).not.toHaveBeenCalled();
  });

  it("une liaison qui ne se met pas à jour ne défait pas la décision", async () => {
    db.prisma.stockConnection.updateMany.mockRejectedValue(new Error("base occupée"));
    db.state.deposits = [stored("dep_1", { status: "HELD", appliedAt: null })];
    expect(await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_FULL")).toMatchObject({ ok: true, deposit: { status: "APPLIED" } });
  });

  it("la réception d'un fichier n'y touche pas : c'est la route de l'agent qui la tient à jour", async () => {
    await send({ source: "AGENT" });
    expect(db.prisma.stockConnection.updateMany).not.toHaveBeenCalled();
  });
});

describe("l'équipe est nommée dans l'import qu'elle déclenche", () => {
  it("décision de l'équipe : l'import reçoit l'administrateur", async () => {
    db.state.deposits = [stored("dep_1", { status: "HELD", appliedAt: null })];
    await service.decideHeldDeposit("dep_1", "adm_1", "APPLY_FULL");
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({ actor: { platformAdminId: "adm_1" } }));
  });

  it("relance et dépôt par l'équipe : de même", async () => {
    db.state.deposits = [stored("dep_1", { status: "FAILED", appliedAt: null })];
    await service.retryDeposit("dep_1", "adm_2");
    expect(mocks.commit).toHaveBeenLastCalledWith(expect.objectContaining({ actor: { platformAdminId: "adm_2" } }));

    db.state.deposits = [];
    await service.receiveStockDeposit({ scope: SCOPE, pharmacyIsDemo: false, fileName: "equipe.csv", bytes: new TextEncoder().encode("equipe"), source: "CONSOLE", adminId: "adm_3" });
    expect(mocks.commit).toHaveBeenLastCalledWith(expect.objectContaining({ actor: { platformAdminId: "adm_3" } }));
  });

  it("l'envoi du titulaire ou de l'agent : aucun administrateur, l'import est celui du titulaire", async () => {
    await send({ source: "WEB" });
    await send({ source: "AGENT", fileName: "agent.csv", bytes: new TextEncoder().encode("agent") });
    for (const [call] of mocks.commit.mock.calls) expect(call).not.toHaveProperty("actor");
  });
});

describe("les noms de fichier à points consécutifs restent relisibles", () => {
  it("« stock..csv » reçu, retenu, puis appliqué par l'équipe : le fichier gardé se relit", async () => {
    db.prisma.pharmacyDrugStock.count.mockResolvedValue(4000);
    mocks.analyse.mockResolvedValue(preview({ valid: 5 }));
    const first = await send({ fileName: "stock..csv" });
    if (!first.ok) throw new Error("attendu");
    expect(first.deposit).toMatchObject({ status: "HELD", fileName: "stock..csv", hasFile: true });
    expect(mocks.put.mock.calls[0][0]).toBe(`stock-deposits/ph_1/${first.deposit.id}/stock.csv`);

    const decided = await service.decideHeldDeposit(first.deposit.id, "adm_1", "APPLY_FULL");
    expect(decided).toMatchObject({ ok: true, deposit: { status: "APPLIED" } });
    expect(mocks.read).toHaveBeenCalledWith(`stock-deposits/ph_1/${first.deposit.id}/stock.csv`);
  });

  it("« Inventaire 06.10..pdf » : le téléchargement de la console fonctionne", async () => {
    const first = await send({ fileName: "Inventaire 06.10..pdf" });
    if (!first.ok) throw new Error("attendu");
    expect(await service.getDepositFile(first.deposit.id, "adm_1")).toMatchObject({ ok: true, fileName: "Inventaire 06.10..pdf" });
  });
});

describe("un état impossible à écrire ne fait jamais lever le dépôt", () => {
  it("la base ne répond plus au moment d'écrire le résultat : le dépôt rendu est en échec, sans exception", async () => {
    db.prisma.stockDeposit.update.mockRejectedValue(new Error("base indisponible"));
    const result = await send();
    expect(result).toMatchObject({ ok: true, deposit: { status: "FAILED" } });
  });
});
