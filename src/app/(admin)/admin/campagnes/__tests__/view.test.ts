import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_KIND_PARAMS,
  CAMPAIGN_STATUS_PARAMS,
  RECIPIENT_STATUS_PARAMS,
  campaignStatusLabel,
  cancelConsequences,
  codeFromParam,
  dateLabel,
  firstParam,
  hasNextPage,
  isStandardOffer,
  kindLabel,
  offerHeadline,
  offerSendLines,
  pageParam,
  paramFromCode,
  recipientStatusLabel,
  recipientsLabel,
  referralOfferExpectation,
  referralOfferState,
  resultLine,
} from "../view";

/** Ce que les écrans des campagnes disent : états, résultats, filtres, conséquences. */

const at = (iso: string) => new Date(iso);

describe("les filtres de l'adresse", () => {
  it("une valeur d'adresse désigne un code, une valeur inconnue est ignorée", () => {
    expect(codeFromParam(CAMPAIGN_STATUS_PARAMS, "programmee")).toBe("SCHEDULED");
    expect(codeFromParam(CAMPAIGN_STATUS_PARAMS, "n'importe quoi")).toBeNull();
    expect(codeFromParam(CAMPAIGN_STATUS_PARAMS, "constructor")).toBeNull();
    expect(codeFromParam(CAMPAIGN_STATUS_PARAMS, null)).toBeNull();
    expect(codeFromParam(CAMPAIGN_KIND_PARAMS, "parrainage")).toBe("REFERRAL_OFFER");
    expect(codeFromParam(RECIPIENT_STATUS_PARAMS, "simule")).toBe("SIMULATED");
  });

  it("chaque code a sa valeur d'adresse, et inversement", () => {
    for (const [value, code] of Object.entries(CAMPAIGN_STATUS_PARAMS)) expect(paramFromCode(CAMPAIGN_STATUS_PARAMS, code)).toBe(value);
    for (const [value, code] of Object.entries(CAMPAIGN_KIND_PARAMS)) expect(paramFromCode(CAMPAIGN_KIND_PARAMS, code)).toBe(value);
    for (const [value, code] of Object.entries(RECIPIENT_STATUS_PARAMS)) expect(paramFromCode(RECIPIENT_STATUS_PARAMS, code)).toBe(value);
    expect(paramFromCode(CAMPAIGN_STATUS_PARAMS, null)).toBeNull();
    expect(paramFromCode(CAMPAIGN_STATUS_PARAMS, "INCONNU")).toBeNull();
  });

  it("une page est un entier d'au moins 1, la première valeur d'un paramètre répété", () => {
    expect(pageParam("3")).toBe(3);
    expect(pageParam(["2", "9"])).toBe(2);
    expect(pageParam(undefined)).toBe(1);
    expect(pageParam("0")).toBe(1);
    expect(pageParam("-4")).toBe(1);
    expect(pageParam("abc")).toBe(1);
    expect(firstParam("  ")).toBeNull();
    expect(firstParam([" a "])).toBe("a");
  });

  it("une page suivante existe tant que le total n'est pas atteint", () => {
    expect(hasNextPage(1, 20, 20)).toBe(false);
    expect(hasNextPage(1, 20, 21)).toBe(true);
    expect(hasNextPage(2, 20, 40)).toBe(false);
    expect(hasNextPage(2, 20, 41)).toBe(true);
  });
});

describe("l'état affiché : jamais « envoyée » pour un envoi simulé", () => {
  it("les états de la base gardent leur libellé", () => {
    expect(campaignStatusLabel({ status: "DRAFT", simulated: false })).toEqual({ label: "Brouillon", tone: "neutral" });
    expect(campaignStatusLabel({ status: "SCHEDULED", simulated: false }).label).toBe("Programmée");
    expect(campaignStatusLabel({ status: "SENDING", simulated: false }).label).toBe("Envoi en cours");
    expect(campaignStatusLabel({ status: "SENT", simulated: false })).toEqual({ label: "Envoyée", tone: "success" });
    expect(campaignStatusLabel({ status: "CANCELED", simulated: false }).label).toBe("Annulée");
  });

  it("un envoi simulé se lit « simulée », en avertissement", () => {
    expect(campaignStatusLabel({ status: "SENT", simulated: true })).toEqual({ label: "Simulée", tone: "warning" });
    expect(campaignStatusLabel({ status: "SENDING", simulated: true }).label).toBe("Envoi simulé en cours");
    expect(campaignStatusLabel({ status: "CANCELED", simulated: true }).label).toBe("Annulée");
  });

  it("un état inconnu s'affiche tel quel, sans casser la page", () => {
    expect(campaignStatusLabel({ status: "ETRANGE", simulated: false })).toEqual({ label: "ETRANGE", tone: "neutral" });
    expect(recipientStatusLabel("SIMULATED").label).toBe("Simulé, non parti");
    expect(recipientStatusLabel("SENT").label).toBe("Envoyé");
    expect(recipientStatusLabel("ETRANGE")).toEqual({ label: "ETRANGE", tone: "neutral" });
    expect(kindLabel("BONUS_OFFER")).toBe("Offre bonus");
    expect(kindLabel("AUTRE")).toBe("AUTRE");
  });
});

