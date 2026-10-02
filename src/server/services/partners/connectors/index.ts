import "server-only";
import { getMessagingProvider } from "@/server/ai/registry";
import { buildConnector, EmailConnector, type EmailSender, type IntegrationSettings, type OfficineConnector } from "./implementations";

/**
 * Point d'entrée des connecteurs côté serveur : le bon connecteur pour une
 * intégration, branché sur la messagerie réellement configurée. Un fournisseur
 * d'envoi non configuré répond « simulé » : la transmission est alors
 * comptée comme un échec, jamais comme un envoi.
 */

export type { OfficineConnector, IntegrationSettings, EmailSender, OrderHandling } from "./implementations";
export { AWAITING_PARTNER_API } from "./implementations";
export type { ConnectorLead } from "./messages";

const defaultSender: EmailSender = (email) => getMessagingProvider().sendEmail(email);

export function connectorFor(
  integration: IntegrationSettings,
  context: { brandName: string; fallbackOrderEmail?: string | null; send?: EmailSender },
): OfficineConnector {
  return buildConnector(integration, {
    brandName: context.brandName,
    fallbackOrderEmail: context.fallbackOrderEmail ?? null,
    send: context.send ?? defaultSender,
  });
}

/** Le connecteur E-mail vers un contact du partenaire, pour une demande de contact. */
export function contactConnectorFor(to: string, context: { brandName: string; send?: EmailSender }): EmailConnector {
  return new EmailConnector({ to, brandName: context.brandName, send: context.send ?? defaultSender });
}
