import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prescriptionFindFirst: vi.fn(),
  recommendationFindFirst: vi.fn(),
  recommendationFindMany: vi.fn(),
  recommendationUpdate: vi.fn(),
  recommendationUpdateMany: vi.fn(),
  recommendationCount: vi.fn(),
  eventCreate: vi.fn(),
  eventCreateMany: vi.fn(),
  followUpUpsert: vi.fn(),
  followUpUpdateMany: vi.fn(),
  followUpTxUpdate: vi.fn(),
  followUpFindUnique: vi.fn(),
  followUpUpdate: vi.fn(),
  pharmacyFindUnique: vi.fn(),
  readNotice: vi.fn(),
  sendEmail: vi.fn(),
  audit: vi.fn(),
  trace: vi.fn(),
  validated: vi.fn(),
  centralRows: vi.fn(),
  lineFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    prescription: { findFirst: m.prescriptionFindFirst },
    recommendation: { findFirst: m.recommendationFindFirst, findMany: m.recommendationFindMany, update: m.recommendationUpdate, updateMany: m.recommendationUpdateMany, count: m.recommendationCount },
    recommendationEvent: { create: m.eventCreate, createMany: m.eventCreateMany },
    counterSaleFollowUp: { upsert: m.followUpUpsert, findUnique: m.followUpFindUnique, update: m.followUpUpdate, updateMany: m.followUpUpdateMany },
    pharmacy: { findUnique: m.pharmacyFindUnique },
    prescriptionLine: { findMany: m.lineFindMany },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        recommendation: { update: m.recommendationUpdate, findMany: m.recommendationFindMany, updateMany: m.recommendationUpdateMany },
        recommendationEvent: { create: m.eventCreate, createMany: m.eventCreateMany },
        counterSaleFollowUp: { upsert: m.followUpUpsert, update: m.followUpTxUpdate },
      }),
  },
}));
vi.mock("@/server/audit/log", () => ({ recordAudit: m.audit }));
vi.mock("@/server/security/encryption", () => ({ encryptField: (value: string) => `enc:${value}`, decryptField: (value: string | null) => (value ? value.replace(/^enc:/, "") : null) }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ info: { id: "test" }, sendEmail: m.sendEmail }) }));
vi.mock("@/server/services/patient-cards", () => ({ patientCardsFor: async (_s: unknown, targets: unknown[]) => targets.map(() => null) }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: m.trace }));
vi.mock("@/server/services/central-advice", () => ({ validatedRuleKeys: m.validated, loadCentralRuleRows: m.centralRows }));
vi.mock("@/server/services/counter-notice", () => ({ readCounterNotice: m.readNotice }));
vi.mock("@/server/services/challenges", () => ({ activeChallengeTitlesFor: vi.fn(async () => new Map([["prod1", "Challenge Avène"]])) }));
vi.mock("@/server/services/stock-lots", () => ({ nearestShortDatesFor: vi.fn(async () => new Map([["p:prod1", { expiresOn: "2026-11-30" }]])) }));

import { counterEmailPurgeWhere, decideCounterAdvice, finishCounterSale, purgeCounterEmails, saveCounterEmail } from "../counter-window";
import { COUNTER_EMAIL_MAX_HOURS, COUNTER_EMAIL_PURGE_AFTER_HOURS, DAILY_PASS_MAX_GAP_HOURS } from "@/core/counter/email-retention";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { editValuesOf } from "@/core/ai/central-advice-edit";
import { PRODUCT_CATEGORIES } from "@/config/catalog";
import { ADVICE_VOCABULARY } from "@/core/catalog/product-vocabulary";

/** Une vraie règle du code dont la phrase patient ne cite pas le médicament, et une qui le cite (« Votre antibiotique ({drug})… »). */
const DRUG_FREE = ADVICE_RULES.find((rule) => !rule.patientReasonTemplate.includes("{drug}"))!;
const WITH_DRUG = ADVICE_RULES.find((rule) => rule.patientReasonTemplate.includes("{drug}"))!;

const agent = { connectionId: null, postId: "post1", scope: { pharmacyId: "ph1", organizationId: "org1", userId: "owner1" }, pharmacyIsDemo: false, intervalSeconds: 300, exportPath: null, scansPath: null };
const sale = (closedAt: Date | null = null) => ({ id: "sale1", counterPost: "Comptoir 2", counterFollowUp: closedAt ? { id: "f1", closedAt } : null });
const item = (id: string, outcome: "NONE" | "SOLD" | "NOT_SOLD", name = `Produit ${id}`) => ({ id, outcome, name });

beforeEach(() => {
  vi.clearAllMocks();
  m.prescriptionFindFirst.mockResolvedValue(sale());
  m.recommendationFindMany.mockResolvedValue([]);
  m.pharmacyFindUnique.mockResolvedValue({ name: "Pharmacie du Port", isDemo: false, timezone: "Europe/Paris" });
  m.followUpFindUnique.mockResolvedValue(null);
  m.validated.mockResolvedValue(new Set([DRUG_FREE.key, WITH_DRUG.key]));
  m.centralRows.mockResolvedValue([]);
  m.lineFindMany.mockResolvedValue([]);
  m.sendEmail.mockResolvedValue({ status: "SENT", provider: "test", detail: "ok" });
  m.recommendationCount.mockResolvedValue(18);
  m.followUpUpdateMany.mockResolvedValue({ count: 1 });
});

