import { b2bLinkFor } from "@/core/partners/attribution";
import {
  MODE_CAPABILITIES,
  type ConnectorCapability,
  type ConnectorOrder,
  type ConnectorResult,
  type ConnectorSubmission,
  type PartnerConnector,
} from "@/core/partners/connector";
import type { IntegrationMode } from "@/core/partners/status";
import { composeLeadEmail, composeOrderEmail, type ConnectorLead } from "./messages";

/**
 * Les connecteurs partenaires, un par mode d'intégration.
 *
 * Chacun ne fait que ce qu'il sait VRAIMENT faire aujourd'hui :
 *  - E-mail : envoie la commande (ou la demande de contact) au partenaire par
 *    la messagerie configurée — « transmise » seulement si l'envoi a abouti ;
 *  - Manuel, Import / export : rien ne part d'ici, la commande est enregistrée
 *    et l'équipe PharmaBoost la transmet ;
 *  - Lien B2B, Formulaire : un lien à ouvrir, avec l'identifiant d'attribution ;
 *  - API : en attente de l'API du partenaire. Toutes ses méthodes répondent
 *    `unsupported` : aucune donnée n'est inventée, aucune réponse simulée.
 *
 * Pur : l'envoi d'e-mail est injecté (`EmailSender`), ce qui permet de tester
 * la composition et les statuts sans rien envoyer.
 */

/** Ce dont un connecteur a besoin pour envoyer un e-mail : la forme de `MessagingProvider.sendEmail`. */
export type EmailSender = (email: { to: string; fromName?: string; subject: string; text: string }) => Promise<{
  status: "SIMULATED" | "SENT" | "FAILED";
  detail: string;
}>;

/**
 * Qui fait parvenir une commande enregistrée au partenaire :
 *  - CONNECTOR : le connecteur lui-même (`submitOrder`) ;
 *  - PHARMABOOST_TEAM : l'équipe PharmaBoost, la commande reste « enregistrée » ;
 *  - REDIRECT : l'officine, sur le portail ou le formulaire du partenaire ;
 *  - NONE : personne, la commande directe n'est pas possible.
 */
export type OrderHandling = "CONNECTOR" | "PHARMABOOST_TEAM" | "REDIRECT" | "NONE";

export interface OfficineConnector extends PartnerConnector {
  readonly orderHandling: OrderHandling;
  /** Le lien à ouvrir (portail B2B, formulaire) avec l'identifiant d'attribution ; null sans lien https valide. */
  redirectUrl?(attributionCode: string): string | null;
  /** Transmet une demande de contact de l'officine. */
  submitLead?(lead: ConnectorLead): Promise<ConnectorResult<{ detail: string }>>;
}

export const AWAITING_PARTNER_API = "En attente de l'API du partenaire";

const SENDER_NAME = "PharmaBoost Partenaires";

function capabilitiesOf(mode: IntegrationMode): ConnectorCapability[] {
  return [...MODE_CAPABILITIES[mode].capabilities];
}

async function deliver(send: EmailSender, email: { to: string; subject: string; text: string }): Promise<{ sent: boolean; detail: string }> {
  try {
    const outcome = await send({ ...email, fromName: SENDER_NAME });
    return { sent: outcome.status === "SENT", detail: outcome.detail };
  } catch (error) {
    // Le contrat de la messagerie est de ne jamais lever ; si cela arrive, l'échec est dit tel quel.
    return { sent: false, detail: error instanceof Error ? error.message : "Envoi impossible." };
  }
}

/** E-mail : la seule transmission réelle disponible sans API partenaire. */
export class EmailConnector implements OfficineConnector {
  readonly mode = "EMAIL" as const;
  readonly capabilities = capabilitiesOf("EMAIL");
  readonly orderHandling = "CONNECTOR" as const;

  constructor(private readonly options: { to: string | null; brandName: string; send: EmailSender }) {}

  private get recipient(): string | null {
    const to = this.options.to?.trim();
    return to ? to : null;
  }

  async submitOrder(order: ConnectorOrder): Promise<ConnectorResult<ConnectorSubmission>> {
    const to = this.recipient;
    if (!to) return { ok: false, reason: "not_configured", message: "Aucune adresse de commande n'est renseignée pour ce partenaire." };
    const email = composeOrderEmail(order, { brandName: this.options.brandName });
    const outcome = await deliver(this.options.send, { to, ...email });
    if (!outcome.sent) return { ok: false, reason: "failed", message: outcome.detail };
    return { ok: true, data: { status: "TRANSMITTED", partnerReference: null, redirectUrl: null, detail: `Envoyée par e-mail à ${to}.` } };
  }

