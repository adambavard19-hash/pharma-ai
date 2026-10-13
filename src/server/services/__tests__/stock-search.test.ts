import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";

/**
 * La recherche dans ce que l'officine détient (ses produits, les médicaments de son stock) et dans le catalogue national :
 * la base fait un tri large, borné à l'officine de la session ; le classement fin ne garde que ce qui contient chaque mot.
 */

const m = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  product: { findMany: vi.fn() },
  drugPresentation: { findFirst: vi.fn(), findMany: vi.fn() },
  drugPrescriptionCondition: { findMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { $queryRaw: m.queryRaw, product: m.product, drugPresentation: m.drugPresentation, drugPrescriptionCondition: m.drugPrescriptionCondition } }));

const { liveQuery, searchAssociationAdvice, searchAssociationTriggers, searchCatalogDrugs, searchPharmacyProducts, searchStockDrugs } = await import("../stock-search");
const { parseSearchQuery } = await import("@/core/search/tolerant-search");

/** La requête SQL telle que la base la reçoit : le texte, avec ses paramètres liés. */
function sqlOf(call: unknown[]): Prisma.Sql {
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  return Prisma.sql(strings, ...values);
}

/** Les motifs du premier tri : UN paramètre lié (un tableau), jamais du texte SQL assemblé. */
function patternsOf(sql: Prisma.Sql): string[] {
  const arrays = sql.values.filter((value): value is string[] => Array.isArray(value));
  expect(arrays).toHaveLength(1);
  expect(sql.text).toMatch(/\$\d+::text\[\]/);
  return arrays[0];
}

/** L'officine est un paramètre lié, comparé à la colonne `pharmacyId` — jamais une valeur venue du client. */
function expectBoundTo(sql: Prisma.Sql, column: string, pharmacyId: string) {
  const index = sql.values.indexOf(pharmacyId);
  expect(index).toBeGreaterThanOrEqual(0);
  expect(sql.text).toContain(`${column} = $${index + 1}`);
}

const productRow = (id: string, name: string, quantity = 5, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  brand: null,
  category: "SOINS",
  reference: `REF-${id}`,
  ean: null,
  imageUrl: null,
  salePriceCents: 990,
  commercialClaims: [],
  stockItem: { quantity, alertThreshold: 2 },
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.queryRaw.mockResolvedValue([]);
  m.product.findMany.mockResolvedValue([]);
  m.drugPresentation.findMany.mockResolvedValue([]);
  m.drugPresentation.findFirst.mockResolvedValue(null);
  m.drugPrescriptionCondition.findMany.mockResolvedValue([]);
});

