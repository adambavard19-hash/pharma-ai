import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La fenêtre de la douchette : les bips d'un même poste sont UNE vente, celle du
 * patient au comptoir, jusqu'à « Vente terminée » — ou trente minutes sans bip,
 * le garde-fou d'un « Vente terminée » oublié. Au-delà, c'est un autre patient.
 *
 * Prisma est simulé par une petite base en mémoire qui INTERPRÈTE les requêtes
 * du code (poste, statut, `sales: { none }`, `updatedAt` gte/gt, `orderBy`, et
 * la fiche du poste) : ce qui est éprouvé est le comportement, pas une copie
 * de la requête. Un filtre que la base simulée ne connaît pas la fait échouer
 * plutôt que d'être ignoré en silence — retirer ou changer une condition de la
 * requête fait donc rougir un test.
 */

type Line = { id: string; drugSpecialtyId: string | null; rawText: string | null; drugName: string; quantity: number | null; position: number };
type Sale = { id: string; reference: string; pharmacyId: string; source: string; counterPost: string; counterPostId?: string | null; handledByUserId?: string | null; status: string; createdAt: Date; updatedAt: Date; sales: unknown[]; lines: Line[]; followUpClosed?: boolean; answered?: number };
type Post = { lastScanAt: Date | null; lastSeenAt: Date | null; scanCount: number; assignedUserId?: string | null };

type DateFilter = { gte?: Date; gt?: Date };
type SaleWhere = { pharmacyId?: string; source?: string; counterPost?: string; counterPostId?: string; id?: string; status?: { in: string[] }; updatedAt?: DateFilter; sales?: { none?: Record<string, never> }; NOT?: { counterFollowUp?: { closedAt?: { not: null } } } };
type OrderBy = { createdAt?: "asc" | "desc"; updatedAt?: "asc" | "desc" };

type Conseil = { id: string; prescriptionId: string; productId?: string; presentationId?: string; specialtyId?: string; status: string; productName?: string };
const mem = vi.hoisted(() => ({ sales: [] as Sale[], posts: new Map<string, Post>(), next: 0, conseils: [] as Conseil[] }));

