import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les actions du directeur sur son équipe : la session du directeur d'abord, la
 * forme des entrées ensuite, et jamais une identité prise dans la demande.
 */

const mocks = vi.hoisted(() => ({
  requireDirectorSession: vi.fn(),
  revalidatePath: vi.fn(),
  service: {
    createTeamMember: vi.fn(),
    updateTeamMember: vi.fn(),
    setTeamMemberActive: vi.fn(),
    resendTeamInvitation: vi.fn(),
    deleteTeamMember: vi.fn(),
    reassignProspects: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/director-session", () => ({ requireDirectorSession: mocks.requireDirectorSession }));
vi.mock("@/server/services/sales/director-team", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/server/services/sales/director-team")>()), ...mocks.service }));
// Le module réel du service tire la base : ses fonctions sont simulées, ses constantes seules servent.
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));

const actions = await import("../director-reps");

const SESSION = { director: { id: "dir_1", email: "directrice@exemple.fr", firstName: "Diane", lastName: "Directrice", fullName: "Diane Directrice", initials: "DD" }, sessionId: "s_1" };
const DIRECTOR = { id: "dir_1", label: "Diane Directrice" };

const noServiceCalled = () => Object.values(mocks.service).forEach((fn) => expect(fn).not.toHaveBeenCalled());

const validCreate = { firstName: "Marie", lastName: "Dupont", email: " Marie@Exemple.FR ", phone: "06 12 34 56 78", zone: "Rhône", commissionType: "FIXED" as const, commissionValue: 25000, invite: true };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireDirectorSession.mockResolvedValue(SESSION);
});

describe("la session du directeur", () => {
  it("sans session, toutes les actions s'arrêtent avant toute validation, lecture ou écriture", async () => {
    const redirected = new Error("NEXT_REDIRECT /directeur/connexion");
    mocks.requireDirectorSession.mockRejectedValue(redirected);
    const names = Object.keys(actions).sort();
    expect(names).toEqual(["createRepAction", "deleteRepAction", "inviteRepAction", "reassignProspectsAction", "setRepActiveAction", "updateRepAction"]);
    for (const name of names) {
      const action = actions[name as keyof typeof actions] as (payload: unknown) => Promise<unknown>;
      // Une demande vide : la réponse « invalide » serait déjà une information donnée à un visiteur sans session.
      await expect(action({})).rejects.toBe(redirected);
    }
    noServiceCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("ajouter un commercial", () => {
  it("passe le directeur de la session (jamais un identifiant de la demande), nettoie l'e-mail, et dit l'issue de l'invitation", async () => {
    mocks.service.createTeamMember.mockResolvedValue({ ok: true, id: "rep_new", name: "Marie Dupont", invitation: { status: "SENT", detail: "remis" } });

    const result = await actions.createRepAction({ ...validCreate, directorId: "dir_pirate" } as never);

    expect(result).toEqual({ ok: true, data: { salesRepId: "rep_new", name: "Marie Dupont", invitation: { status: "SENT", detail: "remis" } }, message: "Marie Dupont est ajouté(e). Invitation envoyée." });
    expect(mocks.service.createTeamMember).toHaveBeenCalledWith(
      { firstName: "Marie", lastName: "Dupont", email: "marie@exemple.fr", phone: "06 12 34 56 78", zone: "Rhône", commissionType: "FIXED", commissionValue: 25000 },
      DIRECTOR,
      { invite: true },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/directeur/commerciaux");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/commerciaux");
  });

  it("l'invitation est envoyée par défaut ; décochée, elle ne l'est pas", async () => {
    mocks.service.createTeamMember.mockResolvedValue({ ok: true, id: "rep_new", name: "Marie Dupont", invitation: null });
    const { invite: _invite, ...withoutInvite } = validCreate;
    void _invite;
    await actions.createRepAction(withoutInvite);
    expect(mocks.service.createTeamMember).toHaveBeenLastCalledWith(expect.anything(), DIRECTOR, { invite: true });
    const result = await actions.createRepAction({ ...validCreate, invite: false });
    expect(mocks.service.createTeamMember).toHaveBeenLastCalledWith(expect.anything(), DIRECTOR, { invite: false });
    expect(result).toMatchObject({ ok: true, message: "Marie Dupont est ajouté(e). Aucune invitation envoyée." });
  });

  it("un e-mail qui ne part pas est dit tel quel, jamais comme un succès", async () => {
    mocks.service.createTeamMember.mockResolvedValue({ ok: true, id: "rep_new", name: "Marie Dupont", invitation: { status: "FAILED", detail: "boîte inconnue" } });
    const result = await actions.createRepAction(validCreate);
    expect(result).toMatchObject({ ok: true, message: "Marie Dupont est ajouté(e). Invitation NON envoyée : boîte inconnue." });
  });

  it("une adresse déjà prise est refusée en clair, avec le champ en cause", async () => {
    mocks.service.createTeamMember.mockResolvedValue({ ok: false, reason: "EMAIL_TAKEN" });
    const result = await actions.createRepAction(validCreate);
    expect(result).toEqual({ ok: false, error: "Un commercial existe déjà avec cette adresse e-mail.", fieldErrors: { email: "Cette adresse est déjà utilisée." } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuse avant d'appeler le service : champs manquants, e-mail invalide, commission hors plafond", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ firstName: "  " }, "firstName"],
      [{ lastName: "" }, "lastName"],
      [{ email: "pas-un-email" }, "email"],
      [{ commissionType: "AUTRE" }, "commissionType"],
      [{ commissionValue: -1 }, "commissionValue"],
      [{ commissionValue: 12.5 }, "commissionValue"],
      [{ commissionValue: "250" }, "commissionValue"],
      [{ commissionType: "PERCENT", commissionValue: 10001 }, "commissionValue"],
      [{ commissionType: "FIXED", commissionValue: 10_000_001 }, "commissionValue"],
    ];
    for (const [override, field] of cases) {
      const result = await actions.createRepAction({ ...validCreate, ...override } as never);
      expect(result, JSON.stringify(override)).toMatchObject({ ok: false });
      expect(!result.ok && result.fieldErrors?.[field], JSON.stringify(override)).toBeTruthy();
    }
    noServiceCalled();
  });

  it("accepte 100 % et 100 000 € pile", async () => {
    mocks.service.createTeamMember.mockResolvedValue({ ok: true, id: "r", name: "M D", invitation: null });
    expect((await actions.createRepAction({ ...validCreate, commissionType: "PERCENT", commissionValue: 10000 })).ok).toBe(true);
    expect((await actions.createRepAction({ ...validCreate, commissionType: "RECURRING", commissionValue: 10_000_000 })).ok).toBe(true);
  });
});

describe("modifier un commercial", () => {
  it("transmet le directeur de la session et seulement les champs permis (pas d'e-mail, pas d'activation)", async () => {
    mocks.service.updateTeamMember.mockResolvedValue({ ok: true });
    const result = await actions.updateRepAction({ salesRepId: "rep_1", zone: "Lyon", phone: "", commissionType: "PERCENT", commissionValue: 1250, email: "pirate@exemple.fr", isActive: false } as never);
    expect(result).toEqual({ ok: true, data: null, message: "Commercial mis à jour. La nouvelle commission vaut pour les prochains contrats." });
    expect(mocks.service.updateTeamMember).toHaveBeenCalledWith("rep_1", { zone: "Lyon", phone: "", commissionType: "PERCENT", commissionValue: 1250 }, DIRECTOR);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/directeur/commerciaux/rep_1");
  });

  it("un type sans montant (ou l'inverse) est refusé", async () => {
    expect(await actions.updateRepAction({ salesRepId: "rep_1", commissionType: "FIXED" })).toMatchObject({ ok: false });
    expect(await actions.updateRepAction({ salesRepId: "rep_1", commissionValue: 100 })).toMatchObject({ ok: false });
    expect(await actions.updateRepAction({ salesRepId: "", zone: "Lyon" })).toMatchObject({ ok: false });
    noServiceCalled();
  });

  it("un commercial inconnu est refusé en clair", async () => {
    mocks.service.updateTeamMember.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
    expect(await actions.updateRepAction({ salesRepId: "rep_x", zone: "Lyon" })).toEqual({ ok: false, error: "Commercial introuvable.", fieldErrors: undefined });
  });
});

describe("désactiver, réactiver, inviter", () => {
  it("désactiver dit combien de dossiers ouverts restent à son nom", async () => {
    mocks.service.setTeamMemberActive.mockResolvedValue({ ok: true, changed: true, openProspects: 3 });
    const result = await actions.setRepActiveAction({ salesRepId: "rep_1", active: false });
    expect(mocks.service.setTeamMemberActive).toHaveBeenCalledWith("rep_1", false, DIRECTOR);
    expect(result).toMatchObject({ ok: true, message: "Compte désactivé. Le commercial ne peut plus se connecter. Ses 3 dossiers ouverts restent à son nom : réaffectez-les." });
  });

  it("un seul dossier ouvert : le singulier ; aucun : pas de phrase en plus", async () => {
    mocks.service.setTeamMemberActive.mockResolvedValueOnce({ ok: true, changed: true, openProspects: 1 }).mockResolvedValueOnce({ ok: true, changed: true, openProspects: 0 });
    expect(await actions.setRepActiveAction({ salesRepId: "rep_1", active: false })).toMatchObject({ message: "Compte désactivé. Le commercial ne peut plus se connecter. Son dossier ouvert reste à son nom : réaffectez-le." });
    expect(await actions.setRepActiveAction({ salesRepId: "rep_1", active: false })).toMatchObject({ message: "Compte désactivé. Le commercial ne peut plus se connecter." });
  });

  it("réactiver, et un identifiant ou un booléen invalide est refusé", async () => {
    mocks.service.setTeamMemberActive.mockResolvedValue({ ok: true, changed: true, openProspects: 0 });
    expect(await actions.setRepActiveAction({ salesRepId: "rep_1", active: true })).toMatchObject({ ok: true, message: "Compte réactivé. Le commercial peut de nouveau se connecter." });
    expect(await actions.setRepActiveAction({ salesRepId: "rep_1", active: "oui" } as never)).toMatchObject({ ok: false });
    mocks.service.setTeamMemberActive.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
    expect(await actions.setRepActiveAction({ salesRepId: "rep_x", active: true })).toMatchObject({ ok: false, error: "Commercial introuvable." });
  });

  it("l'invitation : envoyée, non envoyée (dite telle quelle), compte désactivé, inconnu", async () => {
    mocks.service.resendTeamInvitation
      .mockResolvedValueOnce({ ok: true, invitation: { status: "SENT", detail: "ok" } })
      .mockResolvedValueOnce({ ok: true, invitation: { status: "SIMULATED", detail: "aucun prestataire configuré" } })
      .mockResolvedValueOnce({ ok: false, reason: "INACTIVE" })
      .mockResolvedValueOnce({ ok: false, reason: "NOT_FOUND" });
    expect(await actions.inviteRepAction({ salesRepId: "rep_1" })).toEqual({ ok: true, data: null, message: "Invitation envoyée." });
    expect(mocks.service.resendTeamInvitation).toHaveBeenCalledWith("rep_1", DIRECTOR);
    expect(await actions.inviteRepAction({ salesRepId: "rep_1" })).toMatchObject({ ok: false, error: "Invitation NON envoyée : aucun prestataire configuré." });
    expect(await actions.inviteRepAction({ salesRepId: "rep_1" })).toMatchObject({ ok: false, error: expect.stringContaining("désactivé") });
    expect(await actions.inviteRepAction({ salesRepId: "rep_x" })).toMatchObject({ ok: false, error: "Commercial introuvable." });
  });
});

describe("supprimer un commercial", () => {
  it("avec historique : le refus du service est rendu tel quel, rien d'autre", async () => {
    mocks.service.deleteTeamMember.mockResolvedValue({ ok: false, reason: "HAS_HISTORY", message: "Ce commercial a un historique : désactivez-le ou réaffectez ses dossiers. À son nom : 3 dossiers.", footprint: {} });
    const result = await actions.deleteRepAction({ salesRepId: "rep_1" });
    expect(mocks.service.deleteTeamMember).toHaveBeenCalledWith("rep_1", DIRECTOR);
    expect(result).toMatchObject({ ok: false, error: "Ce commercial a un historique : désactivez-le ou réaffectez ses dossiers. À son nom : 3 dossiers." });
  });

  it("sans historique : supprimé", async () => {
    mocks.service.deleteTeamMember.mockResolvedValue({ ok: true });
    expect(await actions.deleteRepAction({ salesRepId: "rep_1" })).toEqual({ ok: true, data: null, message: "Commercial supprimé définitivement." });
  });

  it("inconnu ou identifiant absent : refusé", async () => {
    mocks.service.deleteTeamMember.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
    expect(await actions.deleteRepAction({ salesRepId: "rep_x" })).toMatchObject({ ok: false, error: "Commercial introuvable." });
    expect(await actions.deleteRepAction({ salesRepId: "" })).toMatchObject({ ok: false });
  });
});

describe("réaffecter des dossiers", () => {
  it("transmet le directeur de la session et dit ce qui s'est passé", async () => {
    mocks.service.reassignProspects.mockResolvedValue({ ok: true, moved: 2, alreadyHis: 1, unknown: 0, repName: "Paul Martin" });
    const result = await actions.reassignProspectsAction({ prospectIds: ["p1", "p2", "p3"], salesRepId: "rep_2" });
    expect(mocks.service.reassignProspects).toHaveBeenCalledWith(["p1", "p2", "p3"], "rep_2", DIRECTOR);
    expect(result).toEqual({ ok: true, data: { moved: 2 }, message: "2 dossiers confiés à Paul Martin. Il est prévenu. 1 dossier déjà à lui ou introuvable, laissé tel quel." });
  });

  it("un dossier confié : le singulier", async () => {
    mocks.service.reassignProspects.mockResolvedValue({ ok: true, moved: 1, alreadyHis: 0, unknown: 0, repName: "Paul Martin" });
    expect(await actions.reassignProspectsAction({ prospectIds: ["p1"], salesRepId: "rep_2" })).toMatchObject({ message: "1 dossier confié à Paul Martin. Il est prévenu." });
  });

  it("refuse avant d'appeler le service : aucun dossier, trop de dossiers, commercial absent", async () => {
    expect(await actions.reassignProspectsAction({ prospectIds: [], salesRepId: "rep_2" })).toMatchObject({ ok: false, error: "Choisissez au moins un dossier." });
    expect(await actions.reassignProspectsAction({ prospectIds: Array.from({ length: 101 }, (_, i) => `p${i}`), salesRepId: "rep_2" })).toMatchObject({ ok: false });
    expect(await actions.reassignProspectsAction({ prospectIds: ["p1"], salesRepId: "" })).toMatchObject({ ok: false });
    noServiceCalled();
  });

  it("dit en français pourquoi le service a refusé", async () => {
    for (const [reason, text] of [
      ["REP_NOT_FOUND", "introuvable"],
      ["REP_INACTIVE", "désactivé"],
      ["NOTHING_TO_MOVE", "déjà à ce commercial"],
    ] as const) {
      mocks.service.reassignProspects.mockResolvedValueOnce({ ok: false, reason });
      const result = await actions.reassignProspectsAction({ prospectIds: ["p1"], salesRepId: "rep_2" });
      expect(result).toMatchObject({ ok: false });
      expect(!result.ok && result.error).toContain(text);
    }
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
