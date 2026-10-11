import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Découvertes, côté services : la base est simulée, on regarde ce que les services lui DEMANDENT et lui ÉCRIVENT.
 * Consentement obligatoire, preuve enregistrée, frein, compteurs sans identité, emplacements filtrés.
 */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    partnerBrand: { findUnique: fn(), findMany: fn() },
    partnerLaunch: { findFirst: fn(), findMany: fn() },
    partnerInfoRequest: { count: fn(), create: fn(), update: fn() },
    partnerContact: { findFirst: fn() },
    userConsent: { create: fn() },
    sponsoredCampaign: { findMany: fn(), findUnique: fn() },
    sponsoredCampaignDailyStat: { upsert: fn() },
    trainingModuleItem: { findMany: fn() },
    sendEmail: fn(),
    notifyAdmins: fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => {
  const prisma = { ...m, $transaction: async (run: (tx: unknown) => unknown) => run(prisma) };
  return { prisma };
});
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ sendEmail: m.sendEmail }) }));
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: m.notifyAdmins }));

const infoRequests = await import("../discover-info-request");
const sponsoring = await import("../sponsoring");
const { infoRequestConsentText } = await import("@/core/discover/content");

const NOW = new Date("2026-10-11T10:00:00Z");
const DAY = 86_400_000;
const community = { kind: "community" as const };
const person = { userId: "u1", fullName: "Inès Martin", email: "ines@exemple.fr", professionLabel: "Étudiant en pharmacie", activePharmacy: null, declaredPharmacyName: "Pharmacie du Port" };
const visibleBrand = { id: "brand-a1234567", name: "Marque A", status: "ACTIVE", audience: "ALL_PHARMACIES", partner: { id: "partner-a1234567", name: "Laboratoire A", status: "ACTIVE", startsAt: null, endsAt: null } };
const consentText = (overrides: { pharmacyName?: string | null; hasMessage?: boolean } = {}) =>
  infoRequestConsentText({ brandName: "Marque A", partnerName: "Laboratoire A", shared: { fullName: person.fullName, email: person.email, professionLabel: person.professionLabel, pharmacyName: overrides.pharmacyName ?? null }, hasMessage: overrides.hasMessage ?? false });
const input = (overrides: Partial<Parameters<typeof infoRequests.createInfoRequest>[2]> = {}) => ({ brandId: visibleBrand.id, launchId: null, message: null, includePharmacy: false, consent: true, consentTextShown: consentText(), ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  m.partnerBrand.findUnique.mockResolvedValue(visibleBrand);
  m.partnerInfoRequest.count.mockResolvedValue(0);
  m.partnerInfoRequest.create.mockResolvedValue({ id: "req1" });
  m.partnerContact.findFirst.mockResolvedValue(null);
  m.notifyAdmins.mockResolvedValue(undefined);
});

