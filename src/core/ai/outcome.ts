/**
 * L'issue d'une analyse, en un mot.
 *
 * « Rien à proposer » n'est pas une information : il faut dire POURQUOI. Un
 * stock jamais importé, une référence en rupture, un conseil écarté par le
 * moteur de sécurité et une ordonnance sans besoin complémentaire sont quatre
 * situations différentes, qui appellent quatre réactions différentes du
 * pharmacien. Ces codes ne s'affichent jamais tels quels au comptoir : l'écran
 * les traduit (`OUTCOME_MESSAGES`).
 */
export const ENGINE_OUTCOMES = [
  /** Au moins une proposition est affichée. */
  "PROPOSALS",
  /** L'ordonnance ne fait apparaître aucun besoin complémentaire. */
  "NO_RELEVANT_NEED",
  /** Une proposition existe mais attend la réponse du patient à une question. */
  "NEEDS_PATIENT_INFORMATION",
  /** L'officine n'a aucune référence : le stock n'a jamais été importé. */
  "STOCK_NOT_CONFIGURED",
  /** Des besoins existent, mais aucune référence de l'officine n'y répond. */
  "NO_COMPATIBLE_PRODUCT",
  /** Des références répondraient au besoin, mais elles sont à zéro. */
  "OUT_OF_STOCK",
  /** Tout ce qui répondait au besoin a été écarté par la sécurité ou le patient. */
  "SAFETY_FILTERED",
  /** La compréhension IA n'était pas disponible : l'analyse a tourné sans elle. */
  "AI_UNAVAILABLE",
  /** L'analyse n'a pas pu être menée. */
  "ENGINE_ERROR",
] as const;

export type EngineOutcome = (typeof ENGINE_OUTCOMES)[number];

export type OutcomeSignals = {
  recommendationCount: number;
  /** Opportunités identifiées, bloquées ou non. */
  opportunityCount: number;
  /** Opportunités écartées par le moteur de sécurité avant l'appariement. */
  blockedOpportunityCount: number;
  /** L'officine possède au moins une référence (produit ou médicament). */
  stockConfigured: boolean;
  /** Candidats retenus en stock, toutes opportunités confondues. */
  inStockCandidateCount: number;
  /** Candidats qui auraient correspondu, mais à zéro en stock. */
  outOfStockCandidateCount: number;
  /** Candidats en stock écartés par la sécurité produit ou le contexte patient. */
  safetyRemovedCount: number;
  /** La compréhension IA a manqué (fournisseur absent ou appel en échec). */
  aiUnavailable: boolean;
  /** Le moteur n'a pas pu tourner (aucune ligne confirmée, erreur). */
  failed: boolean;
};

export function deriveOutcome(s: OutcomeSignals): EngineOutcome {
  if (s.failed) return "ENGINE_ERROR";
  if (s.recommendationCount > 0) return "PROPOSALS";
  if (s.opportunityCount === 0) return s.aiUnavailable ? "AI_UNAVAILABLE" : "NO_RELEVANT_NEED";
  if (s.blockedOpportunityCount >= s.opportunityCount) return "SAFETY_FILTERED";
  if (!s.stockConfigured) return "STOCK_NOT_CONFIGURED";
  if (s.inStockCandidateCount === 0 && s.outOfStockCandidateCount > 0) return "OUT_OF_STOCK";
  if (s.inStockCandidateCount > 0 && s.safetyRemovedCount >= s.inStockCandidateCount) return "SAFETY_FILTERED";
  return "NO_COMPATIBLE_PRODUCT";
}

export type OutcomeMessage = {
  title: string;
  body: string;
  /** Action proposée au pharmacien, quand il y en a une. */
  action?: "IMPORT_STOCK" | "ADD_ADVICE";
  tone: "neutral" | "warning" | "info";
};

/** Ce que lit le pharmacien. Aucun code, aucune excuse technique. */
export const OUTCOME_MESSAGES: Record<Exclude<EngineOutcome, "PROPOSALS" | "NEEDS_PATIENT_INFORMATION">, OutcomeMessage> = {
  NO_RELEVANT_NEED: {
    title: "Aucun complément pertinent identifié",
    body: "Ce traitement ne fait apparaître aucun besoin complémentaire que PharmaBoost puisse justifier. C'est une réponse valable : rien n'est proposé pour vendre.",
    action: "ADD_ADVICE",
    tone: "neutral",
  },
  STOCK_NOT_CONFIGURED: {
    title: "Votre stock n'est pas encore configuré",
    body: "PharmaBoost a identifié des besoins complémentaires pour cette ordonnance, mais ne connaît aucune référence de votre officine. Importez votre stock pour que les propositions viennent de votre rayon.",
    action: "IMPORT_STOCK",
    tone: "warning",
  },
  NO_COMPATIBLE_PRODUCT: {
    title: "Une opportunité existe, sans référence adaptée dans votre stock",
    body: "Des besoins complémentaires ont été identifiés, mais aucune référence de votre officine n'y correspond. Vous pouvez ajouter un conseil vous-même, ou compléter votre catalogue.",
    action: "ADD_ADVICE",
    tone: "info",
  },
  OUT_OF_STOCK: {
    title: "Une opportunité existe, mais les références adaptées sont en rupture",
    body: "Des produits de votre catalogue répondraient à ce traitement ; ils sont à zéro aujourd'hui. PharmaBoost ne propose jamais ce que vous ne pouvez pas remettre.",
    tone: "info",
  },
  SAFETY_FILTERED: {
    title: "Les compléments envisagés ont été écartés par sécurité",
    body: "Une règle de sécurité ou une information patient a écarté ce qui aurait pu être proposé. Le détail est dans la vérification de sécurité ci-dessus.",
    tone: "warning",
  },
  AI_UNAVAILABLE: {
    title: "Compréhension de l'ordonnance indisponible",
    body: "Le service de compréhension n'a pas répondu ; l'analyse a tourné avec les seules règles écrites. Relancez l'analyse dans quelques instants.",
    tone: "warning",
  },
  ENGINE_ERROR: {
    title: "L'analyse n'a pas pu être menée",
    body: "Aucune ligne confirmée ou une erreur interne a interrompu l'analyse. Confirmez les lignes de l'ordonnance puis relancez.",
    tone: "warning",
  },
};

export function isEngineOutcome(value: unknown): value is EngineOutcome {
  return typeof value === "string" && (ENGINE_OUTCOMES as readonly string[]).includes(value);
}
