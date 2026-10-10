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
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    prescription: { findFirst: m.prescriptionFindFirst },
    recommendation: { findFirst: m.recommendationFindFirst, findMany: m.recommendationFindMany, update: m.recommendationUpdate, updateMany: m.recommendationUpdateMany, count: m.recommendationCount },
    recommendationEvent: { create: m.eventCreate, createMany: m.eventCreateMany },
    counterSaleFollowUp: { upsert: m.followUpUpsert, findUnique: m.followUpFindUnique, update: m.followUpUpdate, updateMany: m.followUpUpdateMany },
    pharmacy: { findUnique: m.pharmacyFindUnique },
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
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: m.trace }));
vi.mock("@/server/services/central-advice", () => ({ validatedRuleKeys: m.validated }));
vi.mock("@/server/services/counter-notice", () => ({ readCounterNotice: m.readNotice }));
vi.mock("@/server/services/challenges", () => ({ activeChallengeTitlesFor: vi.fn(async () => new Map([["prod1", "Challenge Avène"]])) }));
vi.mock("@/server/services/stock-lots", () => ({ nearestShortDatesFor: vi.fn(async () => new Map([["p:prod1", { expiresOn: "2026-11-30" }]])) }));

import { decideCounterAdvice, finishCounterSale, saveCounterEmail } from "../counter-window";

const agent = { connectionId: null, postId: "post1", scope: { pharmacyId: "ph1", organizationId: "org1", userId: "owner1" }, pharmacyIsDemo: false, intervalSeconds: 300, exportPath: null, scansPath: null };
const sale = (closedAt: Date | null = null) => ({ id: "sale1", counterPost: "Comptoir 2", counterFollowUp: closedAt ? { id: "f1", closedAt } : null });
const item = (id: string, outcome: "NONE" | "SOLD" | "NOT_SOLD", name = `Produit ${id}`) => ({ id, outcome, name });

beforeEach(() => {
  vi.clearAllMocks();
  m.prescriptionFindFirst.mockResolvedValue(sale());
  m.recommendationFindMany.mockResolvedValue([]);
  m.pharmacyFindUnique.mockResolvedValue({ name: "Pharmacie du Port", isDemo: false, timezone: "Europe/Paris" });
  m.followUpFindUnique.mockResolvedValue(null);
  m.validated.mockResolvedValue(new Set(["rule-ok"]));
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

  it("enregistre vendu / non vendu / sans réponse et passe les conseils laissés sans réponse en « sans réponse »", async () => {
    m.readNotice.mockResolvedValue(read([item("a", "SOLD"), item("b", "NOT_SOLD"), item("c", "NONE")]));
    m.recommendationFindMany.mockResolvedValueOnce([{ id: "c" }]);
    const result = await finishCounterSale(agent, { prescriptionId: "sale1" });
    expect(result).toMatchObject({ ok: true, alreadyClosed: false, proposed: 3, sold: 1, notSold: 1, unanswered: 1, soldToday: 18, report: "NONE" });
    expect(m.recommendationUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ["c"] } }, data: { status: "IGNORED" } });
    expect(m.followUpTxUpdate).toHaveBeenCalledWith({ where: { prescriptionId: "sale1" }, data: expect.objectContaining({ proposedCount: 3, soldCount: 1, notSoldCount: 1, unansweredCount: 1 }) });
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
    m.recommendationFindMany.mockResolvedValue([{ patientReason: "Apaise la bouche sèche.", opportunity: { ruleKey: "rule-ok" }, product: { name: "ELUDAY GENCIVE, flacon" }, presentation: null }]);
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
