import { describe, expect, it } from "vitest";
import { cureDuration, reminderDate, reminderDay, unitsOnBox, categoryKey, productKey } from "../cure";
import { buildCureReminder } from "../reminder-email";

/** Les rappels de fin de cure (17 oct. 2026) : la durée (produit > boîte > famille), le jour du rappel, l'e-mail. */

describe("le nombre de prises lu sur la boîte", () => {
  it("gélules, comprimés, sachets, ampoules… ; jamais un dosage en mg, ml ou g", () => {
    expect(unitsOnBox("ULTRA-LEVURE 200 mg 30 gélules")).toBe(30);
    expect(unitsOnBox("MAG 2 24 comprimés")).toBe(24);
    expect(unitsOnBox("Magnésium marin B6 B/60 cpr")).toBe(60);
    expect(unitsOnBox("SPASFON LYOC 80 mg B/10")).toBeNull();
    expect(unitsOnBox("Arkogélules Valériane 45 gél")).toBe(45);
    expect(unitsOnBox("Probiotique 28 sachets")).toBe(28);
    expect(unitsOnBox("Vitamine D3 1000 UI 20 ml")).toBeNull();
    expect(unitsOnBox("Crème hydratante 50 ml")).toBeNull();
  });
});

describe("la durée de la cure : produit, sinon boîte, sinon famille", () => {
  const mag = { category: "MAGNESIUM", ean: "3401234567890", name: "Magnésium marin 30 comprimés" };
  it("la boîte suffit quand rien n'est réglé", () => {
    expect(cureDuration(mag, [])).toEqual({ days: 30, source: "BOX" });
  });
  it("la durée réglée pour le produit passe avant la boîte ; 0 = pas de rappel pour ce produit", () => {
    expect(cureDuration(mag, [{ key: productKey(mag.ean), days: 15 }])).toEqual({ days: 15, source: "PRODUCT" });
    expect(cureDuration(mag, [{ key: productKey(mag.ean), days: 0 }, { key: categoryKey("MAGNESIUM"), days: 30 }])).toBeNull();
  });
  it("la famille, quand la boîte ne dit rien", () => {
    const noBox = { ...mag, name: "Magnésium marin" };
    expect(cureDuration(noBox, [{ key: categoryKey("MAGNESIUM"), days: 30 }])).toEqual({ days: 30, source: "FAMILY" });
    expect(cureDuration(noBox, [])).toBeNull();
  });
  it("hors des familles de cure (dermocosmétique, hygiène…), ou cure de moins de 14 jours : pas de rappel", () => {
    expect(cureDuration({ category: "DERMOCOSMETIQUE", ean: null, name: "Crème 30 doses" }, [])).toBeNull();
    expect(cureDuration({ category: "PROBIOTIQUES", ean: null, name: "Probiotique 10 gélules" }, [])).toBeNull();
  });
});

describe("le jour du rappel", () => {
  it("sept jours avant la fin : une cure de 30 jours achetée le 17 octobre → rappel le 9 novembre", () => {
    const sendAt = reminderDate(new Date("2026-10-17T10:00:00Z"), 30);
    expect(sendAt.toISOString()).toBe("2026-11-09T10:00:00.000Z");
    expect(reminderDay(sendAt)).toBe("9 novembre");
  });
});

describe("l'e-mail de rappel", () => {
  const ctx = { baseUrl: "https://pharmaboost.app", company: { legalName: "PharmaBoost", contactEmail: "contact@pharmaboost.app" } };
  it("au nom de la pharmacie : la cure, la pharmacie, le lien de désinscription ; ni posologie ni nom du patient", () => {
    const mail = buildCureReminder({ pharmacy: { name: "Pharmacie du Port", phone: "04 93 00 00 00", addressLine1: "1 quai Lunel", postalCode: "06300", city: "Nice" }, productName: "Magnésium marin B6", unsubscribeUrl: "https://pharmaboost.app/rappel-cure/x" }, ctx);
    expect(mail.subject).toBe("Votre cure de Magnésium marin B6 arrive à son terme");
    expect(mail.text).toContain("Pensez à repasser à Pharmacie du Port pour la renouveler");
    expect(mail.text).toContain("1 quai Lunel, 06300 Nice");
    expect(mail.text).toContain("Ne plus recevoir de rappels de cure : https://pharmaboost.app/rappel-cure/x");
    expect(mail.text).toContain("vient d'être effacée");
  });
  it("protège le HTML", () => {
    const mail = buildCureReminder({ pharmacy: { name: "<script>" }, productName: "<img onerror=x>", unsubscribeUrl: "https://pharmaboost.app/rappel-cure/x" }, ctx);
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img onerror");
  });
});
