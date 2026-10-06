import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Un fichier lu en partie ne doit jamais passer pour un stock complet : le
 * parseur le dit (`incomplete`), l'analyse le remonte, et une analyse qui
 * échoue ne laisse pas le fichier entier dans l'import « en attente ». Le
 * PDF est simulé (texte déjà extrait) ; la base aussi.
 */

type Json = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  extractPdfLayoutText: vi.fn(),
  jobCreate: vi.fn(),
  jobFindUniqueOrThrow: vi.fn(),
  jobFindUnique: vi.fn(),
  jobUpdate: vi.fn(),
  jobUpdateMany: vi.fn(),
  productFindMany: vi.fn(),
  presentationFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    importJob: { create: mocks.jobCreate, findUniqueOrThrow: mocks.jobFindUniqueOrThrow, findUnique: mocks.jobFindUnique, update: mocks.jobUpdate, updateMany: mocks.jobUpdateMany },
    product: { findMany: mocks.productFindMany },
    drugPresentation: { findMany: mocks.presentationFindMany },
  },
}));
vi.mock("@/server/db/demo-scope", () => ({ recordIsDemo: () => false }));
vi.mock("../references", () => ({ reserveReferences: vi.fn() }));
vi.mock("../notifications", () => ({ createNotification: vi.fn(), refreshStockNotifications: vi.fn() }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("../product-classification", () => ({ classifyPharmacyProducts: vi.fn() }));
vi.mock("../pdf-text", () => ({ extractPdfLayoutText: mocks.extractPdfLayoutText }));

const { analyseStockImport, parseImportFile, parseImportFileAsync, remapStockImport, IMPORT_MAX_ROWS } = await import("../stock-import");
const { UnreadableFileError } = await import("@/core/stock-import");

const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" };

/** Un extrait SYNTHÉTIQUE d'édition d'inventaire LGPI : une ligne produit, valorisée au prix de vente. */
const INVENTORY = ` PHARMACIE TEST                                                                                                Page       1     /      2

                                       Inventaire du 12/09/2026 04h26 valorisé par Prix de vente
  Code Produit   Désignation                       Nb unité   Zone Géo.       Dépôt                Qté Qté         Prix        Total          Taux
                                                    / boite   principale                          boite unité                                  TVA
3760000000017    KIT TEST SYNTHETIQUE                                         PHARMACIE              6             2,000            12,00       0%
`;

const pdf = (extra: Partial<{ text: string; pages: number; skippedPages: number; totalPages: number }> = {}) => ({ text: INVENTORY, pages: 120, skippedPages: 0, totalPages: 120, ...extra });
const bytes = new Uint8Array([1, 2, 3]);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.extractPdfLayoutText.mockResolvedValue(pdf());
  mocks.jobCreate.mockResolvedValue({ id: "job_1" });
  mocks.jobFindUniqueOrThrow.mockResolvedValue({ fileName: "stock.csv" });
  mocks.jobUpdate.mockResolvedValue({});
  mocks.jobUpdateMany.mockResolvedValue({ count: 1 });
  mocks.productFindMany.mockResolvedValue([]);
  mocks.presentationFindMany.mockResolvedValue([]);
});

