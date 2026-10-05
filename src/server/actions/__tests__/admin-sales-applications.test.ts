import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les actions de la console « Candidatures commerciales » : la session
 * administrateur d'abord, la forme des entrées ensuite, et jamais un
 * identifiant d'administrateur pris dans la demande.
 */

const mocks = vi.hoisted(() => ({
  requirePlatformSession: vi.fn(),
  revalidatePath: vi.fn(),
  service: { moveSalesApplication: vi.fn(), addSalesApplicationNote: vi.fn(), convertSalesApplication: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: mocks.requirePlatformSession }));
vi.mock("@/server/services/sales-applications/admin", () => mocks.service);

const actions = await import("../admin-sales-applications");

const SESSION = { admin: { id: "adm_1", email: "admin@pharma.ai", fullName: "Alice Admin", initials: "AA" }, sessionId: "s_1" };

const noServiceCalled = () => Object.values(mocks.service).forEach((fn) => expect(fn).not.toHaveBeenCalled());

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePlatformSession.mockResolvedValue(SESSION);
});

describe("la session administrateur", () => {
  it("sans session, toutes les actions s'arrêtent avant toute lecture ou écriture", async () => {
    const redirected = new Error("NEXT_REDIRECT /admin-connexion");
    mocks.requirePlatformSession.mockRejectedValue(redirected);
    const names = Object.keys(actions).sort();
    expect(names).toEqual(["addSalesApplicationNoteAction", "convertSalesApplicationAction", "moveSalesApplicationAction"]);
    for (const name of names) {
      const action = actions[name as keyof typeof actions] as (payload: unknown) => Promise<unknown>;
      await expect(action({ id: "app_1", to: "ACCEPTED", note: "Bonjour", invite: true })).rejects.toBe(redirected);
    }
    noServiceCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("changer le statut", () => {
  it("passe l'administrateur de la session, jamais un identifiant de la demande", async () => {
    mocks.service.moveSalesApplication.mockResolvedValue({ ok: true, from: "NEW", to: "INTERVIEW" });
    const result = await actions.moveSalesApplicationAction({ id: "app_1", to: "INTERVIEW", adminId: "adm_pirate" } as never);
    expect(result).toEqual({ ok: true, data: null, message: "Candidature passée en « Entretien »." });
    expect(mocks.service.moveSalesApplication).toHaveBeenCalledWith("app_1", "INTERVIEW", "adm_1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/candidatures-commerciales");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/candidatures-commerciales/app_1");
  });

  it("refuse un statut inconnu ou un identifiant absent avant d'appeler le service", async () => {
    expect(await actions.moveSalesApplicationAction({ id: "app_1", to: "HIRED" } as never)).toMatchObject({ ok: false });
    expect(await actions.moveSalesApplicationAction({ id: "", to: "NEW" })).toMatchObject({ ok: false });
    noServiceCalled();
  });

  it("dit en français pourquoi le service a refusé", async () => {
    for (const [reason, text] of [
      ["NOT_FOUND", "introuvable"],
      ["SAME_STATUS", "déjà ce statut"],
      ["CONVERTED", "déjà devenue un commercial"],
      ["CONFLICT", "changé entre-temps"],
    ] as const) {
      mocks.service.moveSalesApplication.mockResolvedValueOnce({ ok: false, reason });
      const result = await actions.moveSalesApplicationAction({ id: "app_1", to: "REFUSED" });
      expect(result).toMatchObject({ ok: false });
      expect(!result.ok && result.error).toContain(text);
    }
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("ajouter une note", () => {
  it("nettoie la note, passe l'administrateur de la session", async () => {
    mocks.service.addSalesApplicationNote.mockResolvedValue({ ok: true, eventId: "evt_1" });
    const result = await actions.addSalesApplicationNoteAction({ id: "app_1", note: "  Rappeler lundi  " });
    expect(result).toMatchObject({ ok: true });
    expect(mocks.service.addSalesApplicationNote).toHaveBeenCalledWith("app_1", "Rappeler lundi", "adm_1");
  });

  it("refuse une note vide ou trop longue, avec l'erreur sur le champ", async () => {
    const empty = await actions.addSalesApplicationNoteAction({ id: "app_1", note: "   " });
    expect(empty).toMatchObject({ ok: false, fieldErrors: { note: "Écrivez la note." } });
    const long = await actions.addSalesApplicationNoteAction({ id: "app_1", note: "x".repeat(4001) });
    expect(long).toMatchObject({ ok: false, fieldErrors: { note: "4 000 caractères au plus." } });
    noServiceCalled();
  });

  it("candidature introuvable : refus clair", async () => {
    mocks.service.addSalesApplicationNote.mockResolvedValue({ ok: false });
    expect(await actions.addSalesApplicationNoteAction({ id: "app_1", note: "Bonjour" })).toEqual({ ok: false, error: "Candidature introuvable.", fieldErrors: undefined });
  });
});

describe("transformer en commercial", () => {
  it("crée le commercial pour l'administrateur de la session et le dit, invitation comprise", async () => {
    mocks.service.convertSalesApplication.mockResolvedValue({ ok: true, salesRepId: "rep_1", name: "Marie Dupont", commissionCents: 25000, invitation: { status: "SENT", detail: "ok" } });
    const result = await actions.convertSalesApplicationAction({ id: "app_1", invite: true });
    expect(mocks.service.convertSalesApplication).toHaveBeenCalledWith("app_1", "adm_1", { invite: true });
    expect(result).toEqual({ ok: true, data: { salesRepId: "rep_1" }, message: "Marie Dupont est maintenant commercial(e). Invitation envoyée." });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/commerciaux");
  });

  it("une invitation non envoyée est dite, une invitation non demandée aussi", async () => {
    mocks.service.convertSalesApplication.mockResolvedValueOnce({ ok: true, salesRepId: "rep_1", name: "Marie Dupont", commissionCents: 25000, invitation: { status: "SIMULATED", detail: "messagerie non branchée" } });
    const notSent = await actions.convertSalesApplicationAction({ id: "app_1" });
    expect(notSent.ok && notSent.message).toContain("Invitation NON envoyée : messagerie non branchée");
    mocks.service.convertSalesApplication.mockResolvedValueOnce({ ok: true, salesRepId: "rep_1", name: "Marie Dupont", commissionCents: 25000, invitation: null });
    const none = await actions.convertSalesApplicationAction({ id: "app_1", invite: false });
    expect(none.ok && none.message).toContain("Aucune invitation envoyée.");
  });

  it("dit en français pourquoi le service a refusé", async () => {
    for (const [result, text] of [
      [{ reason: "NOT_FOUND" }, "introuvable"],
      [{ reason: "NOT_ACCEPTED" }, "Acceptez d'abord"],
      [{ reason: "ALREADY_CONVERTED", salesRepId: "rep_1" }, "déjà été transformée"],
      [{ reason: "EMAIL_TAKEN" }, "Un commercial existe déjà avec cette adresse e-mail."],
      [{ reason: "INVALID", detail: "adresse e-mail invalide" }, "adresse e-mail invalide"],
      [{ reason: "CONFLICT" }, "changé entre-temps"],
    ] as const) {
      mocks.service.convertSalesApplication.mockResolvedValueOnce({ ok: false, ...result });
      const outcome = await actions.convertSalesApplicationAction({ id: "app_1" });
      expect(outcome).toMatchObject({ ok: false });
      expect(!outcome.ok && outcome.error).toContain(text);
    }
  });

  it("refuse un identifiant absent avant d'appeler le service", async () => {
    expect(await actions.convertSalesApplicationAction({ id: "" })).toMatchObject({ ok: false });
    noServiceCalled();
  });
});
