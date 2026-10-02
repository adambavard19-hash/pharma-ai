import type { IntegrationMode } from "./status";

/**
 * Le contrat commun des connecteurs partenaires.
 *
 * Chaque partenaire parvient à PharmaBoost par un mode : une API (quand il en
 * publie une), un lien B2B attribué, un formulaire, un e-mail, un import /
 * export de fichiers, ou une transmission manuelle par l'équipe PharmaBoost.
 * Toutes les opérations sont optionnelles : un connecteur ne déclare que ce
 * qu'il sait VRAIMENT faire. Aucune n'est simulée — une capacité absente
 * renvoie `unsupported`, jamais une réponse inventée.
 */

export const CONNECTOR_CAPABILITIES = ["CATALOG", "AVAILABILITY", "PRO_PRICE", "ORDER_CREATE", "ORDER_STATUS", "ATTRIBUTION"] as const;
export type ConnectorCapability = (typeof CONNECTOR_CAPABILITIES)[number];

export const CONNECTOR_CAPABILITY_LABELS: Record<ConnectorCapability, string> = {
  CATALOG: "Synchronisation du catalogue",
  AVAILABILITY: "Disponibilité",
  PRO_PRICE: "Prix professionnel",
  ORDER_CREATE: "Création de commande",
  ORDER_STATUS: "Statut de commande",
  ATTRIBUTION: "Identifiant d'attribution",
};

export type ConnectorResult<T> = { ok: true; data: T } | { ok: false; reason: "unsupported" | "not_configured" | "failed"; message: string };

export type ConnectorOrderLine = { name: string; ean: string | null; externalRef: string | null; quantity: number; unitPriceCents: number | null };

/** Ce qu'une commande transmet au partenaire : l'officine cliente, jamais un patient. */
export type ConnectorOrder = {
  attributionCode: string;
  pharmacy: { name: string; city: string | null; finess: string | null; email: string | null; phone: string | null };
  lines: ConnectorOrderLine[];
  totalCents: number | null;
  note: string | null;
};

export type ConnectorSubmission = {
  /** Où en est la commande après transmission. */
  status: "TRANSMITTED" | "CONFIRMED";
  partnerReference: string | null;
  /** Lien à ouvrir par l'officine pour finaliser (portail B2B, formulaire). */
  redirectUrl: string | null;
  detail: string;
};

export interface PartnerConnector {
  readonly mode: IntegrationMode;
  readonly capabilities: ConnectorCapability[];
  syncCatalog?(): Promise<ConnectorResult<{ products: number }>>;
  checkAvailability?(eans: string[]): Promise<ConnectorResult<Record<string, boolean>>>;
  proPrices?(eans: string[]): Promise<ConnectorResult<Record<string, number>>>;
  submitOrder?(order: ConnectorOrder): Promise<ConnectorResult<ConnectorSubmission>>;
  orderStatus?(partnerReference: string): Promise<ConnectorResult<{ status: string }>>;
}

/**
 * Ce que chaque mode permet AUJOURD'HUI, sans API partenaire branchée.
 * La console l'affiche tel quel : c'est la frontière entre ce qui fonctionne
 * et ce qui attend le partenaire.
 */
export const MODE_CAPABILITIES: Record<IntegrationMode, { capabilities: ConnectorCapability[]; howItWorks: string }> = {
  API: { capabilities: [], howItWorks: "En attente de l'API du partenaire : aucune donnée n'est échangée tant qu'elle n'est pas branchée." },
  B2B_LINK: { capabilities: ["ATTRIBUTION"], howItWorks: "L'officine ouvre le portail B2B du partenaire avec l'identifiant d'attribution PharmaBoost dans le lien." },
  FORM: { capabilities: ["ATTRIBUTION"], howItWorks: "L'officine ouvre le formulaire du partenaire ; l'identifiant d'attribution est à reporter dans sa demande." },
  EMAIL: { capabilities: ["ORDER_CREATE", "ATTRIBUTION"], howItWorks: "La commande est envoyée par e-mail au contact commandes du partenaire, avec l'identifiant d'attribution." },
  IMPORT_EXPORT: { capabilities: ["ORDER_CREATE", "ATTRIBUTION"], howItWorks: "La commande est enregistrée puis exportée en fichier par PharmaBoost pour le partenaire." },
  MANUAL: { capabilities: ["ORDER_CREATE", "ATTRIBUTION"], howItWorks: "La commande est enregistrée ; l'équipe PharmaBoost la transmet au partenaire et en suit le statut." },
};

/** Les modes qui permettent de passer une commande depuis PharmaBoost. */
export function modeAllowsOrder(mode: IntegrationMode): boolean {
  return MODE_CAPABILITIES[mode].capabilities.includes("ORDER_CREATE");
}
