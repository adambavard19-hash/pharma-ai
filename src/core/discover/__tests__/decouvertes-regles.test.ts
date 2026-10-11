import { describe, expect, it } from "vitest";
import { brandVisibleTo, launchIsLive, rangeVisibleTo, regulatoryProblem, type BrandFacts, type DiscoverViewer, type LaunchFacts } from "../visibility";
import { checkInfoRequest, commercialLabel, infoRequestConsentText, matchesSearch, sharedLines } from "../content";
import { audienceMatches, campaignIsLive, checkCampaignTransition, nextCampaignStatuses, type CampaignFacts } from "../../sponsoring/campaign";

/** Découvertes : qui voit quoi, quand une nouveauté ou une campagne est en ligne, ce que dit le consentement. */

const NOW = new Date("2026-10-11T10:00:00Z");
const DAY = 86_400_000;

const brand = (overrides: Partial<BrandFacts> = {}): BrandFacts => ({ id: "b1", status: "ACTIVE", audience: "ALL_PHARMACIES", partnerStatus: "ACTIVE", partnerInPeriod: true, ...overrides });
const community: DiscoverViewer = { kind: "community" };
const staff = (overrides: Partial<Extract<DiscoverViewer, { kind: "staff" }>> = {}): DiscoverViewer => ({ kind: "staff", pharmacyId: "ph1", pilot: false, selectedBrandIds: new Set(), preferences: new Map(), ...overrides });

describe("visibilité d'une marque", () => {
  it("compte gratuit : seulement une marque active, d'un partenaire actif, diffusée à toutes les officines", () => {
    expect(brandVisibleTo(brand(), community)).toBe(true);
    expect(brandVisibleTo(brand({ status: "TEST" }), community)).toBe(false);
    expect(brandVisibleTo(brand({ partnerStatus: "TEST" }), community)).toBe(false);
    expect(brandVisibleTo(brand({ audience: "SELECTED_PHARMACIES" }), community)).toBe(false);
    expect(brandVisibleTo(brand({ audience: "PILOT_GROUP" }), community)).toBe(false);
    expect(brandVisibleTo(brand({ status: "DRAFT" }), community)).toBe(false);
    expect(brandVisibleTo(brand({ partnerInPeriod: false }), community)).toBe(false);
  });

  it("équipe cliente : la règle centrale (sélection, pilote, essai)", () => {
    expect(brandVisibleTo(brand({ audience: "SELECTED_PHARMACIES" }), staff())).toBe(false);
    expect(brandVisibleTo(brand({ audience: "SELECTED_PHARMACIES" }), staff({ selectedBrandIds: new Set(["b1"]) }))).toBe(true);
    expect(brandVisibleTo(brand({ status: "TEST" }), staff())).toBe(false);
    expect(brandVisibleTo(brand({ status: "TEST" }), staff({ pilot: true }))).toBe(true);
  });

  it("équipe cliente : une marque MASQUÉE ou REFUSÉE par l'officine n'apparaît pas dans les Découvertes", () => {
    expect(brandVisibleTo(brand(), staff({ preferences: new Map([["b1", "HIDDEN"]]) }))).toBe(false);
    expect(brandVisibleTo(brand(), staff({ preferences: new Map([["b1", "REFUSED"]]) }))).toBe(false);
    expect(brandVisibleTo(brand(), staff({ preferences: new Map([["autre", "REFUSED"]]) }))).toBe(true);
  });

  it("une gamme en essai n'est vue que du groupe pilote d'une officine cliente", () => {
    expect(rangeVisibleTo("ACTIVE", community)).toBe(true);
    expect(rangeVisibleTo("TEST", community)).toBe(false);
    expect(rangeVisibleTo("TEST", staff({ pilot: true }))).toBe(true);
    expect(rangeVisibleTo("DRAFT", staff({ pilot: true }))).toBe(false);
  });
});