describe("« Vendu » / « Non vendu » dans la fenêtre", () => {
  it("« Vendu » est une déclaration du comptoir : poste connu, aucun collaborateur inventé", async () => {
    m.recommendationFindFirst.mockResolvedValue({ id: "r1", status: "PROPOSED", outcomeSource: null, _count: { saleLines: 0 } });
    const result = await decideCounterAdvice(agent, { prescriptionId: "sale1", recommendationId: "r1", outcome: "SOLD" });
    expect(result).toEqual({ ok: true, outcome: "SOLD", changed: true });
    expect(m.recommendationUpdate).toHaveBeenCalledWith({ where: { id: "r1" }, data: expect.objectContaining({ status: "PURCHASED", decidedByUserId: null, outcomeSource: "COUNTER_DECLARED", outcomePost: "Comptoir 2" }) });
    expect(m.eventCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "PURCHASED", userId: null }) });
  });

  it("garde dans l'historique le challenge et la date courte que le pharmacien avait sous les yeux", async () => {
    m.recommendationFindFirst.mockResolvedValue({ id: "r1", status: "PROPOSED", outcomeSource: null, productId: "prod1", presentationId: null, _count: { saleLines: 0 } });
    await decideCounterAdvice(agent, { prescriptionId: "sale1", recommendationId: "r1", outcome: "SOLD" });
    expect(m.eventCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ metadata: expect.objectContaining({ source: "COUNTER_DECLARED", post: "Comptoir 2", challenge: "Challenge Avène", shortDateOn: "2026-11-30" }) }) });
  });

  it("la déclaration revient au collaborateur à qui le comptoir est attribué", async () => {
    m.prescriptionFindFirst.mockResolvedValue({ ...sale(), handledByUserId: "lea" });
    m.recommendationFindFirst.mockResolvedValue({ id: "r1", status: "PROPOSED", outcomeSource: null, _count: { saleLines: 0 } });
    await decideCounterAdvice(agent, { prescriptionId: "sale1", recommendationId: "r1", outcome: "SOLD" });
    expect(m.recommendationUpdate).toHaveBeenCalledWith({ where: { id: "r1" }, data: expect.objectContaining({ status: "PURCHASED", decidedByUserId: "lea", outcomePost: "Comptoir 2" }) });
    expect(m.eventCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "PURCHASED", userId: "lea" }) });
  });

  it("« Non vendu » marque le conseil refusé, sans le supprimer", async () => {
    m.recommendationFindFirst.mockResolvedValue({ id: "r1", status: "PROPOSED", outcomeSource: null, _count: { saleLines: 0 } });
    await decideCounterAdvice(agent, { prescriptionId: "sale1", recommendationId: "r1", outcome: "NOT_SOLD" });
    expect(m.recommendationUpdate).toHaveBeenCalledWith({ where: { id: "r1" }, data: expect.objectContaining({ status: "DECLINED", outcomeSource: "COUNTER_DECLARED" }) });
  });

  it("reprendre sa réponse remet le conseil sans réponse et efface la déclaration", async () => {
    m.recommendationFindFirst.mockResolvedValue({ id: "r1", status: "PURCHASED", outcomeSource: "COUNTER_DECLARED", _count: { saleLines: 0 } });
    await decideCounterAdvice(agent, { prescriptionId: "sale1", recommendationId: "r1", outcome: "NONE" });
    expect(m.recommendationUpdate).toHaveBeenCalledWith({ where: { id: "r1" }, data: expect.objectContaining({ status: "PROPOSED", decidedAt: null, outcomeSource: null, outcomePost: null }) });
    expect(m.eventCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "REOPENED" }) });
  });

  it("une vente enregistrée dans PharmaBoost n'est jamais réécrite d'ici", async () => {
    m.recommendationFindFirst.mockResolvedValue({ id: "r1", status: "PURCHASED", outcomeSource: null, _count: { saleLines: 1 } });
    const result = await decideCounterAdvice(agent, { prescriptionId: "sale1", recommendationId: "r1", outcome: "NOT_SOLD" });
    expect(result.ok).toBe(false);
    expect(m.recommendationUpdate).not.toHaveBeenCalled();
  });

  it("même réponse deux fois : rien n'est écrit", async () => {
    m.recommendationFindFirst.mockResolvedValue({ id: "r1", status: "PURCHASED", outcomeSource: "COUNTER_DECLARED", _count: { saleLines: 0 } });
    expect(await decideCounterAdvice(agent, { prescriptionId: "sale1", recommendationId: "r1", outcome: "SOLD" })).toEqual({ ok: true, outcome: "SOLD", changed: false });
    expect(m.recommendationUpdate).not.toHaveBeenCalled();
  });

  it("refuse une vente d'une autre officine, un conseil retiré et une vente terminée", async () => {
    m.prescriptionFindFirst.mockResolvedValueOnce(null);
    expect((await decideCounterAdvice(agent, { prescriptionId: "autre", recommendationId: "r1", outcome: "SOLD" })).ok).toBe(false);
    m.prescriptionFindFirst.mockResolvedValueOnce(sale(new Date()));
    expect((await decideCounterAdvice(agent, { prescriptionId: "sale1", recommendationId: "r1", outcome: "SOLD" })).ok).toBe(false);
    m.recommendationFindFirst.mockResolvedValue({ id: "r1", status: "REMOVED", outcomeSource: null, _count: { saleLines: 0 } });
    expect((await decideCounterAdvice(agent, { prescriptionId: "sale1", recommendationId: "r1", outcome: "SOLD" })).ok).toBe(false);
    expect(m.recommendationUpdate).not.toHaveBeenCalled();
  });
});