describe("la ligne de résultat", () => {
  const started = at("2026-10-05T08:15:00Z");

  it("dit envoyés, échecs et ignorés, avec le bon accord", () => {
    expect(resultLine({ simulated: false, sentCount: 12, failedCount: 1, skippedCount: 2, startedAt: started })).toBe("12 envoyés · 1 échec · 2 ignorés");
    expect(resultLine({ simulated: false, sentCount: 1, failedCount: 0, skippedCount: 0, startedAt: started })).toBe("1 envoyé · 0 échec · 0 ignoré");
  });

  it("un envoi simulé dit « simulés », jamais « envoyés »", () => {
    expect(resultLine({ simulated: true, sentCount: 5, failedCount: 0, skippedCount: 0, startedAt: started })).toBe("5 simulés · 0 échec · 0 ignoré");
    expect(resultLine({ simulated: true, sentCount: 1, failedCount: 0, skippedCount: 0, startedAt: started })).not.toContain("envoy");
  });

  it("tant que rien n'a été tenté, il n'y a pas de résultat (pas de zéro inventé)", () => {
    expect(resultLine({ simulated: false, sentCount: 0, failedCount: 0, skippedCount: 0, startedAt: null })).toBeNull();
  });

  it("les destinataires d'un brouillon, ou d'une campagne annulée avant tout envoi, ne sont pas un zéro", () => {
    expect(recipientsLabel({ status: "DRAFT", recipientCount: 0, startedAt: null })).toBe("—");
    expect(recipientsLabel({ status: "CANCELED", recipientCount: 0, startedAt: null })).toBe("—");
    expect(recipientsLabel({ status: "SCHEDULED", recipientCount: 42, startedAt: null })).toBe("42");
    // Le séparateur de milliers français est une espace insécable fine : on la lit comme une espace.
    expect(recipientsLabel({ status: "SENT", recipientCount: 1200, startedAt: started }).replace(/\s/g, " ")).toBe("1 200");
    expect(recipientsLabel({ status: "CANCELED", recipientCount: 10, startedAt: started })).toBe("10");
  });
});

describe("la date de la liste", () => {
  const base = { simulated: false, scheduledFor: null, startedAt: null, completedAt: null, createdAt: at("2026-10-01T10:00:00Z") };

  it("une programmation est un jour, pas une heure", () => {
    expect(dateLabel({ ...base, status: "SCHEDULED", scheduledFor: at("2026-10-05T22:00:00Z") })).toMatchObject({ caption: "Programmée pour le", dayOnly: true });
  });

  it("selon l'état : démarrée, envoyée ou simulée, créée", () => {
    expect(dateLabel({ ...base, status: "SENDING", startedAt: at("2026-10-05T08:15:00Z") })).toMatchObject({ caption: "Démarrée le", dayOnly: false });
    expect(dateLabel({ ...base, status: "SENT", startedAt: at("2026-10-05T08:15:00Z"), completedAt: at("2026-10-05T08:20:00Z") })).toMatchObject({ caption: "Envoyée le", date: at("2026-10-05T08:20:00Z") });
    expect(dateLabel({ ...base, status: "SENT", simulated: true, startedAt: at("2026-10-05T08:15:00Z"), completedAt: at("2026-10-05T08:20:00Z") }).caption).toBe("Simulée le");
    expect(dateLabel({ ...base, status: "DRAFT" })).toMatchObject({ caption: "Créée le", date: base.createdAt });
    expect(dateLabel({ ...base, status: "CANCELED" }).caption).toBe("Créée le");
  });
});