describe("une nouveauté en ligne", () => {
  const live = (overrides: Partial<LaunchFacts> = {}): LaunchFacts => ({
    reviewStatus: "APPROVED",
    publishedAt: new Date(NOW.getTime() - DAY),
    endsAt: null,
    regulatoryCategory: "PARAPHARMACY",
    validatedBy: "Dr X, pharmacienne",
    validatedAt: new Date(NOW.getTime() - DAY),
    mentions: null,
    ...overrides,
  });

  it("relue, publiée, non échue, validée (nom ET date)", () => {
    expect(launchIsLive(live(), NOW)).toBe(true);
    expect(launchIsLive(live({ reviewStatus: "DRAFT" }), NOW)).toBe(false);
    expect(launchIsLive(live({ reviewStatus: "IN_REVIEW" }), NOW)).toBe(false);
    expect(launchIsLive(live({ publishedAt: null }), NOW)).toBe(false);
    expect(launchIsLive(live({ publishedAt: new Date(NOW.getTime() + DAY) }), NOW)).toBe(false);
    expect(launchIsLive(live({ endsAt: NOW }), NOW)).toBe(false);
    expect(launchIsLive(live({ validatedAt: null }), NOW)).toBe(false);
    expect(launchIsLive(live({ validatedBy: "  " }), NOW)).toBe(false);
  });

  it("un médicament sans validation ou sans mentions obligatoires n'est JAMAIS montré", () => {
    expect(launchIsLive(live({ regulatoryCategory: "MEDICINE", validatedAt: null, validatedBy: null, mentions: "Mentions" }), NOW)).toBe(false);
    expect(launchIsLive(live({ regulatoryCategory: "MEDICINE", mentions: "" }), NOW)).toBe(false);
    expect(regulatoryProblem({ regulatoryCategory: "MEDICINE", validatedBy: "Dr X", validatedAt: NOW, mentions: null })).toBe("MEDICINE_MENTIONS_MISSING");
    expect(launchIsLive(live({ regulatoryCategory: "MEDICINE", mentions: "Lire attentivement la notice." }), NOW)).toBe(true);
  });
});

describe("une campagne sponsorisée", () => {
  const campaign = (overrides: Partial<CampaignFacts> = {}): CampaignFacts => ({
    status: "ACTIVE",
    startsAt: new Date(NOW.getTime() - DAY),
    endsAt: new Date(NOW.getTime() + DAY),
    placements: ["HOME_FEED"],
    regulatoryCategory: "COSMETIC",
    regulatoryReviewedBy: "Dr X",
    regulatoryReviewedAt: new Date(NOW.getTime() - DAY),
    ...overrides,
  });

  it("diffusée seulement ACTIVE, dans sa période, validée", () => {
    expect(campaignIsLive(campaign(), NOW)).toBe(true);
    for (const status of ["DRAFT", "IN_REVIEW", "APPROVED", "PAUSED", "ENDED", "REJECTED"] as const) expect(campaignIsLive(campaign({ status }), NOW)).toBe(false);
    expect(campaignIsLive(campaign({ startsAt: new Date(NOW.getTime() + 1000) }), NOW)).toBe(false);
    expect(campaignIsLive(campaign({ endsAt: NOW }), NOW)).toBe(false);
    expect(campaignIsLive(campaign({ regulatoryReviewedAt: null }), NOW)).toBe(false);
  });

  it("cycle de vie : DRAFT → IN_REVIEW → APPROVED → ACTIVE ⇄ PAUSED → ENDED", () => {
    expect(nextCampaignStatuses("DRAFT")).toEqual(["IN_REVIEW"]);
    expect(checkCampaignTransition(campaign({ status: "DRAFT" }), "ACTIVE", NOW)).toBe("NOT_ALLOWED");
    expect(checkCampaignTransition(campaign({ status: "DRAFT" }), "IN_REVIEW", NOW)).toBeNull();
    expect(checkCampaignTransition(campaign({ status: "ACTIVE" }), "PAUSED", NOW)).toBeNull();
    expect(checkCampaignTransition(campaign({ status: "PAUSED" }), "ACTIVE", NOW)).toBeNull();
    expect(nextCampaignStatuses("ENDED")).toEqual([]);
  });

  it("un médicament (comme tout le reste) ne s'approuve ni ne s'active sans validation réglementaire", () => {
    const medicine = campaign({ status: "IN_REVIEW", regulatoryCategory: "MEDICINE", regulatoryReviewedAt: null, regulatoryReviewedBy: null });
    expect(checkCampaignTransition(medicine, "APPROVED", NOW)).toBe("REGULATORY_VALIDATION_REQUIRED");
    expect(checkCampaignTransition({ ...medicine, status: "APPROVED" }, "ACTIVE", NOW)).toBe("REGULATORY_VALIDATION_REQUIRED");
    expect(checkCampaignTransition({ ...medicine, regulatoryReviewedAt: NOW, regulatoryReviewedBy: "Dr X" }, "APPROVED", NOW)).toBeNull();
  });

  it("ni sans emplacement, ni après sa période", () => {
    expect(checkCampaignTransition(campaign({ status: "DRAFT", placements: [] }), "IN_REVIEW", NOW)).toBe("NO_PLACEMENT");
    expect(checkCampaignTransition(campaign({ status: "APPROVED", startsAt: new Date(NOW.getTime() - 3 * DAY), endsAt: new Date(NOW.getTime() - DAY) }), "ACTIVE", NOW)).toBe("PERIOD_OVER");
  });

  it("publics visés : vide = tout le monde ; sinon selon le métier ou le rôle", () => {
    expect(audienceMatches([], null, null)).toBe(true);
    expect(audienceMatches(["STUDENT"], "PHARMACY_STUDENT", null)).toBe(true);
    expect(audienceMatches(["STUDENT"], "TECHNICIAN", null)).toBe(false);
    expect(audienceMatches(["OWNER"], null, "OWNER")).toBe(true);
  });
});

