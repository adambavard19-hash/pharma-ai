import { describe, expect, it } from "vitest";
import { shouldApplySignatureStatus, signedContractKey } from "../progress";

describe("progression d'un contrat en signature", () => {
  it("avance, sans jamais reculer", () => {
    expect(shouldApplySignatureStatus("SENT", "OPENED")).toBe(true);
    expect(shouldApplySignatureStatus("OPENED", "SIGNED_PHARMACY")).toBe(true);
    // Le second signataire ouvre sa demande : le contrat reste « Signé pharmacie ».
    expect(shouldApplySignatureStatus("SIGNED_PHARMACY", "OPENED")).toBe(false);
    expect(shouldApplySignatureStatus("SIGNED_PHARMACY", "FINALIZED")).toBe(true);
    expect(shouldApplySignatureStatus("OPENED", "OPENED")).toBe(false);
  });

  it("applique refus et expiration, sauf sur un contrat finalisé", () => {
    expect(shouldApplySignatureStatus("SIGNED_PHARMACY", "REFUSED")).toBe(true);
    expect(shouldApplySignatureStatus("OPENED", "EXPIRED")).toBe(true);
    expect(shouldApplySignatureStatus("FINALIZED", "REFUSED")).toBe(false);
    expect(shouldApplySignatureStatus("REFUSED", "OPENED")).toBe(false);
  });

  it("range la version signée à côté du contrat", () => {
    expect(signedContractKey("plateforme/contrats/p1/PB-1.pdf")).toBe("plateforme/contrats/p1/PB-1-signe.pdf");
  });
});
