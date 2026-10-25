import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La démonstration au comptoir (/demo/comptoir) pilote les VRAIS services du poste de caisse avec la session du
 * présentateur : elle n'existe que dans l'officine de démonstration, et l'officine vient toujours de la session.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  settleAndAnalyse: vi.fn(),
  readCounterNotice: vi.fn(),
  counterTeamFor: vi.fn(),
  decideCounterAdvice: vi.fn(),
  saveCounterEmail: vi.fn(),
  finishCounterSale: vi.fn(),
  composePatientReport: vi.fn(),
  recordCounterScan: vi.fn(),
  recommendationFindFirst: vi.fn(),
  counterPostFindFirst: vi.fn(),
  followUpFindFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/services/counter-settle", () => ({ settleAndAnalyse: mocks.settleAndAnalyse }));
vi.mock("@/server/services/counter-notice", () => ({ readCounterNotice: mocks.readCounterNotice }));
vi.mock("@/server/services/counter-served", () => ({ counterTeamFor: mocks.counterTeamFor, setCounterServedBy: vi.fn() }));
vi.mock("@/server/services/counter-questions", () => ({ answerCounterQuestion: vi.fn() }));
vi.mock("@/server/services/counter-window", () => ({ decideCounterAdvice: mocks.decideCounterAdvice, saveCounterEmail: mocks.saveCounterEmail, finishCounterSale: mocks.finishCounterSale, composePatientReport: mocks.composePatientReport }));
vi.mock("@/server/services/counter-scan", () => ({ recordCounterScan: mocks.recordCounterScan }));
vi.mock("@/server/security/encryption", () => ({ decryptField: (value: string | null) => value }));
vi.mock("@/config/env", () => ({ getEnv: () => ({ APP_URL: "https://pharmaboost.app" }) }));
vi.mock("@/server/db/client", () => ({
  prisma: {
    recommendation: { findFirst: mocks.recommendationFindFirst },
    counterPost: { findFirst: mocks.counterPostFindFirst },
    counterSaleFollowUp: { findFirst: mocks.followUpFindFirst },
  },
}));

const { demoCounterNoticeAction, demoCounterWordAction, demoCounterSellAction, demoCounterFinishAction } = await import("../demo-counter");

const session = (overrides: { slug?: string; isDemo?: boolean } = {}) => ({
  pharmacy: { slug: overrides.slug ?? "pharmacie-demo-pharmaboost", isDemo: overrides.isDemo ?? true },
  scope: { pharmacyId: "ph_demo", organizationId: "org_demo", userId: "usr_1", isDemo: overrides.isDemo ?? true },
});

const notice = (items: { id: string; name: string; outcome: string }[] = []) => ({
  status: "VERIFIED",
  notice: { ok: true, state: "READY", title: "Vente 12", subject: "CETIRIZINE", advice: [], alerts: [], signature: "s1", items: items.map((item) => ({ drug: "CETIRIZINE", challenge: null, shortDateOn: null, priceCents: 690, reason: "Nez", availability: "IN_STOCK", quantity: 12, imageUrl: null, sheet: null, ...item })) },
  followUp: { emailSaved: false },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePermission.mockResolvedValue(session());
  mocks.readCounterNotice.mockResolvedValue(notice([{ id: "rec_1", name: "Spray nasal", outcome: "NONE" }]));
  mocks.counterTeamFor.mockResolvedValue({ team: [], servedBy: null });
});

