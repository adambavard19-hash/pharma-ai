/**
 * Saisie d'une date de péremption telle qu'imprimée sur la boîte, et lecture
 * d'un Datamatrix GS1 (préparée pour le scan, pas encore branchée).
 */
import { describe, expect, it } from "vitest";
import {
  LOT_RESOLUTIONS,
  LOT_RESOLUTION_LABELS,
  addDays,
  calendarDate,
  describeDaysLeft,
  formatExpiry,
  lotIdentityKey,
  normalizeLotNumber,
  parseExpiryInput,
  parseGs1,
  parseGs1Date,
  toIsoDay,
  toPharmacyDay,
} from "../expiry-input";

const read = (raw: string) => {
  const parsed = parseExpiryInput(raw);
  return parsed ? { day: toIsoDay(parsed.expiresOn), precision: parsed.precision } : null;
};

describe("saisie d'une date de péremption", () => {
  it("lit un jour précis écrit à la française", () => {
    expect(read("31/03/2027")).toEqual({ day: "2027-03-31", precision: "DAY" });
    expect(read("1/4/2027")).toEqual({ day: "2027-04-01", precision: "DAY" });
    expect(read("31-03-2027")).toEqual({ day: "2027-03-31", precision: "DAY" });
    expect(read("31.03.27")).toEqual({ day: "2027-03-31", precision: "DAY" });
  });

  it("lit un mois seul comme le dernier jour du mois", () => {
    expect(read("03/2027")).toEqual({ day: "2027-03-31", precision: "MONTH" });
    expect(read("3/27")).toEqual({ day: "2027-03-31", precision: "MONTH" });
    expect(read("02/2028")).toEqual({ day: "2028-02-29", precision: "MONTH" });
    expect(read("02/27")).toEqual({ day: "2027-02-28", precision: "MONTH" });
    expect(read("11 2026")).toEqual({ day: "2026-11-30", precision: "MONTH" });
  });

  it("lit les formats ISO", () => {
    expect(read("2027-03-31")).toEqual({ day: "2027-03-31", precision: "DAY" });
    expect(read("2027-03")).toEqual({ day: "2027-03-31", precision: "MONTH" });
  });

  it("lit les six chiffres GS1 AAMMJJ, « 00 » valant fin de mois", () => {
    expect(read("270331")).toEqual({ day: "2027-03-31", precision: "DAY" });
    expect(read("270300")).toEqual({ day: "2027-03-31", precision: "MONTH" });
    expect(read("280200")).toEqual({ day: "2028-02-29", precision: "MONTH" });
  });

  it("lit six chiffres MMAAAA quand ce n'est pas une date GS1", () => {
    expect(read("032027")).toEqual({ day: "2027-03-31", precision: "MONTH" });
    expect(read("EXP 112026")).toEqual({ day: "2026-11-30", precision: "MONTH" });
    expect(read("122030")).toEqual({ day: "2030-12-31", precision: "MONTH" });
    // Une date GS1 valide n'est jamais relue en MMAAAA.
    expect(read("270331")).toEqual({ day: "2027-03-31", precision: "DAY" });
    expect(parseExpiryInput("132027")).toBeNull();
    expect(parseExpiryInput("002027")).toBeNull();
  });

  it("lit huit chiffres en JJMMAAAA ou AAAAMMJJ sans confusion possible", () => {
    expect(read("31032027")).toEqual({ day: "2027-03-31", precision: "DAY" });
    expect(read("20270331")).toEqual({ day: "2027-03-31", precision: "DAY" });
    expect(read("20112027")).toEqual({ day: "2027-11-20", precision: "DAY" });
  });

  it("ignore le préfixe imprimé et les espaces", () => {
    expect(read("EXP 03/2027")).toEqual({ day: "2027-03-31", precision: "MONTH" });
    expect(read("  Péremption : 31 / 03 / 2027 ")).toEqual({ day: "2027-03-31", precision: "DAY" });
  });

  it("refuse ce qui n'est pas une date réelle", () => {
    for (const raw of ["", "   ", "abc", "31/02/2027", "13/2027", "00/2027", "32/01/2027", "270231", "271301", "2027", "1/1/1999", "12345", "03/2027/01"]) {
      expect(parseExpiryInput(raw), raw).toBeNull();
    }
    expect(parseExpiryInput(42)).toBeNull();
    expect(parseExpiryInput(null)).toBeNull();
  });

  it("rend des dates à minuit UTC, comme la colonne en base", () => {
    expect(parseExpiryInput("31/03/2027")?.expiresOn.toISOString()).toBe("2027-03-31T00:00:00.000Z");
  });
});

describe("affichage d'une date de péremption", () => {
  it("affiche le jour, ou seulement le mois quand la boîte ne porte que lui", () => {
    expect(formatExpiry(new Date("2027-03-31T00:00:00Z"), "DAY")).toBe("31/03/2027");
    expect(formatExpiry("2027-03-31", "MONTH")).toBe("03/2027");
    expect(formatExpiry("2027-03-31")).toBe("31/03/2027");
  });

  it("dit le temps restant en mots simples", () => {
    expect(describeDaysLeft(0)).toBe("aujourd'hui");
    expect(describeDaysLeft(1)).toBe("demain");
    expect(describeDaysLeft(45)).toBe("dans 45 j");
    expect(describeDaysLeft(-1)).toBe("périmé depuis hier");
    expect(describeDaysLeft(-12)).toBe("périmé depuis 12 j");
  });
});

