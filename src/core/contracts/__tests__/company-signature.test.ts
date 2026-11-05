import { describe, expect, it } from "vitest";
import { COMPANY_SIGNATURE_MAX_BYTES, parseSignatureImage, readCompanySignature } from "../countersignature";

describe("la signature déposée de la société (fondateur, 5 nov. 2026)", () => {
  it("accepte une image PNG ou JPEG en data URL, refuse le reste", () => {
    expect(parseSignatureImage("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(parseSignatureImage("data:image/jpeg;base64,/9j/4AAQ")).toBe("data:image/jpeg;base64,/9j/4AAQ");
    expect(parseSignatureImage("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(parseSignatureImage("https://exemple.fr/signature.png")).toBeNull();
    expect(parseSignatureImage("data:image/png;base64,")).toBeNull();
    expect(parseSignatureImage(42)).toBeNull();
  });

  it("refuse une image trop lourde", () => {
    const heavy = `data:image/png;base64,${"A".repeat(Math.ceil((COMPANY_SIGNATURE_MAX_BYTES + 10) * (4 / 3)))}`;
    expect(parseSignatureImage(heavy)).toBeNull();
  });

  it("relit le réglage : sans image valide, pas de signature automatique", () => {
    expect(readCompanySignature({ image: "data:image/png;base64,iVBORw0KGgo=", uploadedAt: "2026-11-05T10:00:00.000Z" })).toEqual({ image: "data:image/png;base64,iVBORw0KGgo=", uploadedAt: "2026-11-05T10:00:00.000Z" });
    expect(readCompanySignature(null)).toBeNull();
    expect(readCompanySignature({ image: "pas une image" })).toBeNull();
  });
});
