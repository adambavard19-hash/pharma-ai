import { PDFDocument } from "pdf-lib";
import type { SignatureEnvelope, SignatureEvent, SignatureProvider, SignatureProviderInfo, SignatureSigner, SignatureStatus } from "./ports";
import type { FetchLike } from "./yousign";

/**
 * DocuSeal (API REST, serveur européen par défaut).
 *
 * Flux : une seule requête dépose le PDF (base64), place un champ de signature
 * par signataire et envoie les invitations par e-mail, dans l'ordre (la
 * pharmacie d'abord, puis PharmaBoost). Les événements arrivent ensuite par
 * webhook. DocuSeal ne signe pas ses webhooks : on lui fait envoyer un en-tête
 * secret, et sans ce secret la notification n'est qu'un signal — le statut est
 * relu par l'API avant d'être appliqué.
 */
const HOSTS = { eu: "https://api.docuseal.eu", global: "https://api.docuseal.com" } as const;

/** En-tête à déclarer dans DocuSeal (Webhooks → Secret) avec la valeur de DOCUSEAL_WEBHOOK_SECRET. */
export const DOCUSEAL_SECRET_HEADER = "x-pharmaboost-secret";

/** Les rôles des signataires chez DocuSeal ; l'ordre de signature suit celui de la liste. */
export const DOCUSEAL_ROLES: Record<SignatureSigner["role"], string> = { PHARMACY: "Pharmacie", COMPANY: "PharmaBoost" };

type DocusealSubmitter = { role?: string; status?: string; embed_src?: string; submission_id?: number };

export class DocusealSignatureProvider implements SignatureProvider {
  readonly info: SignatureProviderInfo;
  private readonly base: string;

