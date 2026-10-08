import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADVICE_RULES } from "@/core/ai/engines/advice";

/**
 * La relecture des règles de conseil côté serveur : ce que la pharmacienne décide, signé et daté, pour SON officine,
 * sur une règle qui existe vraiment.
 */

const mocks = vi.hoisted(() => ({
  prisma: { adviceRuleReview: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() } },
  recordAudit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));

import { listRuleReviews, loadRuleReviews, setRuleDecision } from "../advice-rule-reviews";

const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_1" };
const RULE = ADVICE_RULES[0];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.adviceRuleReview.findMany.mockResolvedValue([]);
});

describe("lire les décisions", () => {
  it("ne lit que celles de l'officine", async () => {
    mocks.prisma.adviceRuleReview.findMany.mockResolvedValue([{ ruleKey: RULE.key, ruleVersion: RULE.version, decision: "VALIDATED" }]);
    expect(await loadRuleReviews("ph_1")).toEqual([{ ruleKey: RULE.key, ruleVersion: RULE.version, decision: "VALIDATED" }]);
    expect(mocks.prisma.adviceRuleReview.findMany.mock.calls[0][0].where).toEqual({ pharmacyId: "ph_1" });
  });

  it("dit l'état de chacune des règles du moteur : à relire par défaut", async () => {
    const all = await listRuleReviews(SCOPE);
    expect(all).toHaveLength(ADVICE_RULES.length);
    expect(all.every((rule) => rule.state === "TO_REVIEW")).toBe(true);
    expect(all[0]).toMatchObject({ key: RULE.key, title: RULE.title, version: RULE.version, decidedBy: null, outdated: false });
  });

  it("montre qui a décidé et quand ; une règle modifiée depuis est « à relire » et dit qu'elle a changé", async () => {
    const decidedAt = new Date("2026-10-09T10:00:00Z");
    mocks.prisma.adviceRuleReview.findMany.mockResolvedValue([
      { ruleKey: ADVICE_RULES[0].key, ruleVersion: ADVICE_RULES[0].version, decision: "REJECTED", decidedAt, decidedBy: { firstName: "Donna", lastName: "Benveniste" } },
      { ruleKey: ADVICE_RULES[1].key, ruleVersion: "0.0-ancienne", decision: "VALIDATED", decidedAt, decidedBy: { firstName: "Donna", lastName: "Benveniste" } },
    ]);
    const [first, second] = await listRuleReviews(SCOPE);
    expect(first).toMatchObject({ state: "REJECTED", decidedBy: "Donna Benveniste", decidedAt, outdated: false });
    expect(second).toMatchObject({ state: "TO_REVIEW", decidedBy: null, decidedAt: null, outdated: true });
  });
});

describe("décider", () => {
  it("valide ou refuse la règle pour l'officine, sur sa version actuelle, signé, et le trace", async () => {
    expect(await setRuleDecision(SCOPE, RULE.key, "REJECTED")).toEqual({ ok: true, title: RULE.title });
    const call = mocks.prisma.adviceRuleReview.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ pharmacyId_ruleKey: { pharmacyId: "ph_1", ruleKey: RULE.key } });
    expect(call.create).toMatchObject({ pharmacyId: "ph_1", ruleKey: RULE.key, ruleVersion: RULE.version, decision: "REJECTED", decidedByUserId: "u_1" });
    expect(call.update).toMatchObject({ ruleVersion: RULE.version, decision: "REJECTED", decidedByUserId: "u_1" });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "advice_rule.reviewed", entityId: RULE.key, pharmacyId: "ph_1", userId: "u_1", metadata: { ruleKey: RULE.key, ruleVersion: RULE.version, decision: "REJECTED" } }));
  });

  it("remet une règle « à relire » : la décision est effacée, dans cette officine seulement", async () => {
    expect(await setRuleDecision(SCOPE, RULE.key, null)).toMatchObject({ ok: true });
    expect(mocks.prisma.adviceRuleReview.deleteMany).toHaveBeenCalledWith({ where: { pharmacyId: "ph_1", ruleKey: RULE.key } });
    expect(mocks.prisma.adviceRuleReview.upsert).not.toHaveBeenCalled();
  });

  it("refuse une règle qui n'existe pas : rien n'est écrit", async () => {
    expect(await setRuleDecision(SCOPE, "regle-inventee", "VALIDATED")).toEqual({ ok: false, error: "Règle de conseil inconnue." });
    expect(mocks.prisma.adviceRuleReview.upsert).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});