  async submitLead(lead: ConnectorLead): Promise<ConnectorResult<{ detail: string }>> {
    const to = this.recipient;
    if (!to) return { ok: false, reason: "not_configured", message: "Aucune adresse de contact n'est renseignée pour ce partenaire." };
    const email = composeLeadEmail(lead);
    const outcome = await deliver(this.options.send, { to, ...email });
    if (!outcome.sent) return { ok: false, reason: "failed", message: outcome.detail };
    return { ok: true, data: { detail: `Envoyée par e-mail à ${to}.` } };
  }
}

/** Manuel : la commande est enregistrée ; l'équipe PharmaBoost la transmet et en suit le statut. */
export class ManualConnector implements OfficineConnector {
  readonly mode = "MANUAL" as const;
  readonly capabilities = capabilitiesOf("MANUAL");
  readonly orderHandling = "PHARMABOOST_TEAM" as const;
}

/** Import / export : la commande est enregistrée puis exportée en fichier par PharmaBoost. */
export class ImportExportConnector implements OfficineConnector {
  readonly mode = "IMPORT_EXPORT" as const;
  readonly capabilities = capabilitiesOf("IMPORT_EXPORT");
  readonly orderHandling = "PHARMABOOST_TEAM" as const;
}

/** Lien B2B attribué : le portail du partenaire, l'identifiant d'attribution dans le lien. */
export class B2bLinkConnector implements OfficineConnector {
  readonly mode = "B2B_LINK" as const;
  readonly capabilities = capabilitiesOf("B2B_LINK");
  readonly orderHandling = "REDIRECT" as const;

  constructor(private readonly template: string | null) {}

  redirectUrl(attributionCode: string): string | null {
    const template = this.template?.trim();
    return template ? b2bLinkFor(template, attributionCode) : null;
  }
}

/**
 * Formulaire : le formulaire du partenaire, l'identifiant d'attribution à
 * reporter. Un modèle qui contient `{code}` le reçoit ; sinon le lien est
 * ouvert tel quel. Https seulement.
 */
export class FormConnector implements OfficineConnector {
  readonly mode = "FORM" as const;
  readonly capabilities = capabilitiesOf("FORM");
  readonly orderHandling = "REDIRECT" as const;

  constructor(private readonly formUrl: string | null) {}

  redirectUrl(attributionCode: string): string | null {
    const raw = this.formUrl?.trim();
    if (!raw) return null;
    if (raw.includes("{code}")) return b2bLinkFor(raw, attributionCode);
    try {
      const url = new URL(raw);
      return url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  }
}

/** API : rien n'est branché tant que le partenaire n'a pas publié son API. Aucune réponse inventée. */
export class ApiConnector implements OfficineConnector {
  readonly mode = "API" as const;
  readonly capabilities = capabilitiesOf("API");
  readonly orderHandling = "NONE" as const;

  private unsupported<T>(): Promise<ConnectorResult<T>> {
    return Promise.resolve({ ok: false, reason: "unsupported", message: AWAITING_PARTNER_API });
  }

  syncCatalog() {
    return this.unsupported<{ products: number }>();
  }

  checkAvailability() {
    return this.unsupported<Record<string, boolean>>();
  }

  proPrices() {
    return this.unsupported<Record<string, number>>();
  }

  submitOrder() {
    return this.unsupported<ConnectorSubmission>();
  }

  orderStatus() {
    return this.unsupported<{ status: string }>();
  }

  submitLead() {
    return this.unsupported<{ detail: string }>();
  }
}

export type IntegrationSettings = {
  mode: IntegrationMode;
  b2bUrlTemplate: string | null;
  formUrl: string | null;
  orderEmail: string | null;
};

/**
 * Le connecteur d'une intégration. `fallbackOrderEmail` : le contact du
 * partenaire qui reçoit les commandes, quand l'intégration n'a pas d'adresse.
 */
export function buildConnector(
  integration: IntegrationSettings,
  context: { brandName: string; fallbackOrderEmail: string | null; send: EmailSender },
): OfficineConnector {
  switch (integration.mode) {
    case "EMAIL":
      return new EmailConnector({ to: integration.orderEmail?.trim() || context.fallbackOrderEmail, brandName: context.brandName, send: context.send });
    case "MANUAL":
      return new ManualConnector();
    case "IMPORT_EXPORT":
      return new ImportExportConnector();
    case "B2B_LINK":
      return new B2bLinkConnector(integration.b2bUrlTemplate);
    case "FORM":
      return new FormConnector(integration.formUrl);
    case "API":
      return new ApiConnector();
  }
}
