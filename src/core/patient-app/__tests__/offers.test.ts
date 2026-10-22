import { describe, expect, it } from "vitest";
import { codeValidAt, ean13CheckDigit, ean13Modules, isOfferCode, joinRequestKey, makeOfferCode, offerAccess, spacedCode, validateJoinRequest, validateOffer } from "../offers";

const now = new Date("2026-10-22T12:00:00Z");
const live = { status: "ACTIVE" as const, startsAt: new Date("2026-10-01"), endsAt: new Date("2026-11-30") };

describe("codes d'offre", () => {
  it("13 chiffres, préfixe interne 2990, clé EAN juste", () => {
    const code = makeOfferCode("12345678");
    expect(code).toMatch(/^2990\d{9}$/);
    expect(code.slice(-1)).toBe(ean13CheckDigit(code.slice(0, 12)));
    expect(isOfferCode(code)).toBe(true);
    expect(spacedCode(code)).toBe(`${code.slice(0, 4)} ${code.slice(4, 8)} ${code.slice(8, 12)} ${code.slice(12)}`);
  });
  it("une clé fausse, un CIP ou un EAN du commerce ne sont pas des codes d'offre", () => {
    const code = makeOfferCode("00000042");
    expect(isOfferCode(code.slice(0, 12) + String((Number(code[12]) + 1) % 10))).toBe(false);
    expect(isOfferCode("3400930000000")).toBe(false);
    expect(isOfferCode("3401528534805")).toBe(false);
  });
  it("clé EAN-13 connue (4006381333931) et 95 modules dessinés", () => {
    expect(ean13CheckDigit("400638133393")).toBe("1");
    const modules = ean13Modules("4006381333931");
    expect(modules).toHaveLength(95);
    expect(modules.startsWith("101")).toBe(true);
    expect(modules.endsWith("101")).toBe(true);
  });
});

describe("qui voit quelle offre", () => {
  const plus = { plan: "PLUS" as const, homePharmacyId: "ph1" };
  const free = { plan: "FREE" as const, homePharmacyId: "ph1" };
  it("l'offre d'une pharmacie : ses patients seulement", () => {
    const offer = { ...live, funding: "PHARMACY" as const, pharmacyId: "ph1", audience: "ALL" as const };
    expect(offerAccess(offer, free, now)).toBe("open");
    expect(offerAccess(offer, { plan: "PLUS", homePharmacyId: "ph2" }, now)).toBe("hidden");
    expect(offerAccess(offer, { plan: "PLUS", homePharmacyId: null }, now)).toBe("hidden");
  });
  it("réservée aux abonnés : visible avec un cadenas pour les autres", () => {
    const offer = { ...live, funding: "PHARMACY" as const, pharmacyId: "ph1", audience: "SUBSCRIBERS" as const };
    expect(offerAccess(offer, free, now)).toBe("locked");
    expect(offerAccess(offer, plus, now)).toBe("open");
  });
  it("l'offre d'un laboratoire : tout le réseau, même un inscrit hors réseau", () => {
    const offer = { ...live, funding: "LAB" as const, pharmacyId: null, audience: "SUBSCRIBERS" as const };
    expect(offerAccess(offer, { plan: "PLUS", homePharmacyId: null }, now)).toBe("open");
    expect(codeValidAt(offer, "nimporte")).toBe(true);
    expect(codeValidAt({ funding: "PHARMACY", pharmacyId: "ph1" }, "ph2")).toBe(false);
  });
  it("terminée ou arrêtée : cachée", () => {
    const offer = { funding: "LAB" as const, pharmacyId: null, audience: "ALL" as const };
    expect(offerAccess({ ...offer, ...live, endsAt: new Date("2026-10-21") }, plus, now)).toBe("hidden");
    expect(offerAccess({ ...offer, ...live, status: "CANCELED" }, plus, now)).toBe("hidden");
  });
});

describe("jamais un médicament", () => {
  const base = { title: "Nouvelle gamme solaire", rangeLabel: "Avène Solaire", discountPercent: 20, startsAt: new Date("2026-10-22"), endsAt: new Date("2026-11-22") };
  it("une offre de parapharmacie passe", () => {
    expect(validateOffer(base, now).ok).toBe(true);
  });
  it("un médicament nommé, ou un nom du catalogue national, est refusé", () => {
    expect(validateOffer({ ...base, rangeLabel: "Doliprane" }, now)).toMatchObject({ ok: false });
    expect(validateOffer({ ...base, title: "-20 % sur vos médicaments" }, now)).toMatchObject({ ok: false });
    expect(validateOffer({ ...base, rangeLabel: "Imaginaire" }, now, (label) => label === "Imaginaire")).toMatchObject({ ok: false });
  });
  it("remise de 5 à 70 %, fin après début, trois mois au plus", () => {
    expect(validateOffer({ ...base, discountPercent: 90 }, now).ok).toBe(false);
    expect(validateOffer({ ...base, endsAt: new Date("2026-10-01") }, now).ok).toBe(false);
    expect(validateOffer({ ...base, endsAt: new Date("2027-03-01") }, now).ok).toBe(false);
  });
});

describe("pharmacies réclamées", () => {
  it("le même nom écrit autrement se regroupe", () => {
    expect(joinRequestKey("Pharmacie du Centre", "06000")).toBe(joinRequestKey("PHARMACIE DU CENTRE ", "06 000"));
    expect(joinRequestKey("Grande Pharmacie de la Gare", "75010")).toBe(joinRequestKey("gare", "75010"));
    expect(joinRequestKey("Pharmacie du Centre", "06000")).not.toBe(joinRequestKey("Pharmacie du Centre", "13001"));
  });
  it("nom, ville et code postal à 5 chiffres", () => {
    expect(validateJoinRequest({ pharmacyName: "Pharmacie du Port", city: "Nice", postalCode: "06300" }).ok).toBe(true);
    expect(validateJoinRequest({ pharmacyName: "Pharmacie du Port", city: "Nice", postalCode: "630" }).ok).toBe(false);
  });
});
