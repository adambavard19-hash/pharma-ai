import { describe, expect, it } from "vitest";
import {
  INVOICE_FILE_MAX_BYTES,
  applyInvoiceGesture,
  canDeleteInvoice,
  commissionStatusAfterInvoiceGesture,
  compareInvoiceToCommissions,
  inspectInvoiceFile,
  invoiceFileProblem,
  invoiceGesturesFor,
  invoiceStorageKey,
  isInvoiceKeyOf,
  isInvoiceable,
  normalizeInvoiceNumber,
  parseEurosToCents,
  sanitizeInvoiceFileName,
  validateInvoiceDraft,
  validateReason,
  type InvoiceGesture,
  type InvoiceStatus,
} from "../invoice";

const NOW = new Date("2026-10-06T10:00:00Z");

describe("la machine d'états des factures", () => {
  it("reçue → validée → payée, et le refus depuis reçue ou validée", () => {
    expect(applyInvoiceGesture("RECEIVED", "APPROVE")).toEqual({ ok: true, to: "APPROVED" });
    expect(applyInvoiceGesture("APPROVED", "PAY")).toEqual({ ok: true, to: "PAID" });
    expect(applyInvoiceGesture("RECEIVED", "REJECT")).toEqual({ ok: true, to: "REJECTED" });
    expect(applyInvoiceGesture("APPROVED", "REJECT")).toEqual({ ok: true, to: "REJECTED" });
  });

  it("refuse tout le reste, avec une raison en français", () => {
    const refused: [InvoiceStatus, InvoiceGesture][] = [
      ["RECEIVED", "PAY"],
      ["APPROVED", "APPROVE"],
      ["PAID", "APPROVE"],
      ["PAID", "PAY"],
      ["PAID", "REJECT"],
      ["REJECTED", "APPROVE"],
      ["REJECTED", "PAY"],
      ["REJECTED", "REJECT"],
    ];
    for (const [status, gesture] of refused) {
      const result = applyInvoiceGesture(status, gesture);
      expect(result.ok, `${status} ${gesture}`).toBe(false);
      expect(!result.ok && result.error.length).toBeGreaterThan(10);
    }
  });

  it("on ne paie jamais une facture non validée", () => {
    expect(applyInvoiceGesture("RECEIVED", "PAY")).toEqual({ ok: false, error: "Validez d'abord la facture : on ne paie qu'une facture validée." });
  });

  it("propose à l'écran uniquement les gestes possibles", () => {
    expect(invoiceGesturesFor("RECEIVED")).toEqual(["APPROVE", "REJECT"]);
    expect(invoiceGesturesFor("APPROVED")).toEqual(["PAY", "REJECT"]);
    expect(invoiceGesturesFor("PAID")).toEqual([]);
    expect(invoiceGesturesFor("REJECTED")).toEqual([]);
  });

  it("ne supprime que ce qui n'a rien déclenché", () => {
    expect(canDeleteInvoice("RECEIVED")).toBe(true);
    expect(canDeleteInvoice("REJECTED")).toBe(true);
    expect(canDeleteInvoice("APPROVED")).toBe(false);
    expect(canDeleteInvoice("PAID")).toBe(false);
  });
});

describe("l'effet d'un geste sur les commissions rattachées", () => {
  it("valider met à payer, sans toucher au payé ni à l'annulé", () => {
    expect(commissionStatusAfterInvoiceGesture("APPROVE", "RECEIVED", "EARNED")).toBe("PAYABLE");
    expect(commissionStatusAfterInvoiceGesture("APPROVE", "RECEIVED", "FORECAST")).toBe("PAYABLE");
    expect(commissionStatusAfterInvoiceGesture("APPROVE", "RECEIVED", "PAYABLE")).toBe("PAYABLE");
    expect(commissionStatusAfterInvoiceGesture("APPROVE", "RECEIVED", "PAID")).toBe("PAID");
    expect(commissionStatusAfterInvoiceGesture("APPROVE", "RECEIVED", "CANCELLED")).toBe("CANCELLED");
  });

  it("payer met payée, jamais l'inverse", () => {
    expect(commissionStatusAfterInvoiceGesture("PAY", "APPROVED", "PAYABLE")).toBe("PAID");
    expect(commissionStatusAfterInvoiceGesture("PAY", "APPROVED", "EARNED")).toBe("PAID");
    expect(commissionStatusAfterInvoiceGesture("PAY", "APPROVED", "PAID")).toBe("PAID");
    expect(commissionStatusAfterInvoiceGesture("PAY", "APPROVED", "CANCELLED")).toBe("CANCELLED");
  });

  it("refuser une facture validée remet à « acquise » ce que la validation avait mis à payer", () => {
    expect(commissionStatusAfterInvoiceGesture("REJECT", "APPROVED", "PAYABLE")).toBe("EARNED");
    expect(commissionStatusAfterInvoiceGesture("REJECT", "APPROVED", "PAID")).toBe("PAID");
  });

  it("refuser une facture seulement reçue ne change aucun statut", () => {
    expect(commissionStatusAfterInvoiceGesture("REJECT", "RECEIVED", "PAYABLE")).toBe("PAYABLE");
    expect(commissionStatusAfterInvoiceGesture("REJECT", "RECEIVED", "EARNED")).toBe("EARNED");
  });

  it("une facture ne peut réclamer qu'une commission acquise ou à payer, libre de toute facture", () => {
    expect(isInvoiceable({ status: "EARNED", invoiceId: null })).toBe(true);
    expect(isInvoiceable({ status: "PAYABLE", invoiceId: null })).toBe(true);
    expect(isInvoiceable({ status: "FORECAST", invoiceId: null })).toBe(false);
    expect(isInvoiceable({ status: "PAID", invoiceId: null })).toBe(false);
    expect(isInvoiceable({ status: "CANCELLED", invoiceId: null })).toBe(false);
    expect(isInvoiceable({ status: "EARNED", invoiceId: "inv_1" })).toBe(false);
  });
});