const db = vi.hoisted(() => {
  const KNOWN_KEYS = ["pharmacyId", "source", "counterPost", "counterPostId", "id", "status", "updatedAt", "sales", "NOT"];

  /** Le filtre `where` de Prisma, appliqué pour de bon à une vente. */
  const matches = (sale: Sale, where: SaleWhere): boolean => {
    const unknown = Object.keys(where).filter((key) => !KNOWN_KEYS.includes(key));
    if (unknown.length > 0) throw new Error(`Base simulée : filtre non géré (${unknown.join(", ")})`);
    if (where.pharmacyId !== undefined && sale.pharmacyId !== where.pharmacyId) return false;
    if (where.source !== undefined && sale.source !== where.source) return false;
    if (where.counterPost !== undefined && sale.counterPost !== where.counterPost) return false;
    if (where.counterPostId !== undefined && sale.counterPostId !== where.counterPostId) return false;
    if (where.id !== undefined && sale.id !== where.id) return false;
    if (where.status !== undefined && !where.status.in.includes(sale.status)) return false;
    if (where.updatedAt !== undefined) {
      const { gte, gt, ...rest } = where.updatedAt;
      if (Object.keys(rest).length > 0) throw new Error("Base simulée : opérateur de date non géré");
      if (gte !== undefined && !(sale.updatedAt.getTime() >= gte.getTime())) return false;
      if (gt !== undefined && !(sale.updatedAt.getTime() > gt.getTime())) return false;
    }
    if (where.sales !== undefined) {
      // `none: {}` : aucune vente encaissée ne s'y rattache. Toute autre forme n'est pas simulée.
      if (!where.sales.none || Object.keys(where.sales.none).length > 0) throw new Error("Base simulée : filtre `sales` non géré");
      if (sale.sales.length > 0) return false;
    }
    if (where.NOT !== undefined) {
      // `NOT: { counterFollowUp: { closedAt: { not: null } } }` : la vente que le pharmacien a terminée ne reprend pas de bip.
      const closed = where.NOT.counterFollowUp?.closedAt;
      if (!closed || closed.not !== null) throw new Error("Base simulée : filtre `NOT` non géré");
      if (sale.followUpClosed) return false;
    }
    return true;
  };

  const sorted = (found: Sale[], orderBy: OrderBy | undefined): Sale[] => {
    if (!orderBy) return found;
    const entries = Object.entries(orderBy) as [keyof OrderBy, "asc" | "desc"][];
    if (entries.length !== 1) throw new Error("Base simulée : un seul tri géré");
    const [[field, direction]] = entries;
    if (field !== "createdAt" && field !== "updatedAt") throw new Error(`Base simulée : tri non géré (${field})`);
    const sign = direction === "desc" ? -1 : 1;
    // Un tri stable : à égalité, l'ordre d'insertion.
    return [...found].sort((a, b) => sign * (a[field].getTime() - b[field].getTime()));
  };

  /** Prisma pose `updatedAt` à chaque écriture de la vente. */
  const touch = (sale: Sale) => {
    sale.updatedAt = new Date();
  };

  return {
    drugPresentation: { findUnique: vi.fn() },
    productBarcode: { findUnique: vi.fn(), upsert: vi.fn() },
    product: { findFirst: vi.fn(), findMany: vi.fn() },
    pharmacyDrugStock: { updateMany: vi.fn() },
    // Les conseils proposés dans une vente : un bip du même produit les fait passer en « Vendu ».
    recommendation: {
      findFirst: vi.fn(async ({ where }: { where: { prescriptionId: string; status: { in: string[] }; OR: { productId?: string; presentationId?: string; presentation?: { specialtyId: string } }[] } }) => {
        const found = mem.conseils.filter(
          (c) =>
            c.prescriptionId === where.prescriptionId &&
            where.status.in.includes(c.status) &&
            where.OR.some((or) => (or.productId && or.productId === c.productId) || (or.presentationId && or.presentationId === c.presentationId) || (or.presentation && or.presentation.specialtyId === c.specialtyId)),
        );
        return found.sort((a, b) => Number(a.status === "PURCHASED") - Number(b.status === "PURCHASED"))[0] ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: { prescriptionId: string; status: { in: string[] } } }) =>
        mem.conseils
          .filter((c) => c.prescriptionId === where.prescriptionId && where.status.in.includes(c.status) && c.productId)
          .sort((a, b) => Number(a.status === "PURCHASED") - Number(b.status === "PURCHASED"))
          .map((c) => ({ id: c.id, status: c.status, product: { name: c.productName ?? "", brand: null } })),
      ),
    },
    stockItem: { updateMany: vi.fn() },
    counterPost: {
      findUnique: vi.fn(async ({ where }: { where: { id: string }; select?: unknown }) => {
        const post = mem.posts.get(where.id);
        return post ? { lastScanAt: post.lastScanAt, assignedUserId: post.assignedUserId ?? null } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { lastScanAt?: Date; lastSeenAt?: Date; scanCount?: { increment: number } } }) => {
        const post = mem.posts.get(where.id)!;
        if (data.lastScanAt !== undefined) post.lastScanAt = data.lastScanAt;
        if (data.lastSeenAt !== undefined) post.lastSeenAt = data.lastSeenAt;
        if (data.scanCount) post.scanCount += data.scanCount.increment;
        return post;
      }),
    },
    prescription: {
      findFirst: vi.fn(async ({ where, orderBy }: { where: SaleWhere; orderBy?: OrderBy; select?: unknown }) => {
        const found = sorted(mem.sales.filter((sale) => matches(sale, where)), orderBy);
        // `_count.recommendations` : les conseils auxquels le poste a répondu Vendu ou Non vendu.
        return found[0] ? { ...found[0], _count: { recommendations: found[0].answered ?? 0 } } : null;
      }),
      create: vi.fn(async ({ data }: { data: { pharmacyId: string; reference: string; status: string; source: string; counterPost: string; counterPostId?: string | null; handledByUserId?: string | null; lines: { create: Omit<Line, "id"> } } }) => {
        mem.next += 1;
        const sale: Sale = {
          id: `rx_${mem.next}`,
          reference: data.reference,
          pharmacyId: data.pharmacyId,
          source: data.source,
          counterPost: data.counterPost,
          counterPostId: data.counterPostId ?? null,
          handledByUserId: data.handledByUserId ?? null,
          status: data.status,
          createdAt: new Date(),
          updatedAt: new Date(),
          sales: [],
          lines: [{ id: `line_${mem.next}_1`, ...data.lines.create }],
        };
        mem.sales.push(sale);
        return { id: sale.id };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { status?: string } }) => {
        const sale = mem.sales.find((candidate) => candidate.id === where.id)!;
        if (data.status !== undefined) sale.status = data.status;
        touch(sale);
        return sale;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: SaleWhere; data: { status: string } }) => {
        const closed = mem.sales.filter((sale) => matches(sale, where));
        for (const sale of closed) {
          sale.status = data.status;
          touch(sale);
        }
        return { count: closed.length };
      }),
    },
    prescriptionLine: {
      create: vi.fn(async ({ data }: { data: Omit<Line, "id"> & { prescriptionId: string } }) => {
        const sale = mem.sales.find((candidate) => candidate.id === data.prescriptionId)!;
        sale.lines.push({ id: `line_${sale.id}_${sale.lines.length + 1}`, drugSpecialtyId: data.drugSpecialtyId, rawText: data.rawText, drugName: data.drugName, quantity: data.quantity, position: data.position });
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { quantity: number } }) => {
        for (const sale of mem.sales) {
          const line = sale.lines.find((candidate) => candidate.id === where.id);
          if (line) line.quantity = data.quantity;
        }
      }),
      count: vi.fn(async ({ where }: { where: { prescriptionId: string } }) => mem.sales.find((sale) => sale.id === where.prescriptionId)?.lines.length ?? 0),
    },
  };
});
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => ({ recordAudit: audit.recordAudit }));
vi.mock("@/server/db/demo-scope", () => ({ recordIsDemo: () => false }));
vi.mock("@/server/services/references", () => ({
  nextReference: vi.fn(async () => `ORD-${String(mem.next + 1).padStart(4, "0")}`),
  createWithReference: async (_entity: string, _pharmacyId: string, create: (reference: string) => Promise<unknown>) => create(`ORD-${String(mem.next + 1).padStart(4, "0")}`),
}));
vi.mock("@/server/services/product-images", () => ({ findOpenFactsName: vi.fn(async () => null) }));
const finish = vi.hoisted(() => ({
  finishCounterSale: vi.fn(async (_agent: unknown, input: { prescriptionId: string }) => {
    const sale = mem.sales.find((candidate) => candidate.id === input.prescriptionId);
    if (sale) sale.followUpClosed = true;
    return { ok: true };
  }),
}));
const decide = vi.hoisted(() => ({
  decideCounterAdvice: vi.fn(async (_agent: unknown, input: { recommendationId: string }) => {
    const conseil = mem.conseils.find((c) => c.id === input.recommendationId);
    if (conseil) conseil.status = "PURCHASED";
    return { ok: true, outcome: "SOLD", changed: true };
  }),
}));
vi.mock("@/server/services/counter-window", () => ({ finishCounterSale: finish.finishCounterSale, decideCounterAdvice: decide.decideCounterAdvice }));