describe("les médicaments du stock de l'officine", () => {
  const stockRow = (specialtyId: string, name: string, label: string, quantity: number, substances = "CÉTIRIZINE (DICHLORHYDRATE DE)") => ({
    specialtyId,
    name,
    marketingStatus: "Commercialisée",
    label,
    cip13: `3400${specialtyId.padStart(9, "0")}`,
    cip7: "1234567",
    quantity,
    substances,
  });

  it("le constat d'origine : « cétirizine 10 mg boîte de 15 » remonte la boîte en stock, la meilleure d'abord", async () => {
    m.queryRaw.mockResolvedValue([
      stockRow("sp_gouttes", "CETIRIZINE BIOGARAN 10 mg/ml, solution buvable en gouttes", "1 flacon(s) en verre brun de 15 ml", 1),
      stockRow("sp_zentiva", "CETIRIZINE ZENTIVA 10 mg, comprimé pelliculé sécable", "plaquette(s) thermoformée(s) PVC PVDC aluminium de 15 comprimé(s)", 16),
      // Le tri large de la base peut ramener plus : le classement fin écarte ce qui ne contient pas chaque mot.
      stockRow("sp_levo", "LEVOCETIRIZINE VIATRIS 5 mg, comprimé pelliculé", "plaquette(s) de 14 comprimé(s)", 2, "LÉVOCÉTIRIZINE"),
      stockRow("sp_viatris", "CETIRIZINE VIATRIS CONSEIL 10 mg, comprimé pelliculé sécable", "plaquette(s) de 7 comprimé(s)", 37),
    ]);
    const hits = await searchStockDrugs("ph_1", parseSearchQuery("cétirizine 10 mg boîte de 15"));
    expect(hits.map((hit) => [hit.name.split(",")[0], hit.quantity])).toEqual([
      ["CETIRIZINE ZENTIVA 10 mg", 16],
      ["CETIRIZINE BIOGARAN 10 mg/ml", 1],
    ]);
    const sql = sqlOf(m.queryRaw.mock.calls[0]);
    expectBoundTo(sql, 's."pharmacyId"', "ph_1");
    // Chaque mot significatif est un motif, et il les faut tous ; « boîte » et « de » n'en sont pas.
    const patterns = patternsOf(sql);
    expect(patterns).toHaveLength(3);
    expect(patterns.some((pattern) => /BO.?TE|^D/i.test(pattern))).toBe(false);
    expect(sql.text).toContain('HAVING count(DISTINCT "ord") = $');
    expect(sql.values).toContain(3);
  });

  it("une spécialité détenue en plusieurs boîtes : une seule ligne, le total de ce qui répond, le conditionnement cherché", async () => {
    const rows = [
      stockRow("sp_1", "CETIRIZINE ZENTIVA 10 mg, comprimé pelliculé sécable", "plaquette(s) de 7 comprimé(s)", 4),
      stockRow("sp_1", "CETIRIZINE ZENTIVA 10 mg, comprimé pelliculé sécable", "plaquette(s) de 15 comprimé(s)", 16),
    ];
    m.queryRaw.mockResolvedValue(rows);
    const all = await searchStockDrugs("ph_1", parseSearchQuery("cetirizine zentiva"));
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ specialtyId: "sp_1", quantity: 20 });
    const box = await searchStockDrugs("ph_1", parseSearchQuery("cetirizine boite de 15"));
    expect(box[0]).toMatchObject({ specialtyId: "sp_1", quantity: 16, label: "plaquette(s) de 15 comprimé(s)" });
  });

  it("trouve une marque par sa substance, et un médicament par son code CIP", async () => {
    m.queryRaw.mockResolvedValue([stockRow("sp_z", "ZYRTEC 10 mg/ml, solution buvable en gouttes", "1 flacon(s) de 15 ml", 1)]);
    expect((await searchStockDrugs("ph_1", parseSearchQuery("cétirizine"))).map((hit) => hit.name)).toEqual(["ZYRTEC 10 mg/ml, solution buvable en gouttes"]);
    const row = stockRow("sp_c", "CORYZALIA, comprimé orodispersible", "plaquette(s) de 40 comprimé(s)", 2);
    m.queryRaw.mockResolvedValue([row]);
    expect(await searchStockDrugs("ph_1", parseSearchQuery(row.cip13))).toHaveLength(1);
  });

  it("rien à chercher : aucune requête", async () => {
    expect(await searchStockDrugs("ph_1", parseSearchQuery("boîte de"))).toEqual([]);
    expect(m.queryRaw).not.toHaveBeenCalled();
  });
});