describe("un PDF d'inventaire lu en partie", () => {
  it("des pages sautées : le fichier est « incomplet », avec ce qui manque en une phrase", async () => {
    mocks.extractPdfLayoutText.mockResolvedValue(pdf({ skippedPages: 3 }));
    const parsed = await parseImportFileAsync("inventaire.pdf", bytes);
    expect(parsed.incomplete).toBe(true);
    expect(parsed.incompleteReason).toBe("3 pages du fichier n'ont pas pu être lues");
    // L'avertissement lisible par le titulaire de l'assistant d'import reste là.
    expect(parsed.warnings?.some((warning) => /3 page\(s\) sur 120/.test(warning))).toBe(true);
    expect(parsed.records).toHaveLength(1);
  });

  it("une seule page sautée : l'accord est au singulier", async () => {
    mocks.extractPdfLayoutText.mockResolvedValue(pdf({ skippedPages: 1 }));
    expect((await parseImportFileAsync("inventaire.pdf", bytes)).incompleteReason).toBe("1 page du fichier n'a pas pu être lue");
  });

  it("le plafond de pages atteint : incomplet aussi, et le plafond est demandé à l'extraction", async () => {
    mocks.extractPdfLayoutText.mockResolvedValue(pdf({ pages: 500, totalPages: 620 }));
    const parsed = await parseImportFileAsync("inventaire.pdf", bytes);
    expect(mocks.extractPdfLayoutText).toHaveBeenCalledWith(bytes, { maxPages: 500 });
    expect(parsed.incomplete).toBe(true);
    expect(parsed.incompleteReason).toBe("620 pages dans le fichier, seules les 500 premières ont été lues");
  });

  it("pages sautées ET plafond atteint : les deux raisons", async () => {
    mocks.extractPdfLayoutText.mockResolvedValue(pdf({ pages: 500, totalPages: 620, skippedPages: 2 }));
    const parsed = await parseImportFileAsync("inventaire.pdf", bytes);
    expect(parsed.incompleteReason).toBe("2 pages du fichier n'ont pas pu être lues ; 620 pages dans le fichier, seules les 500 premières ont été lues");
  });

  it("toutes les pages lues : un fichier complet", async () => {
    const parsed = await parseImportFileAsync("inventaire.pdf", bytes);
    expect(parsed.incomplete).toBe(false);
    expect(parsed).not.toHaveProperty("incompleteReason");
  });

  it("un PDF qui n'est pas une édition d'inventaire est une erreur « de fichier » : relire le même n'y changera rien", async () => {
    mocks.extractPdfLayoutText.mockResolvedValue(pdf({ text: "Ordonnance du Dr Test\nPatient : Jean Test" }));
    const error = await parseImportFileAsync("ordonnancier.pdf", bytes).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnreadableFileError);
    expect((error as Error).message).toContain("n'est pas une édition d'inventaire LGPI reconnue");
  });

  it("un PDF dont les pages sont toutes abîmées n'est pas déclaré « pas un inventaire » : il est peut-être bon, on le garde", async () => {
    mocks.extractPdfLayoutText.mockResolvedValue(pdf({ text: "", skippedPages: 12, totalPages: 12, pages: 12 }));
    const error = await parseImportFileAsync("inventaire.pdf", bytes).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnreadableFileError);
    expect((error as Error).message).toContain("pages sont abîmées");
  });
});

describe("un fichier tableur dont la fin est ignorée", () => {
  const csv = (rows: number) => `Code produit;Désignation;Qte Stock\n${Array.from({ length: rows }, (_, index) => `34009300${String(index).padStart(5, "0")};Produit ${index};1`).join("\n")}\n`;

  it("exactement au plafond : complet", () => {
    const parsed = parseImportFile("stock.csv", new TextEncoder().encode(csv(IMPORT_MAX_ROWS)));
    expect(parsed.records).toHaveLength(IMPORT_MAX_ROWS);
    expect(parsed.incomplete).toBe(false);
  });

  it("au-delà du plafond : les lignes en trop sont ignorées, et le fichier le dit au lieu de les laisser passer pour « absentes du stock »", () => {
    const parsed = parseImportFile("stock.csv", new TextEncoder().encode(csv(IMPORT_MAX_ROWS + 1)));
    expect(parsed.records).toHaveLength(IMPORT_MAX_ROWS);
    expect(parsed.incomplete).toBe(true);
    expect(parsed.incompleteReason).toBe(`${(IMPORT_MAX_ROWS + 1).toLocaleString("fr-FR")} lignes dans le fichier, seules les ${IMPORT_MAX_ROWS.toLocaleString("fr-FR")} premières ont été lues`);
  });

  it("un petit fichier ou un fichier vide : complet", () => {
    expect(parseImportFile("stock.csv", new TextEncoder().encode(csv(3))).incomplete).toBe(false);
    expect(parseImportFile("stock.csv", new TextEncoder().encode(""))).toEqual({ headers: [], records: [], incomplete: false });
  });
});

