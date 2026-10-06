import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les actions de la console « Directeur commercial » : la session
 * administrateur d'abord, la forme des entrées ensuite, l'administrateur
 * toujours tiré de la session (jamais de la demande), et l'issue de
 * l'invitation dite telle quelle.
 */

const mocks = vi.hoisted(() => {
  class SalesDirectorError extends Error {
    constructor(
      readonly code: "EMAIL_TAKEN" | "NOT_FOUND" | "INACTIVE",
      message: string,
    ) {
      super(message);
    }
  }
  return {
    requirePlatformSession: vi.fn(),
    revalidatePath: vi.fn(),
    SalesDirectorError,
    service: { createSalesDirector: vi.fn(), updateSalesDirector: vi.fn(), setSalesDirectorActive: vi.fn(), resendDirectorInvitation: vi.fn(), deleteSalesDirector: vi.fn() },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: mocks.requirePlatformSession }));
vi.mock("@/server/services/sales/directors", () => ({ SalesDirectorError: mocks.SalesDirectorError, ...mocks.service }));

const actions = await import("../admin-sales-director");

const SESSION = { admin: { id: "adm_1", email: "admin@pharma.ai", fullName: "Alice Admin", initials: "AA" }, sessionId: "s_1" };
const PAGE = "/admin/directeur-commercial";

const noServiceCalled = () => Object.values(mocks.service).forEach((fn) => expect(fn).not.toHaveBeenCalled());

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePlatformSession.mockResolvedValue(SESSION);
});

