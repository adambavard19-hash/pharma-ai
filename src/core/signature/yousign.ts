import type { SignatureEnvelope, SignatureEvent, SignatureProvider, SignatureProviderInfo, SignatureSigner, SignatureStatus } from "./ports";

/**
 * Yousign (API v3).
 *
 * Flux : créer la demande → déposer le PDF → ajouter les signataires avec un
 * champ de signature → activer. Les événements arrivent ensuite par webhook,
 * vérifié par sa signature HMAC. Aucune dépendance : l'API tient en quelques
 * requêtes HTTPS. L'adaptateur ne masque jamais un refus du prestataire.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const HOSTS = { sandbox: "https://api-sandbox.yousign.app/v3", production: "https://api.yousign.app/v3" } as const;

export class YousignSignatureProvider implements SignatureProvider {
  readonly info: SignatureProviderInfo;
  private readonly base: string;

  constructor(
    private readonly config: { apiKey: string; environment: "sandbox" | "production"; webhookSecret?: string | null },
    private readonly fetchImpl: FetchLike = globalThis.fetch,
  ) {
    this.base = HOSTS[config.environment];
    this.info = {
      id: "yousign",
      label: `Yousign (${config.environment === "sandbox" ? "bac à sable" : "production"})`,
      capability: "LIVE",
      description: "Les contrats sont envoyés pour signature électronique via Yousign ; chaque événement est reçu par webhook.",
    };
  }

  private async call<T>(path: string, init: RequestInit & { raw?: boolean } = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.config.apiKey}`, ...(init.raw ? {} : { "Content-Type": "application/json" }), ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Yousign a refusé ${path} (HTTP ${response.status})${body ? ` : ${body.slice(0, 300)}` : ""}`);
    }
    return (await response.json()) as T;
  }

  async createEnvelope(input: { reference: string; title: string; pdf: Uint8Array; signers: SignatureSigner[]; expiresAt: Date }): Promise<SignatureEnvelope> {
    const request = await this.call<{ id: string }>("/signature_requests", {
      method: "POST",
      body: JSON.stringify({
        name: `${input.title} — ${input.reference}`,
        delivery_mode: "email",
        timezone: "Europe/Paris",
        expiration_date: input.expiresAt.toISOString().slice(0, 10),
        external_id: input.reference,
      }),
    });

    const form = new FormData();
    form.set("file", new Blob([Buffer.from(input.pdf)], { type: "application/pdf" }), `${input.reference}.pdf`);
    form.set("nature", "signable_document");
    const document = await this.call<{ id: string }>(`/signature_requests/${request.id}/documents`, { method: "POST", body: form, raw: true });

    const signingUrls: SignatureEnvelope["signingUrls"] = {};
    for (const [index, signer] of input.signers.entries()) {
      const created = await this.call<{ id: string; signature_link?: string }>(`/signature_requests/${request.id}/signers`, {
        method: "POST",
        body: JSON.stringify({
          info: { first_name: signer.firstName, last_name: signer.lastName, email: signer.email, phone_number: signer.phone ?? undefined, locale: "fr" },
          signature_level: "electronic_signature",
          signature_authentication_mode: "no_otp",
          fields: [{ document_id: document.id, type: "signature", ...(signer.field ?? { page: 1, x: 60 + index * 260, y: 700, width: 180, height: 60 }) }],
        }),
      });
      if (created.signature_link) signingUrls[signer.role] = created.signature_link;
    }

    await this.call(`/signature_requests/${request.id}/activate`, { method: "POST" });
    return { envelopeId: request.id, signingUrls };
  }

  /**
   * L'état courant. Tant que la demande est en cours, on regarde les signataires
   * un à un : le premier déclaré est la pharmacie, le second la société.
   */
  async getStatus(envelopeId: string): Promise<SignatureStatus> {
    const request = await this.call<{ status: string }>(`/signature_requests/${envelopeId}`);
    const mapped = mapYousignStatus(request.status);
    if (mapped !== "SENT") return mapped;
    const signers = await this.call<{ status?: string }[] | { data?: { status?: string }[] }>(`/signature_requests/${envelopeId}/signers`).catch(() => []);
    const list = Array.isArray(signers) ? signers : signers.data ?? [];
    return mapYousignSigners(list.map((signer) => signer.status ?? ""));
  }

  /**
   * Avec un secret de webhook, la notification est authentifiée par HMAC sur le
   * corps brut et son contenu fait foi (`verified: true`). Sans secret, elle
   * n'est qu'un signal (`verified: false`) : le service relit le statut chez
   * Yousign, parce qu'une notification non authentifiée ne doit jamais
   * finaliser un contrat.
   */
  async parseWebhook(rawBody: string, headers: Record<string, string | null>): Promise<SignatureEvent | null> {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const event = payload as { event_name?: string; data?: { signature_request?: { id?: string; status?: string }; signer?: { info?: { email?: string } } }; event_time?: string };
    const envelopeId = event.data?.signature_request?.id;
    if (!envelopeId || !event.event_name) return null;
    const occurredAt = event.event_time ? new Date(event.event_time) : new Date();

    const status = mapYousignEvent(event.event_name, event.data?.signature_request?.status);
    if (!status) return null;

    if (this.config.webhookSecret) {
      const signature = headers["x-yousign-signature-256"];
      if (!signature || !(await verifyHmac(this.config.webhookSecret, rawBody, signature))) return null;
      return { envelopeId, status, occurredAt, verified: true };
    }
    // Sans secret : l'événement n'est qu'un signal ; le statut sera relu chez Yousign.
    return { envelopeId, status, occurredAt, verified: false };
  }

  async downloadSigned(envelopeId: string): Promise<Uint8Array | null> {
    const response = await this.fetchImpl(`${this.base}/signature_requests/${envelopeId}/documents/download`, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  }
}

export function mapYousignStatus(status: string): SignatureStatus {
  switch (status) {
    case "ongoing":
      return "SENT";
    case "done":
      return "FINALIZED";
    case "declined":
    case "rejected":
      return "REFUSED";
    case "expired":
    case "canceled":
      return "EXPIRED";
    default:
      return "SENT";
  }
}

/** Statuts des signataires dans l'ordre de déclaration (pharmacie, société), quand la demande est en cours. */
export function mapYousignSigners(statuses: string[]): SignatureStatus {
  const [pharmacy, company] = statuses;
  if (pharmacy === "signed") return "SIGNED_PHARMACY";
  if (company === "signed") return "SIGNED_COMPANY";
  if (statuses.some((status) => status === "notified" || status === "processing")) return "SENT";
  return "SENT";
}

export function mapYousignEvent(eventName: string, requestStatus?: string): SignatureStatus | null {
  switch (eventName) {
    case "signature_request.activated":
      return "SENT";
    case "signer.notified":
    case "signer.link_opened":
      return "OPENED";
    case "signer.done":
      return requestStatus === "done" ? "FINALIZED" : "SIGNED_PHARMACY";
    case "signature_request.done":
      return "FINALIZED";
    case "signature_request.declined":
    case "signer.declined":
      return "REFUSED";
    case "signature_request.expired":
      return "EXPIRED";
    default:
      return null;
  }
}

async function verifyHmac(secret: string, body: string, provided: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === provided.replace(/^sha256=/, "").toLowerCase();
}