describe("l'adresse e-mail du patient", () => {
  it("n'est enregistrée qu'avec l'accord du patient, et chiffrée", async () => {
    expect((await saveCounterEmail(agent, { prescriptionId: "sale1", email: "jean@gmail.com", consent: false })).ok).toBe(false);
    expect(m.followUpUpsert).not.toHaveBeenCalled();
    expect(await saveCounterEmail(agent, { prescriptionId: "sale1", email: "Jean@Gmail.com", consent: true })).toEqual({ ok: true, saved: true });
    expect(m.followUpUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ emailEncrypted: "enc:jean@gmail.com", consentPost: "Comptoir 2" }) }));
    // Le journal ne garde que l'adresse masquée.
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain("jean@gmail.com");
  });

  it("refuse une adresse mal formée", async () => {
    const result = await saveCounterEmail(agent, { prescriptionId: "sale1", email: "pas-une-adresse", consent: true });
    expect(result.ok).toBe(false);
  });

  it("retire l'adresse quand on la vide", async () => {
    expect(await saveCounterEmail(agent, { prescriptionId: "sale1", email: null, consent: false })).toEqual({ ok: true, saved: false });
    expect(m.followUpUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: { emailEncrypted: null, consentAt: null, consentPost: null } }));
  });
});

describe("plusieurs pharmacies, plusieurs postes, des gestes simultanés", () => {
  const otherPharmacy = { ...agent, scope: { ...agent.scope, pharmacyId: "ph2" } };

  it("une vente d'une autre pharmacie est introuvable : la recherche porte TOUJOURS sur la pharmacie du poste", async () => {
    m.prescriptionFindFirst.mockImplementation(async ({ where }: { where: { pharmacyId: string } }) => (where.pharmacyId === "ph1" ? sale() : null));
    expect((await decideCounterAdvice(otherPharmacy, { prescriptionId: "sale1", recommendationId: "r1", outcome: "SOLD" })).ok).toBe(false);
    expect((await saveCounterEmail(otherPharmacy, { prescriptionId: "sale1", email: "a@b.fr", consent: true })).ok).toBe(false);
    expect((await finishCounterSale(otherPharmacy, { prescriptionId: "sale1" })).ok).toBe(false);
    for (const call of m.prescriptionFindFirst.mock.calls) expect(call[0].where).toMatchObject({ pharmacyId: "ph2", source: "COUNTER_SCAN" });
    expect(m.recommendationUpdate).not.toHaveBeenCalled();
    expect(m.followUpUpdateMany).not.toHaveBeenCalled();
    expect(m.sendEmail).not.toHaveBeenCalled();
  });

  it("un conseil d'une autre vente ne se décide pas avec l'identifiant d'une vente de son poste", async () => {
    m.recommendationFindFirst.mockImplementation(async ({ where }: { where: { prescriptionId: string; pharmacyId: string } }) => (where.prescriptionId === "sale1" && where.pharmacyId === "ph1" ? null : null));
    const result = await decideCounterAdvice(agent, { prescriptionId: "sale1", recommendationId: "conseil-d-une-autre-vente", outcome: "SOLD" });
    expect(result.ok).toBe(false);
    expect(m.recommendationFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "conseil-d-une-autre-vente", prescriptionId: "sale1", pharmacyId: "ph1" }) }));
  });

  it("deux « Vente terminée » en même temps (double clic, nouvel essai) : UN seul bilan part", async () => {
    m.readNotice.mockResolvedValue({ status: "ANALYZED", followUp: { emailSaved: true, closed: false }, notice: { items: [{ id: "a", outcome: "SOLD", name: "ELUDAY" }] } });
    m.followUpFindUnique.mockResolvedValue({ emailEncrypted: "enc:jean@gmail.com", consentAt: new Date(), reportStatus: null, proposedCount: 0, soldCount: 0, notSoldCount: 0, unansweredCount: 0 });
    m.recommendationFindMany.mockResolvedValue([{ patientReason: null, opportunity: null, product: { name: "ELUDAY" }, presentation: null }]);
    // La base ne donne la fermeture qu'au premier : le second la trouve déjà prise.
    m.followUpUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 0 });
    const [first, second] = await Promise.all([finishCounterSale(agent, { prescriptionId: "sale1" }), finishCounterSale(agent, { prescriptionId: "sale1" })]);
    expect([first, second].filter((result) => result.ok && !result.alreadyClosed)).toHaveLength(1);
    expect([first, second].filter((result) => result.ok && result.alreadyClosed)).toHaveLength(1);
    expect(m.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("deux pharmacies ferment « leur » vente en même temps : chacune garde ses résultats, deux bilans, aucun mélange", async () => {
    m.readNotice.mockImplementation(async (pharmacyId: string) => ({ status: "ANALYZED", followUp: { emailSaved: false, closed: false }, notice: { items: [{ id: `rec-${pharmacyId}`, outcome: pharmacyId === "ph1" ? "SOLD" : "NOT_SOLD", name: "X" }] } }));
    const [a, b] = await Promise.all([finishCounterSale(agent, { prescriptionId: "sale1" }), finishCounterSale(otherPharmacy, { prescriptionId: "sale1" })]);
    expect(a).toMatchObject({ ok: true, sold: 1, notSold: 0 });
    expect(b).toMatchObject({ ok: true, sold: 0, notSold: 1 });
    expect(m.readNotice.mock.calls.map((call) => call[0]).sort()).toEqual(["ph1", "ph2"]);
  });

  it("les conseils sont lus AVANT de réserver la fermeture : une vente déjà fermée se lirait vide et ne compterait plus rien", async () => {
    m.readNotice.mockResolvedValue({ status: "ANALYZED", followUp: { emailSaved: false, closed: false }, notice: { items: [{ id: "a", outcome: "SOLD", name: "X" }] } });
    await finishCounterSale(agent, { prescriptionId: "sale1" });
    expect(m.readNotice.mock.invocationCallOrder[0]).toBeLessThan(m.followUpUpdateMany.mock.invocationCallOrder[0]);
  });

  it("une pharmacie neuve, sans aucun historique ni aucun conseil : la vente se termine proprement", async () => {
    m.readNotice.mockResolvedValue({ status: "ANALYZED", followUp: { emailSaved: false, closed: false }, notice: { items: [] } });
    expect(await finishCounterSale(agent, { prescriptionId: "sale1" })).toMatchObject({ ok: true, proposed: 0, sold: 0, soldToday: null, report: "NONE" });
  });
});

