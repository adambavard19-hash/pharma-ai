import type { DeliveryOutcome, MessagingProvider, OutgoingEmail, ProviderInfo } from "../ports";

/**
 * Les adresses qui ne peuvent JAMAIS recevoir de courrier.
 *
 * `.test`, `.invalid`, `.example` et `.localhost` sont réservés (RFC 2606 et
 * 6761) : aucun serveur ne les résout. Toute la démonstration commerciale — le
 * compte, l'équipe, les patients fictifs — y vit : même si un chemin d'envoi
 * oubliait de se méfier, le message n'aurait nulle part où aller. Et ici, il
 * n'est même pas confié au prestataire.
 */
const RESERVED_TOP_LEVEL_DOMAINS = ["test", "invalid", "example", "localhost"];

export function isReservedAddress(address: string): boolean {
  const domain = address.trim().toLowerCase().split("@").pop() ?? "";
  const topLevel = domain.split(".").pop() ?? "";
  return RESERVED_TOP_LEVEL_DOMAINS.includes(topLevel);
}

const DEMO_INFO: ProviderInfo = {
  id: "demo",
  label: "Mode démo : aucun envoi",
  capability: "SIMULATED",
  description: "Officine de démonstration : aucun e-mail n'est envoyé, jamais, quel que soit le destinataire.",
};

/**
 * La messagerie de l'officine de démonstration : elle ne transmet rien. Elle
 * répond, comme tout fournisseur non branché, `SIMULATED` — l'interface le dit
 * (« envoi simulé ») au lieu de faire croire à un envoi.
 */
export class DemoMessagingProvider implements MessagingProvider {
  readonly info = DEMO_INFO;

  async sendEmail(): Promise<DeliveryOutcome> {
    return { status: "SIMULATED", provider: DEMO_INFO.id, detail: "Mode démo : envoi simulé, aucun e-mail n'est parti." };
  }
}

/**
 * Entoure un fournisseur réel d'un garde-fou : un message adressé à une adresse
 * réservée n'est pas confié au prestataire. Il revient `SIMULATED`, avec le motif.
 */
export function guardReservedRecipients(provider: MessagingProvider): MessagingProvider {
  return {
    info: provider.info,
    async sendEmail(message: OutgoingEmail): Promise<DeliveryOutcome> {
      if (isReservedAddress(message.to)) {
        return { status: "SIMULATED", provider: DEMO_INFO.id, detail: "Adresse de démonstration : aucun e-mail n'est parti." };
      }
      return provider.sendEmail(message);
    },
  };
}
