import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le passage quotidien : les relances d'abord (comportement et clés de réponse
 * inchangés), puis les campagnes, les annonces aux patients et la purge. Chaque
 * étape est isolée : un échec ne coupe pas les autres et ne devient jamais un
 * faux zéro.
 */

const mocks = vi.hoisted(() => ({
  runAutomations: vi.fn(),
  processDueCampaigns: vi.fn(),
  resumeStuckAnnouncements: vi.fn(),
  purgeStalePatientNews: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/services/admin/automations", () => ({ runAutomations: mocks.runAutomations }));
vi.mock("@/server/services/admin/campaigns", () => ({ processDueCampaigns: mocks.processDueCampaigns }));
vi.mock("@/server/services/patient-news", () => ({ resumeStuckAnnouncements: mocks.resumeStuckAnnouncements, purgeStalePatientNews: mocks.purgeStalePatientNews }));

const { GET } = await import("@/app/api/cron/automatisations/route");

const REPORT = { dryRun: false, enabledRules: 2, planned: 3, sent: 2, failed: 0, simulated: 1, skipped: 0, internal: 0, alreadyDone: 4, errors: [] as string[], items: [{ detail: "ne sort jamais" }] };
const request = (authorization?: string) => new Request("http://localhost/api/cron/automatisations", { headers: authorization ? { authorization } : {} });
const authorized = () => GET(request("Bearer secret-de-test"));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "secret-de-test");
  mocks.runAutomations.mockResolvedValue(REPORT);
  mocks.processDueCampaigns.mockResolvedValue({ started: 1, resumed: 2 });
  mocks.resumeStuckAnnouncements.mockResolvedValue(3);
  mocks.purgeStalePatientNews.mockResolvedValue(4);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("protection", () => {
  it("503 sans CRON_SECRET, 401 avec un mauvais jeton : aucune étape ne tourne", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await authorized()).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "secret-de-test");
    expect((await GET(request("Bearer mauvais"))).status).toBe(401);
    expect((await GET(request())).status).toBe(401);
    for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
  });
});

describe("passage complet", () => {
  it("les clés existantes sont inchangées ; campagnes et nouveautés s'ajoutent ; le détail ne sort pas", async () => {
    const response = await authorized();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      dryRun: false,
      enabledRules: 2,
      planned: 3,
      sent: 2,
      failed: 0,
      simulated: 1,
      skipped: 0,
      internal: 0,
      alreadyDone: 4,
      errors: [],
      campaigns: { started: 1, resumed: 2 },
      news: { resumed: 3, purged: 4 },
    });
  });

  it("dans l'ordre : relances, campagnes, annonces restées en plan, purge — avec le même instant", async () => {
    await authorized();
    const order = [mocks.runAutomations, mocks.processDueCampaigns, mocks.resumeStuckAnnouncements, mocks.purgeStalePatientNews].map((mock) => mock.mock.invocationCallOrder[0]);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(mocks.runAutomations).toHaveBeenCalledWith({ now: expect.any(Date), dryRun: false });
    const now = mocks.runAutomations.mock.calls[0][0].now as Date;
    expect(mocks.processDueCampaigns).toHaveBeenCalledWith(now);
    expect(mocks.resumeStuckAnnouncements).toHaveBeenCalledWith(now);
    expect(mocks.purgeStalePatientNews).toHaveBeenCalledWith(now);
  });
});

describe("chaque étape est isolée", () => {
  it("les campagnes en échec : les autres étapes tournent, la réponse dit « inconnu » (null), pas zéro", async () => {
    mocks.processDueCampaigns.mockRejectedValue(new Error("base indisponible"));
    const response = await authorized();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sent: 2, campaigns: null, news: { resumed: 3, purged: 4 } });
    expect(mocks.resumeStuckAnnouncements).toHaveBeenCalled();
    expect(mocks.purgeStalePatientNews).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("les annonces aux patients en échec : campagnes et purge tournent", async () => {
    mocks.resumeStuckAnnouncements.mockRejectedValue(new Error("boom"));
    expect(await (await authorized()).json()).toMatchObject({ campaigns: { started: 1, resumed: 2 }, news: { resumed: null, purged: 4 } });
    expect(mocks.purgeStalePatientNews).toHaveBeenCalled();
  });

  it("la purge en échec : le reste est rendu", async () => {
    mocks.purgeStalePatientNews.mockRejectedValue(new Error("boom"));
    expect(await (await authorized()).json()).toMatchObject({ campaigns: { started: 1, resumed: 2 }, news: { resumed: 3, purged: null } });
  });

  it("un compteur vraiment à zéro reste zéro : seul un échec est « inconnu »", async () => {
    mocks.processDueCampaigns.mockResolvedValue({ started: 0, resumed: 0 });
    mocks.resumeStuckAnnouncements.mockResolvedValue(0);
    mocks.purgeStalePatientNews.mockResolvedValue(0);
    expect(await (await authorized()).json()).toMatchObject({ campaigns: { started: 0, resumed: 0 }, news: { resumed: 0, purged: 0 } });
  });

  it("les relances en échec : les autres étapes tournent quand même, puis l'erreur remonte comme avant", async () => {
    const failure = new Error("relances en panne");
    mocks.runAutomations.mockRejectedValue(failure);
    await expect(authorized()).rejects.toBe(failure);
    expect(mocks.processDueCampaigns).toHaveBeenCalled();
    expect(mocks.resumeStuckAnnouncements).toHaveBeenCalled();
    expect(mocks.purgeStalePatientNews).toHaveBeenCalled();
  });

  it("toutes les étapes nouvelles en échec : les relances rendent leur réponse habituelle", async () => {
    mocks.processDueCampaigns.mockRejectedValue(new Error("a"));
    mocks.resumeStuckAnnouncements.mockRejectedValue(new Error("b"));
    mocks.purgeStalePatientNews.mockRejectedValue(new Error("c"));
    const body = await (await authorized()).json();
    expect(body).toMatchObject({ dryRun: false, enabledRules: 2, sent: 2, campaigns: null, news: { resumed: null, purged: null } });
  });
});
