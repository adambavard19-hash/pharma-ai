import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  docCreate: vi.fn(),
  docFind: vi.fn(),
  docUpdate: vi.fn(),
  docDelete: vi.fn(),
  propFindMany: vi.fn(),
  propFind: vi.fn(),
  propUpdate: vi.fn(),
  propDeleteMany: vi.fn(),
  propCreateMany: vi.fn(),
  addRule: vi.fn(),
  addAssociation: vi.fn(),
  searchProducts: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    knowledgeDocument: { create: m.docCreate, findUnique: m.docFind, update: m.docUpdate, delete: m.docDelete },
    knowledgeProposal: { findMany: m.propFindMany, findUnique: m.propFind, update: m.propUpdate, deleteMany: m.propDeleteMany, createMany: m.propCreateMany },
    $transaction: async (operations: unknown[]) => Promise.all(operations),
  },
}));
vi.mock("@/server/audit/log", () => ({ recordAudit: m.audit }));
vi.mock("@/server/ai/knowledge-extractor", () => ({ extractFromDocument: vi.fn() }));
vi.mock("@/server/services/pdf-text", () => ({ extractPdfLayoutText: vi.fn(async () => ({ text: "", pages: 1, skippedPages: 0, totalPages: 1 })) }));
vi.mock("@/server/services/central-advice", () => ({ addCustomRule: m.addRule, addCentralAssociation: m.addAssociation, searchKnownProducts: m.searchProducts }));

const { depositDocument, analyseDocument, decideProposal, resolveProposalProduct, findProductByName, associationProblem, deleteDocument } = await import("../knowledge");
const { textFromFile } = await import("../knowledge-files");

const admin = { id: "adm1", fullName: "Donna" };
const DOC = "Sous antibiotique, la flore intestinale est perturbée : conseiller un probiotique comme Ergyphilus Intima pour protéger la flore.\nCoryzalia : proposer aussi un sirop pour la toux grasse chez l'adulte.";
const ruleItem = { type: "RULE", quote: "Sous antibiotique, la flore intestinale est perturbée : conseiller un probiotique", rule: { title: "Probiotique sous antibiotique", kind: "TOLERANCE", atc_prefixes: ["J01"], category: "PROBIOTIQUES", matching_tags: ["probiotique"], short_reason: "Sous {drug}, la flore peut être perturbée.", counter_script: "Avec cet antibiotique, prenez {product} pour protéger votre flore." } };
const assocItem = { type: "ASSOCIATION", quote: "Coryzalia : proposer aussi un sirop pour la toux grasse chez l'adulte.", association: { trigger_kind: "PRODUCT", trigger_name: "Coryzalia", advice_product_name: "sirop toux grasse" } };

beforeEach(() => {
  vi.clearAllMocks();
  m.docCreate.mockResolvedValue({ id: "doc1" });
  m.docFind.mockResolvedValue({ id: "doc1", title: "Fiche", note: null, textContent: DOC });
  m.propFindMany.mockResolvedValue([]);
});

describe("le dépôt d'un texte", () => {
  it("garde le texte, le fait lire, et enregistre les propositions vérifiées avec leur citation", async () => {
    const extract = vi.fn(async () => ({ ok: true as const, items: [ruleItem, assocItem], model: "m", parts: 1 }));
    const findProduct = vi.fn(async (name: string) => (name === "Coryzalia" ? { status: "FOUND" as const, ean: "3400000000011", name: "CORYZALIA, comprimés" } : { status: "NONE" as const }));
    const result = await depositDocument(admin, { kind: "TEXT", title: "Fiche", note: null, text: DOC }, { extract, findProduct });
    expect(result).toMatchObject({ ok: true, proposals: 2, discarded: 0, analysis: "ANALYSED" });
    expect(m.docCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: "Fiche", sourceType: "TEXT", textContent: DOC, createdByAdminId: "adm1" }) }));
    const rows = m.propCreateMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "RULE", sourceQuote: ruleItem.quote, problem: null });
    // Le produit conseillé n'a pas été retrouvé : l'association attend le choix de la pharmacienne.
    expect(rows[1]).toMatchObject({ kind: "ASSOCIATION", problem: expect.stringContaining("À compléter") });
    expect(rows[1].payload).toMatchObject({ triggerEan: "3400000000011" });
    expect(rows[1].payload).not.toHaveProperty("adviceEan");
  });

  it("écarte ce que le document ne contient pas : citation inventée, nom absent", async () => {
    const extract = async () => ({ ok: true as const, items: [{ ...ruleItem, quote: "Une phrase que le document ne contient jamais du tout." }, { ...assocItem, association: { ...assocItem.association, advice_product_name: "Humex Rhume" } }], model: "m", parts: 1 });
    const result = await depositDocument(admin, { kind: "TEXT", title: "Fiche", note: null, text: DOC }, { extract, findProduct: async () => ({ status: "NONE" }) });
    expect(result).toMatchObject({ ok: true, proposals: 0, discarded: 2 });
    expect(m.propCreateMany).not.toHaveBeenCalled();
  });

  it("garde le document et le dit quand le modèle n'a pas pu le lire", async () => {
    const result = await depositDocument(admin, { kind: "TEXT", title: "Fiche", note: null, text: DOC }, { extract: async () => ({ ok: false, error: "Le modèle n'est pas branché." }) });
    expect(result).toMatchObject({ ok: true, analysis: "FAILED", analysisError: "Le modèle n'est pas branché." });
    expect(m.docUpdate).toHaveBeenCalledWith({ where: { id: "doc1" }, data: { status: "FAILED", analysisError: "Le modèle n'est pas branché." } });
  });

  it("refuse un titre ou un texte trop courts", async () => {
    expect((await depositDocument(admin, { kind: "TEXT", title: "ab", note: null, text: DOC })).ok).toBe(false);
    expect((await depositDocument(admin, { kind: "TEXT", title: "Fiche", note: null, text: "court" })).ok).toBe(false);
    expect(m.docCreate).not.toHaveBeenCalled();
  });

  it("une relecture ne recrée pas ce qui est déjà tranché", async () => {
    m.propFindMany.mockResolvedValue([{ title: "Probiotique sous antibiotique" }]);
    const extract = async () => ({ ok: true as const, items: [ruleItem], model: "m", parts: 1 });
    const result = await analyseDocument(admin, "doc1", { extract });
    expect(result).toMatchObject({ ok: true, proposals: 0 });
    expect(m.propDeleteMany).toHaveBeenCalledWith({ where: { documentId: "doc1", status: "PENDING" } });
  });
});

