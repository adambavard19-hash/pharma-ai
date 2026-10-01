import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { signatureFieldPlacement } from "@/core/contracts/layout";
import { DOCUSEAL_SECRET_HEADER, DocusealSignatureProvider, mapDocusealEvent, mapDocusealSubmission } from "../docuseal";

async function a4Pdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595.28, 841.89]);
  return doc.save();
}

const neverCalls = (async () => {
  throw new Error("l'API ne doit pas être appelée");
}) as never;

describe("signature électronique — DocuSeal", () => {
  it("dépose le PDF en une requête, avec un champ par signataire en fractions de page, dans l'ordre pharmacie puis société", async () => {
    let sent: { url: string; init?: RequestInit } | null = null;
    const fetchImpl = async (url: string, init?: RequestInit) => {
      sent = { url, init };
      return new Response(
        JSON.stringify({ id: 42, submitters: [{ role: "Pharmacie", embed_src: "https://docuseal.eu/s/abc" }, { role: "PharmaBoost", embed_src: "https://docuseal.eu/s/def" }] }),
        { status: 200 },
      );
    };
    const provider = new DocusealSignatureProvider({ apiKey: "k", region: "eu" }, fetchImpl as never);
    const pdf = await a4Pdf(3);
    const envelope = await provider.createEnvelope({
      reference: "PB-1",
      title: "Contrat",
      pdf,
      signers: [
        { role: "PHARMACY", firstName: "Claire", lastName: "Dumont", email: "c@x.fr", field: signatureFieldPlacement(0, 2, 3), notify: false },
        { role: "COMPANY", firstName: "Adam", lastName: "Bavard", email: "a@x.fr", field: signatureFieldPlacement(1, 2, 3) },
      ],
      expiresAt: new Date("2026-10-08T12:00:00.000Z"),
    });

    expect(envelope).toEqual({ envelopeId: "42", signingUrls: { PHARMACY: "https://docuseal.eu/s/abc", COMPANY: "https://docuseal.eu/s/def" } });
    const request = sent as unknown as { url: string; init: RequestInit };
    expect(request.url).toBe("https://api.docuseal.eu/submissions/pdf");
    expect((request.init.headers as Record<string, string>)["X-Auth-Token"]).toBe("k");
    const body = JSON.parse(String(request.init.body));
    expect(body.order).toBe("preserved");
    expect(body.expire_at).toBe("2026-10-08 12:00:00 UTC");
    expect(body.submitters.map((s: { role: string; email: string }) => `${s.role}:${s.email}`)).toEqual(["Pharmacie:c@x.fr", "PharmaBoost:a@x.fr"]);
    // Le titulaire reçoit le lien dans l'e-mail PharmaBoost ; DocuSeal n'écrit qu'au signataire de la société.
    expect(body.submitters.map((s: { send_email: boolean }) => s.send_email)).toEqual([false, true]);
    expect(Buffer.from(body.documents[0].file, "base64").subarray(0, 4).toString()).toBe("%PDF");
    const [pharmacy, company] = body.documents[0].fields;
    expect(pharmacy).toMatchObject({ type: "signature", role: "Pharmacie", required: true });
    const area = pharmacy.areas[0];
    expect(area.page).toBe(3);
    // Les cases sont en bas de la page : fractions entre 0 et 1, origine en haut à gauche.
    for (const value of [area.x, area.y, area.w, area.h]) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
    expect(area.y).toBeGreaterThan(0.75);
    expect(company.areas[0].x).toBeGreaterThan(area.x + area.w);
  });

  it("rapporte un refus de l'API tel quel", async () => {
    const provider = new DocusealSignatureProvider({ apiKey: "k", region: "global" }, (async () => new Response("Unauthorized", { status: 401 })) as never);
    await expect(provider.getStatus("42")).rejects.toThrow(/DocuSeal a refusé \/submissions\/42 \(HTTP 401\)/);
  });

  it("traduit les statuts DocuSeal vers les nôtres", () => {
    expect(mapDocusealSubmission("completed", [])).toBe("FINALIZED");
    expect(mapDocusealSubmission("declined", [])).toBe("REFUSED");
    expect(mapDocusealSubmission("expired", [])).toBe("EXPIRED");
    expect(mapDocusealSubmission("pending", [{ role: "Pharmacie", status: "completed" }, { role: "PharmaBoost", status: "sent" }])).toBe("SIGNED_PHARMACY");
    expect(mapDocusealSubmission("pending", [{ role: "Pharmacie", status: "opened" }, { role: "PharmaBoost", status: "awaiting" }])).toBe("OPENED");
    expect(mapDocusealSubmission("pending", [{ role: "Pharmacie", status: "sent" }])).toBe("SENT");

    expect(mapDocusealEvent("form.viewed")).toBe("OPENED");
    expect(mapDocusealEvent("form.completed", { role: "PHARMACY", submissionStatus: "pending" })).toBe("SIGNED_PHARMACY");
    expect(mapDocusealEvent("form.completed", { role: "COMPANY", submissionStatus: "completed" })).toBe("FINALIZED");
    expect(mapDocusealEvent("form.declined")).toBe("REFUSED");
    expect(mapDocusealEvent("submission.completed")).toBe("FINALIZED");
    expect(mapDocusealEvent("submission.expired")).toBe("EXPIRED");
    expect(mapDocusealEvent("submission.created")).toBeNull();
  });

  it("n'accepte un webhook comme vérifié que s'il porte l'en-tête secret exact", async () => {
    const provider = new DocusealSignatureProvider({ apiKey: "k", region: "eu", webhookSecret: "s3cret" }, neverCalls);
    const body = JSON.stringify({ event_type: "form.declined", timestamp: "2026-10-01T10:00:00Z", data: { id: 7, role: "Pharmacie", decline_reason: "Prix", submission: { id: 42, status: "declined" } } });

    expect(await provider.parseWebhook(body, { [DOCUSEAL_SECRET_HEADER]: "s3cret" })).toEqual({
      envelopeId: "42",
      status: "REFUSED",
      occurredAt: new Date("2026-10-01T10:00:00Z"),
      role: "PHARMACY",
      reason: "Prix",
      verified: true,
    });
    expect(await provider.parseWebhook(body, { [DOCUSEAL_SECRET_HEADER]: "s3cre" })).toBeNull();
    expect(await provider.parseWebhook(body, { [DOCUSEAL_SECRET_HEADER]: null })).toBeNull();
  });

  it("sans secret, un webhook n'est qu'un signal non vérifié ; l'identifiant vient de la demande", async () => {
    const provider = new DocusealSignatureProvider({ apiKey: "k", region: "eu" }, neverCalls);
    const forged = JSON.stringify({ event_type: "submission.completed", data: { id: 42, status: "completed" } });
    expect(await provider.parseWebhook(forged, {})).toMatchObject({ envelopeId: "42", status: "FINALIZED", verified: false });
    expect(await provider.parseWebhook("pas du json", {})).toBeNull();
    expect(await provider.parseWebhook(JSON.stringify({ event_type: "template.created", data: { id: 1 } }), {})).toBeNull();
  });
});
