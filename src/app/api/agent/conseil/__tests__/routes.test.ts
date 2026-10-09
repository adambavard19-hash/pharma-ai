import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les trois gestes de la fenêtre du poste : « Vendu / Non vendu », l'e-mail du patient, « Vente terminée ».
 * Les routes ne font que vérifier la clé du poste et la forme de la demande ; la règle est éprouvée dans le service.
 */
const m = vi.hoisted(() => ({
  authenticateAgent: vi.fn(),
  decideCounterAdvice: vi.fn(),
  saveCounterEmail: vi.fn(),
  finishCounterSale: vi.fn(),
  readCounterNotice: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/services/stock-sync", () => ({ authenticateAgent: m.authenticateAgent }));
vi.mock("@/server/services/counter-window", () => ({ decideCounterAdvice: m.decideCounterAdvice, saveCounterEmail: m.saveCounterEmail, finishCounterSale: m.finishCounterSale }));
vi.mock("@/server/services/counter-notice", () => ({ readCounterNotice: m.readCounterNotice }));

const decision = await import("../decision/route");
const email = await import("../email/route");
const finish = await import("../terminer/route");

const agent = { scope: { pharmacyId: "ph1", organizationId: "org1", userId: "u1" } };
const post = (url: string, body: unknown, key: string | null = "cle-du-poste-0123456789") =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  m.authenticateAgent.mockResolvedValue(agent);
  m.readCounterNotice.mockResolvedValue({ notice: { items: [{ id: "r1", outcome: "SOLD" }] } });
});

describe("sans clé de poste valide, rien ne passe", () => {
  it("refuse les trois gestes", async () => {
    m.authenticateAgent.mockResolvedValue(null);
    expect((await decision.POST(post("/api/agent/conseil/decision", {}, null))).status).toBe(401);
    expect((await email.POST(post("/api/agent/conseil/email", {}, null))).status).toBe(401);
    expect((await finish.POST(post("/api/agent/conseil/terminer", {}, null))).status).toBe(401);
    expect(m.decideCounterAdvice).not.toHaveBeenCalled();
    expect(m.saveCounterEmail).not.toHaveBeenCalled();
    expect(m.finishCounterSale).not.toHaveBeenCalled();
  });
});

describe("« Vendu » / « Non vendu »", () => {
  it("transmet la réponse du pharmacien et renvoie les conseils à jour", async () => {
    m.decideCounterAdvice.mockResolvedValue({ ok: true, outcome: "SOLD", changed: true });
    const response = await decision.POST(post("/api/agent/conseil/decision", { prescription: "sale1", recommendation: "r1", outcome: "SOLD" }));
    expect(response.status).toBe(200);
    expect(m.decideCounterAdvice).toHaveBeenCalledWith(agent, { prescriptionId: "sale1", recommendationId: "r1", outcome: "SOLD" });
    expect(await response.json()).toEqual({ ok: true, outcome: "SOLD", items: [{ id: "r1", outcome: "SOLD" }] });
  });

  it("refuse une demande incomplète ou une réponse inconnue", async () => {
    for (const body of [{}, { prescription: "s", recommendation: "r" }, { prescription: "s", recommendation: "r", outcome: "VENDU" }, "pas du json"]) {
      expect((await decision.POST(post("/api/agent/conseil/decision", body))).status).toBe(400);
    }
    expect(m.decideCounterAdvice).not.toHaveBeenCalled();
  });

  it("dit non (422) quand le service refuse, avec sa raison", async () => {
    m.decideCounterAdvice.mockResolvedValue({ ok: false, error: "Cette vente est terminée." });
    const response = await decision.POST(post("/api/agent/conseil/decision", { prescription: "sale1", recommendation: "r1", outcome: "SOLD" }));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("Cette vente est terminée.");
  });
});

describe("l'e-mail du patient", () => {
  it("n'envoie le consentement que s'il est explicitement vrai", async () => {
    m.saveCounterEmail.mockResolvedValue({ ok: true, saved: true });
    await email.POST(post("/api/agent/conseil/email", { prescription: "sale1", email: " jean@gmail.com ", consent: true }));
    expect(m.saveCounterEmail).toHaveBeenLastCalledWith(agent, { prescriptionId: "sale1", email: "jean@gmail.com", consent: true });
    await email.POST(post("/api/agent/conseil/email", { prescription: "sale1", email: "jean@gmail.com", consent: "oui" }));
    expect(m.saveCounterEmail).toHaveBeenLastCalledWith(agent, { prescriptionId: "sale1", email: "jean@gmail.com", consent: false });
  });

  it("retire l'adresse quand elle est vide, refuse sans vente", async () => {
    m.saveCounterEmail.mockResolvedValue({ ok: true, saved: false });
    await email.POST(post("/api/agent/conseil/email", { prescription: "sale1", email: "   ", consent: false }));
    expect(m.saveCounterEmail).toHaveBeenLastCalledWith(agent, { prescriptionId: "sale1", email: null, consent: false });
    expect((await email.POST(post("/api/agent/conseil/email", { email: "a@b.fr", consent: true }))).status).toBe(400);
  });

  it("répond 422 quand l'adresse est refusée", async () => {
    m.saveCounterEmail.mockResolvedValue({ ok: false, error: "Cette adresse e-mail ne semble pas valide." });
    expect((await email.POST(post("/api/agent/conseil/email", { prescription: "sale1", email: "x", consent: true }))).status).toBe(422);
  });
});

describe("« Vente terminée »", () => {
  it("renvoie le résumé enregistré", async () => {
    const summary = { ok: true, alreadyClosed: false, proposed: 3, sold: 1, notSold: 1, unanswered: 1, soldToday: 18, report: "SENT" };
    m.finishCounterSale.mockResolvedValue(summary);
    const response = await finish.POST(post("/api/agent/conseil/terminer", { prescription: "sale1" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
    expect(m.finishCounterSale).toHaveBeenCalledWith(agent, { prescriptionId: "sale1" });
  });

  it("refuse sans vente, et dit 422 pour une vente inconnue", async () => {
    expect((await finish.POST(post("/api/agent/conseil/terminer", {}))).status).toBe(400);
    m.finishCounterSale.mockResolvedValue({ ok: false, error: "Vente inconnue pour ce poste." });
    expect((await finish.POST(post("/api/agent/conseil/terminer", { prescription: "autre" }))).status).toBe(422);
  });
});
