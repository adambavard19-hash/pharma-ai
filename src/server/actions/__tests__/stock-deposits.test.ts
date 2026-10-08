import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * « Envoyer mon fichier » : la permission d'import d'abord, l'officine toujours
 * celle de la session (jamais celle du formulaire), et un message lisible quoi
 * qu'il arrive. Le moteur est simulé : rien n'est lu, rien n'est écrit.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  after: vi.fn(),
  receive: vi.fn(),
  continueAfter: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/services/stock-deposits", () => ({ receiveStockDeposit: mocks.receive, continueAfterStockDeposit: mocks.continueAfter }));

const { PERMISSIONS } = await import("@/server/rbac/permissions");
const actions = await import("../stock-deposits");

const SESSION = { scope: { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" }, pharmacy: { isDemo: false } };

const view = (extra: Record<string, unknown> = {}) => ({
  id: "dep_1",
  pharmacyId: "ph_1",
  fileName: "stock.csv",
  fileSize: 100,
  status: "APPLIED",
  source: "WEB",
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

const form = (file: File | null = new File(["cip;qte\n1;2"], "stock.csv", { type: "text/csv" }), extra: Record<string, string> = {}) => {
  const data = new FormData();
  data.set("confirmation", "remplacer");
  if (file) data.set("file", file);
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.requirePermission.mockResolvedValue(SESSION);
  mocks.receive.mockResolvedValue({ ok: true, deposit: view(), duplicate: false });
});

describe("la permission", () => {
  it("l'envoi est réservé à ceux qui peuvent importer le stock (le titulaire)", async () => {
    await actions.sendStockAction(form());
    expect(mocks.requirePermission).toHaveBeenCalledWith(PERMISSIONS.PRODUCT_IMPORT);
  });

  it("sans permission, rien n'est lu ni écrit", async () => {
    const refused = new Error("NEXT_REDIRECT /acces-refuse");
    mocks.requirePermission.mockRejectedValue(refused);
    await expect(actions.sendStockAction(form())).rejects.toBe(refused);
    expect(mocks.receive).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("la confirmation : un fichier remplace le stock", () => {
  it("sans confirmation explicite, rien n'est lu ni écrit", async () => {
    const data = new FormData();
    data.set("file", new File(["a;b\n1;2"], "stock.csv"));
    expect(await actions.sendStockAction(data)).toMatchObject({ ok: false, error: "Confirmez d'abord que ce fichier remplace votre stock." });
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("une autre valeur que celle de l'écran n'est pas une confirmation", async () => {
    const data = form(new File(["a;b\n1;2"], "stock.csv"), { confirmation: "oui" });
    expect(await actions.sendStockAction(data)).toMatchObject({ ok: false });
    expect(mocks.receive).not.toHaveBeenCalled();
  });
});

describe("le fichier", () => {
  it("absent ou vide : on dit quoi faire", async () => {
    expect(await actions.sendStockAction(form(null))).toEqual({ ok: false, error: "Choisissez le fichier de votre stock.", fieldErrors: undefined });
    expect(await actions.sendStockAction(form(new File([], "stock.csv")))).toMatchObject({ ok: false, error: "Choisissez le fichier de votre stock." });
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("de plus de 8 Mo : refusé avant d'être lu", async () => {
    const big = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "stock.csv");
    expect(await actions.sendStockAction(form(big))).toMatchObject({ ok: false, error: "Le fichier dépasse 8 Mo." });
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("un fichier invalide aux yeux du moteur : son message, tel quel", async () => {
    mocks.receive.mockResolvedValue({ ok: false, error: "Format non accepté. Envoyez un fichier CSV, Excel (.xlsx) ou PDF d'inventaire." });
    expect(await actions.sendStockAction(form(new File(["x"], "photo.jpg")))).toMatchObject({ ok: false, error: expect.stringContaining("Format non accepté") });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("l'envoi", () => {
  it("passe le fichier au moteur, au nom de l'officine de la session, source « WEB »", async () => {
    await actions.sendStockAction(form(new File(["a;b\n1;2"], "mon stock.csv"), { pharmacyId: "ph_pirate" }));
    expect(mocks.receive).toHaveBeenCalledTimes(1);
    const call = mocks.receive.mock.calls[0][0];
    expect(call).toMatchObject({ scope: SESSION.scope, pharmacyIsDemo: false, fileName: "mon stock.csv", source: "WEB" });
    expect(new TextDecoder().decode(call.bytes)).toBe("a;b\n1;2");
    // Une officine glissée dans le formulaire n'est jamais lue.
    expect(JSON.stringify(call)).not.toContain("ph_pirate");
    expect(call.adminId).toBeUndefined();
  });

  it("stock mis à jour : message court, écrans rafraîchis", async () => {
    const result = await actions.sendStockAction(form());
    expect(result).toEqual({ ok: true, data: view({ receivedAt: expect.any(Date), appliedAt: expect.any(Date) }), message: `Stock mis à jour : ${(4235).toLocaleString("fr-FR")} lignes.` });
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual(["/stock", "/stock/mise-a-jour", "/"]);
  });

  it("des produits ont été créés : leur compréhension et leurs photos continuent après la réponse", async () => {
    mocks.receive.mockResolvedValue({ ok: true, deposit: view({ created: 12 }), duplicate: false });
    await actions.sendStockAction(form());
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.after.mock.calls[0][0]();
    expect(mocks.continueAfter).toHaveBeenCalledWith(SESSION.scope);
  });

  it("aucun produit créé : rien à poursuivre après la réponse", async () => {
    await actions.sendStockAction(form());
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("fichier beaucoup plus petit que le stock : reçu, en vérification, le stock n'a pas changé", async () => {
    mocks.receive.mockResolvedValue({ ok: true, deposit: view({ status: "HELD", appliedAt: null }), duplicate: false });
    const result = await actions.sendStockAction(form());
    expect(result).toMatchObject({ ok: true, message: expect.stringContaining("votre stock n'a pas changé") });
    expect(result.ok && result.data.status).toBe("HELD");
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("fichier illisible : une erreur lisible, celle du fichier", async () => {
    mocks.receive.mockResolvedValue({ ok: true, deposit: view({ status: "FAILED", message: "Colonnes non reconnues : Quantité." }), duplicate: false });
    expect(await actions.sendStockAction(form())).toMatchObject({ ok: false, error: "Colonnes non reconnues : Quantité." });
  });

  it("double clic : on dit que le fichier est déjà reçu, sans rien relancer", async () => {
    mocks.receive.mockResolvedValue({ ok: true, deposit: view({ created: 5 }), duplicate: true });
    const result = await actions.sendStockAction(form());
    expect(result).toMatchObject({ ok: true, message: expect.stringContaining("vient d'être reçu") });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("une panne du moteur devient un message, jamais une exception vers l'écran", async () => {
    mocks.receive.mockRejectedValue(new Error("base indisponible"));
    const result = await actions.sendStockAction(form());
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Rien n'a été modifié") });
    expect(JSON.stringify(result)).not.toContain("base indisponible");
  });
});