const { SAME_SALE_WINDOW_MS, recordCounterScan, closeLiveCounterSales, scanInstant } = await import("../counter-scan");
/** La fenêtre, en secondes : une vente reste ouverte jusqu'à « Vente terminée », avec trente minutes sans bip pour garde-fou. */
const W = SAME_SALE_WINDOW_MS / 1000;

const NOW = new Date("2026-10-06T09:00:00.000Z");
const agentOf = (postId: string | null) => ({ connectionId: null, postId, scope: { pharmacyId: "ph_1", organizationId: "org_1", userId: "usr_1" }, pharmacyIsDemo: false, intervalSeconds: 60, exportPath: null, scansPath: null });
const AGENT = agentOf("post_1");

// Des codes réels : un CIP13 (médicament) et deux EAN de parapharmacie.
const CIP_DOLIPRANE = "3400930000014";
const EAN_CREME = "3760001234565";
const EAN_PROBIOTIQUE = "3760009876543";
const EAN_NEO_MENTHE = "8032472023920";

const scan = (code: string, post = "Comptoir 1", scannedAt: Date | null = null, agent = AGENT) => recordCounterScan(agent, { code, post, scannedAt });
const wait = (seconds: number) => vi.advanceTimersByTime(seconds * 1000);
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const post = (id = "post_1") => mem.posts.get(id)!;

/** Ce que fait l'analyse d'une vente : elle la pose en cours, puis terminée, et chaque écriture fait avancer `updatedAt`. */
const analyse = (sale: Sale, seconds: number) => {
  sale.status = "ANALYZING";
  sale.updatedAt = new Date();
  wait(seconds);
  sale.status = "ANALYZED";
  sale.updatedAt = new Date();
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ now: NOW });
  mem.sales = [];
  mem.posts = new Map([
    ["post_1", { lastScanAt: null, lastSeenAt: null, scanCount: 0, assignedUserId: "usr_lea" }],
    ["post_2", { lastScanAt: null, lastSeenAt: null, scanCount: 0, assignedUserId: "usr_marc" }],
  ]);
  mem.next = 0;
  mem.conseils = [];
  db.drugPresentation.findUnique.mockImplementation(async ({ where }: { where: { cip13: string } }) =>
    where.cip13 === CIP_DOLIPRANE ? { id: "pres_1", cip13: CIP_DOLIPRANE, specialty: { id: "spec_doliprane", name: "DOLIPRANE 1000 mg", pharmaceuticalForm: "comprimé" } } : null,
  );
  db.productBarcode.findUnique.mockResolvedValue(null);
  const PRODUCTS = [
    { id: "p_creme", ean: EAN_CREME, name: "Crème hydratante visage", brand: null },
    { id: "p_probio", ean: EAN_PROBIOTIQUE, name: "Probiotique 10 milliards", brand: null },
    { id: "p_neo_menthe", ean: EAN_NEO_MENTHE, name: "NEOBIANACID ACID REFLUX MENTHE CPR CROQ70", brand: null },
  ];
  db.product.findFirst.mockImplementation(async ({ where }: { where: { ean?: string; id?: string } }) => PRODUCTS.find((p) => (where.ean !== undefined && p.ean === where.ean) || (where.id !== undefined && p.id === where.id)) ?? null);
  db.pharmacyDrugStock.updateMany.mockResolvedValue({ count: 1 });
  db.stockItem.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("la fenêtre de scan : la vente reste ouverte (trente minutes sans bip pour garde-fou)", () => {
  it("la constante vaut une minute", () => {
    expect(SAME_SALE_WINDOW_MS).toBe(60_000);
  });

  it("deux bips à 59 secondes : la même vente, la même ordonnance", async () => {
    const first = await scan(CIP_DOLIPRANE);
    wait(59);
    const second = await scan(EAN_CREME);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.prescriptionId).toBe(first.prescriptionId);
    expect(second.lineCount).toBe(2);
    expect(mem.sales).toHaveLength(1);
  });

  it("une minute et demie plus tard (le client suivant) : une nouvelle vente", async () => {
    const first = await scan(CIP_DOLIPRANE);
    wait(90);
    const second = await scan(EAN_CREME);
    expect(first.ok && second.ok && second.created === true && second.prescriptionId !== first.prescriptionId).toBe(true);
  });

  it("au-delà d'une minute sans bip : deux patients, deux ventes", async () => {
    const first = await scan(CIP_DOLIPRANE);
    wait(W + 1);
    const second = await scan(EAN_CREME);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.created).toBe(true);
    expect(second.prescriptionId).not.toBe(first.prescriptionId);
    expect(second.lineCount).toBe(1);
    expect(mem.sales).toHaveLength(2);
  });

  it("à une minute pile : encore la même vente (au-delà seulement, c'est un autre patient)", async () => {
    const first = await scan(CIP_DOLIPRANE);
    wait(W);
    const second = await scan(EAN_CREME);
    expect(second.ok && first.ok && second.prescriptionId === first.prescriptionId).toBe(true);
  });

  it("deux bips à la même seconde : la même vente", async () => {
    const first = await scan(CIP_DOLIPRANE);
    const second = await scan(EAN_CREME);
    expect(first.ok && second.ok && second.created === false && second.prescriptionId === first.prescriptionId).toBe(true);
  });

  it("la fenêtre glisse : elle se mesure depuis le dernier bip, pas depuis le premier", async () => {
    const first = await scan(CIP_DOLIPRANE);
    wait(50);
    await scan(EAN_CREME);
    wait(50);
    // 100 secondes après le premier bip, mais 50 après le dernier.
    const third = await scan(EAN_PROBIOTIQUE);
    expect(first.ok && third.ok).toBe(true);
    if (!first.ok || !third.ok) return;
    expect(third.prescriptionId).toBe(first.prescriptionId);
    expect(third.lineCount).toBe(3);
    expect(mem.sales).toHaveLength(1);
  });

  it("un médicament puis un produit de parapharmacie dans la minute : une seule ordonnance, deux lignes", async () => {
    await scan(CIP_DOLIPRANE);
    wait(20);
    const second = await scan(EAN_PROBIOTIQUE);
    expect(second.ok && second.created).toBe(false);
    expect(mem.sales[0].lines.map((line) => line.drugName)).toEqual(["DOLIPRANE 1000 mg", "Probiotique 10 milliards"]);
  });

  it("la même boîte bipée deux fois : une quantité de plus, pas une ligne de plus", async () => {
    await scan(CIP_DOLIPRANE);
    wait(5);
    const second = await scan(CIP_DOLIPRANE);
    expect(second.ok && second.lineCount).toBe(1);
    expect(mem.sales[0].lines[0].quantity).toBe(2);
  });

  it("une vente déjà analysée, dans la minute : un bip de plus la rouvre pour une nouvelle analyse", async () => {
    await scan(CIP_DOLIPRANE);
    mem.sales[0].status = "ANALYZED";
    wait(30);
    const second = await scan(EAN_CREME);
    expect(second.ok && second.created).toBe(false);
    expect(mem.sales[0].status).toBe("NEEDS_VERIFICATION");
  });

  it("une vente déjà encaissée ne se rouvre jamais, même dans la minute", async () => {
    await scan(CIP_DOLIPRANE);
    mem.sales[0].sales = [{ id: "sale_1" }];
    wait(10);
    const second = await scan(EAN_CREME);
    expect(second.ok && second.created).toBe(true);
    expect(mem.sales).toHaveLength(2);
    // La vente encaissée n'a pas reçu la boîte.
    expect(mem.sales[0].lines).toHaveLength(1);
  });
});

