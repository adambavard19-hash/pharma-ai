import { describe, expect, it, vi } from "vitest";
import type { ConnectorOrder } from "@/core/partners/connector";
import {
  ApiConnector,
  AWAITING_PARTNER_API,
  B2bLinkConnector,
  buildConnector,
  EmailConnector,
  FormConnector,
  ImportExportConnector,
  ManualConnector,
  type EmailSender,
} from "../implementations";
import { composeLeadEmail, composeOrderEmail, orderTotalCents } from "../messages";

/**
 * Connecteurs partenaires côté officine : ce qui part chez le laboratoire, et
 * rien d'autre. La messagerie est injectée : aucun e-mail n'est envoyé ici.
 * Officine, codes et montants sont des valeurs de test, pas des données réelles.
 */

const ORDER: ConnectorOrder = {
  attributionCode: "PB-7K3M-Q9TD",
  pharmacy: { name: "Officine de test", city: "Lyon", finess: "690000000", email: "officine@test.invalid", phone: "04 00 00 00 00" },
  lines: [
    { name: "Crème test 50 ml", ean: "3760000000017", externalRef: "CT50", quantity: 6, unitPriceCents: 1230 },
    { name: "Baume test", ean: null, externalRef: null, quantity: 2, unitPriceCents: 800 },
  ],
  totalCents: 6 * 1230 + 2 * 800,
  note: "Livraison avant le 15, merci.",
};

function sender(status: "SENT" | "SIMULATED" | "FAILED", detail = "détail du fournisseur") {
  const calls: Parameters<EmailSender>[0][] = [];
  const send: EmailSender = vi.fn(async (email) => {
    calls.push(email);
    return { status, detail };
  });
  return { send, calls };
}

describe("composition de l'e-mail de commande", () => {
  const { subject, text } = composeOrderEmail(ORDER, { brandName: "Marque test" });

  it("porte l'officine, les lignes, le montant, la note et l'identifiant d'attribution", () => {
    expect(subject).toBe("Commande Marque test — Officine de test — PB-7K3M-Q9TD");
    for (const expected of ["Officine de test", "Lyon", "690000000", "officine@test.invalid", "04 00 00 00 00", "6 × Crème test 50 ml", "EAN 3760000000017", "réf. CT50", "2 × Baume test", "Livraison avant le 15, merci.", "PB-7K3M-Q9TD"]) {
      expect(text).toContain(expected);
    }
    expect(text).toMatch(/Montant : 89,80\s€/);
  });

  it("ne parle jamais de patient, d'ordonnance ni de conseil", () => {
    expect(`${subject}\n${text}`).not.toMatch(/patient|ordonnance|prescription|conseil|traitement/i);
  });

  it("dit « à confirmer » quand un prix professionnel manque, sans l'inventer", () => {
    const partial = { ...ORDER, lines: [{ ...ORDER.lines[0], unitPriceCents: null }], totalCents: null };
    const email = composeOrderEmail(partial, { brandName: "Marque test" });
    expect(email.text).toContain("Montant : à confirmer");
    expect(email.text).toContain("prix pro à confirmer");
  });

  it("n'accepte aucun retour à la ligne dans le sujet", () => {
    const email = composeOrderEmail({ ...ORDER, pharmacy: { ...ORDER.pharmacy, name: "Officine\r\nBcc: x@y.z" } }, { brandName: "Marque\ntest" });
    expect(email.subject).not.toMatch(/[\r\n]/);
  });
});

describe("montant d'une commande", () => {
  it("additionne les lignes quand chaque prix est connu", () => {
    expect(orderTotalCents(ORDER.lines)).toBe(8980);
  });

  it("reste inconnu si un seul prix manque, ou sans ligne", () => {
    expect(orderTotalCents([{ quantity: 1, unitPriceCents: 100 }, { quantity: 1, unitPriceCents: null }])).toBeNull();
    expect(orderTotalCents([])).toBeNull();
  });
});

describe("demande de contact", () => {
  it("transmet la personne à rappeler et le message, sans donnée de santé", () => {
    const { subject, text } = composeLeadEmail({
      attributionCode: "PB-2222-3333",
      brandName: "Marque test",
      pharmacy: ORDER.pharmacy,
      contactName: "Camille Test",
      contactEmail: "camille@test.invalid",
      contactPhone: null,
      message: "Pouvez-vous nous présenter la gamme ?",
    });
    expect(subject).toBe("Demande de contact Marque test — Officine de test — PB-2222-3333");
    expect(text).toContain("Camille Test");
    expect(text).toContain("Pouvez-vous nous présenter la gamme ?");
    expect(text).toContain("Téléphone : non renseigné");
    expect(text).not.toMatch(/patient|ordonnance|prescription|conseil|traitement/i);
  });
});

