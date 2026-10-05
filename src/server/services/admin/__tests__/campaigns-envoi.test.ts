import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOW, audience, auditActions, campaignRow, mocks, prisma, provider, recipientRows, recipientsOf, reset, seedCampaign, seedRecipient, seedReferral, sentTo, setAudience, state, statusCounts } from "./campaigns-harness";

/**
 * L'envoi des campagnes : jamais deux fois la même adresse, jamais sans envoi
 * confirmé, jamais à un désinscrit, jamais présenté comme réussi quand il est
 * simulé. Les écritures conditionnelles de la base sont respectées par le
 * double ; deux appels simultanés se disputent vraiment les mêmes lignes.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({ getEnv: () => ({ AUTH_SESSION_SECRET: "s".repeat(48), DATA_ENCRYPTION_KEY: "k".repeat(32) }) }));
vi.mock("@/server/db/client", async () => ({ prisma: (await import("./campaigns-harness")).prisma }));
vi.mock("@/server/audit/log", async () => ({ recordAudit: (await import("./campaigns-harness")).mocks.recordAudit }));
vi.mock("@/server/ai/registry", async () => ({ getMessagingProvider: (await import("./campaigns-harness")).messagingProvider }));
vi.mock("@/server/public-url", async () => ({ publicUrl: (await import("./campaigns-harness")).publicUrl }));
vi.mock("@/server/services/email-dispatch", async () => ({ traceDispatch: (await import("./campaigns-harness")).mocks.traceDispatch }));
vi.mock("@/server/services/email-context", async () => ({ platformEmailContext: (await import("./campaigns-harness")).mocks.platformEmailContext }));
vi.mock("@/server/services/notifications", async () => ({ createNotification: (await import("./campaigns-harness")).mocks.createNotification }));
vi.mock("@/server/services/sales/notifications", async () => ({ notifyAdmins: (await import("./campaigns-harness")).mocks.notifyAdmins }));
vi.mock("@/server/services/referral-offers", async () => {
  const { mocks } = await import("./campaigns-harness");
  return { startReferralOffer: mocks.startReferralOffer, endReferralOffer: mocks.endReferralOffer };
});
vi.mock("../campaign-audience", async () => {
  const { mocks } = await import("./campaigns-harness");
  return { resolveAudience: mocks.resolveAudience, recipientValues: mocks.recipientValues };
});

const svc = await import("../campaigns");
const { hashEmail } = await import("@/server/security/tokens");

const MINUTE = 60 * 1000;
const delivered = (to: string) => ({ status: "SENT" as const, provider: "test", detail: "Remis au prestataire.", messageId: `m_${to}` });

type Sent = { to: string; subject: string; text: string; html: string; fromName: string; headers: Record<string, string> };
const messages = () => mocks.sendEmail.mock.calls.map((call) => call[0] as unknown as Sent);

/** Chaque adresse n'a reçu qu'un seul message. */
const noDuplicates = () => expect(new Set(sentTo()).size).toBe(sentTo().length);

