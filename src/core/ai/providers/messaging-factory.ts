import { NotConfiguredMessagingProvider } from "./messaging";
import { ResendMessagingProvider } from "./messaging-resend";
import { SmtpMessagingProvider } from "./messaging-smtp";
import type { MessagingProvider } from "../ports";

/**
 * Choix du transporteur d'e-mails, à partir de la seule configuration.
 *
 * Fonction pure, testable sans base ni réseau : c'est ici que se joue la
 * garantie la plus importante du lot. Un fournisseur demandé mais incomplet ne
 * devient JAMAIS un envoi silencieux — on retombe sur le fournisseur non
 * configuré, qui s'annonce comme tel et nomme précisément ce qui manque. Mieux
 * vaut un « non envoyé » lisible qu'un « envoyé » qui ment.
 */

export type MessagingConfig = {
  provider: "none" | "resend" | "smtp";
  from?: string;
  resendApiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPassword?: string;
};

function manquant(entries: [string, unknown][]): string[] {
  return entries.filter(([, value]) => !value).map(([name]) => name);
}

function refus(provider: string, missing: string[]): NotConfiguredMessagingProvider {
  const liste = missing.join(" et ");
  return new NotConfiguredMessagingProvider(
    `le fournisseur « ${provider} » est demandé mais ${liste} ${
      missing.length > 1 ? "sont absents" : "est absent"
    } de la configuration.`,
  );
}

export function chooseMessagingProvider(config: MessagingConfig): MessagingProvider {
  switch (config.provider) {
    case "resend": {
      const missing = manquant([
        ["RESEND_API_KEY", config.resendApiKey],
        ["EMAIL_FROM", config.from],
      ]);
      if (missing.length > 0) return refus("resend", missing);
      return new ResendMessagingProvider({
        apiKey: config.resendApiKey as string,
        from: config.from as string,
      });
    }

    case "smtp": {
      const missing = manquant([
        ["SMTP_HOST", config.smtpHost],
        ["EMAIL_FROM", config.from],
      ]);
      if (missing.length > 0) return refus("smtp", missing);
      return new SmtpMessagingProvider({
        host: config.smtpHost as string,
        // 587 (STARTTLS) est le port courant et reste chiffré : c'est le défaut
        // le plus sûr quand l'officine n'a rien précisé.
        port: config.smtpPort ?? 587,
        secure: config.smtpSecure ?? false,
        user: config.smtpUser ?? null,
        password: config.smtpPassword ?? null,
        from: config.from as string,
      });
    }

    default:
      return new NotConfiguredMessagingProvider();
  }
}
