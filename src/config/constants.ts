/**
 * Constantes partagées client / serveur.
 * Ce module ne doit contenir aucune valeur secrète.
 */

export const APP_NAME = "PharmaBoost";
export const APP_TAGLINE = "Le copilote intelligent de l'officine";

/**
 * Version du moteur métier, enregistrée sur chaque analyse.
 * À incrémenter dès qu'une règle de recommandation change, afin de pouvoir
 * relire a posteriori une décision prise par une version antérieure.
 *
 * 1.0.0 — le moteur du MVP (plafond de cinq conseils).
 * 1.1.0 — lot « conseil complet par ordonnance » : cinq règles de plus, plafond
 *         de huit conseils avec une place gardée à chaque famille de produit, une
 *         même référence jamais proposée deux fois, la durée de l'ordonnance lue
 *         par les règles qui en dépendent.
 */
export const ENGINE_VERSION = "1.1.0";

/** Durée de vie d'une session authentifiée. */
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 12; // 12 h
export const SESSION_COOKIE_NAME = "pharma_session";
export const PLATFORM_SESSION_COOKIE_NAME = "pharma_platform_session";
export const SALES_SESSION_COOKIE_NAME = "pharma_sales_session";
export const DIRECTOR_SESSION_COOKIE_NAME = "pharma_director_session";

/** Durée de validité du lien sécurisé de la fiche patient. */
export const DOCUMENT_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 jours

/**
 * Seuil de confiance en dessous duquel un champ extrait d'une ordonnance
 * DOIT être vérifié par un humain avant toute exploitation.
 */
export const OCR_REVIEW_THRESHOLD = 0.85;

/**
 * Score minimal pour qu'une recommandation soit proposée au pharmacien.
 *
 * Volontairement exigeant. Trois propositions sont un plafond, pas un objectif :
 * mieux vaut une seule proposition que le pharmacien juge juste que trois dont
 * il doit écarter deux. Une place laissée vide vaut mieux qu'une place remplie
 * — c'est ce qui rend les propositions crédibles au comptoir.
 */
export const RECOMMENDATION_MIN_SCORE = 0.5;

/**
 * Pertinence minimale exigée d'une proposition.
 *
 * Le score total ne suffit pas : un produit inoffensif et bien noté en sécurité
 * atteint 75 % sans correspondre à quoi que ce soit. Mesuré sur le catalogue de
 * démonstration — « Pastilles gorge miel-citron » proposées pour un confort
 * gastrique, uniquement parce que leur CATÉGORIE correspondait, sans une seule
 * étiquette commune.
 *
 * Ce seuil exige donc une correspondance réelle, pas une parenté de rayon. Il
 * vaut mieux ne rien proposer.
 */
export const RECOMMENDATION_MIN_RELEVANCE = 0.6;

/**
 * Nombre maximal de conseils proposés pour une ordonnance.
 *
 * Huit au plus retenus par le moteur, tous affichés. Une ordonnance de
 * plusieurs médicaments appelle plusieurs conseils, et de familles différentes
 * (un médicament conseil, un complément alimentaire, un produit de
 * parapharmacie) : à cinq, le deuxième ou le troisième médicament perdait ses
 * conseils au profit du premier. L'écran range chaque conseil sous le
 * médicament qui l'a déclenché, si bien que le pharmacien les lit médicament
 * par médicament et non en une pile : huit se lisent. Une routine compte pour
 * un seul conseil.
 *
 * C'est un plafond, pas un objectif : jamais un produit « pour faire nombre ».
 * Quand il y a plus de besoins que de places, la sélection garde une place à
 * chaque famille de produit présente (src/core/ai/portfolio.ts), sans jamais
 * déplacer un conseil de sécurité.
 */
export const MAX_RECOMMENDATIONS_PER_PRESCRIPTION = 8;

/**
 * Une vente de la douchette : trois conseils au plus, ceux que le pharmacien voit dans la fenêtre du poste. Les chiffres du classement
 * de l'équipe (« proposés ») comptent ce qui lui a été montré, pas des conseils gardés en réserve qu'il n'a jamais lus.
 */
export const MAX_RECOMMENDATIONS_COUNTER_SCAN = 3;

/**
 * Nombre maximal d'autres références montrées sous un conseil retenu.
 *
 * Un plafond d'affichage, pas une promesse : deux ou trois alternatives quand
 * le rayon les contient, moins sinon — jamais une référence hors besoin pour
 * remplir la liste. Au-delà de trois, le pharmacien ne compare plus, il
 * survole.
 */
export const MAX_ALTERNATIVES_PER_ADVICE = 3;

export const CURRENCY = "EUR";
export const LOCALE = "fr-FR";
/**
 * Les officines sont en France : toute heure affichée ou envoyée est celle de
 * Paris, que le rendu ait lieu sur le serveur (UTC chez l'hébergeur) ou dans
 * le navigateur — sinon les deux divergent et React refait la page au chargement.
 */
export const TIME_ZONE = "Europe/Paris";