/** Le budget d'envoi est épuisé : le temps passe d'une minute à chaque message parti. */
const slowClock = () =>
  mocks.sendEmail.mockImplementation(async (message: { to: string }) => {
    vi.setSystemTime(Date.now() + MINUTE);
    return delivered(message.to);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  reset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("envoi confirmé", () => {
  it("chaque destinataire reçoit un message, avec ses valeurs, son pied de désinscription et ses en-têtes", async () => {
    const id = seedCampaign({ buttonLabel: "Ouvrir mon espace", buttonTarget: "espace" });
    setAudience(recipientsOf(12));
    const result = await svc.startCampaign(id, "adm_1", 12);
    expect(result).toEqual({ ok: true, recipientCount: 12, sentCount: 12, failedCount: 0, skippedCount: 0, simulated: false, complete: true });

    expect([...sentTo()].sort()).toEqual(recipientsOf(12).map((r) => r.email).sort());
    noDuplicates();
    expect(statusCounts(id)).toEqual({ SENT: 12 });
    expect(campaignRow(id)).toMatchObject({ status: "SENT", recipientCount: 12, sentCount: 12, failedCount: 0, skippedCount: 0, simulated: false });
    expect(campaignRow(id).completedAt).toBeInstanceOf(Date);

    for (const message of messages()) {
      const ownName = recipientsOf(12).find((r) => r.email === message.to)!.name!;
      expect(message.fromName).toBe("PharmaBoost");
      expect(message.subject).toBe("Une information de l'équipe PharmaBoost");
      expect(message.text).toContain("Bonjour Camille,");
      expect(message.text).toContain(`Une information pour ${ownName}.`);
      expect(message.text).toContain("Ouvrir mon espace : https://pharmaboost.test/parametres?onglet=abonnement");
      expect(message.text + message.html + message.subject).not.toMatch(/\{\{|\}\}/);
      // Le pied de page et l'en-tête portent le jeton DE CE destinataire, sans son adresse.
      const link = /Ne plus recevoir ces offres : (https:\/\/pharmaboost\.test\/offres\/desinscription\/(\S+))/.exec(message.text);
      expect(link).not.toBeNull();
      const payload = JSON.parse(Buffer.from(link![2].split(".")[0], "base64url").toString("utf8")) as { h: string; t: string };
      expect(payload).toMatchObject({ h: hashEmail(message.to), t: "offers-optout" });
      expect(JSON.stringify(payload)).not.toContain("@");
      expect(message.html).toContain("Ne plus recevoir ces offres");
      expect(message.headers["List-Unsubscribe"]).toBe(`<${link![1]}/un-clic>`);
      expect(message.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    }
  });

  it("chaque envoi est tracé dans l'historique des communications, comme une campagne", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(3));
    await svc.startCampaign(id, "adm_1", 3);
    expect(mocks.traceDispatch).toHaveBeenCalledTimes(3);
    expect(mocks.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "CAMPAIGN", trigger: "MANUAL", templateKey: `campaign:${id}`, sentByAdminId: "adm_1", pharmacyId: "ph_1", recipient: "titulaire1@officine.fr", outcome: expect.objectContaining({ status: "SENT" }) }));
    expect(recipientRows(id).every((r) => r.emailDispatchId === "ed_1" && r.sentAt instanceof Date)).toBe(true);
  });

  it("le journal garde l'avant et l'après, au démarrage puis à la fin, sans aucune adresse", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(3));
    await svc.startCampaign(id, "adm_1", 3);
    const sent = auditActions().filter((a) => a.action === "campaign.sent");
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ platformAdminId: "adm_1", metadata: { phase: "started", trigger: "manual", before: { status: "DRAFT" }, after: { status: "SENDING", recipientCount: 3 }, confirmedCount: 3 } });
    expect(sent[1]).toMatchObject({ platformAdminId: "adm_1", metadata: { phase: "completed", before: { status: "SENDING" }, after: { status: "SENT", recipientCount: 3, sentCount: 3, failedCount: 0 } } });
    expect(JSON.stringify(auditActions())).not.toMatch(/[\w.-]+@[\w-]+\.\w+/);
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain("@");
  });

  it("refuse si le nombre confirmé n'est pas celui que le serveur recalcule : rien n'est figé, rien ne part", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(12));
    for (const confirmed of [11, 13, 0]) {
      const result = await svc.startCampaign(id, "adm_1", confirmed);
      expect(result).toEqual({ ok: false, error: expect.stringContaining(`${confirmed} confirmés, 12 aujourd'hui`) });
    }
    expect(campaignRow(id)).toMatchObject({ status: "DRAFT", startedAt: null, recipientCount: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(state.recipients).toHaveLength(0);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("refuse un nombre confirmé qui n'est pas un entier", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(3));
    for (const confirmed of [2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await svc.startCampaign(id, "adm_1", confirmed)).toEqual({ ok: false, error: expect.stringContaining("invalide") });
    }
    expect(mocks.resolveAudience).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("refuse un public vide, et plus de 2 000 destinataires", async () => {
    const id = seedCampaign();
    setAudience([]);
    expect(await svc.startCampaign(id, "adm_1", 0)).toEqual({ ok: false, error: expect.stringContaining("Aucun destinataire") });
    setAudience(recipientsOf(2001));
    expect(await svc.startCampaign(id, "adm_1", 2001)).toEqual({ ok: false, error: expect.stringMatching(/2\s001 destinataires : au plus 2\s000/) });
    setAudience(recipientsOf(2000));
    expect((await svc.startCampaign(id, "adm_1", 2000)).ok).toBe(true);
  });

  it("refuse une campagne déjà envoyée, en cours, annulée ou inconnue, sans rien écrire", async () => {
    setAudience(recipientsOf(3));
    for (const [status, text] of [["SENT", "déjà été envoyée"], ["SENDING", "déjà en cours"], ["CANCELED", "annulée"]] as const) {
      const id = seedCampaign({ status });
      expect(await svc.startCampaign(id, "adm_1", 3)).toEqual({ ok: false, error: expect.stringContaining(text) });
      expect(campaignRow(id).status).toBe(status);
    }
    expect(await svc.startCampaign("inconnue", "adm_1", 3)).toEqual({ ok: false, error: "Campagne introuvable." });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(state.recipients).toHaveLength(0);
  });

  it("un brouillon devenu invalide ne part pas : le texte est contrôlé à nouveau au démarrage", async () => {
    const id = seedCampaign({ body: "Bonjour {{surnom}}, une information." });
    setAudience(recipientsOf(3));
    expect(await svc.startCampaign(id, "adm_1", 3)).toEqual({ ok: false, error: expect.stringContaining("à corriger") });
    expect(campaignRow(id).status).toBe("DRAFT");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("une alerte dans l'application demandée pour des partenaires est refusée au démarrage", async () => {
    const id = seedCampaign({ audience: "partners.contacts", alsoInApp: true, body: "Bonjour {{prenom}}, une information.", buttonLabel: null, buttonTarget: null });
    setAudience(recipientsOf(3));
    expect(await svc.startCampaign(id, "adm_1", 3)).toEqual({ ok: false, error: expect.stringContaining("n'existe que pour les officines") });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("une modification entre la lecture et le démarrage empêche l'envoi : le nombre confirmé portait sur une autre version", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(3));
    prisma.campaign.findUnique.mockImplementationOnce(async () => ({ ...structuredClone(campaignRow(id)), updatedAt: new Date(NOW.getTime() - 5000) }));
    expect(await svc.startCampaign(id, "adm_1", 3)).toEqual({ ok: false, error: expect.stringContaining("modifiée ou démarrée") });
    expect(campaignRow(id)).toMatchObject({ status: "DRAFT", startedAt: null });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(state.recipients).toHaveLength(0);
  });
});

describe("jamais deux fois : deux clics, deux passages", () => {
  it("deux clics simultanés : un seul démarre, chaque adresse reçoit un seul message", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(12));
    const [first, second] = await Promise.all([svc.startCampaign(id, "adm_1", 12), svc.startCampaign(id, "adm_2", 12)]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    expect(sentTo()).toHaveLength(12);
    noDuplicates();
    expect(recipientRows(id)).toHaveLength(12);
    expect(auditActions().filter((a) => a.metadata?.phase === "started")).toHaveLength(1);
    const refusal = [first, second].find((r) => !r.ok) as { ok: false; error: string };
    expect(refusal.error).toMatch(/modifiée ou démarrée|déjà en cours|déjà été envoyée/);
  });

  it("le passage quotidien et un clic en même temps sur une campagne programmée : un seul envoi", async () => {
    const id = seedCampaign({ status: "SCHEDULED", scheduledFor: new Date("2026-10-09T22:00:00Z"), recipientCount: 12 });
    setAudience(recipientsOf(12));
    const [cron, click] = await Promise.all([svc.processDueCampaigns(NOW), svc.startCampaign(id, "adm_1", 12)]);
    expect(cron.started + (click.ok ? 1 : 0)).toBe(1);
    expect(sentTo()).toHaveLength(12);
    noDuplicates();
  });

  it("deux passages quotidiens simultanés : une seule campagne démarrée, une seule fois", async () => {
    seedCampaign({ status: "SCHEDULED", scheduledFor: new Date("2026-10-09T22:00:00Z"), recipientCount: 12 });
    setAudience(recipientsOf(12));
    const [a, b] = await Promise.all([svc.processDueCampaigns(NOW), svc.processDueCampaigns(NOW)]);
    expect(a.started + b.started).toBe(1);
    expect(sentTo()).toHaveLength(12);
    noDuplicates();
  });

  it("rejouer un envoi terminé ne renvoie rien", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(3));
    await svc.startCampaign(id, "adm_1", 3);
    mocks.sendEmail.mockClear();
    expect(await svc.startCampaign(id, "adm_1", 3)).toEqual({ ok: false, error: expect.stringContaining("déjà été envoyée") });
    expect(await svc.resumeCampaign(id, "adm_1")).toEqual({ ok: false, error: "Cette campagne n'est pas en cours d'envoi." });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("la clé unique protège aussi le figement : refiger les mêmes destinataires n'en écrit aucun de plus", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(3));
    await svc.startCampaign(id, "adm_1", 3);
    const frozen = recipientRows(id).length;
    // Une campagne revenue à « en cours » sans ses compteurs (reprise après panne) refige : les doublons sont ignorés.
    Object.assign(campaignRow(id), { status: "SENDING" });
    state.recipients = [];
    await svc.resumeCampaign(id, "adm_1");
    expect(recipientRows(id)).toHaveLength(frozen);
    await prisma.campaignRecipient.createMany({ skipDuplicates: true, data: recipientsOf(3).map((r) => ({ campaignId: id, emailKey: r.email })) });
    expect(recipientRows(id)).toHaveLength(frozen);
    await expect(prisma.campaignRecipient.createMany({ data: [{ campaignId: id, emailKey: recipientsOf(1)[0].email }] })).rejects.toMatchObject({ code: "P2002" });
  });

  it("budget épuisé : la campagne reste en cours, la reprise termine sans doublon, même lancée deux fois à la fois", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(12));
    slowClock();
    const first = await svc.startCampaign(id, "adm_1", 12);
    expect(first).toEqual({ ok: true, recipientCount: 12, sentCount: 5, failedCount: 0, skippedCount: 0, simulated: false, complete: false });
    expect(campaignRow(id).status).toBe("SENDING");
    expect(statusCounts(id)).toEqual({ SENT: 5, PENDING: 7 });

    mocks.sendEmail.mockImplementation(async (message: { to: string }) => delivered(message.to));
    const [a, b] = await Promise.all([svc.resumeCampaign(id, "adm_1"), svc.resumeCampaign(id, "adm_2")]);
    expect(a.ok && b.ok).toBe(true);
    expect(sentTo()).toHaveLength(12);
    noDuplicates();
    expect(statusCounts(id)).toEqual({ SENT: 12 });
    expect(campaignRow(id)).toMatchObject({ status: "SENT", sentCount: 12 });
    expect(auditActions().filter((a2) => a2.action === "campaign.resumed")).toHaveLength(2);
    expect(auditActions().filter((a2) => a2.action === "campaign.sent" && a2.metadata?.phase === "completed")).toHaveLength(1);
  });

  it("le passage quotidien reprend une campagne restée en plan depuis plus de 5 minutes, pas une campagne vivante", async () => {
    const stuck = seedCampaign({ status: "SENDING", recipientCount: 4, updatedAt: new Date(NOW.getTime() - 10 * MINUTE) });
    const alive = seedCampaign({ status: "SENDING", recipientCount: 2, updatedAt: new Date(NOW.getTime() - 1 * MINUTE) });
    seedRecipient(stuck, "a@officine.fr", "SENT");
    seedRecipient(stuck, "b@officine.fr", "SENDING");
    seedRecipient(stuck, "c@officine.fr", "PENDING");
    seedRecipient(stuck, "d@officine.fr", "PENDING");
    seedRecipient(alive, "x@officine.fr", "SENDING");
    seedRecipient(alive, "y@officine.fr", "PENDING");
    expect(await svc.processDueCampaigns(NOW)).toEqual({ started: 0, resumed: 1 });
    // Le message resté « en cours » est peut-être parti : on ne le renvoie pas, on le dit.
    expect(sentTo().sort()).toEqual(["c@officine.fr", "d@officine.fr"]);
    expect(recipientRows(stuck).map((r) => [r.email, r.status])).toEqual([["a@officine.fr", "SENT"], ["b@officine.fr", "FAILED"], ["c@officine.fr", "SENT"], ["d@officine.fr", "SENT"]]);
    expect(recipientRows(stuck)[1].detail).toContain("Interrompu pendant l'envoi");
    expect(campaignRow(stuck)).toMatchObject({ status: "SENT", sentCount: 3, failedCount: 1 });
    // La campagne vivante n'est pas touchée : son destinataire en cours l'est peut-être par un autre passage.
    expect(recipientRows(alive).map((r) => r.status)).toEqual(["SENDING", "PENDING"]);
    expect(campaignRow(alive).status).toBe("SENDING");
  });

  it("une campagne restée en plan sans destinataires figés reprend avec ceux d'aujourd'hui, offre de parrainage comprise", async () => {
    const id = seedReferral({ status: "SENDING", recipientCount: 3, startedAt: new Date(NOW.getTime() - 10 * MINUTE), updatedAt: new Date(NOW.getTime() - 10 * MINUTE) });
    setAudience(recipientsOf(3));
    expect(await svc.resumeCampaign(id, "adm_1")).toEqual({ ok: true, complete: true, sentCount: 3, failedCount: 0 });
    expect(sentTo()).toHaveLength(3);
    expect(mocks.startReferralOffer).toHaveBeenCalledWith(expect.objectContaining({ campaignId: id, amountCents: 2000 }));
  });

  it("une reprise sans destinataires et dont le public est devenu vide rend la campagne au brouillon", async () => {
    const id = seedCampaign({ status: "SENDING", recipientCount: 3, startedAt: NOW, updatedAt: new Date(NOW.getTime() - 10 * MINUTE) });
    setAudience([]);
    expect(await svc.resumeCampaign(id, "adm_1")).toEqual({ ok: false, error: expect.stringContaining("Aucun destinataire") });
    expect(campaignRow(id)).toMatchObject({ status: "DRAFT", startedAt: null, recipientCount: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(auditActions()[0].metadata).toMatchObject({ change: "start_abandoned" });
  });

  it("le budget du passage quotidien est partagé : la campagne suivante attend le passage suivant, sans rien perdre", async () => {
    const first = seedCampaign({ name: "Première", status: "SCHEDULED", scheduledFor: new Date("2026-10-08T22:00:00Z"), recipientCount: 12 });
    const second = seedCampaign({ name: "Seconde", status: "SCHEDULED", scheduledFor: new Date("2026-10-09T22:00:00Z"), recipientCount: 12 });
    setAudience(recipientsOf(12));
    slowClock();
    expect(await svc.processDueCampaigns(NOW)).toEqual({ started: 1, resumed: 0 });
    expect(campaignRow(first).status).toBe("SENDING");
    expect(campaignRow(second).status).toBe("SCHEDULED");

    vi.setSystemTime(new Date(NOW.getTime() + 10 * MINUTE));
    mocks.sendEmail.mockImplementation(async (message: { to: string }) => delivered(message.to));
    expect(await svc.processDueCampaigns(new Date(NOW.getTime() + 10 * MINUTE))).toEqual({ started: 1, resumed: 1 });
    expect(campaignRow(first)).toMatchObject({ status: "SENT", sentCount: 12 });
    expect(campaignRow(second)).toMatchObject({ status: "SENT", sentCount: 12 });
    // Chaque campagne a écrit une fois à chaque adresse : 12 + 12 messages, jamais plus.
    expect(sentTo()).toHaveLength(24);
    for (const id of [first, second]) expect(new Set(recipientRows(id).map((r) => r.emailKey)).size).toBe(12);
  });
});