describe("la fenêtre se mesure depuis le dernier BIP du poste, jamais depuis l'écriture de la vente", () => {
  it("l'analyse entre deux bips ne prolonge pas la fenêtre : le patient B, juste au-delà de la fenêtre après le dernier bip de A, est une nouvelle vente", async () => {
    const a = await scan(CIP_DOLIPRANE);
    wait(7);
    // L'analyse démarre au calme du poste et dure une demi-minute : `updatedAt` avance jusqu'à +40 s.
    analyse(mem.sales[0], 33);
    expect(mem.sales[0].updatedAt.getTime()).toBe(at(40).getTime());
    wait(W - 30);
    // W + 10 s après le dernier bip de A, mais moins que la fenêtre après la dernière écriture de sa vente.
    const b = await scan(EAN_CREME);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.created).toBe(true);
    expect(b.prescriptionId).not.toBe(a.prescriptionId);
    expect(b.lineCount).toBe(1);
    expect(mem.sales).toHaveLength(2);
    // La vente de A n'a pas reçu la boîte de B ni été rouverte.
    expect(mem.sales[0].lines.map((line) => line.drugName)).toEqual(["DOLIPRANE 1000 mg"]);
    expect(mem.sales[0].status).toBe("ANALYZED");
  });

  it("à l'inverse, une analyse très longue ne coupe pas un patient qui bipe encore : 50 secondes après son dernier bip, c'est la même vente", async () => {
    const a = await scan(CIP_DOLIPRANE);
    wait(5);
    analyse(mem.sales[0], 20);
    wait(25);
    const b = await scan(EAN_CREME);
    expect(a.ok && b.ok && b.prescriptionId === a.prescriptionId).toBe(true);
    expect(mem.sales[0].status).toBe("NEEDS_VERIFICATION");
  });

  it("la fenêtre glisse malgré les analyses : chaque bip repart de zéro, une analyse n'y change rien", async () => {
    const a = await scan(CIP_DOLIPRANE);
    analyse(mem.sales[0], 30);
    wait(20);
    const b = await scan(EAN_CREME); // +50 s
    analyse(mem.sales[0], 30);
    wait(20);
    const c = await scan(EAN_PROBIOTIQUE); // +100 s : 50 s après le bip de B
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;
    expect(b.prescriptionId).toBe(a.prescriptionId);
    expect(c.prescriptionId).toBe(a.prescriptionId);
    expect(c.lineCount).toBe(3);
    expect(mem.sales).toHaveLength(1);
  });

  it("une file rejouée après une coupure : deux bips datés à plus de trente minutes d'écart, reçus à 100 ms d'écart, sont deux ventes", async () => {
    const early = await scan(CIP_DOLIPRANE, "Comptoir 1", at(-(W + 300)));
    wait(0.1);
    const late = await scan(EAN_CREME, "Comptoir 1", at(0));
    expect(early.ok && late.ok).toBe(true);
    if (!early.ok || !late.ok) return;
    expect(early.created).toBe(true);
    expect(late.created).toBe(true);
    expect(late.prescriptionId).not.toBe(early.prescriptionId);
    expect(mem.sales).toHaveLength(2);
  });

  it("une file rejouée dont les bips étaient rapprochés reste une seule vente", async () => {
    const first = await scan(CIP_DOLIPRANE, "Comptoir 1", at(-300));
    wait(0.1);
    const second = await scan(EAN_CREME, "Comptoir 1", at(-280));
    wait(0.1);
    const third = await scan(EAN_PROBIOTIQUE, "Comptoir 1", at(-250));
    expect(first.ok && second.ok && third.ok).toBe(true);
    if (!first.ok || !second.ok || !third.ok) return;
    expect(second.prescriptionId).toBe(first.prescriptionId);
    expect(third.prescriptionId).toBe(first.prescriptionId);
    expect(third.lineCount).toBe(3);
    expect(mem.sales).toHaveLength(1);
  });

  it("le poste retient l'instant du bip (celui que le poste a daté), pas celui de la réception", async () => {
    await scan(CIP_DOLIPRANE, "Comptoir 1", at(-120));
    expect(post().lastScanAt?.getTime()).toBe(at(-120).getTime());
    // Le signe de vie, lui, est l'heure du serveur.
    expect(post().lastSeenAt?.getTime()).toBe(NOW.getTime());
  });

  it("un horodatage dans le futur retombe sur « maintenant » : il ne décale pas la fenêtre du patient suivant", async () => {
    const first = await scan(CIP_DOLIPRANE, "Comptoir 1", at(600));
    expect(post().lastScanAt?.getTime()).toBe(NOW.getTime());
    wait(30);
    const second = await scan(EAN_CREME);
    expect(first.ok && second.ok && second.prescriptionId === first.prescriptionId).toBe(true);
  });

  it("un horodatage vieux de plus de six heures, ou illisible, retombe aussi sur « maintenant »", async () => {
    await scan(CIP_DOLIPRANE, "Comptoir 1", at(-7 * 3600));
    expect(post().lastScanAt?.getTime()).toBe(NOW.getTime());
    wait(10);
    await scan(EAN_CREME, "Comptoir 1", new Date("pas une date"));
    expect(post().lastScanAt?.getTime()).toBe(NOW.getTime() + 10_000);
  });

  it("un bip daté d'il y a cinq heures reste crédible : le poste le retient tel quel", async () => {
    await scan(CIP_DOLIPRANE, "Comptoir 1", at(-5 * 3600));
    expect(post().lastScanAt?.getTime()).toBe(at(-5 * 3600).getTime());
  });

  it("le dernier bip du poste ne recule jamais : un bip rejoué en retard ne le ramène pas en arrière", async () => {
    await scan(CIP_DOLIPRANE, "Comptoir 1", at(0));
    wait(1);
    const late = await scan(EAN_CREME, "Comptoir 1", at(-20));
    expect(post().lastScanAt?.getTime()).toBe(at(0).getTime());
    // Et, à vingt secondes d'écart, il reste de la même vente.
    expect(late.ok && late.created).toBe(false);
  });

  it("un bip daté de plus de trente minutes avant le dernier bip du poste n'est pas de la même vente (arrivé en retard, il garde son écart réel)", async () => {
    const recent = await scan(CIP_DOLIPRANE, "Comptoir 1", at(0));
    wait(1);
    const old = await scan(EAN_CREME, "Comptoir 1", at(-(W + 300)));
    expect(recent.ok && old.ok).toBe(true);
    if (!recent.ok || !old.ok) return;
    expect(old.created).toBe(true);
    expect(old.prescriptionId).not.toBe(recent.prescriptionId);
    expect(post().lastScanAt?.getTime()).toBe(at(0).getTime());
  });

  it("l'instant du bip : valide s'il est dans les six dernières heures, sinon l'instant de réception", () => {
    const now = NOW;
    expect(scanInstant(null, now)).toBe(now);
    expect(scanInstant(at(-30), now).getTime()).toBe(at(-30).getTime());
    expect(scanInstant(at(0), now).getTime()).toBe(now.getTime());
    expect(scanInstant(at(1), now)).toBe(now);
    expect(scanInstant(at(-6 * 3600), now).getTime()).toBe(at(-6 * 3600).getTime());
    expect(scanInstant(at(-6 * 3600 - 1), now)).toBe(now);
    expect(scanInstant(new Date(Number.NaN), now)).toBe(now);
  });

  it("une vente restée ouverte depuis longtemps ne reprend pas un patient quand la vente suivante vient d'être encaissée", async () => {
    // Patient A : jamais encaissé dans PharmaBoost, il reste « analysé ».
    await scan(CIP_DOLIPRANE);
    analyse(mem.sales[0], 10);
    wait(W + 30);
    // Patient B, au-delà de la fenêtre après A, encaissé tout de suite.
    const b = await scan(EAN_CREME);
    expect(b.ok && b.created).toBe(true);
    mem.sales[1].sales = [{ id: "sale_b" }];
    wait(30);
    // Patient C, 30 s après le bip de B : la vente de B est encaissée, celle de A est ancienne.
    const c = await scan(EAN_PROBIOTIQUE);
    expect(c.ok && c.created).toBe(true);
    if (!c.ok) return;
    expect(mem.sales).toHaveLength(3);
    expect(mem.sales[0].lines).toHaveLength(1);
    expect(c.lineCount).toBe(1);
  });

  it("c'est la vente que le poste a ouverte en dernier qui reçoit le bip, même si l'analyse tardive d'une plus ancienne vient de l'écrire", async () => {
    const a = await scan(CIP_DOLIPRANE);
    wait(W + 10);
    const b = await scan(EAN_CREME);
    // L'analyse de A se termine en retard : `updatedAt` de A dépasse celui de B.
    wait(5);
    mem.sales[0].updatedAt = new Date();
    wait(20);
    const c = await scan(EAN_PROBIOTIQUE);
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;
    expect(b.created).toBe(true);
    expect(c.created).toBe(false);
    expect(c.prescriptionId).toBe(b.prescriptionId);
    expect(mem.sales[0].lines).toHaveLength(1);
    expect(mem.sales[1].lines).toHaveLength(2);
  });

  it("sans poste connu (clé d'un serveur), repli sur la dernière écriture de la vente : W − 1 s oui, W s oui, W + 1 s non", async () => {
    const server = agentOf(null);
    const first = await scan(CIP_DOLIPRANE, "SERVEUR", null, server);
    wait(W - 1);
    const second = await scan(EAN_CREME, "SERVEUR", null, server);
    wait(W);
    const third = await scan(EAN_PROBIOTIQUE, "SERVEUR", null, server);
    wait(W + 1);
    const fourth = await scan(CIP_DOLIPRANE, "SERVEUR", null, server);
    expect(first.ok && second.ok && third.ok && fourth.ok).toBe(true);
    if (!first.ok || !second.ok || !third.ok || !fourth.ok) return;
    expect(second.prescriptionId).toBe(first.prescriptionId);
    expect(third.prescriptionId).toBe(first.prescriptionId);
    expect(fourth.created).toBe(true);
    expect(db.counterPost.update).not.toHaveBeenCalled();
    expect(db.counterPost.findUnique).not.toHaveBeenCalled();
  });
});