describe("« Vente terminée »", () => {
  const read = (items: ReturnType<typeof item>[]) => ({ status: "ANALYZED", followUp: { emailSaved: false, closed: false }, notice: { items } });

  it("un conseil ni bipé ni marqué « Vendu » est « Non vendu » à la fin de la vente (fondateur, 16 oct. 2026)", async () => {
    m.readNotice.mockResolvedValue(read([item("a", "SOLD"), item("b", "NOT_SOLD"), item("c", "NONE")]));
    m.recommendationFindMany.mockResolvedValueOnce([{ id: "c" }]);
    const result = await finishCounterSale(agent, { prescriptionId: "sale1" });
    expect(result).toMatchObject({ ok: true, alreadyClosed: false, proposed: 3, sold: 1, notSold: 2, unanswered: 0, soldToday: 18, report: "NONE" });
    expect(m.recommendationUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ["c"] } }, data: expect.objectContaining({ status: "DECLINED", outcomeSource: "COUNTER_DECLARED" }) });
    expect(m.followUpTxUpdate).toHaveBeenCalledWith({ where: { prescriptionId: "sale1" }, data: expect.objectContaining({ proposedCount: 3, soldCount: 1, notSoldCount: 2, unansweredCount: 0 }) });
  });

  it("n'annonce aucun « vendu aujourd'hui » quand rien n'a été vendu dans cette vente", async () => {
    m.readNotice.mockResolvedValue(read([item("a", "NOT_SOLD"), item("b", "NONE")]));
    const result = await finishCounterSale(agent, { prescriptionId: "sale1" });
    expect(result).toMatchObject({ ok: true, sold: 0, soldToday: null });
    expect(m.recommendationCount).not.toHaveBeenCalled();
  });

  it("envoie le bilan seulement avec l'accord du patient, une adresse et au moins un produit vendu", async () => {
    m.readNotice.mockResolvedValue(read([item("a", "SOLD", "ELUDAY")]));
    m.followUpFindUnique.mockResolvedValue({ emailEncrypted: "enc:jean@gmail.com", consentAt: new Date() });
    m.recommendationFindMany.mockResolvedValue([{ patientReason: "Apaise la bouche sèche.", opportunity: { ruleKey: DRUG_FREE.key }, product: { name: "ELUDAY GENCIVE, flacon" }, presentation: null }]);
    const result = await finishCounterSale(agent, { prescriptionId: "sale1" });
    expect(result).toMatchObject({ ok: true, report: "SENT" });
    expect(m.sendEmail).toHaveBeenCalledTimes(1);
    const sent = m.sendEmail.mock.calls[0][0];
    expect(sent.to).toBe("jean@gmail.com");
    expect(sent.text).toContain("ELUDAY GENCIVE");
    expect(sent.text).toContain("Apaise la bouche sèche.");
    // Le journal des e-mails ne garde que l'adresse masquée.
    expect(m.trace).toHaveBeenCalledWith(expect.objectContaining({ kind: "PATIENT_REPORT", recipient: "j***@gmail.com" }));
  });

  it("ne reprend pas la phrase d'une règle non validée", async () => {
    m.readNotice.mockResolvedValue(read([item("a", "SOLD", "ELUDAY")]));
    m.followUpFindUnique.mockResolvedValue({ emailEncrypted: "enc:jean@gmail.com", consentAt: new Date() });
    m.recommendationFindMany.mockResolvedValue([{ patientReason: "Phrase non relue.", opportunity: { ruleKey: "rule-pending" }, product: { name: "ELUDAY" }, presentation: null }]);
    await finishCounterSale(agent, { prescriptionId: "sale1" });
    expect(m.sendEmail.mock.calls[0][0].text).not.toContain("Phrase non relue.");
  });

  it("n'envoie rien sans accord du patient, ni sans produit vendu", async () => {
    m.readNotice.mockResolvedValue(read([item("a", "SOLD")]));
    m.followUpFindUnique.mockResolvedValue({ emailEncrypted: "enc:jean@gmail.com", consentAt: null });
    await finishCounterSale(agent, { prescriptionId: "sale1" });
    expect(m.sendEmail).not.toHaveBeenCalled();
    m.readNotice.mockResolvedValue(read([item("a", "NOT_SOLD")]));
    m.followUpFindUnique.mockResolvedValue({ emailEncrypted: "enc:jean@gmail.com", consentAt: new Date() });
    await finishCounterSale(agent, { prescriptionId: "sale1" });
    expect(m.sendEmail).not.toHaveBeenCalled();
  });

  it("rejouée, elle renvoie son résumé et n'envoie rien une seconde fois", async () => {
    m.followUpUpdateMany.mockResolvedValue({ count: 0 });
    m.followUpFindUnique.mockResolvedValue({ closedAt: new Date(), proposedCount: 3, soldCount: 1, notSoldCount: 1, unansweredCount: 1, reportStatus: "SENT" });
    const result = await finishCounterSale(agent, { prescriptionId: "sale1" });
    expect(result).toMatchObject({ ok: true, alreadyClosed: true, sold: 1, report: "SENT" });
    expect(m.sendEmail).not.toHaveBeenCalled();
    expect(m.followUpTxUpdate).not.toHaveBeenCalled();
  });

  it("un échec d'envoi est dit tel quel, la vente reste terminée", async () => {
    m.readNotice.mockResolvedValue(read([item("a", "SOLD")]));
    m.followUpFindUnique.mockResolvedValue({ emailEncrypted: "enc:jean@gmail.com", consentAt: new Date() });
    m.recommendationFindMany.mockResolvedValue([{ patientReason: null, opportunity: null, product: { name: "ELUDAY" }, presentation: null }]);
    m.sendEmail.mockRejectedValue(new Error("boîte pleine"));
    const result = await finishCounterSale(agent, { prescriptionId: "sale1" });
    expect(result).toMatchObject({ ok: true, report: "FAILED" });
  });
});