describe("désinscription : jamais contactés", () => {
  it("les désinscrits sont figés « ignorés », sans leur adresse en clair, comptés à part, jamais contactés", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(3), recipientsOf(2, 10));
    const result = await svc.startCampaign(id, "adm_1", 3);
    expect(result).toEqual({ ok: true, recipientCount: 3, sentCount: 3, failedCount: 0, skippedCount: 2, simulated: false, complete: true });
    expect(sentTo().sort()).toEqual(recipientsOf(3).map((r) => r.email).sort());
    const skipped = recipientRows(id).filter((r) => r.status === "SKIPPED");
    expect(skipped).toHaveLength(2);
    for (const row of skipped) {
      expect(row.detail).toBe("Désinscrit des offres");
      expect(row.emailKey).toBe(`optout:${hashEmail(recipientsOf(2, 10).find((r) => r.targetId === row.targetId)!.email)}`);
      expect(row.email).toBe("t***@officine.fr");
    }
    expect(JSON.stringify(state.recipients.filter((r) => r.status === "SKIPPED"))).not.toContain("titulaire1");
  });

  it("une désinscription enregistrée pendant l'envoi est respectée au lot suivant", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(12));
    let first = true;
    mocks.sendEmail.mockImplementation(async (message: { to: string }) => {
      if (first) {
        first = false;
        // Le destinataire n° 8 clique « Ne plus recevoir ces offres » pendant le premier lot.
        state.optOuts.push({ id: "opt_x", emailHash: hashEmail("titulaire8@officine.fr") });
      }
      return delivered(message.to);
    });
    const result = await svc.startCampaign(id, "adm_1", 12);
    expect(result).toMatchObject({ ok: true, sentCount: 11, skippedCount: 1, complete: true });
    expect(sentTo()).not.toContain("titulaire8@officine.fr");
    expect(recipientRows(id).find((r) => r.email === "titulaire8@officine.fr")).toMatchObject({ status: "SKIPPED", detail: "Désinscrit des offres" });
  });

  it("la comparaison se fait sur l'empreinte : la casse de l'adresse n'y change rien", async () => {
    const id = seedCampaign();
    setAudience([{ ...recipientsOf(1)[0], email: "titulaire1@officine.fr" }, ...recipientsOf(1, 2)]);
    state.optOuts.push({ id: "opt_1", emailHash: hashEmail("TITULAIRE1@Officine.FR") });
    await svc.startCampaign(id, "adm_1", 2);
    expect(sentTo()).toEqual(["titulaire2@officine.fr"]);
  });
});

