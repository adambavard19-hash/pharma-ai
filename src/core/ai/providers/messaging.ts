import type { DeliveryOutcome, MessagingProvider, ProviderInfo } from "../ports";

/**
 * Fournisseur de messagerie NON CONNECTÉ.
 *
 * Règle stricte du produit : tant qu'aucun service d'envoi n'est configuré,
 * l'application NE PRÉTEND PAS avoir envoyé quoi que ce soit. La livraison est
 * enregistrée avec le statut `SIMULATED` et l'interface l'indique clairement au
 * pharmacien, qui reste libre d'imprimer ou de montrer le QR code.
 */
export class NotConfiguredMessagingProvider implements MessagingProvider {
  readonly info: ProviderInfo = {
    id: "none",
    label: "Aucun service d'envoi configuré",
    capability: "SIMULATED",
    description:
      "Aucun fournisseur e-mail ou SMS n'est branché. Les envois sont journalisés comme simulés : aucun message n'est réellement transmis.",
  };

  async sendDocumentLink(params: {
    to: string;
    patientName: string;
    pharmacyName: string;
    url: string;
  }): Promise<DeliveryOutcome> {
    return {
      status: "SIMULATED",
      provider: this.info.id,
      detail:
        `Aucun service d'envoi n'est configuré. Le message destiné à ${params.to} n'a PAS été transmis. ` +
        "Le lien reste accessible via le QR code ou l'impression.",
    };
  }

  async sendFollowUp(params: {
    to: string;
    subject: string;
    body: string;
  }): Promise<DeliveryOutcome> {
    return {
      status: "SIMULATED",
      provider: this.info.id,
      detail:
        `Aucun service d'envoi n'est configuré. Le suivi destiné à ${params.to} n'a PAS été transmis. ` +
        "Le rappel reste dans la liste de travail : il pourra être envoyé dès qu'un fournisseur sera branché.",
    };
  }
}
