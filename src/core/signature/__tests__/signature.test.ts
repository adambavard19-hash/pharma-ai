import { describe, expect, it } from "vitest";
import { NotConfiguredSignatureProvider } from "../not-configured";
import { YousignSignatureProvider, mapYousignEvent, mapYousignSigners, mapYousignStatus } from "../yousign";

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
    expect(mapYousignSigners(["signed", "notified"])).toBe("SIGNED_PHARMACY");
    expect(mapYousignSigners(["notified", "signed"])).toBe("SIGNED_COMPANY");
    expect(mapYousignSigners(["notified", "notified"])).toBe("SENT");
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

  it("n'accepte un webhook signé que si le HMAC du corps brut correspond", async () => {
    const secret = "s3cret";
    const body = JSON.stringify({ event_name: "signature_request.done", data: { signature_request: { id: "sr_9", status: "done" } }, event_time: "2026-09-08T10:00:00Z" });
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))).map((b) => b.toString(16).padStart(2, "0")).join("");
    const neverCalls = (async () => { throw new Error("l'API ne doit pas être appelée"); }) as never;
    const provider = new YousignSignatureProvider({ apiKey: "k", environment: "sandbox", webhookSecret: secret }, neverCalls);

    const event = await provider.parseWebhook(body, { "x-yousign-signature-256": `sha256=${digest}` });
    expect(event).toEqual({ envelopeId: "sr_9", status: "FINALIZED", occurredAt: new Date("2026-09-08T10:00:00Z"), verified: true });
    expect(await provider.parseWebhook(body, { "x-yousign-signature-256": "sha256=deadbeef" })).toBeNull();
    expect(await provider.parseWebhook(body, { "x-yousign-signature-256": null })).toBeNull();
    expect(await provider.parseWebhook(`${body} `, { "x-yousign-signature-256": `sha256=${digest}` })).toBeNull();
  });

  it("sans secret de webhook, marque l'événement comme non vérifié sans appeler l'API", async () => {
    const neverCalls = (async () => { throw new Error("l'API ne doit pas être appelée ici"); }) as never;
    const provider = new YousignSignatureProvider({ apiKey: "k", environment: "sandbox" }, neverCalls);
    const forged = JSON.stringify({ event_name: "signature_request.done", data: { signature_request: { id: "sr_9", status: "done" } } });
    const event = await provider.parseWebhook(forged, { "x-yousign-signature-256": null });
    expect(event).toMatchObject({ envelopeId: "sr_9", status: "FINALIZED", verified: false });
    expect(await provider.parseWebhook("pas du json", { "x-yousign-signature-256": null })).toBeNull();
  });

  it("relit les signataires quand la demande est en cours", async () => {
    const fetchImpl = async (url: string) => {
      if (url.endsWith("/signers")) return new Response(JSON.stringify([{ status: "signed" }, { status: "notified" }]), { status: 200 });
      return new Response(JSON.stringify({ status: "ongoing" }), { status: 200 });
    };
    const provider = new YousignSignatureProvider({ apiKey: "k", environment: "sandbox" }, fetchImpl as never);
    expect(await provider.getStatus("sr_1")).toBe("SIGNED_PHARMACY");
  });
});
