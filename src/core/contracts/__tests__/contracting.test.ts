import { describe, expect, it } from "vitest";
import { formatSiret, isValidSiret, nameKey, normalizeEmail, normalizePhone, normalizeSiret, personName, sirenOf } from "../identity";
import { missingCompanyFields, missingContractFields } from "../requirements";
import { journeyStage, journeyStepIndex } from "../journey";
import { DEFAULT_REMINDER_POLICY, nextReminderAction, sanitizePolicy } from "../reminders";
import { normalizeSubscriptionRequest } from "../subscription-request";
import { buildContractDocument } from "../template";

const DAY = 86_400_000;
const complete = { name: "Pharmacie du Port", legalName: "SELARL Pharmacie du Port", siret: "73282932000074", addressLine1: "1 quai", postalCode: "13002", city: "Marseille", ownerName: "Marc Delaunay", email: "marc@port.fr" };

describe("identité de l'officine", () => {
  it("contrôle le SIRET (14 chiffres, clé de Luhn) sans jamais le « corriger »", () => {
    expect(isValidSiret("732 829 320 00074")).toBe(true);
    expect(normalizeSiret("732 829 320 00074")).toBe("73282932000074");
    expect(isValidSiret("12345678900012")).toBe(false);
    expect(isValidSiret("7328293200007")).toBe(false);
    expect(normalizeSiret("123")).toBeNull();
    expect(sirenOf("73282932000074")).toBe("732829320");
    expect(formatSiret("73282932000074")).toBe("732 829 320 00074");
  });

  it("normalise e-mail, téléphone et noms", () => {
    expect(normalizeEmail("  Marc@Port.FR ")).toBe("marc@port.fr");
    expect(normalizeEmail("marc@port")).toBeNull();
    expect(normalizePhone("0491000000")).toBe("04 91 00 00 00");
    expect(normalizePhone("+33 4 91 00 00 00")).toBe("+33491000000");
    expect(normalizePhone("12")).toBeNull();
    expect(personName("jean-MARIE dupont")).toBe("Jean-Marie Dupont");
    expect(nameKey("Grande Pharmacie de la Gare")).toBe(nameKey("pharmacie  GARE"));
  });
});

describe("informations exigées par le contrat", () => {
  it("un dossier complet peut partir", () => {
    expect(missingContractFields(complete)).toEqual([]);
  });

  it("ne demande que ce qui manque, et signale ce qui est invalide", () => {
    const missing = missingContractFields({ ...complete, legalName: "", siret: "12345678900012", email: "pas-un-email" });
    expect(missing.map((m) => [m.field, m.reason])).toEqual([["legalName", "missing"], ["siret", "invalid"], ["email", "invalid"]]);
  });

  it("refuse une fiche société incomplète", () => {
    expect(missingCompanyFields(null)).toHaveLength(1);
    expect(missingCompanyFields({ legalName: "PharmaBoost", addressLine1: "10 rue", city: "Paris", siren: "123456789", representativeName: "Adam Bavard", representativeEmail: "contact@pharmaboost.app" })).toEqual([]);
    expect(missingCompanyFields({ legalName: "PharmaBoost", representativeName: "A", representativeEmail: "x" })).toContain("SIREN de la société");
  });
});

describe("parcours d'un dossier", () => {
  it("se déduit des faits, du prospect au client actif", () => {
    expect(journeyStage({ prospectStatus: "PROSPECT" })).toBe("PROSPECT");
    expect(journeyStage({ prospectStatus: "INTERESTED", contract: { status: "DRAFT" } })).toBe("CONTRACT_PREPARED");
    expect(journeyStage({ prospectStatus: "CONTRACT_SENT", contract: { status: "OPENED" } })).toBe("CONTRACT_VIEWED");
    expect(journeyStage({ prospectStatus: "CONTRACT_SENT", contract: { status: "SIGNED_PHARMACY" } })).toBe("SIGNING");
    expect(journeyStage({ prospectStatus: "CONTRACT_SIGNED", contract: { status: "FINALIZED", signedArchivedAt: null } })).toBe("SIGNED");
    expect(journeyStage({ prospectStatus: "CONTRACT_SIGNED", contract: { status: "FINALIZED", signedArchivedAt: new Date() } })).toBe("SUBSCRIPTION_PENDING");
    expect(journeyStage({ prospectStatus: "ACTIVATED", contract: { status: "FINALIZED", signedArchivedAt: new Date() } })).toBe("CLIENT_ACTIVE");
    expect(journeyStage({ prospectStatus: "CONTRACT_SENT", contract: { status: "REFUSED" } })).toBe("REFUSED");
    expect(journeyStepIndex("REFUSED")).toBe(-1);
  });
});

