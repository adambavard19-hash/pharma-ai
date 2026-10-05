import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les actions des nouveautés : la permission en première ligne, l'officine
 * prise dans la SESSION, jamais dans la requête, et des actions publiques qui
 * n'acceptent que le jeton et se laissent limiter.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  service: {
    confirmNewsOptIn: vi.fn(),
    confirmNewsUnsubscribe: vi.fn(),
    previewAnnouncement: vi.fn(),
    resumeAnnouncement: vi.fn(),
    sendAnnouncement: vi.fn(),
    sendAnnouncementTest: vi.fn(),
    setPatientNewsEnabled: vi.fn(),
  },
  visitor: { ip: "203.0.113.1" },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": `${mocks.visitor.ip}, 10.0.0.1` }) }));
vi.mock("@/server/services/patient-news", () => mocks.service);

const actions = await import("../patient-news");

const SESSION = { scope: { pharmacyId: "ph_session", organizationId: "org_1", userId: "user_1" }, user: { email: "titulaire@officine.fr" } };
const INPUT = { title: "Une nouvelle gamme est arrivée", rangeLabel: "Gamme Solaire", message: "Découvrez notre nouvelle gamme de soins solaires." };
const VALUE = { title: INPUT.title, rangeLabel: INPUT.rangeLabel, message: INPUT.message };

const SENT = { ok: true, announcementId: "ann_1", recipientCount: 3, sentCount: 3, failedCount: 0, simulated: false, complete: true };

let visitorCounter = 0;

beforeEach(() => {
  vi.clearAllMocks();
  visitorCounter += 1;
  mocks.visitor.ip = `198.51.100.${visitorCounter}`;
  mocks.requirePermission.mockResolvedValue(SESSION);
  mocks.service.sendAnnouncement.mockResolvedValue(SENT);
  mocks.service.resumeAnnouncement.mockResolvedValue({ ok: true, sentCount: 3, failedCount: 0, complete: true });
  mocks.service.previewAnnouncement.mockResolvedValue({ subject: "s", text: "t", html: "h" });
  mocks.service.sendAnnouncementTest.mockResolvedValue({ status: "SENT", detail: "ok" });
  mocks.service.setPatientNewsEnabled.mockResolvedValue(undefined);
  mocks.service.confirmNewsOptIn.mockResolvedValue({ ok: true, pharmacyName: "Pharmacie Saint-Michel", welcomeSent: true });
  mocks.service.confirmNewsUnsubscribe.mockResolvedValue({ ok: true, pharmacyName: "Pharmacie Saint-Michel" });
});

const formWith = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
};