describe("connecteur E-mail", () => {
  it("transmet la commande quand l'envoi est réellement parti", async () => {
    const { send, calls } = sender("SENT");
    const connector = new EmailConnector({ to: "commandes@labo.invalid", brandName: "Marque test", send });
    const result = await connector.submitOrder(ORDER);
    expect(result).toEqual({ ok: true, data: { status: "TRANSMITTED", partnerReference: null, redirectUrl: null, detail: "Envoyée par e-mail à commandes@labo.invalid." } });
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe("commandes@labo.invalid");
    expect(calls[0].fromName).toBe("PharmaBoost Partenaires");
  });

  it("compte un envoi simulé ou échoué comme un échec, avec le motif réel", async () => {
    for (const status of ["SIMULATED", "FAILED"] as const) {
      const { send } = sender(status, "Aucun service d'envoi n'est configuré.");
      const result = await new EmailConnector({ to: "commandes@labo.invalid", brandName: "Marque test", send }).submitOrder(ORDER);
      expect(result).toEqual({ ok: false, reason: "failed", message: "Aucun service d'envoi n'est configuré." });
    }
  });

  it("n'envoie rien sans adresse", async () => {
    const { send } = sender("SENT");
    const connector = new EmailConnector({ to: "  ", brandName: "Marque test", send });
    expect(await connector.submitOrder(ORDER)).toMatchObject({ ok: false, reason: "not_configured" });
    expect(await connector.submitLead({ attributionCode: "PB-2222-3333", brandName: "Marque test", pharmacy: ORDER.pharmacy, contactName: null, contactEmail: null, contactPhone: null, message: null })).toMatchObject({ ok: false, reason: "not_configured" });
    expect(send).not.toHaveBeenCalled();
  });

  it("prend l'adresse de l'intégration, sinon le contact commandes", () => {
    const { send } = sender("SENT");
    const base = { mode: "EMAIL" as const, b2bUrlTemplate: null, formUrl: null };
    expect(buildConnector({ ...base, orderEmail: "integration@labo.invalid" }, { brandName: "M", fallbackOrderEmail: "contact@labo.invalid", send })).toBeInstanceOf(EmailConnector);
    expect(buildConnector({ ...base, orderEmail: null }, { brandName: "M", fallbackOrderEmail: null, send }).orderHandling).toBe("CONNECTOR");
  });
});

describe("connecteur API", () => {
  it("répond « en attente de l'API du partenaire » à tout, sans rien inventer", async () => {
    const api = new ApiConnector();
    expect(api.capabilities).toEqual([]);
    expect(api.orderHandling).toBe("NONE");
    const expected = { ok: false, reason: "unsupported", message: AWAITING_PARTNER_API };
    expect(await api.syncCatalog()).toEqual(expected);
    expect(await api.checkAvailability()).toEqual(expected);
    expect(await api.proPrices()).toEqual(expected);
    expect(await api.submitOrder()).toEqual(expected);
    expect(await api.orderStatus()).toEqual(expected);
    expect(await api.submitLead()).toEqual(expected);
    expect(AWAITING_PARTNER_API).toBe("En attente de l'API du partenaire");
  });
});

describe("modes sans transmission directe", () => {
  it("Manuel et Import / export laissent la transmission à l'équipe PharmaBoost", () => {
    for (const connector of [new ManualConnector(), new ImportExportConnector()]) {
      expect(connector.orderHandling).toBe("PHARMABOOST_TEAM");
      expect("submitOrder" in connector).toBe(false);
    }
  });

  it("le lien B2B porte l'identifiant d'attribution, en https seulement", () => {
    expect(new B2bLinkConnector("https://pro.labo.invalid/commande?ref={code}").redirectUrl("PB-7K3M-Q9TD")).toBe("https://pro.labo.invalid/commande?ref=PB-7K3M-Q9TD");
    expect(new B2bLinkConnector("https://pro.labo.invalid/commande").redirectUrl("PB-7K3M-Q9TD")).toBe("https://pro.labo.invalid/commande?pb=PB-7K3M-Q9TD");
    expect(new B2bLinkConnector("http://pro.labo.invalid/{code}").redirectUrl("PB-7K3M-Q9TD")).toBeNull();
    expect(new B2bLinkConnector(null).redirectUrl("PB-7K3M-Q9TD")).toBeNull();
  });

  it("le formulaire s'ouvre tel quel, en https seulement", () => {
    expect(new FormConnector("https://labo.invalid/contact").redirectUrl("PB-7K3M-Q9TD")).toBe("https://labo.invalid/contact");
    expect(new FormConnector("https://labo.invalid/contact?pb={code}").redirectUrl("PB-7K3M-Q9TD")).toBe("https://labo.invalid/contact?pb=PB-7K3M-Q9TD");
    expect(new FormConnector("javascript:alert(1)").redirectUrl("PB-7K3M-Q9TD")).toBeNull();
    expect(new FormConnector("").redirectUrl("PB-7K3M-Q9TD")).toBeNull();
  });
});
