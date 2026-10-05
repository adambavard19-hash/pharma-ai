import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitCampaign } from "../send-request";

/**
 * Le geste qui part vraiment : ce qui est transmis au serveur, et ce qui
 * l'arrête avant. Le serveur revérifie tout ; ici, on vérifie que l'écran ne
 * lui envoie jamais un nombre ou un mot inventés.
 */

const actions = { start: vi.fn(), schedule: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  actions.start.mockResolvedValue({ ok: true, data: { complete: true }, message: "Campagne envoyée : 12 e-mails." });
  actions.schedule.mockResolvedValue({ ok: true, data: { schedule: "Envoi demain." }, message: "Campagne programmée." });
});

describe("envoyer maintenant", () => {
  it("transmet l'identifiant, le nombre affiché et le mot retapé tel quel", async () => {
    const outcome = await submitCampaign({ mode: "send", campaignId: "camp_1", count: 12, day: "", typed: "envoyer" }, actions);
    expect(actions.start).toHaveBeenCalledWith({ id: "camp_1", confirmedCount: 12, confirmation: "envoyer" });
    expect(actions.schedule).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ id: "camp_1", result: { ok: true } });
  });

  it("depuis l'assistant, le brouillon est enregistré d'abord, et c'est son identifiant qui part", async () => {
    const ensureSaved = vi.fn().mockResolvedValue({ ok: true, id: "camp_neuve" });
    const outcome = await submitCampaign({ mode: "send", campaignId: null, ensureSaved, count: 3, day: "", typed: "ENVOYER" }, actions);
    expect(ensureSaved).toHaveBeenCalledTimes(1);
    expect(actions.start).toHaveBeenCalledWith({ id: "camp_neuve", confirmedCount: 3, confirmation: "ENVOYER" });
    expect(outcome.id).toBe("camp_neuve");
  });

  it("un brouillon qui ne s'enregistre pas n'envoie rien, et son message est dit", async () => {
    const ensureSaved = vi.fn().mockResolvedValue({ ok: false, error: "La campagne vient de changer : rechargez la page." });
    const outcome = await submitCampaign({ mode: "send", campaignId: "camp_1", ensureSaved, count: 12, day: "", typed: "ENVOYER" }, actions);
    expect(actions.start).not.toHaveBeenCalled();
    expect(actions.schedule).not.toHaveBeenCalled();
    expect(outcome).toEqual({ result: { ok: false, error: "La campagne vient de changer : rechargez la page.", fieldErrors: undefined }, id: null });
  });

  it("sans nombre calculé, rien ne part : jamais un nombre inventé", async () => {
    const outcome = await submitCampaign({ mode: "send", campaignId: "camp_1", count: null, day: "", typed: "ENVOYER" }, actions);
    expect(actions.start).not.toHaveBeenCalled();
    expect(outcome.result.ok).toBe(false);
    if (!outcome.result.ok) expect(outcome.result.error).toContain("n'est pas calculé");
  });

  it("sans campagne enregistrée ni moyen de l'enregistrer, rien ne part", async () => {
    const outcome = await submitCampaign({ mode: "send", campaignId: null, count: 5, day: "", typed: "ENVOYER" }, actions);
    expect(actions.start).not.toHaveBeenCalled();
    expect(outcome.result).toMatchObject({ ok: false, error: "Campagne introuvable." });
  });

  it("le refus du serveur (nombre changé, mot faux) revient tel quel, sans être caché", async () => {
    actions.start.mockResolvedValue({ ok: false, error: "Le nombre de destinataires a changé : 12 confirmés, 14 aujourd'hui. Relisez l'aperçu, puis confirmez de nouveau." });
    const outcome = await submitCampaign({ mode: "send", campaignId: "camp_1", count: 12, day: "", typed: "ENVOYER" }, actions);
    expect(outcome.result).toMatchObject({ ok: false, error: expect.stringContaining("a changé") });
    expect(outcome.id).toBe("camp_1");
  });
});

describe("programmer", () => {
  it("transmet le jour choisi avec le nombre et le mot", async () => {
    const outcome = await submitCampaign({ mode: "schedule", campaignId: "camp_1", count: 40, day: "2026-10-20", typed: "ENVOYER" }, actions);
    expect(actions.schedule).toHaveBeenCalledWith({ id: "camp_1", confirmedCount: 40, confirmation: "ENVOYER", date: "2026-10-20" });
    expect(actions.start).not.toHaveBeenCalled();
    expect(outcome.result).toMatchObject({ ok: true });
  });

  it("enregistre le brouillon d'abord, comme pour un envoi", async () => {
    const ensureSaved = vi.fn().mockResolvedValue({ ok: true, id: "camp_2" });
    await submitCampaign({ mode: "schedule", campaignId: null, ensureSaved, count: 1, day: "2026-10-20", typed: "ENVOYER" }, actions);
    expect(ensureSaved).toHaveBeenCalledTimes(1);
    expect(actions.schedule).toHaveBeenCalledWith(expect.objectContaining({ id: "camp_2" }));
  });
});