describe("les produits de l'officine (écran de vente et « Mes associations »)", () => {
  it("bornée à l'officine, sans les supprimés ni les désactivés ; ne garde que ce qui contient chaque mot", async () => {
    m.queryRaw.mockResolvedValue([
      { id: "p1", name: "NEUTROGENA CR MAIN CONF/HYD", brand: "Neutrogena", reference: "R1", ean: null, tags: [], quantity: 5 },
      { id: "p2", name: "NEUTROGENA CR PIED", brand: "Neutrogena", reference: "R2", ean: null, tags: [], quantity: 5 },
    ]);
    m.product.findMany.mockResolvedValue([productRow("p1", "NEUTROGENA CR MAIN CONF/HYD")]);
    const hits = await searchPharmacyProducts("ph_1", "crème mains");
    expect(hits.map((hit) => hit.id)).toEqual(["p1"]);
    const sql = sqlOf(m.queryRaw.mock.calls[0]);
    expectBoundTo(sql, 'p."pharmacyId"', "ph_1");
    expect(sql.text).toContain('p."deletedAt" IS NULL');
    expect(sql.text).toContain('p."isActive" = true');
    // Le filtre : un motif par mot, tous exigés, en UN paramètre lié. Les deux autres tableaux ne font que ranger.
    const filter = sql.text.match(/WHERE[\s\S]*t\."text" ~\* ALL\(\$(\d+)::text\[\]\)[\s\S]*ORDER BY/);
    expect(filter).not.toBeNull();
    expect(sql.values[Number(filter?.[1]) - 1]).toHaveLength(2);
    expect(sql.values.filter((value) => Array.isArray(value))).toHaveLength(3);
    // Le chargement complet reste borné à l'officine, même avec des identifiants venus du tri.
    expect(m.product.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_1", id: { in: ["p1"] } });
  });

  it("un mot collé dans le libellé du logiciel se trouve aussi, classé après : « biafine » → « CICABIAFINE … »", async () => {
    m.queryRaw.mockResolvedValue([
      { id: "p_cica", name: "CICABIAFINE BAUME CREVASSES", brand: null, reference: "LGP-0001", ean: null, tags: [], quantity: 4 },
      { id: "p_bia", name: "BIAFINE EMULSION TUBE 186G", brand: null, reference: "LGP-0002", ean: null, tags: [], quantity: 2 },
      // Le tri large de la base ramène aussi ce qui n'a pas le mot : il reste écarté.
      { id: "p_autre", name: "BEPANTHEN BAUME", brand: null, reference: "LGP-0003", ean: null, tags: [], quantity: 9 },
    ]);
    m.product.findMany.mockResolvedValue([productRow("p_cica", "CICABIAFINE BAUME CREVASSES", 4), productRow("p_bia", "BIAFINE EMULSION TUBE 186G", 2)]);
    const hits = await searchPharmacyProducts("ph_1", "biafine");
    expect(hits.map((hit) => hit.id)).toEqual(["p_bia", "p_cica"]);
    // La base range d'abord ce qui a chaque mot au début d'un mot, puis ce qui l'a dans le nom : la limite ne coupe pas les vraies réponses.
    const sql = sqlOf(m.queryRaw.mock.calls[0]);
    expect(sql.text).toMatch(/ORDER BY[\s\S]*t\."text" ~\* ALL\(\$\d+::text\[\]\)\) DESC,[\s\S]*p\."name" ~\* ALL\(\$\d+::text\[\]\)\) DESC/);
  });

  it("garde son contrat de réponse : stock, statut, prix, allégations", async () => {
    m.queryRaw.mockResolvedValue([{ id: "p1", name: "Sirop au miel", brand: null, reference: "R1", ean: null, tags: [], quantity: 1 }]);
    m.product.findMany.mockResolvedValue([productRow("p1", "Sirop au miel", 1, { commercialClaims: ["Adoucit la gorge"] })]);
    const [hit] = await searchPharmacyProducts("ph_1", "sirop");
    expect(hit).toMatchObject({ id: "p1", name: "Sirop au miel", quantity: 1, status: "LOW_STOCK", salePriceCents: 990, claims: ["Adoucit la gorge"], reference: "REF-p1" });
  });

  it("un code lu à la douchette qui désigne un produit ne rend que lui (EAN, code appris, référence)", async () => {
    m.product.findMany.mockResolvedValueOnce([productRow("p_ean", "Spray nasal", 3, { ean: "3401234567890" })]);
    const hits = await searchPharmacyProducts("ph_1", "3401234567890");
    expect(hits.map((hit) => hit.id)).toEqual(["p_ean"]);
    expect(m.product.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_1", deletedAt: null, isActive: true });
    expect(m.product.findMany.mock.calls[0][0].where.OR).toContainEqual({ barcodes: { some: { pharmacyId: "ph_1", code: "3401234567890" } } });
    expect(m.queryRaw).not.toHaveBeenCalled();
  });

  it("sans mot : les premiers par ordre alphabétique ; une catégorie inconnue ne rend rien (et n'atteint pas la base)", async () => {
    m.product.findMany.mockResolvedValue([productRow("p1", "Baume")]);
    expect(await searchPharmacyProducts("ph_1", "")).toHaveLength(1);
    expect(m.product.findMany.mock.calls[0][0]).toMatchObject({ where: { pharmacyId: "ph_1", deletedAt: null, isActive: true }, orderBy: { name: "asc" } });
    m.product.findMany.mockClear();
    expect(await searchPharmacyProducts("ph_1", "baume", { category: "'; DROP" })).toEqual([]);
    expect(m.product.findMany).not.toHaveBeenCalled();
    expect(m.queryRaw).not.toHaveBeenCalled();
  });
});