describe("côté officine : la permission d'abord, l'officine de la session", () => {
  const calls: [string, () => Promise<unknown>, () => unknown][] = [
    ["previewAnnouncementAction", () => actions.previewAnnouncementAction(INPUT), () => mocks.service.previewAnnouncement],
    ["sendAnnouncementTestAction", () => actions.sendAnnouncementTestAction(INPUT), () => mocks.service.sendAnnouncementTest],
    ["sendAnnouncementAction", () => actions.sendAnnouncementAction({ ...INPUT, confirmedRecipientCount: 3 }), () => mocks.service.sendAnnouncement],
    ["resumeAnnouncementAction", () => actions.resumeAnnouncementAction("ann_1"), () => mocks.service.resumeAnnouncement],
    ["setPatientNewsEnabledAction", () => actions.setPatientNewsEnabledAction(false), () => mocks.service.setPatientNewsEnabled],
  ];

  for (const [name, run, service] of calls) {
    it(`${name} exige la permission « annoncer les nouveautés » avant tout le reste`, async () => {
      mocks.requirePermission.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;403"));
      await expect(run()).rejects.toThrow("403");
      expect(mocks.requirePermission).toHaveBeenCalledWith("news:manage");
      expect(service()).not.toHaveBeenCalled();
    });
  }

  it("l'officine vient de la session : un identifiant d'officine dans la requête est ignoré", async () => {
    await actions.sendAnnouncementAction({ ...INPUT, confirmedRecipientCount: 3, pharmacyId: "ph_autre", scope: { pharmacyId: "ph_autre" } } as never);
    expect(mocks.service.sendAnnouncement).toHaveBeenCalledWith(SESSION.scope, VALUE, 3);
    await actions.resumeAnnouncementAction("ann_1");
    expect(mocks.service.resumeAnnouncement).toHaveBeenCalledWith(SESSION.scope, "ann_1");
    await actions.setPatientNewsEnabledAction(true);
    expect(mocks.service.setPatientNewsEnabled).toHaveBeenCalledWith(SESSION.scope, true);
    await actions.previewAnnouncementAction({ ...INPUT, pharmacyId: "ph_autre" } as never);
    expect(mocks.service.previewAnnouncement).toHaveBeenCalledWith(SESSION.scope, VALUE);
  });

  it("le test part vers l'adresse de l'utilisateur connecté, pas vers une adresse de la requête", async () => {
    await actions.sendAnnouncementTestAction({ ...INPUT, email: "autre@exemple.fr", to: "autre@exemple.fr" } as never);
    expect(mocks.service.sendAnnouncementTest).toHaveBeenCalledWith({ ...SESSION.scope, email: "titulaire@officine.fr" }, VALUE);
  });

  it("rejoue les règles du contenu avant d'appeler le service", async () => {
    const bad = [{ ...INPUT, message: "Voir https://exemple.fr" }, { ...INPUT, title: "   " }, { ...INPUT, message: "Remboursé !" }, { ...INPUT, message: "Écrivez à moi@exemple.fr" }];
    for (const input of bad) {
      expect((await actions.sendAnnouncementAction({ ...input, confirmedRecipientCount: 3 })).ok).toBe(false);
      expect((await actions.previewAnnouncementAction(input)).ok).toBe(false);
      expect((await actions.sendAnnouncementTestAction(input)).ok).toBe(false);
    }
    expect(mocks.service.sendAnnouncement).not.toHaveBeenCalled();
    expect(mocks.service.previewAnnouncement).not.toHaveBeenCalled();
    expect(mocks.service.sendAnnouncementTest).not.toHaveBeenCalled();
  });

  it("refuse une requête mal formée", async () => {
    for (const payload of [null, undefined, "texte", { title: 3, message: "x" }, { ...INPUT, confirmedRecipientCount: -1 }, { ...INPUT, confirmedRecipientCount: 2.5 }, { ...INPUT, confirmedRecipientCount: "3" }, { ...INPUT }]) {
      expect(await actions.sendAnnouncementAction(payload as never)).toEqual({ ok: false, error: "Requête invalide.", fieldErrors: undefined });
    }
    expect(await actions.resumeAnnouncementAction("" as never)).toMatchObject({ ok: false });
    expect(await actions.setPatientNewsEnabledAction("oui" as never)).toMatchObject({ ok: false });
    expect(mocks.service.sendAnnouncement).not.toHaveBeenCalled();
    expect(mocks.service.setPatientNewsEnabled).not.toHaveBeenCalled();
  });

  it("transmet au service le nombre d'abonnés que le titulaire a confirmé", async () => {
    await actions.sendAnnouncementAction({ ...INPUT, confirmedRecipientCount: 42 });
    expect(mocks.service.sendAnnouncement).toHaveBeenCalledWith(SESSION.scope, VALUE, 42);
  });
});