describe("plusieurs postes", () => {
  const poste2 = agentOf("post_2");

  it("deux postes ne se mélangent jamais, même à la seconde", async () => {
    const one = await scan(CIP_DOLIPRANE, "Comptoir 1");
    wait(1);
    const two = await scan(EAN_CREME, "Comptoir 2", null, poste2);
    expect(one.ok && two.ok && one.prescriptionId !== two.prescriptionId).toBe(true);
    expect(mem.sales).toHaveLength(2);
  });

  it("chaque poste a sa propre fenêtre : le bip d'un poste ne prolonge pas celle de l'autre", async () => {
    const one = await scan(CIP_DOLIPRANE, "Comptoir 1");
    wait(W - 30);
    const two = await scan(EAN_CREME, "Comptoir 2", null, poste2);
    wait(40);
    // Au-delà de la fenêtre après le bip du poste 1 (nouveau patient), 40 s après celui du poste 2 (même patient).
    const oneAgain = await scan(EAN_PROBIOTIQUE, "Comptoir 1");
    const twoAgain = await scan(CIP_DOLIPRANE, "Comptoir 2", null, poste2);
    expect(one.ok && two.ok && oneAgain.ok && twoAgain.ok).toBe(true);
    if (!one.ok || !two.ok || !oneAgain.ok || !twoAgain.ok) return;
    expect(oneAgain.created).toBe(true);
    expect(oneAgain.prescriptionId).not.toBe(one.prescriptionId);
    expect(twoAgain.created).toBe(false);
    expect(twoAgain.prescriptionId).toBe(two.prescriptionId);
  });
});