describe("demande d'information à une marque", () => {
  it("SANS la case cochée : refusée, et RIEN n'est écrit ni envoyé", async () => {
    const result = await infoRequests.createInfoRequest(community, person, input({ consent: false }), NOW);
    expect(result).toMatchObject({ ok: false, field: "consent" });
    expect(m.partnerInfoRequest.create).not.toHaveBeenCalled();
    expect(m.userConsent.create).not.toHaveBeenCalled();
    expect(m.sendEmail).not.toHaveBeenCalled();
  });

  it("si le texte affiché n'est pas celui que le serveur recalcule : refusée (la preuve doit être exacte)", async () => {
    const result = await infoRequests.createInfoRequest(community, person, input({ consentTextShown: "J'accepte tout." }), NOW);
    expect(result).toMatchObject({ ok: false, field: "consent" });
    expect(m.partnerInfoRequest.create).not.toHaveBeenCalled();
  });

  it("enregistre la demande avec le texte exact et l'instant, plus une ligne au journal des consentements", async () => {
    const result = await infoRequests.createInfoRequest(community, person, input({ message: "Documentation svp", consentTextShown: consentText({ hasMessage: true }) }), NOW);
    expect(result).toEqual({ ok: true, requestId: "req1", transmitted: false, brandName: "Marque A" });
    const data = m.partnerInfoRequest.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: "u1", partnerId: "partner-a1234567", brandId: "brand-a1234567", pharmacyId: null, message: "Documentation svp", consentText: consentText({ hasMessage: true }), consentAt: NOW, status: "NEW" });
    expect(m.userConsent.create.mock.calls[0][0].data).toMatchObject({ userId: "u1", kind: "PARTNER_INFO_REQUEST", granted: true, source: "PARTNER_REQUEST" });
    // Pas de contact du partenaire : rien ne part, la demande reste à l'équipe (alerte console).
    expect(m.sendEmail).not.toHaveBeenCalled();
    expect(m.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ linkUrl: "/admin/partenaires/demandes", severity: "WARNING" }));
  });

  it("transmise par e-mail au contact du partenaire : seulement les données listées dans l'accord", async () => {
    m.partnerContact.findFirst.mockResolvedValue({ email: "contact@labo-a.example" });
    m.sendEmail.mockResolvedValue({ status: "SENT", provider: "test", detail: "ok" });
    const result = await infoRequests.createInfoRequest(community, person, input(), NOW);
    expect(result).toMatchObject({ ok: true, transmitted: true });
    const email = m.sendEmail.mock.calls[0][0];
    expect(email.to).toBe("contact@labo-a.example");
    expect(email.text).toContain("Inès Martin");
    expect(email.text).toContain("ines@exemple.fr");
    // L'officine déclarée n'a PAS été jointe : elle ne part pas.
    expect(email.text).not.toContain("Pharmacie du Port");
    expect(m.partnerInfoRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "TRANSMITTED" }) }));
  });

  it("un envoi seulement simulé n'est pas déclaré « transmis »", async () => {
    m.partnerContact.findFirst.mockResolvedValue({ email: "contact@labo-a.example" });
    m.sendEmail.mockResolvedValue({ status: "SIMULATED", provider: "test", detail: "simulé" });
    expect(await infoRequests.createInfoRequest(community, person, input(), NOW)).toMatchObject({ ok: true, transmitted: false });
    expect(m.partnerInfoRequest.update).not.toHaveBeenCalled();
  });

  it("le nom de l'officine n'est joint que si la personne l'a choisi", async () => {
    await infoRequests.createInfoRequest(community, person, input({ includePharmacy: true, consentTextShown: consentText({ pharmacyName: "Pharmacie du Port" }) }), NOW);
    expect(m.partnerInfoRequest.create.mock.calls[0][0].data.consentText).toContain("Pharmacie du Port");
  });

  it("frein : au-delà de 3 demandes à la même marque en 24 h, refusée", async () => {
    m.partnerInfoRequest.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);
    expect(await infoRequests.createInfoRequest(community, person, input(), NOW)).toMatchObject({ ok: false });
    expect(m.partnerInfoRequest.create).not.toHaveBeenCalled();
  });

  it("une marque invisible pour cette personne (refusée par son officine) : refusée", async () => {
    const staff = { kind: "staff" as const, pharmacyId: "ph1", pilot: false, selectedBrandIds: new Set<string>(), preferences: new Map([[visibleBrand.id, "REFUSED" as const]]) };
    expect(await infoRequests.createInfoRequest(staff, person, input(), NOW)).toMatchObject({ ok: false });
    expect(m.partnerInfoRequest.create).not.toHaveBeenCalled();
  });
});

describe("compteurs sponsorisés", () => {
  const live = { id: "cmpgn12345678", status: "ACTIVE", startsAt: new Date(NOW.getTime() - DAY), endsAt: new Date(NOW.getTime() + DAY), placements: ["HOME_FEED"], regulatoryCategory: "COSMETIC", regulatoryReviewedBy: "Dr X", regulatoryReviewedAt: new Date(NOW.getTime() - DAY) };

  it("+1 sur la ligne (campagne, emplacement, jour), sans aucune identité ; une fois par session et par jour", async () => {
    m.sponsoredCampaign.findMany.mockResolvedValue([live]);
    const event = { kind: "impression" as const, campaignId: live.id, placement: "HOME_FEED" as const };
    expect(await sponsoring.recordSponsoredEvents([event], "session-test-1", NOW)).toBe(1);
    expect(await sponsoring.recordSponsoredEvents([event], "session-test-1", NOW)).toBe(0);
    const call = m.sponsoredCampaignDailyStat.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ campaignId_placement_day: { campaignId: live.id, placement: "HOME_FEED", day: new Date("2026-10-11T00:00:00Z") } });
    expect(call.update).toEqual({ impressions: { increment: 1 } });
    expect(JSON.stringify(call)).not.toMatch(/session-test-1|userId|email/);
  });

  it("rien pour une campagne en pause, hors de l'emplacement, ou non validée", async () => {
    m.sponsoredCampaign.findMany.mockResolvedValue([
      { ...live, id: "cmpgnpause1234", status: "PAUSED" },
      { ...live, id: "cmpgnnoval1234", regulatoryReviewedAt: null },
    ]);
    const counted = await sponsoring.recordSponsoredEvents(
      [
        { kind: "click", campaignId: "cmpgnpause1234", placement: "HOME_FEED" },
        { kind: "click", campaignId: "cmpgnnoval1234", placement: "HOME_FEED" },
        { kind: "click", campaignId: live.id, placement: "DISCOVER_TOP" },
      ],
      "session-test-2",
      NOW,
    );
    expect(counted).toBe(0);
    expect(m.sponsoredCampaignDailyStat.upsert).not.toHaveBeenCalled();
  });
});