describe("démo au comptoir", () => {
  it("refuse toute autre officine avant la moindre lecture", async () => {
    for (const other of [session({ isDemo: false }), session({ slug: "pharmacie-saint-michel" })]) {
      mocks.requirePermission.mockResolvedValue(other);
      for (const result of [
        await demoCounterNoticeAction({ prescriptionId: "rx_1" }),
        await demoCounterWordAction({ prescriptionId: "rx_1", word: "VENDU", argument: "rec_1" }),
        await demoCounterSellAction({ prescriptionId: "rx_1", recommendationId: "rec_1" }),
        await demoCounterFinishAction({ prescriptionId: "rx_1" }),
      ]) {
        expect(result).toEqual({ ok: false, error: "Ce geste n'existe que dans l'officine de démonstration." });
      }
    }
    expect(mocks.settleAndAnalyse).not.toHaveBeenCalled();
    expect(mocks.readCounterNotice).not.toHaveBeenCalled();
    expect(mocks.decideCounterAdvice).not.toHaveBeenCalled();
    expect(mocks.recordCounterScan).not.toHaveBeenCalled();
    expect(mocks.finishCounterSale).not.toHaveBeenCalled();
  });

  it("analyse la vente de l'officine DE LA SESSION et rend l'avis comme l'agent l'écrit pour l'île", async () => {
    const result = await demoCounterNoticeAction({ prescriptionId: "rx_1" });
    expect(mocks.settleAndAnalyse).toHaveBeenCalledWith(session().scope, "rx_1");
    expect(mocks.readCounterNotice).toHaveBeenCalledWith("ph_demo", "rx_1");
    expect(result).toMatchObject({ ok: true, data: { ready: true, entry: { id: "rx_1", items: [{ id: "rec_1", name: "Spray nasal", price: "6,90 €" }] } } });
  });

  it("« Vendu » dans l'île passe par le même service que le poste", async () => {
    mocks.decideCounterAdvice.mockResolvedValue({ ok: true, outcome: "SOLD" });
    await demoCounterWordAction({ prescriptionId: "rx_1", word: "VENDU", argument: "rec_1" });
    expect(mocks.decideCounterAdvice).toHaveBeenCalledWith(expect.objectContaining({ scope: session().scope, pharmacyIsDemo: true }), { prescriptionId: "rx_1", recommendationId: "rec_1", outcome: "SOLD" });
  });

  it("biper le produit conseillé = biper son code au poste de démonstration", async () => {
    mocks.recommendationFindFirst.mockResolvedValue({ product: { name: "Spray nasal", ean: "3400900000906" }, presentation: null });
    mocks.counterPostFindFirst.mockResolvedValue({ id: "post_demo" });
    mocks.recordCounterScan.mockResolvedValue({ ok: true });
    const result = await demoCounterSellAction({ prescriptionId: "rx_1", recommendationId: "rec_1" });
    expect(mocks.recommendationFindFirst.mock.calls[0][0].where).toEqual({ id: "rec_1", prescriptionId: "rx_1", pharmacyId: "ph_demo" });
    expect(mocks.recordCounterScan).toHaveBeenCalledWith(expect.objectContaining({ postId: "post_demo" }), expect.objectContaining({ code: "3400900000906", post: "poste-demo" }));
    expect(result).toMatchObject({ ok: true, data: { name: "Spray nasal" } });
  });

  it("« Vente terminée » ferme la vente et rend le bilan pour l'écran, sans rien envoyer", async () => {
    mocks.readCounterNotice.mockResolvedValue(notice([{ id: "rec_1", name: "Spray nasal", outcome: "SOLD" }]));
    mocks.followUpFindFirst.mockResolvedValue({ emailEncrypted: "marie@exemple.fr", consentAt: new Date() });
    mocks.finishCounterSale.mockResolvedValue({ ok: true, alreadyClosed: false, proposed: 1, sold: 1, notSold: 0, unanswered: 0, soldToday: 3, report: "SIMULATED" });
    mocks.composePatientReport.mockResolvedValue({ mail: { subject: "Votre bilan", html: "<p>bilan</p>", text: "bilan" }, pharmacy: { name: "Pharmacie des Lilas" } });
    const result = await demoCounterFinishAction({ prescriptionId: "rx_1" });
    expect(mocks.composePatientReport).toHaveBeenCalledWith(expect.objectContaining({ prescriptionId: "rx_1", email: "marie@exemple.fr", soldIds: ["rec_1"] }));
    expect(result).toMatchObject({ ok: true, data: { done: { badge: "3e conseil vendu aujourd'hui", lines: ["1 vendu · 0 non vendu · 0 sans réponse", "✓ Bilan envoyé au patient."] }, bilan: { to: "marie@exemple.fr", subject: "Votre bilan", from: "Pharmacie des Lilas" } } });
  });

  it("pas de bilan sans adresse ni produit vendu", async () => {
    mocks.followUpFindFirst.mockResolvedValue(null);
    mocks.finishCounterSale.mockResolvedValue({ ok: true, alreadyClosed: false, proposed: 1, sold: 0, notSold: 1, unanswered: 0, soldToday: null, report: "NONE" });
    const result = await demoCounterFinishAction({ prescriptionId: "rx_1" });
    expect(mocks.composePatientReport).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, data: { bilan: null } });
  });
});