describe("ce que chaque bip écrit : le stock et le poste", () => {
  it("une boîte de médicament retire une unité du stock des médicaments, jamais sous zéro", async () => {
    await scan(CIP_DOLIPRANE);
    expect(db.pharmacyDrugStock.updateMany).toHaveBeenCalledTimes(1);
    expect(db.pharmacyDrugStock.updateMany).toHaveBeenCalledWith({
      where: { pharmacyId: "ph_1", presentationId: "pres_1", quantity: { gt: 0 } },
      data: { quantity: { decrement: 1 } },
    });
    expect(db.stockItem.updateMany).not.toHaveBeenCalled();
  });

  it("un produit de parapharmacie retire une unité du stock de l'officine, jamais sous zéro", async () => {
    await scan(EAN_CREME);
    expect(db.stockItem.updateMany).toHaveBeenCalledTimes(1);
    expect(db.stockItem.updateMany).toHaveBeenCalledWith({
      where: { pharmacyId: "ph_1", productId: "p_creme", quantity: { gt: 0 } },
      data: { quantity: { decrement: 1 } },
    });
    expect(db.pharmacyDrugStock.updateMany).not.toHaveBeenCalled();
  });

  it("le poste retient l'instant du bip, son signe de vie, et compte un bip de plus", async () => {
    await scan(CIP_DOLIPRANE);
    wait(5);
    await scan(EAN_CREME);
    expect(db.counterPost.update).toHaveBeenCalledTimes(2);
    expect(db.counterPost.update).toHaveBeenLastCalledWith({ where: { id: "post_1" }, data: { lastScanAt: at(5), lastSeenAt: at(5), scanCount: { increment: 1 } } });
    expect(post().scanCount).toBe(2);
    expect(post().lastScanAt?.getTime()).toBe(at(5).getTime());
  });

  it("un code que personne ne connaît n'est pas un bip : ni vente, ni stock, ni poste", async () => {
    const result = await scan("12");
    expect(result.ok).toBe(false);
    expect(mem.sales).toHaveLength(0);
    expect(db.counterPost.update).not.toHaveBeenCalled();
    expect(db.stockItem.updateMany).not.toHaveBeenCalled();
  });
});