describe("le rapprochement avec les commissions", () => {
  it("dit quand le montant correspond", () => {
    const gap = compareInvoiceToCommissions(75_000, 75_000, 3);
    expect(gap.kind).toBe("MATCH");
    expect(gap.differenceCents).toBe(0);
    expect(gap.message).toContain("correspond");
  });

  it("signale un écart en plus, en clair et en euros", () => {
    const gap = compareInvoiceToCommissions(80_000, 75_000, 3);
    expect(gap.kind).toBe("HIGHER");
    expect(gap.differenceCents).toBe(5_000);
    expect(gap.message).toBe("La facture (800,00 €) dépasse de 50,00 € le total des commissions rattachées (750,00 €). Vérifiez avant de la valider.");
  });

  it("signale un écart en moins", () => {
    const gap = compareInvoiceToCommissions(70_050, 75_000, 3);
    expect(gap.kind).toBe("LOWER");
    expect(gap.differenceCents).toBe(-4_950);
    expect(gap.message).toBe("La facture (700,50 €) est inférieure de 49,50 € au total des commissions rattachées (750,00 €).");
  });

  it("sans commission rattachée, dit que rien n'est vérifié (jamais une erreur)", () => {
    const gap = compareInvoiceToCommissions(75_000, 0, 0);
    expect(gap.kind).toBe("NO_COMMISSION");
    expect(gap.message).toContain("n'est pas vérifié");
  });
});

describe("le montant tapé", () => {
  it("lit les écritures courantes en centimes", () => {
    expect(parseEurosToCents("1250,50")).toBe(125_050);
    expect(parseEurosToCents("1 250,50")).toBe(125_050);
    expect(parseEurosToCents("1 250.5")).toBe(125_050);
    expect(parseEurosToCents("300 €")).toBe(30_000);
    expect(parseEurosToCents("0,07")).toBe(7);
    expect(parseEurosToCents("12")).toBe(1_200);
  });

  it("refuse l'illisible, le négatif et plus de deux décimales", () => {
    for (const bad of ["", "abc", "-5", "12,345", "1,2,3", "12,", ",5", "1e3"]) expect(parseEurosToCents(bad), bad).toBeNull();
  });
});

describe("le numéro de facture", () => {
  it("nettoie les espaces et borne la longueur", () => {
    expect(normalizeInvoiceNumber("  FA-2026   014 ")).toBe("FA-2026 014");
    expect(normalizeInvoiceNumber("   ")).toBeNull();
    expect(normalizeInvoiceNumber("x".repeat(41))).toBeNull();
    expect(normalizeInvoiceNumber("x".repeat(40))).toBe("x".repeat(40));
  });
});