describe("messagerie non configurée : simulé, et dit simulé", () => {
  it("l'envoi est simulé de bout en bout, jamais une notification, jamais présenté comme réussi", async () => {
    provider.capability = "SIMULATED";
    const id = seedCampaign({ alsoInApp: true });
    setAudience(recipientsOf(3));
    const result = await svc.startCampaign(id, "adm_1", 3);
    expect(result).toMatchObject({ ok: true, simulated: true, complete: true, sentCount: 3, failedCount: 0 });
    expect(statusCounts(id)).toEqual({ SIMULATED: 3 });
    expect(campaignRow(id).simulated).toBe(true);
    expect(recipientRows(id).every((r) => r.sentAt === null && String(r.detail).includes("simulé"))).toBe(true);
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ outcome: expect.objectContaining({ status: "SIMULATED" }) }));
  });

  it("la campagne est marquée simulée dès son démarrage, avant le premier envoi", async () => {
    provider.capability = "SIMULATED";
    const id = seedCampaign();
    setAudience(recipientsOf(3));
    let seenAtFirstSend: unknown = null;
    mocks.sendEmail.mockImplementationOnce(async (message: { to: string }) => {
      seenAtFirstSend = { status: campaignRow(id).status, simulated: campaignRow(id).simulated };
      return { status: "SIMULATED" as const, provider: "test", detail: "simulé", messageId: message.to };
    });
    await svc.startCampaign(id, "adm_1", 3);
    expect(seenAtFirstSend).toEqual({ status: "SENDING", simulated: true });
  });

  it("un message simulé par le prestataire alors que la messagerie se disait prête marque aussi la campagne", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(2));
    mocks.sendEmail.mockImplementation(async () => ({ status: "SIMULATED" as const, provider: "test", detail: "simulé" }));
    await svc.startCampaign(id, "adm_1", 2);
    expect(campaignRow(id).simulated).toBe(true);
  });

  it("l'équipe est prévenue d'une campagne simulée terminée au passage quotidien, en avertissement", async () => {
    provider.capability = "SIMULATED";
    seedCampaign({ status: "SCHEDULED", scheduledFor: new Date("2026-10-09T22:00:00Z"), recipientCount: 2 });
    setAudience(recipientsOf(2));
    await svc.processDueCampaigns(NOW);
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: "CAMPAIGN_COMPLETED", severity: "WARNING", body: expect.stringContaining("2 simulés") }));
  });
});

