import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { onboardingStage } from "../stage";
import { onboardingSchema } from "../form";
import { buildDossierReceivedEmail, buildPharmacyInvitationEmail } from "../emails";
import { DEFAULT_EMAIL_CONTEXT } from "@/core/platform/email-layout";
import { verifySvixSignature } from "@/core/email/webhook-signature";

// Un SIRET valide (clé de Luhn) : 732 829 320 00074.
const SIRET = "73282932000074";
const valid = {
  name: "Pharmacie Centrale", legalName: "SELARL Pharmacie Centrale", siret: SIRET, finessNumber: "", addressLine1: "1 place de la Mairie",
  postalCode: "75001", city: "Paris", phone: "", contactEmail: "", ownerFirstName: "Claire", ownerLastName: "Martin", ownerTitle: "",
  ownerEmail: "claire@pharmacie.fr", postCount: "6", lgo: "",
};

describe("étape d'inscription", () => {
  const future = new Date(Date.now() + 86_400_000);
  const base = { prospectStatus: "PROSPECT", missingCount: 8 };
  it("suit l'invitation : à envoyer, envoyée, ouverte, échec, expirée", () => {
    expect(onboardingStage({ ...base, invitation: { expiresAt: future } }).stage).toBe("INVITATION_TO_SEND");
    expect(onboardingStage({ ...base, invitation: { expiresAt: future, sentAt: new Date(), lastSendStatus: "SENT" } }).stage).toBe("INVITATION_SENT");
    expect(onboardingStage({ ...base, invitation: { expiresAt: future, sentAt: new Date(), lastSendStatus: "SENT", openedAt: new Date() } }).stage).toBe("INVITATION_OPENED");
    expect(onboardingStage({ ...base, invitation: { expiresAt: future, lastSendStatus: "FAILED" } }).stage).toBe("INVITATION_FAILED");
    expect(onboardingStage({ ...base, invitation: { expiresAt: new Date(Date.now() - 1000), sentAt: new Date(), lastSendStatus: "SENT" } }).stage).toBe("INVITATION_EXPIRED");
  });
  it("après le dossier : informations à compléter, puis contrat à envoyer", () => {
    const done = { expiresAt: future, sentAt: new Date(), lastSendStatus: "SENT", completedAt: new Date() };
    expect(onboardingStage({ ...base, invitation: done, missingCount: 2 }).stage).toBe("INFO_TO_COMPLETE");
    expect(onboardingStage({ ...base, invitation: done, missingCount: 0 }).label).toBe("Dossier complété · contrat à envoyer");
  });
  it("dès qu'un contrat existe, le parcours contractuel commun fait foi", () => {
    expect(onboardingStage({ ...base, missingCount: 0, contract: { status: "SENT" } }).stage).toBe("CONTRACT_SENT");
    expect(onboardingStage({ prospectStatus: "ACTIVATED", missingCount: 0 }).stage).toBe("CLIENT_ACTIVE");
  });
});

describe("fiche du titulaire", () => {
  it("accepte une fiche complète, FINESS vide compris", () => {
    expect(onboardingSchema.safeParse(valid).success).toBe(true);
  });
  it("refuse un SIRET invalide, un code postal faux, zéro poste", () => {
    const r = onboardingSchema.safeParse({ ...valid, siret: "12345678901234", postalCode: "750", postCount: "0" });
    expect(r.success).toBe(false);
    const fields = r.success ? [] : r.error.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["siret", "postalCode", "postCount"]));
  });
  it("un FINESS fourni doit faire 9 chiffres", () => {
    expect(onboardingSchema.safeParse({ ...valid, finessNumber: "12" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...valid, finessNumber: "750 712 184" }).success).toBe(true);
  });
});

describe("e-mails d'inscription", () => {
  const url = "https://pharmaboost.app/inscription/abc";
  const invitation = buildPharmacyInvitationEmail(DEFAULT_EMAIL_CONTEXT, { url, expiresAt: new Date("2026-10-09T10:00:00Z") });
  it("invitation : titre, bouton, lien, échéance — sans emoji ni mot de passe", () => {
    expect(invitation.subject).toContain("Bienvenue chez PharmaBoost");
    expect(invitation.html).toContain("Configurer mon officine");
    expect(invitation.html).toContain(url);
    expect(invitation.text).toContain("9 octobre");
    expect(invitation.text.toLowerCase()).not.toContain("mot de passe");
    expect(/\p{Extended_Pictographic}/u.test(invitation.html + invitation.text + invitation.subject)).toBe(false);
  });
  it("dossier reçu : nomme l'officine et annonce le contrat", () => {
    const m = buildDossierReceivedEmail(DEFAULT_EMAIL_CONTEXT, { ownerName: "Claire", pharmacyName: "Pharmacie Centrale" });
    expect(m.subject).toContain("Pharmacie Centrale");
    expect(m.text).toContain("contrat");
    expect(/\p{Extended_Pictographic}/u.test(m.html)).toBe(false);
  });
});

describe("webhook Resend (signature Svix)", () => {
  const secret = "whsec_" + Buffer.from("secret-de-test-0123456789").toString("base64");
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
  const sign = (id: string, ts: string, b: string) => createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${ts}.${b}`).digest("base64");
  const now = new Date();
  const ts = String(Math.floor(now.getTime() / 1000));
  it("accepte une signature valide", () => {
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp: ts, signature: `v1,${sign("msg_1", ts, body)}`, body, now })).toBe(true);
  });
  it("refuse un corps modifié, une signature absente, un horodatage ancien", () => {
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp: ts, signature: `v1,${sign("msg_1", ts, body)}`, body: body + " ", now })).toBe(false);
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp: ts, signature: null, body, now })).toBe(false);
    const old = String(Math.floor(now.getTime() / 1000) - 3600);
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp: old, signature: `v1,${sign("msg_1", old, body)}`, body, now })).toBe(false);
  });
});
