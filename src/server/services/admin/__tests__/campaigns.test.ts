import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateCampaignDraft, type CampaignDraftInput } from "@/core/admin/campaigns";
import { NOW, auditActions, campaignRow, mocks, prisma, provider, recipientRows, recipientsOf, reset, seedCampaign, seedRecipient, seedReferral, sentTo, setAudience, state } from "./campaigns-harness";

/**
 * Les campagnes, côté brouillon, programmation, annulation et lecture : une
 * base en mémoire qui respecte les mises à jour conditionnelles, aucun envoi
 * réel. Rien de ce qui n'est pas un envoi confirmé ne doit contacter quiconque.
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

function draft(overrides: Record<string, unknown> = {}): CampaignDraftInput {
  const result = validateCampaignDraft(
    { kind: "ANNOUNCEMENT", name: "Annonce d'octobre", subject: "Une information", title: "Une information", body: "Bonjour {{prenom}},\n\nUne information pour {{officine}}.", buttonLabel: null, buttonTarget: null, audience: "pharmacies.all_active", audienceParams: {}, alsoInApp: false, offerAmountCents: null, offerEndsAt: null, offerConditions: null, ...overrides },
    NOW,
  );
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** Rien n'est parti, rien n'a été figé, aucune offre n'a été touchée. */
function expectNobodyContacted() {
  expect(mocks.sendEmail).not.toHaveBeenCalled();
  expect(state.recipients).toHaveLength(0);
  expect(mocks.startReferralOffer).not.toHaveBeenCalled();
  expect(mocks.createNotification).not.toHaveBeenCalled();
}

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

