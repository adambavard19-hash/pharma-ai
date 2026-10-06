import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les actions du directeur sur les candidatures : session du directeur d'abord,
 * acteur « directeur » tiré de la session, jamais de la demande.
 */

const mocks = vi.hoisted(() => ({
  requireDirectorSession: vi.fn(),
  revalidatePath: vi.fn(),
  service: { moveSalesApplication: vi.fn(), addSalesApplicationNote: vi.fn(), convertSalesApplication: vi.fn() },
  forgetUnsentInvitation: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/director-session", () => ({ requireDirectorSession: mocks.requireDirectorSession }));
vi.mock("@/server/services/sales-applications/admin", () => mocks.service);
vi.mock("@/server/services/sales/director-team", () => ({ forgetUnsentInvitation: mocks.forgetUnsentInvitation }));

const actions = await import("../director-applications");

const SESSION = { director: { id: "dir_1", email: "directrice@exemple.fr", firstName: "Diane", lastName: "Directrice", fullName: "Diane Directrice", initials: "DD" }, sessionId: "s_1" };
const ACTOR = { type: "DIRECTOR", id: "dir_1", label: "Diane Directrice" };

const noServiceCalled = () => Object.values(mocks.service).forEach((fn) => expect(fn).not.toHaveBeenCalled());

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireDirectorSession.mockResolvedValue(SESSION);
});

describe("la session du directeur", () => {
  it("sans session, toutes les actions s'arrêtent avant toute lecture ou écriture", async () => {
    const redirected = new Error("NEXT_REDIRECT /directeur/connexion");
    mocks.requireDirectorSession.mockRejectedValue(redirected);
    const names = Object.keys(actions).sort();
    expect(names).toEqual(["addApplicationNoteAction", "convertApplicationAction", "moveApplicationAction"]);
    for (const name of names) {
      const action = actions[name as keyof typeof actions] as (payload: unknown) => Promise<unknown>;
      await expect(action({})).rejects.toBe(redirected);
    }
    noServiceCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("changer le statut", () => {
  it("passe l'acteur directeur de la session, jamais un identifiant de la demande", async () => {
    mocks.service.moveSalesApplication.mockResolvedValue({ ok: true, from: "NEW", to: "INTERVIEW" });
    const result = await actions.moveApplicationAction({ id: "app_1", to: "INTERVIEW", adminId: "adm_pirate", actor: { type: "ADMIN", id: "adm_pirate" } } as never);
    expect(result).toEqual({ ok: true, data: null, message: "Candidature passée en « Entretien »." });
    expect(mocks.service.moveSalesApplication).toHaveBeenCalledWith("app_1", "INTERVIEW", ACTOR);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/directeur/candidatures");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/directeur/candidatures/app_1");
  });

  it("refuse un statut inconnu ou un identifiant absent avant d'appeler le service", async () => {
    expect(await actions.moveApplicationAction({ id: "app_1", to: "HIRED" } as never)).toMatchObject({ ok: false });
    expect(await actions.moveApplicationAction({ id: "", to: "NEW" })).toMatchObject({ ok: false });
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
      const result = await actions.moveApplicationAction({ id: "app_1", to: "REFUSED" });
      expect(result).toMatchObject({ ok: false });
      expect(!result.ok && result.error).toContain(text);
    }
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("ajouter une note", () => {
  it("nettoie la note et passe l'acteur directeur", async () => {
    mocks.service.addSalesApplicationNote.mockResolvedValue({ ok: true, eventId: "evt_1" });
    const result = await actions.addApplicationNoteAction({ id: "app_1", note: "  Appelée : motivée.  " });
    expect(result).toEqual({ ok: true, data: null, message: "Note ajoutée à l'historique." });
    expect(mocks.service.addSalesApplicationNote).toHaveBeenCalledWith("app_1", "Appelée : motivée.", ACTOR);
  });

  it("refuse une note vide ou trop longue, et dit si la candidature n'existe pas", async () => {
    expect(await actions.addApplicationNoteAction({ id: "app_1", note: "   " })).toMatchObject({ ok: false });
    expect(await actions.addApplicationNoteAction({ id: "app_1", note: "x".repeat(4001) })).toMatchObject({ ok: false });
    noServiceCalled();
    mocks.service.addSalesApplicationNote.mockResolvedValue({ ok: false });
    expect(await actions.addApplicationNoteAction({ id: "app_x", note: "Bonjour" })).toMatchObject({ ok: false, error: "Candidature introuvable." });
  });
});

describe("transformer en commercial", () => {
  it("passe l'acteur directeur et dit l'invitation envoyée", async () => {
    mocks.service.convertSalesApplication.mockResolvedValue({ ok: true, salesRepId: "rep_9", name: "Marie Dupont", commissionCents: 25000, invitation: { status: "SENT", detail: "ok" } });
    const result = await actions.convertApplicationAction({ id: "app_1", invite: true });
    expect(mocks.service.convertSalesApplication).toHaveBeenCalledWith("app_1", ACTOR, { invite: true });
    expect(result).toEqual({ ok: true, data: { salesRepId: "rep_9" }, message: "Marie Dupont est maintenant commercial(e). Invitation envoyée." });
    expect(mocks.forgetUnsentInvitation).not.toHaveBeenCalled();
    for (const path of ["/directeur/candidatures/app_1", "/directeur/commerciaux", "/admin/commerciaux"]) expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
  });

  it("une invitation qui ne part pas est dite NON envoyée, et la fiche ne dit pas « invité le »", async () => {
    mocks.service.convertSalesApplication.mockResolvedValue({ ok: true, salesRepId: "rep_9", name: "Marie Dupont", commissionCents: 25000, invitation: { status: "FAILED", detail: "l'envoi a échoué" } });
    const result = await actions.convertApplicationAction({ id: "app_1" });
    expect(result).toMatchObject({ ok: true, message: "Marie Dupont est maintenant commercial(e). Invitation NON envoyée : l'envoi a échoué" });
    expect(mocks.forgetUnsentInvitation).toHaveBeenCalledWith("rep_9");
  });

  it("sans invitation demandée : dit qu'aucune invitation n'est partie", async () => {
    mocks.service.convertSalesApplication.mockResolvedValue({ ok: true, salesRepId: "rep_9", name: "Marie Dupont", commissionCents: 25000, invitation: null });
    expect(await actions.convertApplicationAction({ id: "app_1", invite: false })).toMatchObject({ message: "Marie Dupont est maintenant commercial(e). Aucune invitation envoyée." });
    expect(mocks.forgetUnsentInvitation).not.toHaveBeenCalled();
  });

  it("dit en français pourquoi le service a refusé", async () => {
    for (const [reason, text] of [
      ["NOT_FOUND", "introuvable"],
      ["NOT_ACCEPTED", "Acceptez d'abord"],
      ["ALREADY_CONVERTED", "déjà été transformée"],
      ["EMAIL_TAKEN", "existe déjà"],
      ["INVALID", "ne permettent pas"],
      ["CONFLICT", "changé entre-temps"],
    ] as const) {
      mocks.service.convertSalesApplication.mockResolvedValueOnce({ ok: false, reason });
      const result = await actions.convertApplicationAction({ id: "app_1" });
      expect(result).toMatchObject({ ok: false });
      expect(!result.ok && result.error).toContain(text);
    }
  });

  it("une demande invalide n'appelle pas le service", async () => {
    expect(await actions.convertApplicationAction({ id: "" })).toMatchObject({ ok: false });
    noServiceCalled();
  });
});