describe("accepter ou refuser une proposition", () => {
  const rulePayload = { title: "Probiotique", kind: "TOLERANCE" };
  it("accepter un conseil le crée dans le centre de contrôle, au nom de la pharmacienne", async () => {
    m.propFind.mockResolvedValue({ id: "p1", kind: "RULE", title: "Probiotique", status: "PENDING", payload: rulePayload, problem: null });
    m.addRule.mockResolvedValue({ ok: true, ruleKey: "custom-abc", definition: {} });
    expect(await decideProposal(admin, "p1", "ACCEPT")).toEqual({ ok: true, title: "Probiotique", accepted: true });
    expect(m.addRule).toHaveBeenCalledWith(admin, rulePayload);
    expect(m.propUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: expect.objectContaining({ status: "ACCEPTED", resultRef: "custom-abc", decidedByAdminId: "adm1" }) });
  });

  it("refuser ne crée rien", async () => {
    m.propFind.mockResolvedValue({ id: "p1", kind: "RULE", title: "Probiotique", status: "PENDING", payload: rulePayload, problem: null });
    expect(await decideProposal(admin, "p1", "REJECT")).toMatchObject({ ok: true, accepted: false });
    expect(m.addRule).not.toHaveBeenCalled();
    expect(m.propUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: expect.objectContaining({ status: "REJECTED", resultRef: null }) });
  });

  it("une association dont un produit manque ne s'accepte pas", async () => {
    m.propFind.mockResolvedValue({ id: "p2", kind: "ASSOCIATION", title: "Coryzalia → sirop", status: "PENDING", payload: { triggerKind: "PRODUCT", triggerName: "Coryzalia", adviceName: "sirop", sentence: null, triggerEan: "3400000000011" }, problem: "x" });
    const result = await decideProposal(admin, "p2", "ACCEPT");
    expect(result.ok).toBe(false);
    expect(m.addAssociation).not.toHaveBeenCalled();
    expect(m.propUpdate).not.toHaveBeenCalled();
  });

  it("une association complète est créée avec les codes-barres retrouvés", async () => {
    m.propFind.mockResolvedValue({ id: "p2", kind: "ASSOCIATION", title: "Coryzalia → sirop", status: "PENDING", payload: { triggerKind: "PRODUCT", triggerName: "Coryzalia", adviceName: "sirop", sentence: "Un sirop pour la toux", triggerEan: "3400000000011", triggerResolvedName: "CORYZALIA", adviceEan: "3400000000022", adviceResolvedName: "SIROP TOUX" }, problem: null });
    m.addAssociation.mockResolvedValue({ ok: true, id: "assoc1" });
    await decideProposal(admin, "p2", "ACCEPT");
    expect(m.addAssociation).toHaveBeenCalledWith(admin, { trigger: { kind: "PRODUCT", ean: "3400000000011", name: "CORYZALIA" }, advice: { ean: "3400000000022", name: "SIROP TOUX" }, sentence: "Un sirop pour la toux" });
  });

  it("une proposition déjà tranchée ou un échec de création ne change rien", async () => {
    m.propFind.mockResolvedValue({ id: "p1", kind: "RULE", title: "T", status: "ACCEPTED", payload: {}, problem: null });
    expect((await decideProposal(admin, "p1", "ACCEPT")).ok).toBe(false);
    m.propFind.mockResolvedValue({ id: "p1", kind: "RULE", title: "T", status: "PENDING", payload: {}, problem: null });
    m.addRule.mockResolvedValue({ ok: false, error: "La raison est trop longue." });
    expect(await decideProposal(admin, "p1", "ACCEPT")).toEqual({ ok: false, error: "La raison est trop longue." });
    expect(m.propUpdate).not.toHaveBeenCalled();
  });

  it("la pharmacienne peut choisir elle-même le produit que le logiciel n'a pas retrouvé", async () => {
    m.propFind.mockResolvedValue({ kind: "ASSOCIATION", status: "PENDING", payload: { triggerKind: "MEDICINE", triggerName: "Amoxicilline", adviceName: "probiotique", sentence: null } });
    expect(await resolveProposalProduct(admin, "p3", "advice", { ean: "3400000000033", name: "ERGYPHILUS" })).toEqual({ ok: true });
    expect(m.propUpdate).toHaveBeenCalledWith({ where: { id: "p3" }, data: { payload: expect.objectContaining({ adviceEan: "3400000000033" }), problem: null } });
    expect((await resolveProposalProduct(admin, "p3", "advice", { ean: "abc", name: "X" })).ok).toBe(false);
  });
});