describe("l'offre de parrainage liée", () => {
  const now = at("2026-10-10T09:00:00Z");
  const offer = { amountCents: 2000, startsAt: at("2026-10-05T08:00:00Z"), endsAt: at("2026-10-31T22:59:59.999Z"), canceledAt: null };

  it("en cours, à venir, terminée ou arrêtée", () => {
    expect(referralOfferState(offer, now).label).toBe("En cours");
    expect(referralOfferState({ ...offer, startsAt: at("2026-10-11T00:00:00Z") }, now).label).toBe("À venir");
    expect(referralOfferState({ ...offer, endsAt: at("2026-10-09T00:00:00Z") }, now).label).toBe("Terminée");
    expect(referralOfferState({ ...offer, canceledAt: at("2026-10-08T00:00:00Z") }, now).label).toBe("Arrêtée");
    expect(referralOfferState({ ...offer, endsAt: null }, now).label).toBe("En cours");
  });

  it("le montant standard sans fin n'est pas une offre : aucune ligne n'est créée", () => {
    expect(isStandardOffer({ offerAmountCents: 1000, offerEndsAt: null })).toBe(true);
    expect(isStandardOffer({ offerAmountCents: 1000, offerEndsAt: at("2026-10-31T22:59:59Z") })).toBe(false);
    expect(isStandardOffer({ offerAmountCents: 2000, offerEndsAt: null })).toBe(false);
  });

  it("dit ce qui se passera, ou ce qui ne s'est pas passé, quand aucune offre n'est liée", () => {
    const draft = { kind: "REFERRAL_OFFER", status: "DRAFT", offerAmountCents: 2000, offerEndsAt: null, referralOffer: null };
    expect(referralOfferExpectation(draft)).toContain("sera créée au moment de l'envoi");
    expect(referralOfferExpectation({ ...draft, offerAmountCents: 1000 })).toContain("aucune offre ne sera créée");
    expect(referralOfferExpectation({ ...draft, status: "SENT", offerAmountCents: 1000 })).toContain("Aucune offre créée");
    expect(referralOfferExpectation({ ...draft, status: "SENT" })).toBe("Aucune offre de parrainage n'est liée à cette campagne.");
    expect(referralOfferExpectation({ ...draft, referralOffer: { id: "o1" } })).toBeNull();
    expect(referralOfferExpectation({ ...draft, kind: "BONUS_OFFER" })).toBeNull();
  });
});

describe("le montant, en toutes lettres", () => {
  it("dit ce que l'on confirme, selon le type", () => {
    expect(offerHeadline("REFERRAL_OFFER", 2000)).toBe("20 € par filleul et par mois");
    expect(offerHeadline("BONUS_OFFER", 1250)).toBe("12,50 € de bonus");
    expect(offerHeadline("ANNOUNCEMENT", null)).toBeNull();
  });

  it("l'envoi dit ce qu'il fait de l'offre : un bonus se pose à la main, un parrainage s'applique vraiment", () => {
    expect(offerSendLines("BONUS_OFFER", 2000, true, "send")[0]).toContain("l'équipe l'applique à la main");
    const referral = offerSendLines("REFERRAL_OFFER", 2000, true, "send")[0];
    expect(referral).toContain("réellement appliqué");
    expect(referral).toContain("déjà inscrits gardent leur montant");
    expect(offerSendLines("REFERRAL_OFFER", 2000, true, "schedule")[0]).toContain("créée au moment de l'envoi, pas maintenant");
    expect(offerSendLines("REFERRAL_OFFER", 1000, false, "send")[0]).toContain("aucune offre n'est créée");
    expect(offerSendLines("PARTNER_INVITATION", null, false, "send")).toEqual([]);
  });
});

describe("l'annulation dit sa conséquence avant d'être confirmée", () => {
  it("programmée : rien n'est parti", () => {
    const lines = cancelConsequences({ status: "SCHEDULED", kind: "BONUS_OFFER" });
    expect(lines[0]).toContain("Rien n'est encore parti");
    expect(lines.join(" ")).toContain("définitive");
  });

  it("en cours : les en-attente sont abandonnés, ce qui est parti ne se rappelle pas", () => {
    const lines = cancelConsequences({ status: "SENDING", kind: "BONUS_OFFER" }).join(" ");
    expect(lines).toContain("encore en attente sont abandonnés");
    expect(lines).toContain("« ignorés »");
    expect(lines).toContain("ne se rappellent pas");
    expect(lines).not.toContain("offre de parrainage");
  });

  it("une campagne de parrainage en cours arrête aussi son offre, sans toucher aux filleuls déjà inscrits", () => {
    const lines = cancelConsequences({ status: "SENDING", kind: "REFERRAL_OFFER" }).join(" ");
    expect(lines).toContain("L'offre de parrainage liée prend fin");
    expect(lines).toContain("Les filleuls déjà inscrits gardent leur montant");
  });
});