describe("étiquettes et recherche", () => {
  it("un contenu payé est « Sponsorisé », un contenu de marque « Partenaire »", () => {
    expect(commercialLabel({ sponsored: true })).toBe("Sponsorisé");
    expect(commercialLabel({ sponsored: false })).toBe("Partenaire");
  });

  it("recherche sans accents, tous les mots", () => {
    expect(matchesSearch("eclat creme", ["Crème Éclat 50 ml"])).toBe(true);
    expect(matchesSearch("solaire", ["Crème Éclat"])).toBe(false);
    expect(matchesSearch("  ", ["x"])).toBe(true);
  });
});

describe("« Demander des informations » : le consentement", () => {
  const shared = { fullName: "Inès Martin", email: "ines@exemple.fr", professionLabel: "Étudiant en pharmacie", pharmacyName: null };

  it("la case est obligatoire : sans elle, rien ne part", () => {
    expect(checkInfoRequest({ consent: false, message: "Bonjour" })).toMatchObject({ ok: false, field: "consent" });
    expect(checkInfoRequest({ consent: true, message: "  " })).toEqual({ ok: true, message: null });
  });

  it("le texte nomme la marque, le laboratoire et CHAQUE donnée transmise, rien d'autre", () => {
    const text = infoRequestConsentText({ brandName: "Marque A", partnerName: "Laboratoire A", shared, hasMessage: false });
    expect(text).toContain("Marque A (Laboratoire A)");
    expect(text).toContain("mon nom, mon adresse e-mail et mon métier");
    expect(text).not.toContain("officine");
    const withPharmacy = infoRequestConsentText({ brandName: "Marque A", partnerName: "Laboratoire A", shared: { ...shared, pharmacyName: "Pharmacie du Port" }, hasMessage: true });
    expect(withPharmacy).toContain("le nom de mon officine (« Pharmacie du Port »)");
    expect(withPharmacy).toContain("mon message");
    expect(sharedLines({ ...shared, pharmacyName: "Pharmacie du Port" }, true)).toEqual(["Nom : Inès Martin", "E-mail : ines@exemple.fr", "Métier : Étudiant en pharmacie", "Officine : Pharmacie du Port", "Votre message"]);
  });
});