describe("la session administrateur", () => {
  it("sans session (ou avec une session de directeur, de commercial, d'officine), toutes les actions s'arrêtent avant toute lecture ou écriture", async () => {
    const redirected = new Error("NEXT_REDIRECT /admin-connexion");
    mocks.requirePlatformSession.mockRejectedValue(redirected);
    const names = Object.keys(actions).sort();
    expect(names).toEqual(["createSalesDirectorAction", "deleteSalesDirectorAction", "resendDirectorInvitationAction", "setSalesDirectorActiveAction", "updateSalesDirectorAction"]);
    for (const name of names) {
      const action = actions[name as keyof typeof actions] as (payload: unknown) => Promise<unknown>;
      await expect(action({ salesDirectorId: "dir_1", firstName: "Camille", lastName: "Durand", email: "camille@exemple.test", isActive: false })).rejects.toBe(redirected);
    }
    noServiceCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("ajouter un directeur", () => {
  const PAYLOAD = { firstName: " Camille ", lastName: "Durand", email: "  Camille@Exemple.TEST ", phone: "06 12 34 56 78" };

  it("nettoie la saisie, passe l'administrateur de la session et rend l'issue de l'envoi", async () => {
    mocks.service.createSalesDirector.mockResolvedValue({ id: "dir_1", invitation: { status: "SENT", detail: "ok" } });
    const result = await actions.createSalesDirectorAction({ ...PAYLOAD, adminId: "adm_pirate" } as never);

    expect(mocks.service.createSalesDirector).toHaveBeenCalledWith({ firstName: "Camille", lastName: "Durand", email: "camille@exemple.test", phone: "06 12 34 56 78" }, "adm_1");
    expect(result).toEqual({
      ok: true,
      data: { salesDirectorId: "dir_1", email: "camille@exemple.test", invitation: { status: "SENT", detail: "ok" } },
      message: "Camille Durand est ajouté(e) comme directeur commercial. Invitation envoyée à camille@exemple.test.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(PAGE);
  });

  it("e-mail non parti : le compte est créé, mais le message ne prétend PAS que l'invitation est partie", async () => {
    mocks.service.createSalesDirector.mockResolvedValue({ id: "dir_1", invitation: { status: "SIMULATED", detail: "messagerie non branchée." } });
    const result = await actions.createSalesDirectorAction(PAYLOAD);
    expect(result.ok).toBe(true);
    expect(result.ok && result.message).toContain("Invitation NON envoyée : messagerie non branchée.");
    expect(result.ok && result.message).not.toContain("Invitation envoyée");
    expect(result.ok && result.message).not.toContain("..");
  });

  it("refuse une saisie incomplète ou invalide avant d'appeler le service, avec l'erreur sur le champ", async () => {
    expect(await actions.createSalesDirectorAction({ ...PAYLOAD, firstName: "  " })).toMatchObject({ ok: false, error: "Indiquez le prénom.", fieldErrors: { firstName: "Indiquez le prénom." } });
    expect(await actions.createSalesDirectorAction({ ...PAYLOAD, lastName: "" })).toMatchObject({ ok: false, fieldErrors: { lastName: "Indiquez le nom." } });
    expect(await actions.createSalesDirectorAction({ ...PAYLOAD, email: "pas-un-mail" })).toMatchObject({ ok: false, fieldErrors: { email: "Adresse e-mail invalide." } });
    expect(await actions.createSalesDirectorAction({ ...PAYLOAD, email: "" })).toMatchObject({ ok: false, fieldErrors: { email: "Indiquez l'adresse e-mail." } });
    expect(await actions.createSalesDirectorAction({ ...PAYLOAD, phone: "0".repeat(31) })).toMatchObject({ ok: false, fieldErrors: { phone: "30 caractères au plus." } });
    expect(await actions.createSalesDirectorAction({} as never)).toMatchObject({ ok: false });
    noServiceCalled();
  });

  it("l'adresse déjà prise est refusée en clair, sans rafraîchir la page", async () => {
    mocks.service.createSalesDirector.mockRejectedValue(new mocks.SalesDirectorError("EMAIL_TAKEN", "Un directeur commercial existe déjà avec cette adresse e-mail."));
    expect(await actions.createSalesDirectorAction(PAYLOAD)).toEqual({ ok: false, error: "Un directeur commercial existe déjà avec cette adresse e-mail.", fieldErrors: undefined });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("une erreur imprévue remonte (elle n'est pas avalée en « refus »)", async () => {
    mocks.service.createSalesDirector.mockRejectedValue(new Error("base indisponible"));
    await expect(actions.createSalesDirectorAction(PAYLOAD)).rejects.toThrow("base indisponible");
  });
});

describe("corriger l'identité", () => {
  it("passe seulement les champs fournis, l'administrateur vient de la session", async () => {
    mocks.service.updateSalesDirector.mockResolvedValue({ emailChanged: false });
    const result = await actions.updateSalesDirectorAction({ salesDirectorId: "dir_1", firstName: " Camila ", adminId: "adm_pirate" } as never);
    expect(mocks.service.updateSalesDirector).toHaveBeenCalledWith("dir_1", { firstName: "Camila" }, "adm_1");
    expect(result).toEqual({ ok: true, data: { emailChanged: false }, message: "Directeur mis à jour." });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(PAGE);
  });

  it("une adresse modifiée rappelle qu'il faut renvoyer l'invitation", async () => {
    mocks.service.updateSalesDirector.mockResolvedValue({ emailChanged: true });
    const result = await actions.updateSalesDirectorAction({ salesDirectorId: "dir_1", email: "Nouvelle@Exemple.test" });
    expect(mocks.service.updateSalesDirector).toHaveBeenCalledWith("dir_1", { email: "nouvelle@exemple.test" }, "adm_1");
    expect(result.ok && result.message).toContain("Renvoyez l'invitation");
  });

  it("refuse une adresse invalide ou un identifiant absent", async () => {
    expect(await actions.updateSalesDirectorAction({ salesDirectorId: "dir_1", email: "x" })).toMatchObject({ ok: false, fieldErrors: { email: "Adresse e-mail invalide." } });
    expect(await actions.updateSalesDirectorAction({ salesDirectorId: "" })).toMatchObject({ ok: false });
    noServiceCalled();
  });

  it("dit en clair pourquoi le service a refusé", async () => {
    mocks.service.updateSalesDirector.mockRejectedValueOnce(new mocks.SalesDirectorError("NOT_FOUND", "Directeur commercial introuvable. Rechargez la page."));
    expect(await actions.updateSalesDirectorAction({ salesDirectorId: "dir_1", firstName: "X" })).toMatchObject({ ok: false, error: "Directeur commercial introuvable. Rechargez la page." });
  });
});

describe("désactiver / réactiver", () => {
  it("désactive pour l'administrateur de la session et dit que les sessions sont fermées", async () => {
    mocks.service.setSalesDirectorActive.mockResolvedValue({ changed: true });
    const result = await actions.setSalesDirectorActiveAction({ salesDirectorId: "dir_1", isActive: false });
    expect(mocks.service.setSalesDirectorActive).toHaveBeenCalledWith("dir_1", false, "adm_1");
    expect(result).toEqual({ ok: true, data: { changed: true }, message: "Compte désactivé : ses sessions sont fermées." });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(PAGE);
  });

  it("réactive, ou dit que rien n'a changé quand l'état était déjà celui demandé", async () => {
    mocks.service.setSalesDirectorActive.mockResolvedValueOnce({ changed: true }).mockResolvedValueOnce({ changed: false }).mockResolvedValueOnce({ changed: false });
    expect((await actions.setSalesDirectorActiveAction({ salesDirectorId: "dir_1", isActive: true })) as { message: string }).toMatchObject({ message: "Compte réactivé." });
    expect((await actions.setSalesDirectorActiveAction({ salesDirectorId: "dir_1", isActive: true })) as { message: string }).toMatchObject({ message: "Ce compte était déjà actif : rien n'a changé." });
    expect((await actions.setSalesDirectorActiveAction({ salesDirectorId: "dir_1", isActive: false })) as { message: string }).toMatchObject({ message: "Ce compte était déjà désactivé : rien n'a changé." });
  });

  it("refuse une demande mal formée ou un compte inconnu", async () => {
    expect(await actions.setSalesDirectorActiveAction({ salesDirectorId: "dir_1", isActive: "oui" } as never)).toMatchObject({ ok: false, error: "Directeur introuvable." });
    expect(await actions.setSalesDirectorActiveAction({ salesDirectorId: "", isActive: true })).toMatchObject({ ok: false });
    noServiceCalled();
    mocks.service.setSalesDirectorActive.mockRejectedValue(new mocks.SalesDirectorError("NOT_FOUND", "Directeur commercial introuvable. Rechargez la page."));
    expect(await actions.setSalesDirectorActiveAction({ salesDirectorId: "dir_x", isActive: true })).toMatchObject({ ok: false, error: expect.stringContaining("introuvable") });
  });
});

describe("renvoyer l'invitation", () => {
  it("envoyée : succès, pour l'administrateur de la session", async () => {
    mocks.service.resendDirectorInvitation.mockResolvedValue({ status: "SENT", detail: "ok" });
    const result = await actions.resendDirectorInvitationAction({ salesDirectorId: "dir_1" });
    expect(mocks.service.resendDirectorInvitation).toHaveBeenCalledWith("dir_1", "adm_1");
    expect(result).toEqual({ ok: true, data: { invitation: { status: "SENT", detail: "ok" } }, message: "Invitation renvoyée." });
  });

  it("non envoyée : ce n'est pas un succès, la raison est dite", async () => {
    mocks.service.resendDirectorInvitation.mockResolvedValue({ status: "FAILED", detail: "adresse refusée." });
    expect(await actions.resendDirectorInvitationAction({ salesDirectorId: "dir_1" })).toEqual({ ok: false, error: "Invitation NON envoyée : adresse refusée.", fieldErrors: undefined });
  });

  it("compte désactivé : le refus du service est rendu tel quel", async () => {
    mocks.service.resendDirectorInvitation.mockRejectedValue(new mocks.SalesDirectorError("INACTIVE", "Ce compte est désactivé : réactivez-le avant de renvoyer l'invitation."));
    expect(await actions.resendDirectorInvitationAction({ salesDirectorId: "dir_1" })).toMatchObject({ ok: false, error: expect.stringContaining("réactivez-le") });
  });

  it("identifiant absent : refus avant le service", async () => {
    expect(await actions.resendDirectorInvitationAction({ salesDirectorId: "" })).toMatchObject({ ok: false, error: "Directeur introuvable." });
    noServiceCalled();
  });
});

describe("supprimer", () => {
  it("supprime pour l'administrateur de la session et rafraîchit la liste", async () => {
    mocks.service.deleteSalesDirector.mockResolvedValue(undefined);
    const result = await actions.deleteSalesDirectorAction({ salesDirectorId: "dir_1" });
    expect(mocks.service.deleteSalesDirector).toHaveBeenCalledWith("dir_1", "adm_1");
    expect(result).toEqual({ ok: true, data: null, message: "Directeur commercial supprimé. Il ne peut plus se connecter." });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(PAGE);
  });

  it("compte déjà supprimé : refus lisible, liste non rafraîchie par l'action", async () => {
    mocks.service.deleteSalesDirector.mockRejectedValue(new mocks.SalesDirectorError("NOT_FOUND", "Directeur commercial introuvable. Rechargez la page."));
    expect(await actions.deleteSalesDirectorAction({ salesDirectorId: "dir_1" })).toMatchObject({ ok: false, error: "Directeur commercial introuvable. Rechargez la page." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("identifiant absent : refus avant le service", async () => {
    expect(await actions.deleteSalesDirectorAction({} as never)).toMatchObject({ ok: false });
    noServiceCalled();
  });
});
