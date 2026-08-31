import nodemailer from "nodemailer";
import type { DeliveryOutcome, MessagingProvider, OutgoingEmail, ProviderInfo } from "../ports";

/**
 * Envoi par SMTP.
 *
 * C'est la voie qui n'enferme l'officine chez personne : le serveur de son
 * fournisseur d'accès, celui de son groupement, ou n'importe quel service
 * courriel professionnel. Le transport est délégué à nodemailer plutôt
 * qu'écrit à la main — un client SMTP maison qui se trompe sur STARTTLS ou sur
 * l'encodage enverrait des données de patients en clair.
 *
 * Comme l'adaptateur Resend, celui-ci ne lève jamais : un échec revient en
 * `FAILED` avec le motif du serveur.
 */

export type SmtpConfig = {
  host: string;
  port: number;
  /** `true` pour du TLS implicite (port 465), `false` pour STARTTLS. */
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
  timeoutMs?: number;
};

/** Ce que l'adaptateur attend d'un transport — injectable pour les tests. */
export type SmtpTransport = {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ messageId?: string; rejected?: unknown[] }>;
};

export class SmtpMessagingProvider implements MessagingProvider {
  readonly info: ProviderInfo;
  private transport: SmtpTransport | null;

  constructor(
    private readonly config: SmtpConfig,
    transport?: SmtpTransport,
  ) {
    this.transport = transport ?? null;
    this.info = {
      id: "smtp",
      label: `SMTP — ${config.host}`,
      capability: "LIVE",
      description:
        `Les e-mails sont réellement transmis via ${config.host}. Chaque envoi est journalisé ` +
        "avec son statut réel : transmis, ou échec et son motif.",
    };
  }

  private getTransport(): SmtpTransport {
    if (!this.transport) {
      this.transport = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        ...(this.config.user
          ? { auth: { user: this.config.user, pass: this.config.password ?? "" } }
          : {}),
        connectionTimeout: this.config.timeoutMs ?? 10_000,
        greetingTimeout: this.config.timeoutMs ?? 10_000,
        socketTimeout: this.config.timeoutMs ?? 10_000,
      }) as unknown as SmtpTransport;
    }
    return this.transport;
  }

  async sendEmail(message: OutgoingEmail): Promise<DeliveryOutcome> {
    try {
      const result = await this.getTransport().sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      });

      // Un serveur peut accepter la connexion et rejeter le destinataire : ce
      // n'est pas un envoi réussi, et l'écran ne doit pas l'afficher comme tel.
      if (result.rejected && result.rejected.length > 0) {
        return {
          status: "FAILED",
          provider: this.info.id,
          detail: `${this.config.host} a rejeté le destinataire ${message.to}. Le message n'a pas été transmis.`,
        };
      }

      return {
        status: "SENT",
        provider: this.info.id,
        detail: `Message remis à ${this.config.host} pour ${message.to}${
          result.messageId ? ` (${result.messageId})` : ""
        }.`,
      };
    } catch (error) {
      return {
        status: "FAILED",
        provider: this.info.id,
        detail: `Envoi SMTP impossible via ${this.config.host} : ${
          error instanceof Error ? error.message : "erreur inconnue"
        }. Le message n'a pas été transmis.`,
      };
    }
  }
}
