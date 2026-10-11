import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/** La console des campagnes, rendue sans navigateur ni base : session et services simulés. */
const m = vi.hoisted(() => ({
  requirePlatformSession: vi.fn(),
  listCampaignsAdmin: vi.fn(),
  campaignAdmin: vi.fn(),
  sponsoringTargets: vi.fn(),
  campaignStatsOverview: vi.fn(),
  campaignStatsDetail: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: m.requirePlatformSession }));
vi.mock("@/server/services/mobile/sponsoring-admin", () => ({ listCampaignsAdmin: m.listCampaignsAdmin, campaignAdmin: m.campaignAdmin, sponsoringTargets: m.sponsoringTargets, campaignStatsOverview: m.campaignStatsOverview, campaignStatsDetail: m.campaignStatsDetail }));
vi.mock("@/server/actions/platform-sponsoring", () => ({}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));

const list = await import("../page");
const detail = await import("../[id]/page");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const totals = { impressions: 200, clicks: 10, views: 6, trainingsStarted: 0, trainingsCompleted: 0, infoRequests: 1, ctr: 0.05 };
const campaign = {
  id: "cmpgn12345678",
  name: "Mise en avant Marque A",
  format: "MISE_EN_AVANT",
  placements: ["HOME_FEED", "DISCOVER_TOP"],
  audiences: [],
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: new Date("2026-11-01T00:00:00Z"),
  status: "ACTIVE",
  regulatoryCategory: "PARAPHARMACY",
  regulatoryReviewedBy: "Dr X, pharmacienne",
  regulatoryReviewedAt: new Date("2026-10-01T09:00:00Z"),
  regulatoryNotes: null,
  priceNote: null,
  budgetCents: null,
  billedCents: null,
  billingReference: null,
  contractReference: null,
  billingStatus: "QUOTE",
  paidAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  partner: { id: "p1", name: "Laboratoire A" },
  brand: { id: "b1", name: "Marque A", slug: "marque-a" },
  launch: null,
  module: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.requirePlatformSession.mockResolvedValue({ admin: { id: "a1" } });
  m.sponsoringTargets.mockResolvedValue({ partners: [], launches: [], modules: [] });
});

describe("console des campagnes", () => {
  it("sans session administrateur, rien n'est lu", async () => {
    m.requirePlatformSession.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(list.default({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT");
    expect(m.listCampaignsAdmin).not.toHaveBeenCalled();
    expect(m.campaignStatsOverview).not.toHaveBeenCalled();
  });

  it("liste : étape, validation, chiffres agrégés, taux de clic, « tarif à définir » quand rien n'est saisi", async () => {
    m.listCampaignsAdmin.mockResolvedValue([campaign]);
    m.campaignStatsOverview.mockResolvedValue({ totals, byPlacement: [{ placement: "HOME_FEED", totals }], byCampaign: new Map([[campaign.id, totals]]), byPartner: [{ partnerId: "p1", partnerName: "Laboratoire A", totals }] });
    const words = text(renderToStaticMarkup((await list.default({ searchParams: Promise.resolve({ periode: "30j" }) })) as never));
    expect(words).toContain("Mise en avant Marque A");
    expect(words).toContain("Active");
    expect(words).toContain("Validée (réglementaire)");
    expect(words).toContain("5,0 %");
    expect(words).toContain("tarif à définir");
    expect(words).toContain("Accueil — nouveautés partenaires");
  });

  it("détail : validation, facturation et résultats par emplacement et par jour", async () => {
    m.campaignAdmin.mockResolvedValue(campaign);
    m.campaignStatsDetail.mockResolvedValue({ totals, byPlacement: [{ placement: "DISCOVER_TOP", totals }], byDay: [{ day: new Date("2026-10-10T00:00:00Z"), totals }] });
    const words = text(renderToStaticMarkup((await detail.default({ params: Promise.resolve({ id: campaign.id }), searchParams: Promise.resolve({}) })) as never));
    expect(words).toContain("Validée par Dr X, pharmacienne");
    expect(words).toContain("Devis et facturation");
    expect(words).toContain("Découvertes — à la une");
    expect(words).toContain("Impressions par jour");
    expect(words).toContain("Mettre en pause");
  });
});
