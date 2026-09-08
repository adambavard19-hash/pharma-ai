import { SignatureNotConfiguredError, type SignatureProvider, type SignatureProviderInfo } from "./ports";

/** Aucun prestataire : chaque tentative le dit, rien n'est simulé. */
export class NotConfiguredSignatureProvider implements SignatureProvider {
  readonly info: SignatureProviderInfo = {
    id: "none",
    label: "Aucun prestataire de signature",
    capability: "NONE",
    description: "Le contrat est généré et transmis par lien sécurisé ; la signature électronique n'est pas disponible tant qu'aucun prestataire n'est configuré.",
  };
  async createEnvelope(): Promise<never> {
    throw new SignatureNotConfiguredError();
  }
  async getStatus(): Promise<never> {
    throw new SignatureNotConfiguredError();
  }
  async parseWebhook(): Promise<null> {
    return null;
  }
  async downloadSigned(): Promise<null> {
    return null;
  }
}