describe("le catalogue national", () => {
  it("un nombre seul (« boîte de 15 ») se vérifie sur les conditionnements, pas dans le nom", async () => {
    m.queryRaw.mockResolvedValue([
      { id: "sp_eg", name: "CETIRIZINE EG 10 mg, comprimé pelliculé sécable", marketingStatus: "Commercialisée", substances: null },
      { id: "sp_7", name: "CETIRIZINE SEPT 10 mg, comprimé pelliculé sécable", marketingStatus: "Commercialisée", substances: null },
    ]);
    m.drugPresentation.findMany.mockResolvedValue([
      { specialtyId: "sp_eg", label: "plaquette(s) de 15 comprimé(s)" },
      { specialtyId: "sp_7", label: "plaquette(s) de 7 comprimé(s)" },
    ]);
    const hits = await searchCatalogDrugs(parseSearchQuery("cétirizine 10 mg boîte de 15"));
    expect(hits.map((hit) => hit.specialtyId)).toEqual(["sp_eg"]);
    const sql = sqlOf(m.queryRaw.mock.calls[0]);
    expect(sql.text).toContain('sp."withdrawnAt" IS NULL');
    // « 15 » n'est pas exigé dans le nom par la base : seulement « cétirizine » et « 10 mg ».
    expect(patternsOf(sql)).toHaveLength(2);
    expect(patternsOf(sql).some((pattern) => pattern.includes("15"))).toBe(false);
  });

  it("un code CIP désigne sa spécialité", async () => {
    m.drugPresentation.findFirst.mockResolvedValue({ label: "plaquette(s) de 40 comprimé(s)", specialty: { id: "sp_c", name: "CORYZALIA, comprimé orodispersible", marketingStatus: "Commercialisée", withdrawnAt: null } });
    expect((await searchCatalogDrugs(parseSearchQuery("3400922468860"))).map((hit) => hit.specialtyId)).toEqual(["sp_c"]);
  });
});