describe("la saisie d'une facture reçue", () => {
  const valid = { number: " FA-014 ", amount: "750,00", issuedOn: "2026-10-01", periodLabel: " Septembre 2026 ", note: " Reçue par e-mail " };

  it("accepte une saisie complète, la date rangée à midi UTC", () => {
    const result = validateInvoiceDraft(valid, NOW);
    expect(result).toEqual({ ok: true, value: { number: "FA-014", amountCents: 75_000, issuedAt: new Date("2026-10-01T12:00:00Z"), periodLabel: "Septembre 2026", note: "Reçue par e-mail" } });
  });

  it("période et note sont facultatives", () => {
    const result = validateInvoiceDraft({ number: "1", amount: "10", issuedOn: "2026-10-06" }, NOW);
    expect(result).toMatchObject({ ok: true, value: { periodLabel: null, note: null } });
  });

  it("donne une erreur par champ, en français", () => {
    const result = validateInvoiceDraft({ number: " ", amount: "zéro", issuedOn: "", periodLabel: "p".repeat(61), note: "n".repeat(501) }, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(["amount", "issuedOn", "note", "number", "periodLabel"]);
      expect(result.errors.number).toBe("Indiquez le numéro de la facture.");
    }
  });

  it("refuse un montant nul ou démesuré", () => {
    expect(validateInvoiceDraft({ ...valid, amount: "0" }, NOW)).toMatchObject({ ok: false, errors: { amount: "Le montant doit être supérieur à zéro." } });
    expect(validateInvoiceDraft({ ...valid, amount: "100000,01" }, NOW)).toMatchObject({ ok: false, errors: { amount: expect.stringContaining("100 000") } });
    expect(validateInvoiceDraft({ ...valid, amount: "100000" }, NOW).ok).toBe(true);
  });

  it("refuse une date impossible, future ou lointaine, mais pas celle d'aujourd'hui ni de demain matin", () => {
    expect(validateInvoiceDraft({ ...valid, issuedOn: "2026-02-30" }, NOW)).toMatchObject({ ok: false, errors: { issuedOn: "Cette date n'existe pas." } });
    expect(validateInvoiceDraft({ ...valid, issuedOn: "2026-10-09" }, NOW)).toMatchObject({ ok: false, errors: { issuedOn: expect.stringContaining("futur") } });
    expect(validateInvoiceDraft({ ...valid, issuedOn: "2019-12-31" }, NOW)).toMatchObject({ ok: false, errors: { issuedOn: expect.stringContaining("ancienne") } });
    expect(validateInvoiceDraft({ ...valid, issuedOn: "2026-10-06" }, NOW).ok).toBe(true);
    expect(validateInvoiceDraft({ ...valid, issuedOn: "2026-10-07" }, NOW).ok).toBe(true);
  });

  it("le motif : 5 caractères au moins, 500 au plus, espaces nettoyés", () => {
    expect(validateReason("  Montant   erroné ")).toEqual({ ok: true, reason: "Montant erroné" });
    expect(validateReason("non")).toMatchObject({ ok: false });
    expect(validateReason(null)).toMatchObject({ ok: false });
    expect(validateReason("m".repeat(501))).toMatchObject({ ok: false });
  });
});

describe("le fichier de la facture", () => {
  const pdf = (size: number) => {
    const bytes = new Uint8Array(size);
    bytes.set(new TextEncoder().encode("%PDF-1.7\n"));
    return bytes;
  };

  it("accepte un vrai PDF, le nom assaini", () => {
    expect(inspectInvoiceFile(pdf(2_000), "../../Facture <Marie> n°14.PDF")).toEqual({ ok: true, fileName: "Facture Marie n 14.pdf", sizeBytes: 2_000 });
  });

  it("la signature fait foi, pas le nom ni le type annoncé", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(inspectInvoiceFile(html, "facture.pdf")).toMatchObject({ ok: false, error: expect.stringContaining("pas un PDF") });
    expect(inspectInvoiceFile(new TextEncoder().encode("  %PDF-1.4"), "facture.pdf").ok).toBe(false);
  });

  it("refuse le vide et plus de 5 Mo", () => {
    expect(inspectInvoiceFile(new Uint8Array(0), "f.pdf")).toEqual({ ok: false, error: "Ce fichier est vide." });
    expect(inspectInvoiceFile(pdf(INVOICE_FILE_MAX_BYTES + 1), "f.pdf")).toEqual({ ok: false, error: "Ce fichier dépasse 5 Mo. Choisissez un PDF plus léger." });
    expect(inspectInvoiceFile(pdf(INVOICE_FILE_MAX_BYTES), "f.pdf").ok).toBe(true);
  });

  it("le contrôle du navigateur est rapide mais jamais le dernier mot", () => {
    expect(invoiceFileProblem({ name: "f.pdf", size: 10, type: "application/pdf" })).toBeNull();
    expect(invoiceFileProblem({ name: "f.png", size: 10, type: "image/png" })).toBe("La facture doit être un fichier PDF.");
    expect(invoiceFileProblem({ name: "f.pdf", size: 0 })).toBe("Ce fichier est vide.");
    expect(invoiceFileProblem({ name: "f.pdf", size: INVOICE_FILE_MAX_BYTES + 1 })).toContain("5 Mo");
  });

  it("le nom par défaut, quand il ne reste rien", () => {
    expect(sanitizeInvoiceFileName("///")).toBe("facture.pdf");
    expect(sanitizeInvoiceFileName("***.pdf")).toBe("facture.pdf");
  });

  it("la clé de rangement est celle de la facture, et seulement la sienne", () => {
    expect(invoiceStorageKey("inv_1")).toBe("sales-invoices/inv_1/facture.pdf");
    expect(isInvoiceKeyOf("inv_1", "sales-invoices/inv_1/facture.pdf")).toBe(true);
    expect(isInvoiceKeyOf("inv_1", "sales-invoices/inv_2/facture.pdf")).toBe(false);
    expect(isInvoiceKeyOf("inv_1", "sales-invoices/inv_1/../inv_2/facture.pdf")).toBe(false);
    expect(isInvoiceKeyOf("inv_1", "pharmacy_9/ordonnance.pdf")).toBe(false);
    expect(isInvoiceKeyOf("inv_1", null)).toBe(false);
  });
});