describe("« Nouveau patient » : inchangé", () => {
  it("clôt la vente en cours ; le bip suivant, même quelques secondes après, ouvre une nouvelle vente", async () => {
    const first = await scan(CIP_DOLIPRANE);
    wait(5);
    const closed = await closeLiveCounterSales({ pharmacyId: "ph_1", userId: "usr_1" });
    expect(closed).toBe(1);
    expect(mem.sales[0].status).toBe("CANCELLED");
    wait(5);
    const next = await scan(EAN_CREME);
    expect(first.ok && next.ok).toBe(true);
    if (!first.ok || !next.ok) return;
    expect(next.created).toBe(true);
    expect(next.prescriptionId).not.toBe(first.prescriptionId);
    expect(next.lineCount).toBe(1);
  });

  it("ne touche pas une vente déjà encaissée", async () => {
    await scan(CIP_DOLIPRANE);
    mem.sales[0].sales = [{ id: "sale_1" }];
    expect(await closeLiveCounterSales({ pharmacyId: "ph_1", userId: "usr_1" })).toBe(0);
    expect(mem.sales[0].status).toBe("NEEDS_VERIFICATION");
  });
});

describe("chaque comptoir est un espace à part, avec son collaborateur", () => {
  it("la vente porte l'identité du comptoir ET le collaborateur à qui il est attribué au moment du bip", async () => {
    await scan(CIP_DOLIPRANE, "Comptoir 1", null, agentOf("post_1"));
    await scan(CIP_DOLIPRANE, "Comptoir 2", null, agentOf("post_2"));
    expect(mem.sales.map((sale) => [sale.counterPostId, sale.handledByUserId])).toEqual([["post_1", "usr_lea"], ["post_2", "usr_marc"]]);
  });

  it("deux ordinateurs qui portent le même nom ne mélangent jamais leurs ventes : le comptoir se reconnaît à son identité", async () => {
    const first = await scan(CIP_DOLIPRANE, "Caisse", null, agentOf("post_1"));
    wait(5);
    const second = await scan(EAN_CREME, "Caisse", null, agentOf("post_2"));
    expect(first.ok && second.ok && first.prescriptionId !== second.prescriptionId).toBe(true);
    // Le bip suivant du premier ordinateur complète SA vente, pas celle de l'autre.
    wait(5);
    const third = await scan(EAN_PROBIOTIQUE, "Caisse", null, agentOf("post_1"));
    expect(third.ok && first.ok && third.prescriptionId === first.prescriptionId).toBe(true);
  });

  it("un comptoir attribué à personne ne donne la vente à personne", async () => {
    post("post_1").assignedUserId = null;
    await scan(CIP_DOLIPRANE, "Comptoir 1", null, agentOf("post_1"));
    expect(mem.sales[0].handledByUserId).toBeNull();
  });

  it("changer le collaborateur d'un comptoir ne réécrit pas les ventes déjà faites", async () => {
    await scan(CIP_DOLIPRANE, "Comptoir 1", null, agentOf("post_1"));
    post("post_1").assignedUserId = "usr_marc";
    wait(W + 60);
    await scan(CIP_DOLIPRANE, "Comptoir 1", null, agentOf("post_1"));
    expect(mem.sales.map((sale) => sale.handledByUserId)).toEqual(["usr_lea", "usr_marc"]);
  });
});


describe("la règle du fondateur (15 oct. 2026) : une réponse garde la vente ouverte, sans réponse elle se termine seule", () => {
  it("un conseil répondu (Vendu ou Non vendu) : cinq minutes plus tard, le bip s'ajoute encore à la même vente", async () => {
    const first = await scan(CIP_DOLIPRANE);
    mem.sales[0].answered = 1;
    wait(5 * 60);
    const second = await scan(EAN_CREME);
    expect(first.ok && second.ok && second.created === false && second.prescriptionId === first.prescriptionId).toBe(true);
    expect(finish.finishCounterSale).not.toHaveBeenCalled();
  });

  it("un conseil répondu puis « Vente terminée » : le bip suivant est un autre client", async () => {
    const first = await scan(CIP_DOLIPRANE);
    mem.sales[0].answered = 1;
    mem.sales[0].followUpClosed = true;
    wait(10);
    const second = await scan(EAN_CREME);
    expect(first.ok && second.ok && second.created === true && second.prescriptionId !== first.prescriptionId).toBe(true);
  });

  it("aucune réponse et plus d'une minute sans bip : la vente se termine toute seule, le bip ouvre la vente suivante", async () => {
    const first = await scan(CIP_DOLIPRANE);
    wait(61);
    const second = await scan(EAN_CREME);
    expect(first.ok && second.ok && second.created === true).toBe(true);
    if (!first.ok) return;
    expect(finish.finishCounterSale).toHaveBeenCalledTimes(1);
    expect(finish.finishCounterSale.mock.calls[0][1]).toEqual({ prescriptionId: first.prescriptionId });
    expect(mem.sales[0].followUpClosed).toBe(true);
  });

  it("aucune réponse mais un bip dans la minute : même vente, rien n'est terminé", async () => {
    const first = await scan(CIP_DOLIPRANE);
    wait(40);
    const second = await scan(EAN_CREME);
    expect(first.ok && second.ok && second.prescriptionId === first.prescriptionId).toBe(true);
    expect(finish.finishCounterSale).not.toHaveBeenCalled();
  });
});