describe("jour calendaire de l'officine", () => {
  it("prend le jour de Paris, pas celui d'UTC", () => {
    // 1er octobre, 22 h 30 UTC = 2 octobre, 0 h 30 à Paris.
    expect(toIsoDay(calendarDate(new Date("2026-10-01T22:30:00Z"), "Europe/Paris"))).toBe("2026-10-02");
    expect(toIsoDay(calendarDate(new Date("2026-10-01T21:30:00Z"), "Europe/Paris"))).toBe("2026-10-01");
  });

  it("retombe sur le jour UTC si le fuseau est inconnu", () => {
    expect(toIsoDay(calendarDate(new Date("2026-10-01T22:30:00Z"), "Nulle/Part"))).toBe("2026-10-01");
  });

  it("ramène un instant au jour de l'officine, et garde un jour déjà calculé", () => {
    // 2 octobre, 14 h UTC : un lot qui périme aujourd'hui doit encore compter.
    expect(toPharmacyDay(new Date("2026-10-02T14:00:00Z"), "Europe/Paris").toISOString()).toBe("2026-10-02T00:00:00.000Z");
    // 1er octobre, 22 h 30 UTC = 2 octobre à Paris.
    expect(toIsoDay(toPharmacyDay(new Date("2026-10-01T22:30:00Z"), "Europe/Paris"))).toBe("2026-10-02");
    // Un jour calendaire (minuit UTC) n'est pas décalé, même dans un fuseau à l'ouest d'UTC.
    expect(toIsoDay(toPharmacyDay(new Date("2026-10-02T00:00:00Z"), "America/Guadeloupe"))).toBe("2026-10-02");
  });

  it("ajoute des jours sans quitter minuit UTC", () => {
    expect(addDays(new Date("2026-10-02T00:00:00Z"), 90).toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
});

describe("identité d'un lot", () => {
  it("normalise le numéro de lot tel qu'imprimé", () => {
    expect(normalizeLotNumber("  ab 12  3 ")).toBe("AB 12 3");
    expect(normalizeLotNumber("")).toBeNull();
    expect(normalizeLotNumber(null)).toBeNull();
    expect(normalizeLotNumber("x".repeat(60))).toHaveLength(40);
  });

  it("reconnaît le même lot d'une saisie ou d'un import à l'autre", () => {
    const expiresOn = new Date("2027-03-31T00:00:00Z");
    expect(lotIdentityKey({ productId: "p1", lotNumber: "ab123", expiresOn })).toBe(lotIdentityKey({ productId: "p1", lotNumber: " AB123 ", expiresOn }));
    expect(lotIdentityKey({ productId: "p1", lotNumber: "AB123", expiresOn })).not.toBe(lotIdentityKey({ presentationId: "p1", lotNumber: "AB123", expiresOn }));
    expect(lotIdentityKey({ presentationId: "d1", lotNumber: null, expiresOn })).toBe("d:d1||2027-03-31");
  });

  it("ne connaît que trois sorties, nommées en français", () => {
    expect([...LOT_RESOLUTIONS]).toEqual(["SOLD", "RETURNED", "DESTROYED"]);
    expect(LOT_RESOLUTION_LABELS).toEqual({ SOLD: "Vendu", RETURNED: "Retourné", DESTROYED: "Détruit" });
  });
});

describe("Datamatrix GS1 (préparé, non branché)", () => {
  // GTIN = « 0 » + CIP13 valide (3400935955838).
  const GTIN = "03400935955838";
  const GS = "\u001d";

  it("lit GTIN, péremption, lot et série avec séparateurs GS", () => {
    const data = parseGs1(`01${GTIN}17270331` + `10AB12C${GS}21SER456`);
    expect(data).toMatchObject({ gtin: GTIN, cip13: "3400935955838", lot: "AB12C", serial: "SER456", precision: "DAY", ambiguous: false });
    expect(data?.expiresOn?.toISOString()).toBe("2027-03-31T00:00:00.000Z");
  });

  it("accepte le préfixe de symbologie et la forme lisible entre parenthèses", () => {
    expect(parseGs1(`]d201${GTIN}17270300` + `10LOT1`)).toMatchObject({ cip13: "3400935955838", lot: "LOT1", precision: "MONTH" });
    expect(parseGs1(`(01)${GTIN}(17)270331(10)LOT1(21)S1`)).toMatchObject({ lot: "LOT1", serial: "S1", ambiguous: false });
  });

  it("lit sans séparateur quand l'ordre ne laisse pas de doute", () => {
    expect(parseGs1(`01${GTIN}17270331` + `10ABC123`)).toMatchObject({ lot: "ABC123", ambiguous: false });
  });

  it("devine la fin du lot sans séparateur, et le signale", () => {
    const data = parseGs1(`01${GTIN}10ABC` + `17270331` + `21SER`);
    expect(data).toMatchObject({ lot: "ABC", serial: "SER", ambiguous: true });
    expect(data?.expiresOn?.toISOString()).toBe("2027-03-31T00:00:00.000Z");
  });

  it("ne donne pas de CIP13 pour un GTIN qui n'est pas un médicament français", () => {
    const data = parseGs1("0104012345678901");
    expect(data?.gtin).toBe("04012345678901");
    expect(data?.cip13).toBeUndefined();
  });

  it("refuse une clé de contrôle fausse, une date impossible ou une chaîne sans GTIN", () => {
    expect(parseGs1(`0103400935955839`)).toBeNull();
    expect(parseGs1(`01${GTIN}17271301`)).toBeNull();
    expect(parseGs1("10ABC17270331")).toBeNull();
    expect(parseGs1("3400935955838")).toBeNull();
    expect(parseGs1("")).toBeNull();
  });

  it("lit la date GS1 seule", () => {
    expect(parseGs1Date("270300")?.precision).toBe("MONTH");
    expect(parseGs1Date("27033")).toBeNull();
  });
});
