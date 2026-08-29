/**
 * Constantes partagées client / serveur.
 * Ce module ne doit contenir aucune valeur secrète.
 */

export const APP_NAME = "Pharma.ai";
export const APP_TAGLINE = "Le copilote intelligent de l'officine";

/**
 * Version du moteur métier, enregistrée sur chaque analyse.
 * À incrémenter dès qu'une règle de recommandation change, afin de pouvoir
 * relire a posteriori une décision prise par une version antérieure.
 */
export const ENGINE_VERSION = "1.0.0";

/** Durée de vie d'une session authentifiée. */
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 12; // 12 h
export const SESSION_COOKIE_NAME = "pharma_session";
export const PLATFORM_SESSION_COOKIE_NAME = "pharma_platform_session";

/** Durée de validité du lien sécurisé de la fiche patient. */
export const DOCUMENT_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 jours

/**
 * Seuil de confiance en dessous duquel un champ extrait d'une ordonnance
 * DOIT être vérifié par un humain avant toute exploitation.
 */
export const OCR_REVIEW_THRESHOLD = 0.85;

/** Score minimal pour qu'une recommandation soit proposée au pharmacien. */
export const RECOMMENDATION_MIN_SCORE = 0.35;

/**
 * Nombre maximal de recommandations proposées pour une ordonnance.
 *
 * Trois, et pas davantage : au comptoir, le pharmacien dispose de quelques
 * secondes. Au-delà de trois propositions il ne choisit plus, il survole — et
 * une liste survolée ne produit ni bon conseil ni vente pertinente.
 */
export const MAX_RECOMMENDATIONS_PER_PRESCRIPTION = 3;

export const CURRENCY = "EUR";
export const LOCALE = "fr-FR";
