import { describe, expect, it, vi } from "vitest";

/** Un compte gratuit (aucune officine) n'atteint aucun service d'équipe, quoi que le formulaire envoie. */
const services = vi.hoisted(() => ({ createObjective: vi.fn(), proposeBonus: vi.fn(), decideBonus: vi.fn(), archiveObjective: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("@/server/auth/user-session", () => ({ getUserSession: async () => ({ user: { id: "etudiant" }, scope: null, activePharmacy: null }) }));
vi.mock("@/server/services/mobile/personal", () => services);
vi.mock("@/server/services/mobile/coach", () => ({ dismissTrainingSuggestion: vi.fn() }));

const actions = await import("../mobile-personal");

describe("compte gratuit", () => {
  it("objectifs, primes : refusés avant tout service", async () => {
    const form = new FormData();
    form.set("userId", "hugo");
    form.set("title", "Octobre");
    form.set("metric", "ADVICE_SOLD");
    form.set("target", "20");
    form.set("period", "MONTH");
    form.set("label", "Prime");
    form.set("amount", "50");
    expect((await actions.createObjectiveAction(null, form)).ok).toBe(false);
    expect((await actions.proposeBonusAction(null, form)).ok).toBe(false);
    expect((await actions.decideBonusAction({ id: "b1", decision: "VALIDATE" })).ok).toBe(false);
    expect((await actions.archiveObjectiveAction({ id: "o1" })).ok).toBe(false);
    for (const service of Object.values(services)) expect(service).not.toHaveBeenCalled();
  });
});