describe("le bilan ne nomme jamais ce que la pharmacie a délivré", () => {
  const read = (items: ReturnType<typeof item>[]) => ({ status: "ANALYZED", followUp: { emailSaved: true, closed: false }, notice: { items } });
  /** Une boîte d'amoxicilline passée au scan : le nom lu, la spécialité, ses substances publiées. */
  const amoxicillin = { drugName: "AMOXICILLINE ARROW 1 g, comprimé dispersible", specialty: { name: "AMOXICILLINE ARROW 1 g, comprimé dispersible", compositions: [{ substanceLabel: "AMOXICILLINE TRIHYDRATÉE" }, { substanceLabel: "AMOXICILLINE" }] } };
  const PRODUCT = "FLORE INTESTINALE 10 gélules";
  const sold = (patientReason: string, ruleKey: string) => m.recommendationFindMany.mockResolvedValue([{ patientReason, opportunity: { ruleKey }, product: { name: PRODUCT }, presentation: null }]);
  const sentMail = async () => {
    expect(await finishCounterSale(agent, { prescriptionId: "sale1" })).toMatchObject({ ok: true, report: "SENT" });
    return m.sendEmail.mock.calls[0][0] as { subject: string; text: string; html: string };
  };
  const customRow = (ruleKey: string, patientReason: string) => ({
    ruleKey,
    source: "CUSTOM",
    status: "VALIDATED",
    ruleVersion: null,
    decidedAt: new Date("2026-10-09T10:00:00Z"),
    decidedByName: "Pharmacienne PharmaBoost",
    definition: { title: "Flore et antibiotique", kind: "TOLERANCE", atcPrefixes: ["J01"], therapeuticClasses: [], category: PRODUCT_CATEGORIES[0], matchingTags: [ADVICE_VOCABULARY[0]], question: null, shortReason: "Accompagne la flore pendant la cure.", counterScript: "Je vous conseille {product} pendant la cure.", patientReason, source: null, safetyNotes: [] },
  });

  beforeEach(() => {
    m.readNotice.mockResolvedValue(read([item("a", "SOLD", "FLORE INTESTINALE")]));
    m.followUpFindUnique.mockResolvedValue({ emailEncrypted: "enc:jean@gmail.com", consentAt: new Date() });
    m.lineFindMany.mockResolvedValue([amoxicillin]);
  });

  it("une règle validée dont la phrase cite le médicament (« AMOXICILLINE ») : le produit part seul, ni le texte ni le HTML ne le nomment", async () => {
    const rendered = WITH_DRUG.patientReasonTemplate.replaceAll("{drug}", "AMOXICILLINE").replaceAll("{product}", PRODUCT);
    expect(rendered).toContain("AMOXICILLINE");
    sold(rendered, WITH_DRUG.key);
    const sent = await sentMail();
    expect(sent.text).toContain("FLORE INTESTINALE");
    for (const body of [sent.subject, sent.text, sent.html]) expect(body.toLowerCase()).not.toContain("amoxicilline");
  });

  it("une règle validée dont le modèle ne cite aucun médicament : sa phrase part telle quelle", async () => {
    const rendered = DRUG_FREE.patientReasonTemplate.replaceAll("{product}", PRODUCT);
    sold(rendered, DRUG_FREE.key);
    const sent = await sentMail();
    expect(sent.text).toContain(rendered);
    // La table centrale est relue UNE fois (une règle du code peut avoir été modifiée depuis la console) ; sans modification,
    // la phrase du code part telle quelle.
    expect(m.centralRows).toHaveBeenCalledTimes(1);
  });

  it("une règle du code MODIFIÉE depuis la console : c'est la phrase patient modifiée qui part (celle que le moteur a rendue)", async () => {
    const edit = { ...editValuesOf(DRUG_FREE), patientReason: "Phrase patient modifiée par Donna : {product} vous aidera." };
    m.centralRows.mockResolvedValue([{ ruleKey: DRUG_FREE.key, source: "BUILT_IN", status: "VALIDATED", ruleVersion: null, definition: null, decidedAt: null, decidedByName: null, override: { edit }, overrideRevision: 1 }]);
    const rendered = `Phrase patient modifiée par Donna : ${PRODUCT} vous aidera.`;
    sold(rendered, DRUG_FREE.key);
    const sent = await sentMail();
    expect(sent.text).toContain(rendered);
  });

  it("filet : même sous un modèle sans `{drug}`, une phrase qui cite une substance de la vente ne part pas (casse et accents ignorés)", async () => {
    sold("Pendant votre cure d'Amoxicilline, ce complément accompagne la flore.", DRUG_FREE.key);
    const sent = await sentMail();
    expect(sent.text).toContain("FLORE INTESTINALE");
    expect(sent.text.toLowerCase()).not.toContain("amoxicilline");
    expect(sent.html.toLowerCase()).not.toContain("amoxicilline");
  });

  it("la photo du produit et ses précautions d'emploi partent, sauf une précaution qui cite le traitement délivré", async () => {
    m.recommendationFindMany.mockResolvedValue([
      { patientReason: null, opportunity: { ruleKey: DRUG_FREE.key }, product: { name: PRODUCT, imageUrl: "https://images.openbeautyfacts.org/flore.jpg", precautions: ["Conserver au frais.", "Prendre à distance de l'amoxicilline."] }, presentation: null },
    ]);
    const sent = await sentMail();
    expect(sent.html).toContain("https://images.openbeautyfacts.org/flore.jpg");
    expect(sent.text).toContain("Précaution d'emploi : Conserver au frais.");
    for (const body of [sent.text, sent.html]) expect(body.toLowerCase()).not.toContain("amoxicilline");
  });

  it("une règle validée introuvable (ni dans le code, ni parmi les conseils ajoutés) : sa phrase ne part pas", async () => {
    m.validated.mockResolvedValue(new Set(["regle-disparue"]));
    sold("Une phrase dont personne ne connaît plus le modèle.", "regle-disparue");
    expect((await sentMail()).text).not.toContain("Une phrase dont personne");
  });

  it("un conseil ajouté depuis la console (ou accepté depuis la base de connaissances) : c'est le modèle gardé en base qui décide", async () => {
    m.validated.mockResolvedValue(new Set(["custom-avec", "custom-sans"]));
    m.centralRows.mockResolvedValue([customRow("custom-avec", "Avec {drug}, ce complément accompagne la flore."), customRow("custom-sans", "Ce complément accompagne la flore intestinale.")]);
    m.recommendationFindMany.mockResolvedValue([
      { patientReason: "Avec votre traitement, ce complément accompagne la flore.", opportunity: { ruleKey: "custom-avec" }, product: { name: "PRODUIT A" }, presentation: null },
      { patientReason: "Ce complément accompagne la flore intestinale.", opportunity: { ruleKey: "custom-sans" }, product: { name: "PRODUIT B" }, presentation: null },
    ]);
    const sent = await sentMail();
    expect(sent.text).not.toContain("Avec votre traitement");
    expect(sent.text).toContain("Ce complément accompagne la flore intestinale.");
    expect(m.centralRows).toHaveBeenCalledTimes(1);
  });

  it("les lignes lues sont celles de CETTE vente, dans la pharmacie du poste", async () => {
    sold(DRUG_FREE.patientReasonTemplate.replaceAll("{product}", PRODUCT), DRUG_FREE.key);
    await sentMail();
    expect(m.lineFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { prescriptionId: "sale1", prescription: { pharmacyId: "ph1" } } }));
  });
});

