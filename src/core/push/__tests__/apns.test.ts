import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PUSH_TEXTS, apnsConfigFrom, apnsJwt, isDeadToken, isDeviceToken, pushPayload, pushUrlFor } from "../apns";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

describe("le jeton d'authentification d'Apple (JWT ES256)", () => {
  it("porte l'identifiant de clé, l'équipe, l'heure, et se vérifie avec la clé publique", () => {
    const jwt = apnsJwt({ keyId: "ABC123DEFG", teamId: "TEAM123456", privateKey: pem }, new Date("2026-10-11T10:00:00Z"));
    const [header, claims, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iss: "TEAM123456", iat: 1791712800 });
    expect(Buffer.from(signature, "base64url")).toHaveLength(64); // r‖s brut, le format qu'Apple attend
    const verifier = createVerify("SHA256");
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("sans clé complète, pas de configuration (rien ne part, rien ne casse)", () => {
    expect(apnsConfigFrom({})).toBeNull();
    expect(apnsConfigFrom({ APNS_KEY_ID: "A", APNS_TEAM_ID: "B", APNS_KEY: "pas une clé" })).toBeNull();
    const config = apnsConfigFrom({ APNS_KEY_ID: " A ", APNS_TEAM_ID: "B", APNS_KEY: pem.replace(/\n/g, "\\n") });
    expect(config).toMatchObject({ keyId: "A", teamId: "B", bundleId: "app.pharmaboost.mobile" });
    expect(config?.privateKey).toContain("\n");
  });
});

describe("le contenu d'un push", () => {
  it("jamais le titre libre d'une notification : des textes fixes, sans produit ni patient", () => {
    for (const text of Object.values(PUSH_TEXTS)) {
      if (!text) continue;
      expect(text.title.length).toBeLessThanOrEqual(40);
      expect(text.body.length).toBeLessThanOrEqual(110);
      expect(`${text.title} ${text.body}`).not.toMatch(/patient|ordonnance|\d+ ?mg/i);
    }
    const payload = JSON.parse(pushPayload("LOW_STOCK", "/m")!);
    expect(payload.aps.alert.title).toBe("Stock à surveiller");
    expect(payload.url).toBe("/m");
  });

  it("une sorte sans texte (suivi patient, analyse) ne part pas sur le téléphone", () => {
    expect(pushPayload("FOLLOW_UP_RESPONSE", "/m")).toBeNull();
    expect(pushPayload("ANALYSIS_FAILED", "/m")).toBeNull();
  });

  it("ouvre une page de l'application ; un lien du logiciel du comptoir ramène à l'accueil", () => {
    expect(pushUrlFor("/m/challenges")).toBe("/m/challenges");
    expect(pushUrlFor("/stock?filtre=faible")).toBe("/m");
    expect(pushUrlFor("/mentions")).toBe("/m");
    expect(pushUrlFor(null)).toBe("/m");
  });
});

describe("les jetons d'appareil", () => {
  it("seulement un jeton d'Apple (hexadécimal)", () => {
    expect(isDeviceToken("a".repeat(64))).toBe(true);
    expect(isDeviceToken("zz")).toBe(false);
    expect(isDeviceToken("<script>")).toBe(false);
  });

  it("un jeton qu'Apple refuse est mis de côté", () => {
    expect(isDeadToken(410, "Unregistered")).toBe(true);
    expect(isDeadToken(400, "BadDeviceToken")).toBe(true);
    expect(isDeadToken(429, "TooManyRequests")).toBe(false);
    expect(isDeadToken(500, null)).toBe(false);
  });
});
