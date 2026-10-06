import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les actions du directeur sur l'argent : la session d'abord, la forme des
 * entrées ensuite, et jamais l'identité du directeur prise dans la demande.
 */

const mocks = vi.hoisted(() => ({
  requireDirectorSession: vi.fn(),
  revalidatePath: vi.fn(),
  service: { moveCommission: vi.fn(), setCommissionNote: vi.fn(), createInvoice: vi.fn(), moveInvoice: vi.fn(), deleteInvoice: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/director-session", () => ({ requireDirectorSession: mocks.requireDirectorSession }));
vi.mock("@/server/services/sales/director-money", () => ({ ...mocks.service, COMMISSION_NOTE_MAX: 500 }));

const actions = await import("../director-money");

const SESSION = { director: { id: "dir_1", email: "diane@exemple.fr", firstName: "Diane", lastName: "Directrice", fullName: "Diane Directrice", initials: "DD" }, sessionId: "s_1" };
const DIRECTOR = { id: "dir_1", label: "Diane Directrice" };

const noServiceCalled = () => Object.values(mocks.service).forEach((fn) => expect(fn).not.toHaveBeenCalled());

const pdf = (name = "facture.pdf", size = 2_000) => {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("%PDF-1.7\n"));
  return new File([bytes], name, { type: "application/pdf" });
};

function form(fields: Record<string, string | string[] | File | undefined> = {}) {
  const data = new FormData();
  const values = { salesRepId: "rep_1", number: "FA-014", amount: "750,00", issuedOn: "2026-10-01", periodLabel: "Septembre 2026", note: "", commissionIds: ["com_1", "com_2"], ...fields };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => data.append(key, item));
    else data.append(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireDirectorSession.mockResolvedValue(SESSION);
});

describe("la session du directeur", () => {
  it("sans session, toutes les actions s'arrêtent avant toute lecture ou écriture", async () => {
    const redirected = new Error("NEXT_REDIRECT /directeur/connexion");
    mocks.requireDirectorSession.mockRejectedValue(redirected);
    const names = Object.keys(actions).sort();
    expect(names).toEqual(["commissionGestureAction", "commissionNoteAction", "createInvoiceAction", "deleteInvoiceAction", "invoiceGestureAction"]);
    for (const name of names) {
      const action = actions[name as keyof typeof actions] as (payload: unknown) => Promise<unknown>;
      const payload = name === "createInvoiceAction" ? form({ file: pdf() }) : { commissionId: "com_1", invoiceId: "inv_1", gesture: "REJECT", reason: "Motif valable", note: "Bonjour" };
      await expect(action(payload)).rejects.toBe(redirected);
    }
    noServiceCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("les gestes sur une commission", () => {
  it("passe le directeur de la session, jamais un identifiant de la demande", async () => {
    mocks.service.moveCommission.mockResolvedValue({ ok: true, status: "PAYABLE", message: "Commission validée : elle est à payer." });
    const result = await actions.commissionGestureAction({ commissionId: "com_1", gesture: "VALIDATE", directorId: "dir_pirate" } as never);
    expect(result).toEqual({ ok: true, data: { status: "PAYABLE" }, message: "Commission validée : elle est à payer." });
    expect(mocks.service.moveCommission).toHaveBeenCalledWith({ commissionId: "com_1", gesture: "VALIDATE" }, DIRECTOR);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/directeur/commissions");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/extranet/commissions");
  });

  it("le motif d'une annulation est transmis tel quel au service, qui le juge", async () => {
    mocks.service.moveCommission.mockResolvedValue({ ok: true, status: "CANCELLED", message: "Commission annulée." });
    await actions.commissionGestureAction({ commissionId: "com_1", gesture: "CANCEL", reason: "Officine non activée" });
    expect(mocks.service.moveCommission).toHaveBeenCalledWith({ commissionId: "com_1", gesture: "CANCEL", reason: "Officine non activée" }, DIRECTOR);
  });

  it("refuse un geste inconnu ou un identifiant absent avant d'appeler le service", async () => {
    expect(await actions.commissionGestureAction({ commissionId: "com_1", gesture: "DELETE" } as never)).toMatchObject({ ok: false });
    expect(await actions.commissionGestureAction({ commissionId: "", gesture: "PAY" })).toMatchObject({ ok: false });
    expect(await actions.commissionGestureAction({ commissionId: "x".repeat(65), gesture: "PAY" })).toMatchObject({ ok: false });
    noServiceCalled();
  });

  it("répète le refus du service, sans rien recharger", async () => {
    mocks.service.moveCommission.mockResolvedValue({ ok: false, error: "Une commission payée ne s'annule pas." });
    expect(await actions.commissionGestureAction({ commissionId: "com_1", gesture: "CANCEL", reason: "Erreur" })).toEqual({ ok: false, error: "Une commission payée ne s'annule pas.", fieldErrors: undefined });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("la note : passe par le service, l'erreur est portée par le champ", async () => {
    mocks.service.setCommissionNote.mockResolvedValueOnce({ ok: true });
    expect(await actions.commissionNoteAction({ commissionId: "com_1", note: "Prime de lancement" })).toMatchObject({ ok: true, message: "Note enregistrée." });
    expect(mocks.service.setCommissionNote).toHaveBeenCalledWith("com_1", "Prime de lancement", DIRECTOR);
    mocks.service.setCommissionNote.mockResolvedValueOnce({ ok: false, error: "Commission introuvable." });
    expect(await actions.commissionNoteAction({ commissionId: "com_9", note: "x" })).toEqual({ ok: false, error: "Commission introuvable.", fieldErrors: { note: "Commission introuvable." } });
  });
});

describe("enregistrer une facture", () => {
  it("crée la facture pour le directeur de la session, avec les champs validés et les commissions cochées", async () => {
    mocks.service.createInvoice.mockResolvedValue({ ok: true, id: "inv_1", number: "FA-014", file: "none" });
    const result = await actions.createInvoiceAction(form());
    expect(result).toEqual({ ok: true, data: { id: "inv_1", file: "none" }, message: "Facture FA-014 enregistrée." });
    const [input, file, director] = mocks.service.createInvoice.mock.calls[0];
    expect(input).toMatchObject({ salesRepId: "rep_1", commissionIds: ["com_1", "com_2"], draft: { number: "FA-014", amountCents: 75_000, periodLabel: "Septembre 2026", note: null } });
    expect(input.draft.issuedAt).toEqual(new Date("2026-10-01T12:00:00Z"));
    expect(file).toBeNull();
    expect(director).toEqual(DIRECTOR);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/directeur/factures/inv_1");
  });

  it("joint le PDF après avoir relu sa signature", async () => {
    mocks.service.createInvoice.mockResolvedValue({ ok: true, id: "inv_1", number: "FA-014", file: "saved" });
    const result = await actions.createInvoiceAction(form({ file: pdf("Ma facture.PDF") }));
    expect(result).toMatchObject({ ok: true, message: "Facture FA-014 enregistrée. Le PDF est joint." });
    const file = mocks.service.createInvoice.mock.calls[0][1];
    expect(file.fileName).toBe("Ma facture.pdf");
    expect(String.fromCharCode(...file.bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("refuse un fichier qui n'est pas un PDF, même renommé, ou qui dépasse 5 Mo, avant tout service", async () => {
    const html = new File([new TextEncoder().encode("<html><script>alert(1)</script></html>")], "facture.pdf", { type: "application/pdf" });
    expect(await actions.createInvoiceAction(form({ file: html }))).toMatchObject({ ok: false, fieldErrors: { file: expect.stringContaining("pas un PDF") } });
    expect(await actions.createInvoiceAction(form({ file: pdf("gros.pdf", 5 * 1024 * 1024 + 1) }))).toMatchObject({ ok: false, fieldErrors: { file: expect.stringContaining("5 Mo") } });
    noServiceCalled();
  });

  it("donne une erreur par champ pour une saisie invalide, et ne sait rien d'un commercial absent", async () => {
    const bad = await actions.createInvoiceAction(form({ number: " ", amount: "zéro", issuedOn: "2999-01-01" }));
    expect(bad).toMatchObject({ ok: false, fieldErrors: { number: "Indiquez le numéro de la facture.", amount: expect.stringContaining("montant"), issuedOn: expect.stringContaining("futur") } });
    expect(await actions.createInvoiceAction(form({ salesRepId: " " }))).toMatchObject({ ok: false, fieldErrors: { salesRepId: "Choisissez le commercial." } });
    noServiceCalled();
  });

  it("ne transmet que des identifiants de commission, bornés", async () => {
    mocks.service.createInvoice.mockResolvedValue({ ok: true, id: "inv_1", number: "FA-014", file: "none" });
    await actions.createInvoiceAction(form({ commissionIds: ["com_1", "", "x".repeat(65), "com_2"] }));
    expect(mocks.service.createInvoice.mock.calls[0][0].commissionIds).toEqual(["com_1", "com_2"]);
  });

  it("répète le refus du service (numéro déjà pris, commission indisponible)", async () => {
    mocks.service.createInvoice.mockResolvedValue({ ok: false, error: "Une facture « FA-014 » existe déjà pour Marie Dupont." });
    expect(await actions.createInvoiceAction(form())).toMatchObject({ ok: false, error: expect.stringContaining("existe déjà") });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("faire avancer une facture", () => {
  it("valide, paie, refuse : le directeur de la session, le motif transmis", async () => {
    mocks.service.moveInvoice.mockResolvedValue({ ok: true, status: "REJECTED", message: "Facture FA-014 refusée." });
    const result = await actions.invoiceGestureAction({ invoiceId: "inv_1", gesture: "REJECT", reason: "Montant erroné" });
    expect(result).toEqual({ ok: true, data: { status: "REJECTED" }, message: "Facture FA-014 refusée." });
    expect(mocks.service.moveInvoice).toHaveBeenCalledWith({ invoiceId: "inv_1", gesture: "REJECT", reason: "Montant erroné" }, DIRECTOR);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/directeur/factures/inv_1");
  });

  it("refuse un geste inconnu avant d'appeler le service", async () => {
    expect(await actions.invoiceGestureAction({ invoiceId: "inv_1", gesture: "ERASE" } as never)).toMatchObject({ ok: false });
    expect(await actions.invoiceGestureAction({ invoiceId: "", gesture: "APPROVE" })).toMatchObject({ ok: false });
    noServiceCalled();
  });

  it("dit pourquoi la machine d'états a refusé", async () => {
    mocks.service.moveInvoice.mockResolvedValue({ ok: false, error: "Validez d'abord la facture : on ne paie qu'une facture validée." });
    expect(await actions.invoiceGestureAction({ invoiceId: "inv_1", gesture: "PAY" })).toMatchObject({ ok: false, error: expect.stringContaining("Validez d'abord") });
  });

  it("supprime une facture : le directeur de la session, le refus du service répété", async () => {
    mocks.service.deleteInvoice.mockResolvedValueOnce({ ok: true, number: "FA-014" });
    expect(await actions.deleteInvoiceAction({ invoiceId: "inv_1" })).toEqual({ ok: true, data: null, message: "Facture FA-014 supprimée." });
    expect(mocks.service.deleteInvoice).toHaveBeenCalledWith("inv_1", DIRECTOR);
    mocks.service.deleteInvoice.mockResolvedValueOnce({ ok: false, error: "Une facture validée ou payée ne se supprime pas." });
    expect(await actions.deleteInvoiceAction({ invoiceId: "inv_2" })).toMatchObject({ ok: false });
    expect(await actions.deleteInvoiceAction({ invoiceId: "" })).toMatchObject({ ok: false });
  });
});