describe("l'adresse du bilan ne survit pas à « Vente terminée »", () => {
  const read = (items: ReturnType<typeof item>[]) => ({ status: "ANALYZED", followUp: { emailSaved: true, closed: false }, notice: { items } });
  const withAddress = (consentAt: Date | null = new Date()) => m.followUpFindUnique.mockResolvedValue({ emailEncrypted: "enc:jean@gmail.com", consentAt });
  const soldProduct = () => m.recommendationFindMany.mockResolvedValue([{ patientReason: null, opportunity: null, product: { name: "ELUDAY" }, presentation: null }]);
  /** La seule écriture qui suit le bilan : son issue, et l'effacement de l'adresse. */
  const finalWrite = () => m.followUpUpdate.mock.calls.map((call) => call[0]).find((args) => "reportStatus" in args.data);

  it.each([
    ["SENT", () => m.sendEmail.mockResolvedValue({ status: "SENT", provider: "test", detail: "ok" })],
    ["SIMULATED", () => m.sendEmail.mockResolvedValue({ status: "SIMULATED", provider: "test", detail: "messagerie non branchée" })],
    ["FAILED", () => m.sendEmail.mockRejectedValue(new Error("boîte pleine"))],
  ] as const)("bilan %s : l'adresse est effacée dans la même écriture que l'issue, APRÈS l'envoi", async (status, arrange) => {
    m.readNotice.mockResolvedValue(read([item("a", "SOLD", "ELUDAY")]));
    withAddress();
    soldProduct();
    arrange();
    const result = await finishCounterSale(agent, { prescriptionId: "sale1" });
    expect(result).toMatchObject({ ok: true, report: status });
    expect(finalWrite()).toEqual({ where: { prescriptionId: "sale1" }, data: { reportStatus: status, reportSentAt: expect.any(Date), emailEncrypted: null } });
    // L'adresse est lue (et le bilan tenté) avant d'être effacée : l'effacement ne prive jamais le patient de son bilan.
    expect(m.followUpFindUnique.mock.invocationCallOrder[0]).toBeLessThan(m.followUpUpdate.mock.invocationCallOrder[0]);
    expect(m.sendEmail.mock.invocationCallOrder[0]).toBeLessThan(m.followUpUpdate.mock.invocationCallOrder[0]);
  });

  it("rien à envoyer (sans accord, sans produit vendu, sans adresse) : l'adresse est effacée quand même", async () => {
    const cases: [ReturnType<typeof item>[], (() => void) | null][] = [
      [[item("a", "SOLD")], () => withAddress(null)],
      [[item("a", "NOT_SOLD"), item("b", "NONE")], () => withAddress()],
      [[item("a", "SOLD")], null],
    ];
    for (const [items, arrange] of cases) {
      vi.clearAllMocks();
      m.followUpUpdateMany.mockResolvedValue({ count: 1 });
      m.followUpFindUnique.mockResolvedValue(null);
      m.readNotice.mockResolvedValue(read(items));
      arrange?.();
      expect(await finishCounterSale(agent, { prescriptionId: "sale1" })).toMatchObject({ ok: true, report: "NONE" });
      expect(m.sendEmail).not.toHaveBeenCalled();
      expect(finalWrite()).toEqual({ where: { prescriptionId: "sale1" }, data: { reportStatus: "NONE", reportSentAt: null, emailEncrypted: null } });
    }
  });

  it("l'accord du patient (date et poste) reste : il ne désigne personne et dit que l'envoi était demandé", async () => {
    m.readNotice.mockResolvedValue(read([item("a", "SOLD")]));
    withAddress();
    soldProduct();
    await finishCounterSale(agent, { prescriptionId: "sale1" });
    for (const [args] of [...m.followUpUpdate.mock.calls, ...m.followUpTxUpdate.mock.calls]) {
      expect(args.data).not.toHaveProperty("consentAt");
      expect(args.data).not.toHaveProperty("consentPost");
    }
  });

  it("un envoi qui casse en route : la vente reste fermée, l'adresse est effacée, l'issue n'est pas devinée", async () => {
    m.readNotice.mockResolvedValue(read([item("a", "SOLD")]));
    withAddress();
    soldProduct();
    m.trace.mockRejectedValue(new Error("journal des e-mails indisponible"));
    m.followUpUpdate.mockResolvedValue({});
    await expect(finishCounterSale(agent, { prescriptionId: "sale1" })).rejects.toThrow("journal des e-mails indisponible");
    expect(m.followUpUpdate).toHaveBeenCalledWith({ where: { prescriptionId: "sale1" }, data: { emailEncrypted: null } });
    expect(finalWrite()).toBeUndefined();
  });

  it("rejouée sur une vente déjà terminée : rien n'est relu ni réécrit", async () => {
    m.followUpUpdateMany.mockResolvedValue({ count: 0 });
    m.followUpFindUnique.mockResolvedValue({ closedAt: new Date(), proposedCount: 1, soldCount: 1, notSoldCount: 0, unansweredCount: 0, reportStatus: "SENT" });
    expect(await finishCounterSale(agent, { prescriptionId: "sale1" })).toMatchObject({ ok: true, alreadyClosed: true, report: "SENT" });
    expect(m.followUpUpdate).not.toHaveBeenCalled();
    expect(m.sendEmail).not.toHaveBeenCalled();
  });
});