describe("relances d'un contrat non signé", () => {
  const sentAt = new Date("2026-10-01T09:00:00Z");
  const base = { status: "SENT", sentAt, reminderCount: 0, lastReminderAt: null, escalatedAt: null, expiresAt: new Date("2026-10-31T09:00:00Z") };
  const at = (days: number) => new Date(sentAt.getTime() + days * DAY);

  it("suit la cadence : rappel, second rappel, signalement, puis plus rien", () => {
    const p = DEFAULT_REMINDER_POLICY; // J+3, +4, +3
    expect(nextReminderAction(base, p, at(2))).toBeNull();
    expect(nextReminderAction(base, p, at(3))).toBe("REMIND");
    const once = { ...base, reminderCount: 1, lastReminderAt: at(3) };
    expect(nextReminderAction(once, p, at(6))).toBeNull();
    expect(nextReminderAction(once, p, at(7))).toBe("REMIND");
    const twice = { ...base, reminderCount: 2, lastReminderAt: at(7) };
    expect(nextReminderAction(twice, p, at(10))).toBe("ESCALATE");
    expect(nextReminderAction({ ...twice, escalatedAt: at(10) }, p, at(20))).toBeNull();
  });

  it("s'arrête net dès la signature, à l'expiration, ou si les relances sont coupées", () => {
    expect(nextReminderAction({ ...base, status: "SIGNED_PHARMACY" }, DEFAULT_REMINDER_POLICY, at(10))).toBeNull();
    expect(nextReminderAction({ ...base, status: "FINALIZED" }, DEFAULT_REMINDER_POLICY, at(10))).toBeNull();
    expect(nextReminderAction({ ...base, expiresAt: at(5) }, DEFAULT_REMINDER_POLICY, at(6))).toBeNull();
    expect(nextReminderAction(base, { ...DEFAULT_REMINDER_POLICY, enabled: false }, at(10))).toBeNull();
  });

  it("borne une règle saisie à la console", () => {
    expect(sanitizePolicy({ enabled: true, firstAfterDays: 0, secondAfterDays: 99, escalateAfterDays: "2" })).toEqual({ enabled: true, firstAfterDays: 1, secondAfterDays: 30, escalateAfterDays: 2 });
    expect(sanitizePolicy(null)).toEqual(DEFAULT_REMINDER_POLICY);
  });
});

describe("souscription depuis le site", () => {
  const input = { pharmacyName: " Pharmacie  du Port ", legalName: "SELARL Pharmacie du Port", siret: "732 829 320 00074", addressLine1: "1 quai", postalCode: "13002", city: "Marseille", phone: "0491000000", ownerFirstName: "marc", ownerLastName: "DELAUNAY", ownerTitle: "Pharmacien titulaire", ownerEmail: "Marc@Port.fr" };

  it("normalise les informations qui deviendront la référence du dossier", () => {
    const r = normalizeSubscriptionRequest(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ name: "Pharmacie du Port", siret: "73282932000074", ownerName: "Marc Delaunay", email: "marc@port.fr", phone: "04 91 00 00 00" });
  });

  it("refuse champ par champ ce qui est invalide", () => {
    const r = normalizeSubscriptionRequest({ ...input, siret: "123", ownerEmail: "marc@", postalCode: "130" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["ownerEmail", "postalCode", "siret"]);
  });
});

describe("modèle de contrat v2", () => {
  it("reprend raison sociale, qualité, SIRET lisible et premier mois offert", () => {
    const doc = buildContractDocument({
      reference: "PB-2026-PORT-V1",
      company: { legalName: "PharmaBoost", legalForm: "SAS", address: "10 rue de la Santé, 75013 Paris", siren: "123456789", representativeName: "Adam Bavard", representativeTitle: "Président", representativeEmail: "contact@pharmaboost.app" },
      pharmacy: { name: "Pharmacie du Port", legalName: "SELARL Pharmacie du Port", ownerName: "Marc Delaunay", ownerTitle: "Gérant", address: "1 quai, 13002 Marseille", siret: "73282932000074", email: "marc@port.fr" },
      terms: { monthlyPriceCents: 6900, durationMonths: 12, outletCount: 1, startDate: new Date("2026-10-02"), planName: "PharmaBoost Officine", trialDays: 30 },
    });
    const text = doc.sections.flatMap((s) => s.paragraphs).join("\n");
    expect(doc.templateKey).toBe("abonnement-pharmaboost-v2");
    expect(text).toContain("SELARL Pharmacie du Port, exploitant l'officine Pharmacie du Port");
    expect(text).toContain("SIRET 732 829 320 00074");
    expect(text).toContain("représentée par Marc Delaunay, Gérant");
    expect(text).toContain("Le premier mois d'abonnement est offert");
    expect(text).not.toContain("la Pharmacie ");
  });
});
