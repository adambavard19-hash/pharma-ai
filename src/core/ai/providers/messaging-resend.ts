import type { DeliveryOutcome, MessagingProvider, OutgoingEmail, ProviderInfo } from "../ports";

/**
 * Envoi par Resend (HTTPS).
 *
 * Aucune dépendance : l'API tient en une requête POST. La clé ne quitte jamais
 * ce module côté serveur et n'apparaît dans aucun journal — les messages
 * d'erreur renvoyés au pharmacien reprennent le motif du prestataire, jamais
 * l'en-tête d'autorisation.
 *
 * Cet adaptateur ne lève jamais. Une panne réseau, un quota dépassé ou une
 * clé révoquée reviennent en `FAILED` avec le motif réel : au comptoir, un
 * envoi qui échoue doit se voir, pas interrompre la délivrance.
 */

const ENDPOINT = "https://api.resend.com/emails";

/** Injectable pour les tests : aucun test n'appelle le réseau. */
export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export class ResendMessagingProvider implements MessagingProvider {
  readonly info: ProviderInfo = {
    id: "resend",
    label: "Resend",
    capability: "LIVE",
    description:
      "Les e-mails sont réellement transmis via Resend. Chaque envoi est journalisé avec son statut réel : transmis, ou échec et son motif.",
  };

  constructor(
    private readonly config: {
      apiKey: string;
      from: string;
      /** Délai au-delà duquel on renonce plutôt que de bloquer le comptoir. */
      timeoutMs?: number;
    },
    private readonly fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
  ) {}

  async sendEmail(message: OutgoingEmail): Promise<DeliveryOutcome> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10_000);

    try {
      const response = await this.fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        return {
          status: "SENT",
          provider: this.info.id,
          detail: `Message transmis à Resend pour ${message.to}.`,
        };
      }

      // Le corps de la réponse porte le motif exact (adresse invalide, domaine
      // non vérifié, quota). On le conserve tel quel : c'est ce qui permet au
      // pharmacien de corriger sans nous appeler.
      const body = await response.text().catch(() => "");
      return {
        status: "FAILED",
        provider: this.info.id,
        detail: `Resend a refusé l'envoi (HTTP ${response.status})${body ? ` : ${truncate(body)}` : "."}`,
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return {
        status: "FAILED",
        provider: this.info.id,
        detail: aborted
          ? "Resend n'a pas répondu dans le délai imparti. Le message n'a pas été transmis."
          : `Contact impossible avec Resend : ${error instanceof Error ? error.message : "erreur inconnue"}. Le message n'a pas été transmis.`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function truncate(value: string, max = 300): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
