/**
 * La signature électronique, vue du domaine.
 *
 * Le contrat est produit par PharmaBoost ; un prestataire (Yousign, DocuSign,
 * Universign…) recueille les signatures et nous notifie. Cette interface est
 * tout ce que le reste du code connaît. Aucune implémentation ne « simule »
 * une signature : sans prestataire configuré, l'envoi pour signature
 * électronique est refusé et le dit.
 */
export type SignatureSigner = {
  role: "PHARMACY" | "COMPANY";
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
};

export type SignatureEnvelope = {
  /** Identifiant chez le prestataire. */
  envelopeId: string;
  /** Liens de signature par rôle, quand le prestataire les fournit. */
  signingUrls: Partial<Record<SignatureSigner["role"], string>>;
};

export type SignatureStatus = "SENT" | "OPENED" | "SIGNED_PHARMACY" | "SIGNED_COMPANY" | "FINALIZED" | "REFUSED" | "EXPIRED";

export type SignatureEvent = {
  envelopeId: string;
  status: SignatureStatus;
  occurredAt: Date;
  /** Rôle concerné par l'événement, si le prestataire le précise. */
  role?: SignatureSigner["role"];
  reason?: string | null;
};

export type SignatureProviderInfo = {
  id: string;
  label: string;
  /** LIVE : envoie réellement · NONE : aucun prestataire. */
  capability: "LIVE" | "NONE";
  description: string;
};

export interface SignatureProvider {
  readonly info: SignatureProviderInfo;
  /** Dépose le PDF et crée la demande de signature. Lève une erreur explicite en cas d'échec. */
  createEnvelope(input: { reference: string; title: string; pdf: Uint8Array; signers: SignatureSigner[]; expiresAt: Date }): Promise<SignatureEnvelope>;
  /** Lit l'état courant chez le prestataire. */
  getStatus(envelopeId: string): Promise<SignatureStatus>;
  /** Traduit une notification (webhook) du prestataire ; `null` si elle ne nous concerne pas. */
  parseWebhook(payload: unknown, headers: Record<string, string | null>): Promise<SignatureEvent | null>;
  /** Le PDF signé, quand le prestataire le fournit. */
  downloadSigned(envelopeId: string): Promise<Uint8Array | null>;
}

export class SignatureNotConfiguredError extends Error {
  constructor() {
    super(
      "Aucun prestataire de signature électronique n'est configuré (SIGNATURE_PROVIDER). Le contrat peut être transmis au titulaire par lien sécurisé ; sa signature électronique attend la configuration d'un prestataire.",
    );
    this.name = "SignatureNotConfiguredError";
  }
}
