import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Accès : la console des Découvertes (nouveautés, campagnes, facturation, demandes) exige une session administrateur
 * plateforme AVANT tout ; les gestes de l'application exigent une session, et un compte de démonstration n'envoie rien.
 */
const m = vi.hoisted(() => ({
  requirePlatformSession: vi.fn(),
  getUserSession: vi.fn(),
  services: {
    saveLaunch: vi.fn(),
    validateLaunchRegulatory: vi.fn(),
    setLaunchReview: vi.fn(),
    saveCampaign: vi.fn(),
    validateCampaignRegulatory: vi.fn(),
    transitionCampaign: vi.fn(),
    setCampaignBilling: vi.fn(),
    setInfoRequestStatus: vi.fn(),
  },
  createInfoRequest: vi.fn(),
  setFavorite: vi.fn(),
  recordSponsoredEvents: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: m.requirePlatformSession }));
vi.mock("@/server/auth/user-session", () => ({ getUserSession: m.getUserSession }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("@/server/services/mobile/sponsoring-admin", () => ({ ...m.services, INFO_REQUEST_STATUSES: ["NEW", "TRANSMITTED", "HANDLED", "CANCELLED"], LAUNCH_REVIEW_STATUSES: ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"] }));
vi.mock("@/server/services/mobile/discover", () => ({ discoverViewerFor: vi.fn(async () => ({ kind: "community" })), favoriteTargetVisible: vi.fn(async () => true), setFavorite: m.setFavorite }));
vi.mock("@/server/services/mobile/discover-info-request", () => ({ createInfoRequest: m.createInfoRequest }));
vi.mock("@/server/services/mobile/sponsoring", () => ({ recordSponsoredEvents: m.recordSponsoredEvents, recordInfoRequestForCampaign: vi.fn() }));

const admin = await import("../platform-sponsoring");
const mobile = await import("../mobile-discover");

const REDIRECT = new Error("NEXT_REDIRECT /admin-connexion");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("console : session administrateur obligatoire", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["saveLaunchAction", () => admin.saveLaunchAction({ title: "x" })],
    ["validateLaunchAction", () => admin.validateLaunchAction({ id: "abcdefgh12", validator: "Dr X" })],
    ["setLaunchReviewAction", () => admin.setLaunchReviewAction({ id: "abcdefgh12", status: "APPROVED" })],
    ["saveCampaignAction", () => admin.saveCampaignAction({ name: "x" })],
    ["validateCampaignAction", () => admin.validateCampaignAction({ id: "abcdefgh12", validator: "Dr X" })],
    ["transitionCampaignAction", () => admin.transitionCampaignAction({ id: "abcdefgh12", to: "ACTIVE" })],
    ["setCampaignBillingAction", () => admin.setCampaignBillingAction({ id: "abcdefgh12", billingStatus: "PAID" })],
    ["setInfoRequestStatusAction", () => admin.setInfoRequestStatusAction({ id: "abcdefgh12", status: "HANDLED" })],
  ];
  for (const [name, call] of calls) {
    it(`${name} : sans session, refusé avant tout effet`, async () => {
      m.requirePlatformSession.mockRejectedValue(REDIRECT);
      await expect(call()).rejects.toBe(REDIRECT);
      for (const service of Object.values(m.services)) expect(service).not.toHaveBeenCalled();
    });
  }
});

describe("application : session obligatoire, démonstration bloquée", () => {
  it("sans session : ni favori, ni demande, ni compteur", async () => {
    m.getUserSession.mockResolvedValue(null);
    expect(await mobile.toggleFavoriteAction({ type: "BRAND", id: "abcdefgh12", on: true })).toMatchObject({ ok: false });
    expect(await mobile.requestInfoAction({ brandId: "abcdefgh12", consent: true })).toMatchObject({ ok: false });
    expect(await mobile.trackSponsoredEventsAction([{ kind: "impression", campaignId: "abcdefgh12", placement: "HOME_FEED" }])).toEqual({ counted: 0 });
    expect(m.setFavorite).not.toHaveBeenCalled();
    expect(m.createInfoRequest).not.toHaveBeenCalled();
    expect(m.recordSponsoredEvents).not.toHaveBeenCalled();
  });

  it("officine de démonstration : la demande d'information n'est jamais envoyée", async () => {
    m.getUserSession.mockResolvedValue({ sessionId: "s1", user: { id: "u-demo-1" }, scope: { pharmacyId: "ph-demo", isDemo: true } });
    expect(await mobile.requestInfoAction({ brandId: "abcdefgh12", consent: true })).toMatchObject({ ok: false });
    expect(m.createInfoRequest).not.toHaveBeenCalled();
  });

  it("le compteur ne reçoit que des événements nettoyés, et la session sert seulement au dédoublonnage", async () => {
    m.getUserSession.mockResolvedValue({ sessionId: "s-compteur", user: { id: "u2" }, scope: null });
    m.recordSponsoredEvents.mockResolvedValue(1);
    await mobile.trackSponsoredEventsAction([{ kind: "impression", campaignId: "abcdefgh12", placement: "HOME_FEED", userId: "u2" }]);
    expect(m.recordSponsoredEvents).toHaveBeenCalledWith([{ kind: "impression", campaignId: "abcdefgh12", placement: "HOME_FEED" }], "s-compteur");
  });
});
