import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les actions de la console : la session administrateur d'abord, la forme des
 * entrées ensuite, le mot « ENVOYER » retapé, et jamais une adresse ou un
 * identifiant d'administrateur pris dans la demande.
 */

const mocks = vi.hoisted(() => ({
  requirePlatformSession: vi.fn(),
  revalidatePath: vi.fn(),
  service: {
    cancelCampaign: vi.fn(),
    createCampaign: vi.fn(),
    deleteDraftCampaign: vi.fn(),
    previewAudience: vi.fn(),
    previewCampaignEmail: vi.fn(),
    resumeCampaign: vi.fn(),
    scheduleCampaign: vi.fn(),
    sendCampaignTest: vi.fn(),
    startCampaign: vi.fn(),
    unscheduleCampaign: vi.fn(),
    updateCampaign: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: mocks.requirePlatformSession }));
vi.mock("@/server/services/admin/campaigns", () => mocks.service);

const actions = await import("@/server/actions/admin-campaigns");

const SESSION = { admin: { id: "adm_1", email: "admin@pharma.ai", fullName: "Alice Admin", initials: "AA" }, sessionId: "s_1" };

const draft = (overrides: Record<string, unknown> = {}) => ({
  kind: "ANNOUNCEMENT",
  name: "Annonce d'octobre",
  subject: "Une information",
  title: "Une information",
  body: "Bonjour {{prenom}},\n\nUne information pour {{officine}}.",
  audience: "pharmacies.all_active",
  ...overrides,
});

const noServiceCalled = () => Object.values(mocks.service).forEach((fn) => expect(fn).not.toHaveBeenCalled());

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePlatformSession.mockResolvedValue(SESSION);
});

