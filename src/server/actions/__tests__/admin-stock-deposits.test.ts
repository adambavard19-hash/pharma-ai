import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les gestes de l'équipe sur les stocks reçus : la session de la console
 * d'abord, l'administrateur est celui de la session (jamais celui de la
 * demande), l'officine ne reçoit un dépôt que si elle a un titulaire actif.
 */

const mocks = vi.hoisted(() => ({
  requirePlatformSession: vi.fn(),
  revalidatePath: vi.fn(),
  after: vi.fn(),
  service: { decideHeldDeposit: vi.fn(), retryDeposit: vi.fn(), receiveStockDeposit: vi.fn(), ownerScopeForPharmacy: vi.fn(), continueAfterStockDeposit: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: mocks.requirePlatformSession }));
vi.mock("@/server/services/stock-deposits", () => mocks.service);

const actions = await import("../admin-stock-deposits");

const SESSION = { admin: { id: "adm_1", email: "admin@pharma.ai", fullName: "Alice Admin", initials: "AA" }, sessionId: "s_1" };
const OWNER = { scope: { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" }, pharmacyIsDemo: false, pharmacyName: "Pharmacie du Parc" };

const view = (extra: Record<string, unknown> = {}) => ({
  id: "dep_1",
  pharmacyId: "ph_1",
  fileName: "stock.csv",
  fileSize: 100,
  status: "APPLIED",
  source: "CONSOLE",
  lines: 4235,
  created: 0,
  updated: 4235,
  invalid: 0,
  zeroed: 0,
  knownLines: 4200,
  message: null,
  receivedAt: new Date(),
  appliedAt: new Date(),
  decidedAt: null,
  hasFile: true,
  ...extra,
});

const form = (extra: Record<string, string> = { pharmacyId: "ph_1" }, file: File | null = new File(["cip;qte\n1;2"], "stock.csv")) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  if (file) data.set("file", file);
  return data;
};

const noServiceCalled = () => Object.values(mocks.service).forEach((fn) => expect(fn).not.toHaveBeenCalled());

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.requirePlatformSession.mockResolvedValue(SESSION);
  mocks.service.ownerScopeForPharmacy.mockResolvedValue(OWNER);
  mocks.service.decideHeldDeposit.mockResolvedValue({ ok: true, deposit: view() });
  mocks.service.retryDeposit.mockResolvedValue({ ok: true, deposit: view() });
  mocks.service.receiveStockDeposit.mockResolvedValue({ ok: true, deposit: view(), duplicate: false });
});