describe("retrouver un produit nommé par le document", () => {
  it("un seul résultat sûr, sinon rien", async () => {
    m.searchProducts.mockResolvedValue([{ ean: "1", name: "ERGYPHILUS INTIMA 30 gélules", brand: "Nutergia" }, { ean: "2", name: "ERGYPHILUS CONFORT", brand: "Nutergia" }]);
    expect(await findProductByName("Ergyphilus Intima")).toEqual({ status: "FOUND", ean: "1", name: "ERGYPHILUS INTIMA 30 gélules" });
    expect(await findProductByName("Ergyphilus")).toEqual({ status: "AMBIGUOUS", count: 2 });
    expect(await findProductByName("Ergyphilus Absent")).toEqual({ status: "NONE" });
    expect(await findProductByName("a")).toEqual({ status: "NONE" });
  });
  it("dit ce qui manque pour une association", () => {
    expect(associationProblem({ triggerKind: "MEDICINE", triggerName: "A", adviceName: "B", sentence: null })).toContain("« B »");
    expect(associationProblem({ triggerKind: "MEDICINE", triggerName: "A", adviceName: "B", sentence: null, adviceEan: "123456789" })).toBeNull();
  });
});

describe("la suppression", () => {
  it("supprime le document, pas ce qui a déjà été accepté", async () => {
    m.docFind.mockResolvedValue({ title: "Fiche" });
    expect(await deleteDocument(admin, "doc1")).toEqual({ ok: true, title: "Fiche" });
    expect(m.docDelete).toHaveBeenCalledWith({ where: { id: "doc1" } });
    expect(m.addRule).not.toHaveBeenCalled();
  });
});

describe("le texte d'un fichier", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);
  it("lit un texte, un CSV, avec ou sans BOM", async () => {
    expect(await textFromFile("liste.txt", bytes("﻿" + DOC))).toMatchObject({ ok: true, text: DOC, truncated: false });
    expect((await textFromFile("liste.csv", bytes("médicament;produit\nAmoxicilline;Ergyphilus Intima pour la flore intestinale"))).ok).toBe(true);
  });
  it("lit un fichier Excel feuille par feuille", async () => {
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Médicament", "Produit conseillé"], ["Amoxicilline", "Ergyphilus Intima, probiotique pour la flore"]]), "Associations");
    const file = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const read = await textFromFile("associations.xlsx", new Uint8Array(file));
    expect(read.ok && read.text).toContain("## Associations");
    expect(read.ok && read.text).toContain("Amoxicilline,\"Ergyphilus Intima");
  });
  it("explique ce qu'il ne lit pas : Word, image, PDF scanné, fichier vide ou trop gros", async () => {
    expect(await textFromFile("note.docx", bytes("x"))).toMatchObject({ ok: false, error: expect.stringContaining("PDF") });
    expect(await textFromFile("photo.png", bytes("x"))).toMatchObject({ ok: false, error: expect.stringContaining("Format non pris en charge") });
    expect(await textFromFile("scan.pdf", bytes("%PDF"))).toMatchObject({ ok: false, error: expect.stringContaining("pas de texte lisible") });
    expect(await textFromFile("vide.txt", new Uint8Array())).toMatchObject({ ok: false });
    expect(await textFromFile("gros.txt", new Uint8Array(9 * 1024 * 1024))).toMatchObject({ ok: false, error: expect.stringContaining("8 Mo") });
  });
  it("tronque un très long texte et le dit", async () => {
    const long = await textFromFile("long.txt", bytes("Une phrase complète du document. ".repeat(6000)));
    expect(long).toMatchObject({ ok: true, truncated: true });
  });
});