describe("chaque action commence par la session administrateur", () => {
  it("sans session, toutes les actions s'arrêtent avant toute lecture ou écriture", async () => {
    const redirected = new Error("NEXT_REDIRECT /admin-connexion");
    mocks.requirePlatformSession.mockRejectedValue(redirected);
    const names = Object.keys(actions);
    expect(names.sort()).toEqual(["cancelCampaignAction", "deleteDraftCampaignAction", "previewAudienceAction", "previewCampaignEmailAction", "resumeCampaignAction", "saveCampaignAction", "scheduleCampaignAction", "sendCampaignTestAction", "startCampaignAction", "unscheduleCampaignAction"]);
    for (const name of names) {
      const action = actions[name as keyof typeof actions] as (payload: unknown) => Promise<unknown>;
      await expect(action({ id: "camp_1", confirmedCount: 3, confirmation: "ENVOYER", date: "2026-10-15", ...draft() })).rejects.toBe(redirected);
    }
    noServiceCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("enregistrer", () => {
  it("sans identifiant, crée un brouillon pour l'administrateur de la session ; rien n'est envoyé", async () => {
    mocks.service.createCampaign.mockResolvedValue({ id: "camp_9" });
    const result = await actions.saveCampaignAction(draft());
    expect(result).toEqual({ ok: true, data: { id: "camp_9", warnings: [] }, message: "Brouillon enregistré. Rien n'est envoyé." });
    expect(mocks.service.createCampaign).toHaveBeenCalledWith(expect.objectContaining({ kind: "ANNOUNCEMENT", name: "Annonce d'octobre", offerAmountCents: null }), "adm_1");
    expect(mocks.service.updateCampaign).not.toHaveBeenCalled();
    expect(mocks.service.startCampaign).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/campagnes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/campagnes/camp_9");
  });

  it("avec un identifiant, modifie ; une campagne programmée modifiée est dite redevenue brouillon", async () => {
    mocks.service.updateCampaign.mockResolvedValueOnce({ ok: true, backToDraft: false }).mockResolvedValueOnce({ ok: true, backToDraft: true });
    expect(await actions.saveCampaignAction({ ...draft(), id: "camp_1" })).toMatchObject({ ok: true, message: "Campagne enregistrée. Rien n'est envoyé." });
    expect(await actions.saveCampaignAction({ ...draft(), id: "camp_1" })).toMatchObject({ ok: true, message: expect.stringContaining("redevenue un brouillon") });
    expect(mocks.service.updateCampaign).toHaveBeenCalledWith("camp_1", expect.objectContaining({ kind: "ANNOUNCEMENT" }), "adm_1");
    expect(mocks.service.createCampaign).not.toHaveBeenCalled();
  });

  it("une erreur du service est rendue telle quelle", async () => {
    mocks.service.updateCampaign.mockResolvedValue({ ok: false, error: "La campagne vient de changer." });
    expect(await actions.saveCampaignAction({ ...draft(), id: "camp_1" })).toEqual({ ok: false, error: "La campagne vient de changer.", fieldErrors: undefined });
  });

  it("les règles du domaine s'appliquent avant toute écriture : montant hors bornes, variable inconnue, accolade mal formée", async () => {
    const referral = { kind: "REFERRAL_OFFER", subject: "Parrainage {{montant_offre}}", title: "Parrainage", body: "Bonjour {{prenom}}, {{montant_offre}} par filleul.", buttonLabel: null, buttonTarget: null };
    for (const bad of [{ ...referral, offerAmountCents: 99 }, { ...referral, offerAmountCents: 50_001 }, { ...referral, offerAmountCents: 2000, body: "Bonjour {{surnom}}, une offre." }, { ...referral, offerAmountCents: 2000, body: "Bonjour {{prenom, une offre." }]) {
      const result = await actions.saveCampaignAction(draft(bad));
      expect(result.ok).toBe(false);
    }
    noServiceCalled();
  });

  it("la date de fin « AAAA-MM-JJ » et le montant en centimes traversent jusqu'au service, normalisés", async () => {
    mocks.service.createCampaign.mockResolvedValue({ id: "camp_9" });
    await actions.saveCampaignAction(draft({ kind: "REFERRAL_OFFER", subject: "Parrainage {{montant_offre}}", title: "Parrainage", body: "Bonjour {{prenom}}, {{montant_offre}} par filleul.", offerAmountCents: 2000, offerEndsAt: "2099-10-31" }));
    const input = mocks.service.createCampaign.mock.calls[0][0] as { offerAmountCents: number; offerEndsAt: Date };
    expect(input.offerAmountCents).toBe(2000);
    expect(input.offerEndsAt.toISOString()).toBe("2099-10-31T22:59:59.999Z");
  });

  it("la forme est contrôlée : champs manquants, trop longs, de mauvais types", async () => {
    expect((await actions.saveCampaignAction({ kind: "ANNOUNCEMENT" } as never)).ok).toBe(false);
    expect((await actions.saveCampaignAction(draft({ body: "a".repeat(12_001) }))).ok).toBe(false);
    expect((await actions.saveCampaignAction(draft({ alsoInApp: "oui" }))).ok).toBe(false);
    expect((await actions.saveCampaignAction(draft({ audienceParams: { pharmacyIds: "ph_1" } }))).ok).toBe(false);
    expect((await actions.saveCampaignAction({ ...draft(), id: "x".repeat(61) })).ok).toBe(false);
    noServiceCalled();
  });

  it("les avertissements du domaine remontent avec le brouillon enregistré", async () => {
    mocks.service.createCampaign.mockResolvedValue({ id: "camp_9" });
    const result = await actions.saveCampaignAction(draft({ kind: "REFERRAL_OFFER", subject: "Parrainage", title: "Parrainage", body: "Bonjour {{prenom}}, parrainez des officines.", offerAmountCents: 3000 }));
    expect(result).toMatchObject({ ok: true, data: { id: "camp_9", warnings: ["Le message ne mentionne pas le montant de l'offre : écrivez {{montant_offre}}."] } });
    // Un montant inférieur à la remise de 20 % du parrainage (25,20 € pour 126 € HT) est signalé aussi.
    mocks.service.createCampaign.mockResolvedValue({ id: "camp_10" });
    const low = await actions.saveCampaignAction(draft({ kind: "REFERRAL_OFFER", subject: "Parrainage {{montant_offre}}", title: "Parrainage", body: "Bonjour {{prenom}}, {{montant_offre}} par filleul.", offerAmountCents: 2000 }));
    expect(low).toMatchObject({ ok: true, data: { warnings: [expect.stringContaining("inférieur à la remise de 20 % du parrainage")] } });
  });
});

describe("aperçus : lecture seule", () => {
  it("l'aperçu du public ne passe au service que le public et sa sélection", async () => {
    mocks.service.previewAudience.mockResolvedValue({ count: 3, excluded: { optedOut: 0, noEmail: 0, duplicates: 0 }, sample: [] });
    const result = await actions.previewAudienceAction({ audience: "pharmacies.selected", audienceParams: { pharmacyIds: ["ph_1"], partnerIds: ["pa_1"] }, adminId: "evil" } as never);
    expect(result).toMatchObject({ ok: true, data: { count: 3 } });
    expect(mocks.service.previewAudience).toHaveBeenCalledWith("pharmacies.selected", { pharmacyIds: ["ph_1"], partnerIds: ["pa_1"] });
    expect((await actions.previewAudienceAction({ audience: "pharmacies.tout" })).ok).toBe(false);
    expect((await actions.previewAudienceAction({ audience: "constructor" })).ok).toBe(false);
  });

  it("l'aperçu du message rend le brouillon validé, avec ses valeurs d'exemple annoncées", async () => {
    mocks.service.previewCampaignEmail.mockResolvedValue({ subject: "Une information", text: "t", html: "<p>h</p>" });
    expect(await actions.previewCampaignEmailAction(draft())).toEqual({ ok: true, data: { subject: "Une information", text: "t", html: "<p>h</p>", usesSamples: true }, message: undefined });
    expect((await actions.previewCampaignEmailAction(draft({ body: "{{inconnue}} un message" }))).ok).toBe(false);
    expect(mocks.service.sendCampaignTest).not.toHaveBeenCalled();
  });
});

describe("test d'envoi : à l'administrateur de la session", () => {
  it("l'adresse est celle de la session, quoi que dise la demande", async () => {
    mocks.service.sendCampaignTest.mockResolvedValue({ status: "SENT", detail: "Remis au prestataire." });
    const result = await actions.sendCampaignTestAction({ ...draft(), email: "victime@exemple.fr", to: "victime@exemple.fr", recipient: "victime@exemple.fr" } as never);
    expect(result).toEqual({ ok: true, data: { status: "SENT", detail: "Remis au prestataire.", recipient: "admin@pharma.ai" }, message: "Test envoyé à admin@pharma.ai." });
    expect(mocks.service.sendCampaignTest).toHaveBeenCalledTimes(1);
    const [sentDraft, adminId, adminEmail] = mocks.service.sendCampaignTest.mock.calls[0] as [Record<string, unknown>, string, string];
    expect(adminId).toBe("adm_1");
    expect(adminEmail).toBe("admin@pharma.ai");
    expect(JSON.stringify(sentDraft)).not.toContain("victime@exemple.fr");
  });

  it("simulé : dit non transmis ; en échec : n'est pas parti", async () => {
    mocks.service.sendCampaignTest.mockResolvedValueOnce({ status: "SIMULATED", detail: "simulé" });
    expect(await actions.sendCampaignTestAction(draft())).toMatchObject({ ok: true, message: "Test non transmis : la messagerie n'est pas configurée sur ce serveur." });
    mocks.service.sendCampaignTest.mockResolvedValueOnce({ status: "FAILED", detail: "refusé" });
    expect(await actions.sendCampaignTestAction(draft())).toEqual({ ok: false, error: "Le test n'est pas parti : refusé", fieldErrors: undefined });
  });

  it("un brouillon invalide n'envoie rien", async () => {
    expect((await actions.sendCampaignTestAction(draft({ subject: "Bonjour\nBcc: x@y.fr" }))).ok).toBe(false);
    expect(mocks.service.sendCampaignTest).not.toHaveBeenCalled();
  });
});

describe("envoi et programmation : le mot « ENVOYER » retapé", () => {
  const run = { recipientCount: 12, sentCount: 12, failedCount: 0, skippedCount: 0, simulated: false, complete: true };

  it("sans le mot, rien ne part ; avec une autre casse ou des espaces, il est accepté", async () => {
    mocks.service.startCampaign.mockResolvedValue({ ok: true, ...run });
    for (const confirmation of ["", "envoie", "OUI", "ENVOYER PLUS TARD"]) {
      const result = await actions.startCampaignAction({ id: "camp_1", confirmedCount: 12, confirmation });
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining("ENVOYER") });
    }
    expect(mocks.service.startCampaign).not.toHaveBeenCalled();
    expect((await actions.startCampaignAction({ id: "camp_1", confirmedCount: 12, confirmation: "  envoyer " })).ok).toBe(true);
    expect(mocks.service.startCampaign).toHaveBeenCalledTimes(1);
  });

  it("l'identifiant de l'administrateur est celui de la session ; le nombre confirmé, celui de la demande, comparé par le serveur", async () => {
    mocks.service.startCampaign.mockResolvedValue({ ok: true, ...run });
    await actions.startCampaignAction({ id: "camp_1", confirmedCount: 12, confirmation: "ENVOYER", adminId: "evil" } as never);
    expect(mocks.service.startCampaign).toHaveBeenCalledWith("camp_1", "adm_1", 12);
  });

  it("refuse une demande mal formée : nombre négatif, décimal, énorme, identifiant vide", async () => {
    for (const bad of [{ id: "camp_1", confirmedCount: -1 }, { id: "camp_1", confirmedCount: 1.5 }, { id: "camp_1", confirmedCount: 2_000_000 }, { id: "", confirmedCount: 3 }, { confirmedCount: 3 }]) {
      expect((await actions.startCampaignAction({ confirmation: "ENVOYER", ...bad } as never)).ok).toBe(false);
    }
    expect(mocks.service.startCampaign).not.toHaveBeenCalled();
  });

  it("le refus du serveur (nombre qui a changé) est rendu tel quel", async () => {
    mocks.service.startCampaign.mockResolvedValue({ ok: false, error: "Le nombre de destinataires a changé : 12 confirmés, 13 aujourd'hui." });
    expect(await actions.startCampaignAction({ id: "camp_1", confirmedCount: 12, confirmation: "ENVOYER" })).toMatchObject({ ok: false, error: expect.stringContaining("12 confirmés, 13 aujourd'hui") });
  });

  it("le message dit ce qui s'est passé : envoyé, simulé (jamais « envoyé »), en cours", async () => {
    const send = () => actions.startCampaignAction({ id: "camp_1", confirmedCount: 12, confirmation: "ENVOYER" });
    mocks.service.startCampaign.mockResolvedValueOnce({ ok: true, ...run, failedCount: 1, skippedCount: 2, sentCount: 11 });
    expect(await send()).toMatchObject({ ok: true, message: "Campagne envoyée : 11 e-mails, 1 en échec, 2 ignorés." });
    mocks.service.startCampaign.mockResolvedValueOnce({ ok: true, ...run, simulated: true });
    const simulated = await send();
    expect(simulated).toMatchObject({ ok: true, message: expect.stringContaining("Envoi simulé") });
    expect((simulated as { message: string }).message).toContain("aucun e-mail n'est parti");
    expect((simulated as { message: string }).message).not.toContain("Campagne envoyée");
    mocks.service.startCampaign.mockResolvedValueOnce({ ok: true, ...run, sentCount: 5, complete: false });
    expect(await send()).toMatchObject({ ok: true, message: expect.stringContaining("5 destinataires traités sur 12") });
  });

  it("programmer : le même mot, un jour valide à Paris, le nombre confirmé, la session", async () => {
    mocks.service.scheduleCampaign.mockResolvedValue({ ok: true });
    expect((await actions.scheduleCampaignAction({ id: "camp_1", date: "2026-10-15", confirmedCount: 3, confirmation: "oui" })).ok).toBe(false);
    for (const date of ["", "demain", "2026-02-30", "15/10/2026"]) {
      expect((await actions.scheduleCampaignAction({ id: "camp_1", date, confirmedCount: 3, confirmation: "ENVOYER" })).ok).toBe(false);
    }
    expect(mocks.service.scheduleCampaign).not.toHaveBeenCalled();
    const result = await actions.scheduleCampaignAction({ id: "camp_1", date: "2026-10-15", confirmedCount: 3, confirmation: "ENVOYER" });
    expect(result.ok).toBe(true);
    const [id, day, adminId, count] = mocks.service.scheduleCampaign.mock.calls[0] as [string, Date, string, number];
    expect([id, adminId, count]).toEqual(["camp_1", "adm_1", 3]);
    // Minuit du 15 octobre à Paris (heure d'été).
    expect(day.toISOString()).toBe("2026-10-14T22:00:00.000Z");
  });

  it("programmer : le refus du serveur est rendu", async () => {
    mocks.service.scheduleCampaign.mockResolvedValue({ ok: false, error: "Choisissez une date à partir de demain." });
    expect(await actions.scheduleCampaignAction({ id: "camp_1", date: "2026-10-05", confirmedCount: 3, confirmation: "ENVOYER" })).toMatchObject({ ok: false, error: "Choisissez une date à partir de demain." });
  });
});

describe("les autres gestes", () => {
  it("retirer la programmation, reprendre, annuler, supprimer : l'administrateur de la session, la page rafraîchie", async () => {
    mocks.service.unscheduleCampaign.mockResolvedValue({ ok: true });
    mocks.service.resumeCampaign.mockResolvedValue({ ok: true, complete: false, sentCount: 7, failedCount: 0 });
    mocks.service.cancelCampaign.mockResolvedValue({ ok: true });
    mocks.service.deleteDraftCampaign.mockResolvedValue({ ok: true });
    expect((await actions.unscheduleCampaignAction({ id: "camp_1" })).ok).toBe(true);
    expect(await actions.resumeCampaignAction({ id: "camp_1" })).toMatchObject({ ok: true, data: { complete: false, sentCount: 7, failedCount: 0 }, message: expect.stringContaining("il reste des destinataires") });
    expect((await actions.cancelCampaignAction({ id: "camp_1" })).ok).toBe(true);
    expect((await actions.deleteDraftCampaignAction({ id: "camp_1" })).ok).toBe(true);
    expect(mocks.service.unscheduleCampaign).toHaveBeenCalledWith("camp_1", "adm_1");
    expect(mocks.service.resumeCampaign).toHaveBeenCalledWith("camp_1", "adm_1");
    expect(mocks.service.cancelCampaign).toHaveBeenCalledWith("camp_1", "adm_1");
    expect(mocks.service.deleteDraftCampaign).toHaveBeenCalledWith("camp_1", "adm_1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/campagnes/camp_1");
  });

  it("les refus du service sont rendus, et une demande sans identifiant est refusée", async () => {
    mocks.service.cancelCampaign.mockResolvedValue({ ok: false, error: "Seule une campagne programmée, ou en cours d'envoi, s'annule." });
    expect(await actions.cancelCampaignAction({ id: "camp_1" })).toMatchObject({ ok: false, error: expect.stringContaining("s'annule") });
    for (const action of [actions.unscheduleCampaignAction, actions.resumeCampaignAction, actions.cancelCampaignAction, actions.deleteDraftCampaignAction]) {
      expect((await action({} as never)).ok).toBe(false);
    }
  });
});