describe("échecs et notifications dans l'application", () => {
  it("un échec est compté, daté au détail, et la campagne se termine", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(5));
    mocks.sendEmail.mockImplementation(async (message: { to: string }) => (message.to === "titulaire2@officine.fr" ? { status: "FAILED" as const, provider: "test", detail: "Adresse refusée par le prestataire." } : delivered(message.to)));
    const result = await svc.startCampaign(id, "adm_1", 5);
    expect(result).toMatchObject({ ok: true, sentCount: 4, failedCount: 1, complete: true });
    expect(recipientRows(id).find((r) => r.status === "FAILED")).toMatchObject({ email: "titulaire2@officine.fr", detail: "Adresse refusée par le prestataire.", sentAt: null });
    expect(campaignRow(id)).toMatchObject({ status: "SENT", failedCount: 1 });
  });

  it("une erreur avant l'envoi (valeurs introuvables) marque ce destinataire en échec « rien n'est parti », sans arrêter les autres", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(5));
    mocks.recipientValues.mockImplementation(async (recipient: { pharmacyId: string | null; name: string | null }) => {
      if (recipient.pharmacyId === "ph_3") throw new Error("officine introuvable");
      return { prenom: "Camille", officine: recipient.name ?? "" };
    });
    const result = await svc.startCampaign(id, "adm_1", 5);
    expect(result).toMatchObject({ ok: true, sentCount: 4, failedCount: 1, complete: true });
    expect(sentTo()).not.toContain("titulaire3@officine.fr");
    expect(recipientRows(id).find((r) => r.email === "titulaire3@officine.fr")).toMatchObject({ status: "FAILED", detail: "Rien n'est parti : officine introuvable" });
  });

  it("une notification dans l'application seulement pour un message réellement parti, jamais pour un échec", async () => {
    const id = seedCampaign({ alsoInApp: true, title: "Une information pour {{officine}}", body: "Bonjour {{prenom}},\n\nUn point sur votre abonnement.\n\nA bientôt." });
    setAudience(recipientsOf(5));
    mocks.sendEmail.mockImplementation(async (message: { to: string }) => (message.to === "titulaire2@officine.fr" ? { status: "FAILED" as const, provider: "test", detail: "refusé" } : delivered(message.to)));
    await svc.startCampaign(id, "adm_1", 5);
    expect(mocks.createNotification).toHaveBeenCalledTimes(4);
    const pharmacies = mocks.createNotification.mock.calls.map((call) => (call[0] as { pharmacyId: string }).pharmacyId).sort();
    expect(pharmacies).toEqual(["ph_1", "ph_3", "ph_4", "ph_5"]);
    expect(mocks.createNotification.mock.calls[0][0]).toMatchObject({ type: "SYSTEM", severity: "INFO", linkUrl: "/parametres?onglet=abonnement", metadata: { campaignId: id }, title: "Une information de l'équipe PharmaBoost", body: "Un point sur votre abonnement." });
  });

  it("sans alsoInApp, aucune notification", async () => {
    const id = seedCampaign({ alsoInApp: false });
    setAudience(recipientsOf(3));
    await svc.startCampaign(id, "adm_1", 3);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("une notification qui échoue ne change pas l'issue de l'e-mail, et n'écrit aucune adresse au journal", async () => {
    const id = seedCampaign({ alsoInApp: true });
    setAudience(recipientsOf(3));
    mocks.createNotification.mockRejectedValue(new Error("base indisponible"));
    const result = await svc.startCampaign(id, "adm_1", 3);
    expect(result).toMatchObject({ ok: true, sentCount: 3, complete: true });
    expect(statusCounts(id)).toEqual({ SENT: 3 });
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain("@");
  });
});