  constructor(
    private readonly config: { apiKey: string; region: "eu" | "global"; webhookSecret?: string | null },
    private readonly fetchImpl: FetchLike = globalThis.fetch,
  ) {
    this.base = HOSTS[config.region];
    this.info = {
      id: "docuseal",
      label: `DocuSeal${config.region === "eu" ? " (UE)" : ""}`,
      capability: "LIVE",
      description: "Les contrats sont envoyés pour signature électronique via DocuSeal ; chaque événement est reçu par webhook.",
    };
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.base}${path}`, {
      ...init,
      headers: { "X-Auth-Token": this.config.apiKey, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`DocuSeal a refusé ${path} (HTTP ${response.status})${body ? ` : ${body.slice(0, 300)}` : ""}`);
    }
    return (await response.json()) as T;
  }

  async createEnvelope(input: { reference: string; title: string; pdf: Uint8Array; signers: SignatureSigner[]; expiresAt: Date }): Promise<SignatureEnvelope> {
    // DocuSeal place les champs en fractions de la page : on convertit les points PDF.
    const pages = (await PDFDocument.load(input.pdf, { updateMetadata: false })).getPages();
    const fields = input.signers.map((signer, index) => {
      const field = signer.field ?? { page: 1, x: 60 + index * 260, y: 700, width: 180, height: 60 };
      const page = pages[Math.min(field.page, pages.length) - 1];
      const { width, height } = page ? page.getSize() : { width: 595.28, height: 841.89 };
      return {
        name: `Signature ${DOCUSEAL_ROLES[signer.role]}`,
        type: "signature",
        role: DOCUSEAL_ROLES[signer.role],
        required: true,
        areas: [{ x: round(field.x / width), y: round(field.y / height), w: round(field.width / width), h: round(field.height / height), page: field.page }],
      };
    });

    const submission = await this.call<{ id: number; submitters?: DocusealSubmitter[] } | DocusealSubmitter[]>("/submissions/pdf", {
      method: "POST",
      body: JSON.stringify({
        name: `${input.title} — ${input.reference}`,
        send_email: true,
        order: "preserved",
        expire_at: input.expiresAt.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC"),
        documents: [{ name: input.reference, file: Buffer.from(input.pdf).toString("base64"), fields }],
        submitters: input.signers.map((signer) => ({
          role: DOCUSEAL_ROLES[signer.role],
          name: `${signer.firstName} ${signer.lastName}`.trim(),
          email: signer.email,
          external_id: `${input.reference}:${signer.role}`,
        })),
      }),
    });

    // Selon la version de l'API, la réponse est la demande ou la liste de ses signataires.
    const submitters = Array.isArray(submission) ? submission : submission.submitters ?? [];
    const id = Array.isArray(submission) ? submission[0]?.submission_id : submission.id;
    if (id === undefined || id === null) throw new Error("DocuSeal n'a pas renvoyé d'identifiant de demande.");
    const signingUrls: SignatureEnvelope["signingUrls"] = {};
    for (const signer of input.signers) {
      const link = submitters.find((s) => s.role === DOCUSEAL_ROLES[signer.role])?.embed_src;
      if (link) signingUrls[signer.role] = link;
    }
    return { envelopeId: String(id), signingUrls };
  }

  async getStatus(envelopeId: string): Promise<SignatureStatus> {
    const submission = await this.call<{ status?: string; submitters?: DocusealSubmitter[] }>(`/submissions/${encodeURIComponent(envelopeId)}`);
    return mapDocusealSubmission(submission.status ?? "", submission.submitters ?? []);
  }

  /**
   * Avec un secret, la notification doit porter l'en-tête secret pour faire foi
   * (`verified: true`). Sans secret, elle n'est qu'un signal (`verified: false`) :
   * le service relit le statut chez DocuSeal.
   */
  async parseWebhook(rawBody: string, headers: Record<string, string | null>): Promise<SignatureEvent | null> {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const event = payload as {
      event_type?: string;
      timestamp?: string;
      data?: { id?: number; role?: string; status?: string; decline_reason?: string | null; submission_id?: number; submission?: { id?: number; status?: string } };
    };
    if (!event.event_type || !event.data) return null;
    const isForm = event.event_type.startsWith("form.");
    const rawId = isForm ? event.data.submission?.id ?? event.data.submission_id : event.data.id;
    if (rawId === undefined || rawId === null) return null;

    const role = isForm ? roleFromDocuseal(event.data.role) : undefined;
    const status = mapDocusealEvent(event.event_type, { role, submissionStatus: isForm ? event.data.submission?.status : event.data.status });
    if (!status) return null;
    const base = { envelopeId: String(rawId), status, occurredAt: event.timestamp ? new Date(event.timestamp) : new Date(), ...(role ? { role } : {}), reason: event.data.decline_reason ?? null };

    if (this.config.webhookSecret) {
      const provided = headers[DOCUSEAL_SECRET_HEADER];
      if (!provided || !constantTimeEqual(provided, this.config.webhookSecret)) return null;
      return { ...base, verified: true };
    }
    return { ...base, verified: false };
  }

  async downloadSigned(envelopeId: string): Promise<Uint8Array | null> {
    const result = await this.call<{ documents?: { url?: string }[] }>(`/submissions/${encodeURIComponent(envelopeId)}/documents?merge=true`).catch(() => null);
    const url = result?.documents?.[0]?.url;
    if (!url) return null;
    const response = await this.fetchImpl(url);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  }
}

function roleFromDocuseal(role?: string): SignatureSigner["role"] | undefined {
  if (role === DOCUSEAL_ROLES.PHARMACY) return "PHARMACY";
  if (role === DOCUSEAL_ROLES.COMPANY) return "COMPANY";
  return undefined;
}

/** L'état d'une demande : son statut global, puis celui de ses signataires tant qu'elle est en cours. */
export function mapDocusealSubmission(status: string, submitters: DocusealSubmitter[]): SignatureStatus {
  switch (status) {
    case "completed":
      return "FINALIZED";
    case "declined":
      return "REFUSED";
    case "expired":
      return "EXPIRED";
  }
  const byRole = (role: SignatureSigner["role"]) => submitters.find((s) => s.role === DOCUSEAL_ROLES[role])?.status;
  if (byRole("PHARMACY") === "completed") return "SIGNED_PHARMACY";
  if (byRole("COMPANY") === "completed") return "SIGNED_COMPANY";
  if (submitters.some((s) => s.status === "opened")) return "OPENED";
  return "SENT";
}

export function mapDocusealEvent(eventType: string, context: { role?: SignatureSigner["role"]; submissionStatus?: string } = {}): SignatureStatus | null {
  switch (eventType) {
    case "form.viewed":
    case "form.started":
      return "OPENED";
    case "form.completed":
      if (context.submissionStatus === "completed") return "FINALIZED";
      return context.role === "COMPANY" ? "SIGNED_COMPANY" : "SIGNED_PHARMACY";
    case "form.declined":
      return "REFUSED";
    case "submission.completed":
      return "FINALIZED";
    case "submission.expired":
      return "EXPIRED";
    default:
      return null;
  }
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
