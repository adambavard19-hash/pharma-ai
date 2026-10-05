import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Marquer un confrère proposé au parrainage « Contacté » ou « Décliné », depuis la
 * fiche d'un dossier de la console : la session de la console est exigée AVANT toute
 * autre chose, la requête est validée, le service décide, la page est rafraîchie.
 */
const mocks = vi.hoisted(() => ({ requirePlatformSession: vi.fn(), setReferralLeadStatus: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: mocks.requirePlatformSession }));
// Les libellés sont ceux du service (testés avec lui) ; le service lui-même est simulé.
vi.mock("@/server/services/referral-leads", () => ({
  MANUAL_LEAD_STATUSES: ["CONTACTED", "DECLINED"],
  REFERRAL_LEAD_STATUS_LABELS: { NEW: "À contacter", CONTACTED: "Contacté", LINKED: "Dossier ouvert", DECLINED: "Décliné" },
  setReferralLeadStatus: mocks.setReferralLeadStatus,
}));
vi.mock("server-only", () => ({}));

const { setReferralLeadStatusAction } = await import("../admin-referral-leads");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePlatformSession.mockResolvedValue({ admin: { id: "adm_1", fullName: "Alice Admin" } });
  mocks.setReferralLeadStatus.mockResolvedValue({ ok: true, changed: true, referrerProspectId: "p_parrain" });
});

describe("setReferralLeadStatusAction", () => {
  it("sans session de la console, rien n'est lu ni écrit (la barrière lève)", async () => {
    mocks.requirePlatformSession.mockRejectedValue(new Error("redirect:/login"));
    await expect(setReferralLeadStatusAction({ leadId: "lead_1", status: "CONTACTED" })).rejects.toThrow("redirect:/login");
    expect(mocks.setReferralLeadStatus).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("marque le confrère au nom de l'administrateur connecté, puis rafraîchit la fiche du dossier qui l'a proposé", async () => {
    const result = await setReferralLeadStatusAction({ leadId: "lead_1", status: "CONTACTED" });
    expect(result).toEqual({ ok: true, data: { status: "CONTACTED" }, message: "Confrère marqué « Contacté »." });
    expect(mocks.setReferralLeadStatus).toHaveBeenCalledWith("lead_1", "CONTACTED", { type: "ADMIN", id: "adm_1", label: "Alice Admin" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/dossiers/p_parrain");
  });

  it("« Décliné » est accepté, et un statut inchangé le dit", async () => {
    mocks.setReferralLeadStatus.mockResolvedValue({ ok: true, changed: false, referrerProspectId: "p_parrain" });
    expect(await setReferralLeadStatusAction({ leadId: "lead_1", status: "DECLINED" })).toMatchObject({ ok: true, message: "Déjà « Décliné »." });
  });

  it("n'accepte que « Contacté » et « Décliné » : « Dossier ouvert » vient du rapprochement seul", async () => {
    for (const status of ["LINKED", "NEW", "", "contacted"]) {
      expect(await setReferralLeadStatusAction({ leadId: "lead_1", status } as never)).toMatchObject({ ok: false });
    }
    expect(mocks.setReferralLeadStatus).not.toHaveBeenCalled();
  });

  it("refuse un identifiant vide ou démesuré", async () => {
    expect(await setReferralLeadStatusAction({ leadId: "  ", status: "CONTACTED" })).toMatchObject({ ok: false, error: "Confrère manquant." });
    expect(await setReferralLeadStatusAction({ leadId: "x".repeat(65), status: "CONTACTED" })).toMatchObject({ ok: false });
    expect(mocks.setReferralLeadStatus).not.toHaveBeenCalled();
  });

  it("le refus du service (confrère déjà rapproché) est rendu tel quel, sans rafraîchir", async () => {
    mocks.setReferralLeadStatus.mockResolvedValue({ ok: false, error: "Ce confrère a déjà ouvert son dossier : son statut ne se change plus à la main." });
    expect(await setReferralLeadStatusAction({ leadId: "lead_1", status: "DECLINED" })).toEqual({ ok: false, error: "Ce confrère a déjà ouvert son dossier : son statut ne se change plus à la main.", fieldErrors: undefined });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