describe("emplacements sponsorisés", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: "cmpgn12345678",
    name: "Campagne",
    format: "MISE_EN_AVANT",
    placements: ["HOME_FEED"],
    audiences: [],
    status: "ACTIVE",
    startsAt: new Date(NOW.getTime() - DAY),
    endsAt: new Date(NOW.getTime() + DAY),
    regulatoryCategory: "COSMETIC",
    regulatoryReviewedBy: "Dr X",
    regulatoryReviewedAt: new Date(NOW.getTime() - DAY),
    partner: { id: "p1", name: "Laboratoire A", status: "ACTIVE", startsAt: null, endsAt: null, logoUrl: null },
    brand: { id: "b1", slug: "marque-a", name: "Marque A", logoUrl: null, description: null, universes: ["DERMOCOSMETIQUE"], status: "ACTIVE", audience: "ALL_PHARMACIES" },
    launch: null,
    module: null,
    ...overrides,
  });
  const who = (viewer: Parameters<typeof sponsoring.loadSponsoredSlot>[1]["viewer"]) => ({ viewer, profession: null, role: null });

  it("ne lit que les campagnes actives, validées, dans leur période, pour CET emplacement", async () => {
    m.sponsoredCampaign.findMany.mockResolvedValue([]);
    await sponsoring.loadSponsoredSlot("HOME_FEED", who(community), { now: NOW });
    expect(m.sponsoredCampaign.findMany.mock.calls[0][0].where).toEqual({ status: "ACTIVE", placements: { has: "HOME_FEED" }, startsAt: { lte: NOW }, endsAt: { gt: NOW }, regulatoryReviewedAt: { not: null } });
  });

  it("une marque masquée par l'officine ne revient pas par une campagne", async () => {
    m.sponsoredCampaign.findMany.mockResolvedValue([row()]);
    const hidden = { kind: "staff" as const, pharmacyId: "ph1", pilot: false, selectedBrandIds: new Set<string>(), preferences: new Map([["b1", "HIDDEN" as const]]) };
    expect(await sponsoring.loadSponsoredSlot("HOME_FEED", who(hidden), { now: NOW })).toEqual([]);
    expect(await sponsoring.loadSponsoredSlot("HOME_FEED", who(community), { now: NOW })).toHaveLength(1);
  });

  it("une campagne qui pousse un médicament non validé, ou une nouveauté non publiée, ne s'affiche pas", async () => {
    const launch = { id: "l1", title: "Nouveauté", summary: null, posterUrl: null, mediaUrl: null, universe: null, brandId: "b1", reviewStatus: "APPROVED", publishedAt: new Date(NOW.getTime() - DAY), endsAt: null, regulatoryCategory: "MEDICINE", regulatoryValidatedBy: null, regulatoryValidatedAt: null, regulatoryMentions: "Mentions" };
    m.sponsoredCampaign.findMany.mockResolvedValue([row({ launch, regulatoryCategory: "MEDICINE" })]);
    expect(await sponsoring.loadSponsoredSlot("HOME_FEED", who(community), { now: NOW })).toEqual([]);
    m.sponsoredCampaign.findMany.mockResolvedValue([row({ launch: { ...launch, regulatoryCategory: "COSMETIC", regulatoryValidatedBy: "Dr X", regulatoryValidatedAt: NOW, reviewStatus: "DRAFT" } })]);
    expect(await sponsoring.loadSponsoredSlot("HOME_FEED", who(community), { now: NOW })).toEqual([]);
  });

  it("un parcours réservé aux équipes n'est pas poussé à un compte gratuit", async () => {
    m.sponsoredCampaign.findMany.mockResolvedValue([row({ brand: null, placements: ["TRAINING_FEED"], module: { id: "mod1", slug: "s", title: "Parcours", summary: null, coverUrl: null, reviewStatus: "APPROVED", isActive: true, isFreeAccess: false } })]);
    expect(await sponsoring.loadSponsoredSlot("TRAINING_FEED", who(community), { now: NOW })).toEqual([]);
    const staff = { kind: "staff" as const, pharmacyId: "ph1", pilot: false, selectedBrandIds: new Set<string>(), preferences: new Map() };
    expect(await sponsoring.loadSponsoredSlot("TRAINING_FEED", who(staff), { now: NOW })).toHaveLength(1);
  });

  it("la carte mène au détail en portant la campagne et l'emplacement (vue de détail comptée)", async () => {
    m.sponsoredCampaign.findMany.mockResolvedValue([row()]);
    const [card] = await sponsoring.loadSponsoredSlot("HOME_FEED", who(community), { now: NOW });
    expect(card.href).toBe("/m/decouvertes/marques/marque-a?c=cmpgn12345678&p=HOME_FEED");
  });
});
