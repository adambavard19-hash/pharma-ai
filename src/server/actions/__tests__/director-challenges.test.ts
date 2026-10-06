import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les actions « challenges » du directeur : la session du directeur d'abord
 * (celle d'un commercial, d'un administrateur ou d'une officine n'ouvre rien),
 * la forme de la demande ensuite, et jamais une identité prise dans la demande.
 */

const mocks = vi.hoisted(() => ({
  requireDirectorSession: vi.fn(),
  revalidatePath: vi.fn(),
  service: { createChallenge: vi.fn(), updateChallenge: vi.fn(), endChallenge: vi.fn(), deleteChallenge: vi.fn() },
  cookies: new Map<string, string>(),
  sessionLookup: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (mocks.cookies.has(name) ? { value: mocks.cookies.get(name) } : undefined), set: vi.fn(), delete: vi.fn() }) }));
vi.mock("@/server/db/client", () => ({ prisma: { salesDirectorSession: { findUnique: mocks.sessionLookup } } }));
vi.mock("@/server/auth/director-session", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth/director-session")>("@/server/auth/director-session");
  return { ...actual, requireDirectorSession: mocks.requireDirectorSession };
});
vi.mock("@/server/services/sales/challenges", () => mocks.service);

const actions = await import("../director-challenges");
const real = await vi.importActual<typeof import("@/server/auth/director-session")>("@/server/auth/director-session");

const SESSION = { director: { id: "dir_1", email: "dora@exemple.fr", firstName: "Dora", lastName: "Directrice", fullName: "Dora Directrice", initials: "DD" }, sessionId: "s_1" };
const FORM = { title: "Octobre des démos", description: "", metric: "DEMOS_DONE", target: "5", startsDay: "2026-10-01", endsDay: "2026-10-31", rewardLabel: "Prime de 200 €", rewardEuros: "200" };
const ACTOR = { type: "DIRECTOR", id: "dir_1", label: "Dora Directrice" };

const noServiceCalled = () => Object.values(mocks.service).forEach((fn) => expect(fn).not.toHaveBeenCalled());

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookies.clear();
  mocks.requireDirectorSession.mockResolvedValue(SESSION);
});