describe("analyseStockImport", () => {
  const csvBytes = new TextEncoder().encode("Code produit;Désignation;Qte Stock\n3400930000012;Produit A;4\n");

  it("remonte « incomplet » dans l'aperçu et le garde avec l'analyse (une nouvelle correspondance de colonnes ne le perd pas)", async () => {
    mocks.extractPdfLayoutText.mockResolvedValue(pdf({ skippedPages: 3 }));
    const preview = await analyseStockImport({ scope: SCOPE, fileName: "inventaire.pdf", bytes });
    expect(preview).toMatchObject({ incomplete: true, incompleteReason: "3 pages du fichier n'ont pas pu être lues", missing: [] });

    // Écrit à la création, puis conservé quand l'analyse remplace le contenu.
    expect(mocks.jobCreate.mock.calls[0][0].data.payload).toMatchObject({ incomplete: true, incompleteReason: "3 pages du fichier n'ont pas pu être lues" });
    const analysed = mocks.jobUpdate.mock.calls.at(-1)![0].data.payload as Json;
    expect(analysed).toMatchObject({ incomplete: true, incompleteReason: "3 pages du fichier n'ont pas pu être lues" });
    expect((analysed.warnings as string[]).length).toBeGreaterThan(0);

    mocks.jobFindUnique.mockResolvedValue({ id: "job_1", pharmacyId: "ph_1", status: "PENDING", payload: analysed });
    const remapped = await remapStockImport({ scope: SCOPE, jobId: "job_1", mapping: preview.mapping });
    expect(remapped).toMatchObject({ incomplete: true, incompleteReason: "3 pages du fichier n'ont pas pu être lues" });
  });

  it("un fichier lu en entier n'est pas « incomplet »", async () => {
    const preview = await analyseStockImport({ scope: SCOPE, fileName: "stock.csv", bytes: csvBytes });
    expect(preview.incomplete).toBe(false);
    expect(preview).not.toHaveProperty("incompleteReason");
  });

  it("des colonnes non reconnues : l'aperçu le dit aussi, avec le drapeau", async () => {
    const preview = await analyseStockImport({ scope: SCOPE, fileName: "patients.csv", bytes: new TextEncoder().encode("Nom;Prenom;Ville\nA;B;C\n") });
    expect(preview.missing.length).toBeGreaterThan(0);
    expect(preview.incomplete).toBe(false);
  });

  it("un fichier sans ligne exploitable est une erreur « de fichier »", async () => {
    const error = await analyseStockImport({ scope: SCOPE, fileName: "stock.csv", bytes: new TextEncoder().encode("Code produit;Désignation;Qte Stock\n") }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnreadableFileError);
    expect((error as Error).message).toBe("Le fichier ne contient aucune ligne exploitable.");
  });

  it("une panne pendant la classification : l'analyse n'est pas laissée « en attente » avec le fichier entier dedans, et l'erreur remonte", async () => {
    mocks.productFindMany.mockRejectedValue(new Error("base indisponible"));
    await expect(analyseStockImport({ scope: SCOPE, fileName: "stock.csv", bytes: csvBytes })).rejects.toThrow("base indisponible");
    expect(mocks.jobUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.jobUpdateMany).toHaveBeenCalledWith({ where: { id: "job_1", status: "PENDING" }, data: { status: "FAILED", finishedAt: expect.any(Date), payload: {} } });
  });

  it("si la fermeture de l'analyse échoue à son tour, c'est l'erreur d'origine qui remonte", async () => {
    mocks.productFindMany.mockRejectedValue(new Error("base indisponible"));
    mocks.jobUpdateMany.mockRejectedValue(new Error("encore la base"));
    await expect(analyseStockImport({ scope: SCOPE, fileName: "stock.csv", bytes: csvBytes })).rejects.toThrow("base indisponible");
  });

  it("une analyse qui réussit ne ferme rien", async () => {
    await analyseStockImport({ scope: SCOPE, fileName: "stock.csv", bytes: csvBytes });
    expect(mocks.jobUpdateMany).not.toHaveBeenCalled();
  });
});
