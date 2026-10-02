import { describe, expect, it, vi } from "vitest";

// Fonctions pures uniquement : ni base ni session.
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: {} }));

const partners = await import("../partners");
const applications = await import("../applications");

describe("normalisation des saisies partenaire", () => {
  it("site : ajoute https, refuse les autres protocoles", () => {
    expect(partners.normalizeWebsite("exemple.fr")).toEqual({ ok: true, value: "https://exemple.fr/" });
    expect(partners.normalizeWebsite("")).toEqual({ ok: true, value: null });
    expect(partners.normalizeWebsite("javascript:alert(1)").ok).toBe(false);
    expect(partners.normalizeWebsite("ftp://exemple.fr").ok).toBe(false);
  });

  it("logo et formulaire : https strict", () => {
    expect(partners.normalizeHttpsUrl("https://cdn.exemple.fr/logo.png")).toEqual({ ok: true, value: "https://cdn.exemple.fr/logo.png" });
    expect(partners.normalizeHttpsUrl("http://cdn.exemple.fr/logo.png").ok).toBe(false);
  });

  it("identité : nom requis, fin après début, univers inconnus écartés", () => {
    const bad = partners.normalizePartnerIdentity({ name: " ", startsAt: "2026-10-10", endsAt: "2026-10-01" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.fieldErrors.name).toBeDefined();
      expect(bad.fieldErrors.endsAt).toBeDefined();
    }
    const good = partners.normalizePartnerIdentity({ name: "  Marque  ", universes: ["DOULEUR", "INCONNU", "DOULEUR"], startsAt: "2026-10-01" });
    expect(good.ok && good.data.name).toBe("Marque");
    expect(good.ok && good.data.universes).toEqual(["DOULEUR"]);
    expect(good.ok && good.data.startsAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("dates : format strict, jour réel", () => {
    expect(partners.parseDateInput("2026-02-30")).toBeUndefined();
    expect(partners.parseDateInput("01/10/2026")).toBeUndefined();
    expect(partners.parseDateInput("")).toBeNull();
  });

  it("montants et pourcentages", () => {
    expect(partners.parseEurosToCents("1 250,50")).toBe(125050);
    expect(partners.parseEurosToCents("12")).toBe(1200);
    expect(partners.parseEurosToCents("-3")).toBeUndefined();
    expect(partners.parseEurosToCents("abc")).toBeUndefined();
    expect(partners.parsePercent("7,5")).toBe(7.5);
    expect(partners.parsePercent("150")).toBeUndefined();
  });

  it("contact : un destinataire des commandes a besoin d'un e-mail", () => {
    const result = partners.normalizeContact({ firstName: "A", lastName: "B", isPrimary: false, receivesOrders: true });
    expect(result.ok).toBe(false);
    const ok = partners.normalizeContact({ firstName: "A", lastName: "B", email: " Contact@Exemple.FR ", isPrimary: true, receivesOrders: true });
    expect(ok.ok && ok.data.email).toBe("contact@exemple.fr");
  });

  it("contrat : chaque type ne garde que ses montants", () => {
    const flat = partners.normalizeContract({ type: "FLAT_FEE", fixedAmount: "500", commissionPercent: "10" });
    expect(flat.ok && flat.data).toMatchObject({ fixedAmountCents: 50000, commissionPercent: null });
    const pilot = partners.normalizeContract({ type: "PILOT", fixedAmount: "500" });
    expect(pilot.ok && pilot.data.fixedAmountCents).toBeNull();
    expect(partners.normalizeContract({ type: "COMMISSION" }).ok).toBe(false);
    expect(partners.normalizeContract({ type: "HYBRID", commissionPercent: "5" }).ok).toBe(false);
    expect(partners.normalizeContract({ type: "INCONNU" }).ok).toBe(false);
  });

  it("intégration : https obligatoire, donnée requise si active, capacités connues seulement", () => {
    expect(partners.normalizeIntegration({ mode: "B2B_LINK", isActive: true }).ok).toBe(false);
    expect(partners.normalizeIntegration({ mode: "B2B_LINK", isActive: false, b2bUrlTemplate: "http://b2b.exemple.fr/?r={code}" }).ok).toBe(false);
    const ok = partners.normalizeIntegration({ mode: "B2B_LINK", isActive: true, b2bUrlTemplate: "https://b2b.exemple.fr/?r={code}", capabilities: ["ATTRIBUTION", "INVENTEE"] });
    expect(ok.ok && ok.data.capabilities).toEqual(["ATTRIBUTION"]);
    expect(partners.normalizeIntegration({ mode: "EMAIL", isActive: true }).ok).toBe(false);
    expect(partners.normalizeIntegration({ mode: "API", isActive: false }).ok).toBe(true);
    expect(partners.normalizeIntegration({ mode: "FTP", isActive: false }).ok).toBe(false);
  });
});

describe("slug, contrat en cours, volume attribué", () => {
  it("slug unique par suffixe", () => {
    expect(partners.pickUniqueSlug("Laboratoire Exemple", [])).toBe("laboratoire-exemple");
    expect(partners.pickUniqueSlug("Laboratoire Exemple", ["laboratoire-exemple", "laboratoire-exemple-2"])).toBe("laboratoire-exemple-3");
    expect(partners.pickUniqueSlug("!!!", [])).toBe("partenaire");
  });

  it("le contrat en cours couvre aujourd'hui, fin incluse", () => {
    const at = new Date("2026-10-02T12:00:00Z");
    const old = { id: "a", startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: new Date("2026-06-30T00:00:00Z"), createdAt: new Date("2026-01-01T00:00:00Z") };
    const today = { id: "b", startsAt: new Date("2026-09-01T00:00:00Z"), endsAt: new Date("2026-10-02T00:00:00Z"), createdAt: new Date("2026-09-01T00:00:00Z") };
    expect(partners.currentContractOf([old, today], at)?.id).toBe("b");
    expect(partners.currentContractOf([old], at)).toBeNull();
  });

  it("volume : total de la commande, sinon ses lignes chiffrées ; jamais de montant supposé", () => {
    const orders = [
      { createdAt: new Date("2026-10-01T10:00:00Z"), totalCents: 10000, lines: [{ quantity: 4, unitPriceCents: null }] },
      { createdAt: new Date("2026-10-01T11:00:00Z"), totalCents: null, lines: [{ quantity: 2, unitPriceCents: 500 }] },
      { createdAt: new Date("2026-10-01T12:00:00Z"), totalCents: null, lines: [{ quantity: 3, unitPriceCents: null }] },
      { createdAt: new Date("2025-01-01T12:00:00Z"), totalCents: 99999, lines: [] },
    ];
    expect(partners.attributedVolume(orders, new Date("2026-09-01T00:00:00Z"), null)).toEqual({ amountCents: 11000, units: 9, count: 3, unpriced: 1 });
    expect(partners.attributedVolume([], null, null)).toEqual({ amountCents: 0, units: 0, count: 0, unpriced: 0 });
  });
});

describe("candidatures", () => {
  it("la fiche partenaire reprend la marque, la société et le contact", () => {
    const draft = applications.partnerDraftFromApplication({
      company: "Société Exemple SAS",
      brand: "  ",
      website: "exemple.fr",
      universes: ["BEBE", "NON_LISTE"],
      contactFirstName: "Camille",
      contactLastName: "Martin",
      contactRole: null,
      email: "Camille@Exemple.fr",
      phone: null,
    });
    expect(draft.identity).toMatchObject({ name: "Société Exemple SAS", legalName: "Société Exemple SAS", website: "https://exemple.fr/", universes: ["BEBE"] });
    expect(draft.contact.email).toBe("camille@exemple.fr");
  });

  it("historique : réception d'abord, accusé et événements dans l'ordre, auteur nommé", () => {
    const created = new Date("2026-10-01T08:00:00Z");
    const timeline = applications.buildTimeline(
      { id: "app", createdAt: created, acknowledgedAt: new Date("2026-10-01T08:00:05Z") },
      [
        { id: "e2", kind: "NOTE", fromStatus: null, toStatus: null, note: "Rappeler", platformAdminId: "adm", createdAt: new Date("2026-10-02T09:00:00Z") },
        { id: "e1", kind: "STATUS_CHANGED", fromStatus: "NEW", toStatus: "REVIEWING", note: null, platformAdminId: "inconnu", createdAt: new Date("2026-10-01T09:00:00Z") },
      ],
      new Map([["adm", "Admin Exemple"]]),
    );
    expect(timeline.map((entry) => entry.kind)).toEqual(["RECEIVED", "ACKNOWLEDGED", "STATUS_CHANGED", "NOTE"]);
    expect(timeline[2].author).toBeNull();
    expect(timeline[3].author).toBe("Admin Exemple");
  });

  it("historique : un événement de réception existant n'est pas doublé", () => {
    const timeline = applications.buildTimeline(
      { id: "app", createdAt: new Date("2026-10-01T08:00:00Z"), acknowledgedAt: null },
      [{ id: "r", kind: "RECEIVED", fromStatus: null, toStatus: "NEW", note: null, platformAdminId: null, createdAt: new Date("2026-10-01T08:00:00Z") }],
      new Map(),
    );
    expect(timeline).toHaveLength(1);
  });
});
