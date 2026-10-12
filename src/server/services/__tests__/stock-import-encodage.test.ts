import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'encodage d'un export de stock, du fichier jusqu'au nom écrit en stock.
 *
 * Avant : tout texte était lu en UTF-8, un export windows-1252 ou CP850
 * donnait « ERGYALLER� G�LULE 60 » ; un « .xls » qui n'est que du texte était
 * lu en Latin-1 par la bibliothèque des classeurs (« ’ » et « œ » perdus) et
 * « 14,95 » devenait 1 495. Et un nom déjà abîmé (« ERGYALLER¿ », tel que
 * l'imprime LGPI lui-même) restait abîmé : l'import ne touchait jamais au nom.
 * La base est en mémoire.
 */

type Json = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = { jobs: [] as Json[], products: [] as Json[], stockItems: [] as Json[], movements: [] as Json[] };
  const tx = {
    product: {
      findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select: Record<string, true> }) => {
        const found = state.products.find((product) => product.id === where.id);
        return found ? Object.fromEntries(Object.keys(select).map((key) => [key, found[key]])) : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Json }) => {
        Object.assign(state.products.find((product) => product.id === where.id)!, data);
      }),
    },
    stockItem: {
      findUnique: vi.fn(async ({ where }: { where: { productId: string } }) => state.stockItems.find((item) => item.productId === where.productId) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Json }) => {
        Object.assign(state.stockItems.find((item) => item.id === where.id)!, data);
      }),
      create: vi.fn(),
    },
    stockMovement: { create: vi.fn(async ({ data }: { data: Json }) => void state.movements.push(data)) },
    importJob: { update: vi.fn() },
    pharmacy: { update: vi.fn() },
  };
  const prisma = {
    importJob: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.jobs.find((job) => job.id === where.id) ?? null) },
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  };
  return { state, tx, prisma };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));
vi.mock("@/server/db/demo-scope", () => ({ recordIsDemo: () => false }));
vi.mock("../references", () => ({ reserveReferences: async () => [] }));
vi.mock("../notifications", () => ({ createNotification: vi.fn(), refreshStockNotifications: vi.fn() }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("../product-classification", () => ({ classifyPharmacyProducts: vi.fn() }));
vi.mock("../pdf-text", () => ({ extractPdfLayoutText: vi.fn() }));

const { commitStockImport, parseImportFile } = await import("../stock-import");
const { readRows, suggestMapping } = await import("@/core/stock-import");

const CP1252: Record<string, number> = { "®": 0xae, é: 0xe9, É: 0xc9, È: 0xc8, À: 0xc0, œ: 0x9c, Œ: 0x8c, "’": 0x92 };
const CP850: Record<string, number> = { "®": 0xa9, é: 0x82, É: 0x90, È: 0xd4, À: 0xb7 };
const encode = (text: string, table: Record<string, number>) => Uint8Array.from([...text], (char) => (char.charCodeAt(0) < 0x80 ? char.charCodeAt(0) : table[char]));
const utf8 = (text: string) => new TextEncoder().encode(text);

const lines = (separator: string, apostrophe = "’", oe = "Œ") =>
  [
    ["Code produit", "Désignation", "Qté stock", "PV TTC"],
    ["3664524001751", "ERGYALLER® GÉLULE 60", "17", "14,95"],
    ["3401560000001", `CRÈME À L${apostrophe}HUILE D${apostrophe}${oe}ILLET`, "3", "9,90"],
  ]
    .map((cells) => cells.join(separator))
    .join("\r\n");

/** Les noms et prix tels que l'import les comprend, après lecture des lignes. */
function namesAndPrices(fileName: string, bytes: Uint8Array) {
  const parsed = parseImportFile(fileName, bytes);
  const rows = readRows(parsed.records, suggestMapping(parsed.headers));
  return rows.map((row) => ({ name: row.name, quantity: row.quantity, salePriceCents: row.salePriceCents }));
}

const EXPECTED = [
  { name: "ERGYALLER® GÉLULE 60", quantity: 17, salePriceCents: 1495 },
  { name: "CRÈME À L’HUILE D’ŒILLET", quantity: 3, salePriceCents: 990 },
];

describe("lecture d'un export de stock, quel que soit son encodage", () => {
  it.each([
    ["CSV windows-1252", "stock.csv", encode(lines(";"), CP1252)],
    ["CSV UTF-8", "stock.csv", utf8(lines(";"))],
    ["CSV UTF-8 avec BOM", "stock.csv", Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8(lines(";"))])],
    ["TXT tabulé windows-1252", "stock.txt", encode(lines("\t"), CP1252)],
    ["« .xls » qui n'est qu'un texte tabulé windows-1252", "stock.xls", encode(lines("\t"), CP1252)],
    ["« .xls » qui n'est qu'un texte tabulé UTF-8", "stock.xls", utf8(lines("\t"))],
  ])("%s : noms justes, prix à la virgule lus en euros", (_label, fileName, bytes) => {
    const rows = namesAndPrices(fileName, bytes);
    expect(rows).toEqual(EXPECTED);
    expect(JSON.stringify(rows)).not.toMatch(/[¿�]/);
  });

  it("CSV CP850 (sans « ’ » ni « œ », que CP850 n'a pas) : noms justes", () => {
    const rows = namesAndPrices("stock.csv", encode(lines(";", "'", "O"), CP850));
    expect(rows.map((row) => row.name)).toEqual(["ERGYALLER® GÉLULE 60", "CRÈME À L'HUILE D'OILLET"]);
    expect(JSON.stringify(rows)).not.toMatch(/[¿�]/);
  });

  it("un tableau HTML sous le nom « .xls » : valeurs gardées en texte, « 14,95 » ne devient pas 1 495 €", () => {
    const html = `<html><body><table>${[["Code produit", "Désignation", "Qté stock", "PV TTC"], ["3664524001751", "ERGYALLER® GÉLULE 60", "17", "14,95"]]
      .map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
      .join("")}</table></body></html>`;
    expect(namesAndPrices("stock.xls", encode(html, CP1252))).toEqual([EXPECTED[0]]);
  });

  it.each([["xlsx", "stock.xlsx"], ["biff8", "stock.xls"]] as const)("un vrai classeur (%s) reste lu par la bibliothèque des classeurs", async (bookType, fileName) => {
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Code produit", "Désignation", "Qté stock", "PV TTC"], ["3664524001751", "ERGYALLER® GÉLULE 60", 17, 14.95]]), "Stock");
    const bytes = new Uint8Array(XLSX.write(book, { type: "array", bookType }) as ArrayBuffer);
    expect(namesAndPrices(fileName, bytes)).toEqual([EXPECTED[0]]);
  });

  it("le « ¿ » imprimé par LGPI n'entre pas en stock", () => {
    const rows = namesAndPrices("stock.csv", utf8("Code produit;Désignation;Qté stock\r\n3664524001751;ERGYALLER¿ GELULE 60;17"));
    expect(rows[0].name).toBe("ERGYALLER GELULE 60");
  });
});