describe("le passage quotidien efface les adresses restées en base (vente jamais terminée)", () => {
  const NOW = new Date("2026-10-12T08:59:00Z");
  const hoursBefore = (date: Date, hours: number) => new Date(date.getTime() - hours * 3_600_000);
  type Row = { emailEncrypted: string | null; consentAt: Date | null; updatedAt: Date; closedAt: Date | null };
  type PurgeWhere = { emailEncrypted: { not: null }; OR: ({ consentAt: { lt: Date } } | { consentAt: null; updatedAt: { lt: Date } })[] };
  /** Ce que la base ferait de cette condition-là, ligne par ligne (la forme exacte est vérifiée à part). */
  const erases = (now: Date, row: Row) => {
    const where = counterEmailPurgeWhere(now) as PurgeWhere;
    if (row.emailEncrypted === null) return false;
    return where.OR.some((clause) => ("updatedAt" in clause ? row.consentAt === null && row.updatedAt < clause.updatedAt.lt : row.consentAt !== null && row.consentAt < clause.consentAt.lt));
  };
  const row = (over: Partial<Row> = {}): Row => ({ emailEncrypted: "enc:jean@gmail.com", consentAt: hoursBefore(NOW, 30), updatedAt: hoursBefore(NOW, 30), closedAt: null, ...over });

  it("la condition : une adresse encore là, donnée avant la limite (ou sans accord, d'après sa dernière écriture)", () => {
    const cutoff = hoursBefore(NOW, COUNTER_EMAIL_PURGE_AFTER_HOURS);
    expect(counterEmailPurgeWhere(NOW)).toEqual({ emailEncrypted: { not: null }, OR: [{ consentAt: { lt: cutoff } }, { consentAt: null, updatedAt: { lt: cutoff } }] });
  });

  it("efface une vieille adresse, vente terminée ou non ; garde celle d'une vente en cours ; ignore une adresse déjà effacée", () => {
    expect(erases(NOW, row())).toBe(true);
    expect(erases(NOW, row({ closedAt: hoursBefore(NOW, 29) }))).toBe(true);
    expect(erases(NOW, row({ consentAt: hoursBefore(NOW, 1), updatedAt: hoursBefore(NOW, 1) }))).toBe(false);
    expect(erases(NOW, row({ emailEncrypted: null }))).toBe(false);
    expect(erases(NOW, row({ consentAt: null }))).toBe(true);
    // Une adresse sans accord mais touchée il y a peu attend le passage suivant ; elle ne vit pas plus longtemps qu'une autre.
    expect(erases(NOW, row({ consentAt: null, updatedAt: hoursBefore(NOW, 2) }))).toBe(false);
  });

  it("aucune adresse ne dépasse 48 heures, même avec deux passages espacés au maximum par l'hébergeur", () => {
    expect(COUNTER_EMAIL_MAX_HOURS).toBe(48);
    expect(COUNTER_EMAIL_PURGE_AFTER_HOURS + DAILY_PASS_MAX_GAP_HOURS).toBeLessThanOrEqual(COUNTER_EMAIL_MAX_HOURS);
    // Jamais pendant une vente réelle : une vente au comptoir se ferme en minutes, le poste l'oublie au bout de 6 heures.
    expect(COUNTER_EMAIL_PURGE_AFTER_HOURS).toBeGreaterThanOrEqual(12);
    // Un passage à 8 h 00, le suivant à 8 h 59 le lendemain ; l'adresse est donnée à 9 h 01 la veille du premier.
    const firstPass = new Date("2026-10-11T08:00:00Z");
    const nextPass = new Date("2026-10-12T08:59:00Z");
    const given = new Date("2026-10-10T09:01:00Z");
    const address = row({ consentAt: given, updatedAt: given });
    expect(erases(firstPass, address)).toBe(false);
    expect(erases(nextPass, address)).toBe(true);
    expect((nextPass.getTime() - given.getTime()) / 3_600_000).toBeLessThan(COUNTER_EMAIL_MAX_HOURS);
  });

  it("n'efface que l'adresse (l'accord et les résultats restent), sans rien lire, et se rejoue sans effet", async () => {
    m.followUpUpdateMany.mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 0 });
    expect(await purgeCounterEmails(NOW)).toEqual({ erased: 3, moreToDo: false });
    expect(m.followUpUpdateMany).toHaveBeenCalledWith({ where: counterEmailPurgeWhere(NOW), data: { emailEncrypted: null }, limit: 2_000 });
    expect(m.followUpFindUnique).not.toHaveBeenCalled();
    expect(await purgeCounterEmails(NOW)).toEqual({ erased: 0, moreToDo: false });
  });

  it("borné : une base très en retard est vidée par lots, et le reste attend le passage suivant", async () => {
    m.followUpUpdateMany.mockResolvedValue({ count: 2_000 });
    expect(await purgeCounterEmails(NOW)).toEqual({ erased: 20_000, moreToDo: true });
    expect(m.followUpUpdateMany).toHaveBeenCalledTimes(10);
  });
});