describe("l'écran ne dit « envoyé » que si des messages sont réellement partis", () => {
  const send = () => actions.sendAnnouncementAction({ ...INPUT, confirmedRecipientCount: 3 });

  it("annonce envoyée", async () => {
    const result = await send();
    expect(result).toMatchObject({ ok: true, message: "Annonce envoyée à 3 abonnés.", data: { announcementId: "ann_1", sentCount: 3, simulated: false, complete: true } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/nouveautes");
  });

  it("envoi partiel : dit combien de messages n'ont pas pu être remis", async () => {
    mocks.service.sendAnnouncement.mockResolvedValue({ ...SENT, sentCount: 2, failedCount: 1 });
    expect(await send()).toMatchObject({ ok: true, message: "Annonce envoyée à 2 abonnés ; 1 message n'ont pas pu être remis." });
  });

  it("messagerie non configurée : envoi SIMULÉ, jamais « envoyé »", async () => {
    mocks.service.sendAnnouncement.mockResolvedValue({ ...SENT, simulated: true });
    const result = await send();
    expect(result).toMatchObject({ ok: true, data: { simulated: true } });
    expect(result.ok && result.message).toContain("SIMULÉ");
    expect(result.ok && result.message).not.toMatch(/envoyée à/);
  });

  it("envoi en cours : dit qu'il reste des abonnés à servir", async () => {
    mocks.service.sendAnnouncement.mockResolvedValue({ ...SENT, sentCount: 5, complete: false });
    const result = await send();
    expect(result).toMatchObject({ ok: true, data: { complete: false } });
    expect(result.ok && result.message).toContain("en cours");
  });

  it("aucun message parti : c'est un échec", async () => {
    mocks.service.sendAnnouncement.mockResolvedValue({ ...SENT, sentCount: 0, failedCount: 3 });
    const result = await send();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("Aucun message n'est parti");
  });

  it("un refus du service (intervalle, nombre d'abonnés…) est rendu tel quel", async () => {
    mocks.service.sendAnnouncement.mockResolvedValue({ ok: false, error: "Une annonce a déjà été envoyée cette semaine." });
    expect(await send()).toMatchObject({ ok: false, error: "Une annonce a déjà été envoyée cette semaine." });
  });

  it("une panne inattendue ne montre aucun détail technique et laisse une trace serveur", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.service.sendAnnouncement.mockRejectedValue(new Error("connexion à db.interne:5432 perdue"));
    const result = await send();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).not.toContain("5432");
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("le test : envoyé, simulé ou en échec, dit la vérité", async () => {
    expect(await actions.sendAnnouncementTestAction(INPUT)).toMatchObject({ ok: true, message: "Message de test envoyé à votre adresse." });
    mocks.service.sendAnnouncementTest.mockResolvedValue({ status: "SIMULATED", detail: "non configuré" });
    expect(await actions.sendAnnouncementTestAction(INPUT)).toMatchObject({ ok: true, message: expect.stringContaining("SIMULÉ") });
    mocks.service.sendAnnouncementTest.mockResolvedValue({ status: "FAILED", detail: "refusé" });
    expect(await actions.sendAnnouncementTestAction(INPUT)).toMatchObject({ ok: false, error: expect.stringContaining("refusé") });
  });

  it("la reprise : terminée ou à poursuivre", async () => {
    expect(await actions.resumeAnnouncementAction("ann_1")).toMatchObject({ ok: true, message: "Envoi terminé." });
    mocks.service.resumeAnnouncement.mockResolvedValue({ ok: true, sentCount: 5, failedCount: 0, complete: false });
    expect(await actions.resumeAnnouncementAction("ann_1")).toMatchObject({ ok: true, data: { complete: false } });
    mocks.service.resumeAnnouncement.mockResolvedValue({ ok: false, error: "Cette annonce est déjà terminée." });
    expect(await actions.resumeAnnouncementAction("ann_1")).toMatchObject({ ok: false, error: "Cette annonce est déjà terminée." });
  });

  it("l'interrupteur dit ce qu'il change", async () => {
    expect(await actions.setPatientNewsEnabledAction(false)).toMatchObject({ ok: true, data: { enabled: false }, message: expect.stringContaining("ne figure plus") });
    expect(await actions.setPatientNewsEnabledAction(true)).toMatchObject({ ok: true, data: { enabled: true } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/nouveautes");
  });
});

describe("côté patient : aucune session, le jeton seul", () => {
  it("l'abonnement ne demande aucune session et ne transmet au service que le jeton", async () => {
    const result = await actions.confirmNewsOptInAction(null, formWith({ token: "  jeton-abc  ", pharmacyId: "ph_autre", email: "pirate@exemple.fr" }));
    expect(result).toMatchObject({ ok: true, data: { pharmacyName: "Pharmacie Saint-Michel" } });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.service.confirmNewsOptIn).toHaveBeenCalledWith("jeton-abc");
  });

  it("la désinscription non plus", async () => {
    const result = await actions.confirmNewsUnsubscribeAction(null, formWith({ token: "jeton-abc", email: "pirate@exemple.fr" }));
    expect(result).toMatchObject({ ok: true, data: { pharmacyName: "Pharmacie Saint-Michel" } });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.service.confirmNewsUnsubscribe).toHaveBeenCalledWith("jeton-abc");
  });

  it("un jeton absent, vide ou démesuré est refusé sans toucher au service", async () => {
    for (const action of [actions.confirmNewsOptInAction, actions.confirmNewsUnsubscribeAction]) {
      for (const form of [formWith({}), formWith({ token: "   " }), formWith({ token: "a".repeat(2001) })]) {
        expect(await action(null, form)).toEqual({ ok: false, error: "Lien invalide.", fieldErrors: undefined });
      }
    }
    expect(mocks.service.confirmNewsOptIn).not.toHaveBeenCalled();
    expect(mocks.service.confirmNewsUnsubscribe).not.toHaveBeenCalled();
  });

  it("le message d'erreur du service est rendu au patient tel quel", async () => {
    mocks.service.confirmNewsOptIn.mockResolvedValue({ ok: false, error: "Ce lien n'est plus valide." });
    expect(await actions.confirmNewsOptInAction(null, formWith({ token: "x" }))).toMatchObject({ ok: false, error: "Ce lien n'est plus valide." });
    mocks.service.confirmNewsUnsubscribe.mockResolvedValue({ ok: false, error: "Ce lien de désinscription n'est plus valide." });
    expect(await actions.confirmNewsUnsubscribeAction(null, formWith({ token: "x" }))).toMatchObject({ ok: false, error: "Ce lien de désinscription n'est plus valide." });
  });

  it("limite le débit par adresse IP : au-delà de 30 tentatives par heure, le service n'est plus appelé", async () => {
    mocks.service.confirmNewsOptIn.mockResolvedValue({ ok: false, error: "Ce lien n'est plus valide." });
    for (let attempt = 0; attempt < 30; attempt += 1) await actions.confirmNewsOptInAction(null, formWith({ token: `essai-${attempt}` }));
    expect(mocks.service.confirmNewsOptIn).toHaveBeenCalledTimes(30);
    const blocked = await actions.confirmNewsOptInAction(null, formWith({ token: "essai-31" }));
    expect(blocked).toMatchObject({ ok: false, error: "Trop de tentatives : réessayez dans une heure." });
    expect(mocks.service.confirmNewsOptIn).toHaveBeenCalledTimes(30);

    // Un autre visiteur n'est pas touché : sa tentative atteint le service (qui la refuse, le jeton étant faux).
    mocks.visitor.ip = "192.0.2.77";
    expect(await actions.confirmNewsOptInAction(null, formWith({ token: "autre" }))).toMatchObject({ ok: false, error: "Ce lien n'est plus valide." });
    expect(mocks.service.confirmNewsOptIn).toHaveBeenCalledTimes(31);
  });

  it("la désinscription a sa propre limite, distincte de celle de l'abonnement", async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) await actions.confirmNewsUnsubscribeAction(null, formWith({ token: `essai-${attempt}` }));
    expect(await actions.confirmNewsUnsubscribeAction(null, formWith({ token: "essai-31" }))).toMatchObject({ ok: false, error: "Trop de tentatives : réessayez dans une heure." });
    expect(await actions.confirmNewsOptInAction(null, formWith({ token: "x" }))).toMatchObject({ ok: true });
  });
});