describe("le déclencheur d'une association : un champ, trois sources", () => {
  it("groupe « Dans mon stock » (médicaments et produits mêlés) et « Autres médicaments », sans répéter un médicament détenu", async () => {
    m.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      if (text.includes('FROM "pharmacy_drug_stocks"'))
        return [{ specialtyId: "sp_z", name: "CETIRIZINE ZENTIVA 10 mg, comprimé pelliculé sécable", marketingStatus: "Commercialisée", label: "plaquette(s) de 15 comprimé(s)", cip13: "3400000000001", cip7: "1000001", quantity: 16, substances: null }];
      if (text.includes('FROM "products"')) return [{ id: "p1", name: "CETIRIZINE BIOGARAN 10MG CPR B/15", brand: null, reference: "R1", ean: null, tags: [], quantity: 3 }];
      return [
        // La même spécialité sous une autre forme : l'association vaut pour toutes ses formes, elle n'est pas reproposée.
        { id: "sp_z2", name: "CETIRIZINE ZENTIVA 10 mg, comprimé à sucer", marketingStatus: "Commercialisée", substances: null },
        { id: "sp_eg", name: "CETIRIZINE EG 10 mg, comprimé pelliculé sécable", marketingStatus: "Commercialisée", substances: null },
        { id: "sp_eg_bis", name: "CETIRIZINE EG 10 mg, comprimé pelliculé sécable", marketingStatus: "Commercialisée", substances: null },
      ];
    });
    m.product.findMany.mockResolvedValue([productRow("p1", "CETIRIZINE BIOGARAN 10MG CPR B/15", 3)]);
    m.drugPresentation.findMany.mockResolvedValue([
      { specialtyId: "sp_z2", label: "plaquette(s) de 15 comprimé(s)" },
      { specialtyId: "sp_eg", label: "plaquette(s) de 15 comprimé(s)" },
      { specialtyId: "sp_eg_bis", label: "plaquette(s) de 15 comprimé(s)" },
    ]);
    const result = await searchAssociationTriggers("ph_1", "cétirizine 10 mg boîte de 15");
    // Tous les mots dans le NOM (le libellé du logiciel) passent avant des mots trouvés dans le conditionnement.
    expect(result.stock.map((option) => [option.kind, option.kind === "DRUG" ? option.specialtyId : option.productId, option.quantity])).toEqual([
      ["PRODUCT", "p1", 3],
      ["DRUG", "sp_z", 16],
    ]);
    expect(result.catalogue.map((option) => (option.kind === "DRUG" ? option.specialtyId : option.productId))).toEqual(["sp_eg"]);
    // Les deux recherches dans le stock sont bornées à l'officine de la session.
    for (const call of m.queryRaw.mock.calls) {
      const sql = sqlOf(call);
      if (sql.text.includes('FROM "pharmacy_drug_stocks"')) expectBoundTo(sql, 's."pharmacyId"', "ph_1");
      if (sql.text.includes('FROM "products"')) expectBoundTo(sql, 'p."pharmacyId"', "ph_1");
    }
  });

  /** La base simulée : le stock trouvé, ce que le stock contient parmi le catalogue (`split_part`), le catalogue. */
  const triggerBase = (found: unknown[], held: unknown[], catalogue: unknown[]) =>
    m.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      if (text.includes("split_part")) return held;
      if (text.includes('FROM "pharmacy_drug_stocks"')) return found;
      if (text.includes('FROM "products"')) return [];
      return catalogue;
    });
  const specialty = (id: string, name: string) => ({ id, name, marketingStatus: "Commercialisée", substances: null });

  it("un médicament détenu au-delà des douze affichés ne retombe jamais dans « Autres médicaments »", async () => {
    const held = Array.from({ length: 14 }, (_, index) => ({
      specialtyId: `sp_${index + 1}`,
      name: `DOLIPRANE ${(index + 1) * 100} mg, comprimé`,
      marketingStatus: "Commercialisée",
      label: "plaquette(s) de 8 comprimé(s)",
      cip13: `34000000000${String(index).padStart(2, "0")}`,
      cip7: "1000001",
      quantity: 3,
      substances: "PARACÉTAMOL",
    }));
    // Le catalogue rend les 13e et 14e (détenus, non affichés) et un médicament que l'officine n'a pas.
    triggerBase(held, [], [specialty("sp_13", held[12].name), specialty("sp_14", held[13].name), specialty("sp_liquiz", "DOLIPRANE LIQUIZ 300 mg, suspension buvable en sachet")]);
    const result = await searchAssociationTriggers("ph_1", "doliprane");
    expect(result.stock).toHaveLength(12);
    expect(result.stock.map((option) => (option.kind === "DRUG" ? option.specialtyId : null))).not.toContain("sp_13");
    expect(result.catalogue.map((option) => (option.kind === "DRUG" ? option.specialtyId : null))).toEqual(["sp_liquiz"]);
  });

  it("un médicament du catalogue que l'officine détient (autre boîte, autre forme) passe dans « Dans mon stock », avec sa quantité", async () => {
    // « boîte de 15 » : l'officine n'a que la boîte de 30 — la recherche dans le stock ne la rend pas, le catalogue si.
    triggerBase(
      [],
      [
        { specialtyId: "sp_eg", name: "CETIRIZINE EG 10 mg, comprimé pelliculé sécable", marketingStatus: "Commercialisée", label: "plaquette(s) de 30 comprimé(s)", quantity: 7 },
        // Une autre forme du même médicament (même nom sans la forme) : l'association vaut pour elle aussi.
        { specialtyId: "sp_bio_sucer", name: "CETIRIZINE BIOGARAN 10 mg, comprimé à sucer", marketingStatus: "Commercialisée", label: "plaquette(s) de 30 comprimé(s)", quantity: 2 },
        // Une ligne qui ne correspond à aucune spécialité demandée n'est pas reprise.
        { specialtyId: "sp_autre", name: "ZYRTEC 10 mg, comprimé", marketingStatus: "Commercialisée", label: "plaquette(s) de 7 comprimé(s)", quantity: 1 },
      ],
      [
        specialty("sp_eg", "CETIRIZINE EG 10 mg, comprimé pelliculé sécable"),
        specialty("sp_bio", "CETIRIZINE BIOGARAN 10 mg, comprimé pelliculé sécable"),
        specialty("sp_sept", "CETIRIZINE SEPT 10 mg, comprimé pelliculé sécable"),
      ],
    );
    m.drugPresentation.findMany.mockResolvedValue(["sp_eg", "sp_bio", "sp_sept"].map((specialtyId) => ({ specialtyId, label: "plaquette(s) de 15 comprimé(s)" })));
    const result = await searchAssociationTriggers("ph_1", "cétirizine 10 mg boîte de 15");
    const stock = result.stock.map((option) => (option.kind === "DRUG" ? [option.specialtyId, option.quantity, option.label] : null));
    expect(stock).toHaveLength(2);
    expect(stock).toEqual(expect.arrayContaining([
      ["sp_eg", 7, "plaquette(s) de 30 comprimé(s)"],
      ["sp_bio_sucer", 2, "plaquette(s) de 30 comprimé(s)"],
    ]));
    expect(result.catalogue.map((option) => (option.kind === "DRUG" ? [option.specialtyId, option.quantity] : null))).toEqual([["sp_sept", null]]);
    // Ce contrôle lit le stock de l'officine de la session, rien d'autre.
    const check = m.queryRaw.mock.calls.map((call) => sqlOf(call)).find((sql) => sql.text.includes("split_part"));
    expect(check).toBeDefined();
    expectBoundTo(check as Prisma.Sql, 's."pharmacyId"', "ph_1");
  });

  it("deux officines, deux réponses : chacune ne voit que son stock", async () => {
    await searchAssociationTriggers("ph_A", "cetirizine");
    await searchAssociationTriggers("ph_B", "cetirizine");
    const bound = m.queryRaw.mock.calls.map((call) => sqlOf(call)).filter((sql) => sql.text.includes('"pharmacyId" = $'));
    expect(bound.filter((sql) => sql.values.includes("ph_A"))).toHaveLength(2);
    expect(bound.filter((sql) => sql.values.includes("ph_B"))).toHaveLength(2);
    expect(bound.every((sql) => !(sql.values.includes("ph_A") && sql.values.includes("ph_B")))).toBe(true);
  });
});