describe("la session du directeur", () => {
  it("sans session, toutes les actions s'arrêtent avant toute lecture, écriture ou revalidation", async () => {
    const redirected = new Error("NEXT_REDIRECT /directeur/connexion");
    mocks.requireDirectorSession.mockRejectedValue(redirected);
    const names = Object.keys(actions).sort();
    expect(names).toEqual(["createChallengeAction", "deleteChallengeAction", "endChallengeAction", "updateChallengeAction"]);
    for (const name of names) {
      const action = actions[name as keyof typeof actions] as (payload: unknown) => Promise<unknown>;
      await expect(action({ ...FORM, id: "ch_1" })).rejects.toBe(redirected);
    }
    noServiceCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("une session de commercial, d'administrateur ou d'officine n'ouvre PAS l'espace du directeur", async () => {
    mocks.requireDirectorSession.mockImplementation(real.requireDirectorSession);
    mocks.cookies.set("pharma_sales_session", "jeton-commercial");
    mocks.cookies.set("pharma_platform_session", "jeton-administrateur");
    mocks.cookies.set("pharma_session", "jeton-officine");
    for (const run of [() => actions.createChallengeAction(FORM), () => actions.updateChallengeAction({ ...FORM, id: "ch_1" }), () => actions.endChallengeAction({ id: "ch_1" }), () => actions.deleteChallengeAction({ id: "ch_1" })]) {
      await expect(run()).rejects.toThrow("NEXT_REDIRECT /directeur/connexion");
    }
    expect(mocks.sessionLookup).not.toHaveBeenCalled();
    noServiceCalled();
  });

  it("un directeur désactivé, une session révoquée ou expirée n'ouvrent rien", async () => {
    mocks.requireDirectorSession.mockImplementation(real.requireDirectorSession);
    mocks.cookies.set("pharma_director_session", "jeton-directeur");
    const row = (extra: Record<string, unknown>) => ({ id: "s_1", revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000), salesDirector: { id: "dir_1", isActive: true, email: "d@x.fr", firstName: "Dora", lastName: "D" }, ...extra });
    for (const found of [row({ salesDirector: { id: "dir_1", isActive: false, email: "d@x.fr", firstName: "Dora", lastName: "D" } }), row({ revokedAt: new Date() }), row({ expiresAt: new Date(Date.now() - 1000) }), null]) {
      mocks.sessionLookup.mockResolvedValueOnce(found);
      await expect(actions.deleteChallengeAction({ id: "ch_1" })).rejects.toThrow("NEXT_REDIRECT /directeur/connexion");
    }
    noServiceCalled();
  });
});

describe("lancer un challenge", () => {
  it("passe le directeur de la session, jamais une identité de la demande, et dit combien de commerciaux sont prévenus", async () => {
    mocks.service.createChallenge.mockResolvedValue({ ok: true, id: "ch_1", notified: 6, notifyFailed: 0 });
    const result = await actions.createChallengeAction({ ...FORM, createdById: "dir_pirate", createdByLabel: "Pirate", actor: { type: "ADMIN", id: "adm_1" } } as never);
    expect(result).toEqual({ ok: true, data: { id: "ch_1" }, message: "Challenge lancé. 6 commerciaux ont été prévenus." });
    expect(mocks.service.createChallenge).toHaveBeenCalledTimes(1);
    const [form, actor] = mocks.service.createChallenge.mock.calls[0];
    expect(actor).toEqual(ACTOR);
    expect(form).toEqual(FORM);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/directeur/challenges");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/directeur");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/extranet/challenges");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/directeur/challenges/ch_1");
  });

  it("dit la vérité sur les notifications : un seul prévenu, aucun, ou des échecs", async () => {
    mocks.service.createChallenge.mockResolvedValueOnce({ ok: true, id: "ch_1", notified: 1, notifyFailed: 0 });
    expect(await actions.createChallengeAction(FORM)).toMatchObject({ message: "Challenge lancé. 1 commercial a été prévenu." });
    mocks.service.createChallenge.mockResolvedValueOnce({ ok: true, id: "ch_1", notified: 0, notifyFailed: 0 });
    expect(await actions.createChallengeAction(FORM)).toMatchObject({ message: "Challenge lancé. Aucun commercial actif à prévenir pour l'instant." });
    mocks.service.createChallenge.mockResolvedValueOnce({ ok: true, id: "ch_1", notified: 4, notifyFailed: 2 });
    expect(await actions.createChallengeAction(FORM)).toMatchObject({ message: "Challenge lancé. 4 commerciaux ont été prévenus. 2 notifications n'ont pas pu partir." });
  });

  it("transmet les erreurs de champ du service", async () => {
    mocks.service.createChallenge.mockResolvedValue({ ok: false, error: "L'objectif est un nombre entier, d'au moins 1.", fieldErrors: { target: "L'objectif est un nombre entier, d'au moins 1." } });
    expect(await actions.createChallengeAction({ ...FORM, target: "0" })).toEqual({ ok: false, error: "L'objectif est un nombre entier, d'au moins 1.", fieldErrors: { target: "L'objectif est un nombre entier, d'au moins 1." } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuse une demande de mauvaise forme avant d'appeler le service", async () => {
    for (const payload of [null, "challenge", {}, { ...FORM, title: 12 }, { ...FORM, metric: undefined }, { ...FORM, startsDay: "x".repeat(40) }, { ...FORM, description: "x".repeat(2001) }, { ...FORM, target: { n: 5 } }]) {
      expect(await actions.createChallengeAction(payload as never)).toEqual({ ok: false, error: "Demande invalide.", fieldErrors: undefined });
    }
    noServiceCalled();
  });
});

describe("modifier un challenge", () => {
  it("transmet l'identifiant et le formulaire, avec le directeur de la session", async () => {
    mocks.service.updateChallenge.mockResolvedValue({ ok: true, changed: ["titre"] });
    const result = await actions.updateChallengeAction({ ...FORM, id: "ch_1", createdById: "dir_pirate" } as never);
    expect(result).toEqual({ ok: true, data: { id: "ch_1" }, message: "Challenge enregistré." });
    expect(mocks.service.updateChallenge).toHaveBeenCalledWith("ch_1", FORM, ACTOR);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/directeur/challenges/ch_1");
  });

  it("dit quand rien n'a changé, et rend le refus du service (champ verrouillé, challenge inconnu)", async () => {
    mocks.service.updateChallenge.mockResolvedValueOnce({ ok: true, changed: [] });
    expect(await actions.updateChallengeAction({ ...FORM, id: "ch_1" })).toMatchObject({ ok: true, message: "Rien n'a changé." });
    mocks.service.updateChallenge.mockResolvedValueOnce({ ok: false, error: "Le challenge a commencé : ce que le challenge compte ne se modifie plus. Rechargez la page.", fieldErrors: { metric: "Ne se modifie plus." } });
    expect(await actions.updateChallengeAction({ ...FORM, id: "ch_1" })).toMatchObject({ ok: false, fieldErrors: { metric: "Ne se modifie plus." } });
    mocks.service.updateChallenge.mockResolvedValueOnce({ ok: false, error: "Challenge introuvable." });
    expect(await actions.updateChallengeAction({ ...FORM, id: "ch_x" })).toMatchObject({ ok: false, error: "Challenge introuvable." });
  });

  it("refuse un identifiant absent", async () => {
    expect(await actions.updateChallengeAction({ ...FORM, id: "" })).toMatchObject({ ok: false, error: "Demande invalide." });
    noServiceCalled();
  });
});

describe("terminer et supprimer", () => {
  it("terminer : le directeur de la session, le titre dans le message, la liste revalidée", async () => {
    mocks.service.endChallenge.mockResolvedValue({ ok: true, title: "Octobre des démos" });
    expect(await actions.endChallengeAction({ id: "ch_1" })).toEqual({ ok: true, data: null, message: "« Octobre des démos » est terminé. Les résultats sont figés." });
    expect(mocks.service.endChallenge).toHaveBeenCalledWith("ch_1", ACTOR);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/directeur/challenges");
  });

  it("supprimer : idem, et un refus du service est rendu tel quel", async () => {
    mocks.service.deleteChallenge.mockResolvedValueOnce({ ok: true, title: "Octobre des démos" });
    expect(await actions.deleteChallengeAction({ id: "ch_1" })).toEqual({ ok: true, data: null, message: "« Octobre des démos » est supprimé." });
    expect(mocks.service.deleteChallenge).toHaveBeenCalledWith("ch_1", ACTOR);
    mocks.service.deleteChallenge.mockResolvedValueOnce({ ok: false, error: "Challenge introuvable." });
    expect(await actions.deleteChallengeAction({ id: "ch_x" })).toEqual({ ok: false, error: "Challenge introuvable.", fieldErrors: undefined });
  });

  it("refuse une demande sans identifiant avant d'appeler le service", async () => {
    expect(await actions.endChallengeAction({} as never)).toMatchObject({ ok: false, error: "Demande invalide." });
    expect(await actions.deleteChallengeAction({ id: 5 } as never)).toMatchObject({ ok: false, error: "Demande invalide." });
    noServiceCalled();
  });
});