const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" };
const row = (line: number, name: string, targetId: string) => ({
  line, name, code: "3664524001751", quantity: 17, salePriceCents: 1495, purchasePriceCents: null, vatRate: null, brand: null, categoryLabel: null,
  issues: [], status: "PRODUIT_EXISTANT", targetId, targetLabel: null, candidates: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  db.state.movements = [];
  db.state.products = [
    { id: "pr_1", pharmacyId: "ph_1", name: "ERGYALLER¿ GELULE 60" },
    { id: "pr_2", pharmacyId: "ph_1", name: "Ma crème maison" },
    { id: "pr_3", pharmacyId: "ph_1", name: "CR�ME HYDRATANTE" },
  ];
  db.state.stockItems = db.state.products.map((product) => ({ id: `si_${product.id}`, productId: product.id, pharmacyId: "ph_1", quantity: 1 }));
});

const commit = (rows: ReturnType<typeof row>[]) => {
  db.state.jobs = [{ id: "job_1", pharmacyId: "ph_1", status: "PENDING", fileName: "stock.csv", summary: {}, payload: { rows } }];
  return commitStockImport({ scope: SCOPE, pharmacyIsDemo: true, jobId: "job_1", decisions: {}, createUnknownByDefault: false });
};
const nameOf = (id: string) => db.state.products.find((product) => product.id === id)!.name;

describe("le prochain dépôt répare les noms déjà abîmés", () => {
  it("un produit connu au nom abîmé prend le nom sain du fichier", async () => {
    await commit([row(1, "ERGYALLER GELULE 60", "pr_1"), row(2, "CRÈME HYDRATANTE", "pr_3")]);
    expect(nameOf("pr_1")).toBe("ERGYALLER GELULE 60");
    expect(nameOf("pr_3")).toBe("CRÈME HYDRATANTE");
  });

  it("un nom sain n'est jamais réécrit par l'import, même si le fichier l'écrit autrement", async () => {
    await commit([row(1, "CREME MAISON 50ML", "pr_2")]);
    expect(nameOf("pr_2")).toBe("Ma crème maison");
    expect(db.tx.product.update.mock.calls[0][0].data).not.toHaveProperty("name");
  });

  it("un nom abîmé n'est pas remplacé par le nom d'un autre produit", async () => {
    await commit([row(1, "ERGYALLER GELULE 30", "pr_1")]);
    expect(nameOf("pr_1")).toBe("ERGYALLER¿ GELULE 60");
  });
});
