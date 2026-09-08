import { describe, expect, it } from "vitest";
import { NotConfiguredSignatureProvider } from "../not-configured";
import { YousignSignatureProvider, mapYousignEvent, mapYousignStatus } from "../yousign";

describe("signature électronique", () => {
  it("sans prestataire, refuse explicitement au lieu de simuler", async () => {
    const provider = new NotConfiguredSignatureProvider();
    expect(provider.info.capability).toBe("NONE");
    await expect(provider.createEnvelope()).rejects.toThrow(/Aucun prestataire de signature/);
  });

  it("traduit les événements Yousign vers nos statuts", () => {
    expect(mapYousignEvent("signature_request.activated")).toBe("SENT");
    expect(mapYousignEvent("signer.link_opened")).toBe("OPENED");
    expect(mapYousignEvent("signer.done", "ongoing")).toBe("SIGNED_PHARMACY");
    expect(mapYousignEvent("signature_request.done")).toBe("FINALIZED");
    expect(mapYousignEvent("signature_request.declined")).toBe("REFUSED");
    expect(mapYousignEvent("signature_request.expired")).toBe("EXPIRED");
    expect(mapYousignEvent("something.else")).toBeNull();
    expect(mapYousignStatus("done")).toBe("FINALIZED");
  });

  it("enchaîne création, dépôt, signataires et activation sur l'API, et rapporte un refus tel quel", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url.replace("https://api-sandbox.yousign.app/v3", "")}`);
      const body = url.endsWith("/signers") ? { id: "sg", signature_link: "https://yousign.app/s/abc" } : { id: url.endsWith("/documents") ? "doc" : "sr_1" };
      return new Response(JSON.stringify(body), { status: 201 });
    };
    const provider = new YousignSignatureProvider({ apiKey: "k", environment: "sandbox" }, fetchImpl as never);
    const envelope = await provider.createEnvelope({
      reference: "PB-1",
      title: "Contrat",
      pdf: new Uint8Array([37, 80, 68, 70]),
      signers: [
        { role: "PHARMACY", firstName: "Claire", lastName: "Dumont", email: "c@x.fr" },
        { role: "COMPANY", firstName: "Adam", lastName: "Bavard", email: "a@x.fr" },
      ],
      expiresAt: new Date("2026-10-08"),
    });
    expect(envelope.envelopeId).toBe("sr_1");
    expect(envelope.signingUrls.PHARMACY).toBe("https://yousign.app/s/abc");
    expect(calls).toEqual(["POST /signature_requests", "POST /signature_requests/sr_1/documents", "POST /signature_requests/sr_1/signers", "POST /signature_requests/sr_1/signers", "POST /signature_requests/sr_1/activate"]);

    const refusing = new YousignSignatureProvider({ apiKey: "k", environment: "sandbox" }, (async () => new Response("quota", { status: 429 })) as never);
    await expect(refusing.getStatus("sr_1")).rejects.toThrow(/HTTP 429/);
  });
});