describe("un conseil bipé passe en « Vendu » tout seul (fondateur, 16 oct. 2026)", () => {
  it("le produit conseillé est bipé : « Vendu », pas de ligne en plus, pas de nouvelle analyse, le stock baisse", async () => {
    const first = await scan(CIP_DOLIPRANE);
    if (!first.ok) throw new Error("bip refusé");
    mem.sales[0].status = "ANALYZED";
    mem.conseils = [{ id: "rec_creme", prescriptionId: first.prescriptionId, productId: "p_creme", status: "PROPOSED" }];
    wait(20);
    const second = await scan(EAN_CREME);
    expect(second.ok && second.adviceSold).toBe(true);
    expect(decide.decideCounterAdvice).toHaveBeenCalledWith(AGENT, { prescriptionId: first.prescriptionId, recommendationId: "rec_creme", outcome: "SOLD", via: "SCAN" });
    expect(mem.sales[0].lines).toHaveLength(1);
    // La vente n'est pas renvoyée à l'analyse : aucun conseil n'est relancé.
    expect(mem.sales[0].status).toBe("ANALYZED");
    expect(db.stockItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ productId: "p_creme" }) }));
    expect(post().scanCount).toBe(2);
  });

  it("le pharmacien est allé chercher le conseil en rayon (plus d'une minute) : c'est toujours le même client", async () => {
    const first = await scan(CIP_DOLIPRANE);
    if (!first.ok) throw new Error("bip refusé");
    mem.conseils = [{ id: "rec_creme", prescriptionId: first.prescriptionId, productId: "p_creme", status: "PROPOSED" }];
    wait(3 * 60);
    const second = await scan(EAN_CREME);
    expect(second.ok && second.adviceSold && second.prescriptionId === first.prescriptionId).toBe(true);
    expect(finish.finishCounterSale).not.toHaveBeenCalled();
  });

  it("une deuxième boîte du conseil déjà vendu : absorbée aussi, sans nouvelle réponse", async () => {
    const first = await scan(CIP_DOLIPRANE);
    if (!first.ok) throw new Error("bip refusé");
    mem.conseils = [{ id: "rec_creme", prescriptionId: first.prescriptionId, productId: "p_creme", status: "PURCHASED" }];
    const second = await scan(EAN_CREME);
    expect(second.ok && second.adviceSold).toBe(true);
    expect(decide.decideCounterAdvice).not.toHaveBeenCalled();
    expect(mem.sales[0].lines).toHaveLength(1);
  });

  it("un médicament conseillé se reconnaît à sa spécialité, même dans une autre présentation", async () => {
    const first = await scan(EAN_CREME);
    if (!first.ok) throw new Error("bip refusé");
    mem.conseils = [{ id: "rec_doli", prescriptionId: first.prescriptionId, presentationId: "pres_autre", specialtyId: "spec_doliprane", status: "PROPOSED" }];
    const second = await scan(CIP_DOLIPRANE);
    expect(second.ok && second.adviceSold).toBe(true);
  });

  it("un produit qui n'est pas un conseil : une boîte de plus, comme avant", async () => {
    const first = await scan(CIP_DOLIPRANE);
    if (!first.ok) throw new Error("bip refusé");
    mem.conseils = [{ id: "rec_creme", prescriptionId: first.prescriptionId, productId: "p_creme", status: "PROPOSED" }];
    const second = await scan(EAN_PROBIOTIQUE);
    expect(second.ok && second.adviceSold).toBeFalsy();
    expect(mem.sales[0].lines).toHaveLength(2);
  });

  it("le conseil d'une vente terminée ne capte jamais le bip du client suivant", async () => {
    const first = await scan(CIP_DOLIPRANE);
    if (!first.ok) throw new Error("bip refusé");
    mem.conseils = [{ id: "rec_creme", prescriptionId: first.prescriptionId, productId: "p_creme", status: "PROPOSED" }];
    mem.sales[0].followUpClosed = true;
    const second = await scan(EAN_CREME);
    expect(second.ok && !second.adviceSold && second.created).toBe(true);
  });

  it("un autre parfum de la même gamme que le conseil (NEOBIANACID menthe pour NEOBIANACID citron) : « Vendu » aussi", async () => {
    const first = await scan(CIP_DOLIPRANE);
    if (!first.ok) throw new Error("bip refusé");
    mem.conseils = [{ id: "rec_neo", prescriptionId: first.prescriptionId, productId: "p_neo_citron", productName: "NEOBIANACID CITRON CPR 70", status: "PROPOSED" }];
    const second = await scan(EAN_NEO_MENTHE);
    expect(second.ok && second.adviceSold).toBe(true);
    expect(decide.decideCounterAdvice).toHaveBeenCalledWith(AGENT, expect.objectContaining({ recommendationId: "rec_neo", outcome: "SOLD" }));
    expect(mem.sales[0].lines).toHaveLength(1);
  });

  it("un mot courant ne fait pas une gamme : une crème quelconque ne vend pas le conseil « Crème mains »", async () => {
    const first = await scan(CIP_DOLIPRANE);
    if (!first.ok) throw new Error("bip refusé");
    mem.conseils = [{ id: "rec_mains", prescriptionId: first.prescriptionId, productId: "p_mains", productName: "Crème mains réparatrice", status: "PROPOSED" }];
    const second = await scan(EAN_CREME);
    expect(second.ok && second.adviceSold).toBeFalsy();
  });
});
