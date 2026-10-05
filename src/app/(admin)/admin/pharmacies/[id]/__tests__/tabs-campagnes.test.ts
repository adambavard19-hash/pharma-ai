import { createElement, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Les onglets « Communication » et « Commercial » de la fiche 360° : nouveautés
 * patients en effectifs, campagnes reçues, montants de parrainage figés.
 * Rendu côté serveur, services simulés.
 */

const mocks = vi.hoisted(() => ({ loadCommunicationTab: vi.fn(), loadNewsAggregates: vi.fn(), loadCampaignsReceived: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/admin/pharmacies/ph_1", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/server/actions/admin-email", () => ({ previewTemplateEmailAction: vi.fn(), sendManualEmailAction: vi.fn() }));
vi.mock("@/server/services/admin/pharmacy-360", () => ({
  CAMPAIGNS_RECEIVED_LIMIT: 20,
  loadCommunicationTab: mocks.loadCommunicationTab,
  loadNewsAggregates: mocks.loadNewsAggregates,
  loadCampaignsReceived: mocks.loadCampaignsReceived,
  loadCommercialTab: vi.fn(),
}));

const { CommunicationTab } = await import("../tab-communication");
const { CommercialTab } = await import("../tab-commercial");

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[\s  ]+/g, " ");

async function settle(node: ReactNode): Promise<ReactNode> {
  if (isValidElement(node) && typeof node.type === "function" && node.type.constructor.name === "AsyncFunction") return settle(await (node.type as (props: unknown) => Promise<ReactNode>)(node.props));
  return node;
}
const render = async (component: unknown, props: Record<string, unknown>) => renderToStaticMarkup((await settle(createElement(component as never, props as never))) as React.ReactElement);

const baseFor = (pharmacy: Record<string, unknown> = {}) => ({ pharmacy: { id: "ph_1", name: "Pharmacie du Port", referralCode: "PB-AB23CD", referredBy: null, referralAmountCents: null, referrals: [], prospect: null, ...pharmacy } });

const campaignRow = (overrides: Record<string, unknown> = {}) => ({ id: "r1", status: "SENT", detail: null, sentAt: new Date("2026-10-05T08:16:00Z"), createdAt: new Date("2026-10-05T08:15:00Z"), campaign: { id: "camp_1", name: "Bonus d'automne", kind: "BONUS_OFFER" }, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadCommunicationTab.mockResolvedValue({ emails: [], notifications: [] });
  mocks.loadNewsAggregates.mockResolvedValue({ enabled: true, activeSubscribers: 37, announcementsSent: 4, announcementsSimulated: 0, lastAnnouncementAt: new Date("2026-10-02T09:00:00Z") });
  mocks.loadCampaignsReceived.mockResolvedValue({ rows: [], total: 0 });
});

describe("onglet Communication : nouveautés pour les patients", () => {
  it("dit en effectifs si la fonction est activée, le nombre d'abonnés, d'annonces et la date de la dernière", async () => {
    const html = text(await render(CommunicationTab, { base: baseFor(), templates: [] }));
    expect(html).toContain("Nouveautés pour les patients");
    expect(html).toContain("aucune adresse et aucun patient ne sont visibles ici");
    expect(html).toContain("Fonction Activée");
    expect(html).toContain("Abonnés actifs 37");
    expect(html).toContain("Annonces envoyées 4");
    expect(html).toContain("Dernière annonce 02/10/2026");
  });

  it("une fonction désactivée par l'officine, sans annonce : des zéros vrais, « Aucune »", async () => {
    mocks.loadNewsAggregates.mockResolvedValue({ enabled: false, activeSubscribers: 0, announcementsSent: 0, announcementsSimulated: 0, lastAnnouncementAt: null });
    const html = text(await render(CommunicationTab, { base: baseFor(), templates: [] }));
    expect(html).toContain("Désactivée par l'officine");
    expect(html).toContain("Abonnés actifs 0");
    expect(html).toContain("Dernière annonce Aucune");
  });

  it("les envois simulés sont dits à part, jamais comptés comme envoyés", async () => {
    mocks.loadNewsAggregates.mockResolvedValue({ enabled: true, activeSubscribers: 5, announcementsSent: 1, announcementsSimulated: 2, lastAnnouncementAt: new Date("2026-10-02T09:00:00Z") });
    const html = text(await render(CommunicationTab, { base: baseFor(), templates: [] }));
    expect(html).toContain("Annonces envoyées 1");
    expect(html).toContain("2 envois simulés non comptés (messagerie non configurée)");
  });
});

describe("onglet Communication : campagnes reçues", () => {
  it("sans campagne : une ligne vide honnête", async () => {
    expect(text(await render(CommunicationTab, { base: baseFor(), templates: [] }))).toContain("Cette officine n'a reçu aucune campagne.");
  });

  it("liste le nom (lié à la campagne), le type, la date et l'issue", async () => {
    mocks.loadCampaignsReceived.mockResolvedValue({
      rows: [
        campaignRow(),
        campaignRow({ id: "r2", status: "SIMULATED", sentAt: null, createdAt: new Date("2026-10-03T08:15:00Z"), campaign: { id: "camp_2", name: "Parrainage d'octobre", kind: "REFERRAL_OFFER" } }),
        campaignRow({ id: "r3", status: "SKIPPED", detail: "Désinscrit des offres", sentAt: null, createdAt: new Date("2026-10-01T08:15:00Z"), campaign: { id: "camp_3", name: "Annonce", kind: "ANNOUNCEMENT" } }),
      ],
      total: 3,
    });
    const html = await render(CommunicationTab, { base: baseFor(), templates: [] });
    const readable = text(html);
    expect(html).toContain('href="/admin/campagnes/camp_1"');
    expect(html).toContain('href="/admin/campagnes/camp_2"');
    expect(readable).toContain("Bonus d'automne");
    expect(readable).toContain("Offre bonus");
    expect(readable).toContain("Offre de parrainage");
    expect(readable).toContain("05/10/2026");
    expect(readable).toContain("Envoyé");
    // Un message simulé n'est jamais présenté comme reçu.
    expect(readable).toContain("Simulé, non parti");
    expect(readable).toContain("Ignoré");
    expect(html).toContain('title="Désinscrit des offres"');
    expect(readable).not.toContain("Les 20 plus récentes");
  });

  it("dit combien il y en a au total quand la liste est tronquée", async () => {
    mocks.loadCampaignsReceived.mockResolvedValue({ rows: [campaignRow()], total: 31 });
    expect(text(await render(CommunicationTab, { base: baseFor(), templates: [] }))).toContain("Les 20 plus récentes, sur 31.");
  });

  it("n'affiche aucune adresse de destinataire", async () => {
    mocks.loadCampaignsReceived.mockResolvedValue({ rows: [{ ...campaignRow(), email: "titulaire@port.test" }], total: 1 });
    expect(await render(CommunicationTab, { base: baseFor(), templates: [] })).not.toContain("titulaire@port.test");
  });

  it("charge les trois sources en parallèle pour la même officine", async () => {
    const base = baseFor();
    await render(CommunicationTab, { base, templates: [] });
    expect(mocks.loadCommunicationTab).toHaveBeenCalledWith(base);
    expect(mocks.loadNewsAggregates).toHaveBeenCalledWith(base);
    expect(mocks.loadCampaignsReceived).toHaveBeenCalledWith(base);
  });
});

describe("onglet Commercial : la remise de parrainage", () => {
  const now = new Date("2026-10-10T08:00:00Z");

  it("pour une filleule hors offre : 20 % de moins pour son parrain, non cumulable, plus aucun montant fixe par filleul", async () => {
    for (const referralAmountCents of [null, 0]) {
      const html = text(await render(CommercialTab, { base: baseFor({ referredBy: { id: "ph_0", name: "Pharmacie Parrain" }, referralAmountCents }), now }));
      expect(html).toContain("Remise apportée à son parrain 20 % de moins par mois sur l'abonnement de son parrain");
      expect(html).toContain("Non cumulable : dès un filleul actif le parrain paie 20 % de moins, jamais davantage.");
      expect(html).toContain("Aucune offre de parrainage n'était en cours à son inscription.");
      expect(html).not.toMatch(/10 €|Montant apporté|montant standard/i);
    }
  });

  it("pour une filleule inscrite pendant une offre : le montant figé est dit, et le plus avantageux des deux s'applique", async () => {
    const base = baseFor({ referredBy: { id: "ph_0", name: "Pharmacie Parrain" }, referralAmountCents: 2000 });
    const html = text(await render(CommercialTab, { base, now }));
    expect(html).toContain("20 % de moins par mois sur l'abonnement de son parrain, ou 20 € par mois (offre à son inscription)");
    expect(html).toContain("Montant d'une offre de parrainage en cours à son inscription : figé, il ne change plus.");
    expect(html).toContain("plus avantageux entre les 20 % et la somme des montants d'offre de ses filleuls");
  });

  it("une officine qui n'est la filleule de personne n'a pas de ligne « remise apportée »", async () => {
    expect(text(await render(CommercialTab, { base: baseFor(), now }))).not.toContain("Remise apportée à son parrain");
  });

  it("pour un parrain : le montant d'offre de chaque filleule seulement quand elle est née d'une offre ; hors offre, rien", async () => {
    const base = baseFor({
      referrals: [
        { id: "f1", name: "Filleule Offre", city: "Lyon", isActive: true, referralAmountCents: 2000 },
        { id: "f2", name: "Filleule Hors Offre", city: "Brest", isActive: true, referralAmountCents: null },
        { id: "f3", name: "Filleule Ancienne", city: null, isActive: false, referralAmountCents: null },
      ],
    });
    const html = text(await render(CommercialTab, { base, now }));
    expect(html).toContain("Filleule Offre · Lyon · 20 € par mois (offre à son inscription)");
    expect(html).toContain("Filleule Hors Offre · Brest");
    expect(html).not.toContain("Filleule Hors Offre · Brest ·  ");
    expect(html).not.toMatch(/Filleule Hors Offre · Brest · \d/);
    expect(html).toContain("Filleule Ancienne · suspendue");
    expect(html).not.toMatch(/Filleule Ancienne · \d/);
  });
});