describe("la session de la console", () => {
  it("sans session, toutes les actions s'arrêtent avant toute lecture ou écriture", async () => {
    const redirected = new Error("NEXT_REDIRECT /admin-connexion");
    mocks.requirePlatformSession.mockRejectedValue(redirected);
    const names = Object.keys(actions).sort();
    expect(names).toEqual(["decideDepositAction", "depositForPharmacyAction", "retryDepositAction"]);
    for (const name of names) {
      const action = actions[name as keyof typeof actions] as (payload: unknown) => Promise<unknown>;
      await expect(action(name === "depositForPharmacyAction" ? form() : { id: "dep_1", decision: "APPLY_FULL" })).rejects.toBe(redirected);
    }
    noServiceCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("trancher un fichier en attente", () => {
  it("passe l'administrateur de la session, jamais un identifiant de la demande", async () => {
    const result = await actions.decideDepositAction({ id: "dep_1", decision: "APPLY_FULL", adminId: "adm_pirate" } as never);
    expect(result).toMatchObject({ ok: true, message: `Stock appliqué : ${(4235).toLocaleString("fr-FR")} lignes.` });
    expect(mocks.service.decideHeldDeposit).toHaveBeenCalledWith("dep_1", "adm_1", "APPLY_FULL");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/depots-stock");
  });

  it("refuse une décision inconnue ou un identifiant absent avant d'appeler le moteur", async () => {
    expect(await actions.decideDepositAction({ id: "dep_1", decision: "TOUT_EFFACER" } as never)).toMatchObject({ ok: false });
    expect(await actions.decideDepositAction({ id: "", decision: "REJECT" })).toMatchObject({ ok: false });
    noServiceCalled();
  });

  it("écarter : le message dit que le stock n'a pas changé", async () => {
    mocks.service.decideHeldDeposit.mockResolvedValue({ ok: true, deposit: view({ status: "REJECTED" }) });
    const result = await actions.decideDepositAction({ id: "dep_1", decision: "REJECT" });
    expect(result).toMatchObject({ ok: true, message: expect.stringContaining("le stock de l'officine n'a pas changé") });
  });

  it("dit ce que le moteur a refusé, et rafraîchit quand même la liste", async () => {
    mocks.service.decideHeldDeposit.mockResolvedValue({ ok: false, error: "Ce fichier a déjà été traité." });
    expect(await actions.decideDepositAction({ id: "dep_1", decision: "APPLY_FULL" })).toMatchObject({ ok: false, error: "Ce fichier a déjà été traité." });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/depots-stock");
  });

  it("l'écriture qui échoue : une erreur, pas un faux succès", async () => {
    mocks.service.decideHeldDeposit.mockResolvedValue({ ok: true, deposit: view({ status: "FAILED", message: "Le stock n'a pas pu être mis à jour." }) });
    expect(await actions.decideDepositAction({ id: "dep_1", decision: "APPLY_FULL" })).toMatchObject({ ok: false, error: "Le stock n'a pas pu être mis à jour." });
  });

  it("des produits créés : leur compréhension continue après la réponse, au nom du titulaire", async () => {
    mocks.service.decideHeldDeposit.mockResolvedValue({ ok: true, deposit: view({ created: 3 }) });
    await actions.decideDepositAction({ id: "dep_1", decision: "APPLY_PARTIAL" });
    expect(mocks.service.ownerScopeForPharmacy).toHaveBeenCalledWith("ph_1");
    await mocks.after.mock.calls[0][0]();
    expect(mocks.service.continueAfterStockDeposit).toHaveBeenCalledWith(OWNER.scope);
  });
});

describe("relancer un fichier en échec", () => {
  it("passe l'administrateur de la session et rafraîchit la liste", async () => {
    const result = await actions.retryDepositAction({ id: "dep_1", adminId: "adm_pirate" } as never);
    expect(result).toMatchObject({ ok: true });
    expect(mocks.service.retryDeposit).toHaveBeenCalledWith("dep_1", "adm_1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/depots-stock");
  });

  it("refuse une demande sans identifiant", async () => {
    expect(await actions.retryDepositAction({ id: "" })).toMatchObject({ ok: false });
    noServiceCalled();
  });

  it("toujours illisible : une erreur ; trop petit : à trancher", async () => {
    mocks.service.retryDeposit.mockResolvedValueOnce({ ok: true, deposit: view({ status: "FAILED", message: "Colonnes non reconnues : Quantité." }) });
    expect(await actions.retryDepositAction({ id: "dep_1" })).toMatchObject({ ok: false, error: "Colonnes non reconnues : Quantité." });
    mocks.service.retryDeposit.mockResolvedValueOnce({ ok: true, deposit: view({ status: "HELD" }) });
    expect(await actions.retryDepositAction({ id: "dep_1" })).toMatchObject({ ok: true, message: expect.stringContaining("à vous de trancher") });
    mocks.service.retryDeposit.mockResolvedValueOnce({ ok: false, error: "Seul un fichier en échec peut être relancé." });
    expect(await actions.retryDepositAction({ id: "dep_1" })).toMatchObject({ ok: false, error: "Seul un fichier en échec peut être relancé." });
  });
});

describe("déposer le stock d'une officine à sa place", () => {
  it("dépose au nom du titulaire, source « CONSOLE », administrateur de la session", async () => {
    const result = await actions.depositForPharmacyAction(form());
    expect(result).toMatchObject({ ok: true, message: `Stock de Pharmacie du Parc mis à jour : ${(4235).toLocaleString("fr-FR")} lignes.` });
    expect(mocks.service.ownerScopeForPharmacy).toHaveBeenCalledWith("ph_1");
    const call = mocks.service.receiveStockDeposit.mock.calls[0][0];
    expect(call).toMatchObject({ scope: OWNER.scope, pharmacyIsDemo: false, fileName: "stock.csv", source: "CONSOLE", adminId: "adm_1" });
    expect(new TextDecoder().decode(call.bytes)).toBe("cip;qte\n1;2");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/depots-stock");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/pharmacies/ph_1");
  });

  it("sans titulaire actif : refus clair, rien n'est déposé", async () => {
    mocks.service.ownerScopeForPharmacy.mockResolvedValue(null);
    const result = await actions.depositForPharmacyAction(form());
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("pas de titulaire actif") });
    expect(mocks.service.receiveStockDeposit).not.toHaveBeenCalled();
  });

  it("une officine ou un fichier manquant, un fichier trop gros", async () => {
    expect(await actions.depositForPharmacyAction(form({}))).toMatchObject({ ok: false, error: "Choisissez l'officine." });
    expect(await actions.depositForPharmacyAction(form({ pharmacyId: "ph_1" }, null))).toMatchObject({ ok: false, error: "Choisissez le fichier de stock." });
    expect(await actions.depositForPharmacyAction(form({ pharmacyId: "ph_1" }, new File([new Uint8Array(8 * 1024 * 1024 + 1)], "gros.csv")))).toMatchObject({ ok: false, error: "Le fichier dépasse 8 Mo." });
    expect(mocks.service.ownerScopeForPharmacy).not.toHaveBeenCalled();
    expect(mocks.service.receiveStockDeposit).not.toHaveBeenCalled();
  });

  it("le moteur refuse (format, limite, stockage) : son message", async () => {
    mocks.service.receiveStockDeposit.mockResolvedValue({ ok: false, error: "Le fichier est vide." });
    expect(await actions.depositForPharmacyAction(form())).toMatchObject({ ok: false, error: "Le fichier est vide." });
  });

  it("fichier trop petit : reçu mais en attente de décision ; illisible : erreur ; double envoi : rien à refaire", async () => {
    mocks.service.receiveStockDeposit.mockResolvedValueOnce({ ok: true, deposit: view({ status: "HELD" }), duplicate: false });
    expect(await actions.depositForPharmacyAction(form())).toMatchObject({ ok: true, message: expect.stringContaining("attend votre décision") });
    mocks.service.receiveStockDeposit.mockResolvedValueOnce({ ok: true, deposit: view({ status: "FAILED", message: "Aucune ligne de stock lisible." }), duplicate: false });
    expect(await actions.depositForPharmacyAction(form())).toMatchObject({ ok: false, error: "Aucune ligne de stock lisible." });
    mocks.service.receiveStockDeposit.mockResolvedValueOnce({ ok: true, deposit: view(), duplicate: true });
    expect(await actions.depositForPharmacyAction(form())).toMatchObject({ ok: true, message: expect.stringContaining("vient d'être reçu") });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("une panne du moteur devient un message", async () => {
    mocks.service.receiveStockDeposit.mockRejectedValue(new Error("base indisponible"));
    const result = await actions.depositForPharmacyAction(form());
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Rien n'a été modifié") });
    expect(JSON.stringify(result)).not.toContain("base indisponible");
  });
});