describe("brouillon : il ne contacte personne", () => {
  it("créer enregistre un brouillon, avec son audit, sans lire les destinataires ni envoyer", async () => {
    const { id } = await svc.createCampaign(draft(), "adm_1");
    expect(campaignRow(id)).toMatchObject({ status: "DRAFT", name: "Annonce d'octobre", createdByAdminId: "adm_1", recipientCount: 0, scheduledFor: null });
    expect(mocks.resolveAudience).not.toHaveBeenCalled();
    expectNobodyContacted();
    expect(auditActions()).toEqual([expect.objectContaining({ action: "campaign.created", entityType: "Campaign", entityId: id, platformAdminId: "adm_1", metadata: expect.objectContaining({ before: null, after: expect.objectContaining({ status: "DRAFT", kind: "ANNOUNCEMENT" }) }) })]);
  });

  it("créer refuse un brouillon invalide, sans rien écrire", async () => {
    await expect(svc.createCampaign({ ...draft(), body: "Bonjour {{surnom}}" }, "adm_1")).rejects.toThrow(/Brouillon invalide/);
    expect(state.campaigns).toHaveLength(0);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("modifier un brouillon garde l'avant et l'après des seuls champs modifiés", async () => {
    const id = seedCampaign();
    const result = await svc.updateCampaign(id, draft({ name: "Annonce d'octobre", subject: "Un nouvel objet", body: "Bonjour {{prenom}},\n\nUne information pour {{officine}}.", title: "Une information pour {{officine}}", buttonLabel: "Ouvrir mon espace", buttonTarget: "espace" }), "adm_2");
    expect(result).toEqual({ ok: true, backToDraft: false });
    expect(campaignRow(id)).toMatchObject({ status: "DRAFT", subject: "Un nouvel objet" });
    const [entry] = auditActions();
    expect(entry).toMatchObject({ action: "campaign.updated", platformAdminId: "adm_2" });
    expect(entry.metadata).toMatchObject({ changedFields: ["subject"], before: { subject: "Une information de l'équipe PharmaBoost" }, after: { subject: "Un nouvel objet" }, backToDraft: false });
    expectNobodyContacted();
  });

  it("modifier sans rien changer n'écrit rien", async () => {
    const id = seedCampaign({ subject: "Une information", title: "Une information", buttonLabel: null, buttonTarget: null });
    const before = prisma.campaign.updateMany.mock.calls.length;
    expect(await svc.updateCampaign(id, draft({ title: "Une information", body: "Bonjour {{prenom}},\n\nUne information pour {{officine}}." }), "adm_1")).toEqual({ ok: true, backToDraft: false });
    expect(prisma.campaign.updateMany.mock.calls.length).toBe(before);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("modifier une campagne programmée la ramène au brouillon : la confirmation portait sur l'ancienne version", async () => {
    const id = seedCampaign({ status: "SCHEDULED", scheduledFor: new Date("2026-10-14T22:00:00Z"), recipientCount: 12 });
    const result = await svc.updateCampaign(id, draft({ subject: "Autre objet" }), "adm_1");
    expect(result).toEqual({ ok: true, backToDraft: true });
    expect(campaignRow(id)).toMatchObject({ status: "DRAFT", scheduledFor: null, recipientCount: 0 });
    expect(auditActions()[0].metadata).toMatchObject({ backToDraft: true, before: { status: "SCHEDULED" }, after: { status: "DRAFT", scheduledFor: null } });
  });

  it("une campagne en cours, envoyée ou annulée ne se modifie pas", async () => {
    for (const status of ["SENDING", "SENT", "CANCELED"]) {
      const id = seedCampaign({ status });
      const result = await svc.updateCampaign(id, draft({ subject: "Autre objet" }), "adm_1");
      expect(result).toEqual({ ok: false, error: expect.stringContaining("se modifie") });
      expect(campaignRow(id).subject).toBe("Une information de l'équipe PharmaBoost");
    }
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("une modification qui croise un envoi n'écrase rien (la lecture n'est plus à jour)", async () => {
    const id = seedCampaign();
    const stale = structuredClone(campaignRow(id));
    // Entre la lecture et l'écriture, l'envoi a démarré : la ligne a changé.
    prisma.campaign.findUnique.mockImplementationOnce(async () => {
      Object.assign(campaignRow(id), { status: "SENDING", updatedAt: new Date(NOW.getTime() + 999) });
      return stale;
    });
    const result = await svc.updateCampaign(id, draft({ subject: "Autre objet" }), "adm_1");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("vient de changer") });
    expect(campaignRow(id)).toMatchObject({ status: "SENDING", subject: "Une information de l'équipe PharmaBoost" });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("modifier refuse un brouillon invalide ou une campagne inconnue", async () => {
    const id = seedCampaign();
    expect(await svc.updateCampaign(id, { ...draft(), body: "Bonjour {{prenom, une information." }, "adm_1")).toEqual({ ok: false, error: expect.stringContaining("mal formée") });
    expect(await svc.updateCampaign("inconnue", draft(), "adm_1")).toEqual({ ok: false, error: "Campagne introuvable." });
  });

  it("supprimer : un brouillon seulement, avec son audit", async () => {
    const id = seedCampaign();
    expect(await svc.deleteDraftCampaign(id, "adm_1")).toEqual({ ok: true });
    expect(state.campaigns).toHaveLength(0);
    expect(auditActions()[0]).toMatchObject({ action: "campaign.deleted", entityId: id, metadata: { before: expect.objectContaining({ name: "Annonce d'octobre", status: "DRAFT" }), after: null } });
    for (const status of ["SCHEDULED", "SENDING", "SENT", "CANCELED"]) {
      const other = seedCampaign({ status });
      expect(await svc.deleteDraftCampaign(other, "adm_1")).toEqual({ ok: false, error: "Seul un brouillon se supprime." });
      expect(campaignRow(other)).toBeDefined();
    }
    expect(await svc.deleteDraftCampaign("inconnue", "adm_1")).toEqual({ ok: false, error: "Campagne introuvable." });
  });

  it("le journal ne garde aucune adresse e-mail", async () => {
    const { id } = await svc.createCampaign(draft(), "adm_1");
    await svc.updateCampaign(id, draft({ subject: "Autre objet" }), "adm_1");
    await svc.deleteDraftCampaign(id, "adm_1");
    expect(JSON.stringify(auditActions())).not.toMatch(/[\w.-]+@[\w-]+\.\w+/);
  });
});

describe("aperçu du public et du message : lecture seule", () => {
  it("compte, dit qui est écarté, et ne montre qu'une adresse masquée", async () => {
    setAudience(recipientsOf(8));
    mocks.resolveAudience.mockResolvedValueOnce({ recipients: recipientsOf(8), optedOut: [], excluded: { optedOut: 2, noEmail: 1, duplicates: 3 } });
    const preview = await svc.previewAudience("pharmacies.all_active", {});
    expect(preview.count).toBe(8);
    expect(preview.excluded).toEqual({ optedOut: 2, noEmail: 1, duplicates: 3 });
    expect(preview.sample).toHaveLength(5);
    expect(preview.sample[0]).toEqual({ name: "Pharmacie 1", emailMasked: "t***@officine.fr" });
    expect(JSON.stringify(preview)).not.toContain("titulaire1@");
    expectNobodyContacted();
    expect(prisma.campaign.updateMany).not.toHaveBeenCalled();
  });

  it("l'aperçu du message utilise des valeurs d'exemple et un lien de désinscription d'exemple, sans rien envoyer", async () => {
    const preview = await svc.previewCampaignEmail(draft({ buttonLabel: "Ouvrir", buttonTarget: "espace" }));
    expect(preview.text).toContain("Bonjour Camille,");
    expect(preview.text).toContain("Pharmacie de la Passerelle");
    expect(preview.text).toContain("Ne plus recevoir ces offres : https://pharmaboost.test/offres/desinscription/apercu");
    expect(preview.html).toContain("https://pharmaboost.test/parametres?onglet=abonnement");
    expect(preview.subject).toBe("Une information");
    expect(preview.text + preview.html).not.toMatch(/\{\{/);
    expectNobodyContacted();
  });
});

describe("test d'envoi : à l'administrateur connecté, jamais ailleurs", () => {
  it("part vers son adresse et elle seule, objet préfixé « [TEST] », en-têtes de désinscription, tracé comme un test", async () => {
    const result = await svc.sendCampaignTest(draft({ buttonLabel: "Ouvrir", buttonTarget: "espace" }), "adm_1", "admin@pharma.ai");
    expect(result).toEqual({ status: "SENT", detail: "Remis au prestataire." });
    expect(sentTo()).toEqual(["admin@pharma.ai"]);
    const message = mocks.sendEmail.mock.calls[0][0] as { subject: string; fromName: string; text: string; html: string; headers: Record<string, string> };
    expect(message.subject).toBe("[TEST] Une information");
    expect(message.fromName).toBe("PharmaBoost");
    expect(message.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/pharmaboost\.test\/offres\/desinscription\/.+\/un-clic>$/);
    expect(message.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(message.text).toContain("Ne plus recevoir ces offres : https://pharmaboost.test/offres/desinscription/");
    expect(mocks.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "CAMPAIGN", trigger: "TEST", templateKey: "campaign:test", recipient: "admin@pharma.ai", sentByAdminId: "adm_1" }));
    expect(auditActions()[0]).toMatchObject({ action: "campaign.test_sent", metadata: expect.objectContaining({ recipient: "a***@pharma.ai", status: "SENT" }) });
    // Ni destinataire, ni offre, ni lecture du public : un test ne contacte que soi.
    expect(mocks.resolveAudience).not.toHaveBeenCalled();
    expect(state.recipients).toHaveLength(0);
    expect(mocks.startReferralOffer).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("un test d'une offre de parrainage ne crée aucune offre", async () => {
    await svc.sendCampaignTest(draft({ kind: "REFERRAL_OFFER", subject: "Parrainage {{montant_offre}}", title: "Parrainage", body: "Bonjour {{prenom}}, {{montant_offre}} par filleul.", offerAmountCents: 2000, buttonLabel: "Voir", buttonTarget: "parrainage" }), "adm_1", "admin@pharma.ai");
    expect(mocks.startReferralOffer).not.toHaveBeenCalled();
    const text = (mocks.sendEmail.mock.calls[0][0] as { text: string }).text;
    expect(text).toContain("20 € par filleul");
  });

  it("sans messagerie, l'essai est dit simulé : jamais présenté comme parti", async () => {
    provider.capability = "SIMULATED";
    const result = await svc.sendCampaignTest(draft(), "adm_1", "admin@pharma.ai");
    expect(result.status).toBe("SIMULATED");
    expect(mocks.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ outcome: expect.objectContaining({ status: "SIMULATED" }) }));
  });

  it("un brouillon invalide ne part pas", async () => {
    const result = await svc.sendCampaignTest({ ...draft(), body: "Bonjour {{surnom}}" }, "adm_1", "admin@pharma.ai");
    expect(result.status).toBe("FAILED");
    expect(result.detail).toContain("{{surnom}}");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});

describe("programmation : un jour, confirmée maintenant", () => {
  const DAY = new Date("2026-10-15T10:00:00Z");

  it("programme au jour choisi (minuit de Paris), garde le nombre confirmé, n'envoie rien", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(3));
    expect(await svc.scheduleCampaign(id, DAY, "adm_1", 3)).toEqual({ ok: true });
    expect(campaignRow(id)).toMatchObject({ status: "SCHEDULED", recipientCount: 3 });
    // Minuit du 15 octobre à Paris (heure d'été) : 22 h UTC le 14.
    expect((campaignRow(id).scheduledFor as Date).toISOString()).toBe("2026-10-14T22:00:00.000Z");
    expectNobodyContacted();
    const [entry] = auditActions();
    expect(entry).toMatchObject({ action: "campaign.scheduled", platformAdminId: "adm_1" });
    expect(entry.metadata).toMatchObject({ before: { status: "DRAFT" }, after: { status: "SCHEDULED", scheduledFor: "2026-10-14T22:00:00.000Z", recipientCount: 3 }, confirmedCount: 3 });
    expect(entry.metadata?.schedule).toContain("jeudi 15 octobre 2026");
  });

  it("le jour s'entend à Paris, quelle que soit l'heure de l'instant donné", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(3));
    // 23 h 30 UTC le 15 est 1 h 30 le 16 à Paris.
    await svc.scheduleCampaign(id, new Date("2026-10-15T23:30:00Z"), "adm_1", 3);
    expect((campaignRow(id).scheduledFor as Date).toISOString()).toBe("2026-10-15T22:00:00.000Z");
  });

  it("refuse aujourd'hui, le passé et au-delà de 90 jours, sans lire le public", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(3));
    for (const bad of [NOW, new Date("2026-10-09T10:00:00Z"), new Date("2027-01-10T10:00:00Z"), new Date("nope")]) {
      const result = await svc.scheduleCampaign(id, bad, "adm_1", 3);
      expect(result.ok).toBe(false);
    }
    expect(campaignRow(id).status).toBe("DRAFT");
    expect(mocks.resolveAudience).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("refuse si le nombre confirmé n'est pas celui que le serveur recalcule", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(3));
    for (const confirmed of [2, 4, 0, 3.5, Number.NaN]) {
      const result = await svc.scheduleCampaign(id, DAY, "adm_1", confirmed);
      expect(result).toEqual({ ok: false, error: expect.stringContaining("a changé") });
    }
    expect(campaignRow(id).status).toBe("DRAFT");
  });

  it("refuse un public vide, un brouillon invalide, une campagne qui n'est ni brouillon ni programmée", async () => {
    const id = seedCampaign();
    expect(await svc.scheduleCampaign(id, DAY, "adm_1", 0)).toEqual({ ok: false, error: expect.stringContaining("Aucun destinataire") });
    const broken = seedCampaign({ body: "Bonjour {{surnom}}" });
    setAudience(recipientsOf(3));
    expect(await svc.scheduleCampaign(broken, DAY, "adm_1", 3)).toEqual({ ok: false, error: expect.stringContaining("à corriger") });
    for (const status of ["SENDING", "SENT", "CANCELED"]) {
      expect((await svc.scheduleCampaign(seedCampaign({ status }), DAY, "adm_1", 3)).ok).toBe(false);
    }
    expect(await svc.scheduleCampaign("inconnue", DAY, "adm_1", 3)).toEqual({ ok: false, error: "Campagne introuvable." });
  });

  it("refuse une offre qui se termine avant le jour d'envoi", async () => {
    const id = seedReferral({ offerEndsAt: new Date("2026-10-14T21:59:59.999Z") });
    setAudience(recipientsOf(3));
    expect(await svc.scheduleCampaign(id, DAY, "adm_1", 3)).toEqual({ ok: false, error: expect.stringContaining("se termine avant la date d'envoi") });
    // Le jour même de la fin, c'est permis : l'offre court encore au passage du matin.
    expect(await svc.scheduleCampaign(id, new Date("2026-10-14T10:00:00Z"), "adm_1", 3)).toEqual({ ok: true });
  });

  it("reprogrammer une campagne programmée est permis, avec une nouvelle confirmation", async () => {
    const id = seedCampaign({ status: "SCHEDULED", scheduledFor: new Date("2026-10-14T22:00:00Z"), recipientCount: 3 });
    setAudience(recipientsOf(4));
    expect((await svc.scheduleCampaign(id, DAY, "adm_1", 3)).ok).toBe(false);
    expect(await svc.scheduleCampaign(id, new Date("2026-10-20T10:00:00Z"), "adm_1", 4)).toEqual({ ok: true });
    expect(campaignRow(id)).toMatchObject({ status: "SCHEDULED", recipientCount: 4 });
  });

  it("une programmation qui croise une modification est refusée, rien n'est écrit", async () => {
    const id = seedCampaign();
    setAudience(recipientsOf(3));
    prisma.campaign.findUnique.mockImplementationOnce(async () => ({ ...structuredClone(campaignRow(id)), updatedAt: new Date(NOW.getTime() - 5000) }));
    expect(await svc.scheduleCampaign(id, DAY, "adm_1", 3)).toEqual({ ok: false, error: expect.stringContaining("vient de changer") });
    expect(campaignRow(id).status).toBe("DRAFT");
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("retirer la programmation rend un brouillon, une seule fois", async () => {
    const id = seedCampaign({ status: "SCHEDULED", scheduledFor: new Date("2026-10-14T22:00:00Z"), recipientCount: 3 });
    expect(await svc.unscheduleCampaign(id, "adm_1")).toEqual({ ok: true });
    expect(campaignRow(id)).toMatchObject({ status: "DRAFT", scheduledFor: null, recipientCount: 0 });
    expect(auditActions()[0].metadata).toMatchObject({ change: "unscheduled", before: { status: "SCHEDULED" }, after: { status: "DRAFT" } });
    expect(await svc.unscheduleCampaign(id, "adm_1")).toEqual({ ok: false, error: "Cette campagne n'est pas programmée." });
    expect(await svc.unscheduleCampaign("inconnue", "adm_1")).toEqual({ ok: false, error: "Campagne introuvable." });
  });
});

describe("annulation", () => {
  it("une campagne programmée annulée ne partira jamais, et son offre est arrêtée", async () => {
    const id = seedReferral({ status: "SCHEDULED", scheduledFor: new Date("2026-10-14T22:00:00Z"), recipientCount: 3 });
    expect(await svc.cancelCampaign(id, "adm_1")).toEqual({ ok: true });
    expect(campaignRow(id)).toMatchObject({ status: "CANCELED" });
    expect(campaignRow(id).canceledAt).toBeInstanceOf(Date);
    expect(mocks.endReferralOffer).toHaveBeenCalledWith({ campaignId: id }, "adm_1");
    expect(auditActions()[0]).toMatchObject({ action: "campaign.canceled", platformAdminId: "adm_1", metadata: expect.objectContaining({ before: expect.objectContaining({ status: "SCHEDULED" }), after: expect.objectContaining({ status: "CANCELED" }) }) });
    // Le passage quotidien ne la reprend pas.
    setAudience(recipientsOf(3));
    expect(await svc.processDueCampaigns(new Date("2026-10-15T08:15:00Z"))).toEqual({ started: 0, resumed: 0 });
    expectNobodyContacted();
  });

  it("une campagne en cours : les destinataires en attente deviennent « ignorés », ceux déjà partis le restent", async () => {
    const id = seedCampaign({ status: "SENDING", recipientCount: 5, sentCount: 2 });
    seedRecipient(id, "a@officine.fr", "SENT");
    seedRecipient(id, "b@officine.fr", "SENT");
    seedRecipient(id, "c@officine.fr", "SENDING");
    seedRecipient(id, "d@officine.fr", "PENDING");
    seedRecipient(id, "e@officine.fr", "PENDING");
    expect(await svc.cancelCampaign(id, "adm_1")).toEqual({ ok: true });
    expect(recipientRows(id).map((r) => [r.email, r.status])).toEqual([
      ["a@officine.fr", "SENT"],
      ["b@officine.fr", "SENT"],
      ["c@officine.fr", "SENDING"],
      ["d@officine.fr", "SKIPPED"],
      ["e@officine.fr", "SKIPPED"],
    ]);
    expect(recipientRows(id)[3].detail).toBe("Campagne annulée");
    expect(campaignRow(id)).toMatchObject({ status: "CANCELED", sentCount: 2, skippedCount: 2 });
    expect(auditActions()[0].metadata).toMatchObject({ skippedByCancellation: 2 });
  });

  it("un brouillon, une campagne envoyée ne s'annulent pas ; une campagne déjà annulée l'est encore, et l'arrêt de l'offre se rejoue", async () => {
    for (const status of ["DRAFT", "SENT"]) {
      const id = seedCampaign({ status });
      expect(await svc.cancelCampaign(id, "adm_1")).toEqual({ ok: false, error: expect.stringContaining("s'annule") });
      expect(campaignRow(id).status).toBe(status);
    }
    expect(mocks.endReferralOffer).not.toHaveBeenCalled();
    const canceled = seedReferral({ status: "CANCELED" });
    expect(await svc.cancelCampaign(canceled, "adm_1")).toEqual({ ok: true });
    expect(mocks.endReferralOffer).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(await svc.cancelCampaign("inconnue", "adm_1")).toEqual({ ok: false, error: "Campagne introuvable." });
  });

  it("une annulation qui croise la fin de l'envoi est refusée proprement", async () => {
    const id = seedCampaign({ status: "SENDING" });
    prisma.campaign.findUnique.mockImplementationOnce(async () => {
      const row = structuredClone(campaignRow(id));
      Object.assign(campaignRow(id), { status: "SENT" });
      return row;
    });
    expect(await svc.cancelCampaign(id, "adm_1")).toEqual({ ok: false, error: expect.stringContaining("vient de changer") });
    expect(campaignRow(id).status).toBe("SENT");
    expect(mocks.endReferralOffer).not.toHaveBeenCalled();
  });
});

describe("lecture pour la console", () => {
  it("la liste filtre par statut et par type, compte chaque statut (zéros compris), ignore un filtre inconnu", async () => {
    seedCampaign({ status: "DRAFT" });
    seedCampaign({ status: "SENT", kind: "BONUS_OFFER" });
    seedCampaign({ status: "SENT" });
    const all = await svc.listCampaigns({});
    expect(all.total).toBe(3);
    expect(all.counts).toEqual({ DRAFT: 1, SCHEDULED: 0, SENDING: 0, SENT: 2, CANCELED: 0 });
    expect((await svc.listCampaigns({ status: "SENT" })).rows).toHaveLength(2);
    expect((await svc.listCampaigns({ status: "SENT", kind: "BONUS_OFFER" })).rows).toHaveLength(1);
    // Les pastilles de statut comptent dans le type choisi.
    expect((await svc.listCampaigns({ kind: "BONUS_OFFER" })).counts).toEqual({ DRAFT: 0, SCHEDULED: 0, SENDING: 0, SENT: 1, CANCELED: 0 });
    expect((await svc.listCampaigns({ status: "n'importe quoi", kind: "constructor" })).total).toBe(3);
  });

  it("pagine par 20, du plus récent au plus ancien, et ramène une page absurde à la première", async () => {
    for (let i = 0; i < 25; i += 1) seedCampaign({ name: `Campagne ${i}` });
    const first = await svc.listCampaigns({ page: 1 });
    expect(first.rows).toHaveLength(20);
    expect(first.rows[0].name).toBe("Campagne 24");
    expect(first.total).toBe(25);
    expect((await svc.listCampaigns({ page: 2 })).rows).toHaveLength(5);
    expect((await svc.listCampaigns({ page: -3 })).rows[0].name).toBe("Campagne 24");
    expect((await svc.listCampaigns({ page: Number.NaN })).rows).toHaveLength(20);
  });

  it("le détail porte l'offre de parrainage liée ; une campagne inconnue est introuvable", async () => {
    const id = seedReferral({ status: "SENDING" });
    state.offers.push({ id: "offer_1", campaignId: id, amountCents: 2000, startsAt: NOW, endsAt: null, canceledAt: null });
    const detail = await svc.loadCampaign(id);
    expect(detail).toMatchObject({ id, kind: "REFERRAL_OFFER", offerAmountCents: 2000, referralOffer: { id: "offer_1", amountCents: 2000, canceledAt: null }, body: expect.stringContaining("{{code_parrainage}}") });
    expect((await svc.loadCampaign(seedCampaign()))?.referralOffer).toBeNull();
    expect(await svc.loadCampaign("inconnue")).toBeNull();
  });

  it("les destinataires : filtre par statut, compteurs par statut avec zéros, une page de 50", async () => {
    const id = seedCampaign();
    seedCampaign();
    for (let i = 0; i < 60; i += 1) seedRecipient(id, `p${i}@officine.fr`, i % 3 === 0 ? "FAILED" : "SENT");
    seedRecipient("autre", "z@officine.fr", "SENT");
    const result = await svc.listCampaignRecipients(id, {});
    expect(result.total).toBe(60);
    expect(result.rows).toHaveLength(50);
    expect(result.counts).toEqual({ PENDING: 0, SENDING: 0, SENT: 40, SIMULATED: 0, FAILED: 20, SKIPPED: 0 });
    expect((await svc.listCampaignRecipients(id, { status: "FAILED" })).total).toBe(20);
    expect((await svc.listCampaignRecipients(id, { status: "n'importe quoi" })).total).toBe(60);
    expect((await svc.listCampaignRecipients(id, { page: 2 })).rows).toHaveLength(10);
    // Une autre campagne ne fuit pas dans celle-ci.
    expect((await svc.listCampaignRecipients(id, {})).rows.some((r) => r.email === "z@officine.fr")).toBe(false);
  });
});

describe("désinscription : l'empreinte d'une adresse du test est bien celle de son jeton", () => {
  it("le lien du message de test désinscrit l'adresse de l'administrateur, et elle seule", async () => {
    await svc.sendCampaignTest(draft(), "adm_1", "Admin@Pharma.ai");
    const header = (mocks.sendEmail.mock.calls[0][0] as { headers: Record<string, string> }).headers["List-Unsubscribe"];
    const token = /desinscription\/(.+)\/un-clic/.exec(header)?.[1] ?? "";
    expect(await svc.confirmOfferOptOut(token)).toEqual({ ok: true });
    expect(state.optOuts.map((o) => o.emailHash)).toEqual([hashEmail("admin@pharma.ai")]);
  });
});