describe("offre de parrainage : appliquée, pas seulement annoncée", () => {
  it("démarre l'offre avec le montant, la fin et la campagne ; le message annonce ce même montant", async () => {
    const id = seedReferral();
    setAudience(recipientsOf(3));
    await svc.startCampaign(id, "adm_1", 3);
    expect(mocks.startReferralOffer).toHaveBeenCalledTimes(1);
    expect(mocks.startReferralOffer).toHaveBeenCalledWith({ label: "Parrainage à 20 € par filleul et par mois jusqu'au 31/10/2026", amountCents: 2000, startsAt: NOW, endsAt: new Date("2026-10-31T22:59:59.999Z"), campaignId: id, adminId: "adm_1" });
    for (const message of messages()) {
      expect(message.subject).toBe("Parrainage : 20 € par filleul et par mois");
      expect(message.text).toContain("Chaque filleul vous rapporte 20 € par mois.");
    }
    expect(auditActions().find((a) => a.metadata?.phase === "started")?.metadata).toMatchObject({ referralOfferId: `offer_for_${id}` });
  });

  it("l'offre démarre AVANT le premier message", async () => {
    const id = seedReferral();
    setAudience(recipientsOf(2));
    await svc.startCampaign(id, "adm_1", 2);
    expect(mocks.startReferralOffer.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendEmail.mock.invocationCallOrder[0]);
  });

  it("le montant standard sans date de fin n'ouvre aucune offre : le message ne fait que le rappeler", async () => {
    const id = seedReferral({ offerAmountCents: 1000, offerEndsAt: null });
    setAudience(recipientsOf(2));
    expect((await svc.startCampaign(id, "adm_1", 2)).ok).toBe(true);
    expect(mocks.startReferralOffer).not.toHaveBeenCalled();
    expect(messages()[0].text).toContain("10 € par mois");
  });

  it("le montant standard avec une date de fin ouvre une offre ; un montant différent sans fin aussi", async () => {
    setAudience(recipientsOf(2));
    const withEnd = seedReferral({ offerAmountCents: 1000 });
    await svc.startCampaign(withEnd, "adm_1", 2);
    expect(mocks.startReferralOffer).toHaveBeenCalledWith(expect.objectContaining({ campaignId: withEnd, amountCents: 1000 }));
    const openEnded = seedReferral({ offerAmountCents: 1500, offerEndsAt: null });
    await svc.startCampaign(openEnded, "adm_1", 2);
    expect(mocks.startReferralOffer).toHaveBeenLastCalledWith(expect.objectContaining({ campaignId: openEnded, amountCents: 1500, endsAt: null }));
    expect(mocks.startReferralOffer.mock.calls[1][0]).toMatchObject({ label: "Parrainage à 15 € par filleul et par mois" });
  });

  it("les autres types n'ouvrent jamais d'offre de parrainage (le bonus est appliqué à la main)", async () => {
    const id = seedCampaign({ kind: "BONUS_OFFER", subject: "Bonus {{montant_offre}}", title: "Un bonus", body: "Bonjour {{prenom}}, un bonus de {{montant_offre}} jusqu'au {{date_fin_offre}}. {{conditions_offre}}", offerAmountCents: 5000, offerEndsAt: new Date("2026-10-31T22:59:59.999Z"), offerConditions: "Pour les officines abonnées." });
    setAudience(recipientsOf(2));
    await svc.startCampaign(id, "adm_1", 2);
    expect(mocks.startReferralOffer).not.toHaveBeenCalled();
    expect(messages()[0].text).toContain("un bonus de 50 € jusqu'au 31 octobre 2026. Pour les officines abonnées.");
  });

  it("le code et le lien de parrainage ne sont demandés que si le texte les utilise", async () => {
    const used = seedReferral();
    setAudience(recipientsOf(2));
    await svc.startCampaign(used, "adm_1", 2);
    expect(mocks.recipientValues.mock.calls.every((call) => (call[1] as { wantsReferralCode: boolean }).wantsReferralCode)).toBe(true);
    mocks.recipientValues.mockClear();
    const unused = seedCampaign();
    await svc.startCampaign(unused, "adm_1", 2);
    expect(mocks.recipientValues.mock.calls.every((call) => !(call[1] as { wantsReferralCode: boolean }).wantsReferralCode)).toBe(true);
  });

  it("si l'offre ne peut pas démarrer, rien ne part et la campagne redevient ce qu'elle était", async () => {
    const id = seedReferral();
    setAudience(recipientsOf(3));
    mocks.startReferralOffer.mockRejectedValueOnce(new Error("base indisponible"));
    const result = await svc.startCampaign(id, "adm_1", 3);
    expect(result).toEqual({ ok: false, error: "L'envoi n'a pas pu démarrer : base indisponible. Rien n'est parti." });
    expect(campaignRow(id)).toMatchObject({ status: "DRAFT", startedAt: null, recipientCount: 0, skippedCount: 0, simulated: false });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(state.recipients).toHaveLength(0);
    // Réessayer fonctionne.
    expect((await svc.startCampaign(id, "adm_1", 3)).ok).toBe(true);
    expect(sentTo()).toHaveLength(3);
  });

  it("si les destinataires ne peuvent pas être figés, l'offre qu'on vient de démarrer est arrêtée", async () => {
    const id = seedReferral();
    setAudience(recipientsOf(3));
    prisma.campaignRecipient.createMany.mockRejectedValueOnce(new Error("écriture impossible"));
    const result = await svc.startCampaign(id, "adm_1", 3);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Rien n'est parti") });
    expect(mocks.endReferralOffer).toHaveBeenCalledWith({ campaignId: id }, "adm_1");
    expect(campaignRow(id).status).toBe("DRAFT");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("une campagne programmée dont le démarrage échoue redevient « programmée », pour le passage suivant", async () => {
    const id = seedReferral({ status: "SCHEDULED", scheduledFor: new Date("2026-10-09T22:00:00Z"), recipientCount: 3 });
    setAudience(recipientsOf(3));
    mocks.startReferralOffer.mockRejectedValueOnce(new Error("base indisponible"));
    expect(await svc.processDueCampaigns(NOW)).toEqual({ started: 0, resumed: 0 });
    expect(campaignRow(id)).toMatchObject({ status: "SCHEDULED", recipientCount: 3 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(await svc.processDueCampaigns(NOW)).toEqual({ started: 1, resumed: 0 });
    expect(sentTo()).toHaveLength(3);
  });

  it("annuler une campagne en cours arrête l'offre et les envois suivants", async () => {
    const id = seedReferral();
    setAudience(recipientsOf(12));
    mocks.sendEmail.mockImplementation(async (message: { to: string }) => {
      // L'administrateur annule pendant le premier lot.
      if (campaignRow(id).status === "SENDING" && sentTo().length === 1) await svc.cancelCampaign(id, "adm_2");
      return delivered(message.to);
    });
    const result = await svc.startCampaign(id, "adm_1", 12);
    expect(result.ok).toBe(true);
    expect(campaignRow(id).status).toBe("CANCELED");
    expect(mocks.endReferralOffer).toHaveBeenCalledWith({ campaignId: id }, "adm_2");
    // Les cinq du lot en vol sont partis ; les sept autres ne partiront jamais.
    expect(sentTo()).toHaveLength(5);
    expect(statusCounts(id)).toEqual({ SENT: 5, SKIPPED: 7 });
    expect(recipientRows(id).filter((r) => r.status === "SKIPPED").every((r) => r.detail === "Campagne annulée")).toBe(true);
    expect(campaignRow(id)).toMatchObject({ status: "CANCELED", sentCount: 5, skippedCount: 7 });
    // La fin de l'envoi ne la rend pas « envoyée ».
    expect(auditActions().some((a) => a.action === "campaign.sent" && a.metadata?.phase === "completed")).toBe(false);
  });
});

describe("campagne programmée : la confirmation a eu lieu à la programmation", () => {
  it("part au passage de son jour, sans confirmation retapée ; si les destinataires ont changé, elle part quand même et le journal le dit", async () => {
    const id = seedCampaign({ status: "SCHEDULED", scheduledFor: new Date("2026-10-09T22:00:00Z"), recipientCount: 3 });
    setAudience(recipientsOf(5));
    expect(await svc.processDueCampaigns(NOW)).toEqual({ started: 1, resumed: 0 });
    expect(sentTo()).toHaveLength(5);
    expect(campaignRow(id)).toMatchObject({ status: "SENT", recipientCount: 5, sentCount: 5 });
    const started = auditActions().find((a) => a.metadata?.phase === "started");
    expect(started).toMatchObject({ action: "campaign.sent", platformAdminId: null, metadata: { trigger: "scheduled", before: { status: "SCHEDULED" }, confirmedCount: null, confirmedAtScheduling: 3, recipientsChanged: true } });
    expect(started?.metadata).toMatchObject({ after: { status: "SENDING", recipientCount: 5 } });
  });

  it("des destinataires inchangés ne sont pas signalés comme changés", async () => {
    seedCampaign({ status: "SCHEDULED", scheduledFor: new Date("2026-10-09T22:00:00Z"), recipientCount: 3 });
    setAudience(recipientsOf(3));
    await svc.processDueCampaigns(NOW);
    expect(auditActions().find((a) => a.metadata?.phase === "started")?.metadata).toMatchObject({ recipientsChanged: false });
  });

  it("une campagne pas encore due n'est pas touchée ; une due l'est", async () => {
    const early = seedCampaign({ name: "Demain", status: "SCHEDULED", scheduledFor: new Date("2026-10-10T22:00:00Z"), recipientCount: 3 });
    const due = seedCampaign({ name: "Aujourd'hui", status: "SCHEDULED", scheduledFor: new Date("2026-10-09T22:00:00Z"), recipientCount: 3 });
    setAudience(recipientsOf(3));
    expect(await svc.processDueCampaigns(NOW)).toEqual({ started: 1, resumed: 0 });
    expect(campaignRow(early)).toMatchObject({ status: "SCHEDULED" });
    expect(campaignRow(due)).toMatchObject({ status: "SENT" });
  });

  it("un brouillon, une campagne annulée ne partent jamais au passage quotidien", async () => {
    seedCampaign({ status: "DRAFT", scheduledFor: new Date("2026-10-09T22:00:00Z") });
    seedCampaign({ status: "CANCELED", scheduledFor: new Date("2026-10-09T22:00:00Z") });
    setAudience(recipientsOf(3));
    expect(await svc.processDueCampaigns(NOW)).toEqual({ started: 0, resumed: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("une campagne devenue invalide ou sans destinataire est rendue en brouillon, l'équipe est prévenue, rien ne part", async () => {
    const broken = seedCampaign({ name: "Cassée", status: "SCHEDULED", scheduledFor: new Date("2026-10-09T22:00:00Z"), recipientCount: 3, body: "Bonjour {{surnom}}, une information." });
    const empty = seedCampaign({ name: "Vide", status: "SCHEDULED", scheduledFor: new Date("2026-10-09T22:30:00Z"), recipientCount: 3 });
    // Le public de la première est lisible, celui de la seconde est vide.
    mocks.resolveAudience.mockImplementation(async () => structuredClone(audience));
    setAudience([]);
    expect(await svc.processDueCampaigns(NOW)).toEqual({ started: 0, resumed: 0 });
    for (const id of [broken, empty]) expect(campaignRow(id)).toMatchObject({ status: "DRAFT", scheduledFor: null, recipientCount: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.notifyAdmins).toHaveBeenCalledTimes(2);
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: "CAMPAIGN_NOT_SENT", severity: "WARNING", title: "Campagne programmée non envoyée : Cassée", linkUrl: `/admin/campagnes/${broken}` }));
    expect(auditActions().filter((a) => a.metadata?.change === "schedule_abandoned")).toHaveLength(2);
    // Elles ne repartent pas d'elles-mêmes demain.
    expect(await svc.processDueCampaigns(new Date(NOW.getTime() + 24 * 60 * MINUTE))).toEqual({ started: 0, resumed: 0 });
  });

  it("l'équipe est prévenue de la fin d'une campagne envoyée au passage quotidien, pas d'un clic de l'administrateur", async () => {
    seedCampaign({ name: "Programmée", status: "SCHEDULED", scheduledFor: new Date("2026-10-09T22:00:00Z"), recipientCount: 2 });
    setAudience(recipientsOf(2));
    await svc.processDueCampaigns(NOW);
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: "CAMPAIGN_COMPLETED", severity: "INFO", title: "Campagne terminée : Programmée", body: "2 envoyés, 0 en échec, 0 ignorés." }));
    mocks.notifyAdmins.mockClear();
    const manual = seedCampaign();
    await svc.startCampaign(manual, "adm_1", 2);
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
  });

  it("une campagne qui lève une erreur n'empêche pas la suivante", async () => {
    const boom = seedCampaign({ name: "Boom", status: "SCHEDULED", scheduledFor: new Date("2026-10-08T22:00:00Z"), recipientCount: 2 });
    const fine = seedCampaign({ name: "Fine", status: "SCHEDULED", scheduledFor: new Date("2026-10-09T22:00:00Z"), recipientCount: 2 });
    setAudience(recipientsOf(2));
    mocks.resolveAudience.mockRejectedValueOnce(new Error("base indisponible"));
    expect(await svc.processDueCampaigns(NOW)).toEqual({ started: 1, resumed: 0 });
    expect(campaignRow(boom).status).toBe("SCHEDULED");
    expect(campaignRow(fine).status).toBe("SENT");
  });
});

describe("types de destinataires", () => {
  it("un partenaire reçoit le message de son côté, sans notification dans l'application", async () => {
    const id = seedCampaign({ kind: "PARTNER_INVITATION", audience: "partners.without_brand", title: "Référencez votre gamme", subject: "Votre gamme", body: "Bonjour {{prenom}},\n\n{{nom_partenaire}} peut présenter sa gamme.", buttonLabel: "Déposer ma candidature", buttonTarget: "candidature" });
    setAudience([{ targetType: "PARTNER_CONTACT", targetId: "pc_1", pharmacyId: null, partnerId: "pa_1", email: "claire@labo.fr", name: "Claire Martin" }]);
    mocks.recipientValues.mockResolvedValue({ prenom: "Claire", nom_partenaire: "Laboratoire Test" });
    expect(await svc.startCampaign(id, "adm_1", 1)).toMatchObject({ ok: true, sentCount: 1 });
    const [message] = messages();
    expect(message.to).toBe("claire@labo.fr");
    expect(message.text).toContain("Laboratoire Test peut présenter sa gamme.");
    expect(message.text).toContain("Déposer ma candidature : https://pharmaboost.test/decouvrir/partenaires");
    expect(message.html).toContain("PharmaBoost Partenaires");
    expect(message.text).toContain("vous êtes en contact avec PharmaBoost Partenaires");
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ pharmacyId: null }));
  });
});