describe("« Mes associations » propose dès la première lettre", () => {
  it("une ou deux lettres, même un mot vide (« d », « la ») : le début d'un nom ; la lettre en cours de frappe ne vide pas la liste", () => {
    expect(liveQuery("d").prefix?.text).toBe("D");
    expect(liveQuery("Do").prefix?.text).toBe("DO");
    expect(liveQuery("la").prefix?.text).toBe("LA");
    expect(liveQuery("dol").prefix).toBeNull();
    expect(liveQuery("creme m").query.terms.map((term) => term.text)).toEqual(["CREME"]);
    expect(liveQuery("doliprane 1").query.terms.map((term) => term.text)).toEqual(["DOLIPRANE"]);
    expect(liveQuery("doliprane 1000").query.terms.map((term) => term.text)).toEqual(["DOLIPRANE", "1000"]);
  });

  /** La base simulée en mode « première lettre » : médicaments détenus, produits, catalogue national. */
  const prefixBase = (drugs: unknown[], productIds: string[], catalogue: unknown[]) =>
    m.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      if (text.includes("split_part")) return [];
      if (text.includes('FROM "pharmacy_drug_stocks"')) return drugs;
      if (text.includes('FROM "products"')) return productIds.map((id) => ({ id }));
      return catalogue;
    });

  it("« d » : ce qui est en stock d'abord (médicaments et produits mêlés), puis les ruptures ; requêtes bornées à l'officine", async () => {
    prefixBase(
      [
        { specialtyId: "sp_dafa", name: "DAFALGAN 1 g, comprimé", marketingStatus: "Commercialisée", label: "boîte de 8", quantity: 0 },
        { specialtyId: "sp_doli", name: "DOLIPRANE 1000 mg, gélule", marketingStatus: "Commercialisée", label: "boîte de 8", quantity: 414 },
      ],
      ["p_dent"],
      [{ id: "sp_dex", name: "DEXERYL, crème", marketingStatus: "Commercialisée" }],
    );
    m.product.findMany.mockResolvedValue([productRow("p_dent", "Dentifrice dents sensibles", 55)]);
    const result = await searchAssociationTriggers("ph_1", "d");
    expect(result.stock.map((option) => (option.kind === "DRUG" ? option.specialtyId : option.productId))).toEqual(["p_dent", "sp_doli", "sp_dafa"]);
    expect(result.catalogue.map((option) => (option.kind === "DRUG" ? option.specialtyId : null))).toEqual(["sp_dex"]);
    const sqls = m.queryRaw.mock.calls.map((call) => sqlOf(call));
    const drugSql = sqls.find((sql) => sql.text.includes('FROM "pharmacy_drug_stocks"') && !sql.text.includes("split_part")) as Prisma.Sql;
    const productSql = sqls.find((sql) => sql.text.includes('FROM "products"')) as Prisma.Sql;
    expectBoundTo(drugSql, 's."pharmacyId"', "ph_1");
    expectBoundTo(productSql, 'p."pharmacyId"', "ph_1");
    // La lettre tapée n'entre jamais dans le texte SQL : un motif « commence par », passé en paramètre lié.
    expect(productSql.values).toContain("^D");
    expect(productSql.text).not.toContain("'D");
    // Le catalogue national ne dépend d'aucune officine.
    const catalogSql = sqls.find((sql) => sql.text.includes('FROM "drug_specialties" sp') && !sql.text.includes("pharmacy_drug_stocks")) as Prisma.Sql;
    expect(catalogSql.values).not.toContain("ph_1");
  });

  it("« PharmaBoost propose » : produits et médicaments SANS ordonnance du stock, en stock d'abord, les ruptures à part", async () => {
    m.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      if (text.includes('FROM "pharmacy_drug_stocks"'))
        return [
          { specialtyId: "sp_cet", name: "CETIRIZINE VIATRIS CONSEIL 10 mg, comprimé", marketingStatus: "Commercialisée", label: "boîte de 7", cip13: "1", cip7: "1", quantity: 37, substances: "CÉTIRIZINE" },
          { specialtyId: "sp_amox", name: "CETIRAMOX 1 g, comprimé", marketingStatus: "Commercialisée", label: "boîte de 6", cip13: "2", cip7: "2", quantity: 9, substances: null },
        ];
      if (text.includes('FROM "products"')) return [{ id: "p_spray", name: "CETISPRAY NEZ", brand: null, reference: "R", ean: null, tags: [], quantity: 0 }];
      return [];
    });
    m.product.findMany.mockResolvedValue([productRow("p_spray", "CETISPRAY NEZ", 0)]);
    // CETIRAMOX est soumis à prescription : il n'est jamais proposé.
    m.drugPrescriptionCondition.findMany.mockResolvedValue([{ specialtyId: "sp_amox" }]);
    const result = await searchAssociationAdvice("ph_1", "ceti");
    expect(result.stock.map((option) => [option.kind, option.id])).toEqual([["DRUG", "sp_cet"]]);
    expect(result.empty.map((option) => [option.kind, option.id])).toEqual([["PRODUCT", "p_spray"]]);
    for (const sql of m.queryRaw.mock.calls.map((call) => sqlOf(call))) {
      if (sql.text.includes('FROM "pharmacy_drug_stocks"')) expectBoundTo(sql, 's."pharmacyId"', "ph_1");
      if (sql.text.includes('FROM "products"')) expectBoundTo(sql, 'p."pharmacyId"', "ph_1");
    }
  });

  it("en mode « première lettre », les médicaments sur ordonnance sont écartés par la base elle-même", async () => {
    await searchAssociationAdvice("ph_1", "d");
    const drugSql = m.queryRaw.mock.calls.map((call) => sqlOf(call)).find((sql) => sql.text.includes('FROM "pharmacy_drug_stocks"')) as Prisma.Sql;
    expect(drugSql.text).toContain('NOT EXISTS (SELECT 1 FROM "drug_prescription_conditions"');
    expect(drugSql.values).toContain(true);
  });
});
