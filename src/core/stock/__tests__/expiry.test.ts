/**
 * Dates courtes : les bornes exactes des niveaux, le décompte des jours, et la
 * règle qui protège le conseil — une boîte périmée n'est jamais « une date
 * courte à écouler ».
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_SHORT_DATE_THRESHOLDS, EXPIRY_LEVEL_LABELS, daysUntil, expiryLevel, nearestShortDate, normalizeThresholds } from "../expiry";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("jours restants avant la péremption", () => {
  const today = new Date("2026-10-02T10:00:00Z");

  it("vaut 0 le jour même, quelle que soit l'heure", () => {
    expect(daysUntil(day("2026-10-02"), today)).toBe(0);
    expect(daysUntil(day("2026-10-02"), new Date("2026-10-02T23:59:59Z"))).toBe(0);
  });

  it("compte en jours calendaires, positifs avant, négatifs après", () => {
    expect(daysUntil(day("2026-10-03"), today)).toBe(1);
    expect(daysUntil(day("2026-11-01"), today)).toBe(30);
    expect(daysUntil(day("2026-10-01"), today)).toBe(-1);
    expect(daysUntil(day("2027-10-02"), today)).toBe(365);
  });

  it("traverse un changement d'heure sans perdre de jour", () => {
    // Passage à l'heure d'hiver le 25 octobre 2026 : les jours restent des jours.
    expect(daysUntil(day("2026-10-26"), day("2026-10-24"))).toBe(2);
  });
});

describe("niveau d'une date de péremption", () => {
  const thresholds = { soonDays: 90, urgentDays: 30 };

  it("est « expiré » dès le lendemain de la date, jamais le jour même", () => {
    expect(expiryLevel(-1, thresholds)).toBe("EXPIRED");
    expect(expiryLevel(-400, thresholds)).toBe("EXPIRED");
    expect(expiryLevel(0, thresholds)).toBe("URGENT");
  });

  it("est « urgent » jusqu'au seuil urgent inclus", () => {
    expect(expiryLevel(30, thresholds)).toBe("URGENT");
    expect(expiryLevel(31, thresholds)).toBe("SOON");
  });

  it("est « bientôt » jusqu'au seuil bientôt inclus, puis lointain dès J+1 au-delà", () => {
    expect(expiryLevel(90, thresholds)).toBe("SOON");
    expect(expiryLevel(91, thresholds)).toBe("OK");
  });

  it("suit les seuils propres à l'officine", () => {
    expect(expiryLevel(45, { soonDays: 60, urgentDays: 45 })).toBe("URGENT");
    expect(expiryLevel(61, { soonDays: 60, urgentDays: 45 })).toBe("OK");
    expect(expiryLevel(0, { soonDays: 60, urgentDays: 0 })).toBe("URGENT");
    expect(expiryLevel(1, { soonDays: 60, urgentDays: 0 })).toBe("SOON");
  });

  it("prend 90 / 30 jours par défaut et nomme chaque niveau en français", () => {
    expect(DEFAULT_SHORT_DATE_THRESHOLDS).toEqual({ soonDays: 90, urgentDays: 30 });
    expect(expiryLevel(30)).toBe("URGENT");
    expect(expiryLevel(91)).toBe("OK");
    expect(EXPIRY_LEVEL_LABELS).toEqual({ EXPIRED: "Expiré", URGENT: "Urgent", SOON: "Bientôt", OK: "Date lointaine" });
  });
});

describe("seuils réglés par l'officine", () => {
  it("arrondit et garde des seuils cohérents", () => {
    expect(normalizeThresholds(90, 30)).toEqual({ soonDays: 90, urgentDays: 30 });
    expect(normalizeThresholds(60.4, 14.6)).toEqual({ soonDays: 60, urgentDays: 15 });
  });

  it("ne laisse jamais le seuil urgent dépasser le seuil bientôt", () => {
    expect(normalizeThresholds(30, 60)).toEqual({ soonDays: 30, urgentDays: 30 });
  });

  it("borne les valeurs : au moins 1 jour pour « bientôt », 2 ans au plus, jamais négatif", () => {
    expect(normalizeThresholds(0, 0)).toEqual({ soonDays: 1, urgentDays: 0 });
    expect(normalizeThresholds(5000, -3)).toEqual({ soonDays: 730, urgentDays: 0 });
  });
});

describe("date courte d'une référence", () => {
  const today = day("2026-10-02");

  it("retient le lot non périmé le plus proche", () => {
    const result = nearestShortDate([{ expiresOn: day("2027-03-31") }, { expiresOn: day("2026-10-20") }, { expiresOn: day("2026-12-31") }], today);
    expect(result).toEqual({ expiresOn: "2026-10-20", daysLeft: 18, level: "URGENT" });
  });

  it("ignore les lots périmés : une boîte périmée ne se conseille pas, elle sort", () => {
    const result = nearestShortDate([{ expiresOn: day("2026-09-30") }, { expiresOn: day("2026-12-01") }], today);
    expect(result).toEqual({ expiresOn: "2026-12-01", daysLeft: 60, level: "SOON" });
  });

  it("garde le lot qui périme aujourd'hui, et rien quand tout est périmé ou inconnu", () => {
    expect(nearestShortDate([{ expiresOn: day("2026-10-02") }], today)).toEqual({ expiresOn: "2026-10-02", daysLeft: 0, level: "URGENT" });
    expect(nearestShortDate([{ expiresOn: day("2026-10-01") }], today)).toBeNull();
    expect(nearestShortDate([], today)).toBeNull();
  });

  it("calcule le niveau avec les seuils de l'officine", () => {
    expect(nearestShortDate([{ expiresOn: day("2026-11-01") }], today, { soonDays: 60, urgentDays: 7 })?.level).toBe("SOON");
    expect(nearestShortDate([{ expiresOn: day("2027-06-01") }], today, { soonDays: 60, urgentDays: 7 })?.level).toBe("OK");
  });
});
