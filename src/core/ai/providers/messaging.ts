import type { DeliveryOutcome, MessagingProvider, OutgoingEmail, ProviderInfo } from "../ports";

/**
 * Fournisseur de messagerie NON CONNECTÉ.
 *
 * Règle stricte du produit : tant qu'aucun service d'envoi n'est configuré,
 * l'application NE PRÉTEND PAS avoir envoyé quoi que ce soit. La livraison est
 * enregistrée avec le statut `SIMULATED` et l'interface l'indique clairement au
 * pharmacien, qui reste libre d'imprimer ou de montrer le QR code.
 */
export class NotConfiguredMessagingProvider implements MessagingProvider {
  readonly info: ProviderInfo;

  /**
   * @param reason Ce qui manque exactement, quand un fournisseur a bien été
   *   demandé mais reste inutilisable. Le pharmacien doit pouvoir corriger sa
   *   configuration sans lire le code.
   */
  constructor(private readonly reason: string | null = null) {
    this.info = {
      id: "none",
      label: reason ? "Service d'envoi mal configuré" : "Aucun service d'envoi configuré",
      capability: "SIMULATED",
      description: reason
        ? `Envoi impossible : ${reason} Les envois sont journalisés comme simulés : aucun message n'est réellement transmis.`
        : "Aucun fournisseur e-mail n'est branché. Les envois sont journalisés comme simulés : aucun message n'est réellement transmis.",
    };
  }

  async sendEmail(message: OutgoingEmail): Promise<DeliveryOutcome> {
    return {
      status: "SIMULATED",
      provider: this.info.id,
      detail:
        `Aucun service d'envoi n'est configuré${this.reason ? ` (${this.reason})` : ""}. ` +
        `Le message destiné à ${message.to} n'a PAS été transmis. ` +
        "Le lien reste accessible via le QR code ou l'impression.",
    };
  }
}
